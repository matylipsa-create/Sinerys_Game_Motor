export type CrisisSeverity = 'low' | 'medium' | 'critical';

export interface StrategicChoice {
  id: string;
  label: string;
  resourceCost: Record<string, number>;
  moralImpact: number;
  securityImpact: number;
  outcomeDescription: string;
}

export interface ParadoxCrisisEvent {
  id: string;
  title: string;
  description: string;
  severity: CrisisSeverity;
  affectedSector: string;
  choices: StrategicChoice[];
  timestamp: number;
}

export interface StrategicGlobalState {
  refugeMorale: number;
  hiveTension: number;
  resourceStockpiles: Record<string, number>;
}

export interface CrisisResolution {
  success: boolean;
  message: string;
}

const INITIAL_STATE: StrategicGlobalState = {
  refugeMorale: 75,
  hiveTension: 30,
  resourceStockpiles: {
    biomass: 150,
    alloy: 80,
    sporeSerum: 10,
  },
};

function cloneChoice(choice: StrategicChoice): StrategicChoice {
  return { ...choice, resourceCost: { ...choice.resourceCost } };
}

function cloneCrisis(crisis: ParadoxCrisisEvent): ParadoxCrisisEvent {
  return { ...crisis, choices: crisis.choices.map(cloneChoice) };
}

export class StrategicParadoxDirector {
  private readonly activeCrises = new Map<string, ParadoxCrisisEvent>();
  private readonly globalStats: StrategicGlobalState = {
    ...INITIAL_STATE,
    resourceStockpiles: { ...INITIAL_STATE.resourceStockpiles },
  };
  private nextCrisisId = 0;

  constructor() {
    console.log('[Paradox Director] Initialized strategic event engine.');
  }

  triggerSystemicCrisis(sector: string): ParadoxCrisisEvent {
    const affectedSector = sector.trim();
    if (!affectedSector) throw new Error('A crisis requires an affected sector.');

    const timestamp = Date.now();
    const crisisId = `crisis-${timestamp}-${this.nextCrisisId++}`;
    const crisis: ParadoxCrisisEvent = {
      id: crisisId,
      title: `Falla Estructural en Sector ${affectedSector}`,
      description: `La presión de la colmena fúngica ha comprometido los sellos del sector ${affectedSector}. Los recursos de purificación están al límite y las facciones locales exigen una respuesta inmediata.`,
      severity: 'critical',
      affectedSector,
      timestamp,
      choices: [
        {
          id: 'purge_zone',
          label: 'Purga Química Total (Quemar biomasa)',
          resourceCost: { biomass: 40, sporeSerum: 2 },
          moralImpact: -5,
          securityImpact: 15,
          outcomeDescription: 'El sector se estabiliza, pero el humo tóxico y la pérdida de suministros reducen la moral del refugio.',
        },
        {
          id: 'fortify_and_pray',
          label: 'Desviar energía del Radar P2P para escudos',
          resourceCost: { alloy: 25 },
          moralImpact: 5,
          securityImpact: 5,
          outcomeDescription: 'Las defensas aguantan temporalmente, pero el radar comunitario queda ciego por 3 horas.',
        },
        {
          id: 'evacuate_salvage',
          label: 'Orden de evacuación y rescate de emergencia',
          resourceCost: { biomass: 10, alloy: 10 },
          moralImpact: 12,
          securityImpact: -10,
          outcomeDescription: 'Se salvan vidas y sube la lealtad, pero la colmena gana terreno libre en el sector.',
        },
      ],
    };

    this.activeCrises.set(crisisId, crisis);
    return cloneCrisis(crisis);
  }

  resolveCrisis(crisisId: string, choiceId: string): CrisisResolution {
    const crisis = this.activeCrises.get(crisisId);
    if (!crisis) return { success: false, message: 'Crisis no encontrada.' };

    const choice = crisis.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) return { success: false, message: 'Elección inválida.' };

    for (const [resource, cost] of Object.entries(choice.resourceCost)) {
      const available = this.globalStats.resourceStockpiles[resource] ?? 0;
      if (!Number.isFinite(cost) || cost < 0) {
        return { success: false, message: `Coste inválido para el recurso ${resource}.` };
      }
      if (available < cost) {
        return { success: false, message: `Recursos insuficientes: faltan unidades de ${resource}.` };
      }
    }

    for (const [resource, cost] of Object.entries(choice.resourceCost)) {
      this.globalStats.resourceStockpiles[resource] -= cost;
    }

    this.globalStats.refugeMorale = this.clampStat(this.globalStats.refugeMorale + choice.moralImpact);
    this.globalStats.hiveTension = this.clampStat(this.globalStats.hiveTension - choice.securityImpact / 2);
    this.activeCrises.delete(crisisId);

    console.log('[Paradox Director] Crisis resolved:', choice.outcomeDescription);
    return { success: true, message: choice.outcomeDescription };
  }

  getActiveCrises(): ParadoxCrisisEvent[] {
    return Array.from(this.activeCrises.values(), cloneCrisis);
  }

  getGlobalState(): StrategicGlobalState {
    return {
      ...this.globalStats,
      resourceStockpiles: { ...this.globalStats.resourceStockpiles },
    };
  }

  addResource(resource: string, amount: number): boolean {
    const key = resource.trim();
    if (!key || !Number.isInteger(amount) || amount <= 0) return false;

    this.globalStats.resourceStockpiles[key] = (this.globalStats.resourceStockpiles[key] ?? 0) + amount;
    return true;
  }

  private clampStat(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}