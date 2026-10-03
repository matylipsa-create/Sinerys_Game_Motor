extends Node
class_name OrchestratorVoxelBridge

const MAX_PACKET_BYTES := 64 * 1024
const MAX_INCOMING_PACKETS := 128
const PARSE_BATCH_SIZE := 8
const MAX_PACKETS_PER_FRAME := 16
const MAX_COMMAND_QUEUE := 64
const MAX_COMMANDS_PER_FRAME := 12
const MAX_OUTGOING_MESSAGES := 64
const MAX_OUTGOING_PER_FRAME := 16
const TRANSFORMS_PER_FRAME := 128
const CAMERA_MODES := ["ISOMETRIC", "FIRST_PERSON", "SIDE_SCROLLER"]
const WORLD_STATE_TYPES := [
	"world:tension:changed",
	"world:difficulty:changed",
	"world:state:changed",
]

@export var voxel_multimesh_instance: MultiMeshInstance3D

signal command_received(command: Dictionary)
signal world_tension_changed(tension: float)
signal world_difficulty_changed(band: String, scale: float)
signal world_state_event_received(event_type: String, payload: Dictionary)
signal perception_directive_received(payload: Dictionary)
signal survival_directive_received(payload: Dictionary)

var worker_task_id: int = -1
var base_transforms: Array[Transform3D] = []
var tcp_server := TCPServer.new()
var socket_peer: WebSocketPeer
var current_world_tension: float = 0.0
var current_difficulty_band: String = "calm"
var current_difficulty_scale: float = 1.0
var mantis_filters_active: bool = false
var suit_oxygen: float = 100.0
var suit_radiation: float = 0.0

var _generation: int = 0
var _incoming_packets: Array[String] = []
var _command_queue: Array[Dictionary] = []
var _latest_state_commands: Dictionary = {}
var _outgoing_commands: Array[Dictionary] = []
var _parse_task_id: int = -1
var _parse_task_busy: bool = false
var _pending_rebuild: Dictionary = {}
var _rebuild_task_busy: bool = false
var _pending_transforms: Array[Transform3D] = []
var _pending_transform_generation: int = -1
var _pending_transform_index: int = 0
var _dropped_packets: int = 0
var _dropped_commands: int = 0
var _dropped_outgoing: int = 0
var _shutting_down: bool = false


func _ready() -> void:
	_capture_base_transforms()
	var listen_error: Error = tcp_server.listen(8080, "127.0.0.1")
	if listen_error != OK:
		push_warning("GODOT BRIDGE: Could not listen on 127.0.0.1:8080.")
	else:
		print("GODOT BRIDGE: Listening on ws://localhost:8080/sentra-core")


func _process(_delta: float) -> void:
	_accept_connection()
	_poll_socket()
	_start_packet_parse()
	_process_commands()
	_send_queued_commands()
	_apply_transform_batch()


func _exit_tree() -> void:
	_shutting_down = true
	if _parse_task_id >= 0:
		WorkerThreadPool.wait_for_task_completion(_parse_task_id)
		_parse_task_id = -1
	if worker_task_id >= 0:
		WorkerThreadPool.wait_for_task_completion(worker_task_id)
		worker_task_id = -1
	if socket_peer:
		socket_peer.close()
		socket_peer = null
	tcp_server.stop()


func _accept_connection() -> void:
	if socket_peer != null or not tcp_server.is_connection_available():
		return

	var peer := WebSocketPeer.new()
	var accept_error: Error = peer.accept_stream(tcp_server.take_connection())
	if accept_error != OK:
		push_warning("GODOT BRIDGE: Could not accept WebSocket connection.")
		return
	socket_peer = peer


func _poll_socket() -> void:
	if socket_peer == null:
		return

	socket_peer.poll()
	if socket_peer.get_ready_state() == WebSocketPeer.STATE_OPEN:
		var processed := 0
		while processed < MAX_PACKETS_PER_FRAME \
				and socket_peer.get_available_packet_count() > 0:
			var packet: PackedByteArray = socket_peer.get_packet()
			processed += 1
			if packet.size() > MAX_PACKET_BYTES:
				_dropped_packets += 1
				continue
			_enqueue_packet(packet.get_string_from_utf8())
	elif socket_peer.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		socket_peer = null


