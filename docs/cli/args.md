# Argument parsing

`ArgParser` builds typed commands, flags, positionals, prompts, validation and `--help` from one
config object. The same definitions are the interface, the documentation, and the non-interactive
contract — so there is exactly one description of what your program takes.

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

## Nothing is dropped

Every token has to land somewhere. A name nobody declared, a value with nowhere to go, or a
positional too many raises `ArgParseError` carrying **every** problem found:

```
$ tmstn chapter new --title="Typo Test" --contnet="words that vanish"
2 problems:
  Unknown option --contnet. Did you mean --content?
  Unexpected argument "words that vanish"
```

::: danger This is the one that matters

Before, an unrecognised `--foo=bar` was ignored: the value became a positional or went nowhere, the
arg stayed `undefined`, and the run continued and exited 0. You found out only if the arg happened
to be required. For anything that writes files on a user's behalf, a silently dropped `--content` is
the worst possible failure — it looks like success.

:::

`--help` is answered _before_ the check, so the one thing that tells you the right spelling stays
reachable when you spell something wrong.

### Values need `=`

```sh
tmstn chapter new --title=Chapter    # ✓
tmstn chapter new --title Chapter    # ✗ error, not a silent drop
tmstn chapter new -t=Chapter         # ✓ short aliases carry values too
```

Space-separated values would make positionals ambiguous, so they are rejected rather than guessed
at. The error names the working form.

`--flag=true` and `--flag=no` work for flags and confirms; anything that isn't a boolean is an
error.

### Everything after `--` is a value

```sh
tmstn write -- --this-is-a-filename.md
```

## Arg types

| `type`         | Set with                       | Prompts as    | Resolves to           |
| -------------- | ------------------------------ | ------------- | --------------------- |
| `"string"`     | `--name=value`                 | text prompt   | `string \| undefined` |
| `"number"`     | `--port=8000`                  | text prompt   | `number \| undefined` |
| `"enum"`       | `--db=kv`                      | select menu   | the value union       |
| `"confirm"`    | `--auth` / `--no-auth`         | y/n prompt    | `boolean`             |
| `"flag"`       | `--dry-run` / `-d`             | never prompts | `boolean`             |
| `"list"`       | repeated `--color=a --color=b` | never prompts | `T[]`                 |
| `"positional"` | by position                    | never prompts | `string` / `string[]` |

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
satisfied by the flag being _present_ — a hard error, never a prompt. A `confirm` has three states
(yes, no, unanswered), so it prompts when required and is satisfied by an explicit answer either
way: `--no-auth` satisfies a required `auth`.

### list

```ts
{
	color: {
		type: "list",
		map: (raw) => {
			const [name, hex] = raw.split(":");
			return { name, hex };
		},
	}
}
```

Every occurrence is collected in order rather than the last one winning, and `map` transforms each
value as it lands. `InferValue` recovers `map`'s real return type, so `args.color` is
`{ name: string; hex: string }[]`. `schema` is optional, like every other type's — using a list does
not drag in forge.

## Positionals

Declare them as ordinary entries, keyed by name. Their order on the command line is the order they
are declared in.

```ts
const args = await ArgParser.from(Deno.args, {
	draft: { type: "positional", required: true, $description: "Draft file" },
	refs: { type: "positional", variadic: true },
	title: { type: "string" },
}).resolve();

args.draft; // string   — required, so never undefined
args.refs; // string[] — variadic swallows the rest
args.title; // string | undefined
```

Declaring them is what gets you three things a raw `commandArgs` array cannot: they appear in the
usage line and the `Arguments:` section of `--help`, their arity is checked, and they are typed.

```
Usage: tmstn chapter new [options] <draft> [refs...]

Arguments:
  <draft>    Draft file (required)
  [refs...]
```

Only the last one may be `variadic`. Declaring even one positional makes a surplus argument an
error; declaring none leaves them unchecked and reachable through `commandArgs`, which is what an
existing parser expects.

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
given and throws once, listing _everything_ missing or invalid.

