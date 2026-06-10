import { BMElement, define } from "@bearmetal/app";

@define("bm-grid", import.meta)
export class BmGrid extends BMElement {
	static observedAttributes = ["columns", "gap", "animated"] as const;

	private observer = new MutationObserver(() => this.applyStyles());

	init() {
		this.observer.observe(this as unknown as Node, {
			childList: true,
			attributeFilter: ["data-span"],
			subtree: true,
		});
		this.applyStyles();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.observer.disconnect();
	}

	attributeChangedCallback(): void {
		this.applyStyles();
	}

	private get animated(): boolean {
		return this.hasAttribute("animated");
	}

	private snapshot(): Map<Element, DOMRect> {
		const map = new Map<Element, DOMRect>();
		for (const child of this.children) {
			map.set(child, child.getBoundingClientRect());
		}
		return map;
	}

	private flip(snapshots: Map<Element, DOMRect>): void {
		const duration = Number(this.getAttribute("animated") || 300) || 300;

		for (const child of this.children) {
			const before = snapshots.get(child);
			if (!before) continue;

			const after = child.getBoundingClientRect();
			const dx = before.x - after.x;
			const dy = before.y - after.y;
			const scaleX = before.width / after.width;
			const scaleY = before.height / after.height;

			if (dx === 0 && dy === 0 && scaleX === 1 && scaleY === 1) continue;

			child.animate([
				{
					transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
				},
				{ transform: "translate(0, 0) scale(1, 1)" },
			], {
				duration,
				easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
				fill: "none",
			});
		}
	}

	private applyGrid(): void {
		const columns = this.getAttribute("columns") ?? "12";
		const gap = this.getAttribute("gap") ?? "var(--grid-gap)";

		this.style.display = "grid";
		this.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
		this.style.gap = gap;

		for (const child of this.children) {
			const span = child.getAttribute("data-span") ?? 1;
			(child as HTMLElement).style.gridColumn = `span ${span}`;
		}
	}

	private applyStyles(): void {
		if (!this.animated) {
			this.applyGrid();
			return;
		}

		const snapshots = this.snapshot();
		this.applyGrid();
		this.flip(snapshots);
	}
}