func _enqueue_packet(packet_text: String) -> void:
	if _incoming_packets.size() >= MAX_INCOMING_PACKETS:
		_dropped_packets += 1
		return
	_incoming_packets.append(packet_text)


func _start_packet_parse() -> void:
	if _parse_task_busy or _incoming_packets.is_empty() or _shutting_down:
		return

	# Packet strings are detached from the socket before the worker parses them.
	var batch: Array[String] = []
	var count: int = mini(PARSE_BATCH_SIZE, _incoming_packets.size())
	for index in range(count):
		batch.append(_incoming_packets.pop_front())

	_parse_task_busy = true
	_parse_task_id = WorkerThreadPool.add_task(
		Callable(self, "_parse_packet_batch").bind(batch),
		false,
		"Parse orchestrator WebSocket packets"
	)


func _parse_packet_batch(packet_batch: Array[String]) -> void:
	# This worker only parses local strings; signals and scene state stay on main.
	var parsed_commands: Array[Dictionary] = []
	for packet_text in packet_batch:
		var parsed: Variant = JSON.parse_string(packet_text)
		if typeof(parsed) != TYPE_DICTIONARY:
			continue
		var command: Dictionary = parsed
		if typeof(command.get("type")) != TYPE_STRING:
			continue
		if typeof(command.get("payload")) != TYPE_DICTIONARY:
			continue
		parsed_commands.append(command)

	call_deferred("_on_packet_batch_parsed", parsed_commands)


func _on_packet_batch_parsed(parsed_commands: Array[Dictionary]) -> void:
	_parse_task_busy = false
	_parse_task_id = -1
	if _shutting_down:
		return

	for command in parsed_commands:
		_queue_command(command)
	_start_packet_parse()


func _queue_command(command: Dictionary) -> void:
	var command_type: String = command.get("type", "")
	var payload: Dictionary = command.get("payload", {})
	if command_type.is_empty():
		return

	if command_type == "WORLD_STATE":
		var event_type: String = str(payload.get("eventType", ""))
		if not WORLD_STATE_TYPES.has(event_type):
			return
		_latest_state_commands[event_type] = command
		return

	if command_type == "UPDATE_PERCEPTION":
		_latest_state_commands["UPDATE_PERCEPTION"] = command
		return

	if _command_queue.size() >= MAX_COMMAND_QUEUE:
		_dropped_commands += 1
		return
	_command_queue.append(command)


func _process_commands() -> void:
	var processed := 0
	while processed < MAX_COMMANDS_PER_FRAME and not _command_queue.is_empty():
		var command: Dictionary = _command_queue.pop_front()
		_dispatch_command(command)
		processed += 1

	if processed >= MAX_COMMANDS_PER_FRAME:
		return

	var remaining: int = MAX_COMMANDS_PER_FRAME - processed
	for key in _latest_state_commands.keys():
		if remaining <= 0:
			break
		var command: Dictionary = _latest_state_commands[key]
		_latest_state_commands.erase(key)
		_dispatch_command(command)
		remaining -= 1


func _dispatch_command(command: Dictionary) -> void:
	command_received.emit(command)
	var command_type: String = command.get("type", "")
	var payload: Dictionary = command.get("payload", {})

	match command_type:
		"MUTATE_SPACETIME":
			var tier_value: Variant = payload.get("realityTier", 0)
			if typeof(tier_value) != TYPE_INT and typeof(tier_value) != TYPE_FLOAT:
				return
			var tier := int(tier_value)
			if tier < 0:
				return
			request_spatial_regeneration(tier)
			send_command({
				"type": "MUTATE_SPACETIME",
				"payload": { "realityTier": tier, "acknowledged": true },
			})
		"UPDATE_PERCEPTION":
			var mode_name: String = str(payload.get("activeCameraMode", ""))
			var mode_index: int = CAMERA_MODES.find(mode_name)
			if mode_index >= 0:
				set_camera_mode(mode_index)

			var mantis_filters: Variant = payload.get("mantisFiltersActive")
			if typeof(mantis_filters) == TYPE_BOOL:
				mantis_filters_active = mantis_filters

			perception_directive_received.emit(payload)
			var survival: Variant = payload.get("survival", {})
			if typeof(survival) == TYPE_DICTIONARY:
				_apply_survival_directive(survival)
		"SPAWN_MOBS":
			pass
		"TRIGGER_CRISIS":
			pass
		"WORLD_STATE":
			_handle_world_state(payload)
		_:
			pass


