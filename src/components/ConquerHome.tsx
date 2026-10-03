import './ConquerHome.css';

interface ConquerHomeProps {
  onNavigate: (route: string) => void;
}

export function ConquerHome({ onNavigate }: ConquerHomeProps) {
  return (
    <main className="conquer-home">
      <section className="conquer-hero" aria-labelledby="conquer-title">
        <div className="conquer-hero-grid" aria-hidden="true" />
        <header className="conquer-header">
          <a className="conquer-brand" href="/" aria-label="Conquer of Darkness, inicio">
            <img src="/icon.svg" alt="" width="42" height="42" />
            <span><strong>CONQUER</strong><small>OF DARKNESS</small></span>
          </a>
          <div className="conquer-nav-status"><span /> SENTRA CORE / ONLINE</div>
          <nav className="conquer-nav" aria-label="Navegación principal">
            <button type="button" className="conquer-nav-link" onClick={() => onNavigate('/core')}>EL MOTOR</button>
            <button type="button" className="conquer-nav-link" onClick={() => onNavigate('/paradox')}>PARADOX</button>
            <button type="button" className="conquer-nav-cta" onClick={() => onNavigate('/core')}>ABRIR ORQUESTADOR <span aria-hidden="true">↗</span></button>
          </nav>
        </header>

        <div className="conquer-hero-content">
          <div className="conquer-copy">
            <p className="conquer-kicker"><span>PROTOTIPO DE SUPERVIVENCIA SCI-FI</span><i>BUILD 04 / SENTRA CORE</i></p>
            <h1 id="conquer-title">Conquer<br />of <em>Darkness</em></h1>
            <p className="conquer-intro">El refugio no sigue un guion. <strong>El mundo responde.</strong></p>
            <p className="conquer-description">Dirige una colonia al borde del colapso. Sentra Core Orchestrator convierte cada decisión en una nueva condición del mundo.</p>
            <div className="conquer-actions">
              <button type="button" className="conquer-play" onClick={() => onNavigate('/arena')}>
                <span className="conquer-play-icon" aria-hidden="true">▶</span> CONTINUAR AL ORQUESTADOR
              </button>
              <button type="button" className="conquer-engine-link" onClick={() => onNavigate('/core')}>
                EXPLORAR SENTRA CORE <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="conquer-specs" aria-label="Estado del proyecto">
              <span><i>ESTADO</i> PROTOTIPO JUGABLE</span>
              <span><i>MOTOR</i> SENTRA CORE ORCHESTRATOR</span>
              <span><i>FORMATO</i> OFFLINE-FIRST</span>
            </div>
          </div>

          <figure className="conquer-art">
            <img src="/conquer-orchestrator.svg" alt="Ilustración del núcleo Sentra: un reactor geométrico enlaza percepción, decisiones y sistemas de juego sobre un refugio en ruinas." />
            <figcaption><span>FIG. 01</span> SENTRA CORE / WORLD RESPONSE MODEL</figcaption>
          </figure>
        </div>
        <div className="conquer-hero-edge" aria-hidden="true"><span>SECTOR 07 — LA FRONTERA PERMANECE ABIERTA</span><span>ARRASTRA EL FUTURO / 00:00:04</span></div>
      </section>

      <section className="conquer-loop" aria-labelledby="loop-title">
        <div className="conquer-section-heading">
          <div><p className="conquer-label">EL BUCLE DEL ORQUESTADOR <span>01—03</span></p><h2 id="loop-title">Una decisión nunca termina en el clic.</h2></div>
          <p>Sentra conecta señales del mundo con consecuencias que permanecen.</p>
        </div>
        <div className="conquer-loop-grid">
          <article className="conquer-loop-step">
            <span className="conquer-step-number">01</span>
            <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 34c8-15 18-22 24-22s16 7 24 22c-8 15-18 22-24 22S16 49 8 34Z"/><circle cx="32" cy="34" r="9"/><path d="M3 10h12M49 10h12M3 58h12M49 58h12"/></svg>
            <h3>Percibe</h3><p>Entropía, recursos y tensiones entran al estado compartido del mundo.</p>
          </article>
          <article className="conquer-loop-step">
            <span className="conquer-step-number">02</span>
            <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 57 19v26L32 59 7 45V19L32 5Z"/><path d="m32 17 13 8v14l-13 8-13-8V25l13-8Z"/><path d="M32 5v12m25 2-12 6M57 45l-12-6M32 59V47M7 45l12-6M7 19l12 6"/></svg>
            <h3>Orquesta</h3><p>El motor evalúa crisis, alternativas y costes antes de cambiar el estado.</p>
          </article>
          <article className="conquer-loop-step">
            <span className="conquer-step-number">03</span>
            <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M7 53h50M12 53V35l10-7 8 7 10-15 12 8v25M22 28V15l10-7 8 4v8M8 19h8m-4-4v8M48 9h10m-5-5v10"/><circle cx="40" cy="18" r="3"/></svg>
            <h3>Transforma</h3><p>La colonia recuerda. Las facciones y el entorno reaccionan a lo ocurrido.</p>
          </article>
        </div>
      </section>

      <section className="conquer-access" aria-label="Entradas al proyecto">
        <div className="conquer-access-title"><p className="conquer-label">ELIGE TU PUNTO DE ENTRADA</p><h2>Un mundo.<br /><em>Varios sistemas.</em></h2></div>
        <button type="button" className="conquer-access-row" onClick={() => onNavigate('/arena')}><span className="conquer-access-index">A</span><span><strong>Sala de arena</strong><small>Entrena las mecánicas tácticas de Conquer.</small></span><b aria-hidden="true">↗</b></button>
        <button type="button" className="conquer-access-row" onClick={() => onNavigate('/game')}><span className="conquer-access-index">B</span><span><strong>Centro de operaciones</strong><small>Resuelve una crisis sistémica en la demo estratégica.</small></span><b aria-hidden="true">↗</b></button>
        <button type="button" className="conquer-access-row" onClick={() => onNavigate('/core')}><span className="conquer-access-index">C</span><span><strong>Sentra Core</strong><small>Explora el orquestador y sus módulos adaptativos.</small></span><b aria-hidden="true">↗</b></button>
        <button type="button" className="conquer-access-row" onClick={() => onNavigate('/paradox')}><span className="conquer-access-index">D</span><span><strong>Paradox Orchestrator</strong><small>Administra recursos, refugio, mutaciones y crisis.</small></span><b aria-hidden="true">↗</b></button>
        <button type="button" className="conquer-access-row" onClick={() => onNavigate('/paradox-baseline')}><span className="conquer-access-index">E</span><span><strong>Paradox technical baseline</strong><small>Revisa las reglas de mutación, cámaras y percepción espectral.</small></span><b aria-hidden="true">↗</b></button>
      </section>

      <footer className="conquer-footer"><a className="conquer-footer-brand" href="/">CONQUER OF DARKNESS</a><span>UN PROYECTO DE SENTRA CORE</span><span>PROTOTIPO EN DESARROLLO · 2026</span></footer>
    </main>
  );
}