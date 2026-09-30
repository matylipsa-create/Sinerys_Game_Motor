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

export class GameEngineCore {
  private readonly entities = new Map<string, GameEntity>();
  private readonly tickRate = 60;

  constructor() {
    console.log('[Conquer Engine] Core initialized.');
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