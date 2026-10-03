import type { EngineEvent, IEngineContext, IEngineSystem } from '../EngineCore.ts';
import type { GameState } from '../ConquerOrchestrator.ts';
import { bridge } from '../OrchestratorBridge.ts';

interface EngineEventEnvelope {
  engineId: string;
  event: EngineEvent;
  revision: number;
}

function isPayloadRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export class GodotBridgeSystem implements IEngineSystem<GameState> {
  readonly id = 'godot-bridge';
  private engine: IEngineContext<GameState> | null = null;
  private unsubscribe: (() => void) | null = null;

  initialize(engine: IEngineContext<GameState>): void {
    this.engine = engine;
  }

  start(): void {
    if (!this.engine) throw new Error('GodotBridgeSystem has not been initialized.');
    if (this.unsubscribe) return;
    bridge.connect();
    this.unsubscribe = this.engine.subscribe<EngineEventEnvelope>('engine:event', (message) => {
      if (message.engineId !== this.engine?.engineId) return;
      if (!['world:tension:changed', 'world:difficulty:changed', 'world:state:changed'].includes(message.event.type)) return;
      if (!isPayloadRecord(message.event.payload)) return;
      bridge.sendCommand({
        type: 'WORLD_STATE',
        payload: {
          eventType: message.event.type,
          revision: message.revision,
          payload: message.event.payload,
        },
      });
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    bridge.disconnect();
  }

  dispose(): void {
    this.stop();
    this.engine = null;
  }
}
