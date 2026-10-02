import { useEffect, useState } from 'react';
import { SentraCoreDashboard } from './components/SentraCoreDashboard';
import { MasterEngineDashboard } from './components/MasterEngineDashboard';
import { InterfaceSettings } from './components/InterfaceSettings';
import { ConquerHome } from './components/ConquerHome';
import { SentraCoreArenaView } from './pwa/arena/SentraCoreArenaView';
import { ConquerOrchestrator } from './core/ConquerOrchestrator';
import { OrchestratorBridge, type PartyChoice, type PartyMember } from './core/game/OrchestratorBridge';
import type { PlayerIntent } from './core/game/PlayerIntent';
import { WorldResponderSystem } from './core/game/WorldResponderSystem';
import { ParadoxPlayground } from './components/ParadoxPlayground';

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

function GameRoute({ onBack }: { onBack: () => void }) {
  const [runtime] = useState(() => {
    const engine = new ConquerOrchestrator('fall-of-zion-party-alpha');
    const worldResponder = new WorldResponderSystem();
    engine.registerSystem(worldResponder);
    const bridge = new OrchestratorBridge(engine);
    bridge.initializeParty(STARTING_PARTY);
    return {
      engine,
      worldResponder,
      bridge,
      peerConnections: new Set<RTCPeerConnection>(),
      peerDisconnectors: new Set<() => void>(),
      startPromise: null as Promise<void> | null,
      activeEffects: 0,
    };
  });
  const { engine, worldResponder, bridge } = runtime;
  const [gameState, setGameState] = useState(() => bridge.getGameState());
  const [activeMemberId, setActiveMemberId] = useState(STARTING_PARTY[0].id);
  const [peerSignalInput, setPeerSignalInput] = useState('');
  const [peerSignalOutput, setPeerSignalOutput] = useState('');
  const [peerStatus, setPeerStatus] = useState('Party local disponible');
  const [narrative, setNarrative] = useState([
    'La lluvia negra golpea el patio hundido. Bajo la ciudadela, una escalera se abre entre raíces petrificadas; el polvo cae hacia arriba.',
    'CORO / susurro: «Tres nombres cruzaron el umbral. La torre ya conoce sus heridas.»',
  ]);

  useEffect(() => {
    let active = true;
    let frameId = 0;
    runtime.activeEffects += 1;
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

    runtime.startPromise ??= engine.start();
    void runtime.startPromise.then(() => {
      if (active) frameId = window.requestAnimationFrame(tick);
      else if (runtime.activeEffects === 0) void engine.stop();
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
        void engine.stop();
      }
    };
  }, [bridge, engine, runtime, worldResponder]);

  const dispatchIntent = (intent: PlayerIntent) => setGameState(bridge.dispatchPartyIntent(intent, activeMemberId));
  const dispatchChoice = (choice: PartyChoice, text: string) => setGameState(bridge.dispatchChoice(choice, text));
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
  const partyHealth = gameState.partyState.members.reduce((sum, member) => sum + member.health, 0);
  const partyMaxHealth = gameState.partyState.members.reduce((sum, member) => sum + member.maxHealth, 0);
  const selectedMember = gameState.partyState.members.find((member) => member.id === activeMemberId);

  return (
    <main className="min-h-screen bg-[#0b0d0c] px-4 pb-12 pt-20 font-serif text-zinc-100 sm:px-6 lg:px-8">
      <InterfaceSettings />
      <nav aria-label="Navegación principal" className="fixed right-4 top-4 z-[10000]">
        <button type="button" onClick={onBack} className="min-h-11 border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">VOLVER</button>
      </nav>
      <section className="mx-auto max-w-6xl" aria-labelledby="game-title">
        <header className="border-b border-amber-100/20 pb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-200/70">Fall of Zion · Libro I · Sentra Core</p>
          <h1 id="game-title" className="mt-2 text-3xl font-semibold text-amber-50">La torre bajo la lluvia negra</h1>
          <p className="mt-2 font-mono text-xs text-zinc-400">Piso {gameState.dungeonState.currentFloor} / 15 · Bloque {gameState.worldState.block} · {gameState.partyState.cooperative ? 'PARTY ENLAZADA' : 'PARTY LOCAL'}</p>
        </header>
        <dl className="grid grid-cols-2 gap-4 border-b border-zinc-800 py-5 font-mono sm:grid-cols-4">
          <div><dt className="text-[10px] text-zinc-500">SALUD DEL GRUPO</dt><dd className="mt-1 text-lg tabular-nums">{partyHealth}/{partyMaxHealth}</dd></div>
          <div><dt className="text-[10px] text-zinc-500">TENSIÓN</dt><dd className="mt-1 text-lg tabular-nums">{gameState.arsState.tension}/100</dd></div>
          <div><dt className="text-[10px] text-zinc-500">PULSOS CORE</dt><dd className="mt-1 text-lg tabular-nums">{gameState.arsState.coreSkillUses}</dd></div>
          <div><dt className="text-[10px] text-zinc-500">ACCIONES</dt><dd className="mt-1 text-lg tabular-nums">{gameState.arsState.combatActions}</dd></div>
        </dl>
        <div className="grid gap-8 py-7 lg:grid-cols-[minmax(0,1.6fr)_minmax(270px,0.8fr)]">
          <section aria-labelledby="story-title">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/60">Escena 01 · El umbral de ceniza</p>
            <h2 id="story-title" className="mt-2 text-xl font-semibold text-amber-50">La puerta recuerda vuestros nombres</h2>
            <div className="mt-5 space-y-4 border-l border-amber-100/20 pl-5 text-base leading-8 text-zinc-300">
              <p>La lluvia negra golpea el patio hundido. Bajo la ciudadela, una escalera se abre entre raíces petrificadas y piedra que aún conserva el calor de una guerra antigua. El polvo cae hacia arriba.</p>
              <p>Aria apoya la Claymore contra el umbral. Kael oye algo moverse detrás del muro. Mira reconoce el sonido: no es una voz, sino un coro intentando recordar cómo se respira.</p>
              <p className="font-mono text-xs leading-6 text-amber-100/70">CORO / susurro: «Tres nombres cruzaron el umbral. La torre ya conoce sus heridas.»</p>
            </div>
            <section className="mt-7 border-t border-zinc-800 pt-5" aria-labelledby="choices-title">
              <h3 id="choices-title" className="font-mono text-xs uppercase tracking-wider text-zinc-400">¿Qué decide {selectedMember?.name ?? 'el grupo'}?</h3>
              <div className="mt-3 grid gap-2">
                <button type="button" onClick={() => dispatchChoice({ type: 'attack', actorId: activeMemberId, targetId: 'warden-of-zion' }, 'La Claymore abre un arco de luz pálida. Algo responde desde la escalera.')} className="min-h-12 border border-zinc-700 px-4 py-3 text-left text-sm hover:border-amber-200/70">Alzar el arma y desafiar al guardián</button>
                <button type="button" onClick={() => dispatchChoice({ type: 'guard', actorId: activeMemberId }, 'El grupo cierra filas mientras la lluvia de cristal repica sobre sus defensas.')} className="min-h-12 border border-zinc-700 px-4 py-3 text-left text-sm hover:border-amber-200/70">Cerrar filas y proteger al grupo</button>
                <button type="button" onClick={() => dispatchChoice({ type: 'damage', actorId: activeMemberId, amount: 8 }, `${selectedMember?.name ?? 'La vanguardia'} recibe el impacto de una lanza de cristal.`)} className="min-h-12 border border-rose-900/70 px-4 py-3 text-left text-sm text-rose-100 hover:border-rose-300/70">Atravesar la lluvia de cristal</button>
                <button type="button" onClick={() => dispatchChoice({ type: 'heal', actorId: activeMemberId, amount: 6 }, 'Mira pronuncia un verso antiguo; la herida se cierra y el eco se aquieta.')} className="min-h-12 border border-emerald-900/70 px-4 py-3 text-left text-sm text-emerald-100 hover:border-emerald-300/70">Cantar una cura breve</button>
                <button type="button" onClick={() => dispatchChoice({ type: 'collect-loot', actorId: activeMemberId, itemId: 'Poison Pearl' }, 'Entre las piedras, el grupo encuentra una Poison Pearl fría como el fondo del mar.')} className="min-h-12 border border-zinc-700 px-4 py-3 text-left text-sm hover:border-amber-200/70">Recoger la Poison Pearl</button>
                <button type="button" onClick={() => dispatchChoice({ type: 'collect-loot', actorId: activeMemberId, itemId: 'Claymore +5' }, 'La Claymore +5 despierta en la mano de Aria; una línea roja cruza su acero.')} className="min-h-12 border border-zinc-700 px-4 py-3 text-left text-sm hover:border-amber-200/70">Reclamar la Claymore +5</button>
                <button type="button" onClick={() => dispatchChoice({ type: 'advance', actorId: activeMemberId }, 'El grupo desciende. La puerta se cierra sin ruido detrás de vosotros.')} className="min-h-12 border border-amber-100/30 px-4 py-3 text-left text-sm text-amber-50 hover:border-amber-100">Descender al siguiente piso</button>
                <button type="button" onClick={() => dispatchIntent({ mode: 'active', type: 'skill', skillId: 'core-pulse', core: true })} className="min-h-12 border border-zinc-700 px-4 py-3 text-left text-sm hover:border-amber-200/70">Liberar un pulso core</button>
              </div>
            </section>
            <section className="mt-8 border-t border-zinc-800 pt-5" aria-labelledby="chronicle-title">
              <h3 id="chronicle-title" className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Crónica del grupo</h3>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-400" aria-live="polite" aria-relevant="additions">{narrative.slice(-6).map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}</ol>
            </section>
          </section>
          <aside aria-label="Party e inventario" className="border-t border-zinc-800 pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <h2 className="font-mono text-xs uppercase tracking-wider text-zinc-300">Party · {gameState.partyState.members.length} aventureros</h2>
            <div className="mt-3 divide-y divide-zinc-800">
              {gameState.partyState.members.map((member) => <button key={member.id} type="button" onClick={() => setActiveMemberId(member.id)} aria-pressed={member.id === activeMemberId} className="block w-full py-3 text-left aria-pressed:text-amber-100"><span className="flex items-baseline justify-between gap-2"><strong className="text-sm">{member.name}</strong><span className="font-mono text-[10px] text-zinc-500">NV {member.level} · {member.archetype}</span></span><span className="mt-1 block font-mono text-xs tabular-nums text-zinc-400">SALUD {member.health}/{member.maxHealth}</span><span className="mt-1 block text-xs text-zinc-500">{member.equipment.join(' · ') || 'Sin equipo'}</span>{member.statuses.length > 0 && <span className="mt-1 block font-mono text-[10px] text-amber-200/70">{member.statuses.join(' · ')}</span>}</button>)}
            </div>
            <section className="mt-6 border-t border-zinc-800 pt-4" aria-labelledby="loot-title">
              <h3 id="loot-title" className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Botín narrativo</h3>
              <ul className="mt-2 space-y-2 text-sm text-amber-100/80">{gameState.partyState.members.flatMap((member) => member.inventory.map((item) => <li key={`${member.id}-${item}`}>{item}<span className="ml-2 text-xs text-zinc-600">{member.name}</span></li>))}{gameState.lootState.map((loot) => <li key={loot.id}>{loot.itemId}<span className="ml-2 text-xs text-zinc-600">Piso {loot.floor}</span></li>)}</ul>
            </section>
            <details className="mt-6 border-t border-zinc-800 pt-4 font-mono">
              <summary className="cursor-pointer text-xs uppercase tracking-wider text-zinc-400">Enlace P2P directo</summary>
              <p className="mt-3 text-xs text-zinc-500" role="status">{peerStatus}. Intercambia la oferta y respuesta por un canal externo; no se usa servidor de juego.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void createPeerOffer()} className="min-h-10 border border-zinc-700 px-3 py-2 text-xs hover:border-amber-200/70">Crear oferta</button>
                <button type="button" onClick={() => void answerPeerOffer()} className="min-h-10 border border-zinc-700 px-3 py-2 text-xs hover:border-amber-200/70">Responder oferta</button>
                <button type="button" onClick={() => void applyPeerAnswer()} className="min-h-10 border border-zinc-700 px-3 py-2 text-xs hover:border-amber-200/70">Aplicar respuesta</button>
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

  useEffect(() => {
    const handlePopState = () => setRoute(getRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextRoute: string) => {
    window.history.pushState({}, '', nextRoute);
    setRoute(nextRoute);
  };

  if (route === '/game') {
    return <GameRoute onBack={() => navigate('/')} />;
  }

  if (route === '/arena') {
    return <SentraCoreArenaView onNavigate={navigate} />;
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
        <ParadoxPlayground />
      </>
    );
  }

  if (route === '/core') {
    return (
      <>
        <InterfaceSettings />
        <nav aria-label="Navegación principal" className="fixed right-4 top-4 z-[10000] flex gap-2">
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
        <SentraCoreDashboard />
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
        <MasterEngineDashboard onNavigate={navigate} />
      </>
    );
  }

  return <ConquerHome onNavigate={navigate} />;
}
