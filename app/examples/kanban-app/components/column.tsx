import { define } from "../../../define.ts";
import { BMElement } from "../../../mod.ts";
import { each } from "../../../signals.ts";
import type { Card, ColumnId, Priority } from "../types.ts";
import { COLUMNS } from "../data.ts";
import { KanbanCard, PRIORITY_NEXT } from "./card.tsx";

@define("kanban-column")
export class KanbanColumn extends BMElement {
	protected init() {
		const columnId = this.getAttribute("column-id") as ColumnId;
		const column = COLUMNS.find((c) => c.id === columnId)!;
		const colIndex = COLUMNS.findIndex((c) => c.id === columnId);

		const cards = this.injectOrThrow("kanban:cards");
		const addCard = this.injectOrThrow("kanban:addCard");
		const moveCard = this.injectOrThrow("kanban:moveCard");
		const deleteCard = this.injectOrThrow("kanban:deleteCard");
		const setPriority = this.injectOrThrow("kanban:setPriority");

		const columnCards = this.computed(() =>
			cards.get().filter((c: Card) => c.columnId === columnId)
		);
		const count = this.computed(() => columnCards.get().length);

		// Add-card form state
		const adding = this.signal(false);
		const draft = this.signal("");
		const draftPriority = this.signal<Priority>("medium");

		const wrapClass = this.computed(() => adding.get() ? "add-wrap add-wrap--open" : "add-wrap");
		const lowClass = this.computed(() =>
			`prio-opt${draftPriority.get() === "low" ? " prio-opt--active" : ""}`
		);
		const medClass = this.computed(() =>
			`prio-opt${draftPriority.get() === "medium" ? " prio-opt--active" : ""}`
		);
		const highClass = this.computed(() =>
			`prio-opt${draftPriority.get() === "high" ? " prio-opt--active" : ""}`
		);

		const submitAdd = (e: Event) => {
			e.preventDefault();
			const title = draft.get().trim();
			if (!title) return;
			addCard(columnId, title, draftPriority.get());
			draft.set("");
			adding.set(false);
		};

		const draftInput = (
			<input
				class="add-input"
				placeholder="Card title…"
				onInput={(e: Event) => draft.set((e.target as HTMLInputElement).value)}
			/>
		) as HTMLInputElement;

		const cardSlot = each(
			columnCards,
			(card: Card) =>
				KanbanCard(card, {
					canMoveLeft: colIndex > 0,
					canMoveRight: colIndex < COLUMNS.length - 1,
					onMoveLeft: () => moveCard(card.id, "left"),
					onMoveRight: () => moveCard(card.id, "right"),
					onDelete: () => deleteCard(card.id),
					onCyclePriority: () => setPriority(card.id, PRIORITY_NEXT[card.priority]),
				}),
			(card: Card) => card.id,
		);

		this.appendChild(
			<div class="column" style={`--col: ${column.color}`}>
				<div class="column-header">
					<span class="col-pip" />
					<h2 class="col-title">{column.title}</h2>
					<span class="col-count">{count}</span>
				</div>
				<div class="card-list">
					{cardSlot}
				</div>
				<div class={wrapClass}>
					<button
						type="button"
						class="add-trigger"
						onClick={() => {
							adding.set(true);
							(draftInput as HTMLInputElement).focus();
						}}
					>
						<span>+</span> Add card
					</button>
					<form class="add-form" onSubmit={submitAdd}>
						{draftInput}
						<div class="prio-row">
							<button type="button" class={lowClass} onClick={() => draftPriority.set("low")}>
								low
							</button>
							<button type="button" class={medClass} onClick={() => draftPriority.set("medium")}>
								med
							</button>
							<button type="button" class={highClass} onClick={() => draftPriority.set("high")}>
								high
							</button>
						</div>
						<div class="add-actions">
							<button type="submit" class="btn-add">Add</button>
							<button
								type="button"
								class="btn-cancel"
								onClick={() => {
									adding.set(false);
									draft.set("");
									draftInput.value = "";
								}}
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			</div>,
		);
	}
}
