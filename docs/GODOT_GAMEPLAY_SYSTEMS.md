# Godot gameplay systems

## Ownership and flow

`SentraCoreEngine` owns the bounded gameplay-event ring and the latest crisis
snapshot. The threat director consumes value-type telemetry and publishes
low-frequency directives. The player controller submits actions and sampled
telemetry to that core. Dungeon generation is a separate deterministic
service: it produces a logical room graph and spawn plan, not scene instances.

```text
CharacterBody3D
  ├─ movement / dodge / stagger
  ├─ reusable RayCast3D ──> IDamageable
  └─ sampled PlayerTelemetry + action events
                            │
                            v
SentraCoreEngine ──> CrisisThreatDirector
  ├─ fixed event ring        ├─ smoothed tension
  ├─ current snapshot        └─ typed threat directives
  └─ typed C# events

DungeonStreamingService
  └─ WorkerThreadPool ──> deterministic DungeonLayout
                            └─ main-thread signal / snapshot
                                └─ existing renderer or room scene adapter
```

## Scene wiring

Attach `SentraCoreEngine` to the gameplay root and add a child named
`CrisisThreatDirector`, or set the engine's `CrisisDirectorPath` to its actual
child path. Add `DungeonStreamingService` beside those nodes. Set the player's
`SentraCorePath` to the engine node path and configure `AttackCollisionMask` to
the project's enemy-body layer. The controller uses `ui_left`, `ui_right`,
`ui_up`, and `ui_down` by default; add `sprint`, `dodge`, and `attack` to the
Input Map or change the exported action names.

Attach `DamageableComponent` to an enemy root that is included in the raycast
mask. If the raycast hits a child collider, the controller checks up to four
parents for `IDamageable`. Replace the fallback ray with a `RayCast3D` at
`Camera3D/AttackRay` if the scene already has a preferred attack origin.
The controller disables its ray outside an attack and forces one query on
attack input. A health/combat component should apply damage first, then call
`ApplyPlayerDamage(damage, resultingHealthRatio, knockback)` on the player.

## Crisis and Sentra contract

`PlayerTelemetry` and `CoreGameplayEvent` are immutable value types. Runtime
events are stored in a fixed ring of 512 entries; a full ring increments a
drop counter instead of allocating or growing. Crisis snapshots use their
separate typed event/signal and do not consume gameplay-ring capacity.
Consumers can poll gameplay events with
`TryDequeueGameplayEvent` or subscribe to the typed C# event. Keep subscribers
long-lived and avoid closures on per-frame paths.

The director samples at 10 Hz, combines health, nearby enemies, incoming
damage, action pace, corruption, environmental pressure and decaying event
pressure, then applies a smoothstep curve and exponential smoothing. State
thresholds have hysteresis. Snapshot and directive notifications are emitted
only when tension changes by at least 0.01 or the threat phase changes, with
publication capped by the snapshot interval.
For registered `GameEntityType.Chimera` resources, Sentra counts entities
within `ThreatRadius` around the player's X/Z position without making a
per-sample snapshot or temporary collection. Other enemy sensors may provide a
larger `NearbyEnemies` value through the player's world telemetry.

`CrisisThreatDirector` exposes a Godot `CrisisSnapshotUpdated` signal for
scene/UI listeners and typed C# events for gameplay modules. Godot signal
conversion is intentionally low-frequency; the internal snapshot and gameplay
event contracts remain value types.

The renderer/encounter manager should subscribe to `DirectiveIssued` and apply
lighting, visibility and spawn-budget changes incrementally. It should not
instantiate an entire encounter or rebuild all geometry synchronously in that
callback.

For a GDScript presentation layer, connect the low-frequency signal:

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
    # Apply cached parameters or enqueue incremental work; do not rebuild here.
    pass
```

## Deterministic dungeon contract

`DungeonGenerationRequest` contains the seed, room count, corruption, decision
bit flags and floor index. `DungeonGraphGenerator.Generate` is pure managed
code with a fixed xorshift PRNG. It returns `DungeonLayout` arrays of rooms,
connections and spawn points. The primary route is a connected chain from the
entrance to the boss; deterministic secret passages add optional loops.
Combat and boss rooms are marked sealed for the renderer/encounter layer.
Corruption and prior decision flags alter enemy budgets, tension anchors and
narrative variants without coupling the generator to story scripts.
Current crisis tension is also part of the generation request, so the same
seed plus the same Sentra snapshot and decisions produces the same layout.

`DungeonStreamingService.RequestGeneration` uses latest-wins semantics: only
one worker is active and at most one newer request is pending. The worker
touches only managed input/output data. It does not access Godot nodes or
resources. Results are generation-checked and surfaced on the main thread via
`LayoutReady`; `GetLayoutSnapshot()` performs the optional Godot dictionary
conversion once when a renderer asks for it. The snapshot distinguishes the
currently applied `generation` from `requested_generation` while a newer
latest-wins build is still running.

Example request from a GDScript area/level controller:

```gdscript
func generate_floor(seed: int, corruption: float, tension: float) -> void:
    $DungeonStreamingService.request_generation(
        seed, 18, corruption, tension, 0, 1
    )

func _on_layout_ready(_generation: int, _rooms: int, _connections: int) -> void:
    var layout: Dictionary = $DungeonStreamingService.get_layout_snapshot()
    # Hand this logical layout to the project's renderer/room adapter.
    consume_dungeon_layout(layout)
```

## Validation boundary

These scripts require a Godot 4 .NET project and a Godot 4 editor/runtime for
API and scene validation. The repository currently does not include a
`project.godot` or scene wiring, so collision layers, input actions, exported
node paths, and actual renderer consumption must be configured and verified in
the host project.
