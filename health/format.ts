import type { ModuleFormat } from "./types.ts";

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

function fixed(value: number, decimals: number): string {
	return value.toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: decimals,
	});
}

/** Formats `value` for display according to `format`. */
export function formatValue(value: number | null | undefined, format: ModuleFormat = {}): string {
	if (value === null || value === undefined || Number.isNaN(value)) return "–";
	const decimals = format.decimals;
	switch (format.kind) {
		case "bytes": {
			let v = value;
			let i = 0;
			while (Math.abs(v) >= 1024 && i < BYTE_UNITS.length - 1) {
				v /= 1024;
				i++;
			}
			return `${fixed(v, decimals ?? 1)} ${BYTE_UNITS[i]}`;
		}
		case "ms":
			return value >= 1000
				? `${fixed(value / 1000, decimals ?? 2)} s`
				: `${fixed(value, decimals ?? 0)} ms`;
		case "percent":
			return `${fixed(value, decimals ?? 1)}%`;
		default: {
			const d = decimals ?? (Math.abs(value) < 10 && !Number.isInteger(value) ? 2 : 0);
			const text = Math.abs(value) >= 10_000
				? Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
					value,
				)
				: fixed(value, d);
			return format.unit ? `${text} ${format.unit}` : text;
		}
	}
}
