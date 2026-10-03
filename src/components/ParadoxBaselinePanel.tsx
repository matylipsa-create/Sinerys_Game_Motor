import { useState } from 'react';
import {
  MantisSpectrumProfile,
  type Playstyle,
} from '../core/ParadoxVisualEngine';
import type { GameEngineCore } from '../core/GameEngineCore';

const playstyleOptions: Playstyle[] = ['aggressive', 'tactical', 'passive'];

interface Props {
  engine: GameEngineCore;
}

export function ParadoxBaselinePanel({ engine }: Props) {
  const [, setRefresh] = useState(0);

  const session = engine.getState();
  const snapshot = session.paradox;
  const shaderProfile = MantisSpectrumProfile.fromState(snapshot.currentPlaystyle, snapshot.currentRealityTier);

  const refresh = () => setRefresh((value) => value + 1);

  const handleShelterVisit = () => {
    engine.registerShelterVisit();
    refresh();
  };

  const handleCameraCycle = () => {
    engine.cycleCameraMode();
    refresh();
  };

  const handlePlaystyleChange = (next: Playstyle) => {
    engine.updatePlayerPerception('spectral_rifle', next);
    refresh();
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '32px 20px 64px',
        background: 'radial-gradient(circle at top, rgba(28, 75, 98, 0.45), rgba(5, 6, 11, 0.96) 38%, rgba(2, 3, 7, 1) 100%)',
        color: '#edf6ff',
        fontFamily: 'Inter, Segoe UI, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1150, margin: '0 auto' }}>
        <header style={{ marginBottom: 28, borderBottom: '1px solid rgba(118, 221, 255, 0.35)', paddingBottom: 16 }}>
          <p style={{ margin: 0, color: '#79d1ff', letterSpacing: '0.25em', fontSize: 11, textTransform: 'uppercase' }}>
            TCREI • Sentra Core • Orchestrator / Paradox
          </p>
          <h1 style={{ margin: '12px 0 8px', fontSize: 'clamp(2.2rem, 4vw, 4rem)', lineHeight: 1, letterSpacing: '-0.05em' }}>
            Conquer of Darkness
          </h1>
          <p style={{ margin: 0, maxWidth: 700, color: '#bfd8ea', lineHeight: 1.6 }}>
            Baseline técnica del núcleo visual: mutación del espacio, percepción del jugador, cambio de cámara y tratamiento espectral de la realidad.
          </p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
          <StatCard label="Visitas al refugio" value={String(snapshot.shelterVisitCount)} accent="#7ef9d9" />
          <StatCard label="Tier real" value={`T${snapshot.currentRealityTier}`} accent="#ff9d4d" />
          <StatCard label="Style de juego" value={snapshot.currentPlaystyle.toUpperCase()} accent="#7fb3ff" />
          <StatCard label="Seed de mutación" value={snapshot.mutationSeed.toFixed(3)} accent="#d7a6ff" />
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, marginTop: 28 }}>
          <div style={{ background: 'rgba(8, 16, 25, 0.82)', border: '1px solid rgba(138, 191, 255, 0.22)', borderRadius: 18, padding: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a7d7ff' }}>
              Orchestrator core
            </h2>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
              <button type="button" onClick={handleShelterVisit} style={buttonStyle}>
                Registrar visita al refugio
              </button>
              <button type="button" onClick={handleCameraCycle} style={secondaryButtonStyle}>
                Cambiar cámara: {engine.cameraDirector.getModeLabel(session.cameraMode)}
              </button>
            </div>

            <div style={{ marginTop: 20 }}>
              <p style={{ margin: 0, color: '#8aa6bf', fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                Perfil de percepción
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {playstyleOptions.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => handlePlaystyleChange(style)}
                    style={{
                      ...buttonPill,
                      background: snapshot.currentPlaystyle === style ? 'rgba(121, 209, 255, 0.18)' : 'rgba(18, 27, 39, 0.8)',
                      borderColor: snapshot.currentPlaystyle === style ? 'rgba(121, 209, 255, 0.7)' : 'rgba(130, 167, 196, 0.25)',
                      color: snapshot.currentPlaystyle === style ? '#dff8ff' : '#c9d8e3',
                    }}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(8, 16, 25, 0.82)', border: '1px solid rgba(138, 191, 255, 0.22)', borderRadius: 18, padding: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a7d7ff' }}>
              CameraDirector
            </h2>
            <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: 'rgba(13, 22, 34, 0.9)', border: '1px solid rgba(126, 249, 217, 0.2)' }}>
              <p style={{ margin: 0, color: '#9adfd0', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                Active mode
              </p>
              <p style={{ margin: '12px 0 0', fontSize: 25, fontWeight: 700 }}>{engine.cameraDirector.getModeLabel(session.cameraMode)}</p>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: 'rgba(8, 16, 25, 0.82)', border: '1px solid rgba(138, 191, 255, 0.22)', borderRadius: 18, padding: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a7d7ff' }}>
              Dynamic spacetime mutation
            </h2>
            <ul style={{ margin: '16px 0 0', paddingLeft: 18, color: '#dfeaf7', lineHeight: 2 }}>
              <li>Cycle every 4 shelter visits</li>
              <li>Geometry and hazards recalibrate based on the player profile</li>
              <li>BehaviorDNA becomes adaptive, responsive, passive or reactive</li>
              <li>Reality tier scales the intensity of the distortion field</li>
            </ul>
          </div>

          <div style={{ background: 'rgba(8, 16, 25, 0.82)', border: '1px solid rgba(138, 191, 255, 0.22)', borderRadius: 18, padding: 20 }}>
            <h2 style={{ marginTop: 0, fontSize: 18, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a7d7ff' }}>
              MantisSpectrumEffect
            </h2>
            <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 12 }}>
              <Metric label="Aberration" value={shaderProfile.aberrationStrength.toFixed(3)} />
              <Metric label="Spectral shift" value={shaderProfile.spectralShift.toFixed(2)} />
              <Metric label="Thermal glow" value={shaderProfile.thermalGlow.toFixed(2)} />
              <Metric label="Scanline" value={shaderProfile.scanlineIntensity.toFixed(2)} />
            </div>
            <p style={{ marginTop: 16, color: '#a7d7ff', fontStyle: 'italic' }}>{shaderProfile.intensityLabel}</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: 'rgba(8, 16, 25, 0.82)', border: '1px solid rgba(138, 191, 255, 0.22)', borderRadius: 16, padding: 18 }}>
      <p style={{ margin: 0, color: '#85a8c4', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '10px 0 0', color: accent, fontSize: 28, fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: 'rgba(17, 26, 39, 0.95)', border: '1px solid rgba(144, 176, 196, 0.2)' }}>
      <p style={{ margin: 0, color: '#8aa6bf', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</p>
      <p style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700, color: '#eaf6ff' }}>{value}</p>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  appearance: 'none',
  border: '1px solid rgba(126, 249, 217, 0.55)',
  background: 'linear-gradient(135deg, rgba(20, 95, 85, 0.9), rgba(12, 34, 56, 0.82))',
  color: '#dffcf2',
  fontWeight: 700,
  letterSpacing: '0.08em',
  borderRadius: 12,
  padding: '12px 16px',
  cursor: 'pointer',
  textTransform: 'uppercase',
  fontSize: 11,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  borderColor: 'rgba(124, 172, 255, 0.55)',
  background: 'linear-gradient(135deg, rgba(28, 47, 84, 0.9), rgba(10, 18, 32, 0.82))',
  color: '#dfeeff',
};

const buttonPill: React.CSSProperties = {
  appearance: 'none',
  borderRadius: 999,
  border: '1px solid rgba(130, 167, 196, 0.25)',
  padding: '10px 16px',
  background: 'rgba(18, 27, 39, 0.8)',
  color: '#c9d8e3',
  cursor: 'pointer',
  textTransform: 'capitalize',
  fontWeight: 600,
};
