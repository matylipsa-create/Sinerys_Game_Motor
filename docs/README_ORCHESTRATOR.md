# Conquer Orchestrator

## Runtime ownership

`ConquerOrchestrator` is the authoritative owner of the web game's session and
the 15-floor dungeon. It extends the generic `EngineOrchestrator`, which
provides mutation validation, an instance-scoped event bus, lifecycle management
and the simulation clock. `GameEngineCore` remains only as a compatibility
adapter; Paradox, crisis, strategic and reality systems operate on the same
Conquer session instead of maintaining parallel game state.

Registered systems receive elapsed time through `update(deltaMs)`. The app
advances the engine with `tick(deltaMs)` from its animation-frame loop only
after checkpoint restoration and engine startup. Tick deltas must be finite and
non-negative.

## State, history and persistence

Engine mutations are validated and produce state snapshots for subscribers.
The event bus belongs to each engine instance, so separate sessions cannot
receive each other's events. The game event history is capped at 256 entries;
Paradox tactical events and crisis history have their own bounded retention.

Game checkpoints are stored in IndexedDB and hashed with SHA-256. Schema 1 and
2 checkpoints are migrated to schema 3 during restore. Legacy Paradox
`localStorage` data is imported into the shared session and removed only after
the migrated checkpoint has been written successfully. Persistence failures
are surfaced to the app instead of silently ignored.

## Godot bridge

`GodotBridgeSystem` forwards selected world events as JSON commands over the
local WebSocket bridge (`ws://localhost:8080/sentra-core`). The payload format
is `{ "type": "WORLD_STATE", "payload": { "eventType": "world:tension:changed", "revision": 7, "payload": { "tension": 42 } } }`.
Godot validates tension and difficulty values, emits typed signals, and returns
a `WORLD_STATE_ACK` with the event type, revision and acceptance status.
The browser simulation remains usable when Godot is not connected.

## Quality checks

The local Husky pre-commit hook runs only `npm run typecheck` to keep quick
commits lightweight. Run `npm run validate` before preparing a release; it
also runs the core architecture tests and TypeScript/Vite production build.
The `Build Sentra Perception PWA` workflow runs typecheck, those tests and the
build for pushes and pull requests targeting `main`.
