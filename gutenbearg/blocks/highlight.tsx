import type { JSX } from "@bearmetal/jsx/jsx-runtime";

const TOKEN =
	/(\/\/.*$)|("[^"]*"|'[^']*')|\b(\d+)\b|\b(import|from|export|const|let|function|return|if|else|new|type|interface|await|async|true|false|null|undefined|extends)\b|([A-Za-z_]\w*)(?=\s*[(<])|(<\/?[A-Z][A-Za-z]*|<\/?[a-z]+(?=[\s>])|\/>)/gm;
const CLASSES = ["c", "s", "n", "k", "f", "t"];

/**
 * A deliberately small highlighter: comments, strings, numbers, keywords, calls and JSX tags.
 * `sh` renders one prompt per line, `txt` renders plain. A real grammar replaces this when content
 * comes from markdown; the `tk-*` classes it emits are the contract the stylesheet keys off.
 */
export function highlight(code: string, lang = ""): JSX.Child[] {
	if (lang === "txt" || lang === "text") return [code];
	if (lang === "sh" || lang === "bash") {
		return code.split("\n").map((line) => {
			const [cmd, ...rest] = line.split(" ");
			return (
				<div>
					<span class="tk-p">$</span> <span class="tk-f">{cmd}</span> {rest.join(" ")}
				</div>
			);
		});
	}
	const out: JSX.Child[] = [];
	let last = 0;
	for (const m of code.matchAll(TOKEN)) {
		if (m.index > last) out.push(code.slice(last, m.index));
		const group = m.slice(1, 7).findIndex((g) => g !== undefined);
		out.push(<span class={`tk-${CLASSES[group]}`}>{m[0]}</span>);
		last = m.index + m[0].length;
	}
	out.push(code.slice(last));
	return out;
}
