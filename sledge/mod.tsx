import { BMElement, type BMTemplate, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";

const styles = new CSSStyleSheet();
styles.replaceSync(css`
	:host,
	svg {
		overflow: visible;
	}
	svg {
		width: 100%;
		height: 100%;
	}
	.layer {
		--depth: 0;
		--base-transform: translate(0,0);
		transform:
			translate(
			calc(var(--offset-x,0) * var(--depth) * 1.5px),
			calc(var(--offset-y,0) * var(--depth) * 1.5px)
		)
			var(--base-transform);
	}
	#eyes {
		--blink: 1;
		transform:
			translate(
			calc(var(--glance-offset-x,0) * 1px),
			calc(var(--glance-offset-y,0) * 1px)
		)
			var(--base-transform);
	}
	#nose {
		scale: var(--sniff,1);
		transition: scale 100ms;
		transform-origin: bottom;
		transform-box: fill-box;
	}
	.eye {
		transition: transform .1s;
		transform-origin: center;
		transform-box: fill-box;
		transform: rotate(calc(var(--tilt,0) * 1.5deg)) scaleY(var(--blink,1));
	}
`);

/**
 * Central offset state for Sledge's "gaze", the target the mouse (or later,
 * an idle/random look generator) sets, and a smoothed current value that
 * everything visual (parallax layers, eye tilt) reads from every frame.
 */
class GazeOffset {
	#targetX = 0;
	#targetY = 0;
	#currentX = 0;
	#currentY = 0;
	#damping: number;
	#onUpdate: (x: number, y: number) => void;
	#raf?: number;

	#held?: [number, number];

	constructor(onUpdate: (x: number, y: number) => void, damping = 0.1) {
		this.#onUpdate = onUpdate;
		this.#damping = damping;
	}

	/** Anything driving the gaze — mouse, idle wander, whatever — calls this. */
	setTarget(x: number, y: number) {
		x = Math.max(-1, Math.min(1, x));
		y = Math.max(-1, Math.min(1, y));
		this.#targetX = x;
		this.#targetY = y;
	}

	start() {
		let last = performance.now();
		const tick = (t: number) => {
			const d = (t - last) / 1000;
			last = t;
			const decayRate = 1000;
			const factor = (1 - Math.exp(-decayRate * d)) * this.#damping;
			this.#currentX += (this.#targetX - this.#currentX) * factor;
			this.#currentY += (this.#targetY - this.#currentY) * factor;
			this.#onUpdate(this.#currentX, this.#currentY);
			this.#raf = requestAnimationFrame(tick);
		};
		this.#raf = requestAnimationFrame(tick);
	}

	stop() {
		if (this.#raf) cancelAnimationFrame(this.#raf);
	}

	hold() {
		this.#held = [this.#currentX, this.#currentY];
	}
	release() {
		if (!this.#held) return;
		[this.#currentX, this.#currentY] = this.#held;
		this.#held = undefined;
	}
}

interface Borrower {
	stopMouseTracking: () => void;
	startMouseTracking: () => void;
	blink: () => void;
	blinkX: (numTimes: number) => void;
	closeEyes: () => void;
	openEyes: () => void;
	setGazeTarget: (x: number, y: number) => void;
	setGazeEyesOnly: (eyesOnly: boolean) => void;
}

@define("bm-sledge")
export class Sledge extends BMElement<{ root: SVGSVGElement }> {
	static get stylesheet(): string {
		return css`
			bm-sledge {
				display: block;
				&[debug] {
					position: relative;
					transform: none;
					inset: unset;
					&::before,
					&::after {
						content: "";
						position: absolute;
					}
					&::before {
						bottom: 50%;
						left: 50%;
						width: 1rem;
						height: 1rem;
						border-left: 1px solid red;
						border-bottom: 1px solid red;
					}
					&::after {
						top: 50%;
						left: 50%;
						width: .5rem;
						height: .5rem;
						border-radius: 1rem;
						background: blue;
						transform:
							translate(-50%, -50%)
							translate(calc(var(--offset-x,0) * var(--width,10px)), calc(var(--offset-y,0) *
							var(--height,10px)));
					}
				}
			}
		`;
	}

	#eyes?: SVGGElement;
	#zMix: Map<SVGElement, [number, number, number, number]> = new Map();
	#gaze = new GazeOffset((x, y) => {
		const root = this.refs.root.get();
		if (!root) return;
		if (!this.#gazeEyesOnly) {
			root.style.setProperty("--offset-x", x.toFixed(4));
			root.style.setProperty("--offset-y", y.toFixed(4));
			this.#updateZMix(Number(x.toFixed(4)), Number(y.toFixed(4)));
		}
		root.style.setProperty("--glance-offset-x", x.toFixed(4));
		root.style.setProperty("--glance-offset-y", y.toFixed(4));

		if (this.hasAttribute("debug")) {
			this.style.setProperty("--offset-x", x.toFixed(4));
			this.style.setProperty("--offset-y", y.toFixed(4));
		}

		this.#updateEyeTilt(x, y);
	});
	#gazeEyesOnly = false;

	init(): () => void {
		this.useShadow("closed");
		this.root.adoptedStyleSheets = [styles];

		queueMicrotask(() => this.#bootstrap());
		this.#connectMouse();
		this.#gaze.start();
		queueMicrotask(() => {
			if (this.hasAttribute("debug")) {
				this.style.setProperty("--width", this.clientWidth / 2 + "px");
				this.style.setProperty("--height", this.clientHeight / 2 + "px");
			}
		});
		return () => {
			this.#gaze.stop();
			clearTimeout(this.#blinkTimeout);
		};
	}

	#bootstrap() {
		this.#eyes = this.root.querySelector("#eyes");
		this.#blinkSequence();
		for (const layer of this.root.querySelectorAll(".layer")) {
			let transform: string = layer.getAttribute("transform");
			if (transform) {
				transform = transform.replace(
					/translate\(([^)]+)\)/g,
					(_, args: string) => {
						const [x, y] = args.split(",").map((n) => n.trim());
						return `translate(${x}px, ${y}px)`;
					},
				);
				layer.style.setProperty("--base-transform", transform);
				layer.removeAttribute("transform");
			}
			layer.style.setProperty("--depth", layer.getAttribute("data-layer") ?? "0");
		}

		for (const zMixable of this.root.querySelectorAll("[data-z-mix]")) {
			const zMix = zMixable.getAttribute("data-z-mix");
			if (zMix) {
				const mix = JSON.parse(zMix);
				if (!mix || mix.length !== 2) continue;
				this.#zMix.set(zMixable, mix);
			}
		}
	}

	// TODO: make this mix vertical weight based on relative side so it can look up or down in both directions instead of only one direction at a time
	#updateEyeTilt(x: number, y: number) {
		const horizontalWeight = 6;
		const verticalWeight = 0;
		const tilt = (x * horizontalWeight) + (y * verticalWeight);
		this.#eyes?.style.setProperty("--tilt", tilt.toFixed(2));
	}

	#zMixSide = new Map<Element, "behind" | "front">();

	#updateZMix(x: number, y: number) {
		const face = this.root.getElementById("face") as SVGElement;
		const parent = face.parentNode;
		if (!parent) return;

		let needsReorder = false;
		const results: { layer: Element; depth: number; side: "behind" | "front" }[] = [];

		for (const [layer, [dx, dy]] of this.#zMix.entries()) {
			const depth = x * dx + y * dy;
			const side = depth > 0 ? "behind" : "front";
			results.push({ layer, depth, side });
			if (this.#zMixSide.get(layer) !== side) {
				needsReorder = true;
				this.#zMixSide.set(layer, side);
			}
		}

		if (!needsReorder) return;

		const behind = results.filter((r) => r.side === "behind").sort((a, b) => b.depth - a.depth);
		const front = results.filter((r) => r.side === "front").sort((a, b) => a.depth - b.depth);

		for (const { layer } of behind) parent.insertBefore(layer, face);
		for (const { layer } of front) parent.insertBefore(layer, face.nextSibling);
	}

	#mouseTracking = (e: MouseEvent) => {
		const root = this.refs.root.get();
		if (!root) return;
		const rect = root.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		const x = (e.clientX - centerX) / (rect.width / 2);
		const y = (e.clientY - centerY) / (rect.height / 2);

		this.#gaze.setTarget(x, y);
	};

	#connectMouse() {
		document.addEventListener("mousemove", this.#mouseTracking);
	}

	#disconnectMouse() {
		document.removeEventListener("mousemove", this.#mouseTracking);
	}

	/**
	 * Allows an external animation controller to borrow control from Sledge.
	 * Returns hooks to disable mouse tracking, set gazeTarget and control eye opening.
	 */
	borrow(): Borrower {
		return {
			stopMouseTracking: () => {
				this.#disconnectMouse();
			},
			startMouseTracking: () => {
				this.#connectMouse();
			},
			blink: () => {
				this.blink();
			},
			blinkX: (numTimes: number) => {
				this.blinkX(numTimes);
			},
			closeEyes: () => {
				this.closeEyes(true);
			},
			openEyes: () => {
				this.openEyes(true);
			},
			setGazeTarget: (x: number, y: number) => {
				this.#gaze.setTarget(x, y);
			},
			setGazeEyesOnly: (eyesOnly: boolean) => {
				this.#gazeEyesOnly = eyesOnly;
				if (!this.#gazeEyesOnly) {
					this.#gaze.release();
				} else this.#gaze.hold();
			},
		};
	}

	#eyesOpen = false;
	#holdEyesClosed = false;
	closeEyes(hold = false) {
		if (this.#holdEyesClosed) return;
		this.#holdEyesClosed = hold;
		this.#eyes?.style.setProperty("--blink", "0.1");
		this.#eyesOpen = false;
	}

	openEyes(force = false) {
		if (this.#holdEyesClosed && !force) return;
		this.#holdEyesClosed = false;
		this.#eyes?.style.setProperty("--blink", "1");
		this.#eyesOpen = true;
	}

	toggleEyes() {
		if (this.#eyesOpen) this.closeEyes(true);
		else this.openEyes(true);
	}

	blink() {
		this.closeEyes();
		setTimeout(() => {
			this.openEyes();
		}, 250);
	}

	blinkX(numTimes: number) {
		this.blink();
		numTimes--;
		const i = setInterval(() => {
			if (numTimes-- > 0) this.blink();
			else clearInterval(i);
		}, 400);
	}

	#blinkTimeout?: ReturnType<typeof setTimeout>;
	#blinkSequence() {
		this.blink();
		this.#blinkTimeout = setTimeout(() => this.#blinkSequence(), Math.random() * 10000 + 400);
	}

	sniff() {
		this.refs.root.get()?.style.setProperty("--sniff", "1.1");
		setTimeout(() => {
			this.refs.root.get()?.style.setProperty("--sniff", "1");
		}, 100);
	}

	#sniffing?: number;
	#sniffLevel = 1;
	beginSlowSniff() {
		let last = performance.now();
		const sniff = (t: number) => {
			const d = (t - last) / 1000;
			last = t;
			if (this.#sniffLevel >= 1.2) return;
			this.#sniffLevel += .5 * d;
			this.refs.root.get()?.style.setProperty("--sniff", `${this.#sniffLevel}`);
			this.#sniffing = requestAnimationFrame(sniff);
		};
		this.#sniffing = requestAnimationFrame(sniff);
	}
	endSlowSniff() {
		if (this.#sniffing) {
			cancelAnimationFrame(this.#sniffing);
			this.#sniffing = undefined;
			this.#sniffLevel = 1;
			this.refs.root.get()?.style.setProperty("--sniff", "1");
		}
	}

	protected get template(): BMTemplate {
		return (
			<slot>
				<svg
					width="48.468754mm"
					height="54.66412mm"
					viewBox="0 0 48.468754 54.664119"
					version="1.1"
					id="svg1"
					xmlns="http://www.w3.org/2000/svg"
					ref="root"
				>
					<defs id="defs1" />
					<g
						id="layer1"
						transform="translate(-37.133479,-13.749192)"
					>
						<path
							style="baseline-shift:baseline;display:inline;overflow:visible;vector-effect:none;fill:#3a2050;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0;enable-background:accumulate;stop-color:#000000"
							d="m 61.367854,15.089094 c -0.831275,0 -1.357139,0.241977 -2.154296,0.554687 -0.797158,0.312711 -1.738538,0.739918 -2.792969,1.25586 -2.108862,1.031884 -4.658216,2.413147 -7.169922,3.863281 -2.511706,1.450134 -4.981619,2.966958 -6.929688,4.277344 -0.974034,0.655193 -1.814981,1.257012 -2.484375,1.791015 -0.669393,0.534004 -1.142955,0.867985 -1.558593,1.587891 -0.415638,0.719906 -0.469893,1.297818 -0.597657,2.144531 -0.127763,0.846714 -0.226244,1.87574 -0.30664,3.046875 -0.160793,2.34227 -0.240235,5.240358 -0.240235,8.140625 10e-7,2.900268 0.07944,5.796403 0.240235,8.138672 0.0804,1.171135 0.178877,2.202115 0.30664,3.048828 0.127764,0.846714 0.182019,1.422673 0.597657,2.142578 0.415638,0.719906 0.8892,1.055841 1.558593,1.589844 0.669394,0.534003 1.510341,1.135823 2.484375,1.791016 1.948069,1.310385 4.417982,2.82721 6.929688,4.277343 2.511706,1.450134 5.06106,2.829445 7.169922,3.861329 1.054431,0.515942 1.995811,0.945102 2.792969,1.257812 0.797157,0.31271 1.323021,0.554688 2.154296,0.554688 0.831276,0 1.359093,-0.241978 2.15625,-0.554688 0.797158,-0.31271 1.738539,-0.74187 2.792969,-1.257812 2.108862,-1.031884 4.656263,-2.411195 7.167969,-3.861329 2.511706,-1.450133 4.981619,-2.966958 6.929687,-4.277343 0.974035,-0.655193 1.816933,-1.257013 2.486333,-1.791016 0.66939,-0.534003 1.141,-0.869938 1.55664,-1.589844 0.41563,-0.719905 0.46989,-1.295864 0.59765,-2.142578 0.12777,-0.846713 0.2282,-1.877693 0.3086,-3.048828 0.16079,-2.342269 0.23828,-5.238404 0.23828,-8.138672 0,-2.900267 -0.0775,-5.798355 -0.23828,-8.140625 -0.0804,-1.171135 -0.18083,-2.200161 -0.3086,-3.046875 -0.12776,-0.846713 -0.18202,-1.424625 -0.59765,-2.144531 -0.41564,-0.719906 -0.88725,-1.053887 -1.55664,-1.587891 -0.6694,-0.534003 -1.512298,-1.135823 -2.486333,-1.791015 -1.948068,-1.310386 -4.417981,-2.82721 -6.929687,-4.277344 -2.511706,-1.450134 -5.059107,-2.831397 -7.167969,-3.863281 -1.05443,-0.515942 -1.995811,-0.943149 -2.792969,-1.25586 -0.797157,-0.31271 -1.324974,-0.554687 -2.15625,-0.554687 z m 0,3 c -0.202218,0 0.385872,0.08299 1.060547,0.347656 0.674676,0.264663 1.562162,0.664906 2.570313,1.158203 2.016303,0.986594 4.522029,2.342862 6.986328,3.765625 2.464299,1.422764 4.893292,2.915097 6.755859,4.167969 0.931284,0.626436 1.72252,1.19453 2.289063,1.646484 0.566542,0.451955 0.931188,0.919267 0.830078,0.744141 -0.101109,-0.175126 0.12038,0.375179 0.22852,1.091797 0.10813,0.716617 0.20633,1.686907 0.2832,2.806641 0.15373,2.239466 0.23047,5.088066 0.23047,7.933593 0,2.845527 -0.0767,5.694128 -0.23047,7.933594 -0.0769,1.119733 -0.17507,2.090023 -0.2832,2.806641 -0.10814,0.716617 -0.329629,1.264969 -0.22852,1.089843 0.10111,-0.175126 -0.263536,0.292186 -0.830078,0.744141 -0.566543,0.451955 -1.357779,1.020048 -2.289063,1.646484 -1.862567,1.252873 -4.29156,2.745206 -6.755859,4.167969 -2.464299,1.422764 -4.970025,2.779031 -6.986328,3.765625 -1.008151,0.493297 -1.895637,0.895493 -2.570313,1.160156 -0.674675,0.264663 -1.262765,0.347657 -1.060547,0.347657 0.202219,0 -0.383918,-0.08299 -1.058593,-0.347657 -0.674676,-0.264663 -1.562161,-0.666859 -2.570313,-1.160156 -2.016302,-0.986594 -4.523982,-2.342861 -6.988281,-3.765625 -2.464299,-1.422763 -4.891339,-2.915096 -6.753906,-4.167969 -0.931284,-0.626436 -1.72252,-1.194529 -2.289063,-1.646484 -0.566542,-0.451955 -0.93314,-0.919267 -0.832031,-0.744141 0.101109,0.175126 -0.120383,-0.373226 -0.228516,-1.089843 -0.108133,-0.716618 -0.204382,-1.686908 -0.28125,-2.806641 -0.153735,-2.239466 -0.232421,-5.088067 -0.232422,-7.933594 0,-2.845527 0.07869,-5.694127 0.232422,-7.933593 0.07687,-1.119734 0.173117,-2.090024 0.28125,-2.806641 0.108133,-0.716618 0.329625,-1.266923 0.228516,-1.091797 -0.101109,0.175126 0.265489,-0.292186 0.832031,-0.744141 0.566543,-0.451954 1.357779,-1.020048 2.289063,-1.646484 1.862567,-1.252872 4.289607,-2.745205 6.753906,-4.167969 2.464299,-1.422763 4.971979,-2.779031 6.988281,-3.765625 1.008152,-0.493297 1.895637,-0.89354 2.570313,-1.158203 0.674675,-0.264663 1.260812,-0.347656 1.058593,-0.347656 z"
							id="frame"
						/>
						<path
							style="fill:#442868;fill-opacity:1;stroke:#3a2050;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0;stroke-opacity:1"
							id="right-ear-rear"
							class="layer"
							data-layer="-1"
							d="m 48.06029,16.436188 c -0.38607,0.668693 -5.914783,3.860697 -6.686923,3.860697 -0.772139,0 -6.300853,-3.192004 -6.686922,-3.860697 -0.38607,-0.668692 -0.38607,-7.0527004 0,-7.7213927 0.386069,-0.6686922 5.914783,-3.8606965 6.686922,-3.8606965 0.77214,0 6.300853,3.1920043 6.686923,3.8606966 0.38607,0.6686922 0.38607,7.0527006 0,7.7213926 z"
							transform="translate(5.1501593,10.395093)"
						/>
						<path
							style="fill:#442868;fill-opacity:1;stroke:#3a2050;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0;stroke-opacity:1"
							id="left-ear-rear"
							class="layer"
							data-layer="-1"
							d="m 48.06029,16.436188 c -0.38607,0.668693 -5.914783,3.860697 -6.686923,3.860697 -0.772139,0 -6.300853,-3.192004 -6.686922,-3.860697 -0.38607,-0.668692 -0.38607,-7.0527004 0,-7.7213927 0.386069,-0.6686922 5.914783,-3.8606965 6.686922,-3.8606965 0.77214,0 6.300853,3.1920043 6.686923,3.8606966 0.38607,0.6686922 0.38607,7.0527006 0,7.7213926 z"
							transform="translate(34.840772,10.395093)"
						/>
						<path
							id="face"
							style="baseline-shift:baseline;display:inline;overflow:visible;vector-effect:none;fill:#442868;stroke-width:1.01005;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0;enable-background:accumulate;stop-color:#000000"
							d="m 61.36783,17.984767 c -0.134259,0.03917 -0.58057,0.136058 -1.074002,0.327814 -0.684665,0.26607 -1.585364,0.668827 -2.608442,1.164748 -2.046155,0.991842 -4.590884,2.354842 -7.091669,3.785173 -2.500784,1.430332 -4.963964,2.930857 -6.854107,4.190394 -0.945073,0.629768 -1.748229,1.20081 -2.32316,1.655169 -0.414623,0.327669 -0.72378,0.663311 -0.82543,0.759009 -0.033,0.135182 -0.171598,0.567685 -0.250671,1.086821 -0.109734,0.720429 -0.207273,1.695786 -0.285281,2.821477 -0.156008,2.251378 -0.235987,5.115423 -0.235987,7.976086 1e-6,2.860664 0.07998,5.724189 0.235987,7.975567 0.07801,1.12569 0.175547,2.101047 0.285281,2.821477 0.07898,0.518511 0.217454,0.94958 0.250671,1.084743 0.101527,0.09555 0.410645,0.431211 0.82543,0.759008 0.574931,0.45436 1.378087,1.025401 2.32316,1.655169 1.890143,1.259538 4.353323,2.760063 6.854107,4.190394 2.500785,1.430332 5.045514,2.793851 7.091669,3.785693 1.023078,0.495921 1.923777,0.900237 2.608442,1.166307 0.49343,0.191757 0.939741,0.288646 1.074002,0.327813 0.134834,-0.03917 0.582668,-0.136057 1.076101,-0.327813 0.684665,-0.26607 1.585365,-0.670386 2.608442,-1.166307 2.046156,-0.991842 4.58931,-2.355361 7.090094,-3.785693 2.500785,-1.430331 4.965539,-2.930856 6.855682,-4.190394 0.945072,-0.629768 1.748229,-1.200809 2.32316,-1.655169 0.414115,-0.327268 0.721875,-0.662322 0.823332,-0.758489 0.03301,-0.134636 0.171597,-0.566155 0.25067,-1.085262 0.109731,-0.72043 0.209341,-1.695787 0.28738,-2.821477 0.156047,-2.251378 0.233889,-5.114903 0.233889,-7.975567 0,-2.860663 -0.07789,-5.724708 -0.233889,-7.976086 -0.07801,-1.125691 -0.177649,-2.101048 -0.28738,-2.821477 -0.07917,-0.519733 -0.218398,-0.952688 -0.251195,-1.087341 -0.101578,-0.09632 -0.408854,-0.431347 -0.822807,-0.758489 -0.574931,-0.454359 -1.378088,-1.025401 -2.32316,-1.655169 -1.890143,-1.259537 -4.354897,-2.760062 -6.855682,-4.190394 -2.500784,-1.430331 -5.043938,-2.793331 -7.090094,-3.785173 -1.023077,-0.495921 -1.923777,-0.898678 -2.608442,-1.164748 -0.49343,-0.191757 -0.941264,-0.288647 -1.076101,-0.327814 z"
						/>
						<path
							style="fill:#6e4890;fill-opacity:1;stroke:#442868;stroke-width:2.79059;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0;stroke-dasharray:none;stroke-opacity:1"
							id="right-ear-fore"
							class="layer"
							data-layer="-1"
							data-z-mix="[-0.5,-2]"
							d="m 111.8205,32.841647 c -0.66869,0.38607 -7.0527,0.386069 -7.72139,0 -0.66869,-0.38607 -3.86069,-5.914784 -3.86069,-6.686923 0,-0.77214 3.192,-6.300853 3.86069,-6.686923 0.66869,-0.386069 7.0527,-0.386069 7.7214,10e-7 0.66869,0.386069 3.86069,5.914783 3.86069,6.686922 0,0.77214 -3.192,6.300853 -3.8607,6.686923 z"
							transform="matrix(0,0.6450249,-0.6450249,0,63.393975,-46.666182)"
						/>
						<path
							style="fill:#6e4890;fill-opacity:1;stroke:#442868;stroke-width:2.79059;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0;stroke-dasharray:none;stroke-opacity:1"
							id="left-ear-fore"
							class="layer"
							data-layer="-1"
							data-z-mix="[0.5,-2]"
							d="m 111.8205,32.841647 c -0.66869,0.38607 -7.0527,0.386069 -7.72139,0 -0.66869,-0.38607 -3.86069,-5.914784 -3.86069,-6.686923 0,-0.77214 3.192,-6.300853 3.86069,-6.686923 0.66869,-0.386069 7.0527,-0.386069 7.7214,10e-7 0.66869,0.386069 3.86069,5.914783 3.86069,6.686922 0,0.77214 -3.192,6.300853 -3.8607,6.686923 z"
							transform="matrix(0,0.64502491,-0.64502491,0,93.084589,-46.66618)"
						/>
						<path
							style="fill:#6e4890;fill-opacity:1;stroke:none;stroke-width:2.58218;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0;stroke-opacity:1"
							id="snout"
							class="layer"
							data-layer="1"
							d="m 51.906649,51.308006 c 0,-0.946176 3.911466,-7.721033 4.730878,-8.194121 0.819412,-0.473088 8.642344,-0.473087 9.461756,10e-7 0.819412,0.473087 4.730877,7.247945 4.730877,8.194121 0,0.946175 -3.911466,7.721033 -4.730878,8.19412 -0.819412,0.473088 -8.642344,0.473088 -9.461756,0 -0.819412,-0.473088 -4.730877,-7.247946 -4.730877,-8.194121 z"
							transform="matrix(1.1618101,0,0,1.1618101,-9.9300245,-9.3105891)"
						/>
						<g class="layer" data-layer="2" transform="translate(-49.547985,11.927344)">
							<path
								style="fill:#3a2050;fill-opacity:1;stroke:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0;stroke-opacity:1"
								id="nose"
								d="m 110.91584,38.379149 c -0.91896,0 -5.05427,-7.162567 -4.59479,-7.958408 0.45948,-0.795841 8.7301,-0.795841 9.18958,-1e-6 0.45948,0.795841 -3.67583,7.958409 -4.59479,7.958409 z"
							/>
						</g>
						<g id="eyes" class="eyes layer" data-layer="1">
							<path
								id="eye-right"
								class="eye"
								style="display:inline;fill:#3a2050;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0"
								d="m 74.310369,38.292374 a 1.9492012,5.0930743 0 0 1 -1.949201,5.093074 1.9492012,5.0930743 0 0 1 -1.949201,-5.093074 1.9492012,5.0930743 0 0 1 1.949201,-5.093075 1.9492012,5.0930743 0 0 1 1.949201,5.093075 z"
							/>
							<path
								id="eye-left"
								class="eye"
								style="display:inline;fill:#3a2050;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:0"
								d="m 52.324846,38.292374 a 1.9492012,5.0930743 0 0 1 -1.949201,5.093074 1.9492012,5.0930743 0 0 1 -1.949202,-5.093074 1.9492012,5.0930743 0 0 1 1.949202,-5.093075 1.9492012,5.0930743 0 0 1 1.949201,5.093075 z"
							/>
						</g>
					</g>
				</svg>
			</slot>
		);
	}
}

bootstrapControls();

export function bootstrapControls() {
	document.addEventListener("DOMContentLoaded", () => {
		let selectedSledge: Sledge | undefined = undefined;
		let roundActive: boolean = false;

		function getSledges() {
			if (selectedSledge) return [selectedSledge];
			return Array.from(document.querySelectorAll("bm-sledge")) as unknown as Sledge[];
		}

		document.addEventListener("mouseup", (e) => {
			selectedSledge = e.target instanceof Sledge ? e.target : undefined;
		});

		document.addEventListener("keydown", (e) => {
			switch (e.key) {
				case "l":
					getSledges().forEach((sledge) => {
						sledge.closeEyes(true);
					});
					break;
				case "n":
					getSledges().forEach((sledge) => {
						sledge.beginSlowSniff();
					});
					break;
			}
		});

		document.addEventListener("keyup", (e) => {
			switch (e.key) {
				case "l":
					getSledges().forEach((sledge) => {
						sledge.openEyes(true);
					});
					break;
				case "b":
					getSledges().forEach((sledge) => {
						sledge.blink();
					});
					break;
				case "c":
					getSledges().forEach((sledge) => {
						sledge.blinkX(Math.ceil(Math.random() * 3));
					});
					break;
				case "g":
					getSledges().forEach((sledge) => {
						sledge.borrow().setGazeEyesOnly(true);
					});
					break;
				case "f":
					getSledges().forEach((sledge) => {
						sledge.borrow().setGazeEyesOnly(false);
					});
					break;
				case "r":
					roundActive = !roundActive;
					runRound();
					getSledges().forEach((sledge) => {
						roundActive
							? sledge.borrow().stopMouseTracking()
							: sledge.borrow().startMouseTracking();
					});
					break;
				case "s":
					getSledges().forEach((sledge) => {
						sledge.sniff();
					});
					break;
				case "n":
					getSledges().forEach((sledge) => {
						sledge.endSlowSniff();
					});
					break;
			}
			selectedSledge = undefined;
		});

		const poses = new Map<Sledge, [number, number]>();
		const dirs = new Map<Sledge, [number, number]>();
		const step = 0.05;
		function runRound() {
			if (!roundActive) return;
			getSledges().forEach((sledge) => {
				const c = sledge.borrow();
				let pos = poses.get(sledge);
				if (!pos) {
					pos = poses.set(sledge, [0, 0]).get(sledge)!;
				}
				let dir = dirs.get(sledge);
				if (!dir) {
					dir = dirs.set(sledge, [1, 0]).get(sledge)!;
				}
				pos[0] += dir[0] * step;
				pos[1] += dir[1] * step;
				if (dir[0] === 1 && pos[0] >= 1) {
					pos[0] = 1;
					dir[0] = 0;
					dir[1] = 1;
				}
				if (dir[1] === 1 && pos[1] >= 1) {
					pos[1] = 1;
					dir[0] = -1;
					dir[1] = 0;
				}
				if (dir[0] === -1 && pos[0] <= -1) {
					pos[0] = -1;
					dir[0] = 0;
					dir[1] = -1;
				}
				if (dir[1] === -1 && pos[1] <= -1) {
					pos[1] = -1;
					dir[0] = 1;
					dir[1] = 0;
				}
				c.setGazeTarget(...pos);
			});
			requestAnimationFrame(runRound);
		}
	});
}
