shader_type spatial;
render_mode specular_disabled, depth_draw_opaque, cull_back;

uniform sampler2D point_texture : source_color, filter_nearest, repeat_disable;
uniform vec4 point_tint : source_color = vec4(1.0);
uniform vec3 shadow_tint : source_color = vec3(0.10, 0.08, 0.15);
uniform vec3 mid_tint : source_color = vec3(0.58, 0.52, 0.66);
uniform vec3 light_tint : source_color = vec3(1.0, 0.94, 0.84);
uniform vec3 crisis_tint : source_color = vec3(0.56, 0.055, 0.075);
uniform float toon_steps : hint_range(3.0, 5.0, 1.0) = 3.0;
uniform float mid_threshold : hint_range(0.0, 1.0, 0.01) = 0.34;
uniform float lit_threshold : hint_range(0.0, 1.0, 0.01) = 0.72;
uniform float shadow_level : hint_range(0.0, 1.0, 0.01) = 0.3;
uniform float mid_level : hint_range(0.0, 1.0, 0.01) = 0.68;
uniform float point_size : hint_range(0.001, 4.0, 0.001) = 0.12;
uniform float alpha_cutoff : hint_range(0.0, 1.0, 0.01) = 0.5;
uniform float crisis_tension : hint_range(0.0, 1.0, 0.01) = 0.0;
uniform bool use_instance_custom_size = false;
uniform float ambient_fill : hint_range(0.0, 0.25, 0.005) = 0.025;

varying vec2 point_uv;
varying vec3 billboard_normal_view;

void vertex() {
	vec4 center_world = MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0);
	vec3 camera_right_world = INV_VIEW_MATRIX[0].xyz;
	vec3 camera_up_world = INV_VIEW_MATRIX[1].xyz;
	vec3 camera_normal_world = INV_VIEW_MATRIX[2].xyz;
	float instance_scale = use_instance_custom_size
		? max(INSTANCE_CUSTOM.r, 0.0)
		: 1.0;

	vec3 billboard_world = center_world.xyz
		+ camera_right_world * VERTEX.x * point_size * instance_scale
		+ camera_up_world * VERTEX.y * point_size * instance_scale;
	vec4 billboard_view = VIEW_MATRIX * vec4(billboard_world, 1.0);
	VERTEX = billboard_view.xyz;
	billboard_normal_view = normalize(
		(VIEW_MATRIX * vec4(camera_normal_world, 0.0)).xyz
	);
	point_uv = UV;
	POSITION = PROJECTION_MATRIX * billboard_view;
}

void fragment() {
	vec4 texel = texture(point_texture, point_uv) * point_tint * COLOR;
	NORMAL = normalize(billboard_normal_view);
	ALBEDO = texel.rgb;
	ALPHA = texel.a;
	ALPHA_SCISSOR_THRESHOLD = alpha_cutoff;
	EMISSION = ALBEDO * shadow_tint * ambient_fill;
}

void light() {
	float ndotl = max(dot(normalize(NORMAL), normalize(LIGHT)), 0.0);
	float bands = max(3.0, floor(toon_steps + 0.5));
	float band_index = min(floor(ndotl * bands), bands - 1.0);
	float quantized = band_index / max(1.0, bands - 1.0);
	float mid_band = step(mid_threshold, quantized);
	float lit_band = step(lit_threshold, quantized);

	vec3 stressed_mid = mix(mid_tint, crisis_tint, crisis_tension * 0.28);
	vec3 band_tint = mix(shadow_tint, stressed_mid, mid_band);
	band_tint = mix(band_tint, light_tint, lit_band);
	float band_level = mix(shadow_level, mid_level, mid_band);
	band_level = mix(band_level, 1.0, lit_band);

	DIFFUSE_LIGHT += ALBEDO * band_tint * band_level * LIGHT_COLOR * ATTENUATION;
}
