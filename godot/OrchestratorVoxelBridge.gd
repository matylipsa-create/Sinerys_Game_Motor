extends Node
class_name OrchestratorVoxelBridge

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

func _ready() -> void:
	print("GODOT ENGINE: Voxel & PointCloud Rendering Bridge initialized.")
	RenderingServer.global_shader_parameter_set("spatial_distortion_seed", 1.0)
	RenderingServer.global_shader_parameter_set("active_camera_mode", 0)
	_capture_base_transforms()
	var listen_error: Error = tcp_server.listen(8080, "127.0.0.1")
	if listen_error != OK:
		push_warning("GODOT BRIDGE: Could not listen on 127.0.0.1:8080.")
	else:
		print("GODOT BRIDGE: Listening on ws://localhost:8080/sentra-core")

func _process(_delta: float) -> void:
	if socket_peer == null and tcp_server.is_connection_available():
		socket_peer = WebSocketPeer.new()
		var accept_error: Error = socket_peer.accept_stream(tcp_server.take_connection())
		if accept_error != OK:
			socket_peer = null
			return
	if socket_peer == null:
		return

	socket_peer.poll()
	if socket_peer.get_ready_state() == WebSocketPeer.STATE_OPEN:
		while socket_peer.get_available_packet_count() > 0:
			_handle_packet(socket_peer.get_packet().get_string_from_utf8())
	elif socket_peer.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		socket_peer = null

func _handle_packet(packet_text: String) -> void:
	var parsed: Variant = JSON.parse_string(packet_text)
	if not (parsed is Dictionary):
		return
	var command: Dictionary = parsed
	if not command.has("type") or not command.has("payload") or not (command.payload is Dictionary):
		return
	command_received.emit(command)
	match command.type:
		"MUTATE_SPACETIME":
			var tier: int = int(command.payload.get("realityTier", 0))
			request_spatial_regeneration(tier)
			send_command({ "type": "MUTATE_SPACETIME", "payload": { "realityTier": tier, "acknowledged": true } })
		"UPDATE_PERCEPTION":
			var camera_modes: Array[String] = ["ISOMETRIC", "FIRST_PERSON", "SIDE_SCROLLER"]
			var mode_name: String = str(command.payload.get("activeCameraMode", ""))
			var mode_index: int = camera_modes.find(mode_name)
			if mode_index >= 0:
				set_camera_mode(mode_index)
			var mantis_filters: Variant = command.payload.get("mantisFiltersActive")
			if typeof(mantis_filters) == TYPE_BOOL:
				mantis_filters_active = mantis_filters
			perception_directive_received.emit(command.payload)
			var survival: Variant = command.payload.get("survival", {})
			if survival is Dictionary:
				_apply_survival_directive(survival)
		"SPAWN_MOBS":
			print("GODOT: Mob spawn command received.")
		"TRIGGER_CRISIS":
			print("GODOT: Crisis command received.")
		"WORLD_STATE":
			_handle_world_state(command.payload)

func _handle_world_state(payload: Dictionary) -> void:
	var event_type: String = str(payload.get("eventType", ""))
	var event_payload: Variant = payload.get("payload", {})
	if not event_payload is Dictionary:
		send_command({
			"type": "WORLD_STATE_ACK",
			"payload": { "eventType": event_type, "accepted": false, "reason": "invalid-payload" }
		})
		return

	match event_type:
		"world:tension:changed":
			var tension: Variant = event_payload.get("tension")
			if typeof(tension) != TYPE_INT and typeof(tension) != TYPE_FLOAT:
				send_command({
					"type": "WORLD_STATE_ACK",
					"payload": { "eventType": event_type, "accepted": false, "reason": "invalid-tension" }
				})
				return
			var normalized_tension: float = clampf(float(tension), 0.0, 100.0)
			world_tension_changed.emit(normalized_tension)
			current_world_tension = normalized_tension
			world_state_event_received.emit(event_type, event_payload)
		"world:difficulty:changed":
			var band: String = str(event_payload.get("band", ""))
			var scale: Variant = event_payload.get("scale")
			if band not in ["calm", "tense", "critical"] or (typeof(scale) != TYPE_INT and typeof(scale) != TYPE_FLOAT):
				send_command({
					"type": "WORLD_STATE_ACK",
					"payload": { "eventType": event_type, "accepted": false, "reason": "invalid-difficulty" }
				})
				return
			var normalized_scale: float = clampf(float(scale), 1.0, 2.0)
			current_difficulty_band = band
			current_difficulty_scale = normalized_scale
			world_difficulty_changed.emit(band, normalized_scale)
			world_state_event_received.emit(event_type, event_payload)
		"world:state:changed":
			world_state_event_received.emit(event_type, event_payload)
		_:
			send_command({
				"type": "WORLD_STATE_ACK",
				"payload": { "eventType": event_type, "accepted": false, "reason": "unsupported-event" }
			})
			return

	send_command({
		"type": "WORLD_STATE_ACK",
		"payload": { "eventType": event_type, "revision": payload.get("revision", -1), "accepted": true }
	})

func _apply_survival_directive(survival: Dictionary) -> void:
	var oxygen: Variant = survival.get("oxygen")
	var radiation: Variant = survival.get("radiation")
	if (typeof(oxygen) == TYPE_INT or typeof(oxygen) == TYPE_FLOAT) and is_finite(float(oxygen)):
		suit_oxygen = clampf(float(oxygen), 0.0, 100.0)
	if (typeof(radiation) == TYPE_INT or typeof(radiation) == TYPE_FLOAT) and is_finite(float(radiation)):
		suit_radiation = clampf(float(radiation), 0.0, 100.0)
	survival_directive_received.emit(survival)

func send_command(command: Dictionary) -> void:
	if socket_peer and socket_peer.get_ready_state() == WebSocketPeer.STATE_OPEN:
		socket_peer.send_text(JSON.stringify(command))

func _capture_base_transforms() -> void:
	base_transforms.clear()
	if not voxel_multimesh_instance or not voxel_multimesh_instance.multimesh:
		return
	var multimesh: MultiMesh = voxel_multimesh_instance.multimesh
	for index in range(multimesh.instance_count):
		base_transforms.append(multimesh.get_instance_transform(index))

func request_spatial_regeneration(reality_tier: int) -> void:
	if reality_tier < 0:
		return
	print("GODOT: Starting parallel voxel calculation for Reality Tier: ", reality_tier)
	worker_task_id = WorkerThreadPool.add_task(
		Callable(self, "_process_voxel_data_async").bind(reality_tier)
	)

func set_camera_mode(mode: int) -> void:
	if mode < 0 or mode > 2:
		return
	RenderingServer.global_shader_parameter_set("active_camera_mode", mode)

func _process_voxel_data_async(tier: int) -> void:
	OS.delay_msec(15)
	call_deferred("_apply_multimesh_transformations", tier)

func _apply_multimesh_transformations(tier: int) -> void:
	worker_task_id = -1
	if not voxel_multimesh_instance or not voxel_multimesh_instance.multimesh:
		return
	var multimesh: MultiMesh = voxel_multimesh_instance.multimesh
	if base_transforms.size() != multimesh.instance_count:
		_capture_base_transforms()
	for index in range(mini(multimesh.instance_count, base_transforms.size())):
		var instance_transform: Transform3D = base_transforms[index]
		instance_transform.origin.y += sin(float(index) * float(tier) * 0.1) * 0.05
		multimesh.set_instance_transform(index, instance_transform)
	RenderingServer.global_shader_parameter_set("spatial_distortion_seed", float(maxi(1, tier)))
	print("GODOT: Voxel geometry updated on the GPU via MultiMesh.")