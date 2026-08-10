/**
 * Every public type in `@bearmetal/cli`, in one place.
 *
 * Importable as `@bearmetal/cli/types`, and re-exported through `mod.ts`.
 * @module
 */

// Input
export type { KeyEvent, KeyModifiers, KeyName } from "./input/keys.ts";
export type { KeyHandler } from "./input/reader.ts";
export type {
	EventMap as InputEventMap,
	IntermediateEventTarget,
	TypedEventTarget,
} from "./InputManager.ts";

// Rendering
export type { TerminalWriter } from "./render/writer.ts";
export type { RegionOptions } from "./render/region.ts";
export type { CliSession, InteractiveMode, SessionOptions, Widget } from "./render/session.ts";
export type { WidgetControl, WidgetSpec } from "./render/widget.ts";

// Prompts and menus
export type { ConfirmOptions, PromptOptions } from "./prompts.ts";
export type {
	MultiSelectMenuConfig,
	MultiSelectOption,
	SelectCallback,
	SelectMenuConfig,
	SelectOption,
} from "./select.ts";

// Styling
export type { ColorName, hexString, StyleName } from "./style.ts";

// Argument parsing
export type * from "./argParser/types.ts";
export type {
	CommandDefs,
	CommandDefsShape,
	CommandName,
	CommandPath,
	CommandResolvedArgs,
	HelpMode,
	PromptForOptions,
} from "./argParser/mod.ts";
