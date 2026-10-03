import type { EngineEvent } from './EngineCore.ts';
import { EngineOrchestrator } from './EngineOrchestrator.ts';
import type { PlayerIntent } from './game/PlayerIntent.ts';
import {
  createInitialParadoxSession,
  type ParadoxSessionState,
} from './ParadoxState.ts';
import {
  CameraDirector,
  CameraMode,
  createInitialOrchestratorSnapshot,
  OrchestratorVisualEngine,
  type OrchestratorSnapshot,
} from './ParadoxVisualEngine.ts';
import {
  createInitialReality,
  MultiversalDriftManager,
  type ParallelReality,
} from './MultiversalDriftManager.ts';
import {
  createInitialStrategicState,
  StrategicParadoxDirector,
  type CrisisResolution,
  type ParadoxCrisisEvent,
  type StrategicGlobalState,
} from './StrategicParadoxDirector.ts';

export { EngineOrchestrator } from './EngineOrchestrator.ts';
export { TimeManager } from './TimeManager.ts';
export type { SimulationMode } from './EngineCore.ts';
export type WorldLocation = 'HUB' | 'DUNGEON';

export interface GridPoint {
  x: number;
  y: number;
}

export interface DungeonFloor {
  floor: number;
  block: number;
  bossFloor: boolean;
  width: number;
  height: number;
  walls: boolean[][];
  entrance: GridPoint;
  exit: GridPoint;
}

export interface GameState {
  playerState: {
    health: number;
    maxHealth: number;
    level: number;
    experience: number;
  };
  dungeonState: {
    seed: string;
    currentFloor: number;
    floors: DungeonFloor[];
  };
  combatState: {
    active: boolean;
    encounterId: string | null;
  };
  enemyState: Record<string, { health: number; behaviorId: string }>;
  partyState: {
    cooperative: boolean;
    playerIds: string[];
  };
  lootState: Array<{ id: string; itemId: string; floor: number }>;
  worldState: {
    location: WorldLocation;
    block: number;
  };
  arsState: {
    lastIntent: PlayerIntent | null;
    passiveTimeMs: number;
    coreSkillUses: number;
    itemUses: number;
    itemAbuses: number;
    combatActions: number;
    tension: number;
  };
  paradoxSession: ParadoxSessionState;
  paradoxVisual: OrchestratorSnapshot;
  cameraMode: CameraMode;
  strategicState: StrategicGlobalState;
  activeCrises: ParadoxCrisisEvent[];
  nextCrisisId: number;
  currentReality: ParallelReality;
  realityHistory: ParallelReality[];
  nextRealityId: number;
  eventState: EngineEvent[];
}

export type GameEvent<T = unknown> = EngineEvent<T>;

const FLOOR_COUNT = 15;
const BLOCK_SIZE = 3;
const MAP_SIZE = 10;
const MAX_STORED_ENGINE_EVENTS = 256;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function createFloor(seed: string, floor: number): DungeonFloor {
  const random = createRandom(hashSeed(`${seed}:${floor}`));
  const walls = Array.from({ length: MAP_SIZE }, (_, y) =>
    Array.from({ length: MAP_SIZE }, (_, x) =>
      x > 0 && y > 0 && x < MAP_SIZE - 1 && y < MAP_SIZE - 1 && random() < 0.24,
    ),
  );
  const entrance = { x: 0, y: 0 };
  const exit = { x: MAP_SIZE - 1, y: MAP_SIZE - 1 };

  // Keep one guaranteed route so every generated floor remains traversable.
  for (let x = entrance.x; x <= exit.x; x += 1) walls[entrance.y][x] = false;
  for (let y = entrance.y; y <= exit.y; y += 1) walls[y][exit.x] = false;

  return {
    floor,
    block: Math.floor((floor - 1) / BLOCK_SIZE) + 1,
    bossFloor: floor % BLOCK_SIZE === 0,
    width: MAP_SIZE,
    height: MAP_SIZE,
    walls,
    entrance,
    exit,
  };
}

export function generateDungeon(seed: string): DungeonFloor[] {
  if (!seed.trim()) throw new Error('Dungeon seed must not be empty.');
  return Array.from({ length: FLOOR_COUNT }, (_, index) => createFloor(seed, index + 1));
}

