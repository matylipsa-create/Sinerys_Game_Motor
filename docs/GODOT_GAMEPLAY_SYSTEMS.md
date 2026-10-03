# Godot gameplay and perception systems

## Target profile and verified limits

The Godot scripts in this repository are experimental integration components
for a future Godot 4.x game runtime, targeting the Compatibility renderer and
low-memory hardware. The 32 MiB VRAM budget, 60 FPS and sub-millisecond hot
path costs are design goals, not benchmark results or guarantees. This
repository has no `project.godot`, scenes, C# project file or Godot executable;
shader compilation, C# binding compatibility, scene setup, memory use and
render/physics performance must be validated in the host project on its actual
target hardware.

The PWA build and its TypeScript validation are independent of Godot and do
not compile or exercise these scripts. Several adapters and Godot signals
allocate, and `CharacterBody3D`/`MoveAndSlide` remain floating-point engine
physics; avoid describing the entire runtime as zero-allocation or
cross-machine deterministic. Use profiling captures to decide where the
approximation utilities outperform native Godot operations.

## Ownership and flow

`SentraCoreEngine` owns the bounded gameplay-event ring and latest crisis
snapshot. The threat director consumes value-type telemetry and publishes
low-frequency directives. A behavior analyzer classifies the player at 2 Hz.
The perception field evaluates bounded entity/observer snapshots on one
background worker. Dungeon generation is a separate deterministic service that
produces a logical room graph and spawn plan, not scene instances.

```text
CharacterBody3D
  ├─ movement / dodge / stagger
  ├─ reusable attack ray ──> IDamageable
  └─ sampled PlayerTelemetry + action events
                            │
                            v
SentraCoreEngine ──> CrisisThreatDirector ──> CrisisSnapshot / directives
  ├─ fixed event ring       └─ exponential tension + phase hysteresis
  ├─ PlayerBehaviorAnalyzer (2 Hz behavioral profile)
  └─ PerceptionFieldProcessor (fixed spatial hash on WorkerThreadPool)
       └─ FOV / noise / tension-trail candidate results

DungeonStreamingService
  └─ deterministic room graph + spawn plan on WorkerThreadPool
       └─ main-thread signal/snapshot ──> project renderer adapter

SentraFastMath
  ├─ bounded trig LUT + analytic ballistic motion
  └─ integer-cell DDA query over caller-owned voxel occupancy

Camera3D
  └─ MantisVisionPostProcess (single full-screen quad)
       └─ color/depth contours + tension-driven grading
```

## Scene wiring

Attach `SentraCoreEngine` to the gameplay root and add children named
`CrisisThreatDirector`, `PlayerBehaviorAnalyzer`, and
`PerceptionFieldProcessor`; configure the exported paths on the engine if the
names or hierarchy differ. Add `DungeonStreamingService` beside those nodes.
Set the player's `SentraCorePath` and configure `AttackCollisionMask` to the
project's enemy-body layer.

The controller uses `ui_left`, `ui_right`, `ui_up`, and `ui_down` by default;
add `sprint`, `dodge`, and `attack` to the Input Map or change the exported
action names. Attach `DamageableComponent` to an enemy root on the ray mask.
If a ray hits a child collider, the controller checks up to four parents for
`IDamageable`. The controller disables its ray outside an attack and forces one
query on attack input. A health/combat component should apply damage first,
then call `ApplyPlayerDamage(damage, resultingHealthRatio, knockback)` on the
player. Incoming combat should check `IsInvulnerable`.

## Crisis and Sentra contract

`PlayerTelemetry`, `CoreGameplayEvent`, `PlayerBehaviorProfile`, and
`CrisisSnapshot` are immutable value types. Gameplay events use a fixed ring of
512 entries. When full, it drops the oldest event and increments a drop
counter instead of growing or allocating, preserving recent gameplay signals.
Consumers can poll with `TryDequeueGameplayEvent` or subscribe to
the internal typed C# event.

The director samples at 10 Hz, combines health, registered nearby Chimera
entities, damage, movement/action pace, corruption, environment, behavior
bias and decaying event pressure, then applies a smoothstep curve and
exponential smoothing. Threshold hysteresis prevents phase flapping.
Snapshots publish only on meaningful changes and no faster than the configured
snapshot interval. Scene/UI listeners use the `CrisisSnapshotUpdated` Godot
signal; game modules use typed C# events.

```gdscript
func _ready() -> void:
    $SentraCoreEngine/CrisisThreatDirector.crisis_snapshot_updated.connect(
        _on_crisis_snapshot_updated
    )

func _on_crisis_snapshot_updated(
    tension: float,
    phase: int,
    enemy_density: float,
    visibility: float,
    lighting: float,
    spawn_budget: int,
    sequence: int
) -> void:
    # Apply cached parameters or queue incremental visual/encounter work.
    pass
```

