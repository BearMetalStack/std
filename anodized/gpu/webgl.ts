import type { ImageSmoothing, ImageSource, RGBA } from "../types.ts";
import {
	type Backend,
	type DrawItem,
	type Geometry,
	type Offscreen,
	type Surface,
	VERTEX_FLOATS,
} from "./backend.ts";
import { GLSL_FRAGMENT, GLSL_FRAGMENT_IMAGE, GLSL_VERTEX } from "./shaders.ts";
import { imageSize, isRawImage } from "../image/source.ts";
import { warnOnce } from "../core/warn.ts";
import { premultiply, unpremultiply } from "./pixels.ts";

const SAMPLES = 4;

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
	alpha: true,
	premultipliedAlpha: true,
	antialias: false,
	depth: false,
	stencil: false,
	preserveDrawingBuffer: false,
};

type GL = WebGL2RenderingContext;

/** Everything that lives on the context, rebuilt from scratch after a context loss. */
interface Resources {
	color: Program;
	image: Program;
	vao: WebGLVertexArrayObject;
	vertexBuffer: WebGLBuffer;
	vertexCapacity: number;
	samplers: Record<ImageSmoothing, WebGLSampler>;
	textures: Map<ImageSource, WebGLTexture | null>;
}

interface Program {
	program: WebGLProgram;
	size: WebGLUniformLocation | null;
}

/** `true` when this runtime exposes WebGL2 at all. Does not guarantee a context can be created. */
export function hasWebGL2(): boolean {
	return typeof WebGL2RenderingContext !== "undefined";
}

/**
 * Creates a {@linkcode WebGL2Backend}. A WebGL context belongs to one canvas, so pass the canvas
 * the backend will present to; without one it draws into an `OffscreenCanvas` of its own, which
 * is enough for headless rendering in a browser or worker.
 */
export function createWebGL2Backend(
	canvas?: HTMLCanvasElement | OffscreenCanvas,
): WebGL2Backend {
	if (!hasWebGL2()) throw new Error("anodized: WebGL2 is not available in this runtime");
	if (!canvas && typeof OffscreenCanvas === "undefined") {
		throw new Error("anodized: headless WebGL2 needs OffscreenCanvas, which this runtime lacks");
	}
	const target = canvas ?? new OffscreenCanvas(1, 1);
	const gl = target.getContext("webgl2", CONTEXT_ATTRIBUTES) as GL | null;
	if (!gl) throw new Error("anodized: could not get a webgl2 canvas context");
	return new WebGL2Backend(gl, target, !!canvas);
}

/**
 * The WebGL2 {@linkcode Backend}, a fallback for browsers without WebGPU. Paints the same
 * stencil-then-cover geometry into 4× multisampled renderbuffers and resolves them with a blit,
 * so its output matches the WebGPU backend's.
 */
