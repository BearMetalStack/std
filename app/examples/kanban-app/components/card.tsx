import type { Card, Priority } from "../types.ts";

const PRIORITY_NEXT: Record<Priority, Priority> = {
	low: "medium",
	medium: "high",
	high: "low",
};

type CardHandlers = {
	canMoveLeft: boolean;
	canMoveRight: boolean;
	onMoveLeft: () => void;
	onMoveRight: () => void;
	onDelete: () => void;
	onCyclePriority: () => void;
};

export function KanbanCard(card: Card, h: CardHandlers): Element {
	return (
		<div class={`card card--${card.priority}`}>
			<div class="card-top">
				<button
					type="button"
					class={`prio-pip prio-pip--${card.priority}`}
					onClick={h.onCyclePriority}
					title={`Priority: ${card.priority} (click to cycle)`}
				>
					{card.priority}
				</button>
				<button
					type="button"
					class="card-delete"
					onClick={h.onDelete}
					title="Delete card"
				>
					✕
				</button>
			</div>
			<p class="card-title">{card.title}</p>
			{card.description
				? <p class="card-desc">{card.description}</p>
				: null}
			<div class="card-moves">
				<button
					type="button"
					class="move-btn"
					disabled={!h.canMoveLeft}
					onClick={h.onMoveLeft}
					title="Move left"
				>
					←
				</button>
				<button
					type="button"
					class="move-btn"
					disabled={!h.canMoveRight}
					onClick={h.onMoveRight}
					title="Move right"
				>
					→
				</button>
			</div>
		</div>
	) as Element;
}

export { PRIORITY_NEXT };
