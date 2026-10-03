import type {
  EngineEvent,
  EngineStateChanged,
  IEngineContext,
  IEngineSystem,
  IMutationAction,
} from './EngineCore.ts';
import { EventBus } from './EventBus.ts';
import { TimeManager } from './TimeManager.ts';

type StateValidator<TState> = (state: TState) => void;
type EventRecorder<TState> = (draft: TState, event: EngineEvent) => void;
type EngineLifecycle = 'ready' | 'running' | 'stopped' | 'disposed';

export interface EngineOrchestratorOptions<TState> {
  validateState?: StateValidator<TState>;
  recordEvent?: EventRecorder<TState>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertFiniteNumbers(value: unknown, visited = new Set<object>()): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Engine state cannot contain NaN or infinite numbers.');
  }
  if (value === null || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  for (const child of Object.values(value)) assertFiniteNumbers(child, visited);
}

function cloneEvent<T>(event: EngineEvent<T>): EngineEvent<T> {
  return { ...event, payload: clone(event.payload) };
}

export class EngineOrchestrator<TState extends object>
  implements IEngineContext<TState> {
  private static engineSequence = 0;
  readonly engineId = `engine-${++EngineOrchestrator.engineSequence}`;
  readonly time = new TimeManager();
  private readonly eventBus = new EventBus();
  private state: TState;
  private revision = 0;
  private eventSequence = 0;
  private lifecycle: EngineLifecycle = 'ready';
  private systems = new Map<string, IEngineSystem<TState>>();
  private initializedSystems = new Set<string>();
  private startedSystems = new Set<string>();
  private readonly validateState?: StateValidator<TState>;
  private readonly recordEvent?: EventRecorder<TState>;

  constructor(initialState: TState, options: EngineOrchestratorOptions<TState> = {}) {
    this.state = clone(initialState);
    this.validateState = options.validateState;
    this.recordEvent = options.recordEvent;
    this.validate(this.state);
  }

  getRevision(): number {
    return this.revision;
  }

  getState(): TState {
    return clone(this.state);
  }

  applyMutation(action: IMutationAction<TState>): TState {
    if (this.lifecycle === 'disposed') throw new Error('Engine has been disposed.');
    if (!action.type.trim()) throw new Error('Mutation action type must not be empty.');

    const previousState = this.state;
    const draft = clone(previousState);
    action.apply(draft);
    this.validate(draft);
    this.state = draft;
    this.revision += 1;
    const revision = this.revision;
    const snapshot = this.getState();
    this.eventBus.emit('engine:mutation', {
      engineId: this.engineId,
      actionType: action.type,
      revision,
    });
    const stateChange: EngineStateChanged<TState> = {
      engineId: this.engineId,
      actionType: action.type,
      revision,
      state: snapshot,
    };
    this.eventBus.emit(`engine:state:changed:${action.type}`, stateChange);
    return snapshot;
  }

  registerSystem(system: IEngineSystem<TState>): void {
    if (this.lifecycle === 'running' || this.lifecycle === 'disposed') {
      throw new Error('Systems can only be registered before the engine starts.');
    }
    if (!system.id.trim() || this.systems.has(system.id)) {
      throw new Error(`System id is empty or already registered: ${system.id}`);
    }
    this.systems.set(system.id, system);
  }

  async start(): Promise<void> {
    if (this.lifecycle === 'running') return;
    if (this.lifecycle === 'disposed') throw new Error('Engine has been disposed.');

    try {
      for (const system of this.systems.values()) {
        if (this.initializedSystems.has(system.id)) continue;
        await system.initialize?.(this);
        this.initializedSystems.add(system.id);
      }
      for (const system of this.systems.values()) {
        if (this.startedSystems.has(system.id)) continue;
        await system.start?.();
        this.startedSystems.add(system.id);
      }
      this.lifecycle = 'running';
    } catch (error) {
      await this.stopStartedSystems();
      this.lifecycle = 'stopped';
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.lifecycle === 'disposed') return;
    await this.stopStartedSystems();
    this.lifecycle = 'stopped';
  }

  tick(deltaMs: number): number {
    if (this.lifecycle !== 'running') {
      throw new Error('Engine must be running before it can tick.');
    }
    const simulationTime = this.time.advance(deltaMs);
    for (const system of this.systems.values()) system.update?.(deltaMs);
    return simulationTime;
  }

  async dispose(): Promise<void> {
    if (this.lifecycle === 'disposed') return;
    let failure: unknown;
    try {
      await this.stopStartedSystems();
    } catch (error) {
      failure = error;
    }
    for (const system of [...this.systems.values()].reverse()) {
      try {
        await system.dispose?.();
      } catch (error) {
        failure ??= error;
      }
    }
    this.systems.clear();
    this.initializedSystems.clear();
    this.startedSystems.clear();
    this.eventBus.clear();
    this.lifecycle = 'disposed';
    if (failure) throw failure;
  }

  on<T = unknown>(type: string, handler: (event: EngineEvent<T>) => void): () => void {
    return this.eventBus.on<EngineEvent<T>>(type, handler);
  }

  subscribe<T = unknown>(type: string, handler: (payload: T) => void): () => void {
    return this.eventBus.on<T>(type, handler);
  }

  emit<T>(type: string, payload: T): EngineEvent<T> {
    if (!type.trim()) throw new Error('Event type must not be empty.');
    const event: EngineEvent<T> = {
      type,
      payload: clone(payload),
      sequence: this.eventSequence + 1,
    };
    const previousSequence = this.eventSequence;
    this.eventSequence = event.sequence;
    try {
      if (this.recordEvent) {
        const storedEvent = cloneEvent(event);
        this.applyMutation({
          type: `event:${type}`,
          apply: (draft) => this.recordEvent?.(draft, storedEvent),
        });
      }
    } catch (error) {
      if (this.eventSequence === event.sequence) this.eventSequence = previousSequence;
      throw error;
    }
    this.eventBus.emit(type, cloneEvent(event));
    this.eventBus.emit('engine:event', {
      engineId: this.engineId,
      event: cloneEvent(event),
      revision: this.revision,
    });
    return cloneEvent(event);
  }

  private validate(state: TState): void {
    assertFiniteNumbers(state);
    this.validateState?.(state);
  }

  private async stopStartedSystems(): Promise<void> {
    let failure: unknown;
    const started = [...this.startedSystems].reverse();
    for (const id of started) {
      const system = this.systems.get(id);
      try {
        await system?.stop?.();
      } catch (error) {
        failure ??= error;
      }
      this.startedSystems.delete(id);
    }
    if (failure) throw failure;
  }
}