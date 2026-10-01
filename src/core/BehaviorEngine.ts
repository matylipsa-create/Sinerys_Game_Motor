export class BehaviorDNA {
  public aggression = 0.5;
  public paranoia = 0.3;
  public mutationResistance = 0.5;
  public tacticalLoyalty = 0.7;
  public riskTolerance = 0.5;
  public environmentalBiases: Map<string, number> = new Map();

  clone(): BehaviorDNA {
    const cloned = new BehaviorDNA();
    cloned.aggression = this.aggression;
    cloned.paranoia = this.paranoia;
    cloned.mutationResistance = this.mutationResistance;
    cloned.tacticalLoyalty = this.tacticalLoyalty;
    cloned.riskTolerance = this.riskTolerance;
    cloned.environmentalBiases = new Map(this.environmentalBiases);
    return cloned;
  }
}

export interface WorldPerceptionContext {
  healthPercentage: number;
  nearbyEnemyCount: number;
  threatLevel: number;
  multiversalEntropy: number;
}

export enum TacticalIntent {
  Idle = 'IDLE',
  AdvanceAndAttack = 'ADVANCE_AND_ATTACK',
  TakeCover = 'TAKE_COVER',
  Flank = 'FLANK',
  FleeOrRetreat = 'FLEE_OR_RETREAT',
  MutateOrBerserk = 'MUTATE_OR_BERSERK',
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export class BehaviorEngineProcessor {
  public static evaluateIntent(dna: BehaviorDNA, context: WorldPerceptionContext): TacticalIntent {
    const effectiveAggression = clampUnit(dna.aggression + context.multiversalEntropy * 0.2);
    const effectiveParanoia = clampUnit(dna.paranoia + context.threatLevel * 0.3);

    if (context.healthPercentage < 0.15 && dna.mutationResistance < 0.4 && context.multiversalEntropy > 0.6) {
      return TacticalIntent.MutateOrBerserk;
    }
    if (context.healthPercentage < 0.25 && effectiveParanoia > dna.riskTolerance) {
      return TacticalIntent.FleeOrRetreat;
    }
    if (effectiveAggression > 0.7 && context.nearbyEnemyCount <= 2) {
      return TacticalIntent.AdvanceAndAttack;
    }
    if (effectiveParanoia > 0.6 || context.threatLevel > 0.8) {
      return TacticalIntent.TakeCover;
    }
    if (effectiveAggression >= 0.4 && effectiveAggression <= 0.7) {
      return TacticalIntent.Flank;
    }
    return TacticalIntent.Idle;
  }

  public static mutateDNA(dna: BehaviorDNA, mutationRate: number, random: () => number = Math.random): void {
    if (!Number.isFinite(mutationRate) || mutationRate < 0) {
      throw new RangeError('Mutation rate must be a finite non-negative number.');
    }

    dna.aggression = clampUnit(dna.aggression + (this.sample(random) * 2 - 1) * mutationRate);
    dna.paranoia = clampUnit(dna.paranoia + (this.sample(random) * 2 - 1) * mutationRate);
    dna.mutationResistance = clampUnit(dna.mutationResistance + (this.sample(random) * 2 - 1) * mutationRate);
  }

  private static sample(random: () => number): number {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError('Random source must return a finite value in [0, 1).');
    }
    return value;
  }
}