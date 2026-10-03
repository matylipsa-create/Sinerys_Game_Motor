shader_type spatial; // Shader espacial para una segunda pasada de contorno.
render_mode unshaded, cull_front, depth_draw_opaque, shadows_disabled; // Dibuja solo caras traseras expandidas sin luces ni sombras.

uniform vec4 outline_color : source_color = vec4(0.012, 0.008, 0.025, 1.0); // Tinta oscura configurable por material.
uniform float outline_width : hint_range(0.001, 0.12, 0.001) = 0.018; // Expansion en unidades locales del mesh.

void vertex() { // Etapa de vertices del casco invertido.
	VERTEX += NORMAL * outline_width; // Expande la silueta siguiendo la normal original.
} // Fin de la expansion de la geometria.

void fragment() { // Etapa de fragmentos del contorno.
	ALBEDO = outline_color.rgb; // Usa un color plano sin muestreo de textura.
} // Fin de la etapa de fragmentos.
