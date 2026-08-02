import type { Card, Column } from "./types.ts";

export const COLUMNS: Column[] = [
	{ id: "todo", title: "Todo", color: "#6366f1" },
	{ id: "in-progress", title: "In Progress", color: "#f59e0b" },
	{ id: "done", title: "Done", color: "#10b981" },
];

let n = 1;
const c = (
	columnId: Card["columnId"],
	title: string,
	priority: Card["priority"],
	description?: string,
): Card => ({ id: `c${n++}`, columnId, title, priority, description });

export const SEED_CARDS: Card[] = [
	c(
		"todo",
		"Fix parentBMC traversal in domContext",
		"high",
		"inject() stops after one hop; walk parentElement chain instead",
	),
	c(
		"todo",
		"Object props on custom elements",
		"medium",
		"setAttribute stringifies objects; check typeof and use property assignment",
	),
	c("todo", "Add jsxImportSourceTypes to workspace config", "low"),
	c(
		"in-progress",
		"Implement each() with keyed reconciliation",
		"high",
		"shallowDiff + ownerScope for per-item cleanup",
	),
	c(
		"in-progress",
		"Fix connectedCallback owner nesting bug",
		"high",
		"Save prevOwner, restore in finally instead of setting null",
	),
	c("in-progress", "Write kanban example app", "medium"),
	c("done", "Rename render() to init()", "low"),
	c(
		"done",
		"Add createEffect / createSignal free functions",
		"medium",
		"Works inside owner context; warns when called without one",
	),
	c("done", "Implement SSR hydration", "high"),
	c("done", "Fix Symbol.dispose in reconcile updated loop", "medium"),
];
