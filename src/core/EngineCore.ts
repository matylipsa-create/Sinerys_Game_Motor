export type SimulationMode = 'ACTIVE' | 'WAIT' | 'PAUSED' | 'CUTSCENE';

export interface ISimulationClock {
  getMode(): SimulationMode;
  getSimulationTime(): number;
  setCooperativeCombat(active: boolean): void;
  setMode(mode: SimulationMode): void;
  advance(deltaMs: number): number;
}

export interface EngineEvent<T = unknown> {
  type: string;
  payload: T;
  sequence: number;
}

export interface IMutationAction<TState> {
  readonly type: string;
  apply(draft: TState): void;
}

export interface IEngineContext<TState> {
  readonly time: ISimulationClock;
  getState(): TState;
  applyMutation(action: IMutationAction<TState>): TState;
  on<T = unknown>(type: string, handler: (event: EngineEvent<T>) => void): () => void;
  emit<T>(type: string, payload: T): EngineEvent<T>;
}

export interface IEngineSystem<TState = unknown> {
  readonly id: string;
  initialize?(engine: IEngineContext<TState>): void | Promise<void>;
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

// TCR v2 sections 13-19: contracts only; networking, snapshots, loot, equipment,
// progression, adaptive HUD extensions, and audio are intentionally not implemented.
export interface IP2PNetworkSystem {}
export interface ISnapshotProtocol {}
export interface ILootSystem {}
export interface IEquipmentSystem {}
export interface IPlayerProgressionSystem {}
export interface IAdaptiveHudSystem {}
export interface IAudioSystem {}

// TCR v2 sections 20-29 remain architecture notes only: complex bosses, shadows,
// anti-cheat, advanced recovery/telemetry, accessibility, automated tests, replay,
// asset pipeline, and final Sentra Core Gaming integration.