```
Missing required arguments:
  --db
  --name: lowercase letters, digits and dashes only
```

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
	$description: "Manage a manuscript",
	$root: {
		$description: "Global options",
		json: { type: "flag" },
		nonInteractive: { type: "flag", aliases: ["-n"] },
	},
	$requireCommand: true,

	chapter: {
		$description: "Chapter operations",
		verbose: { type: "flag", aliases: ["-v"] },
		$commands: {
			list: { $description: "List chapters" },
			new: {
				title: { type: "string", required: true },
				draft: { type: "positional", required: true },
			},
		},
	},
	build: { $description: "Build the book" },
}).setProgram("tmstn").resolve();
```

### Nesting

`$commands` nests subcommands under a command, to any depth. `command` is the matched path,
space-joined, and the result is a discriminated union over it:

```ts
switch (args.command) {
	case "chapter list":
		return list(args.json);
	case "chapter new":
		return create(args.title, args.draft); // narrowed to this leaf's args
	case "build":
		return build();
}
```

`commandPath` is the same thing as `["chapter", "new"]` when you want the parts.

A command that declares `$commands` is a group, not a destination: `tmstn chapter` on its own is an
error naming its subcommands, and only leaves appear in the `command` union. A group's own args stay
valid at its level and are merged into the result.

::: tip What this replaces

Without nesting, two levels meant joining `noun verb` into one token before parsing — reordering
argv and pattern-matching on a noun list in the program itself, which is the most fragile code in
any CLI that does it. Declaring the tree deletes all of it.

:::

### Position is not part of the grammar

A token belongs to whichever level _declares_ it, not to wherever it happens to sit. Innermost wins,
then out to `$root`:

```sh
tmstn --json chapter list     # ✓
tmstn chapter list --json     # ✓ same thing
tmstn chapter -v list         # ✓
tmstn chapter list -v         # ✓ same thing
```

### The reserved keys

| Key               | Where                 | Meaning                                           |
| ----------------- | --------------------- | ------------------------------------------------- |
| `$description`    | any defs object       | Documentation for that group                      |
| `$root`           | the `commandFrom` map | Args that belong to the program, not to a command |
| `$requireCommand` | the `commandFrom` map | `true` makes a top-level command mandatory        |
| `$commands`       | a command's defs      | Subcommands nested under it                       |

### promptForCommand

```ts
const args = await parser.resolve({
	promptForCommand: canPrompt() && "What would you like to do?",
});
```

With no valid command given, this offers the choices as a menu instead of throwing — one level at a
time, so a group never resolves half-chosen. Flags you typed for the subcommand you hadn't named yet
are held and re-routed once it is picked.

Guard it on [`canPrompt()`](./sessions#not-a-terminal): menus throw `NotInteractiveError` when there
is no terminal.

## --help without exiting

By default `--help` prints and calls `Deno.exit(0)`, which contradicts the rule the rest of the
package is built on — exiting inside a session skips its disposal. Switch it:

```ts
const parser = ArgParser.commandFrom(Deno.args, defs).setHelpMode("throw");

try {
	const args = await parser.resolve();
	// ...
} catch (error) {
	if (error instanceof HelpRequested) {
		session.log(error.helpText);
		return 0;
	}
	throw error;
}
```

`HelpRequested` carries the rendered text and hands the decision back to whoever owns the session.
`"exit"` remains the default so existing programs are unchanged.

## Prompting for one arg

`resolve()` is the whole-command-line path, which is no use to code that builds a context by itself
— an interactive shell, a REPL, a wizard step not backed by argv. `promptFor` asks for a single def
with exactly the semantics `resolve()` would use:

```ts
import { promptFor } from "@bearmetal/cli";

const title = await promptFor(
	{ type: "string", prompt: "New title", schema: f.string().min(1) },
	{ current: chapter.title },
);
```

Label, hint, `cannotBe` retries and schema re-prompting all behave identically, because `resolve()`
calls this too. Without it, a shell that synthesises its own contexts has to re-implement a slice of
the parser's semantics and the two definitions drift.

```ts
interface PromptForOptions {
	key?: string; // label when `prompt` is unset
	current?: string; // offered as the default
	cannotBe?: string[];
	hint?: string;
	session?: CliSession;
}
```

`flag`, `list` and `positional` defs have no prompt form and return their current or default value.

## Help output

```ts
parser.helpText("tmstn");
```

Rendered from the same defs: usage line with positionals, `$description`, the arguments section, and
the options with their aliases, descriptions and defaults. For a `CommandArgParser` it shows the
matched command's args plus its ancestors' and the root's — or, when no command matched, the command
list.

## Reading without resolving

```ts
parser.get("port"); // typed, synchronous, no prompting
parser.issues; // problems found while parsing
parser.nonFlags; // positional tokens
parser.commandArgs; // positionals after the command path
parser.commandPath; // ["chapter", "new"]
```
