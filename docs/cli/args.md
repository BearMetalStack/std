# Argument parsing

`ArgParser` builds typed commands, flags, prompts, validation and `--help` from one config object.
The same definitions are the interface, the documentation, and the non-interactive contract — so
there is exactly one description of what your program takes.

```ts
import { ArgParser } from "@bearmetal/cli";

const parser = ArgParser.from(Deno.args, {
	projectName: { type: "string", prompt: "Project name", required: true, default: "my-app" },
	auth: { type: "confirm", prompt: "Include auth?", required: true },
	db: { type: "enum", values: ["postgres", "kv", "none"] as const, required: true },
});

const args = await parser.resolve();
// args.projectName: string | undefined
// args.auth:        boolean
// args.db:          "postgres" | "kv" | "none" | undefined
```

## Arg types

| `type`      | Set with                       | Prompts as    | Resolves to           |
| ----------- | ------------------------------ | ------------- | --------------------- |
| `"string"`  | `--name=value`                 | text prompt   | `string \| undefined` |
| `"number"`  | `--port=8000`                  | text prompt   | `number \| undefined` |
| `"enum"`    | `--db=kv`                      | select menu   | the value union       |
| `"confirm"` | `--auth` / `--no-auth`         | y/n prompt    | `boolean`             |
| `"flag"`    | `--dry-run` / `-d`             | never prompts | `boolean`             |
| `"list"`    | repeated `--color=a --color=b` | never prompts | `T[]`                 |

Every key is reachable as `--camelCase` and `--kebab-case`, plus whatever `aliases` you add. Aliases
are written with their dashes (`aliases: ["-p", "--port"]`).

```ts
{
	port: {
		type: "number",
		aliases: ["-p"],
		default: 8000,
		$description: "Port to listen on",   // shown in --help
		schema: f.number().int().min(1).max(65535),
	}
}
```

`$description` on an individual arg documents that arg; `$description` at the top level of the defs
object documents the whole group and becomes the `--help` header.

### Flags vs confirms

They look similar and are not. A `flag` has no unset state, so `required` on a flag can only ever be
satisfied by the flag being _present_ — it is a hard error, never a prompt. A `confirm` has three
states (yes, no, unanswered), so it prompts when required and is satisfied by an explicit answer
either way: `--no-auth` satisfies a required `auth`.

### list

```ts
{
	color: {
		type: "list",
		map: (raw) => {
			const [name, hex] = raw.split(":");
			return { name, hex };
		},
		schema: f.array(f.string().regex(/\w+:#[0-9a-f]{6}/i)),
	}
}
```

Every occurrence is collected in order rather than the last one winning, and `map` transforms each
value as it lands. `InferValue` recovers `map`'s real return type, so `args.color` is
`{ name: string; hex: string }[]`.

## required

```ts
type RequiredSpec =
	| boolean // always / never
	| string // always, and the string is the prompt hint
	| { if: string; message?: string; cannotBe?: string[] }
	| { ifNot: string; message?: string; cannotBe?: string[] };
```

Pass an array to combine them. Any active spec makes the arg required; hints and `cannotBe` lists
are merged across all active specs.

```ts
{
	auth: { type: "confirm", required: true },
	db: {
		type: "enum",
		values: ["postgres", "kv", "none"] as const,
		required: [
			true,
			{ if: "auth", message: "auth needs somewhere to store users", cannotBe: ["none"] },
		],
	},
}
```

`cannotBe` removes values from the prompt (and re-asks if one is typed anyway) while the condition
is active.

::: tip Order doesn't matter

Conditions are checked in a separate pass, after every value is settled — so `{ if: "auth" }` reads
`auth`'s final answer even if `auth` is declared after `db`. Collection order and dependency order
are independent.

:::

## resolve()

```ts
const args = await parser.resolve();
```

What it does depends on where it is running.

**Interactive** (a TTY, or an ambient session that isn't `plain`): prompts for anything required and
missing, validates against `schema`, and re-prompts on failure. Values given on the command line are
never prompted for.

**Non-interactive** (piped, CI, or `--non-interactive`): prompts nothing. It validates what was
given and throws once, listing _everything_ missing or invalid — not the first problem it hits.

```
Missing required arguments:
  --db
  --name: lowercase letters, digits and dashes only
```

`--help`/`-h` short-circuits both paths: it prints `helpText()` and exits 0.

### nonInteractive

`nonInteractive` is a reserved key. Declare it and the parser switches to the non-prompting path
whenever the flag is present, under either spelling or any alias:

```ts
{
	nonInteractive: {
		type: "flag",
		aliases: ["-n"],
		$description: "Never prompt; missing required args become an error",
	},
}
```

`--nonInteractive`, `--non-interactive` and `-n` all work.

### Sessions

`resolve()` uses the ambient session if there is one, and opens its own if there isn't.
`setInteractiveMode("alt")` chooses the mode for the session it opens — it has no effect when a
session is already active, because that session's mode already won.

In a real program, open the session yourself in `main` so arg prompts and the rest of the run share
one terminal restore. See [Sessions](./sessions).

## Commands

```ts
const args = await ArgParser.commandFrom(Deno.args, {
	$description: "A tour of the stack",
	$root: {
		$description: "Global options",
		nonInteractive: { type: "flag", aliases: ["-n"] },
	},
	$requireCommand: true,

	serve: {
		$description: "Run the server",
		port: { type: "number", default: 8000 },
	},
	migrate: {
		$description: "Apply pending migrations",
		to: { type: "string", $description: "Target revision" },
	},
}).setProgram("myapp").resolve();

switch (args.command) {
	case "serve":
		return serve(args.port); // args narrowed to serve's defs
	case "migrate":
		return migrate(args.to);
}
```

The result is a discriminated union on `command`, merged with the resolved `$root` args, so
narrowing on `args.command` gives you exactly that command's values.

### The reserved keys

| Key               | Meaning                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `$description`    | Header text for the whole program, above the command list                |
| `$root`           | Args parsed _before_ the command token                                   |
| `$requireCommand` | `true` makes a command mandatory; otherwise `command` may be `undefined` |

::: warning Global flags go before the command

`$root` args are exactly the tokens before the first positional one.

```sh
myapp --non-interactive serve --port=3000   # ✓
myapp serve --port=3000 --non-interactive   # ✗ parsed as one of serve's args
```

If you read global flags yourself before constructing the parser — to pick a session mode, say —
slice at the first non-flag token so the same rule holds everywhere.

:::

### promptForCommand

```ts
const args = await parser.resolve({ promptForCommand: "What would you like to do?" });
```

With no valid command given, this offers the command list as a menu instead of throwing. Guard it on
the mode: menus throw `NotInteractiveError` when there is no terminal.

```ts
await parser.resolve({ promptForCommand: session.mode !== "plain" && "Pick a command" });
```

## Help output

```ts
parser.helpText("myapp");
```

Rendered from the same defs: `$description`, then the options with their aliases, descriptions and
defaults. For a `CommandArgParser` it shows the matched command's args, or — when no command matched
— the root args followed by the command list.

```
A tour of the stack

Global options

Options:
  --alt, -a              Run the whole session on the alternate screen (default: false)
  --non-interactive, -n  Never prompt; missing required args become an error (default: false)

Commands:
  serve    Run the server
  migrate  Apply pending migrations
```

## Reading without resolving

```ts
parser.get("port"); // typed, synchronous, no prompting
parser.nonFlags; // positional tokens
parser.argFlags; // every `-`-prefixed token, raw
parser.commandArgs; // positionals after the command name
```

Useful for bootstrap decisions that have to happen before a session exists.
