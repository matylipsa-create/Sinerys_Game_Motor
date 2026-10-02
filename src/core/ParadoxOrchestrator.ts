import { BehaviorDNAEngine, type FactionCrisis } from './BehaviorDNAEngine';
import { bridge, type OrchestratorCommand } from './OrchestratorBridge';
import { ParadoxStorage } from './ParadoxStorage';

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

const CAMERA_MODES: CameraMode[] = ['ISOMETRIC', 'FIRST_PERSON', 'SIDE_SCROLLER'];
const INITIAL_STATE: PlayerState = {
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
};

export class ParadoxOrchestratorEngine {
  private state: PlayerState;
  private events: TacticalEvent[];
  private behaviorDNA: BehaviorDNAEngine;

  constructor() {
    const saved = ParadoxStorage.loadGameData();
    this.state = saved?.state ?? { ...INITIAL_STATE, mutagensOwned: [...INITIAL_STATE.mutagensOwned] };
    this.events = saved?.events ?? [];
    this.behaviorDNA = new BehaviorDNAEngine(saved?.crises ?? []);
  }

  private persist(): void {
    ParadoxStorage.saveGameData(this.state, this.events, this.behaviorDNA.getCrisisHistory());
  }

  private recordEvent(type: TacticalEvent['type'], message: string): void {
    this.events = [{ id: Date.now(), type, message, timestamp: Date.now() }, ...this.events].slice(0, 20);
    this.persist();
  }

  public registerMobKill(scoreGained: number): PlayerState {
    if (this.state.survival.status === 'FAILED' || !Number.isFinite(scoreGained) || scoreGained <= 0) return this.getState();
    this.state.mobScore += Math.floor(scoreGained);
    this.recordEvent('SYSTEM', `Mob eliminated. +${Math.floor(scoreGained)} mob score.`);
    return this.getState();
  }

  public visitShelter(): { mutated: boolean; state: PlayerState } {
    if (this.state.survival.status === 'FAILED') return { mutated: false, state: this.getState() };
    this.state.shelterVisits += 1;
    const mutated = this.state.shelterVisits % 4 === 0;
    if (mutated) this.state.realityTier += 1;
    this.recordEvent('SYSTEM', mutated
      ? `Spacetime mutation triggered. Reality tier ${this.state.realityTier}.`
      : `Shelter visit registered (${this.state.shelterVisits % 4}/4 to mutation).`);
    const crisis = this.behaviorDNA.evaluateCrisisTrigger(this.state.shelterVisits);
    if (crisis) {
      this.recordEvent('CRISIS', `${crisis.severity}: ${crisis.title}`);
      bridge.sendCommand({ type: 'TRIGGER_CRISIS', payload: { crisis } });
    }
    if (mutated) {
      const faction = this.behaviorDNA.evaluateFactionEvent();
      const mobBehaviorDNA = this.behaviorDNA.evolveMobsForTier(this.state.realityTier);
      this.recordEvent('FACTION', `${faction.faction}: ${faction.description}`);
      bridge.sendCommand({
        type: 'MUTATE_SPACETIME',
        payload: { realityTier: this.state.realityTier },
      });
      bridge.sendCommand({
        type: 'SPAWN_MOBS',
        payload: { realityTier: this.state.realityTier, mobBehaviorDNA },
      });
      bridge.sendCommand({
        type: 'UPDATE_PERCEPTION',
        payload: { shelterVisits: this.state.shelterVisits, faction },
      });
    } else {
      bridge.sendCommand({
        type: 'UPDATE_PERCEPTION',
        payload: { shelterVisits: this.state.shelterVisits, realityTier: this.state.realityTier },
      });
    }
    this.persist();
    return { mutated, state: this.getState() };
  }

  public purchaseLivingAmmo(cost: number): boolean {
    if (this.state.survival.status === 'FAILED' || !Number.isFinite(cost) || cost < 0 || this.state.mobScore < cost) return false;
    this.state.mobScore -= cost;
    this.state.livingAmmoCount += 10;
    this.recordEvent('SYSTEM', 'Living ammo acquired. +10 rounds.');
    return true;
  }

  public purchaseMutagen(mutagenId: string, cost: number): boolean {
    if (this.state.survival.status === 'FAILED' || !mutagenId.trim() || !Number.isFinite(cost) || cost < 0
      || this.state.mobScore < cost || this.state.mutagensOwned.includes(mutagenId)) return false;
    this.state.mobScore -= cost;
    this.state.mutagensOwned = [...this.state.mutagensOwned, mutagenId];
    this.recordEvent('SYSTEM', `Mutagen acquired: ${mutagenId}.`);
    return true;
  }

  public tickSurvival(): PlayerState {
    if (this.state.survival.status === 'FAILED') return this.getState();
    const survival = this.state.survival;
    survival.ticksSurvived += 1;
    survival.oxygen = Math.max(0, survival.oxygen - 1.5);
    survival.radiation = Math.min(100, survival.radiation + 0.8);
    bridge.sendCommand({
      type: 'UPDATE_PERCEPTION',
      payload: {
        survival: {
          oxygen: survival.oxygen,
          radiation: survival.radiation,
          mutagenCharges: survival.mutagenCharges,
          status: survival.status,
        },
      },
    });

    if (survival.oxygen <= 0 || survival.radiation >= 100) {
      survival.status = 'FAILED';
      this.recordEvent('CRISIS', survival.oxygen <= 0
        ? 'SUIT FAILURE: oxygen reserves depleted.'
        : 'SUIT FAILURE: radiation exposure exceeded safe limits.');
    } else if (survival.ticksSurvived % 6 === 0) {
      this.recordEvent('SYSTEM', `Suit check ${survival.ticksSurvived}: O2 ${Math.ceil(survival.oxygen)}%, RAD ${Math.ceil(survival.radiation)}%.`);
    } else {
      this.persist();
    }
    return this.getState();
  }

