/**
 * @module
 * The icons gutenbearg's chrome and blocks draw, and the sprite sheet that holds them.
 *
 * Every name here is a Phosphor symbol; a `-fill` suffix picks the filled weight. The sheet in
 * `assets/icons.svg` is generated from this list (`deno task bm:icons`), so a name added here
 * renders nothing until the sheet is rebuilt.
 */

/** Every icon the sprite sheet carries. */
export const ICONS = [
	"arrow-left",
	"arrow-right",
	"book-bookmark",
	"book-open",
	"brackets-curly",
	"calendar-blank",
	"caret-down",
	"caret-right",
	"check",
	"clock",
	"clock-counter-clockwise",
	"copy",
	"cube",
	"file-code",
	"fire-fill",
	"footprints",
	"funnel-simple",
	"git-branch",
	"github-logo",
	"house",
	"info-fill",
	"lightbulb",
	"lightbulb-fill",
	"lightning",
	"magnifying-glass",
	"moon",
	"path",
	"paw-print",
	"paw-print-fill",
	"pencil-simple",
	"rocket",
	"signpost",
	"stack",
	"sun",
	"tag",
	"terminal-window",
	"tree-structure",
	"warning-fill",
	"x",
] as const;

/** A symbol id in the sprite sheet. */
export type IconName = typeof ICONS[number];
