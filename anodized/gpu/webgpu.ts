import type { RGBA } from "../types.ts";
import {
	type Backend,
	type Geometry,
	type Offscreen,
	type Surface,
	VERTEX_FLOATS,
} from "./backend.ts";
import { SHADER } from "./shaders.ts";

const SAMPLES = 4;
const STENCIL_FORMAT: GPUTextureFormat = "stencil8";

interface Pipelines {
	convex: GPURenderPipeline;
	nonzero: GPURenderPipeline;
	evenodd: GPURenderPipeline;
	union: GPURenderPipeline;
	cover: GPURenderPipeline;
}

/** `true` when this runtime exposes WebGPU at all. Does not guarantee an adapter exists. */
export function hasWebGPU(): boolean {
	return typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu;
}

/** Requests an adapter and device and wraps them in a {@linkcode Backend}. */
export async function createWebGPUBackend(device?: GPUDevice): Promise<WebGPUBackend> {
	if (device) return new WebGPUBackend(device, false);
	{
		if (!hasWebGPU()) throw new Error("anodized: WebGPU is not available in this runtime");
		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) throw new Error("anodized: no WebGPU adapter available");
		return new WebGPUBackend(await adapter.requestDevice());
	}
}

/** The WebGPU {@linkcode Backend}: stencil-then-cover fills and strokes, 4× MSAA. */
export class WebGPUBackend implements Backend {
	readonly device: GPUDevice;
	readonly maxTextureSize: number;
	#module: GPUShaderModule;
	#layout: GPUBindGroupLayout;
	#pipelineLayout: GPUPipelineLayout;
	#pipelines = new Map<GPUTextureFormat, Pipelines>();
	#uniforms: GPUBuffer;
	#bindGroup: GPUBindGroup;
	#vertexBuffer: GPUBuffer | null = null;
	#owned: boolean;

