import type { FactionCrisis } from './BehaviorDNAEngine';
import type { PlayerState, TacticalEvent } from './ParadoxOrchestrator';

const STORAGE_KEY = 'CONQUER_OF_DARKNESS_PARADOX_SAVE_V1';
const LEGACY_STORAGE_KEY = 'sentra-paradox-state-v1';

export interface ParadoxSaveData {
  state: PlayerState;
  events: TacticalEvent[];
  crises: FactionCrisis[];
  timestamp: number;
}

function isPlayerState(value: unknown): value is PlayerState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PlayerState>;
  return Number.isFinite(state.mobScore) && Number(state.mobScore) >= 0
    && Number.isInteger(state.livingAmmoCount) && Number(state.livingAmmoCount) >= 0
    && Array.isArray(state.mutagensOwned) && state.mutagensOwned.every((item) => typeof item === 'string')
    && Number.isInteger(state.shelterVisits) && Number(state.shelterVisits) >= 0
    && Number.isInteger(state.realityTier) && Number(state.realityTier) >= 0
    && ['ISOMETRIC', 'FIRST_PERSON', 'SIDE_SCROLLER'].includes(state.activeCameraMode as string)
    && typeof state.mantisFiltersActive === 'boolean';
}

function isTacticalEvent(value: unknown): value is TacticalEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<TacticalEvent>;
  return ['FACTION', 'CRISIS', 'SYSTEM'].includes(event.type as string)
    && typeof event.message === 'string'
    && Number.isFinite(event.id)
    && Number.isFinite(event.timestamp);
}

function isFactionCrisis(value: unknown): value is FactionCrisis {
  if (!value || typeof value !== 'object') return false;
  const crisis = value as Partial<FactionCrisis>;
  return typeof crisis.crisisId === 'string'
    && typeof crisis.title === 'string'
    && typeof crisis.description === 'string'
    && ['LOW', 'CRITICAL', 'OMEGA'].includes(crisis.severity as string)
    && typeof crisis.resolved === 'boolean';
}

export class ParadoxStorage {
  private static readSave(): ParadoxSaveData | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
        ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const save = parsed as Partial<ParadoxSaveData>;
      if (!isPlayerState(save.state)) return null;
      return {
        state: { ...save.state, mutagensOwned: [...save.state.mutagensOwned] },
        events: Array.isArray(save.events) ? save.events.filter(isTacticalEvent).slice(0, 20) : [],
        crises: Array.isArray(save.crises) ? save.crises.filter(isFactionCrisis).slice(0, 100) : [],
        timestamp: Number.isFinite(save.timestamp) ? Number(save.timestamp) : 0,
      };
    } catch {
      return null;
    }
  }

  public static saveGameState(state: PlayerState): void {
    const existing = this.readSave();
    this.saveGameData(state, existing?.events ?? [], existing?.crises ?? []);
  }

  public static saveGameData(
    state: PlayerState,
    events: TacticalEvent[],
    crises: FactionCrisis[],
  ): void {
    try {
      if (!isPlayerState(state)) return;
      const save: ParadoxSaveData = {
        state: { ...state, mutagensOwned: [...state.mutagensOwned] },
        events: events.filter(isTacticalEvent).slice(0, 20),
        crises: crises.filter(isFactionCrisis).slice(0, 100),
        timestamp: Date.now(),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch (error) {
      console.error('STORAGE ERROR: No se pudo guardar el estado local.', error);
    }
  }

  public static loadGameState(): PlayerState | null {
    const save = this.readSave();
    return save ? { ...save.state, mutagensOwned: [...save.state.mutagensOwned] } : null;
  }

  public static loadGameData(): ParadoxSaveData | null {
    return this.readSave();
  }

  public static clearSave(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('STORAGE ERROR: No se pudo borrar el estado local.', error);
    }
  }
}