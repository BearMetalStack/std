/** Replaces `&gt;` `&lt;` `&apos;` `&quot;` `&amp;` entities with their literal characters. */
export function unescapeHtml(html: string): string {
	const rx = /&(gt|lt|apos);/g;
	const chars = {
		"gt": ">",
		"lt": "<",
		"apos": "'",
		"quot": '"',
		"amp": "&",
	};
	return html.replace(rx, (_, e) => chars[e as keyof typeof chars] ?? "");
}

/** Escapes `< > ' " &` to their HTML entity equivalents. */
export function escapeHtml(value: string): string {
	const rx = /[<>'"&]/g;
	const seqs = {
		">": "gt",
		"<": "lt",
		"'": "apos",
		'"': "quot",
		"&": "amp",
	};
	return value.replace(rx, (e) => `&${seqs[e as keyof typeof seqs] ?? ""};`);
}
