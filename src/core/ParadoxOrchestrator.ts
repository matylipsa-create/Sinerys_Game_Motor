import { BehaviorDNAEngine, type FactionCrisis } from './BehaviorDNAEngine';
import { bridge, type OrchestratorCommand } from './OrchestratorBridge';
import type { EngineStateChanged, IEngineSystem } from './EngineCore';
import type { ConquerOrchestrator, GameState } from './ConquerOrchestrator';
import type { ParadoxSessionState, PlayerState, TacticalEvent } from './ParadoxState';

export type {
  CameraMode,
  PlayerState,
  SurvivalState,
  SurvivalStatus,
  TacticalEvent,
} from './ParadoxState';

const CAMERA_MODES: PlayerState['activeCameraMode'][] = ['ISOMETRIC', 'FIRST_PERSON', 'SIDE_SCROLLER'];
const MAX_EVENTS = 20;
const MAX_CRISES = 100;
const SURVIVAL_TICK_INTERVAL_MS = 5000;

type ParadoxSessionMutation = (session: ParadoxSessionState) => void;

/**
 * Paradox gameplay adapter. All durable state is owned by ConquerOrchestrator.
 */
export class ParadoxOrchestratorEngine implements IEngineSystem<GameState> {
  readonly id = 'paradox-survival';
  private survivalElapsedMs = 0;

  constructor(
    private readonly engine: ConquerOrchestrator,
    private readonly commandBridge = bridge,
  ) {}

  update(deltaMs: number): void {
    if (this.getSession().state.survival.status === 'FAILED') return;
    this.survivalElapsedMs += deltaMs;
    if (this.survivalElapsedMs < SURVIVAL_TICK_INTERVAL_MS) return;
    this.survivalElapsedMs %= SURVIVAL_TICK_INTERVAL_MS;
    this.tickSurvival();
  }

  subscribe(onChange: () => void): () => void {
    return this.engine.subscribe<EngineStateChanged<GameState>>(
      'engine:state:changed:*',
      (change) => {
        if (change.engineId === this.engine.engineId) onChange();
      },
    );
  }

  private getSession(): ParadoxSessionState {
    return this.engine.getState().paradoxSession;
  }

  private mutate(
    actionType: string,
    update: ParadoxSessionMutation,
    event?: { type: TacticalEvent['type']; message: string },
  ): void {
    this.engine.applyMutation({
      type: actionType,
      apply: (draft: GameState) => {
        update(draft.paradoxSession);
        if (event) {
          const nextId = draft.paradoxSession.events.reduce((maximum, item) => Math.max(maximum, item.id), 0) + 1;
          draft.paradoxSession.events = [{
            id: nextId,
            type: event.type,
            message: event.message,
            timestamp: Date.now(),
          }, ...draft.paradoxSession.events].slice(0, MAX_EVENTS);
        }
        draft.paradoxSession.crises = draft.paradoxSession.crises.slice(0, MAX_CRISES);
      },
    });
  }

  private recordEvent(type: TacticalEvent['type'], message: string): void {
    this.mutate('paradox.event.record', () => undefined, { type, message });
  }

  public registerMobKill(scoreGained: number): PlayerState {
    const { state } = this.getSession();
    if (state.survival.status === 'FAILED' || !Number.isFinite(scoreGained) || scoreGained <= 0) return state;
    const reward = Math.floor(scoreGained);
    this.mutate('paradox.combat.mob-kill', (session) => {
      session.state.mobScore += reward;
    }, { type: 'SYSTEM', message: `Mob eliminated. +${reward} mob score.` });
    return this.getSession().state;
  }