export class WebGL2Backend implements Backend {
	readonly name = "webgl2";
	readonly gl: GL;
	readonly canvas: HTMLCanvasElement | OffscreenCanvas;
	readonly maxTextureSize: number;
	/** Bumped whenever the context is restored, so render targets know to reallocate. */
	generation = 0;
	readonly samples: number;
	#presents: boolean;
	#res: Resources | null;
	#onLost = (e: Event) => {
		e.preventDefault();
		this.#res = null;
	};
	#onRestored = () => {
		this.generation++;
		this.#res = this.#init();
	};

	constructor(gl: GL, canvas: HTMLCanvasElement | OffscreenCanvas, presents = true) {
		this.gl = gl;
		this.canvas = canvas;
		this.#presents = presents;
		this.maxTextureSize = Math.min(
			gl.getParameter(gl.MAX_TEXTURE_SIZE),
			gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
		);
		this.samples = Math.min(SAMPLES, gl.getParameter(gl.MAX_SAMPLES));
		canvas.addEventListener("webglcontextlost", this.#onLost);
		canvas.addEventListener("webglcontextrestored", this.#onRestored);
		this.#res = this.#init();
	}

	#init(): Resources {
		const gl = this.gl;
		const vao = gl.createVertexArray();
		const vertexBuffer = gl.createBuffer();
		gl.bindVertexArray(vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		const stride = VERTEX_FLOATS * 4;
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 8);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
		gl.bindVertexArray(null);
		const sampler = (min: number, mag: number) => {
			const s = gl.createSampler();
			gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, min);
			gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, mag);
			gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			return s;
		};
		const image = this.#program(GLSL_FRAGMENT_IMAGE);
		gl.useProgram(image.program);
		gl.uniform1i(gl.getUniformLocation(image.program, "u_tex"), 0);
		return {
			color: this.#program(GLSL_FRAGMENT),
			image,
			vao,
			vertexBuffer,
			vertexCapacity: 0,
			samplers: {
				linear: sampler(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR),
				nearest: sampler(gl.NEAREST, gl.NEAREST),
			},
			textures: new Map(),
		};
	}

	#program(fragment: string): Program {
		const gl = this.gl;
		const compile = (type: number, src: string) => {
			const s = gl.createShader(type)!;
			gl.shaderSource(s, src);
			gl.compileShader(s);
			if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
				throw new Error(`anodized: shader failed to compile: ${gl.getShaderInfoLog(s)}`);
			}
			return s;
		};
		const vs = compile(gl.VERTEX_SHADER, GLSL_VERTEX);
		const fs = compile(gl.FRAGMENT_SHADER, fragment);
		const program = gl.createProgram();
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
			throw new Error(`anodized: shader failed to link: ${gl.getProgramInfoLog(program)}`);
		}
		return { program, size: gl.getUniformLocation(program, "u_size") };
	}

	#uploadVertices(res: Resources, geometry: Geometry): void {
		const gl = this.gl;
		const floats = geometry.vertexCount * VERTEX_FLOATS;
		if (floats === 0) return;
		gl.bindBuffer(gl.ARRAY_BUFFER, res.vertexBuffer);
		if (res.vertexCapacity < floats * 4) {
			let size = 1 << 16;
			while (size < floats * 4) size *= 2;
			gl.bufferData(gl.ARRAY_BUFFER, size, gl.DYNAMIC_DRAW);
			res.vertexCapacity = size;
		}
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, geometry.vertices, 0, floats);
	}

	/** The texture for an image, uploading it on first use. `null` when it cannot be drawn. */
	#texture(res: Resources, source: ImageSource): WebGLTexture | null {
		let entry = res.textures.get(source);
		if (entry === undefined) {
			entry = this.#upload(source);
			const { width, height } = imageSize(source);
			// An image element still loading reports 0×0; try again once it has a size.
			if (entry || (width && height)) res.textures.set(source, entry);
		}
		return entry;
	}

	#upload(source: ImageSource): WebGLTexture | null {
		const gl = this.gl;
		const { width, height } = imageSize(source);
		if (!width || !height) return null;
		const max = this.maxTextureSize;
		if (width > max || height > max) {
			warnOnce(`a ${width}x${height} image is larger than this GPU's ${max}px texture limit`);
			return null;
		}
		drainErrors(gl);
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texStorage2D(
			gl.TEXTURE_2D,
			Math.floor(Math.log2(Math.max(width, height))) + 1,
			gl.RGBA8,
			width,
			height,
		);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		if (isRawImage(source)) {
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
			const data = premultiply(source.pixels.subarray(0, width * height * 4));
			gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
		} else {
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				width,
				height,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				source as TexImageSource,
			);
		}
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.bindTexture(gl.TEXTURE_2D, null);
		if (gl.getError() !== gl.NO_ERROR) {
			warnOnce(`a ${width}x${height} image could not be uploaded to the GPU`);
			gl.deleteTexture(texture);
			return null;
		}
		return texture;
	}

	releaseImage(source: ImageSource): void {
		const res = this.#res;
		if (!res) return;
		const tex = res.textures.get(source);
		if (tex) this.gl.deleteTexture(tex);
		res.textures.delete(source);
	}

	/**
	 * Paints one frame into the multisampled `framebuffer`, then resolves it into `resolve`;
	 * `null` resolves into the canvas.
	 */
	render(
		geometry: Geometry,
		framebuffer: WebGLFramebuffer | null,
		width: number,
		height: number,
		resolve: WebGLFramebuffer | null,
		clear: RGBA,
	): void {
		const gl = this.gl;
		const res = this.#res;
		if (!res || gl.isContextLost()) return;
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.viewport(0, 0, width, height);
		gl.disable(gl.SCISSOR_TEST);
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.colorMask(true, true, true, true);
		gl.stencilMask(0xff);
		const [r, g, b, a] = clear;
		gl.clearColor(r * a, g * a, b * a, a);
		gl.clearStencil(0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
		if (geometry.vertexCount > 0) {
			this.#uploadVertices(res, geometry);
			gl.bindVertexArray(res.vao);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			gl.enable(gl.STENCIL_TEST);
			gl.activeTexture(gl.TEXTURE0);
			let current: Program | null = null;
			const use = (p: Program) => {
				if (p === current) return;
				gl.useProgram(p.program);
				gl.uniform2f(p.size, width, height);
				current = p;
			};
			for (const item of geometry.items) {
				const texture = item.image ? this.#texture(res, item.image.source) : null;
				if (item.image && !texture) continue;
				if (texture) {
					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.bindSampler(0, res.samplers[item.image!.smoothing]);
				}
				const paint = texture ? res.image : res.color;
				if (item.kind === "convex") {
					use(paint);
					gl.colorMask(true, true, true, true);
					gl.stencilFunc(gl.ALWAYS, 0, 0xff);
					gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
					gl.drawArrays(gl.TRIANGLES, item.first, item.count);
					continue;
				}
				use(res.color);
				gl.colorMask(false, false, false, false);
				stencilPass(gl, item.kind);
				gl.drawArrays(gl.TRIANGLES, item.first, item.count);
				use(paint);
				gl.colorMask(true, true, true, true);
				gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
				gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
				gl.drawArrays(gl.TRIANGLES, item.coverFirst, item.coverCount);
			}
			gl.disable(gl.STENCIL_TEST);
			gl.disable(gl.BLEND);
			gl.bindVertexArray(null);
			gl.bindTexture(gl.TEXTURE_2D, null);
			gl.bindSampler(0, null);
		}
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolve);
		gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	createSurface(canvas: HTMLCanvasElement | OffscreenCanvas): Surface {
		if (canvas !== this.canvas || !this.#presents) {
			throw new Error(
				"anodized: a WebGL2 backend can only present to the canvas it was created with",
			);
		}
		return new WebGL2Surface(this);
	}

	createOffscreen(width: number, height: number): Offscreen {
		return new WebGL2Offscreen(this, width, height);
	}

	tryCreateOffscreen(width: number, height: number): Promise<Offscreen | null> {
		const gl = this.gl;
		if (width > this.maxTextureSize || height > this.maxTextureSize) return Promise.resolve(null);
		drainErrors(gl);
		const target = new WebGL2Offscreen(this, width, height);
		if (gl.getError() !== gl.NO_ERROR || !target.complete) {
			target.destroy();
			return Promise.resolve(null);
		}
		return Promise.resolve(target);
	}

	destroy(): void {
		const gl = this.gl;
		this.canvas.removeEventListener("webglcontextlost", this.#onLost);
		this.canvas.removeEventListener("webglcontextrestored", this.#onRestored);
		const res = this.#res;
		this.#res = null;
		if (!res || gl.isContextLost()) return;
		for (const tex of res.textures.values()) if (tex) gl.deleteTexture(tex);
		gl.deleteProgram(res.color.program);
		gl.deleteProgram(res.image.program);
		gl.deleteVertexArray(res.vao);
		gl.deleteBuffer(res.vertexBuffer);
		gl.deleteSampler(res.samplers.linear);
		gl.deleteSampler(res.samplers.nearest);
		if (!this.#presents) gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}

function stencilPass(gl: GL, kind: Exclude<DrawItem["kind"], "convex">): void {
	if (kind === "nonzero") {
		gl.stencilFunc(gl.ALWAYS, 0, 0xff);
		gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
		gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
	} else if (kind === "evenodd") {
		gl.stencilFunc(gl.ALWAYS, 0, 0xff);
		gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
	} else {
		gl.stencilFunc(gl.ALWAYS, 1, 0xff);
		gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
	}
}

function drainErrors(gl: GL): void {
	for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++);
}

/** A multisampled color + stencil framebuffer, reallocated when its size or context changes. */
class Attachments {
	#backend: WebGL2Backend;
	#generation = -1;
	width = 0;
	height = 0;
	framebuffer: WebGLFramebuffer | null = null;
	#color: WebGLRenderbuffer | null = null;
	#stencil: WebGLRenderbuffer | null = null;

	constructor(backend: WebGL2Backend) {
		this.#backend = backend;
	}

	ensure(w: number, h: number): void {
		const b = this.#backend;
		if (w === this.width && h === this.height && this.#generation === b.generation) return;
		this.destroy();
		const gl = b.gl;
		this.width = w;
		this.height = h;
		this.#generation = b.generation;
		const storage = (format: number) => {
			const rb = gl.createRenderbuffer();
			gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
			gl.renderbufferStorageMultisample(gl.RENDERBUFFER, b.samples, format, w, h);
			return rb;
		};
		this.#color = storage(gl.RGBA8);
		this.#stencil = storage(gl.DEPTH24_STENCIL8);
		gl.bindRenderbuffer(gl.RENDERBUFFER, null);
		this.framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.#color);
		gl.framebufferRenderbuffer(
			gl.FRAMEBUFFER,
			gl.DEPTH_STENCIL_ATTACHMENT,
			gl.RENDERBUFFER,
			this.#stencil,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	get complete(): boolean {
		const gl = this.#backend.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return status === gl.FRAMEBUFFER_COMPLETE;
	}

	destroy(): void {
		const gl = this.#backend.gl;
		gl.deleteFramebuffer(this.framebuffer);
		gl.deleteRenderbuffer(this.#color);
		gl.deleteRenderbuffer(this.#stencil);
		this.framebuffer = this.#color = this.#stencil = null;
	}
}

class WebGL2Surface implements Surface {
	#backend: WebGL2Backend;
	#att: Attachments;

	constructor(backend: WebGL2Backend) {
		this.#backend = backend;
		this.#att = new Attachments(backend);
	}

	render(geometry: Geometry, width: number, height: number, clear: RGBA): void {
		this.#att.ensure(width, height);
		this.#backend.render(geometry, this.#att.framebuffer, width, height, null, clear);
	}
}

class WebGL2Offscreen implements Offscreen {
	readonly width: number;
	readonly height: number;
	#backend: WebGL2Backend;
	#att: Attachments;
	#framebuffer: WebGLFramebuffer;
	#target: WebGLRenderbuffer;

	constructor(backend: WebGL2Backend, width: number, height: number) {
		this.#backend = backend;
		this.width = width;
		this.height = height;
		const gl = backend.gl;
		this.#att = new Attachments(backend);
		this.#att.ensure(width, height);
		this.#target = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.#target);
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);
		gl.bindRenderbuffer(gl.RENDERBUFFER, null);
		this.#framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.#target);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	/** `true` when both framebuffers are usable. */
	get complete(): boolean {
		const gl = this.#backend.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
		const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return status === gl.FRAMEBUFFER_COMPLETE && this.#att.complete;
	}

	render(geometry: Geometry, clear: RGBA): void {
		const { width, height } = this;
		this.#backend.render(geometry, this.#att.framebuffer, width, height, this.#framebuffer, clear);
	}

	read(): Promise<Uint8Array> {
		const gl = this.#backend.gl;
		const { width, height } = this;
		const raw = new Uint8Array(width * height * 4);
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.#framebuffer);
		gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
		// GL rows run bottom-up.
		const out = new Uint8Array(raw.length);
		const row = width * 4;
		for (let y = 0; y < height; y++) {
			out.set(raw.subarray((height - 1 - y) * row, (height - y) * row), y * row);
		}
		unpremultiply(out);
		return Promise.resolve(out);
	}

	destroy(): void {
		const gl = this.#backend.gl;
		this.#att.destroy();
		gl.deleteFramebuffer(this.#framebuffer);
		gl.deleteRenderbuffer(this.#target);
	}
}
