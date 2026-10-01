export interface WorldStateResponse {
  activeWeather: string;
  resourceScarcity: number;
  spawnRateModifier: number;
}

export class LivingMemorySystem {
  private readonly persistentImpacts: Map<string, number> = new Map();

  public registerImpact(key: string, value: number): void {
    const current = this.persistentImpacts.get(key) ?? 0;
    this.persistentImpacts.set(key, current + value);
  }

  public computeWorldResponse(baseEntropy: number): WorldStateResponse {
    const totalImpact = Array.from(this.persistentImpacts.values()).reduce((sum, value) => sum + value, 0);
    return {
      activeWeather: baseEntropy > 0.7 ? 'Tormenta de Esporas' : 'Atmósfera Estable',
      resourceScarcity: Math.min(Math.max(0.2 + totalImpact * 0.05, 0), 1),
      spawnRateModifier: 1 + baseEntropy * 0.5,
    };
  }
}