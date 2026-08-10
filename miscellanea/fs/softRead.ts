/**
 * Reads that fail soft on a missing file but never on a broken one.
 *
 * The distinction matters: code that treats "no file" and "unparseable file" as
 * the same empty object will happily create-or-merge against `{}` and write the
 * result back, silently discarding whatever was in the file. A syntax error in
 * a config or theme file should stop you, not erase you.
 *
 * @module
 */

/**
 * Reads a text file, yielding `undefined` when it does not exist. Any other
 * failure — a permission error, a directory where a file was expected — is
 * rethrown.
 */
export async function readTextIfPresent(path: string | URL): Promise<string | undefined> {
	try {
		return await Deno.readTextFile(path);
	} catch (e) {
		if (e instanceof Deno.errors.NotFound) return undefined;
		throw e;
	}
}

/**
 * Reads and parses a JSON file, yielding `fallback` when the file does not
 * exist.
 *
 * @throws if the file exists but does not parse.
 */
export async function readJsonIfPresent<T>(path: string | URL, fallback: T): Promise<T> {
	const text = await readTextIfPresent(path);
	if (text === undefined) return fallback;
	try {
		return JSON.parse(text) as T;
	} catch (e) {
		throw new SyntaxError(
			`${path} is not valid JSON: ${e instanceof Error ? e.message : e}`,
			{ cause: e },
		);
	}
}
