extends Node
class_name PerceptionTelemetryMonitor

signal metrics_sampled(metrics: Dictionary)

@export var voxel_bridge_path: NodePath
@export var perception_processor_path: NodePath
@export var sentra_core_path: NodePath
@export_range(0.1, 10.0, 0.1) var sample_interval_seconds: float = 1.0
@export_range(5.0, 100.0, 1.0) var frame_warning_ms: float = 20.0
@export_range(64.0, 8192.0, 64.0) var memory_warning_mb: float = 2048.0
@export_range(1.0, 1000.0, 1.0) var bridge_warning_ms: float = 100.0
@export_range(1, 128, 1) var queue_warning_depth: int = 48

var _elapsed: float = 0.0
var _warning_cooldown: float = 0.0
var _voxel_bridge: Node
var _perception_processor: Node
var _sentra_core: Node


func _ready() -> void:
	if not voxel_bridge_path.is_empty():
		_voxel_bridge = get_node_or_null(voxel_bridge_path)
	if not perception_processor_path.is_empty():
		_perception_processor = get_node_or_null(perception_processor_path)
	if not sentra_core_path.is_empty():
		_sentra_core = get_node_or_null(sentra_core_path)
	sample_interval_seconds = maxf(0.1, sample_interval_seconds)


func _process(delta: float) -> void:
	_elapsed += delta
	_warning_cooldown = maxf(0.0, _warning_cooldown - delta)
	if _elapsed < sample_interval_seconds:
		return

	var sample_period := _elapsed
	_elapsed = 0.0
	var process_ms := Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
	var physics_ms := Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
	var memory_bytes := Performance.get_monitor(Performance.MEMORY_STATIC)
	var managed_heap_bytes := 0
	var bridge_latency := -1.0
	var bridge_queues: Dictionary = {}
	var perception_stats: Dictionary = {}
	if is_instance_valid(_voxel_bridge):
		bridge_latency = float(_voxel_bridge.call("get_bridge_latency_ms"))
		bridge_queues = _voxel_bridge.call("get_queue_stats")
	if is_instance_valid(_perception_processor):
		perception_stats = _perception_processor.call("get_perception_stats")
	if is_instance_valid(_sentra_core):
		managed_heap_bytes = int(_sentra_core.call("get_managed_heap_bytes"))
	var metrics := {
		"fps": Engine.get_frames_per_second(),
		"process_ms": process_ms,
		"physics_ms": physics_ms,
		"memory_bytes": memory_bytes,
		"managed_heap_bytes": managed_heap_bytes,
		"node_count": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		"sample_period": sample_period,
		"bridge_latency_ms": bridge_latency,
		"bridge_queues": bridge_queues,
		"perception": perception_stats,
	}

	metrics_sampled.emit(metrics)
	_warn_if_degraded(
		process_ms,
		physics_ms,
		memory_bytes,
		managed_heap_bytes,
		bridge_latency,
		bridge_queues,
		perception_stats
	)


func _warn_if_degraded(
	process_ms: float,
	physics_ms: float,
	memory_bytes: float,
	managed_heap_bytes: int,
	bridge_latency: float,
	bridge_queues: Dictionary,
	perception_stats: Dictionary
) -> void:
	if _warning_cooldown > 0.0:
		return

	var memory_mb := memory_bytes / (1024.0 * 1024.0)
	if process_ms > frame_warning_ms or physics_ms > frame_warning_ms:
		push_warning(
			"PERCEPTION TELEMETRY: frame time (process %.2f ms, physics %.2f ms) exceeds %.2f ms."
			% [process_ms, physics_ms, frame_warning_ms]
		)
		_warning_cooldown = 5.0
	elif memory_mb > memory_warning_mb:
		push_warning(
			"PERCEPTION TELEMETRY: static memory %.1f MB exceeds %.1f MB."
			% [memory_mb, memory_warning_mb]
		)
		_warning_cooldown = 5.0
	elif managed_heap_bytes > memory_warning_mb * 1024.0 * 1024.0:
		push_warning(
			"PERCEPTION TELEMETRY: managed heap %.1f MB exceeds %.1f MB."
			% [
				managed_heap_bytes / (1024.0 * 1024.0),
				memory_warning_mb
			]
		)
		_warning_cooldown = 5.0
	elif bridge_latency >= 0.0 and bridge_latency > bridge_warning_ms:
		push_warning(
			"PERCEPTION TELEMETRY: bridge latency %.1f ms exceeds %.1f ms."
			% [bridge_latency, bridge_warning_ms]
		)
		_warning_cooldown = 5.0
	elif (
		int(bridge_queues.get("incoming_packets", 0)) >= queue_warning_depth
		or int(bridge_queues.get("queued_commands", 0)) >= queue_warning_depth
		or int(bridge_queues.get("outgoing_commands", 0)) >= queue_warning_depth
	):
		push_warning("PERCEPTION TELEMETRY: bridge message queue is near capacity.")
		_warning_cooldown = 5.0
	elif int(perception_stats.get("dropped_results", 0)) > 0:
		push_warning("PERCEPTION TELEMETRY: spatial perception result buffer overflowed.")
		_warning_cooldown = 5.0
	elif (
		int(perception_stats.get("dropped_input_samples", 0)) > 0
		or int(perception_stats.get("dropped_observer_samples", 0)) > 0
	):
		push_warning("PERCEPTION TELEMETRY: spatial perception input exceeded its fixed capacity.")
		_warning_cooldown = 5.0
