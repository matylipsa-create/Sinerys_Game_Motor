import type { EngineEvent, EngineStateChanged } from '../EngineCore.ts';
import { EventBus } from '../EventBus.ts';
import type { GameState } from '../ConquerOrchestrator.ts';
import { EngineOrchestrator } from '../EngineOrchestrator.ts';
import { createPlayerIntentAction, type PlayerIntent } from './PlayerIntent.ts';

export type RendererBridgeEvent =
  | { kind: 'state'; change: EngineStateChanged<GameState> }
  | { kind: 'event'; event: EngineEvent; revision: number };

export class OrchestratorBridge {
  private readonly engine: EngineOrchestrator<GameState>;

  constructor(engine: EngineOrchestrator<GameState>) {
    this.engine = engine;
  }

  dispatchIntent(intent: PlayerIntent): GameState {
    this.engine.applyMutation(createPlayerIntentAction(intent));
    this.engine.emit('player:intent', intent);
    return this.engine.getState();
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
        listener({ kind: 'event', event: message.event, revision: message.revision });
      }
    });
    return () => {
      unsubscribeState();
      unsubscribeEvents();
    };
  }
}