Apply lighting, visibility and spawn-budget changes incrementally; do not
instantiate an encounter or rebuild all geometry synchronously in a callback.

## Perception field and behavior pattern

`PerceptionEntitySample`, `PerceptionObserver`, and `PerceptionResult` are
value types. `PerceptionFieldProcessor` uses fixed-capacity buffers (4096
entities, 256 observers and 16384 results), a fixed spatial hash, and one
worker at a time. Submissions while a worker is busy replace the pending
snapshot; generation checks suppress stale results. The worker reads/writes
only managed value-type arrays. Scene nodes and physics state remain on the
main thread.

Results combine geometric FOV, audible noise and tension-trail flags. A
`Vision` result is a **broadphase candidate**, not proof of unobstructed
visibility. Run occlusion raycasts on the main thread only for the shortlist
that needs a gameplay decision; never query `PhysicsDirectSpaceState3D` from
the worker.

C# producers should reuse caller-owned sample arrays and submit at a gameplay
cadence such as 5-10 Hz, filling from cached transforms. Fixed buffers avoid
per-entity processing allocations, but worker scheduling, Godot signals and
interop adapters are not a strict zero-allocation guarantee. GDScript producers
can call `submit_snapshot_from_dictionaries()` at a lower frequency; it
converts the samples into the same fixed buffers. Dictionaries and
`get_results_snapshot()` allocate and are intended for interop/debug use, not
per-frame entity loops.

```gdscript
func submit_sensory_frame() -> void:
    var entities := [{
        "id": 1001,
        "position": $Player.global_position,
        "forward": -$Player.global_basis.z,
        "noise": 0.6,
        "tension_trail": $Player.current_tension,
        "faction_mask": 1,
        "is_player": true,
        "active": true,
    }]
    var observers := [{
        "id": 2001,
        "position": $Enemy.global_position,
        "forward": -$Enemy.global_basis.z,
        "friendly_faction_mask": 2,
        "vision_range": 24.0,
        "fov_degrees": 100.0,
        "hearing_range": 16.0,
        "tension_range": 20.0,
        "tension_threshold": 0.15,
    }]
    $SentraCoreEngine/PerceptionFieldProcessor.submit_snapshot_from_dictionaries(
        entities, observers
    )
```

`PlayerBehaviorAnalyzer` classifies 0.5-second windows as aggressive, passive,
fleeing (damage plus movement and low attack activity), or exploring. Changes
are filtered before notification and feed the crisis director as a bounded
tension bias. Fleeing is a heuristic, not an intent model; tune it with
playtest data.

## Runtime diagnostics

Add `PerceptionTelemetryMonitor.gd` to a diagnostics node and set
`voxel_bridge_path`, `perception_processor_path` and `sentra_core_path`. It
samples process/physics frame time, Godot static memory, managed C# heap,
active node count, bridge/perception queue depths, perception input/result
drops and ping/response latency once per
second. Performance warnings are throttled to one every five seconds. The
bridge ping uses a sequence echo and a local monotonic clock; it does not
compare browser and Godot clock origins.

## Lightweight math and voxel queries

`SentraFastMath` is a pure utility layer, not a replacement for Godot's
authoritative rigid-body solver. `SinLut` and `SinCosLut` interpolate a
startup-built 4096-entry periodic table; use these for bounded visual,
procedural, or steering calculations where measured call volume justifies
them. `FastNormalizeOrZero` uses a bit-level inverse-square-root estimate and
one Newton step; it is for approximate steering/visual vectors only.
`NormalizeOrZero` remains available when exact normalization semantics are
needed. Ballistic position/velocity are closed-form constant-acceleration
evaluations and do not require per-step integration.

`RaycastVoxels` traverses a dense, caller-owned `byte[]` occupancy grid with a
3D DDA. The flat layout is X-fastest:
`x + sizeX * (y + sizeY * z)`. Nonzero cells are solid, grid coordinates are
offset by `gridOrigin`, and the returned hit contains the cell, entry normal,
and distance. The method bounds-checks dimensions, buffer length and finite
inputs, and performs no per-call managed allocation. Keep the occupancy buffer
stable for the duration of a call; do not mutate it concurrently. This query
is useful for voxel broadphase/gameplay and deterministic procedural checks,
not for moving-body contacts, rigid-body response, or authoritative scene
collision.

