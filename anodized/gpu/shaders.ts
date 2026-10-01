/** The single shader every pipeline shares: device pixels in, premultiplied color out. */
export const SHADER = /* wgsl */ `
struct Uniforms { size: vec2f };
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VOut {
	@builtin(position) pos: vec4f,
	@location(0) color: vec4f,
};

@vertex
fn vs(@location(0) p: vec2f, @location(1) c: vec4f) -> VOut {
	var o: VOut;
	o.pos = vec4f(p.x / u.size.x * 2.0 - 1.0, 1.0 - p.y / u.size.y * 2.0, 0.0, 1.0);
	o.color = c;
	return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
	return i.color;
}
`;
