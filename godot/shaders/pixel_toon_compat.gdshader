shader_type spatial; // Usa el pipeline espacial 3D de Godot.
render_mode specular_disabled; // Evita el coste y brillo especular no deseado en pixel art.

uniform sampler2D albedo_texture : source_color, filter_nearest, repeat_enable; // Albedo con muestreo por vecino mas cercano.
uniform vec4 base_color : source_color = vec4(1.0); // Tinte multiplicativo opcional del material.
uniform vec3 shadow_tint : source_color = vec3(0.20, 0.16, 0.28); // Tinte violeta frio de sombra profunda.
uniform vec3 mid_tint : source_color = vec3(0.66, 0.62, 0.68); // Tinte desaturado de sombra media.
uniform vec3 light_tint : source_color = vec3(1.0, 0.94, 0.82); // Tinte calido de luz plena.
uniform float mid_threshold : hint_range(0.0, 1.0, 0.01) = 0.32; // Umbral N.L para entrar en banda media.
uniform float lit_threshold : hint_range(0.0, 1.0, 0.01) = 0.72; // Umbral N.L para entrar en banda iluminada.
uniform float shadow_level : hint_range(0.0, 1.0, 0.01) = 0.30; // Intensidad discreta de la banda profunda.
uniform float mid_level : hint_range(0.0, 1.0, 0.01) = 0.68; // Intensidad discreta de la banda media.
uniform float ambient_fill : hint_range(0.0, 0.25, 0.005) = 0.035; // Relleno minimo para que las sombras no se empasten.
uniform float crisis_tension : hint_range(0.0, 1.0, 0.01) = 0.0; // Tension global enviada por Sentra Core.
uniform vec3 crisis_tint : source_color = vec3(0.56, 0.055, 0.075); // Color de acento en estados criticos.
uniform float alpha_cutoff : hint_range(0.0, 1.0, 0.01) = 0.5; // Recorte opaco para texeles transparentes del atlas.

varying vec2 pixel_uv; // Conserva UV interpoladas para el muestreo del albedo.

void vertex() { // Etapa de vertices.
	pixel_uv = UV; // Reenvia UV sin transformaciones que suavicen la rejilla de texeles.
} // Fin de la etapa de vertices.

void fragment() { // Etapa de fragmentos.
	vec4 texel = texture(albedo_texture, pixel_uv); // Una lectura de albedo con filtro nearest.
	vec4 tinted_texel = texel * base_color * COLOR; // Combina textura, tinte de material y color de vertice.
	ALBEDO = tinted_texel.rgb; // Entrega el color base a la iluminacion toon.
	ALPHA = tinted_texel.a; // Permite recorte de texeles transparentes sin blending alfa.
	ALPHA_SCISSOR_THRESHOLD = alpha_cutoff; // Mantiene el material en el camino opaco con alpha test.
	EMISSION = ALBEDO * shadow_tint * ambient_fill; // Sostiene una sombra tenue incluso sin luz directa.
} // Fin de la etapa de fragmentos.

void light() { // Evaluacion de luz por luz, incluyendo su atenuacion y sombra.
	float diffuse = max(dot(NORMAL, LIGHT), 0.0); // Producto N.L recortado; Godot normaliza los vectores del shader.
	float mid_band = step(mid_threshold, diffuse); // Cruza el umbral configurado por el orquestador.
	float lit_band = step(lit_threshold, diffuse); // Cruza el umbral configurado para luz plena.
	vec3 stressed_mid_tint = mix(mid_tint, crisis_tint, crisis_tension * 0.28); // Tiñe levemente las sombras bajo crisis.
	vec3 band_tint = mix(shadow_tint, stressed_mid_tint, mid_band); // Elige el tinte entre las bandas de sombra.
	band_tint = mix(band_tint, light_tint, lit_band); // Sustituye el tinte por el de luz en la banda superior.
	float band_level = mix(shadow_level, mid_level, mid_band); // Selecciona la intensidad de sombra profunda o media.
	band_level = mix(band_level, 1.0, lit_band); // La banda superior usa la intensidad completa.
	DIFFUSE_LIGHT += ALBEDO * band_tint * band_level * LIGHT_COLOR * ATTENUATION; // Acumula luz cuantizada con sombras nativas.
} // Fin de la evaluacion toon por luz.
