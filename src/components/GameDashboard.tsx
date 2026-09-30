import { useState } from 'react';
import type { GameEngineCore } from '../core/GameEngineCore';
import { MultiversalRadarWidget } from './MultiversalRadarWidget';

interface Props {
  engine: GameEngineCore;
}

const SECTORS = [
  'Sector Alpha',
  'Reactor Subnivel 3',
  'Invernadero Fúngico',
  'Bahía de Despresurización',
];

export function GameDashboard({ engine }: Props) {
  const [stats, setStats] = useState(() => engine.paradoxDirector.getGlobalState());
  const [currentCrisis, setCurrentCrisis] = useState(() =>
    engine.paradoxDirector.triggerSystemicCrisis('Sector 7-Alfa'),
  );
  const [isResolved, setIsResolved] = useState(false);
  const [logMessage, setLogMessage] = useState('Motor sincronizado. Esperando decisiones estratégicas.');

  const handleResolve = (choiceId: string) => {
    const result = engine.paradoxDirector.resolveCrisis(currentCrisis.id, choiceId);
    setLogMessage(result.message);
    setStats(engine.paradoxDirector.getGlobalState());
    if (result.success) setIsResolved(true);
  };

  const handleNewCrisis = () => {
    const randomSector = SECTORS[Math.floor(Math.random() * SECTORS.length)];
    setCurrentCrisis(engine.paradoxDirector.triggerSystemicCrisis(randomSector));
    setIsResolved(false);
    setLogMessage(`¡Alerta sistémica! Nueva crisis detectada en ${randomSector}.`);
  };

  return (
    <main className="min-h-screen bg-[#07100d] px-4 pb-12 pt-20 font-mono text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-emerald-300/20 pb-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Conquer of Darkness // Sentra Core</p>
            <h1 className="mt-2 text-xl font-semibold text-white sm:text-2xl">Centro de operaciones</h1>
          </div>
          <span className="inline-flex min-h-10 items-center gap-2 border border-emerald-300/25 px-3 text-xs text-emerald-200" role="status">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            Motor activo · PWA
          </span>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(230px,0.72fr)_minmax(0,1.5fr)]">
          <section aria-labelledby="resources-title" className="border-y border-amber-300/20 py-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70">Estado estratégico</p>
            <h2 id="resources-title" className="mt-1 text-base font-semibold text-amber-100">Refugio y recursos</h2>

            <dl className="mt-5 space-y-4">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-zinc-400">Moral del refugio</dt>
                <dd className="text-lg font-semibold tabular-nums text-emerald-200">{stats.refugeMorale}%</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-zinc-400">Tensión de la colmena</dt>
                <dd className="text-lg font-semibold tabular-nums text-rose-200">{stats.hiveTension}%</dd>
              </div>
            </dl>

            <h3 className="mt-6 border-t border-zinc-800 pt-4 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Existencias</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between gap-3"><span className="text-zinc-400">Biomasa</span><span className="tabular-nums">{stats.resourceStockpiles.biomass}</span></li>
              <li className="flex justify-between gap-3"><span className="text-zinc-400">Aleación</span><span className="tabular-nums">{stats.resourceStockpiles.alloy}</span></li>
              <li className="flex justify-between gap-3"><span className="text-zinc-400">Suero de esporas</span><span className="tabular-nums">{stats.resourceStockpiles.sporeSerum}</span></li>
            </ul>
          </section>

          <MultiversalRadarWidget driftManager={engine.multiversalManager} />
        </div>

        <section aria-labelledby="crisis-title" className="mt-8 border-t border-rose-300/25 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-300">Alerta sistémica · {currentCrisis.affectedSector}</p>
              <h2 id="crisis-title" className="mt-1 text-lg font-semibold text-white">{currentCrisis.title}</h2>
            </div>
            <button
              type="button"
              onClick={handleNewCrisis}
              className="min-h-11 border border-amber-200/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-amber-100 transition-colors hover:bg-amber-200 hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
            >
              Simular nueva crisis
            </button>
          </div>

          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-zinc-300">{currentCrisis.description}</p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {currentCrisis.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => handleResolve(choice.id)}
                disabled={isResolved}
                className="min-h-36 border border-cyan-200/20 bg-[#0b1713] p-4 text-left transition-colors hover:border-cyan-200/55 hover:bg-[#10221a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <strong className="text-sm text-cyan-100">{choice.label}</strong>
                <span className="mt-2 block text-xs leading-relaxed text-zinc-400">{choice.outcomeDescription}</span>
                <span className="mt-3 block text-[11px] text-zinc-500">
                  Moral {choice.moralImpact > 0 ? '+' : ''}{choice.moralImpact} · Seguridad {choice.securityImpact > 0 ? '+' : ''}{choice.securityImpact}
                </span>
                <span className="mt-1 block text-[10px] text-zinc-500">
                  Coste: {Object.entries(choice.resourceCost).map(([resource, amount]) => `${resource} ${amount}`).join(' · ')}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-5 border-l-2 border-emerald-300/60 bg-emerald-950/25 px-4 py-3 text-xs leading-relaxed text-emerald-100" role="status" aria-live="polite">
            <span className="font-semibold uppercase tracking-wider">Bitácora · </span>{logMessage}
          </p>
        </section>
      </div>
    </main>
  );
}