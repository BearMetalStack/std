const colorMap = {
	purple: "\x1b[35m",
	porple: "\x1b[38;2;150;0;200m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	gray: "\x1b[90m",
	get grey() {
		return this.gray;
	},
};

type hexString = `#${string}`;

export function colorize(text: string, color?: keyof typeof colorMap | hexString) {
	if (!color) return text;
	const c = colorMap[color as keyof typeof colorMap];
	if (!c) {
		if (isHex(color)) return `${ansiTruecolor(color, false)}${text}\x1b[0m`;
		return text;
	}
	return `${c}${text}\x1b[0m`;
}

export function ansiTruecolor(hex: string, bg = true): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `\x1b[${bg ? 48 : 38};2;${r};${g};${b}m`;
}

function isHex(color: string): boolean {
	return color.startsWith("#") && color.length === 7 && !Number.isNaN(parseInt(color.slice(1), 16));
}
