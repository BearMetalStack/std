import { BMElement, define } from "@bearmetal/app";
import type { Card, ColumnId, Priority } from "./types.ts";
import { COLUMNS, SEED_CARDS } from "./data.ts";
import "./components/column.tsx";

@define("kanban-board")
export class KanbanBoard extends BMElement {
	protected get template() {
		return (
			<div class="board">
				{COLUMNS.map((col) => <kanban-column key={col.id} column-id={col.id} />)}
			</div>
		) as Element;
	}
}

@define("kanban-app")
export class KanbanApp extends BMElement {
	#cards = this.signal<Card[]>(SEED_CARDS);

	protected init() {
		this.provide("kanban:cards", this.#cards);
		this.provide("kanban:columns", COLUMNS);

		this.provide(
			"kanban:addCard",
			(columnId: ColumnId, title: string, priority: Priority) => {
				this.#cards.set([
					...this.#cards.get(),
					{ id: `card_${Date.now()}`, columnId, title, priority },
				]);
			},
		);

		this.provide(
			"kanban:moveCard",
			(cardId: string, direction: "left" | "right") => {
				const ids = COLUMNS.map((c) => c.id);
				this.#cards.set(
					this.#cards.get().map((card) => {
						if (card.id !== cardId) return card;
						const idx = ids.indexOf(card.columnId);
						const next = idx + (direction === "left" ? -1 : 1);
						if (next < 0 || next >= ids.length) return card;
						return { ...card, columnId: ids[next] };
					}),
				);
			},
		);

		this.provide(
			"kanban:deleteCard",
			(cardId: string) => {
				this.#cards.set(this.#cards.get().filter((c) => c.id !== cardId));
			},
		);

		this.provide(
			"kanban:setPriority",
			(cardId: string, priority: Priority) => {
				this.#cards.set(
					this.#cards.get().map((c) => c.id === cardId ? { ...c, priority } : c),
				);
			},
		);

		this.appendChild(<kanban-board />);
	}
}
