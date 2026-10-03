# TCREI: Sentra Core: Orchestrator — Paradox Full Technical Baseline

## 1. Project Context & Identity

* Developer / GitHub Repo: Conquer of Darkness / Paradox
* Core Engine: Sentra Core: Orchestrator (running on Godot 4.x)
* Target performance: locked 120+ FPS (engine max_fps = 200)
* Aesthetic: bio-industrial visceral horror, mixing retro pixel precision with modern volumetric depth.

## 2. Core Architectural Loop

Player Input <--> Orchestrator (Logic / Spacetime Mutation / Perception) <--> Godot (Procedural Hybrid Rendering)

The Orchestrator is the central intelligence that interprets player actions, controls ambience, triggers spatial mutations, calculates perception profiles and guides procedural generation. Godot handles the execution layer: hybrid rendering, lighting, camera switching and simulation updates.

## 3. Hybrid Rendering Pipeline

The visual system combines:

* Base geometry: voxels and relief/parallax surfaces
* Telemetry overlay: point cloud data for hidden grids and anomalies
* Post-process layer: volumetric fog, explicit lights, film grain, dithering and vignette

## 4. Multi-Perspective Camera Director

* Isometric / Tactical
* First Person / Immersive
* Side-Scroller / Metroidvania

This system is designed to reveal secrets and shift the perception of the ship without destroying the mood.

## 5. Mantis Vision & Spectral Shaders

The visual treatment uses a global post-process stage with spectral separation, thermal glow, and analog scanline degradation.

## 6. Dynamic Spacetime Mutation System

Every four shelter visits the Orchestrator triggers a reality mutation. Geometry shifts, enemies mutate and hazards adapt to the player profile. This logic is tied to playstyle, current weapon loadout and prior decisions.

## 7. Implementation Overview

The repository now includes a TypeScript baseline that mirrors the orchestration logic:

* `src/core/ParadoxVisualEngine.ts`: OrchestratorVisualEngine, CameraDirector and MantisSpectrumProfile
* `src/components/ParadoxBaselinePanel.tsx`: operational dashboard for the home page and debug sandbox
* Route `/paradox-baseline`: direct access to the technical baseline panel

For the web application, `ConquerOrchestrator` is the single owner of the
in-memory Conquer and Paradox session state, including the 15-floor dungeon.
`EngineOrchestrator` supplies the generic lifecycle, instance-scoped event bus,
mutation handling and simulation clock; `GameEngineCore` is a compatibility
adapter only. Visual, camera, strategic crisis and reality rules are integrated
with that shared session rather than running a parallel game engine.

## 8. Operational Notes

The web version does not replace Godot; it acts as a high-fidelity design and simulation layer for the orchestrator logic and the narrative world-state model. The same state machine can be ported directly into a full Godot runtime when the game loop expands.

## 9. Current State

The app starts a single `tick(deltaMs)` loop after restoring its IndexedDB
checkpoint. Paradox survival and registered world systems advance from that
loop. Checkpoint schemas 1 and 2 migrate to schema 3, including legacy Paradox
`localStorage` saves; the old save is cleared only after the migrated checkpoint
is persisted successfully. Game event history is bounded to 256 records.

The Godot WebSocket bridge exchanges JSON `WORLD_STATE` commands and
`WORLD_STATE_ACK` responses. The Godot receiver validates and emits tension,
difficulty and world-state signals without making the web simulation depend on
a connected renderer.

Run `npm run validate` to execute the core architecture tests and production
build. CI runs typecheck, tests and build on pull requests and pushes to `main`.
The rules remain modular so they can be reused for:

* tactical decision loops
* procedural mutation events
* camera mode selection
* spectral feedback and visibility tuning
* adaptive world response under stress
