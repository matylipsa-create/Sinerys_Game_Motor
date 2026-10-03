import type { EngineEvent, EngineStateChanged } from '../EngineCore.ts';
import type { GameState } from '../ConquerOrchestrator.ts';
import { EngineOrchestrator } from '../EngineOrchestrator.ts';
import { createInitialReality } from '../MultiversalDriftManager.ts';
import { ParadoxStorage } from '../ParadoxStorage.ts';
import { createInitialParadoxSession, type ParadoxSessionState } from '../ParadoxState.ts';
import {
  CameraMode,
  createInitialOrchestratorSnapshot,
  type OrchestratorSnapshot,
} from '../ParadoxVisualEngine.ts';
import { createInitialStrategicState } from '../StrategicParadoxDirector.ts';
import { createPlayerIntentAction, type PlayerIntent } from './PlayerIntent.ts';
import type { ArenaState } from '../../pwa/arena/SentraCoreArena.ts';

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
  arenaState?: ArenaState;
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

interface PersistedCheckpoint {
  schemaVersion: 1 | 2 | 3;
  sessionId?: string;
  startedAt?: string;
  stateHash: string;
  state: FallOfZionState;
}

export interface GameSessionExport {
  session_id: string;
  started_at: string;
  events: EngineEvent[];
  final_state_hash: string;
  device_info: Record<string, string | number | boolean>;
}

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

const CHECKPOINT_DATABASE = 'conquer-of-darkness-game';
const CHECKPOINT_STORE = 'checkpoints';
const CHECKPOINT_KEY = 'latest';
const CORE_PULSE_LIMIT = 3;
const ENCOUNTER_BASE_HEALTH = 72;
const ENCOUNTER_HEALTH_PER_FLOOR = 5;
const ENCOUNTER_ID_PREFIX = 'tower-sentinel-floor-';

function encounterIdForFloor(floor: number): string {
  return `${ENCOUNTER_ID_PREFIX}${floor}`;
}

function encounterMaxHealth(floor: number): number {
  return ENCOUNTER_BASE_HEALTH + (floor - 1) * ENCOUNTER_HEALTH_PER_FLOOR;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortObjectKeys(child)]),
  );
}

async function hashGameState(state: FallOfZionState): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable for checkpoint hashing.');
  const serialized = JSON.stringify(sortObjectKeys(state));
  if (!serialized) throw new Error('Game state could not be serialized for checkpoint hashing.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isPersistedCheckpoint(value: unknown): value is PersistedCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const checkpoint = value as Partial<PersistedCheckpoint>;
  if ((checkpoint.schemaVersion !== 1 && checkpoint.schemaVersion !== 2 && checkpoint.schemaVersion !== 3)
    || typeof checkpoint.stateHash !== 'string'
    || !checkpoint.state || typeof checkpoint.state !== 'object') return false;
  return checkpoint.schemaVersion === 1
    || (typeof checkpoint.sessionId === 'string' && typeof checkpoint.startedAt === 'string');
}

function isParadoxSessionState(value: unknown): value is ParadoxSessionState {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<ParadoxSessionState>;
  return !!session.state
    && typeof session.state === 'object'
    && Array.isArray(session.state.mutagensOwned)
    && !!session.state.survival
    && typeof session.state.survival === 'object'
    && Array.isArray(session.events)
    && Array.isArray(session.crises);
}

function isOrchestratorSnapshot(value: unknown): value is OrchestratorSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<OrchestratorSnapshot>;
  return Number.isInteger(snapshot.shelterVisitCount)
    && Number.isInteger(snapshot.currentRealityTier)
    && ['aggressive', 'tactical', 'passive'].includes(snapshot.currentPlaystyle as string)
    && Number.isFinite(snapshot.mutationSeed);
}

function visualCameraMode(mode: ParadoxSessionState['state']['activeCameraMode']): CameraMode {
  switch (mode) {
    case 'FIRST_PERSON':
      return CameraMode.FIRST_PERSON_IMMERSIVE;
    case 'SIDE_SCROLLER':
      return CameraMode.SIDE_SCROLLER_METROID;
    default:
      return CameraMode.ISOMETRIC_TACTICAL;
  }
}

