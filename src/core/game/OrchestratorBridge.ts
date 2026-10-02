import type { EngineEvent, EngineStateChanged } from '../EngineCore.ts';
import { EventBus } from '../EventBus.ts';
import type { GameState } from '../ConquerOrchestrator.ts';
import { EngineOrchestrator } from '../EngineOrchestrator.ts';
import { createPlayerIntentAction, type PlayerIntent } from './PlayerIntent.ts';

export interface PartyMember {
  id: string;
  name: string;
  archetype: string;
  level: number;
  health: number;
  maxHealth: number;
  equipment: string[];
  inventory: string[];
  statuses: string[];
  lastIntent: PlayerIntent | null;
}

export interface FallOfZionState extends GameState {
  partyState: GameState['partyState'] & { members: PartyMember[] };
}

export type PartyChoice =
  | { type: 'attack'; actorId: string; targetId: string }
  | { type: 'guard'; actorId: string }
  | { type: 'damage'; actorId: string; amount: number }
  | { type: 'heal'; actorId: string; amount: number }
  | { type: 'collect-loot'; actorId: string; itemId: string }
  | { type: 'advance'; actorId: string };

export type RendererBridgeEvent =
  | { kind: 'state'; change: EngineStateChanged<GameState> }
  | { kind: 'event'; event: EngineEvent; revision: number };

interface PartySyncEnvelope {
  protocol: 'fall-of-zion-party-v1';
  actionId: string;
  originEngineId: string;
  actorId: string;
  timestamp: number;
  kind: 'intent' | 'choice';
  payload: PlayerIntent | PartyChoice;
  narrative: string;
}

function isPartySyncEnvelope(value: unknown): value is PartySyncEnvelope {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<PartySyncEnvelope>;
  return message.protocol === 'fall-of-zion-party-v1'
    && typeof message.actionId === 'string'
    && typeof message.originEngineId === 'string'
    && typeof message.actorId === 'string'
    && Number.isFinite(message.timestamp)
    && (message.kind === 'intent' || message.kind === 'choice')
    && typeof message.narrative === 'string';
}

