import type { Signal } from "@bearmetal/app/signals";

export type ColumnId = "todo" | "in-progress" | "done";

export type Column = {
	id: ColumnId;
	title: string;
	color: string;
};

export type Priority = "low" | "medium" | "high";

export type Card = {
	id: string;
	title: string;
	description?: string;
	columnId: ColumnId;
	priority: Priority;
};

declare module "@bearmetal/app/context" {
	interface ContextMap {
		"kanban:cards": Signal.State<Card[]>;
		"kanban:columns": Column[];
		"kanban:addCard": (columnId: ColumnId, title: string, priority: Priority) => void;
		"kanban:moveCard": (cardId: string, direction: "left" | "right") => void;
		"kanban:deleteCard": (cardId: string) => void;
		"kanban:setPriority": (cardId: string, priority: Priority) => void;
	}
}
