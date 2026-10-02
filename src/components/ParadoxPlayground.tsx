import { useEffect, useState } from 'react';
import { bridge } from '../core/OrchestratorBridge';
import {
  globalOrchestrator,
  type PlayerState,
  type TacticalEvent,
} from '../core/ParadoxOrchestrator';
import type { FactionCrisis } from '../core/BehaviorDNAEngine';
import './ParadoxPlayground.css';

const MUTAGEN_ID = 'MYCELIUM_SYNTH_V2';
const MUTAGEN_COST = 450;

export function ParadoxPlayground() {
  const [gameState, setGameState] = useState<PlayerState>(() => globalOrchestrator.getState());
  const [events, setEvents] = useState<TacticalEvent[]>(() => globalOrchestrator.getEvents());
  const [activeCrises, setActiveCrises] = useState<FactionCrisis[]>(() => globalOrchestrator.getActiveCrises());
  const [logMessage, setLogMessage] = useState('SENTRA CORE ONLINE. TACTICAL STATE SYNCHRONIZED.');

  useEffect(() => {
    bridge.connect();
    const unsubscribe = bridge.subscribe((command) => {
      globalOrchestrator.applyRendererCommand(command);
      setGameState(globalOrchestrator.getState());
      setEvents(globalOrchestrator.getEvents());
      setActiveCrises(globalOrchestrator.getActiveCrises());
      setLogMessage(`RENDERER // ${command.type.replace(/_/g, ' ')} RECEIVED`);
    });
    return () => {
      unsubscribe();
      bridge.disconnect();
    };
  }, []);

  const refresh = (message: string) => {
    setGameState(globalOrchestrator.getState());
    setEvents(globalOrchestrator.getEvents());
    setActiveCrises(globalOrchestrator.getActiveCrises());
    setLogMessage(message);
  };

  const handleShelter = () => {
    const result = globalOrchestrator.visitShelter();
    refresh(result.mutated
      ? `SPACETIME MUTATION // REALITY TIER ${result.state.realityTier}`
      : `SHELTER REGISTERED // ${result.state.shelterVisits % 4}/4 TO MUTATION`);
  };

  const handleAmmo = () => {
    const success = globalOrchestrator.purchaseLivingAmmo(300);
    refresh(success ? 'ECONOMY // 10 LIVING ROUNDS ACQUIRED' : 'ECONOMY // INSUFFICIENT MOB SCORE');
  };

  const handleMutagen = () => {
    const success = globalOrchestrator.purchaseMutagen(MUTAGEN_ID, MUTAGEN_COST);
    refresh(success ? `MUTAGEN // ${MUTAGEN_ID} ACQUIRED` : 'MUTAGEN // PURCHASE UNAVAILABLE');
  };

  const handleKill = () => {
    globalOrchestrator.registerMobKill(120);
    refresh('COMBAT // TARGET ELIMINATED. +120 MOB SCORE');
  };

  const handleCamera = () => {
    const mode = globalOrchestrator.toggleCameraMode();
    refresh(`CAMERA // ${mode.replace(/_/g, ' ')} ACTIVE`);
  };

  const handleMantis = () => {
    const active = globalOrchestrator.toggleMantisVision();
    refresh(`MANTIS VISION // ${active ? 'ENGAGED' : 'DISENGAGED'}`);
  };

  const handleFaction = () => {
    const faction = gameState.realityTier % 2 === 0 ? 'ASHEN COLLECTIVE' : 'VERDIGRIS SYNDICATE';
    globalOrchestrator.registerFactionEvent(faction, 'territorial activity detected near the Shelter.');
    refresh(`FACTION EVENT // ${faction} ACTIVITY DETECTED`);
  };

  const handleCrisis = () => {
    globalOrchestrator.registerCrisisEvent('Containment breach reported. Crisis response required.');
    refresh('CRISIS EVENT // CONTAINMENT BREACH REPORTED');
  };

  const handleResolveCrisis = (crisisId: string) => {
    if (globalOrchestrator.resolveCrisis(crisisId)) refresh('CRISIS // RESOLUTION REGISTERED');
  };

  return (
    <main className={`paradox-shell${gameState.mantisVisionActive ? ' mantis-active' : ''}`}>
      <header className="paradox-header">
        <div>
          <p className="paradox-kicker">CONQUER OF DARKNESS / FIELD SYSTEMS</p>
          <h1>PARADOX <span>//</span> ORCHESTRATOR</h1>
        </div>
        <div className="paradox-status"><i /> OFFLINE-READY <span>STATE SAVED</span></div>
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
          <article><span className="paradox-label">CAMERA</span><strong className="camera-value">{gameState.activeCameraMode.replace(/_/g, ' ')}</strong><small>MANTIS {gameState.mantisVisionActive ? 'ACTIVE' : 'STANDBY'}</small></article>
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
            <button type="button" onClick={handleMantis} aria-pressed={gameState.mantisVisionActive}><span className="action-index">06</span><span>Mantis vision<small>{gameState.mantisVisionActive ? 'SPECTRAL FILTER ENGAGED' : 'SPECTRAL FILTER STANDBY'}</small></span><b>{gameState.mantisVisionActive ? 'ON' : 'OFF'}</b></button>
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