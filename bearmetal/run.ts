import { ArgParser, colorize } from "@bearmetal/cli";
import { f } from "@bearmetal/forge";
import { generateDripTheme } from "./drip/generateDripTheme.ts";
import { listDripThemes } from "./drip/listDripThemes.ts";
import { dripConfig } from "@bearmetal/drip";
import { tmplr } from "@bearmetal/miscellanea";
import { startMCP } from "@bearmetal/mcp";

const args = ArgParser.commandFrom(Deno.args, {
	mcp: {
		$description: "Starts the BearMetal MCP server on stdio",
	},
	palette: {
		$description: "Start the Drip Palette app in the current project.",
		host: {
			type: "flag",
			default: false,
			$description: "Allow access to Drip Palette from the network",
		},
		port: {
			type: "number",
			default: 3000,
			schema: f.number().min(1).max(65535).int().describe("<1-65535>"),
		},
	},
	drip: {
		$description: "Manage Drip themes in the current project.",
		new: {
			type: "flag",
			aliases: ["-n"],
			default: false,
			required: {
				if: "nonInteractve",
				message: "Non-interactive mode only available when passing --new",
			},
			$description: "Create a new theme",
		},
		default: {
			type: "string",
			default: "bearmetal",
			$description: "Change the default theme for the project",
		},
		bearmetal: {
			type: "flag",
			$description: "Enable/disable built-in themes",
		},
		color: {
			type: "list",
			map: (s) => {
				const parts = s.split(":");

				return {
					name: parts[0],
					hex: parts[1],
					stop: parts[2] ? parseInt(parts[2]) : 500,
				};
			},
			required: {
				if: "nonInteractive",
				message: "Non-interactive mode requires --color=<color name>:<hex code>[:stop]",
			},
			schema: f.array(
				f.string().regex(
					/\w+(-\w+)*:#[a-f0-9]{3}|[a-f0-9]{6}(:(50|[1-9]00|950))?/i,
					"--color provided in incorrect format (expected <color name>:<hex code>[:stop])",
				),
			).describe(
				"<color name>:<hex code>[:stop]",
			),
			$description: "Provide a color to the non-interactive theme generator",
		},
		name: {
			type: "string",
			required: {
				if: "nonInteractive",
				message: "Non-interactive mode requires --name=<theme name>",
			},
			$description:
				"Provide a name for the theme to be created in the non-interactive theme generator",
		},
	},
	$root: {
		nonInteractive: {
			type: "flag",
			aliases: ["-p"],
			$description: "Run in non-interactive mode",
			default: false,
			required: [
				{ if: "color", message: "--color can only be used in non-interactive mode" },
				{ if: "name", message: "--name can only be used in non-interactive mode" },
			],
		},
	},
	$description: "Tools and utilities for the BearMetal Stack",
}).setProgram("bearmetal");
const resolved = await args.resolve({ promptForCommand: "Command:" }).catch(
	(e) => console.error(e.message) ?? Deno.exit(2),
);
export type Resolved = typeof resolved;

const tool = resolved.command;
// using _cliTheme = startCliTheme("#25000e", "#f0a8c2");
if (tool !== "mcp") {
	console.log(tmplr.replace(/^\n\n/, "").trimEnd());
	console.log("-=".repeat(Deno.consoleSize().columns / 2));
}

switch (tool) {
	case "mcp":
		{
			await import("./mcp/main.ts");
			startMCP();
		}
		break;
	case "palette":
		{
			const port = resolved.port;
			const hostname = resolved.host ? "0.0.0.0" : "127.0.0.1";
			const palette = await import("@bearmetal/drip/palette");
			Deno.serve({ hostname, port }, palette.router.handle);
		}
		break;
	case "drip":
		{
			if (resolved.new) {
				generateDripTheme(resolved);
				break;
			}
			if (resolved.bearmetal != undefined) dripConfig("disableBearmetal", !resolved.bearmetal);
			if (resolved.default !== undefined) dripConfig("defaultTheme", resolved.default);

			listDripThemes();
		}
		break;
	default:
		console.log(
			`${tool} not implemented yet, try again in a future update!\n${
				colorize("(I put this here specifically to frustrate you >:D)", "grey")
			}`,
		);
}
