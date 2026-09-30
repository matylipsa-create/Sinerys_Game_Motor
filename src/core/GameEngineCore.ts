import { StrategicParadoxDirector } from './StrategicParadoxDirector';
import { MultiversalDriftManager } from './MultiversalDriftManager';
import { SentraBlueprintGraph } from './SentraBlueprintGraph';

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

export class GameEngineCore {
  public readonly eventBus = new GameEngineEventBus();
  public readonly paradoxDirector = new StrategicParadoxDirector();
  public readonly multiversalManager = new MultiversalDriftManager();
  public readonly mainGraph = new SentraBlueprintGraph('main-survival-flow');
  private readonly entities = new Map<string, GameEntity>();
  private readonly tickRate = 60;
  private isRunning = false;

  constructor() {
    console.log('[GameEngineCore] Sentra Core fully initialized and integrated.');
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

  registerEntity(entity: GameEntity): void {
    if (!entity.id.trim()) throw new Error('Entity id cannot be empty.');
    this.entities.set(entity.id, { ...entity, status: { ...entity.status } });
  }

  updateEntityState(id: string, updates: Partial<Omit<GameEntity, 'id'>>): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    this.entities.set(id, {
      ...entity,
      ...updates,
      id: entity.id,
      status: { ...entity.status, ...updates.status },
    });
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

  getEntities(): GameEntity[] {
    return Array.from(this.entities.values(), (entity) => ({ ...entity, status: { ...entity.status } }));
  }

  getTickRate(): number {
    return this.tickRate;
  }
}