func _handle_world_state(payload: Dictionary) -> void:
	var event_type: String = str(payload.get("eventType", ""))
	var event_payload: Variant = payload.get("payload", {})
	var revision: Variant = payload.get("revision", -1)
	if typeof(event_payload) != TYPE_DICTIONARY:
		_send_world_state_ack(event_type, revision, false, "invalid-payload")
		return

	match event_type:
		"world:tension:changed":
			var tension: Variant = event_payload.get("tension")
			if not _is_finite_number(tension):
				_send_world_state_ack(event_type, revision, false, "invalid-tension")
				return
			current_world_tension = clampf(float(tension), 0.0, 100.0)
			world_tension_changed.emit(current_world_tension)
			world_state_event_received.emit(event_type, event_payload)
		"world:difficulty:changed":
			var band: String = str(event_payload.get("band", ""))
			var scale: Variant = event_payload.get("scale")
			if not ["calm", "tense", "critical"].has(band) \
					or not _is_finite_number(scale):
				_send_world_state_ack(event_type, revision, false, "invalid-difficulty")
				return
			current_difficulty_band = band
			current_difficulty_scale = clampf(float(scale), 1.0, 2.0)
			world_difficulty_changed.emit(
				current_difficulty_band,
				current_difficulty_scale
			)
			world_state_event_received.emit(event_type, event_payload)
		"world:state:changed":
			world_state_event_received.emit(event_type, event_payload)
		_:
			_send_world_state_ack(event_type, revision, false, "unsupported-event")
			return

	_send_world_state_ack(event_type, revision, true)


func _is_finite_number(value: Variant) -> bool:
	if typeof(value) != TYPE_INT and typeof(value) != TYPE_FLOAT:
		return false
	return is_finite(float(value))


func _send_world_state_ack(
	event_type: String,
	revision: Variant,
	accepted: bool,
	reason: String = ""
) -> void:
	var payload := {
		"eventType": event_type,
		"revision": revision,
		"accepted": accepted,
	}
	if not reason.is_empty():
		payload["reason"] = reason
	send_command({ "type": "WORLD_STATE_ACK", "payload": payload })


func _apply_survival_directive(survival: Dictionary) -> void:
	var oxygen: Variant = survival.get("oxygen")
	var radiation: Variant = survival.get("radiation")
	if _is_finite_number(oxygen):
		suit_oxygen = clampf(float(oxygen), 0.0, 100.0)
	if _is_finite_number(radiation):
		suit_radiation = clampf(float(radiation), 0.0, 100.0)
	survival_directive_received.emit(survival)


func send_command(command: Dictionary) -> void:
	if _outgoing_commands.size() >= MAX_OUTGOING_MESSAGES:
		_dropped_outgoing += 1
		return
	_outgoing_commands.append(command.duplicate(true))


func get_queue_stats() -> Dictionary:
	return {
		"incoming_packets": _incoming_packets.size(),
		"queued_commands": _command_queue.size(),
		"coalesced_states": _latest_state_commands.size(),
		"outgoing_commands": _outgoing_commands.size(),
		"dropped_packets": _dropped_packets,
		"dropped_commands": _dropped_commands,
		"dropped_outgoing": _dropped_outgoing,
		"generation": _generation,
	}


