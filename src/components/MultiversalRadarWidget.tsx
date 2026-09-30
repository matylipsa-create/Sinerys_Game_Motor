import { useState } from 'react';
import { MultiversalDriftManager } from '../core/MultiversalDriftManager';

interface Props {
  driftManager: MultiversalDriftManager;
}

const DIMENSIONS = [
  'Dimensión Espejo-7',
  'Sector Cero Absoluto',
  'Realidad de Fibras Fúngicas Oscuras',
  'Eje Multiversal Alfa',
];

function formatModifier(value: number): string {
  return `${value.toFixed(2)}×`;
}

export function MultiversalRadarWidget({ driftManager }: Props) {
  const [reality, setReality] = useState(() => driftManager.getCurrentReality());
  const [history, setHistory] = useState(() => driftManager.getShiftHistory());
  const [error, setError] = useState('');

  const handleBreach = () => {
    const dimension = DIMENSIONS[Math.floor(Math.random() * DIMENSIONS.length)];
    try {
      const nextReality = driftManager.breachObservableEdge(dimension);
      setReality(nextReality);
      setHistory(driftManager.getShiftHistory());
      setError('');
    } catch {
      setError('No se pudo estabilizar el salto dimensional.');
    }
  };

  const recentHistory = [...history].reverse().slice(0, 3);

  return (
    <section
      className="overflow-hidden border border-cyan-400/25 bg-[#080e14] font-mono text-cyan-50 shadow-[0_18px_60px_rgba(0,0,0,0.24)]"
      aria-labelledby="multiversal-radar-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-400/15 px-4 py-3 sm:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-500">Conquer // anomalous navigation</p>
          <h2 id="multiversal-radar-title" className="mt-1 text-base font-semibold text-white">
            Radar de deriva multiversal
          </h2>
        </div>
        <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider text-emerald-300" role="status">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" aria-hidden="true" />
          Filamento enlazado
        </span>
      </header>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.75fr)]">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Realidad actual</p>
          <p className="mt-1 break-words text-lg font-semibold text-white">{reality.universeName}</p>
          <p className="mt-1 break-all text-[11px] text-zinc-500">ID · {reality.realityId}</p>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="text-zinc-400">Resonancia de filamentos</span>
              <strong className="tabular-nums text-cyan-200">{reality.filamentResonance}%</strong>
            </div>
            <div
              className="h-2 overflow-hidden bg-zinc-800"
              role="progressbar"
              aria-label="Resonancia de filamentos"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={reality.filamentResonance}
            >
              <div
                className="h-full bg-cyan-400 transition-[width] duration-500"
                style={{ width: `${reality.filamentResonance}%` }}
              />
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-3 divide-x divide-zinc-800 border-y border-zinc-800 py-3">
            <div className="px-2 first:pl-0">
              <dt className="text-[9px] uppercase leading-tight text-zinc-500 sm:text-[10px]">Mutación de esporas</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-amber-200">
                {formatModifier(reality.physicalModifiers.sporeMutationRate)}
              </dd>
            </div>
            <div className="px-2">
              <dt className="text-[9px] uppercase leading-tight text-zinc-500 sm:text-[10px]">Eficiencia trituradora</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-emerald-200">
                {formatModifier(reality.physicalModifiers.grinderEfficiency)}
              </dd>
            </div>
            <div className="px-2 pr-0">
              <dt className="text-[9px] uppercase leading-tight text-zinc-500 sm:text-[10px]">Entropía</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-rose-200">
                {formatModifier(reality.physicalModifiers.entropyRate)}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-zinc-400">{reality.anomalyDescription}</p>

          <button
            type="button"
            onClick={handleBreach}
            className="mt-5 min-h-11 w-full border border-cyan-300/40 bg-cyan-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 transition-colors hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          >
            Cruzar borde observable
          </button>
          {error && <p className="mt-2 text-xs text-rose-300" role="alert">{error}</p>}
        </div>

        <aside className="border-t border-zinc-800 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0" aria-label="Historial de saltos">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">Saltos recientes</h3>
            <span className="text-[10px] tabular-nums text-zinc-500">{history.length} registrados</span>
          </div>
          {recentHistory.length > 0 ? (
            <ol className="mt-3 space-y-3">
              {recentHistory.map((previousReality) => (
                <li key={previousReality.realityId} className="border-l border-cyan-400/40 pl-3">
                  <p className="break-words text-xs text-zinc-300">{previousReality.universeName}</p>
                  <p className="mt-1 break-all text-[10px] text-zinc-600">{previousReality.realityId}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">Aún no se han registrado saltos desde la realidad base.</p>
          )}
        </aside>
      </div>
    </section>
  );
}