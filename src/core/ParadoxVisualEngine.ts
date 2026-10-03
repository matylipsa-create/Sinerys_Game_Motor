export type Playstyle = 'aggressive' | 'tactical' | 'passive';

export enum CameraMode {
  ISOMETRIC_TACTICAL = 'ISOMETRIC_TACTICAL',
  FIRST_PERSON_IMMERSIVE = 'FIRST_PERSON_IMMERSIVE',
  SIDE_SCROLLER_METROID = 'SIDE_SCROLLER_METROID',
}

export interface OrchestratorSnapshot {
  shelterVisitCount: number;
  currentRealityTier: number;
  currentPlaystyle: Playstyle;
  mutationSeed: number;
}

export interface ShaderProfile {
  aberrationStrength: number;
  spectralShift: number;
  thermalGlow: number;
  scanlineIntensity: number;
  intensityLabel: string;
}

export function createInitialOrchestratorSnapshot(): OrchestratorSnapshot {
  return {
    shelterVisitCount: 0,
    currentRealityTier: 0,
    currentPlaystyle: 'tactical',
    mutationSeed: 1.618,
  };
}

/**
 * Stateless Paradox rules. Session values are owned by GameEngineCore and
 * supplied to each operation.
 */
export class OrchestratorVisualEngine {
  registerShelterVisit(snapshot: OrchestratorSnapshot): OrchestratorSnapshot {
    const nextSnapshot = { ...snapshot, shelterVisitCount: snapshot.shelterVisitCount + 1 };
    return nextSnapshot.shelterVisitCount % 4 === 0
      ? this.triggerSpatialMutation(nextSnapshot)
      : nextSnapshot;
  }

  triggerSpatialMutation(snapshot: OrchestratorSnapshot): OrchestratorSnapshot {
    return {
      ...snapshot,
      currentRealityTier: snapshot.currentRealityTier + 1,
      mutationSeed: Number((snapshot.mutationSeed * 1.618).toFixed(4)),
    };
  }

  updatePlayerPerception(
    snapshot: OrchestratorSnapshot,
    weaponDna: string,
    playstyle: Playstyle,
  ): OrchestratorSnapshot {
    let currentPlaystyle = playstyle;
    const normalized = (weaponDna ?? 'spectral_rifle').toLowerCase();
    if (normalized.includes('aggressive') || normalized.includes('rifle')) {
      currentPlaystyle = 'aggressive';
    }
    return { ...snapshot, currentPlaystyle };
  }
}

export class CameraDirector {
  cycleCameraMode(currentMode: CameraMode): CameraMode {
    switch (currentMode) {
      case CameraMode.ISOMETRIC_TACTICAL:
        return CameraMode.FIRST_PERSON_IMMERSIVE;
      case CameraMode.FIRST_PERSON_IMMERSIVE:
        return CameraMode.SIDE_SCROLLER_METROID;
      case CameraMode.SIDE_SCROLLER_METROID:
      default:
        return CameraMode.ISOMETRIC_TACTICAL;
    }
  }

  getModeLabel(mode: CameraMode): string {
    switch (mode) {
      case CameraMode.FIRST_PERSON_IMMERSIVE:
        return 'First-Person Immersive';
      case CameraMode.SIDE_SCROLLER_METROID:
        return 'Side-Scroller Metroid';
      case CameraMode.ISOMETRIC_TACTICAL:
      default:
        return 'Isometric Tactical';
    }
  }
}

export class MantisSpectrumProfile {
  static fromState(playstyle: Playstyle, realityTier: number): ShaderProfile {
    const playstyleMap: Record<Playstyle, { aberration: number; shift: number; glow: number; scanline: number }> = {
      aggressive: { aberration: 0.018, shift: 4.2, glow: 1.45, scanline: 0.42 },
      tactical: { aberration: 0.012, shift: 3.18, glow: 1.2, scanline: 0.35 },
      passive: { aberration: 0.009, shift: 2.5, glow: 0.95, scanline: 0.22 },
    };

    const values = playstyleMap[playstyle];
    const tierInfluence = realityTier * 0.08;

    return {
      aberrationStrength: Number((values.aberration + tierInfluence).toFixed(4)),
      spectralShift: Number((values.shift + tierInfluence * 2.1).toFixed(3)),
      thermalGlow: Number((values.glow + realityTier * 0.12).toFixed(3)),
      scanlineIntensity: Number((values.scanline + realityTier * 0.04).toFixed(3)),
      intensityLabel: realityTier >= 3 ? 'Critical spectral bloom' : playstyle === 'aggressive' ? 'High-threat perception' : playstyle === 'passive' ? 'Low-noise surveillance' : 'Adaptive tactical field',
    };
  }
}