  public visitShelter(): { mutated: boolean; state: PlayerState } {
    const session = this.getSession();
    if (session.state.survival.status === 'FAILED') return { mutated: false, state: session.state };

    const shelterVisits = session.state.shelterVisits + 1;
    const visualState = this.engine.registerShelterVisit();
    const mutated = visualState.currentRealityTier > session.state.realityTier;
    const behaviorDNA = new BehaviorDNAEngine(session.crises);
    const crisis = behaviorDNA.evaluateCrisisTrigger(shelterVisits);
    const faction = mutated ? behaviorDNA.evaluateFactionEvent() : null;
    const mobBehaviorDNA = mutated ? behaviorDNA.evolveMobsForTier(session.state.realityTier + 1) : null;
    const eventMessages: Array<{ type: TacticalEvent['type']; message: string }> = [{
      type: 'SYSTEM',
      message: mutated
        ? `Spacetime mutation triggered. Reality tier ${session.state.realityTier + 1}.`
        : `Shelter visit registered (${shelterVisits % 4}/4 to mutation).`,
    }];
    if (crisis) eventMessages.push({ type: 'CRISIS', message: `${crisis.severity}: ${crisis.title}` });
    if (faction) eventMessages.push({ type: 'FACTION', message: `${faction.faction}: ${faction.description}` });

    this.engine.applyMutation({
      type: 'paradox.shelter.visit',
      apply: (draft) => {
        draft.paradoxSession.state.shelterVisits = shelterVisits;
        draft.paradoxSession.state.realityTier = visualState.currentRealityTier;
        draft.paradoxSession.crises = behaviorDNA.getCrisisHistory().slice(0, MAX_CRISES);
        let nextId = draft.paradoxSession.events.reduce((maximum, item) => Math.max(maximum, item.id), 0) + 1;
        for (const item of eventMessages) {
          draft.paradoxSession.events.unshift({
            ...item,
            id: nextId++,
            timestamp: Date.now(),
          });
        }
        draft.paradoxSession.events = draft.paradoxSession.events.slice(0, MAX_EVENTS);
      },
    });

    if (crisis) this.commandBridge.sendCommand({ type: 'TRIGGER_CRISIS', payload: { crisis } });
    if (mutated) {
      this.commandBridge.sendCommand({
        type: 'MUTATE_SPACETIME',
        payload: { realityTier: session.state.realityTier + 1 },
      });
      this.commandBridge.sendCommand({
        type: 'SPAWN_MOBS',
        payload: { realityTier: session.state.realityTier + 1, mobBehaviorDNA },
      });
    }
    this.commandBridge.sendCommand({
      type: 'UPDATE_PERCEPTION',
      payload: mutated
        ? { shelterVisits, realityTier: session.state.realityTier + 1, faction }
        : { shelterVisits, realityTier: session.state.realityTier },
    });

    return { mutated, state: this.getSession().state };
  }

  public purchaseLivingAmmo(cost: number): boolean {
    const { state } = this.getSession();
    if (state.survival.status === 'FAILED' || !Number.isFinite(cost) || cost < 0 || state.mobScore < cost) return false;
    this.mutate('paradox.economy.purchase-ammo', (session) => {
      session.state.mobScore -= cost;
      session.state.livingAmmoCount += 10;
    }, { type: 'SYSTEM', message: 'Living ammo acquired. +10 rounds.' });
    return true;
  }

  public purchaseMutagen(mutagenId: string, cost: number): boolean {
    const { state } = this.getSession();
    if (state.survival.status === 'FAILED' || !mutagenId.trim() || !Number.isFinite(cost) || cost < 0
      || state.mobScore < cost || state.mutagensOwned.includes(mutagenId)) return false;
    this.mutate('paradox.economy.purchase-mutagen', (session) => {
      session.state.mobScore -= cost;
      session.state.mutagensOwned.push(mutagenId);
    }, { type: 'SYSTEM', message: `Mutagen acquired: ${mutagenId}.` });
    return true;
  }