function migrateGameState(
  savedState: FallOfZionState,
  legacyParadox: ReturnType<typeof ParadoxStorage.loadGameData>,
): { state: FallOfZionState; importedLegacyParadox: boolean; needsRewrite: boolean } {
  const candidate = structuredClone(savedState) as Partial<FallOfZionState>;
  const importedLegacyParadox = !isParadoxSessionState(candidate.paradoxSession) && legacyParadox !== null;
  const needsRewrite = importedLegacyParadox
    || !isParadoxSessionState(candidate.paradoxSession)
    || !isOrchestratorSnapshot(candidate.paradoxVisual)
    || candidate.paradoxVisual?.shelterVisitCount !== candidate.paradoxSession?.state.shelterVisits
    || candidate.paradoxVisual?.currentRealityTier !== candidate.paradoxSession?.state.realityTier
    || !Object.values(CameraMode).includes(candidate.cameraMode as CameraMode)
    || !candidate.strategicState
    || !Array.isArray(candidate.activeCrises)
    || !Number.isInteger(candidate.nextCrisisId)
    || !candidate.currentReality
    || !Array.isArray(candidate.realityHistory)
    || !Number.isInteger(candidate.nextRealityId);
  const initialParadox = createInitialParadoxSession();
  const paradoxSession = isParadoxSessionState(candidate.paradoxSession)
    ? candidate.paradoxSession
    : legacyParadox
      ? {
          state: legacyParadox.state,
          events: legacyParadox.events,
          crises: legacyParadox.crises,
        }
      : initialParadox;
  const initialVisual = createInitialOrchestratorSnapshot();
  initialVisual.shelterVisitCount = paradoxSession.state.shelterVisits;
  initialVisual.currentRealityTier = paradoxSession.state.realityTier;
  const paradoxVisual = isOrchestratorSnapshot(candidate.paradoxVisual)
    ? { ...candidate.paradoxVisual }
    : initialVisual;
  paradoxVisual.shelterVisitCount = paradoxSession.state.shelterVisits;
  paradoxVisual.currentRealityTier = paradoxSession.state.realityTier;

  return {
    state: {
      ...candidate,
      paradoxSession,
      paradoxVisual,
      cameraMode: !importedLegacyParadox && Object.values(CameraMode).includes(candidate.cameraMode as CameraMode)
        ? candidate.cameraMode as CameraMode
        : visualCameraMode(paradoxSession.state.activeCameraMode),
      strategicState: candidate.strategicState ?? createInitialStrategicState(),
      activeCrises: candidate.activeCrises ?? [],
      nextCrisisId: candidate.nextCrisisId ?? 0,
      currentReality: candidate.currentReality ?? createInitialReality(),
      realityHistory: candidate.realityHistory ?? [],
      nextRealityId: candidate.nextRealityId ?? 0,
    } as FallOfZionState,
    importedLegacyParadox,
    needsRewrite,
  };
}

