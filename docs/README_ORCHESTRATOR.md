# Sentra Core: Paradox Orchestrator

Panel de control táctico para el estado de juego y los eventos del mundo de Conquer of Darkness.

## Panel Paradox

Abre `/paradox` para inspeccionar y operar el estado local:

- Mob score, munición viva, mutágenos y modo de cámara.
- Ciclo de visitas al Shelter y mutaciones de realidad cada cuatro visitas.
- Evolución de ADN enemigo, crisis de facción y resolución de crisis.
- Filtros espectrales, con estado conservado entre sesiones.

## Arquitectura

- `src/core/ParadoxOrchestrator.ts`: reglas de economía, Shelter y estado.
- `src/core/BehaviorDNAEngine.ts`: perfiles DNA y ciclo de crisis.
- `src/core/OrchestratorBridge.ts`: comandos tipados y transporte WebSocket opcional.
- `src/core/ParadoxStorage.ts`: persistencia local estructurada offline-first.
- `godot/OrchestratorVoxelBridge.gd`: punto de entrada para el renderer Godot.

El PWA funciona sin renderer conectado. La integración Godot requiere un proyecto Godot que cargue el script y exponga las escenas de juego.
