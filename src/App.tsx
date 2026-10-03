import { lazy, startTransition, Suspense, useEffect, useRef, useState } from 'react';
import type { ConquerOrchestrator } from './core/ConquerOrchestrator';
import type { GameSessionExport, OrchestratorBridge, PartyChoice, PartyMember } from './core/game/OrchestratorBridge';
import type { WorldResponderSystem } from './core/game/WorldResponderSystem';
import type { PlayerIntent } from './core/game/PlayerIntent';
import { InterfaceSettings } from './components/InterfaceSettings';
import { ConquerHome } from './components/ConquerHome';

const SentraCoreDashboard = lazy(() => import('./components/SentraCoreDashboard').then((module) => ({
  default: module.SentraCoreDashboard,
})));
const MasterEngineDashboard = lazy(() => import('./components/MasterEngineDashboard').then((module) => ({
  default: module.MasterEngineDashboard,
})));
const SentraCoreArenaView = lazy(() => import('./pwa/arena/SentraCoreArenaView').then((module) => ({
  default: module.SentraCoreArenaView,
})));
const ParadoxPlayground = lazy(() => import('./components/ParadoxPlayground').then((module) => ({
  default: module.ParadoxPlayground,
})));

const SIMULATION_TICK_MS = 1000 / 60;
const PARTY_CHANNEL = 'fall-of-zion-party-alpha';

const STARTING_PARTY: PartyMember[] = [
  {
    id: 'aria-venn', name: 'Aria Venn', archetype: 'Vanguardia', level: 5,
    health: 42, maxHealth: 50, equipment: ['Claymore +5'], inventory: ['Poison Pearl'],
    statuses: [], lastIntent: null,
  },
  {
    id: 'kael-sorn', name: 'Kael Sorn', archetype: 'Rastreador', level: 4,
    health: 34, maxHealth: 40, equipment: ['Arco de ceniza'], inventory: ['Tónico de campo'],
    statuses: [], lastIntent: null,
  },
  {
    id: 'mira-sol', name: 'Mira Sol', archetype: 'Custodia', level: 4,
    health: 38, maxHealth: 45, equipment: ['Orbe de vigilia'], inventory: ['Sal de aurora'],
    statuses: [], lastIntent: null,
  },
];

interface GameRuntime {
  engine: ConquerOrchestrator;
  worldResponder: WorldResponderSystem;
  bridge: OrchestratorBridge;
  peerConnections: Set<RTCPeerConnection>;
  peerDisconnectors: Set<() => void>;
  activeEffects: number;
  lifecycleQueue: Promise<void>;
  restorePromise: Promise<boolean> | null;
}

async function createGameRuntime(): Promise<GameRuntime> {
  const [{ ConquerOrchestrator }, { OrchestratorBridge }, { WorldResponderSystem }, { SentraCoreArenaManager }] = await Promise.all([
    import('./core/ConquerOrchestrator'),
    import('./core/game/OrchestratorBridge'),
    import('./core/game/WorldResponderSystem'),
    import('./pwa/arena/SentraCoreArena'),
  ]);
  const engine = new ConquerOrchestrator('fall-of-zion-party-alpha');
  const worldResponder = new WorldResponderSystem();
  engine.registerSystem(worldResponder);
  const bridge = new OrchestratorBridge(engine);
  bridge.initializeParty(STARTING_PARTY);
  bridge.initializeArenaState(SentraCoreArenaManager.initializeBattleRoom());
  return {
    engine,
    worldResponder,
    bridge,
    peerConnections: new Set(),
    peerDisconnectors: new Set(),
    activeEffects: 0,
    lifecycleQueue: Promise.resolve(),
    restorePromise: null,
  };
}

function getRoute(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function waitForIceGatheringComplete(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const onGatheringStateChange = () => {
      if (connection.iceGatheringState !== 'complete') return;
      connection.removeEventListener('icegatheringstatechange', onGatheringStateChange);
      resolve();
    };
    connection.addEventListener('icegatheringstatechange', onGatheringStateChange);
    onGatheringStateChange();
  });
}