`DiffuseDensity6` performs one fixed-point, six-neighbor density update into a
separate caller-owned byte buffer. `centerRetention` is in `[0, 255]`: 255
preserves the current cell; 0 replaces it with the rounded mean of valid
face-adjacent cells. Swap source/destination buffers between iterations for
stable, deterministic passes; the method rejects aliasing and undersized
buffers and does not clear or allocate either buffer.

The LUT, linear interpolation and grid query trade computation for bounded
memory/access costs; they are not automatically faster than native Godot math
or physics at small call counts. No universal sub-millisecond CPU guarantee
is possible without a target device, workload and profiler capture. Benchmark
representative release builds and retain the engine physics path wherever its
solver semantics are required.

## Mantis Vision post-process

Add `MantisVisionPostProcess.gd` as a child of the active `Camera3D`, and set
`crisis_director_path` to the `CrisisThreatDirector` node path. The script
builds a full-screen `QuadMesh`, loads
`godot/shaders/mantis_vision_post_process.gdshader` when the repository is the
project root (or `shaders/mantis_vision_post_process.gdshader` when `godot/`
is the project root), and subscribes to crisis tension snapshots. Set corruption separately with
`set_critical_state(tension, corruption)` when the world/player corruption
changes. Call `trigger_impact(screen_uv, intensity)` with normalized viewport
coordinates to briefly emphasize an impact; `set_quality()` adjusts contour
strengths for quality tiers.

The shader uses four neighboring color samples and three linearized depth
samples to produce perceptual and depth contours, then applies a restrained
shadow/midtone/highlight grade. Tension and corruption bias contours toward a
danger palette; impact rings are aspect-ratio corrected. It runs on the GPU,
so profile GPU frame time separately from CPU frame time. For low-end targets,
reduce output resolution or disable depth contours; the post-process is
optional and does not alter physics/collision layers. Scene entities that need
independent status silhouettes should use a dedicated mask/material pass
rather than treating screen-wide tension as per-entity data.

## Pixel-art toon materials (Compatibility / GLES 3)

Use `godot/shaders/pixel_toon_compat.gdshader` for the low-cost material path.
It makes one nearest-filtered albedo lookup, quantizes `NORMAL · LIGHT` into
three hard bands, uses shadow/midtone/light tints and adds a small shadow fill.
There are no normal maps, screen/depth reads, derivatives, loops or
per-fragment trigonometry. Keep `mid_threshold < lit_threshold`. Use alpha
scissor for cutout atlases; fully opaque textures can leave their alpha at 1.

For outlines, use `pixel_toon_outline.gdshader` on a second `MeshInstance3D`
that shares the original mesh and follows the same transform/skeleton. Set
its `ShaderMaterial.render_priority` below the surface material (for example,
-1), turn off shadow casting on the outline instance, and tune
`outline_width` in local mesh units. This inverted-hull pass is an extra draw
call but performs no texture reads. Prefer it for hero/foreground meshes; on
large voxel populations use shared `MultiMesh` geometry or omit the outline
pass to avoid fill-rate and draw-call costs. Uniform mesh scale gives the most
consistent outline width; non-uniform scale distorts the expansion.

Texture and viewport setup for crisp pixels:

- Assign an albedo image to `albedo_texture`; the shader sampler explicitly
  uses `filter_nearest`. For atlases, keep UVs inside padded regions because
  the sampler repeats at texture boundaries.
- Disable mipmaps on tiny pixel-art tiles to preserve exact texels. This can
  shimmer at distance; if that becomes objectionable, use a separately
  authored pixel-style mip chain rather than bilinear filtering.
- Keep textures small and atlas compatible assets. On a 32 MiB target, make a
  measured texture/framebuffer/mesh budget; 256x256 RGBA8 is about 256 KiB
  before driver overhead, while lossy ETC2 saves memory but can introduce
  block artifacts into pixel art. Use ETC2 only where visual testing allows.
- Disable 3D MSAA and avoid stacking the screen-space Mantis post-process on
  this low-end profile. For a strict pixel grid, render the 3D scene to a
  low-resolution viewport and scale by an integer with nearest filtering.
- Keep shadow-casting lights and voxel material variants limited. The custom
  `light()` function still runs per affecting light; use a small number of
  local lights and bake/fake ambient fill for static scenes.

The shader reduces texture and fragment work, but it cannot guarantee that an
entire Godot project stays within a 32 MiB VRAM budget or a frame-time target.
Measure the Compatibility renderer on the actual GPU, especially with the
outline pass and shadowed lights enabled.

## Shader orchestration, character telemetry and voxel streaming