  public refillOxygen(cost = 90): boolean {
    if (this.state.survival.status === 'FAILED' || !Number.isFinite(cost) || cost < 0
      || this.state.mobScore < cost || this.state.survival.oxygen >= 100) return false;
    this.state.mobScore -= cost;
    this.state.survival.oxygen = Math.min(100, this.state.survival.oxygen + 30);
    this.recordEvent('SYSTEM', 'Suit oxygen reserve replenished by 30%.');
    return true;
  }

  public useMutagenCharge(): boolean {
    const survival = this.state.survival;
    if (survival.status === 'FAILED' || survival.mutagenCharges <= 0 || survival.radiation <= 0) return false;
    survival.mutagenCharges -= 1;
    survival.radiation = Math.max(0, survival.radiation - 28);
    this.recordEvent('SYSTEM', 'Mutagen dose stabilized radiation exposure.');
    return true;
  }

  public purchaseMutagenCharges(cost = 180): boolean {
    if (this.state.survival.status === 'FAILED' || !Number.isFinite(cost) || cost < 0
      || this.state.mobScore < cost) return false;
    this.state.mobScore -= cost;
    this.state.survival.mutagenCharges += 2;
    this.recordEvent('SYSTEM', 'Two mutagen doses added to suit inventory.');
    return true;
  }

  public restartSurvivalRun(): void {
    this.state.survival = {
      oxygen: 100,
      radiation: 5,
      mutagenCharges: 3,
      ticksSurvived: 0,
      status: 'ACTIVE',
    };
    this.recordEvent('SYSTEM', 'New suit cycle initialized.');
  }

  public toggleCameraMode(): CameraMode {
    const currentIndex = CAMERA_MODES.indexOf(this.state.activeCameraMode);
    this.state.activeCameraMode = CAMERA_MODES[(currentIndex + 1) % CAMERA_MODES.length];
    this.persist();
    bridge.sendCommand({
      type: 'UPDATE_PERCEPTION',
      payload: { activeCameraMode: this.state.activeCameraMode },
    });
    return this.state.activeCameraMode;
  }

  public toggleMantisFilters(): boolean {
    this.state.mantisFiltersActive = !this.state.mantisFiltersActive;
    this.persist();
    bridge.sendCommand({
      type: 'UPDATE_PERCEPTION',
      payload: { mantisFiltersActive: this.state.mantisFiltersActive },
    });
    return this.state.mantisFiltersActive;
  }

  public registerFactionEvent(faction: string, detail: string): void {
    this.recordEvent('FACTION', `${faction}: ${detail}`);
    bridge.sendCommand({ type: 'UPDATE_PERCEPTION', payload: { faction, detail } });
  }

  public registerCrisisEvent(detail: string): void {
    const crisis = this.behaviorDNA.createCrisis('Containment breach reported', detail);
    this.recordEvent('CRISIS', `${crisis.severity}: ${crisis.title} - ${crisis.description}`);
    this.persist();
    bridge.sendCommand({ type: 'TRIGGER_CRISIS', payload: { crisis } });
  }

  public getActiveCrises(): FactionCrisis[] {
    return this.behaviorDNA.getActiveCrises();
  }

  public resolveCrisis(crisisId: string): boolean {
    const resolved = this.behaviorDNA.resolveCrisis(crisisId);
    if (resolved) this.recordEvent('SYSTEM', `Crisis resolved: ${crisisId}.`);
    return resolved;
  }

  public applyRendererCommand(command: OrchestratorCommand): void {
    switch (command.type) {
      case 'MUTATE_SPACETIME': {
        const tier = command.payload.realityTier;
        if (Number.isInteger(tier) && Number(tier) >= 0) this.state.realityTier = Number(tier);
        this.recordEvent('SYSTEM', `Renderer acknowledged reality tier ${this.state.realityTier}.`);
        break;
      }
      case 'UPDATE_PERCEPTION': {
        const cameraMode = command.payload.activeCameraMode;
        const mantisFiltersActive = command.payload.mantisFiltersActive;
        if (CAMERA_MODES.includes(cameraMode as CameraMode)) this.state.activeCameraMode = cameraMode as CameraMode;
        if (typeof mantisFiltersActive === 'boolean') this.state.mantisFiltersActive = mantisFiltersActive;
        this.persist();
        break;
      }
      case 'SPAWN_MOBS':
        this.recordEvent('SYSTEM', 'Renderer spawned the requested mob group.');
        break;
      case 'TRIGGER_CRISIS': {
        const crisis = command.payload.crisis as FactionCrisis | undefined;
        if (crisis) {
          this.behaviorDNA.addCrisis(crisis);
          this.recordEvent('CRISIS', `${crisis.severity}: ${crisis.title}`);
          this.persist();
        }
        break;
      }
    }
  }

  public getState(): PlayerState {
    return {
      ...this.state,
      mutagensOwned: [...this.state.mutagensOwned],
      survival: { ...this.state.survival },
    };
  }

  public getEvents(): TacticalEvent[] {
    return this.events.map((event) => ({ ...event }));
  }
}

export const globalOrchestrator = new ParadoxOrchestratorEngine();