function GameRoute({ onBack, runtime, onPersistenceError }: {
  onBack: () => void;
  runtime: GameRuntime;
  onPersistenceError: (message: string) => void;
}) {
  const { engine, worldResponder, bridge } = runtime;
  const [gameState, setGameState] = useState(() => bridge.getGameState());
  const [activeMemberId, setActiveMemberId] = useState(STARTING_PARTY[0].id);
  const [peerSignalInput, setPeerSignalInput] = useState('');
  const [peerSignalOutput, setPeerSignalOutput] = useState('');
  const [peerStatus, setPeerStatus] = useState('Party local disponible');
  const [exportStatus, setExportStatus] = useState('');
  const [actionError, setActionError] = useState('');
  const [narrative, setNarrative] = useState([
    'La lluvia negra golpea el patio hundido. Bajo la ciudadela, una escalera se abre entre raíces petrificadas; el polvo cae hacia arriba.',
    'CORO / susurro: «Tres nombres cruzaron el umbral. La torre ya conoce sus heridas.»',
  ]);

  useEffect(() => {
    let active = true;
    let frameId = 0;
    const disconnectParty = bridge.connectLocalParty(PARTY_CHANNEL);
    const unsubscribe = bridge.subscribeRenderer((message) => {
      setGameState(bridge.getGameState());
      if (message.kind !== 'event') return;
      const payload = message.event.payload as { narrative?: unknown; delta?: unknown; currentTension?: unknown };
      if (typeof payload.narrative === 'string') {
        setNarrative((entries) => [...entries, payload.narrative as string].slice(-12));
      } else if (message.event.type === 'player:health:delta' && typeof payload.delta === 'number') {
        setNarrative((entries) => [...entries, `El grupo siente el golpe: ${payload.delta} salud.`].slice(-12));
      } else if (message.event.type === 'tension_increase') {
        setNarrative((entries) => [...entries, `CORO / crescendo: «La torre se tensa (${String(payload.currentTension ?? '?')}/100).»`].slice(-12));
      }
    });
    const tick = () => {
      if (!active) return;
      engine.time.advance(SIMULATION_TICK_MS);
      worldResponder.update();
      frameId = window.requestAnimationFrame(tick);
    };

    runtime.activeEffects += 1;
    const startPromise = runtime.lifecycleQueue.then(() => engine.start());
    runtime.lifecycleQueue = startPromise.catch((error: unknown) => {
      if (active) onPersistenceError(`No se pudo iniciar el motor: ${error instanceof Error ? error.message : String(error)}`);
    });
    void startPromise.then(() => {
      if (active) frameId = window.requestAnimationFrame(tick);
    }, (error: unknown) => {
      if (active) onPersistenceError(`No se pudo iniciar el motor: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => {
      active = false;
      runtime.activeEffects -= 1;
      window.cancelAnimationFrame(frameId);
      unsubscribe();
      disconnectParty();
      if (runtime.activeEffects === 0) {
        for (const disconnect of runtime.peerDisconnectors) disconnect();
        runtime.peerDisconnectors.clear();
        bridge.closePartyConnections();
        for (const peer of runtime.peerConnections) peer.close();
        runtime.peerConnections.clear();
        const stopPromise = runtime.lifecycleQueue.then(() => {
          if (runtime.activeEffects === 0) return engine.stop();
        });
        runtime.lifecycleQueue = stopPromise.catch((error: unknown) => {
          console.error('[GameRoute] No se pudo detener el motor:', error);
        });
      }
    };
  }, [bridge, engine, onPersistenceError, runtime, worldResponder]);

  const selectedMember = gameState.partyState.members.find((member) => member.id === activeMemberId)
    ?? gameState.partyState.members[0];
  const actingMemberId = selectedMember?.id ?? activeMemberId;
  const encounterId = `tower-sentinel-floor-${gameState.dungeonState.currentFloor}`;
  const encounter = gameState.enemyState[encounterId];
  const encounterMaxHealth = 72 + (gameState.dungeonState.currentFloor - 1) * 5;
  const encounterHealth = Math.max(0, encounter?.health ?? encounterMaxHealth);
  const encounterDefeated = Boolean(encounter && encounter.health <= 0);
  const corePulsesRemaining = Math.max(0, 3 - gameState.arsState.coreSkillUses);
  const rewardItemId = `Eco de la torre ${gameState.dungeonState.currentFloor}`;
  const rewardClaimed = gameState.partyState.members.some((member) => member.inventory.includes(rewardItemId));
  const partyDefeated = gameState.partyState.members.every((member) => member.health <= 0);

  const dispatchIntent = (intent: PlayerIntent) => {
    try {
      setActionError('');
      setGameState(bridge.dispatchPartyIntent(intent, actingMemberId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo completar la acción.');
    }
  };
  const dispatchChoice = (choice: PartyChoice, text: string) => {
    try {
      setActionError('');
      setGameState(bridge.dispatchChoice(choice, text));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo completar la acción.');
    }
  };
  const createPeerOffer = async () => {
    if (typeof RTCPeerConnection === 'undefined') {
      setPeerStatus('WebRTC no está disponible en este navegador.');
      return;
    }
    try {
      const peer = new RTCPeerConnection({ iceServers: [] });
      runtime.peerConnections.add(peer);
      peer.onconnectionstatechange = () => setPeerStatus(`Enlace P2P: ${peer.connectionState}`);
      const channel = peer.createDataChannel('fall-of-zion-actions', { ordered: true });
      runtime.peerDisconnectors.add(bridge.connectPeer(channel));
      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceGatheringComplete(peer);
      setPeerSignalOutput(JSON.stringify(peer.localDescription));
      setPeerStatus('Oferta lista. Envíala al otro aventurero.');
    } catch {
      setPeerStatus('No se pudo crear la oferta P2P.');
    }
  };
  const answerPeerOffer = async () => {
    if (typeof RTCPeerConnection === 'undefined') {
      setPeerStatus('WebRTC no está disponible en este navegador.');
      return;
    }
    try {
      const description = JSON.parse(peerSignalInput) as RTCSessionDescriptionInit;
      if (description.type !== 'offer' || typeof description.sdp !== 'string') throw new Error('Invalid offer.');
      const peer = new RTCPeerConnection({ iceServers: [] });
      runtime.peerConnections.add(peer);
      peer.onconnectionstatechange = () => setPeerStatus(`Enlace P2P: ${peer.connectionState}`);
      peer.ondatachannel = (message) => runtime.peerDisconnectors.add(bridge.connectPeer(message.channel));
      await peer.setRemoteDescription(description);
      await peer.setLocalDescription(await peer.createAnswer());
      await waitForIceGatheringComplete(peer);
      setPeerSignalOutput(JSON.stringify(peer.localDescription));
      setPeerStatus('Respuesta lista. Envíala al aventurero que creó la oferta.');
    } catch {
      setPeerStatus('La oferta no es válida o no pudo responderse.');
    }
  };
  const applyPeerAnswer = async () => {
    try {
      const description = JSON.parse(peerSignalInput) as RTCSessionDescriptionInit;
      if (description.type !== 'answer' || typeof description.sdp !== 'string') throw new Error('Invalid answer.');
      const peer = [...runtime.peerConnections].find((connection) => connection.signalingState === 'have-local-offer');
      if (!peer) throw new Error('No pending offer.');
      await peer.setRemoteDescription(description);
      setPeerStatus(`Enlace P2P: ${peer.connectionState}`);
    } catch {
      setPeerStatus('La respuesta no es válida o no hay una oferta pendiente.');
    }
  };
  const exportSession = async () => {
    try {
      const session = await bridge.exportSession({
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      });
      const json = JSON.stringify(session, null, 2);
      const parsed = JSON.parse(json) as GameSessionExport;
      if (!parsed.session_id || !parsed.started_at || !Array.isArray(parsed.events)
        || !parsed.final_state_hash || !parsed.device_info) {
        throw new Error('La sesión exportada no cumple con el formato requerido.');
      }

      const downloadUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = `conquer-session-${session.session_id}.json`;
      downloadLink.click();
      URL.revokeObjectURL(downloadUrl);
      setExportStatus(`Sesión exportada: ${session.events.length} eventos.`);
    } catch (error) {
      setExportStatus(`No se pudo exportar la sesión: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const partyHealth = gameState.partyState.members.reduce((sum, member) => sum + member.health, 0);
  const partyMaxHealth = gameState.partyState.members.reduce((sum, member) => sum + member.maxHealth, 0);
  const encounterHealthPercent = Math.max(0, Math.min(100, (encounterHealth / encounterMaxHealth) * 100));

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080a10] px-4 pb-12 pt-20 font-sans text-zinc-100 sm:px-6 lg:px-8">
      <InterfaceSettings />
      <nav aria-label="Navegación principal" className="fixed right-4 top-4 z-[10000]">
        <button type="button" onClick={onBack} className="min-h-11 rounded-md border border-white/15 bg-[#0c111bcc] px-4 font-mono text-[11px] font-semibold tracking-[0.16em] text-zinc-200 shadow-xl backdrop-blur transition hover:border-amber-200/60 hover:text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200">← SALIR</button>
      </nav>
      <section className="relative mx-auto max-w-[1440px]" aria-labelledby="game-title">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-5">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.26em] text-amber-200/70">FALL OF ZION <span className="mx-2 text-white/20">/</span> LIBRO I</p>
            <h1 id="game-title" className="mt-2 text-3xl font-semibold tracking-tight text-[#f7f0df] sm:text-4xl">La torre bajo la lluvia negra</h1>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
              <span>Piso {gameState.dungeonState.currentFloor.toString().padStart(2, '0')} <span className="text-zinc-600">/ 15</span></span>
              <span>Bloque {gameState.worldState.block.toString().padStart(2, '0')}</span>
              <span className={gameState.partyState.cooperative ? 'text-emerald-300' : 'text-zinc-400'}>{gameState.partyState.cooperative ? '● Party enlazada' : '● Party local'}</span>
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void exportSession()} className="min-h-11 rounded-md border border-amber-100/20 bg-white/[0.03] px-4 py-2 font-mono text-[10px] font-semibold tracking-[0.14em] text-amber-100 transition hover:border-amber-200/60 hover:bg-amber-100/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200">
              EXPORTAR SESIÓN
            </button>
            {exportStatus && <p role="status" aria-live="polite" className="text-sm text-zinc-300">{exportStatus}</p>}
          </div>
        </header>
        <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 font-mono sm:grid-cols-4">
          <div className="bg-[#10131a] p-4 sm:px-5"><dt className="text-[9px] font-semibold tracking-[0.18em] text-zinc-500">SALUD DEL GRUPO</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-emerald-200">{partyHealth}<span className="ml-2 text-xs font-normal text-zinc-500">/ {partyMaxHealth} HP</span></dd><div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-300" style={{ width: `${partyMaxHealth ? Math.max(0, Math.min(100, partyHealth / partyMaxHealth * 100)) : 0}%` }} /></div></div>
          <div className="bg-[#10131a] p-4 sm:px-5"><dt className="text-[9px] font-semibold tracking-[0.18em] text-zinc-500">TENSIÓN DEL UMBRAL</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-rose-200">{gameState.arsState.tension}<span className="ml-1 text-xs font-normal text-zinc-500">/ 100</span></dd><div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500" style={{ width: `${gameState.arsState.tension}%` }} /></div></div>
          <div className="bg-[#10131a] p-4 sm:px-5"><dt className="text-[9px] font-semibold tracking-[0.18em] text-zinc-500">PULSOS CORE</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-cyan-200">{corePulsesRemaining}<span className="ml-2 text-[10px] font-medium uppercase tracking-widest text-zinc-500">disponibles</span></dd><div className="mt-3 flex gap-1.5" aria-label={`${corePulsesRemaining} pulsos core disponibles`}>{Array.from({ length: 3 }, (_, index) => <span key={index} className={`h-1 flex-1 rounded-full ${index < corePulsesRemaining ? 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,.5)]' : 'bg-zinc-800'}`} />)}</div></div>
          <div className="bg-[#10131a] p-4 sm:px-5"><dt className="text-[9px] font-semibold tracking-[0.18em] text-zinc-500">ACCIONES DE COMBATE</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-amber-100">{gameState.arsState.combatActions}</dd><p className="mt-2 text-[10px] text-zinc-600">Cada decisión queda en la crónica</p></div>
        </dl>
        {actionError && <p role="alert" className="mb-5 rounded-lg border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">{actionError}</p>}
        {partyDefeated && <p role="alert" className="mb-5 rounded-lg border border-rose-400/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">La expedición ha caído. El checkpoint conserva el estado de la party.</p>}
        <div className="grid items-start gap-6 py-2 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
          <section aria-labelledby="story-title" className="overflow-hidden rounded-2xl border border-amber-100/15 bg-[#11141b] shadow-[0_24px_80px_rgba(0,0,0,.35)]">
            <div className="relative isolate flex min-h-[280px] flex-col justify-between overflow-hidden bg-[radial-gradient(ellipse_at_50%_80%,rgba(105,67,40,.34),transparent_56%),linear-gradient(145deg,rgba(39,32,34,.82),rgba(10,13,19,.98)_72%)] p-5 sm:min-h-[350px] sm:p-8">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-[0.15]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)', backgroundSize: '38px 38px' }} />
              <div className="relative z-10 flex items-center justify-between gap-3 font-mono text-[9px] font-semibold tracking-[0.2em] text-amber-100/60"><span>ENCUENTRO {gameState.dungeonState.currentFloor.toString().padStart(2, '0')} / CÁMARA DE LA ESCALERA</span><span className={`rounded-full border px-3 py-1 ${encounterDefeated ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' : encounter ? 'border-rose-300/30 bg-rose-300/10 text-rose-200' : 'border-white/10 bg-white/[0.04] text-zinc-400'}`}>{encounterDefeated ? 'DERROTADO' : encounter ? 'EN COMBATE' : 'ACECHANDO'}</span></div>
              <svg aria-hidden="true" viewBox="0 0 320 250" className={`absolute left-1/2 top-1/2 h-52 w-64 -translate-x-1/2 -translate-y-1/2 text-amber-100/50 transition duration-500 sm:h-64 sm:w-80 ${encounterDefeated ? 'scale-90 opacity-15' : encounter ? 'scale-105 opacity-80 drop-shadow-[0_0_26px_rgba(251,191,36,.2)]' : 'opacity-35'}`}>
                <path d="M160 22 184 80 236 54 219 111 283 118 232 151 265 208 199 191 160 242 139 187 72 211 95 151 34 119 101 108 83 53 139 79Z" fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeOpacity=".5" strokeWidth="2" />
                <path d="M160 59 181 112 211 91 199 132 228 146 187 158 180 193 158 174 137 194 132 158 93 145 123 131 113 94 141 111Z" fill="currentColor" fillOpacity=".1" stroke="currentColor" strokeOpacity=".65" strokeWidth="2" />
                <path d="m134 130 17 5-13 7m48-12-17 5 13 7M148 159l12 7 13-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                <circle cx="160" cy="137" r="67" fill="none" stroke="currentColor" strokeDasharray="3 9" strokeOpacity=".45" />
              </svg>
              <div className="relative z-10 mx-auto w-full max-w-lg">
                <p className="font-mono text-[9px] font-semibold tracking-[0.2em] text-rose-200/70">HOSTIL · NIVEL {gameState.dungeonState.currentFloor + 2}</p>
                <h2 id="story-title" className="mt-1 text-xl font-semibold text-[#f7f0df] sm:text-2xl">Centinela {gameState.worldState.block === 1 ? 'de ceniza' : `del bloque ${gameState.worldState.block}`}</h2>
                <div className="mt-3 flex items-center justify-between font-mono text-xs tabular-nums text-rose-100"><span>HP DEL ENEMIGO</span><span>{encounterHealth} <span className="text-zinc-500">/ {encounterMaxHealth}</span></span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full border border-white/10 bg-black/60"><div className={`h-full rounded-full transition-[width] duration-500 ${encounterDefeated ? 'bg-emerald-300' : 'bg-gradient-to-r from-rose-800 via-rose-500 to-amber-300'}`} style={{ width: `${encounterHealthPercent}%` }} /></div>
              </div>
              <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-4 font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-400"><span>Aria · Vanguardia <span className="mx-1 text-white/20">/</span> Kael · Rastreador <span className="mx-1 text-white/20">/</span> Mira · Custodia</span><span className="text-amber-100/60">EL ECO RECUERDA</span></div>
            </div>
            <div className="border-t border-white/10 bg-[#0c0f15] px-5 py-4 sm:px-8">
              <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-amber-200/60">LA TORRE · PISO {gameState.dungeonState.currentFloor.toString().padStart(2, '0')}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">La lluvia negra golpea el patio hundido. Bajo la ciudadela, una escalera se abre entre raíces petrificadas. El centinela guarda el paso; el polvo cae hacia arriba.</p>
            </div>
            <section className="mt-5 rounded-2xl border border-white/10 bg-[#10131a] p-4 sm:p-5" aria-labelledby="choices-title">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[9px] font-semibold tracking-[0.2em] text-amber-200/60">TURNO DE {selectedMember?.name.toUpperCase() ?? 'LA PARTY'}</p><h3 id="choices-title" className="mt-1 text-lg font-semibold text-zinc-100">Elige una acción</h3></div><p className="text-xs text-zinc-500">Selecciona un aliado para cambiar de turno</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" disabled={partyDefeated || encounterDefeated || !selectedMember || selectedMember.health <= 0} onClick={() => dispatchChoice({ type: 'attack', actorId: actingMemberId, targetId: encounterId }, `${selectedMember?.name ?? 'La party'} golpea al Centinela de la lluvia negra.`)} className="min-h-24 rounded-xl border border-amber-200/25 bg-gradient-to-br from-amber-200/[0.12] to-amber-200/[0.02] p-4 text-left transition hover:border-amber-200/60 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"><span className="flex items-center justify-between"><strong className="text-sm font-semibold text-amber-50">{encounter ? 'Atacar' : 'Iniciar encuentro'}</strong><span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg border border-amber-100/20 font-mono text-sm text-amber-100">⚔</span></span><span className="mt-2 block text-xs leading-relaxed text-zinc-400">Daño según arquetipo · el enemigo responderá</span></button>
                <button type="button" disabled={partyDefeated || encounterDefeated || !selectedMember || selectedMember.health <= 0} onClick={() => dispatchChoice({ type: 'guard', actorId: actingMemberId }, `${selectedMember?.name ?? 'La party'} se cubre; el escudo absorbe parte del siguiente impacto.`)} className="min-h-24 rounded-xl border border-sky-200/20 bg-gradient-to-br from-sky-200/[0.09] to-sky-200/[0.015] p-4 text-left transition hover:border-sky-200/50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-200"><span className="flex items-center justify-between"><strong className="text-sm font-semibold text-sky-100">Protegerse</strong><span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg border border-sky-100/20 font-mono text-sm text-sky-100">◇</span></span><span className="mt-2 block text-xs leading-relaxed text-zinc-400">Reduce el daño de la respuesta enemiga</span></button>
                <button type="button" disabled={partyDefeated || encounterDefeated || !selectedMember || selectedMember.health <= 0 || selectedMember.health >= selectedMember.maxHealth} onClick={() => dispatchChoice({ type: 'heal', actorId: actingMemberId, amount: 12 }, `${selectedMember?.name ?? 'La party'} canaliza una plegaria; recupera hasta 12 puntos de salud.`)} className="min-h-24 rounded-xl border border-emerald-200/20 bg-gradient-to-br from-emerald-200/[0.09] to-emerald-200/[0.015] p-4 text-left transition hover:border-emerald-200/50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-200"><span className="flex items-center justify-between"><strong className="text-sm font-semibold text-emerald-100">Plegaria menor</strong><span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-100/20 font-mono text-sm text-emerald-100">✧</span></span><span className="mt-2 block text-xs leading-relaxed text-zinc-400">Recupera hasta 12 HP · consume el turno</span></button>
                <button type="button" disabled={partyDefeated || encounterDefeated || !selectedMember || selectedMember.health <= 0 || corePulsesRemaining === 0} onClick={() => dispatchIntent({ mode: 'active', type: 'skill', skillId: 'core-pulse', core: true })} className="min-h-24 rounded-xl border border-cyan-200/20 bg-gradient-to-br from-cyan-200/[0.1] to-cyan-200/[0.015] p-4 text-left transition hover:border-cyan-200/50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"><span className="flex items-center justify-between"><strong className="text-sm font-semibold text-cyan-100">Pulso del núcleo</strong><span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-100/20 font-mono text-sm text-cyan-100">⌁</span></span><span className="mt-2 block text-xs leading-relaxed text-zinc-400">Daño elevado · quedan {corePulsesRemaining} pulsos</span></button>
              </div>
              {partyDefeated && selectedMember && (
                <button
                  type="button"
                  onClick={() => dispatchChoice(
                    { type: 'heal', actorId: actingMemberId, amount: 12 },
                    `${selectedMember.name} se aferra a la vida y recupera 12 HP.`,
                  )}
                  className="mt-3 flex min-h-16 w-full items-center gap-3 rounded-xl border border-rose-200/30 bg-rose-200/[0.06] px-4 text-left transition hover:border-rose-200/60 hover:bg-rose-200/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-200"
                >
                  <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg border border-rose-100/20 text-rose-100">✦</span>
                  <span><strong className="block text-sm text-rose-50">Último aliento · {selectedMember.name}</strong><small className="mt-1 block text-xs text-zinc-400">Recupera 12 HP para reanudar el combate</small></span>
                </button>
              )}
              {encounterDefeated && <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200/20 bg-emerald-200/[0.05] p-4"><div><p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-emerald-200">ENCUENTRO SUPERADO</p><p className="mt-1 text-sm text-zinc-200">{rewardClaimed ? 'La party ya reclamó el eco de este piso.' : 'El centinela dejó un eco cristalizado.'}</p></div><div className="flex flex-wrap gap-2">{!rewardClaimed && <button type="button" disabled={partyDefeated || !selectedMember} onClick={() => dispatchChoice({ type: 'collect-loot', actorId: actingMemberId, itemId: rewardItemId }, `La party reclama ${rewardItemId}.`)} className="min-h-11 rounded-lg border border-emerald-200/30 px-4 font-mono text-[10px] font-semibold tracking-wider text-emerald-100 hover:bg-emerald-100/10 disabled:opacity-40">RECLAMAR ECO</button>}{gameState.dungeonState.currentFloor < 15 ? <button type="button" disabled={partyDefeated || !rewardClaimed} onClick={() => dispatchChoice({ type: 'advance', actorId: actingMemberId }, `La party desciende al piso ${gameState.dungeonState.currentFloor + 1}.`)} className="min-h-11 rounded-lg bg-amber-100 px-4 font-mono text-[10px] font-bold tracking-wider text-[#17120b] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">DESCENDER · PISO {gameState.dungeonState.currentFloor + 1}</button> : <span className="self-center font-mono text-[10px] font-semibold tracking-widest text-amber-100">FIN DE LA EXPEDICIÓN</span>}</div></div>}
            </section>
            <section className="mt-5 rounded-2xl border border-white/10 bg-[#10131a]/90 p-5 sm:p-6" aria-labelledby="chronicle-title">
              <div className="flex items-center justify-between gap-4"><div><p className="font-mono text-[9px] font-semibold tracking-[0.2em] text-zinc-500">REGISTRO DE CAMPO</p><h3 id="chronicle-title" className="mt-1 text-sm font-semibold text-zinc-200">Crónica de la expedición</h3></div><span className="font-mono text-[9px] text-zinc-600">{gameState.arsState.combatActions.toString().padStart(2, '0')} ACCIONES</span></div>
              <ol className="mt-4 max-h-56 space-y-2 overflow-y-auto border-l border-amber-100/20 pl-4 text-sm leading-6 text-zinc-400" aria-live="polite" aria-relevant="additions">{narrative.slice(-8).map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}</ol>
            </section>
          </section>
          <aside aria-label="Party e inventario" className="space-y-5">
            <section className="rounded-2xl border border-white/10 bg-[#10131a] p-5 sm:p-6">
              <div className="flex items-end justify-between gap-3"><div><p className="font-mono text-[9px] font-semibold tracking-[0.2em] text-amber-200/60">VÍNCULO ACTIVO</p><h2 className="mt-1 text-lg font-semibold text-zinc-100">La party</h2></div><span className="font-mono text-[10px] text-zinc-500">{gameState.partyState.members.length} MIEMBROS</span></div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">Selecciona quién toma el siguiente turno.</p>
              <div className="mt-4 space-y-2">
                {gameState.partyState.members.map((member, index) => {
                  const selected = member.id === actingMemberId;
                  const healthPercent = Math.max(0, Math.min(100, member.health / member.maxHealth * 100));
                  const roleColor = index === 0 ? 'text-amber-200' : index === 1 ? 'text-sky-200' : 'text-emerald-200';
                  return <button key={member.id} type="button" onClick={() => setActiveMemberId(member.id)} aria-pressed={selected} className={`w-full rounded-xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 ${selected ? 'border-amber-100/45 bg-amber-100/[0.07] shadow-[inset_3px_0_0_rgba(253,230,138,.8)]' : 'border-white/[0.07] bg-black/10 hover:border-white/20'} ${member.health <= 0 ? 'opacity-55' : ''}`}>
                    <span className="flex items-center justify-between gap-3"><span className="min-w-0"><strong className="block truncate text-sm font-semibold text-zinc-100">{member.name}</strong><span className={`mt-1 block font-mono text-[9px] uppercase tracking-[0.14em] ${roleColor}`}>NV {member.level} · {member.archetype}</span></span><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border font-mono text-xs ${selected ? 'border-amber-100/35 bg-amber-100/10 text-amber-100' : 'border-white/10 text-zinc-500'}`}>{member.name.split(' ').map((part) => part[0]).join('')}</span></span>
                    <span className="mt-4 flex items-center justify-between font-mono text-[10px]"><span className="text-zinc-500">HP</span><span className={healthPercent <= 30 ? 'text-rose-200' : 'text-zinc-300'}>{member.health} <span className="text-zinc-600">/ {member.maxHealth}</span></span></span>
                    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-zinc-800"><span className={`block h-full rounded-full transition-[width] ${healthPercent <= 30 ? 'bg-rose-400' : 'bg-emerald-300'}`} style={{ width: `${healthPercent}%` }} /></span>
                    <span className="mt-3 block truncate text-xs text-zinc-500">{member.equipment.join(' · ') || 'Sin equipo'}</span>
                    {member.statuses.length > 0 && <span className="mt-2 inline-flex rounded-full border border-sky-200/20 bg-sky-200/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-sky-100">{member.statuses.join(' · ')}</span>}
                    {member.health <= 0 && <span className="mt-2 block font-mono text-[9px] uppercase tracking-widest text-rose-200">Fuera de combate</span>}
                  </button>;
                })}
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#10131a] p-5 sm:p-6" aria-labelledby="loot-title">
              <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[9px] font-semibold tracking-[0.2em] text-zinc-500">RELIQUIAS Y SUMINISTROS</p><h2 id="loot-title" className="mt-1 text-sm font-semibold text-zinc-200">Inventario de la party</h2></div><span className="font-mono text-[10px] text-zinc-500">{gameState.partyState.members.reduce((count, member) => count + member.inventory.length, 0).toString().padStart(2, '0')}</span></div>
              <ul className="mt-4 flex flex-wrap gap-2">{gameState.partyState.members.flatMap((member) => member.inventory.map((item) => <li key={`${member.id}-${item}`} className="rounded-md border border-amber-100/10 bg-amber-100/[0.04] px-3 py-2 text-xs text-amber-50/80">{item}<span className="ml-2 text-[10px] text-zinc-600">{member.name.split(' ')[0]}</span></li>))}{gameState.partyState.members.every((member) => member.inventory.length === 0) && <li className="text-xs text-zinc-600">La party no lleva suministros.</li>}</ul>
              {gameState.lootState.length > 0 && <p className="mt-4 border-t border-white/[0.07] pt-3 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Ecos reclamados: {gameState.lootState.length}</p>}
            </section>
            <details className="group rounded-2xl border border-white/10 bg-[#10131a] p-5 font-mono sm:p-6">
              <summary className="min-h-11 cursor-pointer list-none text-xs font-semibold uppercase tracking-wider text-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"><span className="flex items-center justify-between">Cooperativo local / P2P<span aria-hidden="true" className="text-amber-100 transition group-open:rotate-180">⌄</span></span></summary>
              <p className="mt-3 text-xs text-zinc-500" role="status">{peerStatus}. Intercambia la oferta y respuesta por un canal externo; no se usa servidor de juego.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void createPeerOffer()} className="min-h-11 border border-zinc-700 px-3 py-2 text-xs hover:border-amber-200/70">Crear oferta</button>
                <button type="button" onClick={() => void answerPeerOffer()} className="min-h-11 border border-zinc-700 px-3 py-2 text-xs hover:border-amber-200/70">Responder oferta</button>
                <button type="button" onClick={() => void applyPeerAnswer()} className="min-h-11 border border-zinc-700 px-3 py-2 text-xs hover:border-amber-200/70">Aplicar respuesta</button>
              </div>
              <label className="mt-3 block text-[10px] text-zinc-500">Señal recibida<textarea value={peerSignalInput} onChange={(event) => setPeerSignalInput(event.target.value)} rows={4} className="mt-1 block w-full border border-zinc-700 bg-black/40 p-2 font-mono text-[10px] text-zinc-300" /></label>
              <label className="mt-3 block text-[10px] text-zinc-500">Señal para compartir<textarea readOnly value={peerSignalOutput} rows={4} className="mt-1 block w-full border border-zinc-700 bg-black/40 p-2 font-mono text-[10px] text-zinc-300" /></label>
            </details>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [runtime, setRuntime] = useState<GameRuntime | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [hasVisitedOrchestrator, setHasVisitedOrchestrator] = useState(() => getRoute() === '/core');
  const runtimeLoadPromise = useRef<Promise<GameRuntime> | null>(null);

  useEffect(() => {
    const handlePopState = () => startTransition(() => setRoute(getRoute()));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if ((route !== '/game' && route !== '/arena') || hasVisitedOrchestrator) return;
    window.history.replaceState({}, '', '/core');
    setHasVisitedOrchestrator(true);
    startTransition(() => setRoute('/core'));
  }, [hasVisitedOrchestrator, route]);

  useEffect(() => {
    if ((route !== '/game' && route !== '/arena') || !hasVisitedOrchestrator || runtime) return;
    let active = true;
    runtimeLoadPromise.current ??= createGameRuntime();
    void runtimeLoadPromise.current.then((createdRuntime) => {
      if (active) {
        setRuntime(createdRuntime);
        runtimeLoadPromise.current = null;
      }
    }, (error: unknown) => {
      if (active) {
        setPersistenceError(`No se pudo cargar el motor de juego: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return () => {
      active = false;
    };
  }, [hasVisitedOrchestrator, route, runtime]);

  useEffect(() => {
    if (!runtime) return;
    let active = true;
    const unsubscribe = runtime.bridge.subscribeCheckpoints((error) => {
      if (active) setPersistenceError(`No se pudo guardar el checkpoint: ${error.message}`);
    });
    runtime.restorePromise ??= runtime.bridge.restoreCheckpoint();
    void runtime.restorePromise.then(() => {
      if (!active) return;
      setPersistenceError(null);
      setSessionReady(true);
    }, (error: unknown) => {
      if (active) {
        setPersistenceError(`No se pudo recuperar la partida: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    return () => {
      active = false;
      unsubscribe();
      runtime.bridge.closePartyConnections();
      const stopPromise = runtime.lifecycleQueue.then(() => runtime.engine.stop());
      runtime.lifecycleQueue = stopPromise.catch((error: unknown) => {
        console.error('[App] No se pudo detener el motor:', error);
      });
    };
  }, [runtime]);

  const navigate = (nextRoute: string) => {
    const requiresOrchestrator = (nextRoute === '/game' || nextRoute === '/arena') && route !== '/core';
    const destination = requiresOrchestrator ? '/core' : nextRoute;
    if (destination === '/core') setHasVisitedOrchestrator(true);
    window.history.pushState({}, '', destination);
    startTransition(() => setRoute(destination));
  };

  if (route === '/game' || route === '/arena') {
    if (persistenceError) {
      return (
        <main className="min-h-screen bg-[#0b0d0c] px-6 py-20 font-mono text-zinc-100">
          <p role="alert" className="mx-auto max-w-2xl border border-rose-400/50 bg-rose-950/40 p-5">
            {persistenceError}
          </p>
          <button type="button" onClick={() => navigate('/')} className="mx-auto mt-5 block min-h-11 border border-zinc-500 px-5">
            VOLVER
          </button>
        </main>
      );
    }
    if (!runtime || !sessionReady) {
      return <main className="min-h-screen bg-[#0b0d0c] px-6 py-20 font-mono text-zinc-100" role="status">Recuperando checkpoint…</main>;
    }
  }

  if (route === '/game') {
    if (!runtime) return null;
    return <GameRoute onBack={() => navigate('/')} runtime={runtime} onPersistenceError={setPersistenceError} />;
  }

  if (route === '/arena') {
    if (!runtime) return null;
    return (
      <Suspense fallback={<main className="min-h-screen bg-[#0b0d0c] p-8 text-zinc-100" role="status">Cargando arena…</main>}>
        <SentraCoreArenaView onNavigate={navigate} bridge={runtime.bridge} />
      </Suspense>
    );
  }

  if (route === '/paradox') {
    return (
      <>
        <InterfaceSettings />
        <nav aria-label="Navegación principal" className="fixed right-4 top-4 z-[10000]">
          <button type="button" onClick={() => navigate('/')} className="min-h-11 border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">
            VOLVER A CONQUER
          </button>
        </nav>
        <Suspense fallback={<main className="min-h-screen bg-[#0b0d0c] p-8 text-zinc-100" role="status">Cargando panel…</main>}>
          <ParadoxPlayground />
        </Suspense>
      </>
    );
  }

  if (route === '/core') {
    return (
      <>
        <InterfaceSettings />
        <nav aria-label="Navegación principal" className="relative z-[10000] mx-auto flex w-full max-w-7xl flex-wrap justify-end gap-2 px-4 pb-2 pt-20 sm:px-6">
          <button type="button" onClick={() => navigate('/master-engine')} className="min-h-11 border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">
            MASTER ENGINE
          </button>
          <button type="button" onClick={() => navigate('/arena')} className="min-h-11 rounded border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">
            SALA DE ARENA
          </button>
          <button type="button" onClick={() => navigate('/paradox')} className="min-h-11 border border-[#d2f36b]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#d2f36b] hover:bg-[#d2f36b] hover:text-black">
            PARADOX ORCHESTRATOR
          </button>
          <button type="button" onClick={() => navigate('/game')} className="min-h-11 border border-amber-200/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-amber-100 hover:bg-amber-200 hover:text-black">
            JUEGO
          </button>
          <button type="button" onClick={() => navigate('/')} className="min-h-11 rounded border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">
            VOLVER A CONQUER
          </button>
        </nav>
        <Suspense fallback={<main className="min-h-screen bg-[#0b0d0c] p-8 text-zinc-100" role="status">Cargando núcleo…</main>}>
          <SentraCoreDashboard />
        </Suspense>
      </>
    );
  }

  if (route === '/master-engine') {
    return (
      <>
        <InterfaceSettings />
        <nav aria-label="Navegación principal" className="fixed right-4 top-4 z-[10000]">
          <div className="flex gap-2">
            <button type="button" onClick={() => navigate('/game')} className="min-h-11 border border-amber-200/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-amber-100 hover:bg-amber-200 hover:text-black">
              JUEGO
            </button>
            <button type="button" onClick={() => navigate('/core')} className="min-h-11 rounded border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">
              CONQUER ENGINE
            </button>
          </div>
        </nav>
        <Suspense fallback={<main className="min-h-screen bg-[#0b0d0c] p-8 text-zinc-100" role="status">Cargando panel…</main>}>
          <MasterEngineDashboard onNavigate={navigate} />
        </Suspense>
      </>
    );
  }

  return <ConquerHome onNavigate={navigate} />;
}