export class OrchestratorBridge {
  private readonly engine: EngineOrchestrator<GameState>;
  private readonly bridgeId = globalThis.crypto?.randomUUID?.()
    ?? `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  private sessionId: string = this.bridgeId;
  private sessionStartedAt = new Date().toISOString();
  private actionSequence = 0;
  private seenActionIds = new Set<string>();
  private localChannels = new Set<BroadcastChannel>();
  private peerChannels = new Map<RTCDataChannel, (event: MessageEvent) => void>();
  private checkpointDatabase: Promise<IDBDatabase> | null = null;
  private checkpointWriteQueue: Promise<void> = Promise.resolve();

  constructor(engine: EngineOrchestrator<GameState>) {
    this.engine = engine;
  }

  getGameState(): FallOfZionState {
    return this.engine.getState() as FallOfZionState;
  }

  getArenaState(): ArenaState | undefined {
    return this.getGameState().arenaState;
  }

  initializeArenaState(state: ArenaState): void {
    if (this.getArenaState()) return;
    this.setArenaState(state, 'arena.initialize');
  }

  setArenaState(state: ArenaState, mutationType = 'arena.update'): ArenaState {
    const nextState = structuredClone(state);
    this.engine.applyMutation({
      type: mutationType,
      apply: (draft) => {
        (draft as FallOfZionState).arenaState = nextState;
      },
    });
    return nextState;
  }

  async restoreCheckpoint(): Promise<boolean> {
    const checkpoint = await this.readCheckpoint();
    const legacyParadox = ParadoxStorage.loadGameData();
    if (!checkpoint) {
      if (!legacyParadox) return false;
      this.engine.applyMutation({
        type: 'checkpoint.legacy-paradox-migration',
        apply: (draft) => {
          const state = draft as FallOfZionState;
          state.paradoxSession = {
            state: legacyParadox.state,
            events: legacyParadox.events,
            crises: legacyParadox.crises,
          };
          state.paradoxVisual.shelterVisitCount = legacyParadox.state.shelterVisits;
          state.paradoxVisual.currentRealityTier = legacyParadox.state.realityTier;
          state.cameraMode = visualCameraMode(legacyParadox.state.activeCameraMode);
        },
      });
      await this.writeCheckpoint(this.engine.getState() as FallOfZionState);
      ParadoxStorage.clearSave();
      return true;
    }
    const actualHash = await hashGameState(checkpoint.state);
    if (actualHash !== checkpoint.stateHash) {
      throw new Error('The saved game checkpoint failed its state hash check.');
    }

    this.sessionId = checkpoint.sessionId ?? this.bridgeId;
    this.sessionStartedAt = checkpoint.startedAt ?? this.sessionStartedAt;
    const migration = migrateGameState(checkpoint.state, legacyParadox);
    const restoredState = migration.state;
    this.engine.applyMutation({
      type: 'checkpoint.restore',
      apply: (draft) => Object.assign(draft, restoredState),
    });
    if (checkpoint.schemaVersion < 3 || migration.needsRewrite) {
      await this.writeCheckpoint(restoredState);
      if (migration.importedLegacyParadox) ParadoxStorage.clearSave();
    }
    return true;
  }

  subscribeCheckpoints(onError: (error: Error) => void): () => void {
    return this.engine.subscribe<EngineStateChanged<GameState>>(
      'engine:state:changed:*',
      (change) => {
        if (change.engineId !== this.engine.engineId) return;
        const state = structuredClone(change.state) as FallOfZionState;
        const write = this.checkpointWriteQueue.then(() => this.writeCheckpoint(state));
        this.checkpointWriteQueue = write.then(
          () => undefined,
          (error: unknown) => {
            onError(error instanceof Error ? error : new Error(String(error)));
          },
        );
      },
    );
  }

  async exportSession(deviceInfo: Record<string, string | number | boolean>): Promise<GameSessionExport> {
    const state = this.getGameState();
    return {
      session_id: this.sessionId,
      started_at: this.sessionStartedAt,
      events: structuredClone(state.eventState).sort((left, right) => left.sequence - right.sequence),
      final_state_hash: await hashGameState(state),
      device_info: structuredClone(deviceInfo),
    };
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
    const unsubscribeState = this.engine.subscribe<EngineStateChanged<GameState>>(
      'engine:state:changed:*',
      (change) => {
        if (change.engineId === this.engine.engineId) listener({ kind: 'state', change });
      },
    );
    const unsubscribeEvents = this.engine.subscribe<{
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
    const currentState = this.getGameState();
    const encounterId = encounterIdForFloor(currentState.dungeonState.currentFloor);
    if (intent.type === 'skill' && intent.core && currentState.arsState.coreSkillUses >= CORE_PULSE_LIMIT) {
      throw new Error('No quedan pulsos core en esta expedición.');
    }
    const action = createPlayerIntentAction(intent);
    const retaliationEvents: { actorName: string; damage: number }[] = [];
    let dealtDamage = 0;
    this.engine.applyMutation({
      type: action.type,
      apply: (draft) => {
        action.apply(draft);
        const state = draft as FallOfZionState;
        const partyMember = state.partyState.members.find((candidate) => candidate.id === actorId);
        if (partyMember) partyMember.lastIntent = structuredClone(intent);
        if (partyMember && partyMember.health <= 0) throw new Error(`${partyMember.name} is unable to act while down.`);
        if (intent.type === 'skill' && intent.core) {
          const enemy = state.enemyState[encounterId] ?? {
            health: encounterMaxHealth(state.dungeonState.currentFloor),
            behaviorId: 'tower-sentinel',
          };
          const previousHealth = enemy.health;
          enemy.health = Math.max(0, enemy.health - 30);
          dealtDamage = previousHealth - enemy.health;
          state.enemyState[encounterId] = enemy;
          state.arsState.combatActions += 1;
          state.combatState.active = enemy.health > 0;
          state.combatState.encounterId = enemy.health > 0 ? encounterId : null;
        } else if (intent.type === 'combat' || intent.type === 'skill') {
          state.combatState.active = true;
          state.combatState.encounterId ??= encounterId;
        }
        if (intent.type === 'skill' && intent.core) {
          const retaliation = this.resolveEncounterResponse(state, partyMember ?? member);
          if (retaliation) retaliationEvents.push(retaliation);
        }
      },
    });
    if (dealtDamage > 0) {
      this.engine.emit('encounter:damage', {
        narrative: `${member.name} libera un pulso del núcleo; el centinela pierde ${dealtDamage} HP.`,
      });
    }
    const retaliation = retaliationEvents[0];
    if (retaliation) {
      this.engine.emit('encounter:retaliation', {
        narrative: `El centinela contraataca: ${retaliation.actorName} pierde ${retaliation.damage} HP.`,
      });
    }
  }

  private applyChoice(choice: PartyChoice, actionId: string): void {
    const member = this.requireMember(choice.actorId);
    let dealtDamage = 0;
    const retaliationEvents: { actorName: string; damage: number }[] = [];
    this.engine.applyMutation({
      type: `party.choice.${choice.type}`,
      apply: (draft) => {
        const state = draft as FallOfZionState;
        const actor = state.partyState.members.find((candidate) => candidate.id === choice.actorId);
        if (!actor) throw new Error(`Unknown party member: ${choice.actorId}`);
        if (actor.health <= 0 && choice.type !== 'heal') throw new Error(`${actor.name} is unable to act while down.`);
        const floor = state.dungeonState.currentFloor;
        const encounterId = encounterIdForFloor(floor);
        switch (choice.type) {
          case 'attack':
            if (!choice.targetId.trim()) throw new Error('Attack requires a target.');
            if (choice.targetId !== encounterId) throw new Error('The selected enemy is not in this encounter.');
            {
              const enemy = state.enemyState[encounterId] ?? {
                health: encounterMaxHealth(floor),
                behaviorId: 'tower-sentinel',
              };
              if (enemy.health <= 0) throw new Error('This enemy has already been defeated.');
              const damage = actor.archetype === 'Vanguardia' ? 22 : actor.archetype === 'Rastreador' ? 18 : 14;
              const previousHealth = enemy.health;
              enemy.health = Math.max(0, enemy.health - damage);
              dealtDamage = previousHealth - enemy.health;
              state.enemyState[encounterId] = enemy;
              state.combatState.active = enemy.health > 0;
              state.combatState.encounterId = enemy.health > 0 ? encounterId : null;
            }
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
            if (actor.health >= actor.maxHealth) throw new Error(`${actor.name} already has full health.`);
            this.adjustMemberHealth(state, actor, choice.amount);
            break;
          case 'collect-loot':
            if (!choice.itemId.trim()) throw new Error('Loot item id must not be empty.');
            if ((state.enemyState[encounterId]?.health ?? encounterMaxHealth(floor)) > 0) {
              throw new Error('Defeat the sentinel before claiming its reward.');
            }
            if (actor.inventory.includes(choice.itemId)) throw new Error('This reward has already been claimed.');
            actor.inventory.push(choice.itemId);
            state.lootState.push({
              id: `${actionId}-loot`,
              itemId: choice.itemId,
              floor,
            });
            break;
          case 'advance':
            if ((state.enemyState[encounterId]?.health ?? encounterMaxHealth(floor)) > 0) {
              throw new Error('Defeat the sentinel before descending.');
            }
            if (floor >= 15) throw new Error('The final floor has been reached.');
            state.dungeonState.currentFloor += 1;
            state.worldState.location = 'DUNGEON';
            state.worldState.block = Math.floor((state.dungeonState.currentFloor - 1) / 3) + 1;
            state.combatState.active = false;
            state.combatState.encounterId = null;
            break;
        }
        if (choice.type === 'attack' || choice.type === 'guard' || choice.type === 'heal') {
          const retaliation = this.resolveEncounterResponse(state, actor);
          if (retaliation) retaliationEvents.push(retaliation);
        }
      },
    });
    if (dealtDamage > 0) {
      this.engine.emit('encounter:damage', {
        narrative: `${member.name} inflige ${dealtDamage} de daño al centinela.`,
      });
    }
    const retaliation = retaliationEvents[0];
    if (retaliation) {
      this.engine.emit('encounter:retaliation', {
        narrative: `El centinela contraataca: ${retaliation.actorName} pierde ${retaliation.damage} HP.`,
      });
    }
  }

  private resolveEncounterResponse(
    state: FallOfZionState,
    actor: PartyMember,
  ): { actorName: string; damage: number } | null {
    const encounterId = encounterIdForFloor(state.dungeonState.currentFloor);
    const enemy = state.enemyState[encounterId];
    if (!enemy || enemy.health <= 0) return null;

    const guarded = actor.statuses.includes('guarding');
    if (guarded) actor.statuses = actor.statuses.filter((status) => status !== 'guarding');
    const damage = guarded ? 4 : 9;
    const previousHealth = actor.health;
    this.adjustMemberHealth(state, actor, -damage);
    return { actorName: actor.name, damage: previousHealth - actor.health };
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

  private openCheckpointDatabase(): Promise<IDBDatabase> {
    if (this.checkpointDatabase) return this.checkpointDatabase;
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is unavailable; game checkpoints cannot be persisted.');
    }

    this.checkpointDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open(CHECKPOINT_DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(CHECKPOINT_STORE)) {
          request.result.createObjectStore(CHECKPOINT_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open the game checkpoint database.'));
      request.onblocked = () => reject(new Error('Opening the game checkpoint database was blocked.'));
    });
    return this.checkpointDatabase;
  }

  private async readCheckpoint(): Promise<PersistedCheckpoint | null> {
    const database = await this.openCheckpointDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(CHECKPOINT_STORE, 'readonly');
      const request = transaction.objectStore(CHECKPOINT_STORE).get(CHECKPOINT_KEY);
      let checkpoint: PersistedCheckpoint | null = null;

      request.onsuccess = () => {
        if (request.result === undefined) return;
        if (!isPersistedCheckpoint(request.result)) {
          transaction.abort();
          reject(new Error('The saved game checkpoint has an unsupported format.'));
          return;
        }
        checkpoint = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read the game checkpoint.'));
      transaction.oncomplete = () => resolve(checkpoint);
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not complete the checkpoint read.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('The checkpoint read was aborted.'));
    });
  }

  private async writeCheckpoint(state: FallOfZionState): Promise<void> {
    const stateHash = await hashGameState(state);
    const database = await this.openCheckpointDatabase();
    const checkpoint: PersistedCheckpoint = {
      schemaVersion: 3,
      sessionId: this.sessionId,
      startedAt: this.sessionStartedAt,
      stateHash,
      state,
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CHECKPOINT_STORE, 'readwrite');
      transaction.objectStore(CHECKPOINT_STORE).put(checkpoint, CHECKPOINT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not write the game checkpoint.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('The checkpoint write was aborted.'));
    });
  }
}