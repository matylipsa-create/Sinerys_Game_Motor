extends MeshInstance3D
class_name MantisVisionPostProcess

const SHADER_PATH := "res://godot/shaders/mantis_vision_post_process.gdshader"
const PROJECT_ROOT_SHADER_PATH := "res://shaders/mantis_vision_post_process.gdshader"

@export_range(0.0, 1.0, 0.01) var tension: float = 0.0
@export_range(0.0, 1.0, 0.01) var corruption: float = 0.0
@export_range(0.0, 2.0, 0.01) var edge_strength: float = 0.8
@export_range(0.0, 2.0, 0.01) var depth_edge_strength: float = 0.35
@export_range(0.01, 0.5, 0.01) var impact_radius: float = 0.12
@export var crisis_director_path: NodePath

var _material: ShaderMaterial
var _crisis_director: Node
var _impact_strength: float = 0.0
var _impact_uv := Vector2(0.5, 0.5)


func _ready() -> void:
	var shader_path := SHADER_PATH
	if not ResourceLoader.exists(shader_path):
		shader_path = PROJECT_ROOT_SHADER_PATH
	if not ResourceLoader.exists(shader_path):
		push_error(
			"Mantis Vision: shader not found at %s or %s."
			% [SHADER_PATH, PROJECT_ROOT_SHADER_PATH]
		)
		return
	var shader := load(shader_path) as Shader
	if shader == null:
		push_error("Mantis Vision: shader could not be loaded at %s." % shader_path)
		return

	var quad := QuadMesh.new()
	quad.size = Vector2(2.0, 2.0)
	mesh = quad
	custom_aabb = AABB(Vector3(-2.0, -2.0, -2.0), Vector3(4.0, 4.0, 4.0))
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_material = ShaderMaterial.new()
	_material.shader = shader
	_material.render_priority = 127
	material_override = _material
	_sync_material()
	if not crisis_director_path.is_empty():
		_crisis_director = get_node_or_null(crisis_director_path)
		if is_instance_valid(_crisis_director):
			if _crisis_director.has_signal("crisis_snapshot_updated"):
				_crisis_director.connect(
					"crisis_snapshot_updated",
					_on_crisis_snapshot_updated
				)
			else:
				push_warning("Mantis Vision: configured crisis node has no crisis_snapshot_updated signal.")


func _exit_tree() -> void:
	if (
		is_instance_valid(_crisis_director)
		and _crisis_director.has_signal("crisis_snapshot_updated")
		and _crisis_director.is_connected(
			"crisis_snapshot_updated",
			_on_crisis_snapshot_updated
		)
	):
		_crisis_director.disconnect(
			"crisis_snapshot_updated",
			_on_crisis_snapshot_updated
		)


func _process(delta: float) -> void:
	if _impact_strength <= 0.0 or _material == null:
		return
	_impact_strength = maxf(0.0, _impact_strength - maxf(0.0, delta) * 2.5)
	_material.set_shader_parameter("impact_strength", _impact_strength)


func set_critical_state(next_tension: float, next_corruption: float) -> void:
	tension = clampf(next_tension, 0.0, 1.0)
	corruption = clampf(next_corruption, 0.0, 1.0)
	_sync_material()


func set_tension(next_tension: float) -> void:
	tension = clampf(next_tension, 0.0, 1.0)
	_sync_material()


func _on_crisis_snapshot_updated(
	next_tension: float,
	_phase: int,
	_enemy_density: float,
	_visibility: float,
	_lighting: float,
	_spawn_budget: int,
	_sequence: int
) -> void:
	set_critical_state(next_tension, corruption)


func set_quality(edge: float, depth_edge: float) -> void:
	edge_strength = clampf(edge, 0.0, 2.0)
	depth_edge_strength = clampf(depth_edge, 0.0, 2.0)
	_sync_material()


func trigger_impact(screen_uv: Vector2, intensity: float = 1.0) -> void:
	_impact_uv = Vector2(clampf(screen_uv.x, 0.0, 1.0), clampf(screen_uv.y, 0.0, 1.0))
	_impact_strength = maxf(_impact_strength, clampf(intensity, 0.0, 1.0))
	_sync_material()


func _sync_material() -> void:
	if _material == null:
		return
	_material.set_shader_parameter("tension", tension)
	_material.set_shader_parameter("corruption", corruption)
	_material.set_shader_parameter("contrast", 1.18 + tension * 0.22)
	_material.set_shader_parameter("edge_strength", edge_strength)
	_material.set_shader_parameter("depth_edge_strength", depth_edge_strength)
	_material.set_shader_parameter("impact_radius", impact_radius)
	_material.set_shader_parameter("impact_uv", _impact_uv)
	_material.set_shader_parameter("impact_strength", _impact_strength)