function validateGameState(state: GameState): void {
  if (!state.paradoxSession
    || !state.paradoxSession.state
    || !state.paradoxSession.state.survival
    || !Array.isArray(state.paradoxSession.state.mutagensOwned)
    || !Array.isArray(state.paradoxSession.events)
    || !Array.isArray(state.paradoxSession.crises)) {
    throw new Error('Paradox session state has an invalid structure.');
  }
  const floor = state.dungeonState.currentFloor;
  if (!Number.isInteger(floor) || floor < 1 || floor > FLOOR_COUNT) {
    throw new Error('Current dungeon floor must be between 1 and 15.');
  }
  if (state.dungeonState.floors.length !== FLOOR_COUNT) {
    throw new Error('Dungeon state must contain exactly 15 floors.');
  }
  if (!Number.isFinite(state.arsState.tension)
    || state.arsState.tension < 0
    || state.arsState.tension > 100) {
    throw new Error('ARS tension must be between 0 and 100.');
  }
  if (!Number.isFinite(state.playerState.health)
    || !Number.isFinite(state.playerState.maxHealth)
    || state.playerState.maxHealth <= 0
    || state.playerState.health < 0
    || state.playerState.health > state.playerState.maxHealth) {
    throw new Error('Player health must be within its maximum health.');
  }
  if (!Number.isFinite(state.paradoxSession.state.mobScore)
    || state.paradoxSession.state.mobScore < 0
    || !Number.isInteger(state.paradoxSession.state.livingAmmoCount)
    || state.paradoxSession.state.livingAmmoCount < 0
    || !Number.isInteger(state.paradoxSession.state.shelterVisits)
    || state.paradoxSession.state.shelterVisits < 0
    || !Number.isInteger(state.paradoxSession.state.realityTier)
    || state.paradoxSession.state.realityTier < 0
    || !Number.isInteger(state.paradoxSession.state.survival.mutagenCharges)
    || state.paradoxSession.state.survival.mutagenCharges < 0
    || !Number.isInteger(state.paradoxSession.state.survival.ticksSurvived)
    || state.paradoxSession.state.survival.ticksSurvived < 0
    || !Number.isFinite(state.paradoxSession.state.survival.oxygen)
    || state.paradoxSession.state.survival.oxygen < 0
    || state.paradoxSession.state.survival.oxygen > 100
    || !Number.isFinite(state.paradoxSession.state.survival.radiation)
    || state.paradoxSession.state.survival.radiation < 0
    || state.paradoxSession.state.survival.radiation > 100
    || !['ACTIVE', 'FAILED'].includes(state.paradoxSession.state.survival.status)
    || !['ISOMETRIC', 'FIRST_PERSON', 'SIDE_SCROLLER'].includes(state.paradoxSession.state.activeCameraMode)
    || typeof state.paradoxSession.state.mantisFiltersActive !== 'boolean'
    || !['aggressive', 'tactical', 'passive'].includes(state.paradoxVisual.currentPlaystyle)
    || !Number.isInteger(state.paradoxVisual.shelterVisitCount)
    || !Number.isInteger(state.paradoxVisual.currentRealityTier)
    || !Number.isFinite(state.paradoxVisual.mutationSeed)) {
    throw new Error('Paradox survival state is outside its valid range.');
  }
  const expectedBlock = Math.floor((floor - 1) / BLOCK_SIZE) + 1;
  if (state.worldState.location === 'DUNGEON' && state.worldState.block !== expectedBlock) {
    throw new Error('World block must match the current dungeon floor.');
  }
}

export class ConquerOrchestrator extends EngineOrchestrator<GameState> {
  private readonly visualEngine = new OrchestratorVisualEngine();
  private readonly cameraDirector = new CameraDirector();
  private readonly paradoxDirector = new StrategicParadoxDirector();
  private readonly multiversalManager = new MultiversalDriftManager();

  constructor(seed: string) {
    const floors = generateDungeon(seed);
    const paradoxSession = createInitialParadoxSession();
    const initialParadoxVisual = createInitialOrchestratorSnapshot();
    initialParadoxVisual.shelterVisitCount = paradoxSession.state.shelterVisits;
    initialParadoxVisual.currentRealityTier = paradoxSession.state.realityTier;
    super({
      playerState: { health: 100, maxHealth: 100, level: 1, experience: 0 },
      dungeonState: { seed, currentFloor: 1, floors },
      combatState: { active: false, encounterId: null },
      enemyState: {},
      partyState: { cooperative: false, playerIds: [] },
      lootState: [],
      worldState: { location: 'HUB', block: 1 },
      arsState: {
        lastIntent: null,
        passiveTimeMs: 0,
        coreSkillUses: 0,
        itemUses: 0,
        itemAbuses: 0,
        combatActions: 0,
        tension: 0,
      },
      paradoxSession,
      paradoxVisual: initialParadoxVisual,
      cameraMode: CameraMode.ISOMETRIC_TACTICAL,
      strategicState: createInitialStrategicState(),
      activeCrises: [],
      nextCrisisId: 0,
      currentReality: createInitialReality(),
      realityHistory: [],
      nextRealityId: 0,
      eventState: [],
    }, {
      validateState: validateGameState,
      recordEvent: (draft, event) => {
        draft.eventState.push(event);
        if (draft.eventState.length > MAX_STORED_ENGINE_EVENTS) {
          draft.eventState.splice(0, draft.eventState.length - MAX_STORED_ENGINE_EVENTS);
        }
      },
    });
  }

