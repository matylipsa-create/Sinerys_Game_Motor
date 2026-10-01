import { useEffect, useState } from 'react';
import {
  SentraCoreArenaManager,
  type ArenaMechanic,
  type ArenaState,
} from './SentraCoreArena';
import './SentraCoreArena.css';

interface SentraCoreArenaViewProps {
  onNavigate: (route: string) => void;
}

const MECHANICS: { id: ArenaMechanic; title: string; key: string; action: string }[] = [
  { id: 'vacuum', title: 'Tentáculo de succión', key: 'Q', action: 'SUCCIONAR OBJETIVO' },
  { id: 'mutagen', title: 'Inyección mutagénica', key: 'E', action: 'INYECTAR SUERO' },
  { id: 'bash', title: 'Bash cinético', key: 'F', action: 'ROMPER FORMACIÓN' },
];

const MOB_POSITIONS = [
  { x: 212, y: 149 },
  { x: 307, y: 176 },
  { x: 409, y: 145 },
];

function ArenaScene({ state }: { state: ArenaState }) {
  return (
    <svg className="arena-scene" viewBox="0 0 640 280" role="img" aria-label="Cámara de pruebas mutagénicas con objetivos y un núcleo Sentra">
      <defs>
        <linearGradient id="arena-wall" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#2a392b" />
          <stop offset="1" stopColor="#131b15" />
        </linearGradient>
        <radialGradient id="arena-core">
          <stop stopColor="#d7ff52" stopOpacity=".58" />
          <stop offset="1" stopColor="#d7ff52" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M0 20 320 3 640 20v202H0V20Z" fill="url(#arena-wall)" />
      <path d="m0 20 320-17 320 17M0 222l320-62 320 62" fill="none" stroke="#52634d" strokeWidth="2" />
      <path d="M36 35v143m568-143v143M86 31v132m468-132v132" stroke="#435443" strokeWidth="5" />
      <path d="M23 68h80m434 0h80M54 119h62m408 0h62" stroke="#ed7655" strokeWidth="3" />
      <path d="M0 222h640v58H0z" fill="#111812" />
      <path d="m0 280 320-58 320 58M115 280l205-58 205 58M258 280l62-58 62 58" fill="none" stroke="#3e4c3e" />
      <ellipse cx="320" cy="152" rx="95" ry="84" fill="url(#arena-core)" />
      <path d="m320 58 66 38v75l-66 38-66-38V96l66-38Z" fill="#1a281b" stroke="#d7ff52" strokeOpacity=".76" strokeWidth="2" />
      <path d="m320 77 49 28v56l-49 28-49-28v-56l49-28Z" fill="#263723" stroke="#73d8c1" strokeWidth="2" />
      <path d="m320 97 31 18v36l-31 18-31-18v-36l31-18Z" fill="#d7ff52" />
      <circle cx="320" cy="133" r="9" fill="#172017" />
      {MOB_POSITIONS.slice(0, state.activeMobsCount).map((position, mobIndex) => (
        <g key={mobIndex} transform={`translate(${position.x} ${position.y})`}>
          <path d="m0-20 15 9v18L0 16l-15-9v-18L0-20Z" fill="#ed7655" />
          <circle cy="-1" r="4" fill="#172017" />
          <path d="M-20 22h40M-12 26h24" stroke="#ed7655" strokeOpacity=".58" />
        </g>
      ))}
      {state.miniBossActive && (
        <g transform="translate(510 141)">
          <path d="m0-44 39 23v45L0 47l-39-23v-45L0-44Z" fill="#813f32" stroke="#ff9a76" strokeWidth="3" />
          <path d="m0-26 23 14v27L0 29l-23-14v-27L0-26Z" fill="#ed7655" />
          <circle cx="-8" cy="-1" r="3" fill="#172017" /><circle cx="8" cy="-1" r="3" fill="#172017" />
        </g>
      )}
      <path d="M26 24h33M26 24v17m588-17h-33m33 0v17M26 208h33m-33 0v-17m588 17h-33m33 0v-17" stroke="#d7ff52" strokeWidth="2" />
    </svg>
  );
}

export function SentraCoreArenaView({ onNavigate }: SentraCoreArenaViewProps) {
  const [state, setState] = useState(() => SentraCoreArenaManager.initializeBattleRoom());
  const [announcement, setAnnouncement] = useState('Sala enlazada. Elige una mecánica para iniciar el tutorial táctico.');

  const performMechanic = (mechanic: ArenaMechanic) => {
    const result = SentraCoreArenaManager.performMechanic(state, mechanic);
    setState(result.state);
    setAnnouncement(result.message);
  };

  const defeatMiniBoss = () => {
    const result = SentraCoreArenaManager.defeatMiniBoss(state);
    setState(result.state);
    setAnnouncement(result.message);
  };

  const resetArena = () => {
    setState(SentraCoreArenaManager.initializeBattleRoom());
    setAnnouncement('Protocolo reiniciado. La cámara vuelve a estado inicial.');
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))) return;

      const mechanic = { q: 'vacuum', e: 'mutagen', f: 'bash' }[event.key.toLowerCase()] as ArenaMechanic | undefined;
      if (!mechanic) return;

      event.preventDefault();
      const result = SentraCoreArenaManager.performMechanic(state, mechanic);
      setState(result.state);
      setAnnouncement(result.message);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state]);

  return (
    <main className="arena-page">
      <header className="arena-header">
        <button type="button" className="arena-wordmark" onClick={() => onNavigate('/')} aria-label="Volver a Conquer of Darkness">CONQUER <span>//</span> SENTRA</button>
        <div className="arena-live"><span /> SIMULACIÓN LOCAL</div>
        <nav aria-label="Navegación de arena">
          <button type="button" onClick={() => onNavigate('/core')}>SENTRA CORE</button>
          <button type="button" onClick={() => onNavigate('/game')}>OPERACIONES</button>
          <button type="button" className="arena-exit" onClick={() => onNavigate('/')}>SALIR</button>
        </nav>
      </header>

      <div className="arena-content">
        <section className="arena-heading">
          <div>
            <p className="arena-eyebrow">PWA TRAINING SIM / ZONA C-04</p>
            <h1>Sala de <em>Arena</em></h1>
            <p className="arena-room-name">{state.roomName}</p>
          </div>
          <button type="button" className="arena-reset" onClick={resetArena}>REINICIAR <span aria-hidden="true">↻</span></button>
        </section>

        <section className="arena-readouts" aria-label="Estado de la arena">
          <div><span>OBJETIVOS ACTIVOS</span><strong>{state.activeMobsCount.toString().padStart(2, '0')}</strong></div>
          <div><span>TENSIÓN COLMENA</span><strong>{state.hiveTension}<small>%</small></strong></div>
          <div><span>MORAL REFUGIO</span><strong>{state.shelterMorale}<small>%</small></strong></div>
          <div><span>PÁNICO ENEMIGO</span><strong>{state.enemyPanic}<small>%</small></strong></div>
        </section>

        <div className="arena-layout">
          <section className={`arena-stage${state.miniBossActive ? ' is-boss' : ''}${state.roomComplete ? ' is-clear' : ''}`} aria-label="Escena de la cámara táctica">
            <div className="arena-stage-top"><span>CAM C-04 / FEED TÁCTICO</span><span>{state.roomComplete ? 'SECTOR ESTABILIZADO' : state.miniBossActive ? 'AMENAZA ÉLITE' : 'ESCANEO ACTIVO'}</span></div>
            <ArenaScene state={state} />
            <div className="arena-stage-bottom"><span>COMBATIENTES <b>{state.activeMobsCount.toString().padStart(2, '0')}</b></span><span>ARMA <b>{state.weaponDamageMultiplier.toFixed(2)}×</b></span><span>{state.mutagenApplied ? 'CEPA ACTIVA' : 'SIN MUTÁGENO'}</span></div>
            {state.miniBossActive && !state.roomComplete && (
              <button type="button" className="arena-boss-action" onClick={defeatMiniBoss}>NEUTRALIZAR MINIBOSS <span aria-hidden="true">↗</span></button>
            )}
            {state.roomComplete && <div className="arena-clear-stamp">CÁMARA DESPEJADA</div>}
          </section>

          <aside className="arena-tutorial" aria-labelledby="tutorial-title">
            <div className="arena-tutorial-title"><div><p className="arena-eyebrow">SENTRA COMBAT SCHOOL</p><h2 id="tutorial-title">Mecánicas</h2></div><span>{state.completedMechanics.length}/3</span></div>
            <div className="arena-mechanic-list">
              {MECHANICS.map((mechanic) => {
                const completed = state.completedMechanics.includes(mechanic.id);
                const disabled = state.roomComplete
                  || (mechanic.id === 'mutagen' && state.mutagenApplied)
                  || ((mechanic.id === 'vacuum' || mechanic.id === 'bash') && (state.activeMobsCount === 0 || state.miniBossActive));
                return (
                  <article className={`arena-mechanic${completed ? ' is-complete' : ''}`} key={mechanic.id}>
                    <div className="arena-mechanic-top"><span>{mechanic.key}</span><b>{completed ? 'REGISTRADO' : mechanic.id.toUpperCase()}</b></div>
                    <h3>{mechanic.title}</h3>
                    <p>{SentraCoreArenaManager.triggerMechanicTutorial(mechanic.id)}</p>
                    <button type="button" disabled={disabled} onClick={() => performMechanic(mechanic.id)}>{completed ? 'PRACTICAR DE NUEVO' : mechanic.action}</button>
                  </article>
                );
              })}
            </div>
            <p className="arena-announcement" role="status" aria-live="polite">{announcement}</p>
          </aside>
        </div>

        <footer className="arena-footer"><span>SENTRA CORE ORCHESTRATOR <i>·</i> EVENTO LOCAL</span><span>DATOS DE PRÁCTICA <b>NO PERSISTENTES</b></span></footer>
      </div>
    </main>
  );
}