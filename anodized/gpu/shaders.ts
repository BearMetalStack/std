/**
 * The shader every pipeline shares: device pixels in, premultiplied color out. `fs_image`
 * multiplies the color by a premultiplied texel instead.
 */
export const SHADER = /* wgsl */ `
struct Uniforms { size: vec2f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var tex: texture_2d<f32>;
@group(1) @binding(1) var smp: sampler;

struct VOut {
	@builtin(position) pos: vec4f,
	@location(0) color: vec4f,
	@location(1) uv: vec2f,
};

@vertex
fn vs(@location(0) p: vec2f, @location(1) c: vec4f, @location(2) uv: vec2f) -> VOut {
	var o: VOut;
	o.pos = vec4f(p.x / u.size.x * 2.0 - 1.0, 1.0 - p.y / u.size.y * 2.0, 0.0, 1.0);
	o.color = c;
	o.uv = uv;
	return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
	return i.color;
}

@fragment
fn fs_image(i: VOut) -> @location(0) vec4f {
	return textureSample(tex, smp, i.uv) * i.color;
}
`;

/** Draws mip level `n` from level `n - 1` with a single oversized triangle. */
export const MIP_SHADER = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

struct VOut {
	@builtin(position) pos: vec4f,
	@location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VOut {
	let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
	var o: VOut;
	o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
	o.uv = vec2f(p.x, 1.0 - p.y);
	return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
	return textureSample(src, smp, i.uv);
}
`;

/** {@linkcode SHADER}'s vertex stage in GLSL ES 3.00, for the WebGL2 backend. */
export const GLSL_VERTEX = /* glsl */ `#version 300 es
uniform vec2 u_size;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec4 a_color;
layout(location = 2) in vec2 a_uv;
out vec4 v_color;
out vec2 v_uv;

void main() {
	gl_Position = vec4(a_pos.x / u_size.x * 2.0 - 1.0, 1.0 - a_pos.y / u_size.y * 2.0, 0.0, 1.0);
	v_color = a_color;
	v_uv = a_uv;
}
`;

/** The flat-color fragment stage in GLSL ES 3.00. */
export const GLSL_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec4 v_color;
in vec2 v_uv;
out vec4 o_color;

void main() {
	o_color = v_color;
}
`;

/** The image fragment stage in GLSL ES 3.00: a premultiplied texel times the color. */
export const GLSL_FRAGMENT_IMAGE = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec4 v_color;
in vec2 v_uv;
out vec4 o_color;

void main() {
	o_color = texture(u_tex, v_uv) * v_color;
}
`;