  setCooperativeCombat(active: boolean): GameState {
    const state = this.applyMutation({
      type: 'party.cooperative-combat',
      apply: (draft) => {
        draft.partyState.cooperative = active;
        draft.combatState.active = active;
      },
    });
    this.time.setCooperativeCombat(active);
    return state;
  }

  registerShelterVisit(): OrchestratorSnapshot {
    this.applyMutation({
      type: 'paradox.visual.shelter-visit',
      apply: (draft) => {
        draft.paradoxVisual = this.visualEngine.registerShelterVisit(draft.paradoxVisual);
        draft.paradoxSession.state.shelterVisits = draft.paradoxVisual.shelterVisitCount;
        draft.paradoxSession.state.realityTier = draft.paradoxVisual.currentRealityTier;
      },
    });
    return this.getState().paradoxVisual;
  }

  updatePlayerPerception(
    weaponDna: string,
    playstyle: OrchestratorSnapshot['currentPlaystyle'],
  ): OrchestratorSnapshot {
    this.applyMutation({
      type: 'paradox.visual.perception',
      apply: (draft) => {
        draft.paradoxVisual = this.visualEngine.updatePlayerPerception(draft.paradoxVisual, weaponDna, playstyle);
      },
    });
    return this.getState().paradoxVisual;
  }

  cycleCameraMode(): CameraMode {
    this.applyMutation({
      type: 'paradox.visual.camera',
      apply: (draft) => {
        draft.cameraMode = this.cameraDirector.cycleCameraMode(draft.cameraMode);
      },
    });
    return this.getState().cameraMode;
  }

  triggerSystemicCrisis(sector: string): ParadoxCrisisEvent {
    const state = this.getState();
    const crisis = this.paradoxDirector.triggerSystemicCrisis(sector, state.nextCrisisId);
    this.applyMutation({
      type: 'strategic.crisis.trigger',
      apply: (draft) => {
        draft.nextCrisisId += 1;
        draft.activeCrises.push(crisis);
      },
    });
    return structuredClone(crisis);
  }

  getOrCreateActiveCrisis(sector: string): ParadoxCrisisEvent {
    const crisis = this.getState().activeCrises[0];
    return crisis ? structuredClone(crisis) : this.triggerSystemicCrisis(sector);
  }

  discardCrisis(crisisId: string): boolean {
    const state = this.getState();
    if (!state.activeCrises.some((crisis) => crisis.id === crisisId)) return false;
    this.applyMutation({
      type: 'strategic.crisis.discard',
      apply: (draft) => {
        draft.activeCrises = draft.activeCrises.filter((crisis) => crisis.id !== crisisId);
      },
    });
    return true;
  }

  resolveCrisis(crisisId: string, choiceId: string): CrisisResolution {
    const state = this.getState();
    const result = this.paradoxDirector.resolveCrisis(
      state.activeCrises.find((crisis) => crisis.id === crisisId),
      state.strategicState,
      choiceId,
    );
    if (result.resolution.success) {
      this.applyMutation({
        type: 'strategic.crisis.resolve',
        apply: (draft) => {
          draft.strategicState = result.globalState;
          draft.activeCrises = draft.activeCrises.filter((crisis) => crisis.id !== crisisId);
        },
      });
    }
    return result.resolution;
  }

  breachObservableEdge(targetDimensionName: string): ParallelReality {
    const state = this.getState();
    const result = this.multiversalManager.breachObservableEdge(
      targetDimensionName,
      state.currentReality,
      state.nextRealityId,
    );
    this.applyMutation({
      type: 'multiverse.observable-edge.breach',
      apply: (draft) => {
        draft.realityHistory.push(result.previousReality);
        draft.currentReality = result.currentReality;
        draft.nextRealityId += 1;
      },
    });
    return structuredClone(result.currentReality);
  }

  addResource(resource: string, amount: number): boolean {
    const nextState = this.paradoxDirector.addResource(this.getState().strategicState, resource, amount);
    if (!nextState) return false;
    this.applyMutation({
      type: 'strategic.resource.add',
      apply: (draft) => {
        draft.strategicState = nextState;
      },
    });
    return true;
  }
}