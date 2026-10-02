import type { ISimulationClock, SimulationMode } from './EngineCore.ts';

export class TimeManager implements ISimulationClock {
  private mode: SimulationMode = 'ACTIVE';
  private simulationTimeMs = 0;
  private cooperativeCombat = false;

  getMode(): SimulationMode {
    return this.mode;
  }

  getSimulationTime(): number {
    return this.simulationTimeMs;
  }

  setCooperativeCombat(active: boolean): void {
    this.cooperativeCombat = active;
    if (active) this.mode = 'ACTIVE';
  }

  setMode(mode: SimulationMode): void {
    if (this.cooperativeCombat && mode !== 'ACTIVE') {
      throw new Error('Cooperative combat requires shared ACTIVE time.');
    }
    this.mode = mode;
  }

  advance(deltaMs: number): number {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new Error('Simulation delta must be a finite non-negative number.');
    }
    if (this.mode === 'ACTIVE') {
      const nextTime = this.simulationTimeMs + deltaMs;
      if (!Number.isFinite(nextTime)) throw new Error('Simulation time exceeded its finite range.');
      this.simulationTimeMs = nextTime;
    }
    return this.simulationTimeMs;
  }
}