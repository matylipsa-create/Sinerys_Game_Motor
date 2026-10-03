export interface RealityPhysicalModifiers {
  sporeMutationRate: number;
  grinderEfficiency: number;
  entropyRate: number;
}

export interface ParallelReality {
  realityId: string;
  universeName: string;
  filamentResonance: number;
  physicalModifiers: RealityPhysicalModifiers;
  anomalyDescription: string;
}

function cloneReality(reality: ParallelReality): ParallelReality {
  return { ...reality, physicalModifiers: { ...reality.physicalModifiers } };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createInitialReality(): ParallelReality {
  return {
    realityId: 'prime-00',
    universeName: 'Universo Observable Base (Red Cósmica Original)',
    filamentResonance: 50,
    physicalModifiers: {
      sporeMutationRate: 1,
      grinderEfficiency: 1,
      entropyRate: 1,
    },
    anomalyDescription: 'Leyes físicas estables dentro del borde observable.',
  };
}

/**
 * Stateless reality-generation rules. ConquerOrchestrator owns the active reality
 * and its history.
 */
export class MultiversalDriftManager {
  constructor(private readonly random: () => number = Math.random) {}

  breachObservableEdge(
    targetDimensionName: string,
    currentReality: ParallelReality,
    nextRealityId: number,
  ): { currentReality: ParallelReality; previousReality: ParallelReality } {
    const universeName = targetDimensionName.trim();
    if (!universeName) throw new Error('A destination dimension name is required.');
    if (!Number.isInteger(nextRealityId) || nextRealityId < 0) {
      throw new Error('Reality sequence must be a non-negative integer.');
    }

    const newReality: ParallelReality = {
      realityId: `reality-${nextRealityId.toString(36)}`,
      universeName,
      filamentResonance: Math.floor(this.sample() * 100),
      physicalModifiers: {
        sporeMutationRate: roundToTwoDecimals(this.sample() * 2.5 + 0.5),
        grinderEfficiency: roundToTwoDecimals(this.sample() * 1.8 + 0.4),
        entropyRate: roundToTwoDecimals(this.sample() * 2 + 0.8),
      },
      anomalyDescription: 'Fluctuación cuántica extrema más allá del filamento cósmico principal. Las leyes de la materia se desestabilizan.',
    };

    return {
      currentReality: cloneReality(newReality),
      previousReality: cloneReality(currentReality),
    };
  }

  private sample(): number {
    const value = this.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('Random source must return a finite value in [0, 1).');
    }
    return value;
  }
}