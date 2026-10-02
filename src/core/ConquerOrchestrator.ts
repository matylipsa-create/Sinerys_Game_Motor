import type { EngineEvent } from './EngineCore.ts';
import { EngineOrchestrator } from './EngineOrchestrator.ts';
import type { PlayerIntent } from './game/PlayerIntent.ts';

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
  eventState: EngineEvent[];
}

export type GameEvent<T = unknown> = EngineEvent<T>;

const FLOOR_COUNT = 15;
const BLOCK_SIZE = 3;
const MAP_SIZE = 10;

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
  const expectedBlock = Math.floor((floor - 1) / BLOCK_SIZE) + 1;
  if (state.worldState.location === 'DUNGEON' && state.worldState.block !== expectedBlock) {
    throw new Error('World block must match the current dungeon floor.');
  }
}

export class ConquerOrchestrator extends EngineOrchestrator<GameState> {
  constructor(seed: string) {
    const floors = generateDungeon(seed);
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
      eventState: [],
    }, {
      validateState: validateGameState,
      recordEvent: (draft, event) => draft.eventState.push(event),
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
}