	constructor(device: GPUDevice, owned = true) {
		this.device = device;
		this.#owned = owned;
		this.maxTextureSize = device.limits.maxTextureDimension2D;
		this.#module = device.createShaderModule({ code: SHADER });
		this.#layout = device.createBindGroupLayout({
			entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
		});
		this.#pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.#layout] });
		this.#uniforms = device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.#bindGroup = device.createBindGroup({
			layout: this.#layout,
			entries: [{ binding: 0, resource: { buffer: this.#uniforms } }],
		});
	}

	#pipelinesFor(format: GPUTextureFormat): Pipelines {
		let p = this.#pipelines.get(format);
		if (p) return p;
		const make = (
			stencil: GPUStencilFaceState,
			back: GPUStencilFaceState,
			writeColor: boolean,
		) =>
			this.device.createRenderPipeline({
				layout: this.#pipelineLayout,
				vertex: {
					module: this.#module,
					entryPoint: "vs",
					buffers: [{
						arrayStride: VERTEX_FLOATS * 4,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: "float32x2" },
							{ shaderLocation: 1, offset: 8, format: "float32x4" },
						],
					}],
				},
				fragment: {
					module: this.#module,
					entryPoint: "fs",
					targets: [{
						format,
						writeMask: writeColor ? GPUColorWrite.ALL : 0,
						blend: {
							color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
							alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
						},
					}],
				},
				primitive: { topology: "triangle-list", cullMode: "none" },
				depthStencil: {
					format: STENCIL_FORMAT,
					stencilFront: stencil,
					stencilBack: back,
					stencilReadMask: 0xff,
					stencilWriteMask: 0xff,
				},
				multisample: { count: SAMPLES },
			});
		const always = (passOp: GPUStencilOperation): GPUStencilFaceState => ({
			compare: "always",
			passOp,
			failOp: "keep",
			depthFailOp: "keep",
		});
		const cover: GPUStencilFaceState = {
			compare: "not-equal",
			passOp: "zero",
			failOp: "keep",
			depthFailOp: "keep",
		};
		p = {
			convex: make(always("keep"), always("keep"), true),
			nonzero: make(always("increment-wrap"), always("decrement-wrap"), false),
			evenodd: make(always("invert"), always("invert"), false),
			union: make(always("replace"), always("replace"), false),
			cover: make(cover, cover, true),
		};
		this.#pipelines.set(format, p);
		return p;
	}

	#upload(geometry: Geometry): void {
		const bytes = geometry.vertexCount * VERTEX_FLOATS * 4;
		if (bytes === 0) return;
		if (!this.#vertexBuffer || this.#vertexBuffer.size < bytes) {
			this.#vertexBuffer?.destroy();
			let size = 1 << 16;
			while (size < bytes) size *= 2;
			this.#vertexBuffer = this.device.createBuffer({
				size,
				usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
			});
		}
		this.device.queue.writeBuffer(
			this.#vertexBuffer,
			0,
			geometry.vertices.buffer,
			geometry.vertices.byteOffset,
			bytes,
		);
	}

	/** Encodes one frame into `resolveView` (single-sample) via MSAA color + stencil textures. */
	encode(
		geometry: Geometry,
		format: GPUTextureFormat,
		width: number,
		height: number,
		msaa: GPUTextureView,
		stencil: GPUTextureView,
		resolveView: GPUTextureView,
		clear: RGBA,
	): GPUCommandBuffer {
		const pipes = this.#pipelinesFor(format);
		this.#upload(geometry);
		this.device.queue.writeBuffer(this.#uniforms, 0, new Float32Array([width, height, 0, 0]));
		const enc = this.device.createCommandEncoder();
		const [r, g, b, a] = clear;
		const pass = enc.beginRenderPass({
			colorAttachments: [{
				view: msaa,
				resolveTarget: resolveView,
				clearValue: { r: r * a, g: g * a, b: b * a, a },
				loadOp: "clear",
				storeOp: "discard",
			}],
			depthStencilAttachment: {
				view: stencil,
				stencilClearValue: 0,
				stencilLoadOp: "clear",
				stencilStoreOp: "discard",
			},
		});
		if (geometry.vertexCount > 0 && this.#vertexBuffer) {
			pass.setBindGroup(0, this.#bindGroup);
			pass.setVertexBuffer(0, this.#vertexBuffer);
			let current: GPURenderPipeline | null = null;
			const use = (p: GPURenderPipeline) => {
				if (p !== current) pass.setPipeline(current = p);
			};
			for (const item of geometry.items) {
				if (item.kind === "convex") {
					use(pipes.convex);
					pass.draw(item.count, 1, item.first);
					continue;
				}
				use(pipes[item.kind]);
				pass.setStencilReference(item.kind === "union" ? 1 : 0);
				pass.draw(item.count, 1, item.first);
				use(pipes.cover);
				pass.setStencilReference(0);
				pass.draw(item.coverCount, 1, item.coverFirst);
			}
		}
		pass.end();
		return enc.finish();
	}

	createSurface(canvas: HTMLCanvasElement | OffscreenCanvas): Surface {
		return new WebGPUSurface(this, canvas);
	}

	createOffscreen(width: number, height: number): Offscreen {
		return new WebGPUOffscreen(this, width, height);
	}

	async tryCreateOffscreen(width: number, height: number): Promise<Offscreen | null> {
		this.device.pushErrorScope("validation");
		this.device.pushErrorScope("out-of-memory");
		const target = new WebGPUOffscreen(this, width, height);
		const oom = await this.device.popErrorScope();
		const invalid = await this.device.popErrorScope();
		if (oom || invalid) {
			target.destroy();
			return null;
		}
		return target;
	}

	destroy(): void {
		this.#vertexBuffer?.destroy();
		this.#uniforms.destroy();
		if (this.#owned) this.device.destroy();
	}
}

class Attachments {
	#device: GPUDevice;
	#format: GPUTextureFormat;
	#w = 0;
	#h = 0;
	msaa!: GPUTexture;
	stencil!: GPUTexture;
	msaaView!: GPUTextureView;
	stencilView!: GPUTextureView;

	constructor(device: GPUDevice, format: GPUTextureFormat) {
		this.#device = device;
		this.#format = format;
	}

	ensure(w: number, h: number): void {
		if (w === this.#w && h === this.#h && this.msaa) return;
		this.destroy();
		this.#w = w;
		this.#h = h;
		this.msaa = this.#device.createTexture({
			size: [w, h],
			format: this.#format,
			sampleCount: SAMPLES,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this.stencil = this.#device.createTexture({
			size: [w, h],
			format: STENCIL_FORMAT,
			sampleCount: SAMPLES,
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this.msaaView = this.msaa.createView();
		this.stencilView = this.stencil.createView();
	}

	destroy(): void {
		this.msaa?.destroy();
		this.stencil?.destroy();
	}
}

class WebGPUSurface implements Surface {
	#backend: WebGPUBackend;
	#ctx: GPUCanvasContext;
	#format: GPUTextureFormat;
	#att: Attachments;

	constructor(backend: WebGPUBackend, canvas: HTMLCanvasElement | OffscreenCanvas) {
		this.#backend = backend;
		const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
		if (!ctx) throw new Error("anodized: could not get a webgpu canvas context");
		this.#ctx = ctx;
		this.#format = navigator.gpu.getPreferredCanvasFormat();
		ctx.configure({ device: backend.device, format: this.#format, alphaMode: "premultiplied" });
		this.#att = new Attachments(backend.device, this.#format);
	}

	render(geometry: Geometry, width: number, height: number, clear: RGBA): void {
		this.#att.ensure(width, height);
		const view = this.#ctx.getCurrentTexture().createView();
		const cmd = this.#backend.encode(
			geometry,
			this.#format,
			width,
			height,
			this.#att.msaaView,
			this.#att.stencilView,
			view,
			clear,
		);
		this.#backend.device.queue.submit([cmd]);
	}
}

class WebGPUOffscreen implements Offscreen {
	readonly width: number;
	readonly height: number;
	#backend: WebGPUBackend;
	#att: Attachments;
	#target: GPUTexture;
	#readBuffer: GPUBuffer;
	#bytesPerRow: number;

	constructor(backend: WebGPUBackend, width: number, height: number) {
		this.#backend = backend;
		this.width = width;
		this.height = height;
		const device = backend.device;
		this.#att = new Attachments(device, "rgba8unorm");
		this.#att.ensure(width, height);
		this.#target = device.createTexture({
			size: [width, height],
			format: "rgba8unorm",
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
		});
		this.#bytesPerRow = Math.ceil((width * 4) / 256) * 256;
		this.#readBuffer = device.createBuffer({
			size: this.#bytesPerRow * height,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		});
	}

	render(geometry: Geometry, clear: RGBA): void {
		const cmd = this.#backend.encode(
			geometry,
			"rgba8unorm",
			this.width,
			this.height,
			this.#att.msaaView,
			this.#att.stencilView,
			this.#target.createView(),
			clear,
		);
		this.#backend.device.queue.submit([cmd]);
	}

	async read(): Promise<Uint8Array> {
		const device = this.#backend.device;
		const enc = device.createCommandEncoder();
		enc.copyTextureToBuffer(
			{ texture: this.#target },
			{ buffer: this.#readBuffer, bytesPerRow: this.#bytesPerRow },
			[this.width, this.height],
		);
		device.queue.submit([enc.finish()]);
		await this.#readBuffer.mapAsync(GPUMapMode.READ);
		const src = new Uint8Array(this.#readBuffer.getMappedRange());
		const out = new Uint8Array(this.width * this.height * 4);
		const row = this.width * 4;
		for (let y = 0; y < this.height; y++) {
			out.set(src.subarray(y * this.#bytesPerRow, y * this.#bytesPerRow + row), y * row);
		}
		this.#readBuffer.unmap();
		unpremultiply(out);
		return out;
	}

	destroy(): void {
		this.#att.destroy();
		this.#target.destroy();
		this.#readBuffer.destroy();
	}
}

/** Converts premultiplied RGBA bytes to straight alpha in place. */
export function unpremultiply(px: Uint8Array): void {
	for (let i = 0; i < px.length; i += 4) {
		const a = px[i + 3];
		if (a === 0 || a === 255) continue;
		const k = 255 / a;
		px[i] = Math.min(255, Math.round(px[i] * k));
		px[i + 1] = Math.min(255, Math.round(px[i + 1] * k));
		px[i + 2] = Math.min(255, Math.round(px[i + 2] * k));
	}
}
