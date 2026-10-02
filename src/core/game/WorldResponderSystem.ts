import type {
  EngineStateChanged,
  IEngineContext,
  IEngineSystem,
} from '../EngineCore.ts';
import { EventBus } from '../EventBus.ts';
import type { GameState } from '../ConquerOrchestrator.ts';
import type { PlayerIntent } from './PlayerIntent.ts';

type TensionBand = 'calm' | 'tense' | 'critical';
type HealthChangeSource = 'damage' | 'heal' | 'regen' | 'neutral';
type HealthDelta = {
  previousHealth: number;
  currentHealth: number;
  delta: number;
  source: HealthChangeSource;
};

const PASSIVE_DECAY_INTERVAL_MS = 1000;

interface PartyHealthMember {
  health: number;
}

function getPartyHealth(state: GameState): number {
  const party = state.partyState as GameState['partyState'] & { members?: PartyHealthMember[] };
  if (!party.members?.length) return state.playerState.health;
  return party.members.reduce((total, member) => total + member.health, 0);
}

function getTensionBand(tension: number): TensionBand {
  if (tension >= 70) return 'critical';
  if (tension >= 35) return 'tense';
  return 'calm';
}

function getTensionDelta(intent: PlayerIntent): number {
  switch (intent.type) {
    case 'idle':
      return 0;
    case 'skill':
      return intent.core ? 12 : 5;
    case 'item':
      return intent.usage === 'abuse' ? 15 : 2;
    case 'combat':
      return intent.action === 'attack' ? 8 : 3;
  }
}

function getHealthChangeSource(actionType: string, delta: number): HealthChangeSource {
  if (actionType.includes('regen') && delta > 0) return 'regen';
  if (actionType.includes('damage') && delta < 0) return 'damage';
  if (actionType.includes('heal') && delta > 0) return 'heal';
  if (delta < 0) return 'damage';
  if (delta > 0) return 'heal';
  return 'neutral';
}

export class WorldResponderSystem implements IEngineSystem<GameState> {
  readonly id = 'world-responder';
  private engine: IEngineContext<GameState> | null = null;
  private unsubscribe: (() => void) | null = null;
  private previousHealth = 0;
  private lastSimulationTime = 0;
  private passiveDecayTimeMs = 0;
  private pendingHealthSource: HealthChangeSource = 'neutral';
  private pendingIntents: PlayerIntent[] = [];

  initialize(engine: IEngineContext<GameState>): void {
    this.engine = engine;
  }

  start(): void {
    if (!this.engine) throw new Error('WorldResponderSystem has not been initialized.');
    if (this.unsubscribe) return;
    const state = this.engine.getState();
    this.previousHealth = getPartyHealth(state);
    this.lastSimulationTime = this.engine.time.getSimulationTime();
    this.passiveDecayTimeMs = 0;
    this.pendingHealthSource = 'neutral';
    this.pendingIntents = [];
    this.unsubscribe = EventBus.on<EngineStateChanged<GameState>>(
      'engine:state:changed:*',
      (change) => this.respond(change),
    );
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  dispose(): void {
    this.stop();
    this.engine = null;
  }

  update(): void {
    if (!this.engine || this.engine.time.getMode() !== 'ACTIVE') return;
    const simulationTime = this.engine.time.getSimulationTime();
    const elapsedMs = simulationTime - this.lastSimulationTime;
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.lastSimulationTime = simulationTime;

    const state = this.engine.getState();
    const previousHealth = this.previousHealth;
    const currentHealth = getPartyHealth(state);
    const delta = currentHealth - previousHealth;
    this.previousHealth = currentHealth;

    if (delta !== 0) {
      const source = this.pendingHealthSource;
      const healthDelta: HealthDelta = { previousHealth, currentHealth, delta, source };
      this.engine.emit('player:health:delta', {
        ...healthDelta,
        timestamp: simulationTime,
      });
      this.applyTensionEffect(
        delta < 0 ? 'tension_increase' : 'tension_decrease',
        Math.max(1, Math.ceil(Math.abs(delta) / 5)),
        source,
        simulationTime,
        healthDelta,
      );
    }
    this.pendingHealthSource = 'neutral';

    const intents = this.pendingIntents;
    this.pendingIntents = [];
    for (const intent of intents) {
      const tensionDelta = getTensionDelta(intent);
      if (tensionDelta === 0) continue;
      this.applyTensionEffect(
        tensionDelta > 0 ? 'tension_increase' : 'tension_decrease',
        Math.abs(tensionDelta),
        intent.type,
        simulationTime,
      );
    }

    this.passiveDecayTimeMs += elapsedMs;
    const decaySteps = Math.floor(this.passiveDecayTimeMs / PASSIVE_DECAY_INTERVAL_MS);
    if (decaySteps > 0 && delta === 0) {
      this.passiveDecayTimeMs -= decaySteps * PASSIVE_DECAY_INTERVAL_MS;
      this.applyTensionEffect('tension_decay', decaySteps, 'neutral', simulationTime, {
        previousHealth: currentHealth,
        currentHealth,
        delta: 0,
        source: 'neutral',
      });
    }
  }

  private respond(change: EngineStateChanged<GameState>): void {
    if (!this.engine || change.engineId !== this.engine.engineId) return;
    const previousHealth = getPartyHealth(change.previousState);
    const currentHealth = getPartyHealth(change.state);
    const healthChanged = previousHealth !== currentHealth;
    if (healthChanged) {
      const delta = currentHealth - previousHealth;
      this.pendingHealthSource = getHealthChangeSource(change.actionType, delta);
    }
    if (change.actionType.startsWith('player.intent.')) {
      const intent = change.state.arsState.lastIntent;
      if (intent) this.pendingIntents.push(intent);
    }
  }

  private applyTensionEffect(
    type: 'tension_increase' | 'tension_decrease' | 'tension_decay',
    magnitude: number,
    source: string,
    timestamp: number,
    healthDelta?: HealthDelta,
  ): void {
    if (!this.engine) return;
    const previousTension = this.engine.getState().arsState.tension;
    const direction = type === 'tension_increase' ? 1 : -1;
    const currentTension = Math.max(0, Math.min(100, previousTension + direction * magnitude));
    const appliedMagnitude = Math.abs(currentTension - previousTension);
    if (currentTension !== previousTension) {
      this.engine.applyMutation({
        type: 'world.responder.tension',
        apply: (draft) => {
          draft.arsState.tension = currentTension;
        },
      });
    }
    this.engine.emit(type, {
      magnitude: appliedMagnitude,
      previousTension,
      currentTension,
      source,
      timestamp,
      ...(healthDelta ?? {}),
    });
    this.publishWorldSignals(currentTension, source, timestamp);
  }

  private publishWorldSignals(tension: number, source: string, timestamp: number): void {
    if (!this.engine) return;
    const band = getTensionBand(tension);
    const combatActive = this.engine.getState().combatState.active;
    this.engine.emit('world:tension:changed', {
      tension,
      band,
      source,
      timestamp,
    });
    this.engine.emit('world:difficulty:changed', {
      band,
      scale: Number((1 + tension / 100).toFixed(2)),
      timestamp,
    });
    this.engine.emit('world:music:changed', {
      mood: combatActive ? 'combat' : band,
      intensity: tension,
      timestamp,
    });
    this.engine.emit('world:state:changed', {
      alert: band,
      tension,
      timestamp,
    });
  }
}