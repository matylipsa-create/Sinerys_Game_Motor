import { StrategicParadoxDirector } from './StrategicParadoxDirector';
import {
  createInitialReality,
  MultiversalDriftManager,
  type ParallelReality,
} from './MultiversalDriftManager';
import { SentraBlueprintGraph } from './SentraBlueprintGraph';
import {
  CameraDirector,
  CameraMode,
  createInitialOrchestratorSnapshot,
  OrchestratorVisualEngine,
  type OrchestratorSnapshot,
} from './ParadoxVisualEngine';
import {
  createInitialStrategicState,
  type CrisisResolution,
  type ParadoxCrisisEvent,
  type StrategicGlobalState,
} from './StrategicParadoxDirector';

export interface GameEntity {
  id: string;
  type: string;
  x: number;
  y: number;
  status: Record<string, number>;
}

export interface GrinderResult {
  reward: string;
  quality: number;
}

export interface GameEngineEvent {
  type: string;
  data: unknown;
  source: string;
  timestamp: number;
}

export interface GameSessionState {
  entities: GameEntity[];
  strategicState: StrategicGlobalState;
  activeCrises: ParadoxCrisisEvent[];
  nextCrisisId: number;
  currentReality: ParallelReality;
  realityHistory: ParallelReality[];
  nextRealityId: number;
  paradox: OrchestratorSnapshot;
  cameraMode: CameraMode;
}

type GameEngineEventListener = (event: GameEngineEvent) => void;

class GameEngineEventBus {
  private readonly listeners = new Set<GameEngineEventListener>();

  publish(type: string, data: unknown, source: string): void {
    const event = { type, data, source, timestamp: Date.now() };
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: GameEngineEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * Sole owner of the in-memory Conquer and Paradox game-session state.
 * Feature modules provide rules; session mutations are committed here.
 */
export class GameEngineCore {
  public readonly eventBus = new GameEngineEventBus();
  public readonly paradoxDirector = new StrategicParadoxDirector();
  public readonly multiversalManager = new MultiversalDriftManager();
  public readonly visualEngine = new OrchestratorVisualEngine();
  public readonly cameraDirector = new CameraDirector();
  public readonly mainGraph = new SentraBlueprintGraph('main-survival-flow');
  private state: GameSessionState = {
    entities: [],
    strategicState: createInitialStrategicState(),
    activeCrises: [],
    nextCrisisId: 0,
    currentReality: createInitialReality(),
    realityHistory: [],
    nextRealityId: 0,
    paradox: createInitialOrchestratorSnapshot(),
    cameraMode: CameraMode.ISOMETRIC_TACTICAL,
  };
  private readonly tickRate = 60;
  private isRunning = false;

  constructor() {
    console.log('[GameEngineCore] Sentra Core fully initialized and integrated.');
  }

  getState(): GameSessionState {
    return structuredClone(this.state);
  }

  registerEntity(entity: GameEntity): void {
    if (!entity.id.trim()) throw new Error('Entity id cannot be empty.');
    this.applyMutation((draft) => {
      const index = draft.entities.findIndex((candidate) => candidate.id === entity.id);
      const detachedEntity = { ...entity, status: { ...entity.status } };
      if (index === -1) draft.entities.push(detachedEntity);
      else draft.entities[index] = detachedEntity;
    });
  }

  updateEntityState(id: string, updates: Partial<Omit<GameEntity, 'id'>>): void {
    this.applyMutation((draft) => {
      const entity = draft.entities.find((candidate) => candidate.id === id);
      if (!entity) return;

      Object.assign(entity, updates, {
        id: entity.id,
        status: { ...entity.status, ...updates.status },
      });
    });
  }

  triggerSystemicCrisis(sector: string): ParadoxCrisisEvent {
    const sequence = this.state.nextCrisisId;
    const crisis = this.paradoxDirector.triggerSystemicCrisis(sector, sequence);
    this.applyMutation((draft) => {
      draft.nextCrisisId += 1;
      draft.activeCrises.push(crisis);
    });
    return structuredClone(crisis);
  }

  getOrCreateActiveCrisis(sector: string): ParadoxCrisisEvent {
    const activeCrisis = this.state.activeCrises[0];
    return activeCrisis ? structuredClone(activeCrisis) : this.triggerSystemicCrisis(sector);
  }

  discardCrisis(crisisId: string): boolean {
    if (!this.state.activeCrises.some((crisis) => crisis.id === crisisId)) return false;
    this.applyMutation((draft) => {
      draft.activeCrises = draft.activeCrises.filter((crisis) => crisis.id !== crisisId);
    });
    return true;
  }

  resolveCrisis(crisisId: string, choiceId: string): CrisisResolution {
    const result = this.paradoxDirector.resolveCrisis(
      this.state.activeCrises.find((crisis) => crisis.id === crisisId),
      this.state.strategicState,
      choiceId,
    );
    if (result.resolution.success) {
      this.applyMutation((draft) => {
        draft.strategicState = result.globalState;
        draft.activeCrises = draft.activeCrises.filter((crisis) => crisis.id !== crisisId);
      });
    }
    return result.resolution;
  }

  registerShelterVisit(): OrchestratorSnapshot {
    this.applyMutation((draft) => {
      draft.paradox = this.visualEngine.registerShelterVisit(draft.paradox);
    });
    return this.getState().paradox;
  }

  updatePlayerPerception(weaponDna: string, playstyle: OrchestratorSnapshot['currentPlaystyle']): OrchestratorSnapshot {
    this.applyMutation((draft) => {
      draft.paradox = this.visualEngine.updatePlayerPerception(draft.paradox, weaponDna, playstyle);
    });
    return this.getState().paradox;
  }

  cycleCameraMode(): CameraMode {
    this.applyMutation((draft) => {
      draft.cameraMode = this.cameraDirector.cycleCameraMode(draft.cameraMode);
    });
    return this.state.cameraMode;
  }

  breachObservableEdge(targetDimensionName: string): ParallelReality {
    const result = this.multiversalManager.breachObservableEdge(
      targetDimensionName,
      this.state.currentReality,
      this.state.nextRealityId,
    );
    this.applyMutation((draft) => {
      draft.realityHistory.push(result.previousReality);
      draft.currentReality = result.currentReality;
      draft.nextRealityId += 1;
    });
    return structuredClone(result.currentReality);
  }

  private applyMutation(mutate: (draft: GameSessionState) => void): void {
    const draft = structuredClone(this.state);
    mutate(draft);
    this.state = draft;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.eventBus.publish('ENTITY_UPDATED', { status: 'ENGINE_STARTED' }, 'GameEngineCore');
    console.log('[GameEngineCore] Engine tick loop started.');
  }

  update(_deltaTime: number): void {
    if (!this.isRunning) return;
  }

  stop(): void {
    this.isRunning = false;
    console.log('[GameEngineCore] Engine stopped.');
  }

  processGrinder(inputItems: string[]): GrinderResult {
    const items = inputItems.map((item) => item.toLowerCase());
    const organicCount = items.filter((item) => item.includes('spore') || item.includes('tissue')).length;
    const techCount = items.filter((item) => item.includes('metal') || item.includes('circuit')).length;

    if (organicCount > techCount) {
      return { reward: 'Suero Estabilizador de Esporas', quality: Math.min(100, organicCount * 15) };
    }
    if (techCount > organicCount) {
      return { reward: 'Aleación Reforzada de Titanio', quality: Math.min(100, techCount * 20) };
    }
    return { reward: 'Biomasa Sintética Neutra', quality: 50 };
  }

  getTickRate(): number {
    return this.tickRate;
  }
}