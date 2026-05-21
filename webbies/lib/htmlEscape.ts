export function unescape(html: string): string {
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

export function escape(value: string) {
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
