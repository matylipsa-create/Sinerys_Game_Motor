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

export function createInitialStrategicState(): StrategicGlobalState {
  return {
    ...INITIAL_STATE,
    resourceStockpiles: { ...INITIAL_STATE.resourceStockpiles },
  };
}

function cloneChoice(choice: StrategicChoice): StrategicChoice {
  return { ...choice, resourceCost: { ...choice.resourceCost } };
}

function cloneCrisis(crisis: ParadoxCrisisEvent): ParadoxCrisisEvent {
  return { ...crisis, choices: crisis.choices.map(cloneChoice) };
}

/**
 * Stateless strategic rules. GameEngineCore owns the crisis and resource data.
 */
export class StrategicParadoxDirector {
  triggerSystemicCrisis(sector: string, sequence: number): ParadoxCrisisEvent {
    const affectedSector = sector.trim();
    if (!affectedSector) throw new Error('A crisis requires an affected sector.');
    if (!Number.isInteger(sequence) || sequence < 0) throw new Error('Crisis sequence must be a non-negative integer.');
    const sectorLabel = /^sector(?:\s|$)/i.test(affectedSector) ? affectedSector : `Sector ${affectedSector}`;

    const timestamp = Date.now();
    const crisisId = `crisis-${timestamp}-${sequence}`;
    const crisis: ParadoxCrisisEvent = {
      id: crisisId,
      title: `Falla Estructural en ${sectorLabel}`,
      description: `La presión de la colmena fúngica ha comprometido los sellos de ${sectorLabel}. Los recursos de purificación están al límite y las facciones locales exigen una respuesta inmediata.`,
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

    return cloneCrisis(crisis);
  }

  resolveCrisis(
    crisis: ParadoxCrisisEvent | undefined,
    globalState: StrategicGlobalState,
    choiceId: string,
  ): { resolution: CrisisResolution; globalState: StrategicGlobalState } {
    if (!crisis) return { resolution: { success: false, message: 'Crisis no encontrada.' }, globalState };
    const choice = crisis.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) return { resolution: { success: false, message: 'Elección inválida.' }, globalState };

    for (const [resource, cost] of Object.entries(choice.resourceCost)) {
      const available = globalState.resourceStockpiles[resource] ?? 0;
      if (!Number.isFinite(cost) || cost < 0) {
        return {
          resolution: { success: false, message: `Coste inválido para el recurso ${resource}.` },
          globalState,
        };
      }
      if (available < cost) {
        return {
          resolution: { success: false, message: `Recursos insuficientes: faltan unidades de ${resource}.` },
          globalState,
        };
      }
    }

    const nextGlobalState: StrategicGlobalState = {
      ...globalState,
      resourceStockpiles: { ...globalState.resourceStockpiles },
    };
    for (const [resource, cost] of Object.entries(choice.resourceCost)) {
      nextGlobalState.resourceStockpiles[resource] -= cost;
    }

    nextGlobalState.refugeMorale = this.clampStat(nextGlobalState.refugeMorale + choice.moralImpact);
    nextGlobalState.hiveTension = this.clampStat(nextGlobalState.hiveTension - choice.securityImpact / 2);

    console.log('[Paradox Director] Crisis resolved:', choice.outcomeDescription);
    return {
      resolution: { success: true, message: choice.outcomeDescription },
      globalState: nextGlobalState,
    };
  }

  addResource(globalState: StrategicGlobalState, resource: string, amount: number): StrategicGlobalState | null {
    const key = resource.trim();
    if (!key || !Number.isInteger(amount) || amount <= 0) return null;

    return {
      ...globalState,
      resourceStockpiles: {
        ...globalState.resourceStockpiles,
        [key]: (globalState.resourceStockpiles[key] ?? 0) + amount,
      },
    };
  }

  private clampStat(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}