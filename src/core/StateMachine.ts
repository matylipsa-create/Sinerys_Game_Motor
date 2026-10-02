export interface StateDefinition<TContext> {
  onEnter?(context: TContext): void;
  onUpdate?(context: TContext, deltaMs: number): void;
  onExit?(context: TContext): void;
}

export class StateMachine<TContext> {
  private states = new Map<string, StateDefinition<TContext>>();
  private currentStateId: string | null = null;
  private readonly context: TContext;

  constructor(context: TContext) {
    this.context = context;
  }

  addState(stateId: string, state: StateDefinition<TContext>): void {
    if (!stateId.trim() || this.states.has(stateId)) {
      throw new Error(`State id is empty or already registered: ${stateId}`);
    }
    this.states.set(stateId, state);
  }

  changeState(stateId: string): void {
    const nextState = this.states.get(stateId);
    if (!nextState) throw new Error(`Unknown state: ${stateId}`);
    if (this.currentStateId === stateId) return;

    const previousId = this.currentStateId;
    const previousState = previousId ? this.states.get(previousId) : undefined;
    previousState?.onExit?.(this.context);
    this.currentStateId = stateId;
    try {
      nextState.onEnter?.(this.context);
    } catch (error) {
      this.currentStateId = previousId;
      previousState?.onEnter?.(this.context);
      throw error;
    }
  }

  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('State update delta must be finite and non-negative.');
    }
    if (this.currentStateId === null) return;
    this.states.get(this.currentStateId)?.onUpdate?.(this.context, deltaMs);
  }

  getCurrentState(): string | null {
    return this.currentStateId;
  }
}