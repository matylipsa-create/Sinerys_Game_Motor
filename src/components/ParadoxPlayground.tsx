import { useEffect, useState } from 'react';
import { bridge } from '../core/OrchestratorBridge';
import {
  type ParadoxOrchestratorEngine,
  type PlayerState,
  type TacticalEvent,
} from '../core/ParadoxOrchestrator';
import type { FactionCrisis } from '../core/BehaviorDNAEngine';
import './ParadoxPlayground.css';

const MUTAGEN_ID = 'MYCELIUM_SYNTH_V2';
const MUTAGEN_COST = 450;

interface Props {
  orchestrator: ParadoxOrchestratorEngine;
}

export function ParadoxPlayground({ orchestrator }: Props) {
  const [gameState, setGameState] = useState<PlayerState>(() => orchestrator.getState());
  const [events, setEvents] = useState<TacticalEvent[]>(() => orchestrator.getEvents());
  const [activeCrises, setActiveCrises] = useState<FactionCrisis[]>(() => orchestrator.getActiveCrises());
  const [logMessage, setLogMessage] = useState('PARADOX BOOT // STATION 07. AIRLOCK SEAL FAILURE DETECTED.');

  useEffect(() => {
    const unsubscribe = bridge.subscribe((command) => {
      orchestrator.applyRendererCommand(command);
      setGameState(orchestrator.getState());
      setEvents(orchestrator.getEvents());
      setActiveCrises(orchestrator.getActiveCrises());
      setLogMessage(`RENDERER // ${command.type.replace(/_/g, ' ')} RECEIVED`);
    });
    return () => {
      unsubscribe();
    };
  }, [orchestrator]);

  useEffect(() => orchestrator.subscribe(() => {
    setGameState(orchestrator.getState());
    setEvents(orchestrator.getEvents());
    setActiveCrises(orchestrator.getActiveCrises());
  }), [orchestrator]);

  const refresh = (message: string) => {
    setGameState(orchestrator.getState());
    setEvents(orchestrator.getEvents());
    setActiveCrises(orchestrator.getActiveCrises());
    setLogMessage(message);
  };

  const handleShelter = () => {
    const result = orchestrator.visitShelter();
    refresh(result.mutated
      ? `SPACETIME MUTATION // REALITY TIER ${result.state.realityTier}`
      : `SHELTER REGISTERED // ${result.state.shelterVisits % 4}/4 TO MUTATION`);
  };

  const handleAmmo = () => {
    const success = orchestrator.purchaseLivingAmmo(300);
    refresh(success ? 'ECONOMY // 10 LIVING ROUNDS ACQUIRED' : 'ECONOMY // INSUFFICIENT MOB SCORE');
  };

  const handleMutagen = () => {
    const success = orchestrator.purchaseMutagen(MUTAGEN_ID, MUTAGEN_COST);
    refresh(success ? `MUTAGEN // ${MUTAGEN_ID} ACQUIRED` : 'MUTAGEN // PURCHASE UNAVAILABLE');
  };

  const handleKill = () => {
    orchestrator.registerMobKill(120);
    refresh('COMBAT // TARGET ELIMINATED. +120 MOB SCORE');
  };

  const handleCamera = () => {
    const mode = orchestrator.toggleCameraMode();
    refresh(`CAMERA // ${mode.replace(/_/g, ' ')} ACTIVE`);
  };

  const handleMantis = () => {
    const active = orchestrator.toggleMantisFilters();
    refresh(`MANTIS PERCEPTION // ${active ? 'ENGAGED' : 'DISENGAGED'}`);
  };

  const handleFaction = () => {
    const faction = gameState.realityTier % 2 === 0 ? 'ASHEN COLLECTIVE' : 'VERDIGRIS SYNDICATE';
    orchestrator.registerFactionEvent(faction, 'territorial activity detected near the Shelter.');
    refresh(`FACTION EVENT // ${faction} ACTIVITY DETECTED`);
  };

  const handleCrisis = () => {
    orchestrator.registerCrisisEvent('Containment breach reported. Crisis response required.');
    refresh('CRISIS EVENT // CONTAINMENT BREACH REPORTED');
  };

  const handleResolveCrisis = (crisisId: string) => {
    if (orchestrator.resolveCrisis(crisisId)) refresh('CRISIS // RESOLUTION REGISTERED');
  };

  const handleOxygenRefill = () => {
    const success = orchestrator.refillOxygen();
    refresh(success ? 'SUIT SYSTEMS // OXYGEN RESERVE +30%' : 'SUIT SYSTEMS // OXYGEN REFILL UNAVAILABLE');
  };

  const handleMutagenDose = () => {
    const success = orchestrator.useMutagenCharge();
    refresh(success ? 'SUIT SYSTEMS // RADIATION BUFFER RESTORED' : 'SUIT SYSTEMS // NO MUTAGEN DOSE AVAILABLE');
  };

  const handleMutagenSupply = () => {
    const success = orchestrator.purchaseMutagenCharges();
    refresh(success ? 'SUIT SYSTEMS // TWO MUTAGEN DOSES ACQUIRED' : 'SUIT SYSTEMS // INSUFFICIENT MOB SCORE');
  };

  const handleRestartRun = () => {
    orchestrator.restartSurvivalRun();
    refresh('PARADOX BOOT // NEW SUIT CYCLE INITIALIZED');
  };

  return (
    <main className={`paradox-shell${gameState.mantisFiltersActive ? ' mantis-active' : ''}`}>
      <header className="paradox-header">
        <div>
          <p className="paradox-kicker">CONQUER OF DARKNESS / STATION 07 / ENGINEERING TERMINAL</p>
          <h1>PARADOX <span>//</span> LIFE SUPPORT</h1>
        </div>
        <div className={`paradox-status${gameState.survival.status === 'FAILED' ? ' status-failed' : ''}`}><i /> {gameState.survival.status === 'FAILED' ? 'SUIT FAILURE' : 'LIFE SUPPORT ACTIVE'} <span>LOCAL STATE SAVED</span></div>
      </header>

      <section className="paradox-overview" aria-label="Tactical state">
        <div className="paradox-reality">
          <span className="paradox-label">REALITY TIER</span>
          <strong>{String(gameState.realityTier).padStart(2, '0')}</strong>
          <span className="paradox-subtle">SHELTER CYCLE {gameState.shelterVisits % 4}/4</span>
          <div className="paradox-cycle" aria-label={`${gameState.shelterVisits % 4} of 4 visits to mutation`}>
            {[0, 1, 2, 3].map((step) => <i key={step} className={step < gameState.shelterVisits % 4 ? 'filled' : ''} />)}
          </div>
        </div>
        <div className="paradox-metrics">
          <article><span className="paradox-label">MOB SCORE</span><strong>{gameState.mobScore.toLocaleString()}</strong><small>FIELD CURRENCY</small></article>
          <article><span className="paradox-label">LIVING AMMO</span><strong>{String(gameState.livingAmmoCount).padStart(2, '0')}</strong><small>ROUNDS AVAILABLE</small></article>
          <article><span className="paradox-label">MUTAGENS</span><strong>{String(gameState.mutagensOwned.length).padStart(2, '0')}</strong><small>{gameState.mutagensOwned[gameState.mutagensOwned.length - 1]?.replace(/_/g, ' ')}</small></article>
          <article><span className="paradox-label">CAMERA</span><strong className="camera-value">{gameState.activeCameraMode.replace(/_/g, ' ')}</strong><small>MANTIS {gameState.mantisFiltersActive ? 'ACTIVE' : 'STANDBY'}</small></article>
        </div>
      </section>

      <section className={`paradox-survival${gameState.survival.status === 'FAILED' ? ' survival-failed' : ''}`} aria-labelledby="survival-title">
        <div className="paradox-survival-heading">
          <div><span>00 / SUIT DIAGNOSTICS</span><h2 id="survival-title">Survival systems</h2></div>
          <span className="survival-tick">CYCLE {String(gameState.survival.ticksSurvived).padStart(4, '0')}</span>
        </div>
        <div className="survival-readouts">
          <article className="survival-readout oxygen-readout">
            <div><span>OXYGEN RESERVE</span><strong>{Math.ceil(gameState.survival.oxygen)}%</strong></div>
            <progress max="100" value={gameState.survival.oxygen} aria-label={`Oxygen reserve ${Math.ceil(gameState.survival.oxygen)} percent`} />
            <small>CONSUMPTION / TICK: 1.5%</small>
          </article>
          <article className="survival-readout radiation-readout">
            <div><span>RADIATION LOAD</span><strong>{Math.ceil(gameState.survival.radiation)}%</strong></div>
            <progress max="100" value={gameState.survival.radiation} aria-label={`Radiation load ${Math.ceil(gameState.survival.radiation)} percent`} />
            <small>EXPOSURE / TICK: 0.8%</small>
          </article>
          <article className="survival-readout mutagen-readout">
            <div><span>MUTAGEN DOSES</span><strong>{String(gameState.survival.mutagenCharges).padStart(2, '0')}</strong></div>
            <small>BUFFER / DOSE: −28% RAD</small>
          </article>
        </div>
        <div className="survival-controls">
          {gameState.survival.status === 'FAILED' ? (
            <button type="button" className="restart-run" onClick={handleRestartRun}>Restart suit cycle</button>
          ) : (
            <>
              <button type="button" onClick={handleOxygenRefill} disabled={gameState.mobScore < 90 || gameState.survival.oxygen >= 100}>Refill oxygen <small>90 SCORE / +30%</small></button>
              <button type="button" onClick={handleMutagenDose} disabled={gameState.survival.mutagenCharges < 1 || gameState.survival.radiation <= 0}>Apply mutagen <small>1 DOSE / −28% RAD</small></button>
              <button type="button" onClick={handleMutagenSupply} disabled={gameState.mobScore < 180}>Acquire doses <small>180 SCORE / +2</small></button>
            </>
          )}
        </div>
      </section>

      <div className="paradox-columns">
        <section className="paradox-panel" aria-labelledby="operations-title">
          <div className="paradox-panel-heading"><span>01 / OPERATIONS</span><h2 id="operations-title">Field controls</h2></div>
          <div className="paradox-actions">
            <button type="button" onClick={handleKill}><span className="action-index">01</span><span>Register mob kill<small>+120 MOB SCORE</small></span><b>+</b></button>
            <button type="button" onClick={handleShelter}><span className="action-index">02</span><span>Enter Shelter<small>TRACK REALITY MUTATION</small></span><b>&gt;</b></button>
            <button type="button" onClick={handleAmmo}><span className="action-index">03</span><span>Acquire living ammo<small>300 SCORE / +10 ROUNDS</small></span><b>−</b></button>
            <button type="button" onClick={handleMutagen} disabled={gameState.mutagensOwned.includes(MUTAGEN_ID)}><span className="action-index">04</span><span>Acquire mutagen<small>{gameState.mutagensOwned.includes(MUTAGEN_ID) ? 'ALREADY OWNED' : `MYCELIUM SYNTH / ${MUTAGEN_COST} SCORE`}</small></span><b>{gameState.mutagensOwned.includes(MUTAGEN_ID) ? 'OK' : '-'}</b></button>
            <button type="button" onClick={handleCamera}><span className="action-index">05</span><span>Change camera mode<small>CYCLE PERSPECTIVE</small></span><b>R</b></button>
            <button type="button" onClick={handleMantis} aria-pressed={gameState.mantisFiltersActive}><span className="action-index">06</span><span>Mantis perception<small>{gameState.mantisFiltersActive ? 'SPECTRAL FILTER ENGAGED' : 'SPECTRAL FILTER STANDBY'}</small></span><b>{gameState.mantisFiltersActive ? 'ON' : 'OFF'}</b></button>
          </div>
        </section>

        <section className="paradox-panel paradox-events" aria-labelledby="events-title">
          <div className="paradox-panel-heading"><span>02 / WORLD STATE</span><h2 id="events-title">Faction & crisis feed</h2></div>
          <div className="paradox-event-controls">
            <button type="button" onClick={handleFaction}>Log faction activity <span>+</span></button>
            <button type="button" onClick={handleCrisis}>Report a crisis <span>+</span></button>
          </div>
          {activeCrises.length > 0 && (
            <ul className="paradox-active-crises" aria-label="Active crises">
              {activeCrises.map((crisis) => (
                <li key={crisis.crisisId}>
                  <div><span className={`event-tag event-${crisis.severity.toLowerCase()}`}>{crisis.severity}</span><strong>{crisis.title}</strong><p>{crisis.description}</p></div>
                  <button type="button" onClick={() => handleResolveCrisis(crisis.crisisId)} aria-label={`Resolve ${crisis.title}`}>Resolve</button>
                </li>
              ))}
            </ul>
          )}
          <ol className="paradox-feed" aria-live="polite">
            {events.length === 0 && <li className="paradox-empty">No active transmissions. World state is quiet.</li>}
            {events.map((event) => (
              <li key={`${event.id}-${event.message}`}>
                <span className={`event-tag event-${event.type.toLowerCase()}`}>{event.type}</span>
                <p>{event.message}</p>
                <time dateTime={new Date(event.timestamp).toISOString()}>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="paradox-console" role="status" aria-live="polite">
        <span>SYS.LOG</span><p>{logMessage}</p><span>LOCAL CACHE / ACTIVE</span>
      </footer>
    </main>
  );
}