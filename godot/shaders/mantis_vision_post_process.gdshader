shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_draw_never, depth_test_disabled;

uniform sampler2D screen_texture : hint_screen_texture, filter_linear, repeat_disable;
uniform sampler2D depth_texture : hint_depth_texture, filter_nearest, repeat_disable;

uniform vec3 shadow_tint : source_color = vec3(0.025, 0.035, 0.075);
uniform vec3 mid_tint : source_color = vec3(0.24, 0.30, 0.38);
uniform vec3 highlight_tint : source_color = vec3(0.95, 0.82, 0.63);
uniform vec3 edge_color : source_color = vec3(0.015, 0.90, 0.72);
uniform vec3 danger_color : source_color = vec3(1.0, 0.12, 0.055);
uniform float shadow_lift : hint_range(0.0, 0.5, 0.01) = 0.08;
uniform float contrast : hint_range(0.5, 2.0, 0.01) = 1.18;
uniform float saturation : hint_range(0.0, 2.0, 0.01) = 1.15;
uniform float edge_threshold : hint_range(0.001, 0.2, 0.001) = 0.035;
uniform float edge_strength : hint_range(0.0, 2.0, 0.01) = 0.8;
uniform float depth_edge_strength : hint_range(0.0, 2.0, 0.01) = 0.35;
uniform float depth_threshold : hint_range(0.0001, 0.1, 0.0001) = 0.008;
uniform float tension : hint_range(0.0, 1.0, 0.01) = 0.0;
uniform float corruption : hint_range(0.0, 1.0, 0.01) = 0.0;
uniform vec2 impact_uv = vec2(0.5, 0.5);
uniform float impact_strength : hint_range(0.0, 1.0, 0.01) = 0.0;
uniform float impact_radius : hint_range(0.01, 0.5, 0.01) = 0.12;

varying vec2 screen_uv;

void vertex() {
	screen_uv = VERTEX.xy * 0.5 + 0.5;
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

float luminance(vec3 color) {
	return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float linear_depth(vec2 uv) {
	float raw_depth = texture(depth_texture, uv).r;
	vec3 ndc = vec3(uv * 2.0 - 1.0, raw_depth);
	vec4 view_position = INV_PROJECTION_MATRIX * vec4(ndc, 1.0);
	return -view_position.z / max(abs(view_position.w), 0.00001);
}

void fragment() {
	vec2 screen_size = vec2(textureSize(screen_texture, 0));
	vec2 texel = 1.0 / screen_size;
	vec3 center = texture(screen_texture, screen_uv).rgb;
	vec3 left_color = texture(screen_texture, screen_uv - vec2(texel.x, 0.0)).rgb;
	vec3 right_color = texture(screen_texture, screen_uv + vec2(texel.x, 0.0)).rgb;
	vec3 up_color = texture(screen_texture, screen_uv - vec2(0.0, texel.y)).rgb;
	vec3 down_color = texture(screen_texture, screen_uv + vec2(0.0, texel.y)).rgb;

	float color_edge = abs(luminance(left_color) - luminance(right_color))
		+ abs(luminance(up_color) - luminance(down_color));
	float depth_center = linear_depth(screen_uv);
	float depth_edge = abs(linear_depth(screen_uv + vec2(texel.x, 0.0)) - depth_center)
		+ abs(linear_depth(screen_uv + vec2(0.0, texel.y)) - depth_center);
	float outline = smoothstep(edge_threshold, edge_threshold * 2.0, color_edge)
		* edge_strength;
	float depth_outline = smoothstep(depth_threshold, depth_threshold * 2.0, depth_edge)
		* depth_edge_strength;

	float gray = luminance(center);
	vec3 graded = mix(vec3(gray), center, saturation);
	graded = (graded - 0.5) * contrast + 0.5;
	float shadow_weight = 1.0 - smoothstep(0.08, 0.62, gray);
	float highlight_weight = smoothstep(0.52, 0.92, gray);
	vec3 shadow_grade = mix(graded, shadow_tint + graded * 0.42, shadow_weight);
	vec3 color_grade = mix(shadow_grade, mid_tint * graded * 1.7, 1.0 - shadow_weight);
	color_grade = mix(color_grade, highlight_tint * graded * 1.2, highlight_weight * 0.22);
	color_grade += shadow_weight * shadow_lift;

	float danger = clamp(max(tension, corruption * 0.8), 0.0, 1.0);
	vec3 outline_color = mix(edge_color, danger_color, danger);
	vec2 impact_delta = (screen_uv - impact_uv)
		* vec2(screen_size.x / screen_size.y, 1.0);
	float impact_distance = length(impact_delta);
	float impact_ring = 1.0 - smoothstep(0.0, max(impact_radius * 0.25, 0.002),
		abs(impact_distance - impact_radius));
	float impact_glow = impact_ring * impact_strength;
	float contour = clamp(outline + depth_outline, 0.0, 1.0);

	ALBEDO = max(color_grade - outline_color * contour * (0.45 + danger * 0.35), vec3(0.0));
	EMISSION = outline_color * contour * (0.25 + danger * 0.85)
		+ danger_color * impact_glow * 0.8;
}