  public tickSurvival(): PlayerState {
    const { state } = this.getSession();
    if (state.survival.status === 'FAILED') return state;

    const survival = {
      ...state.survival,
      ticksSurvived: state.survival.ticksSurvived + 1,
      oxygen: Math.max(0, state.survival.oxygen - 1.5),
      radiation: Math.min(100, state.survival.radiation + 0.8),
    };
    const failedByOxygen = survival.oxygen <= 0;
    const failedByRadiation = survival.radiation >= 100;
    if (failedByOxygen || failedByRadiation) survival.status = 'FAILED';

    const event = failedByOxygen
      ? { type: 'CRISIS' as const, message: 'SUIT FAILURE: oxygen reserves depleted.' }
      : failedByRadiation
        ? { type: 'CRISIS' as const, message: 'SUIT FAILURE: radiation exposure exceeded safe limits.' }
        : survival.ticksSurvived % 6 === 0
          ? { type: 'SYSTEM' as const, message: `Suit check ${survival.ticksSurvived}: O2 ${Math.ceil(survival.oxygen)}%, RAD ${Math.ceil(survival.radiation)}%.` }
          : undefined;

    this.mutate('paradox.survival.tick', (session) => {
      session.state.survival = survival;
    }, event);

    this.commandBridge.sendCommand({
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
    return this.getSession().state;
  }

  public refillOxygen(cost = 90): boolean {
    const { state } = this.getSession();
    if (state.survival.status === 'FAILED' || !Number.isFinite(cost) || cost < 0
      || state.mobScore < cost || state.survival.oxygen >= 100) return false;
    this.mutate('paradox.survival.refill-oxygen', (session) => {
      session.state.mobScore -= cost;
      session.state.survival.oxygen = Math.min(100, session.state.survival.oxygen + 30);
    }, { type: 'SYSTEM', message: 'Suit oxygen reserve replenished by 30%.' });
    return true;
  }

  public useMutagenCharge(): boolean {
    const { state } = this.getSession();
    if (state.survival.status === 'FAILED' || state.survival.mutagenCharges <= 0 || state.survival.radiation <= 0) return false;
    this.mutate('paradox.survival.use-mutagen', (session) => {
      session.state.survival.mutagenCharges -= 1;
      session.state.survival.radiation = Math.max(0, session.state.survival.radiation - 28);
    }, { type: 'SYSTEM', message: 'Mutagen dose stabilized radiation exposure.' });
    return true;
  }

  public purchaseMutagenCharges(cost = 180): boolean {
    const { state } = this.getSession();
    if (state.survival.status === 'FAILED' || !Number.isFinite(cost) || cost < 0 || state.mobScore < cost) return false;
    this.mutate('paradox.economy.purchase-mutagen-charges', (session) => {
      session.state.mobScore -= cost;
      session.state.survival.mutagenCharges += 2;
    }, { type: 'SYSTEM', message: 'Two mutagen doses added to suit inventory.' });
    return true;
  }

  public restartSurvivalRun(): void {
    this.mutate('paradox.survival.restart', (session) => {
      session.state.survival = {
        oxygen: 100,
        radiation: 5,
        mutagenCharges: 3,
        ticksSurvived: 0,
        status: 'ACTIVE',
      };
    }, { type: 'SYSTEM', message: 'New suit cycle initialized.' });
  }

  public toggleCameraMode(): PlayerState['activeCameraMode'] {
    const { state } = this.getSession();
    const currentIndex = CAMERA_MODES.indexOf(state.activeCameraMode);
    const nextMode = CAMERA_MODES[(currentIndex + 1) % CAMERA_MODES.length];
    this.mutate('paradox.perception.camera', (session) => {
      session.state.activeCameraMode = nextMode;
    });
    this.commandBridge.sendCommand({
      type: 'UPDATE_PERCEPTION',
      payload: { activeCameraMode: nextMode },
    });
    return nextMode;
  }

  public toggleMantisFilters(): boolean {
    const nextValue = !this.getSession().state.mantisFiltersActive;
    this.mutate('paradox.perception.mantis', (session) => {
      session.state.mantisFiltersActive = nextValue;
    });
    this.commandBridge.sendCommand({
      type: 'UPDATE_PERCEPTION',
      payload: { mantisFiltersActive: nextValue },
    });
    return nextValue;
  }

  public registerFactionEvent(faction: string, detail: string): void {
    const eventFaction = faction.trim();
    const eventDetail = detail.trim();
    if (!eventFaction || !eventDetail) throw new Error('Faction events require a faction and a description.');
    this.recordEvent('FACTION', `${eventFaction}: ${eventDetail}`);
    this.commandBridge.sendCommand({
      type: 'UPDATE_PERCEPTION',
      payload: { faction: eventFaction, detail: eventDetail },
    });
  }

  public registerCrisisEvent(detail: string): void {
    const behaviorDNA = new BehaviorDNAEngine(this.getSession().crises);
    const crisis = behaviorDNA.createCrisis('Containment breach reported', detail);
    this.mutate('paradox.crisis.create', (session) => {
      session.crises = behaviorDNA.getCrisisHistory();
    }, { type: 'CRISIS', message: `${crisis.severity}: ${crisis.title} - ${crisis.description}` });
    this.commandBridge.sendCommand({ type: 'TRIGGER_CRISIS', payload: { crisis } });
  }

  public getActiveCrises(): FactionCrisis[] {
    return this.getSession().crises.filter((crisis) => !crisis.resolved);
  }

  public resolveCrisis(crisisId: string): boolean {
    const behaviorDNA = new BehaviorDNAEngine(this.getSession().crises);
    if (!behaviorDNA.resolveCrisis(crisisId)) return false;
    this.mutate('paradox.crisis.resolve', (session) => {
      session.crises = behaviorDNA.getCrisisHistory();
    }, { type: 'SYSTEM', message: `Crisis resolved: ${crisisId}.` });
    return true;
  }

  public applyRendererCommand(command: OrchestratorCommand): void {
    switch (command.type) {
      case 'MUTATE_SPACETIME': {
        const tier = command.payload.realityTier;
        if (Number.isInteger(tier) && Number(tier) >= 0) {
          this.mutate('paradox.renderer.mutation-acknowledged', (session) => {
            session.state.realityTier = Number(tier);
          }, { type: 'SYSTEM', message: `Renderer acknowledged reality tier ${Number(tier)}.` });
        }
        break;
      }
      case 'UPDATE_PERCEPTION': {
        const cameraMode = command.payload.activeCameraMode;
        const mantisFiltersActive = command.payload.mantisFiltersActive;
        if (CAMERA_MODES.includes(cameraMode as PlayerState['activeCameraMode'])
          || typeof mantisFiltersActive === 'boolean') {
          this.mutate('paradox.renderer.perception-update', (session) => {
            if (CAMERA_MODES.includes(cameraMode as PlayerState['activeCameraMode'])) {
              session.state.activeCameraMode = cameraMode as PlayerState['activeCameraMode'];
            }
            if (typeof mantisFiltersActive === 'boolean') {
              session.state.mantisFiltersActive = mantisFiltersActive;
            }
          });
        }
        break;
      }
      case 'SPAWN_MOBS':
        this.recordEvent('SYSTEM', 'Renderer spawned the requested mob group.');
        break;
      case 'TRIGGER_CRISIS': {
        const crisis = command.payload.crisis as FactionCrisis | undefined;
        if (crisis) {
          const behaviorDNA = new BehaviorDNAEngine(this.getSession().crises);
          behaviorDNA.addCrisis(crisis);
          this.mutate('paradox.renderer.crisis-received', (session) => {
            session.crises = behaviorDNA.getCrisisHistory();
          }, { type: 'CRISIS', message: `${crisis.severity}: ${crisis.title}` });
        }
        break;
      }
    }
  }

  public getState(): PlayerState {
    const state = this.getSession().state;
    return { ...state, mutagensOwned: [...state.mutagensOwned], survival: { ...state.survival } };
  }

  public getEvents(): TacticalEvent[] {
    return this.getSession().events.map((event) => ({ ...event }));
  }
}
