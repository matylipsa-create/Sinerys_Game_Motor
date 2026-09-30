import { useEffect, useState } from 'react';
import type { P2PRadarManager, RadarPing } from '../services/P2PRadarManager';

interface Props {
  radarManager: P2PRadarManager;
  localPlayerId: string;
}

const pingLabels: Record<RadarPing['type'], string> = {
  sos: 'SOS',
  resource_cache: 'Recursos',
  chimera_swarm: 'Enjambre',
};

const pingColors: Record<RadarPing['type'], string> = {
  sos: 'bg-red-500 shadow-red-500/60',
  resource_cache: 'bg-amber-400 shadow-amber-400/60',
  chimera_swarm: 'bg-cyan-400 shadow-cyan-400/60',
};

export function CommunityRadarPanel({ radarManager, localPlayerId }: Props) {
  const [pings, setPings] = useState<RadarPing[]>([]);

  useEffect(() => {
    const refresh = () => setPings(radarManager.getCommunityRadarData());
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => window.clearInterval(interval);
  }, [radarManager]);

  return (
    <section className="border border-emerald-500/30 bg-zinc-950 p-4 font-mono text-emerald-300" aria-label="Radar táctico comunitario">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest">Conquer // Radar P2P</p>
          <p className="mt-1 text-[11px] text-zinc-500">Malla comunitaria · señales recientes</p>
        </div>
        <span className="flex items-center gap-2 text-[10px] uppercase text-emerald-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
          Radar listo
        </span>
      </header>

      <div className="relative h-64 overflow-hidden border border-zinc-800 bg-black/80" role="img" aria-label={`Radar con ${pings.length} señales activas`}>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.08)_1px,transparent_1px)] bg-[size:25%_25%]" />
        <div className="absolute inset-0 rounded-full border border-emerald-500/15" />
        <div className="absolute inset-[16%] rounded-full border border-emerald-500/15" />
        <div className="absolute inset-[33%] rounded-full border border-emerald-500/15" />
        <div className="absolute left-1/2 top-0 h-full border-l border-emerald-500/10" />
        <div className="absolute left-0 top-1/2 w-full border-t border-emerald-500/10" />

        {pings.map((ping) => {
          const isLocalPlayer = ping.senderId === localPlayerId;
          const position = (coordinate: number) => `${Math.max(2, Math.min(98, coordinate))}%`;
          return (
            <span
              key={`${ping.senderId}-${ping.timestamp}`}
              className={`absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg ${pingColors[ping.type]} ${ping.type === 'sos' ? 'animate-ping' : ''} ${isLocalPlayer ? 'ring-2 ring-white' : ''}`}
              style={{ left: position(ping.x), top: position(ping.y) }}
              title={`${pingLabels[ping.type]} · ${ping.senderId}`}
            />
          );
        })}

        {pings.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600">Sin señales recientes</p>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-zinc-400" aria-label="Tipos de señal">
        {(Object.keys(pingLabels) as RadarPing['type'][]).map((type) => (
          <li key={type} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${pingColors[type].split(' ')[0]}`} aria-hidden="true" />
            {pingLabels[type]}
          </li>
        ))}
      </ul>
    </section>
  );
}