Add `SentraShaderOrchestrator` to the gameplay root. Set `SentraCorePath`,
`MantisPostProcessPath`, the shared toon `ShaderMaterial` resources in
`ToonMaterials`, `OutlineShader` to `pixel_toon_outline.gdshader`, and the
foreground mesh instances in `OutlineTargets`. The manager listens to typed
`CrisisSnapshot` updates, filters changes below 0.005 tension, then updates
the toon band/tension uniforms and calls `MantisVisionPostProcess.set_tension`.
Outline hull instances share source meshes and are created once at startup;
they do not duplicate texture or mesh storage. They inherit their target's
transform and are excluded from shadow casting.

Godot shader parameters are individual uniforms, not an application-visible
bulk memory block. The manager caches the last tension and only writes
individual `ShaderMaterial` parameters when the crisis meaningfully changes;
this avoids per-frame managed allocations but is not literally one GPU
uniform-buffer upload. Configure corruption separately on the Mantis node.

`SentraCharacterController` can replace the previous movement component on a
`CharacterBody3D`. Configure its `SentraCorePath`, input actions, attack ray
mask and optional `VoxelBridgePath`. It uses the Godot physics tick and
`MoveAndSlide` for authoritative collision, accelerates horizontal velocity,
quantizes velocity components to 1/4096 world units per second and emits a
value-type `SentraControllerTelemetry` sample every 0.1 seconds by default.
The typed C# event and `SentraCoreEngine.ReportControllerTelemetry` do not
construct per-sample collections or JSON. Attacks query one cached
`RayCast3D` only on the attack input edge and call `IDamageable`; they are not
queried every physics frame. Quantization reduces small numeric variation but
does not make Godot physics deterministic across machines or replace a
fixed-point authoritative simulation.

When the player crosses a 16-unit chunk boundary, the controller calls the
bridge's `request_voxel_stream(position, seed)` once. The bridge emits
`voxel_stream_requested(Vector3, int)`; `SentraVoxelStreamer` connects to that
signal. Remote/local orchestrator commands can use this form:

```json
{
  "type": "STREAM_VOXELS",
  "payload": {
    "center": { "x": 20.0, "y": 0.0, "z": -8.0 },
    "seed": 12345
  }
}
```

Attach `SentraVoxelStreamer` under a `Node3D`, set `BridgePath` to the bridge,
and optionally assign a pixel-toon `VoxelMaterial`. Its 16x5x16-cell room
chunks use four fixed doorway portals, seeded internal pillars, and integer
voxel occupancy. A single `WorkerThreadPool` task builds a bounded square
neighborhood using preallocated byte buffers and checks portal corridors with
`SentraFastMath.RaycastVoxels`; the worker never creates Godot nodes/resources
or touches the scene tree. New focus requests overwrite the pending request
and invalidate stale output. The main thread creates/reuses `MultiMesh`
instances and writes a bounded number of cell slots per frame, keeping each
chunk hidden until complete. `chunk_applied` reports portal bits N/E/S/W as
1/2/4/8. Radius is capped at 2 (at most 25 chunks); tune the cell budget and
profile the actual Compatibility GPU before increasing draw or instance
counts.

## Deterministic dungeon contract

`DungeonGenerationRequest` contains seed, room count, corruption, current
tension, decision bit flags and floor index. `DungeonGraphGenerator.Generate`
is pure managed code with a fixed xorshift PRNG. It returns arrays of rooms,
connections and spawn points. The primary route is a connected chain from
entrance to boss; deterministic secret passages add optional loops. Combat
rooms are marked sealed for the renderer/encounter layer. Corruption, tension
and prior decision flags alter enemy budgets, tension anchors and narrative
variants without coupling generation to story scripts.

`DungeonStreamingService.RequestGeneration` uses latest-wins semantics: one
worker is active and at most one newer request is pending. It does not access
Godot nodes or resources on the worker. Results are generation-checked and
surfaced on the main thread via `LayoutReady`; `GetLayoutSnapshot()` converts
to Godot dictionaries only when requested. The snapshot distinguishes the
applied `generation` from `requested_generation` while a newer build runs.

```gdscript
func generate_floor(seed: int, corruption: float, tension: float) -> void:
    $DungeonStreamingService.request_generation(
        seed, 18, corruption, tension, 0, 1
    )

func _on_layout_ready(_generation: int, _rooms: int, _connections: int) -> void:
    var layout: Dictionary = $DungeonStreamingService.get_layout_snapshot()
    consume_dungeon_layout(layout)
```

## Validation boundary

These scripts require a Godot 4 .NET project and editor/runtime for API,
shader and scene validation. The repository currently does not include
`project.godot`, scene files, a C# project file, or a Godot executable.
Collision layers, input actions, node paths, physics occlusion, post-process
camera attachment and renderer consumption still need to be configured and
verified in the host project.
