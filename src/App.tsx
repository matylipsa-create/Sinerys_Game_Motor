import { useEffect, useState } from 'react';
import { SentraCoreDashboard } from './components/SentraCoreDashboard';
import { MasterEngineDashboard } from './components/MasterEngineDashboard';
import { InterfaceSettings } from './components/InterfaceSettings';
import { VisionScreen } from './components/VisionScreen';
import { VisionOnboarding } from './components/VisionOnboarding';
import { GameDashboard } from './components/GameDashboard';
import { ConquerHome } from './components/ConquerHome';
import BlindModeRoute from './components/BlindModeRoute';
import { AppProvider } from './context/AppContext';
import { GameEngineCore } from './core/GameEngineCore';

function getRoute(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function GameRoute({ onBack }: { onBack: () => void }) {
  const [engine] = useState(() => new GameEngineCore());

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  return (
    <>
      <InterfaceSettings />
      <nav aria-label="Navegación principal" className="fixed right-4 top-4 z-[10000]">
        <button type="button" onClick={onBack} className="min-h-11 border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">
          VOLVER
        </button>
      </nav>
      <GameDashboard engine={engine} />
    </>
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

  if (route === '/blind') {
    return (
      <>
        <InterfaceSettings />
        <AppProvider><BlindModeRoute /></AppProvider>
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
          <button type="button" onClick={() => navigate('/blind')} className="min-h-11 rounded border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">
            MODO ACCESIBLE
          </button>
          <button type="button" onClick={() => navigate('/game')} className="min-h-11 border border-amber-200/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-amber-100 hover:bg-amber-200 hover:text-black">
            JUEGO
          </button>
          <button type="button" onClick={() => navigate('/')} className="min-h-11 rounded border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">
            VOLVER A VISIÓN
          </button>
        </nav>
        <SentraCoreDashboard onOpenVisionDemo={() => navigate('/')} />
      </>
    );
  }

  if (route === '/vision') {
    return (
      <>
        <InterfaceSettings />
        <nav aria-label="Navegación principal" className="fixed right-4 top-4 z-[10000]">
          <button type="button" onClick={() => navigate('/')} className="min-h-11 rounded border border-[#00ffcc]/50 bg-[#050507]/90 px-3 py-2 font-mono text-xs text-[#00ffcc] hover:bg-[#00ffcc] hover:text-black">
            ASISTENTE ACCESIBLE
          </button>
        </nav>
        <AppProvider>
          <VisionOnboarding><VisionScreen /></VisionOnboarding>
        </AppProvider>
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
        <MasterEngineDashboard />
      </>
    );
  }

  return <ConquerHome onNavigate={navigate} />;
}