func _send_queued_commands() -> void:
	if (
		socket_peer == null
		or socket_peer.get_ready_state() != WebSocketPeer.STATE_OPEN
	):
		return

	var sent := 0
	while sent < MAX_OUTGOING_PER_FRAME and not _outgoing_commands.is_empty():
		var command: Dictionary = _outgoing_commands.pop_front()
		var error: Error = socket_peer.send_text(JSON.stringify(command))
		if error != OK:
			# Preserve ordering and retry on the next frame if the send failed.
			_outgoing_commands.push_front(command)
			return
		sent += 1


func _capture_base_transforms() -> void:
	base_transforms.clear()
	if not is_instance_valid(voxel_multimesh_instance):
		return
	var multimesh: MultiMesh = voxel_multimesh_instance.multimesh
	if multimesh == null:
		return

	base_transforms.resize(multimesh.instance_count)
	for index in range(multimesh.instance_count):
		base_transforms[index] = multimesh.get_instance_transform(index)


func request_spatial_regeneration(reality_tier: int) -> void:
	if reality_tier < 0 or _shutting_down:
		return
	if (
		not is_instance_valid(voxel_multimesh_instance)
		or voxel_multimesh_instance.multimesh == null
	):
		return

	if base_transforms.size() != voxel_multimesh_instance.multimesh.instance_count:
		_capture_base_transforms()

	_generation += 1
	_pending_transforms.clear()
	_pending_transform_index = 0
	_pending_rebuild = {
		"generation": _generation,
		"tier": reality_tier,
		"transforms": base_transforms.duplicate(),
	}
	_start_pending_rebuild()


func _start_pending_rebuild() -> void:
	if _rebuild_task_busy or _pending_rebuild.is_empty() or _shutting_down:
		return

	var request: Dictionary = _pending_rebuild
	_pending_rebuild = {}
	_rebuild_task_busy = true
	worker_task_id = WorkerThreadPool.add_task(
		Callable(self, "_build_transform_result").bind(
			int(request["generation"]),
			int(request["tier"]),
			request["transforms"]
		),
		false,
		"Build voxel transform snapshot"
	)


func _build_transform_result(
	generation: int,
	tier: int,
	transforms: Array[Transform3D]
) -> void:
	# Only value-type transforms are touched here; no Node or visual Resource access.
	var result: Array[Transform3D] = []
	result.resize(transforms.size())
	for index in range(transforms.size()):
		var instance_transform: Transform3D = transforms[index]
		instance_transform.origin.y += sin(float(index) * float(tier) * 0.1) * 0.05
		result[index] = instance_transform

	call_deferred("_on_transform_result_ready", generation, tier, result)


func _on_transform_result_ready(
	generation: int,
	tier: int,
	transforms: Array[Transform3D]
) -> void:
	_rebuild_task_busy = false
	worker_task_id = -1

	if not _shutting_down and generation == _generation:
		_pending_transforms = transforms
		_pending_transform_generation = generation
		_pending_transform_index = 0
		RenderingServer.global_shader_parameter_set(
			"spatial_distortion_seed",
			float(maxi(1, tier))
		)

	_start_pending_rebuild()


func _apply_transform_batch() -> void:
	if (
		_pending_transform_generation != _generation
		or _pending_transforms.is_empty()
	):
		return
	if not is_instance_valid(voxel_multimesh_instance):
		_pending_transforms.clear()
		return

	var multimesh: MultiMesh = voxel_multimesh_instance.multimesh
	if multimesh == null:
		_pending_transforms.clear()
		return

	var end_index: int = mini(
		_pending_transform_index + TRANSFORMS_PER_FRAME,
		mini(_pending_transforms.size(), multimesh.instance_count)
	)
	while _pending_transform_index < end_index:
		multimesh.set_instance_transform(
			_pending_transform_index,
			_pending_transforms[_pending_transform_index]
		)
		_pending_transform_index += 1

	var applicable_count: int = mini(
		_pending_transforms.size(),
		multimesh.instance_count
	)
	if _pending_transform_index >= applicable_count:
		_pending_transforms.clear()
		_pending_transform_generation = -1


func set_camera_mode(mode: int) -> void:
	if mode < 0 or mode >= CAMERA_MODES.size():
		return
	RenderingServer.global_shader_parameter_set("active_camera_mode", mode)
