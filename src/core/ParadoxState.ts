import type { FactionCrisis } from './BehaviorDNAEngine';

export type CameraMode = 'ISOMETRIC' | 'FIRST_PERSON' | 'SIDE_SCROLLER';
export type SurvivalStatus = 'ACTIVE' | 'FAILED';

export interface SurvivalState {
  oxygen: number;
  radiation: number;
  mutagenCharges: number;
  ticksSurvived: number;
  status: SurvivalStatus;
}

export interface PlayerState {
  mobScore: number;
  livingAmmoCount: number;
  mutagensOwned: string[];
  shelterVisits: number;
  realityTier: number;
  activeCameraMode: CameraMode;
  mantisFiltersActive: boolean;
  survival: SurvivalState;
}

export interface TacticalEvent {
  id: number;
  type: 'FACTION' | 'CRISIS' | 'SYSTEM';
  message: string;
  timestamp: number;
}

export interface ParadoxSessionState {
  state: PlayerState;
  events: TacticalEvent[];
  crises: FactionCrisis[];
}

export function createInitialParadoxSession(): ParadoxSessionState {
  return {
    state: {
      mobScore: 1200,
      livingAmmoCount: 24,
      mutagensOwned: ['CHITIN_SLURRY_V1'],
      shelterVisits: 3,
      realityTier: 0,
      activeCameraMode: 'ISOMETRIC',
      mantisFiltersActive: false,
      survival: {
        oxygen: 100,
        radiation: 5,
        mutagenCharges: 3,
        ticksSurvived: 0,
        status: 'ACTIVE',
      },
    },
    events: [],
    crises: [],
  };
}