export class OrchestratorBridge {
  private readonly engine: EngineOrchestrator<GameState>;
  private readonly bridgeId = globalThis.crypto?.randomUUID?.()
    ?? `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  private actionSequence = 0;
  private seenActionIds = new Set<string>();
  private localChannels = new Set<BroadcastChannel>();
  private peerChannels = new Map<RTCDataChannel, (event: MessageEvent) => void>();

  constructor(engine: EngineOrchestrator<GameState>) {
    this.engine = engine;
  }

  getGameState(): FallOfZionState {
    return this.engine.getState() as FallOfZionState;
  }

  initializeParty(members: PartyMember[]): FallOfZionState {
    if (members.length === 0) throw new Error('Party requires at least one member.');
    const ids = new Set<string>();
    for (const member of members) {
      if (!member.id.trim() || ids.has(member.id)) throw new Error(`Invalid or duplicate party member id: ${member.id}`);
      if (!Number.isFinite(member.health) || !Number.isFinite(member.maxHealth)
        || member.health < 0 || member.maxHealth <= 0 || member.health > member.maxHealth) {
        throw new Error(`Invalid health for party member: ${member.id}`);
      }
      ids.add(member.id);
    }
    const initialMembers = structuredClone(members);
    this.engine.applyMutation({
      type: 'party.initialize',
      apply: (draft) => {
        const state = draft as FallOfZionState;
        state.partyState.members = initialMembers;
        state.partyState.playerIds = initialMembers.map((member) => member.id);
        state.playerState.health = initialMembers[0].health;
        state.playerState.maxHealth = initialMembers[0].maxHealth;
      },
    });
    return this.getGameState();
  }

  dispatchIntent(intent: PlayerIntent): GameState {
    return this.dispatchPartyIntent(intent, this.getGameState().partyState.playerIds[0]);
  }

  dispatchPartyIntent(intent: PlayerIntent, actorId: string): FallOfZionState {
    this.applyIntent(actorId, intent);
    const envelope = this.createEnvelope('intent', actorId, intent, `${actorId} acts: ${intent.type}.`);
    this.publishAction(envelope);
    return this.getGameState();
  }

  dispatchChoice(choice: PartyChoice, narrative: string): FallOfZionState {
    const envelope = this.createEnvelope('choice', choice.actorId, choice, narrative);
    this.applyChoice(choice, envelope.actionId);
    this.publishAction(envelope);
    return this.getGameState();
  }

  subscribeRenderer(listener: (event: RendererBridgeEvent) => void): () => void {
    const unsubscribeState = EventBus.on<EngineStateChanged<GameState>>(
      'engine:state:changed:*',
      (change) => {
        if (change.engineId === this.engine.engineId) listener({ kind: 'state', change });
      },
    );
    const unsubscribeEvents = EventBus.on<{
      engineId: string;
      event: EngineEvent;
      revision: number;
    }>('engine:event', (message) => {
      if (message.engineId === this.engine.engineId) {
        this.handleHaptics(message.event);
        listener({ kind: 'event', event: message.event, revision: message.revision });
      }
    });
    return () => {
      unsubscribeState();
      unsubscribeEvents();
    };
  }

  connectLocalParty(channelName: string): () => void {
    if (typeof BroadcastChannel === 'undefined') return () => undefined;
    const channel = new BroadcastChannel(channelName);
    const onMessage = (message: MessageEvent<unknown>) => this.receiveAction(message.data);
    channel.addEventListener('message', onMessage);
    this.localChannels.add(channel);
    this.updateCooperativeMode(true);
    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
      this.localChannels.delete(channel);
      this.updateCooperativeMode(this.localChannels.size > 0 || this.peerChannels.size > 0);
    };
  }

  connectPeer(channel: RTCDataChannel): () => void {
    const onMessage = (message: MessageEvent) => {
      if (typeof message.data !== 'string') return;
      try {
        this.receiveAction(JSON.parse(message.data) as unknown);
      } catch {
        this.engine.emit('party:sync:error', { reason: 'invalid-message' });
      }
    };
    channel.addEventListener('message', onMessage);
    this.peerChannels.set(channel, onMessage);
    this.updateCooperativeMode(true);
    return () => {
      channel.removeEventListener('message', onMessage);
      this.peerChannels.delete(channel);
      this.updateCooperativeMode(this.localChannels.size > 0 || this.peerChannels.size > 0);
    };
  }

  closePartyConnections(): void {
    for (const channel of this.localChannels) channel.close();
    this.localChannels.clear();
    for (const [channel, listener] of this.peerChannels) channel.removeEventListener('message', listener);
    this.peerChannels.clear();
    this.updateCooperativeMode(false);
  }

  private updateCooperativeMode(active: boolean): void {
    const state = this.getGameState();
    if (state.partyState.cooperative === active) return;
    this.engine.applyMutation({
      type: 'party.cooperative-mode',
      apply: (draft) => {
        draft.partyState.cooperative = active;
      },
    });
    this.engine.time.setCooperativeCombat(active);
  }

  private applyIntent(actorId: string, intent: PlayerIntent): void {
    const member = this.requireMember(actorId);
    const action = createPlayerIntentAction(intent);
    this.engine.applyMutation({
      type: action.type,
      apply: (draft) => {
        action.apply(draft);
        const state = draft as FallOfZionState;
        const partyMember = state.partyState.members.find((candidate) => candidate.id === actorId);
        if (partyMember) partyMember.lastIntent = structuredClone(intent);
        if (intent.type === 'combat' || intent.type === 'skill') {
          state.combatState.active = true;
          state.combatState.encounterId ??= 'zion-corridor-warden';
        }
      },
    });
    if (!member) throw new Error(`Unknown party member: ${actorId}`);
  }

  private applyChoice(choice: PartyChoice, actionId: string): void {
    const member = this.requireMember(choice.actorId);
    this.engine.applyMutation({
      type: `party.choice.${choice.type}`,
      apply: (draft) => {
        const state = draft as FallOfZionState;
        const actor = state.partyState.members.find((candidate) => candidate.id === choice.actorId);
        if (!actor) throw new Error(`Unknown party member: ${choice.actorId}`);
        switch (choice.type) {
          case 'attack':
            if (!choice.targetId.trim()) throw new Error('Attack requires a target.');
            state.combatState.active = true;
            state.combatState.encounterId = choice.targetId;
            state.arsState.combatActions += 1;
            break;
          case 'guard':
            if (!actor.statuses.includes('guarding')) actor.statuses.push('guarding');
            break;
          case 'damage':
            if (!Number.isFinite(choice.amount) || choice.amount <= 0) throw new Error('Damage amount must be positive.');
            this.adjustMemberHealth(state, actor, -choice.amount);
            break;
          case 'heal':
            if (!Number.isFinite(choice.amount) || choice.amount <= 0) throw new Error('Heal amount must be positive.');
            this.adjustMemberHealth(state, actor, choice.amount);
            break;
          case 'collect-loot':
            if (!choice.itemId.trim()) throw new Error('Loot item id must not be empty.');
            if (!actor.inventory.includes(choice.itemId)) actor.inventory.push(choice.itemId);
            state.lootState.push({
              id: `${actionId}-loot`,
              itemId: choice.itemId,
              floor: state.dungeonState.currentFloor,
            });
            break;
          case 'advance':
            if (state.dungeonState.currentFloor < 15) state.dungeonState.currentFloor += 1;
            state.worldState.location = 'DUNGEON';
            state.worldState.block = Math.floor((state.dungeonState.currentFloor - 1) / 3) + 1;
            break;
        }
      },
    });
    if (!member) throw new Error(`Unknown party member: ${choice.actorId}`);
  }

  private adjustMemberHealth(state: FallOfZionState, member: PartyMember, amount: number): void {
    if (!Number.isFinite(amount) || amount === 0) throw new Error('Health delta must be finite and non-zero.');
    member.health = Math.max(0, Math.min(member.maxHealth, member.health + amount));
    if (member.id === state.partyState.playerIds[0]) state.playerState.health = member.health;
  }

  private requireMember(memberId: string): PartyMember {
    const member = this.getGameState().partyState.members?.find((candidate) => candidate.id === memberId);
    if (!member) throw new Error(`Unknown party member: ${memberId}`);
    return member;
  }

  private createEnvelope(
    kind: PartySyncEnvelope['kind'],
    actorId: string,
    payload: PlayerIntent | PartyChoice,
    narrative: string,
  ): PartySyncEnvelope {
    return {
      protocol: 'fall-of-zion-party-v1',
      actionId: `${this.bridgeId}:${++this.actionSequence}`,
      originEngineId: this.bridgeId,
      actorId,
      timestamp: this.engine.time.getSimulationTime(),
      kind,
      payload: structuredClone(payload),
      narrative,
    };
  }

  private publishAction(envelope: PartySyncEnvelope): void {
    this.rememberAction(envelope.actionId);
    this.engine.emit('party:action', envelope);
    for (const channel of this.localChannels) channel.postMessage(envelope);
    const message = JSON.stringify(envelope);
    for (const channel of this.peerChannels.keys()) {
      if (channel.readyState === 'open') channel.send(message);
    }
  }

  private receiveAction(value: unknown): void {
    if (!isPartySyncEnvelope(value)
      || value.originEngineId === this.bridgeId
      || this.seenActionIds.has(value.actionId)) return;
    try {
      if (value.kind === 'intent') this.applyIntent(value.actorId, value.payload as PlayerIntent);
      else this.applyChoice(value.payload as PartyChoice, value.actionId);
      this.rememberAction(value.actionId);
      this.engine.emit('party:action:received', value);
    } catch {
      this.engine.emit('party:sync:error', { reason: 'action-rejected', actionId: value.actionId });
    }
  }

  private rememberAction(actionId: string): void {
    this.seenActionIds.add(actionId);
    if (this.seenActionIds.size > 2048) {
      const oldest = this.seenActionIds.values().next().value as string | undefined;
      if (oldest) this.seenActionIds.delete(oldest);
    }
  }

  private handleHaptics(event: EngineEvent): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    let pattern: number[] | null = null;
    if (event.type === 'player:health:delta') {
      const payload = event.payload as { delta?: number };
      if (typeof payload.delta === 'number' && payload.delta < 0) pattern = Math.abs(payload.delta) >= 10 ? [70, 40, 70] : [35];
    } else if (event.type === 'tension_increase') {
      const payload = event.payload as { currentTension?: number; magnitude?: number };
      if ((payload.currentTension ?? 0) >= 70 || (payload.magnitude ?? 0) >= 10) pattern = [60, 35, 60];
    }
    if (!pattern) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      return;
    }
  }
}