export type MiniBossType = 'alien_stalker' | 'alien_explorer' | 'mech_hunter' | 'flying_drone';

export interface MiniBossProfile {
  id: string;
  type: MiniBossType;
  health: number;
  maxHealth: number;
  aggression: number;
  speed: number;
  behaviorState: 'stalking' | 'ambushing' | 'evading' | 'berserk';
}

export class MiniBossAdaptiveController {
  public static evaluateBehavior(boss: MiniBossProfile, playerCount: number, playerHealthAvg: number): void {
    if (playerCount > 1) boss.aggression = Math.min(1, boss.aggression + 0.15);

    if (playerHealthAvg < 0.3) {
      if (boss.behaviorState !== 'berserk') boss.speed *= 1.25;
      boss.behaviorState = 'berserk';
    } else if (boss.maxHealth > 0 && boss.health / boss.maxHealth < 0.5) {
      boss.behaviorState = 'evading';
    } else {
      boss.behaviorState = 'stalking';
    }
  }
}