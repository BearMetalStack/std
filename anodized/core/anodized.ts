import {
	ANODE_CLICK,
	ANODE_LINE_CLICK,
	type AnodeClickDetail,
	type AnodeClickEvent,
	type AnodeLineClickDetail,
	type AnodeLineClickEvent,
	type Bounds,
	type ColorInput,
	type DrawFn,
	type HitResult,
	type ImageSource,
	type LineHitResult,
	type LineHitTarget,
	type LoopOptions,
	type RGBA,
	type Snapshot,
	type SnapshotOptions,
	type ViewportOptions,
} from "../types.ts";
import { Camera, type Transform } from "./camera.ts";
import { parseColor } from "./color.ts";
import { command, type DrawCommand, expandGrids, isImageFill, resolveStyle } from "./commands.ts";
import { commandBounds, Frame } from "./frame.ts";
import { tessellate } from "./tessellate.ts";
import type { Backend, Offscreen, Surface } from "../gpu/backend.ts";
import { createWebGPUBackend } from "../gpu/webgpu.ts";
import { Path } from "../geometry/path.ts";
import type { Font } from "../text/ttf.ts";
import { HandleManager, type HandleOverlay } from "../interact/handles.ts";
import { type InputState, PointerInput } from "../interact/input.ts";
import { ViewportController } from "../interact/viewport.ts";
import type { Route } from "../solvers/route.ts";
import { encodePng } from "../snapshot/png.ts";

/** Options shared by {@linkcode createAnodized} and {@linkcode createHeadless}. */
export interface AnodizedOptions {
	/** Default font for `text()` and labels. */
	font?: Font;
	/** Clear color. Default `"#ffffff"`. */
	background?: ColorInput;
	/** Color of control handles. Default `"#2563eb"`. */
	accent?: ColorInput;
	/** Bring your own device instead of requesting one. */
	device?: GPUDevice;
	/** Device pixels per CSS pixel. Defaults to `devicePixelRatio` in a browser, `1` otherwise. */
	pixelRatio?: number;
}

/** Options for {@linkcode createHeadless}. */
export interface HeadlessOptions extends AnodizedOptions {
	width: number;
	height: number;
}

const MAX_TILE = 4096;
const MIN_TILE = 64;
/** An image not drawn for this many frames gives its GPU memory back. */
const IMAGE_IDLE_FRAMES = 120;

/**
 * An anodized canvas: one camera, one frame buffer. Draw by passing a callback to
 * {@linkcode frame} (once) or {@linkcode loop} (every animation frame); export with
 * {@linkcode snapshot}.
 */
export class Anodized {
	readonly camera: Camera;
	readonly backend: Backend;
	/** Default font for `text()` and labels. */
	font: Font | undefined;
	background: RGBA;
	accent: ColorInput;
	readonly canvas: HTMLCanvasElement | OffscreenCanvas | null;
	#surface: Surface | null = null;
	#offscreen: Offscreen | null = null;
	#input: PointerInput | null = null;
	#detach: (() => void) | null = null;
	#resizeObserver: ResizeObserver | null = null;
	#handles = new HandleManager();
	#routes = new Map<string, Route>();
	#viewport: ViewportController | null = null;
	#dirty = true;
	#wake: (() => void) | null = null;
	#stopLoop: (() => void) | null = null;
	#frameCount = 0;
	#continuous = false;
	#frameRequested = false;
	#lastFrame: number | null = null;
	#imageUse = new Map<ImageSource, number>();

	/** Use {@linkcode createAnodized} or {@linkcode createHeadless}. */
	constructor(
		backend: Backend,
		camera: Camera,
		canvas: HTMLCanvasElement | OffscreenCanvas | null,
		opts: AnodizedOptions,
	) {
		this.backend = backend;
		this.camera = camera;
		this.canvas = canvas;
		this.font = opts.font;
		this.background = parseColor(opts.background ?? "#ffffff");
		this.accent = opts.accent ?? "#2563eb";
		if (canvas) {
			this.#surface = backend.createSurface(canvas);
			if (isElement(canvas)) this.#attachDom(canvas);
		} else {
			const t = camera.transform();
			this.#offscreen = backend.createOffscreen(t.width, t.height);
		}
	}

