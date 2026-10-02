import type {
  EngineStateChanged,
  IEngineContext,
  IEngineSystem,
} from '../EngineCore.ts';
import { EventBus } from '../EventBus.ts';
import type { GameState } from '../ConquerOrchestrator.ts';
import type { PlayerIntent } from './PlayerIntent.ts';

type TensionBand = 'calm' | 'tense' | 'critical';

function getTensionBand(tension: number): TensionBand {
  if (tension >= 70) return 'critical';
  if (tension >= 35) return 'tense';
  return 'calm';
}

function getTensionDelta(intent: PlayerIntent): number {
  switch (intent.type) {
    case 'idle':
      return -Math.max(1, Math.min(10, Math.ceil(intent.durationMs / 1000)));
    case 'skill':
      return intent.core ? 12 : 5;
    case 'item':
      return intent.usage === 'abuse' ? 15 : 2;
    case 'combat':
      return intent.action === 'attack' ? 8 : 3;
  }
}

export class WorldResponderSystem implements IEngineSystem<GameState> {
  readonly id = 'world-responder';
  private engine: IEngineContext<GameState> | null = null;
  private unsubscribe: (() => void) | null = null;

  initialize(engine: IEngineContext<GameState>): void {
    this.engine = engine;
  }

  start(): void {
    if (!this.engine) throw new Error('WorldResponderSystem has not been initialized.');
    if (this.unsubscribe) return;
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

  private respond(change: EngineStateChanged<GameState>): void {
    if (!this.engine || change.engineId !== this.engine.engineId) return;
    if (change.actionType === 'world.responder.tension') return;

    const isIntentChange = change.actionType.startsWith('player.intent.');
    const healthChanged = change.previousState.playerState.health !== change.state.playerState.health;
    const tensionChanged = change.previousState.arsState.tension !== change.state.arsState.tension;
    if (!isIntentChange && !healthChanged && !tensionChanged) return;

    const intent = isIntentChange ? change.state.arsState.lastIntent : null;
    if (isIntentChange && !intent) return;

    if (!intent && !healthChanged && tensionChanged) {
      this.publishWorldSignals(
        change.state.arsState.tension,
        change.state.combatState.active,
        'tension',
      );
      return;
    }

    const healthRatio = change.state.playerState.health / change.state.playerState.maxHealth;
    const healthPressure = healthRatio <= 0.25 ? 10 : healthChanged ? -10 : 0;
    const currentTension = change.state.arsState.tension;
    const nextTension = Math.max(0, Math.min(100,
      currentTension + (intent ? getTensionDelta(intent) : 0) + healthPressure,
    ));
    if (nextTension === currentTension) return;

    this.engine.applyMutation({
      type: 'world.responder.tension',
      apply: (draft) => {
        draft.arsState.tension = nextTension;
      },
    });
    this.publishWorldSignals(nextTension, change.state.combatState.active, intent?.type ?? 'health');
  }

  private publishWorldSignals(tension: number, combatActive: boolean, source: string): void {
    if (!this.engine) return;
    const band = getTensionBand(tension);
    this.engine.emit('world:tension:changed', {
      tension,
      band,
      source,
    });
    this.engine.emit('world:difficulty:changed', {
      band,
      scale: Number((1 + tension / 100).toFixed(2)),
    });
    this.engine.emit('world:music:changed', {
      mood: combatActive ? 'combat' : band,
      intensity: tension,
    });
    this.engine.emit('world:state:changed', {
      alert: band,
      tension,
    });
  }
}