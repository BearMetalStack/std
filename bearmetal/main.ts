import { ArgParser, colorize } from "@bearmetal/cli";
import { f } from "@bearmetal/forge";
import { generateDripTheme } from "./drip/generateDripTheme.ts";
import { listDripThemes } from "./drip/listDripThemes.ts";
import { dripConfig } from "@bearmetal/drip";

const args = ArgParser.commandFrom(Deno.args, {
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
			schema: f.number().min(1).max(65535).int(),
		},
	},
	drip: {
		$description: "Manage Drip themes in the current project.",
		new: {
			type: "flag",
			default: false,
		},
		default: {
			type: "string",
			default: "bearmetal",
		},
		bearmetal: {
			type: "flag",
		},
	},
	$description: "Tools and utilities for the BearMetal Stack",
});

const resolved = await args.resolve({ promptForCommand: "Command:" });

const tool = resolved.command;

switch (tool) {
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
				generateDripTheme();
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