	#attachDom(canvas: HTMLCanvasElement): void {
		this.#input = new PointerInput();
		this.#input.onChange = () => this.invalidate();
		this.#input.onClick = ({ button, x, y }) => {
			const line = this.#handles.hitTestLine(x, y);
			if (line && line.z > this.#handles.shapeZ(x, y)) {
				const detail: AnodeLineClickDetail = { ...this.hitTestLine(x, y), button };
				canvas.dispatchEvent(new CustomEvent(ANODE_LINE_CLICK, { detail, bubbles: true }));
				return;
			}
			const detail: AnodeClickDetail = { ...this.hitTest(x, y), button };
			canvas.dispatchEvent(new CustomEvent(ANODE_CLICK, { detail, bubbles: true }));
		};
		this.#detach = this.#input.attach(canvas);
		canvas.style.touchAction = "none";
		if (typeof ResizeObserver !== "undefined") {
			this.#resizeObserver = new ResizeObserver(() => {
				const w = canvas.clientWidth, h = canvas.clientHeight;
				if (w && h && (w !== this.camera.width || h !== this.camera.height)) {
					this.camera.resize(w, h, globalThis.devicePixelRatio ?? 1);
					this.invalidate();
				}
			});
			this.#resizeObserver.observe(canvas);
		}
	}

	/** Turns on the wheel-zoom/drag-pan controller, or off with `false`. */
	viewport(opts: ViewportOptions | false = {}): this {
		this.#viewport = opts === false ? null : new ViewportController(opts);
		return this;
	}

	/** Asks a running {@linkcode loop} to redraw on the next animation frame. */
	invalidate(): void {
		this.#dirty = true;
		this.#wake?.();
	}

	/**
	 * When `true`, a running {@linkcode loop} redraws on every animation frame, for animations.
	 * When `false` (the default), it redraws only when something changed. Flip it whenever you
	 * like; for a short animation, calling `f.requestFrame()` from the draw callback is often
	 * simpler, since it stops by itself.
	 */
	get continuous(): boolean {
		return this.#continuous;
	}

	set continuous(on: boolean) {
		this.#continuous = on;
		if (on) this.invalidate();
	}

	/** Records `draw` against the current camera and paints it. */
	frame(draw: DrawFn): void {
		const now = performance.now();
		const dt = this.#lastFrame === null ? 0 : Math.min(100, now - this.#lastFrame);
		this.#lastFrame = now;
		this.#frameRequested = false;
		const input = this.#input?.consume() ?? null;
		if (input && this.#viewport) {
			this.#viewport.update(input, this.camera, this.#handles.hot !== null);
		}
		const recorded = this.#record(draw, this.camera, input, this.#routes, true, now, dt);
		this.#frameCount++;
		this.#trackImages(recorded.cmds);
		for (const [src, last] of this.#imageUse) {
			if (this.#frameCount - last > IMAGE_IDLE_FRAMES) {
				this.backend.releaseImage(src);
				this.#imageUse.delete(src);
			}
		}
		const { overlays, cursor } = recorded;
		const cmds = expandGrids(recorded.cmds, this.camera.visibleBounds(), this.camera.scale);
		if (this.canvas && isElement(this.canvas)) this.canvas.style.cursor = cursor;
		const all = overlays.length ? [...cmds, ...this.#overlayCommands(overlays)] : cmds;
		const t = this.camera.transform();
		const geometry = tessellate(all, t);
		if (this.#surface && this.canvas) {
			if (this.canvas.width !== t.width) this.canvas.width = t.width;
			if (this.canvas.height !== t.height) this.canvas.height = t.height;
			this.#surface.render(geometry, t.width, t.height, this.background);
		} else if (this.#offscreen) {
			if (this.#offscreen.width !== t.width || this.#offscreen.height !== t.height) {
				this.#offscreen.destroy();
				this.#offscreen = this.backend.createOffscreen(t.width, t.height);
			}
			this.#offscreen.render(geometry, this.background);
		}
		this.#dirty = this.#handles.active !== null || !!this.#viewport?.panning ||
			this.#frameRequested || this.#continuous;
	}

	/**
	 * Redraws with `draw` whenever something changed: input, camera, size, or
	 * {@linkcode invalidate}. For animation, pass `{ continuous: true }`, set
	 * {@linkcode continuous}, or call `f.requestFrame()` while it runs. Returns a function that
	 * stops the loop.
	 */
	loop(draw: DrawFn, opts: LoopOptions = {}): () => void {
		if (opts.continuous !== undefined) this.#continuous = opts.continuous;
		this.#stopLoop?.();
		let stopped = false;
		let scheduled = false;
		let camVersion = -1;
		let extra = 0;
		const raf: (cb: () => void) => unknown = globalThis.requestAnimationFrame ??
			((cb: () => void) => setTimeout(cb, 16));
		const tick = () => {
			scheduled = false;
			if (stopped) return;
			const pending = this.#input?.pending ?? false;
			if (this.#dirty || pending || camVersion !== this.camera.version || extra > 0) {
				extra = pending ? 1 : Math.max(0, extra - 1);
				this.frame(draw);
				camVersion = this.camera.version;
			}
			if (this.#dirty || extra > 0 || camVersion !== this.camera.version) schedule();
		};
		const schedule = () => {
			if (scheduled || stopped) return;
			scheduled = true;
			raf(tick);
		};
		this.#wake = schedule;
		this.#dirty = true;
		schedule();
		const stop = () => {
			stopped = true;
			if (this.#wake === schedule) this.#wake = null;
		};
		this.#stopLoop = stop;
		return stop;
	}

	/**
	 * Renders everything `draw` produces to an image, independent of the camera. Large outputs
	 * are rendered in tiles and stitched, so the size is bounded by memory, not texture limits.
	 * Works the same headless in Deno and in a browser.
	 */
	async snapshot(draw: DrawFn, opts: SnapshotOptions = {}): Promise<Snapshot> {
		const scale = opts.scale ?? 1;
		const padding = opts.padding ?? 16;
		const cam = new Camera(1, 1, scale);
		cam.x = cam.y = 0;
		const recorded = this.#record(draw, cam, null, new Map(), false).cmds;
		this.#trackImages(recorded);
		const bounds: Bounds | null = opts.bounds ?? commandBounds(recorded, 1);
		if (!bounds) throw new Error("anodized: snapshot() found nothing to draw");
		const pad = padding / scale;
		const cmds = expandGrids(recorded, {
			minX: bounds.minX - pad,
			minY: bounds.minY - pad,
			maxX: bounds.maxX + pad,
			maxY: bounds.maxY + pad,
		}, cam.scale);
		const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) * scale + padding * 2));
		const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) * scale + padding * 2));
		let tile = Math.max(MIN_TILE, Math.min(opts.tileSize ?? MAX_TILE, this.backend.maxTextureSize));
		let target: Offscreen | null = null;
		let tw = 0, th = 0;
		while (!target) {
			tw = Math.min(width, tile);
			th = Math.min(height, tile);
			target = await this.backend.tryCreateOffscreen(tw, th);
			if (!target && tile <= MIN_TILE) {
				throw new Error(`anodized: could not allocate a ${tw}x${th} render target`);
			}
			tile = Math.max(MIN_TILE, tile >> 1);
		}
		const pixels = new Uint8Array(width * height * 4);
		const background = parseColor(opts.background ?? "transparent");
		try {
			for (let ty = 0; ty < height; ty += th) {
				for (let tx = 0; tx < width; tx += tw) {
					const t: Transform = {
						cx: bounds.minX - padding / scale,
						cy: bounds.minY - padding / scale,
						s: scale,
						ox: -tx,
						oy: -ty,
						width: tw,
						height: th,
						pr: scale,
					};
					target.render(tessellate(cmds, t), background);
					const px = await target.read();
					const cw = Math.min(tw, width - tx);
					for (let y = 0; y < Math.min(th, height - ty); y++) {
						pixels.set(
							px.subarray(y * tw * 4, (y * tw + cw) * 4),
							((ty + y) * width + tx) * 4,
						);
					}
				}
			}
		} finally {
			target.destroy();
		}
		return { width, height, pixels, png: () => encodePng(width, height, pixels) };
	}

	/**
	 * Listens for `anode:click` on the canvas: a press and release of any button that did not
	 * turn into a drag, pan or resize. Returns a function that stops listening.
	 */
	onClick(listener: (detail: AnodeClickDetail, event: AnodeClickEvent) => void): () => void {
		const canvas = this.canvas;
		if (!canvas || !isElement(canvas)) return () => {};
		const handler = (e: Event) => listener((e as AnodeClickEvent).detail, e as AnodeClickEvent);
		canvas.addEventListener(ANODE_CLICK, handler);
		return () => canvas.removeEventListener(ANODE_CLICK, handler);
	}

	/**
	 * Listens for `anode:lineclick` on the canvas: a click whose topmost target is a clickable
	 * line (a connection, or a `line`/`polyline`/`series`/`path` drawn with an `id`). Fires instead
	 * of `anode:click`, never alongside it. Returns a function that stops listening.
	 */
	onLineClick(
		listener: (detail: AnodeLineClickDetail, event: AnodeLineClickEvent) => void,
	): () => void {
		const canvas = this.canvas;
		if (!canvas || !isElement(canvas)) return () => {};
		const handler = (e: Event) =>
			listener((e as AnodeLineClickEvent).detail, e as AnodeLineClickEvent);
		canvas.addEventListener(ANODE_LINE_CLICK, handler);
		return () => canvas.removeEventListener(ANODE_LINE_CLICK, handler);
	}

	/**
	 * The clickable line nearest a screen point (CSS pixels), as drawn in the most recent
	 * {@linkcode frame}: within half its stroke width plus 4px. Reports where on the line the
	 * point lands. Ignores shapes; works headless too.
	 */
	hitTestLine(screenX: number, screenY: number): LineHitResult {
		const h = this.#handles.hitTestLine(screenX, screenY);
		const [x, y] = this.camera.screenToWorld(screenX, screenY);
		if (!h) return { hit: false, x, y, screenX, screenY };
		const { region } = h;
		const b = region.path.bounds();
		const target: LineHitTarget = {
			...region.target,
			screen: this.camera.rectToScreen({
				x: b.minX,
				y: b.minY,
				w: b.maxX - b.minX,
				h: b.maxY - b.minY,
			}),
		};
		if (region.label) target.labelScreen = this.camera.rectToScreen(region.label);
		return {
			hit: true,
			target,
			point: { x: h.point[0], y: h.point[1] },
			segment: h.segment,
			along: h.along,
			fraction: h.fraction,
			x,
			y,
			screenX,
			screenY,
		};
	}

	/**
	 * What is under a screen point (CSS pixels relative to the canvas), as drawn in the most
	 * recent {@linkcode frame}. Only objects drawn with an `id` can be hit; the topmost wins.
	 * Works headless too, against whatever the last `frame()` drew.
	 */
	hitTest(screenX: number, screenY: number): HitResult {
		const target = this.#handles.hitTest(screenX, screenY);
		const [x, y] = this.camera.screenToWorld(screenX, screenY);
		return target
			? { hit: true, target, x, y, screenX, screenY }
			: { hit: false, x, y, screenX, screenY };
	}

	/** Reads back the last {@linkcode frame} of a headless instance. */
	async read(): Promise<Snapshot> {
		if (!this.#offscreen) throw new Error("anodized: read() is only available headless");
		const { width, height } = this.#offscreen;
		const pixels = await this.#offscreen.read();
		return { width, height, pixels, png: () => encodePng(width, height, pixels) };
	}

	/**
	 * Tells the instance an image's pixels changed, so it is uploaded again the next time it is
	 * drawn, and redraws. Call it for every new video frame, or after painting into a canvas that
	 * is used as an image. Uploads are otherwise kept until an image goes unused for a while.
	 */
	invalidateImage(source: ImageSource): void {
		this.backend.releaseImage(source);
		this.invalidate();
	}

	#trackImages(cmds: readonly DrawCommand[]): void {
		for (const c of cmds) {
			if (isImageFill(c.style.fill)) this.#imageUse.set(c.style.fill.image, this.#frameCount);
		}
	}

	/** Releases GPU resources and DOM listeners. */
	destroy(): void {
		this.#stopLoop?.();
		this.#detach?.();
		this.#resizeObserver?.disconnect();
		this.#offscreen?.destroy();
		this.backend.destroy();
	}

	#record(
		draw: DrawFn,
		camera: Camera,
		input: InputState | null,
		routeCache: Map<string, Route>,
		live: boolean,
		time?: number,
		dt?: number,
	): { cmds: DrawCommand[]; overlays: HandleOverlay[]; cursor: string } {
		const handles = live ? this.#handles : null;
		handles?.begin(input, camera);
		const pointer = input?.inside
			? (([x, y]) => ({ x, y }))(camera.screenToWorld(input.x, input.y))
			: null;
		const frame = new Frame({
			camera,
			font: this.font,
			handles,
			routeCache,
			background: this.background[3] > 0 ? this.background : "#ffffff",
			time,
			dt,
			requestFrame: live ? () => this.#frameRequested = true : undefined,
		}, pointer);
		draw(frame);
		const cmds = frame.finish();
		const { overlays, cursor } = handles?.end() ?? { overlays: [], cursor: "default" };
		return { cmds, overlays, cursor };
	}

	#overlayCommands(overlays: HandleOverlay[]): DrawCommand[] {
		const s = this.camera.scale;
		const half = this.#handles.handleSize / 2 / s;
		const outline = resolveStyle({ stroke: this.accent, strokeWidth: 1 });
		const knob = resolveStyle({ fill: "#ffffff", stroke: this.accent, strokeWidth: 1.5 });
		const out: DrawCommand[] = [];
		for (const o of overlays) {
			out.push(command(new Path().rect(o.rect.x, o.rect.y, o.rect.w, o.rect.h), outline));
			const knobs = new Path();
			for (const [x, y] of o.points) knobs.rect(x - half, y - half, half * 2, half * 2);
			out.push(command(knobs, knob));
		}
		return out;
	}
}

function isElement(c: unknown): c is HTMLCanvasElement {
	return typeof HTMLCanvasElement !== "undefined" && c instanceof HTMLCanvasElement;
}

/** Creates an instance drawing into a canvas. Throws when WebGPU is unavailable. */
export async function createAnodized(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	opts: AnodizedOptions = {},
): Promise<Anodized> {
	const backend = await createWebGPUBackend(opts.device);
	const pr = opts.pixelRatio ?? globalThis.devicePixelRatio ?? 1;
	const el = isElement(canvas);
	const w = el ? canvas.clientWidth || canvas.width : canvas.width / pr;
	const h = el ? canvas.clientHeight || canvas.height : canvas.height / pr;
	return new Anodized(backend, new Camera(w, h, pr), canvas, opts);
}

/**
 * Creates an instance with no canvas, for servers and workers. Deno exposes WebGPU without
 * flags, so this works from a plain `deno run`. Render with `frame()` then `read()`, or use
 * `snapshot()`.
 */
export async function createHeadless(opts: HeadlessOptions): Promise<Anodized> {
	const backend = await createWebGPUBackend(opts.device);
	return new Anodized(
		backend,
		new Camera(opts.width, opts.height, opts.pixelRatio ?? 1),
		null,
		opts,
	);
}
