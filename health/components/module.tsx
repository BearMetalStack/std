import type { Signal } from "@bearmetal/app/signals";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { BMElement, define, prop } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";
import type {
	DashModule,
	GaugeModule,
	HistogramPayload,
	StatusPayload,
	TablePayload,
	TimeseriesPayload,
} from "../types.ts";
import { headline, levelOf, type LogView, type ModuleView, type StatView } from "../reduce.ts";
import { formatValue } from "../format.ts";
import { areaPath, domainOf, fraction, linePath } from "./svg.ts";

const W = 300;
const H = 100;

function parseConfig(config: string): DashModule | null {
	if (!config) return null;
	try {
		return JSON.parse(config) as DashModule;
	} catch {
		return null;
	}
}

function compact(n: number): string {
	return Intl.NumberFormat("en-US", { notation: "compact" }).format(n);
}

function clock(t: number): string {
	return new Date(t).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/**
 * Renders one dashboard module from its config and its current view. It never fetches: set
 * `data` (a {@link ModuleView}) yourself, or wrap it in `<bmh-feed>`.
 *
 * Light DOM, so page styles reach every part. Hooks for styling:
 * `[data-type]`, `[data-level="ok|warn|crit"]`, `[data-state="loading|live|error"]`, and the
 * `bmh-*` classes inside. Colors come from `--bmh-*` custom properties.
 *
 * @example
 * ```html
 * <bmh-module config='{"id":"rps","_type":"stat","title":"Requests/s",...}'></bmh-module>
 * ```
 */
@define("bmh-module")
export class BmhModule extends BMElement<{ log: HTMLElement }> {
	static override get stylesheet(): string {
		return css`
			:scope {
				display: flex;
				flex-direction: column;
				gap: .5rem;
				min-width: 0;
				padding: .9rem 1rem;
				background: var(--bmh-surface, #fff);
				color: var(--bmh-fg, #1e2430);
				border: 1px solid var(--bmh-line, #e3e6ec);
				border-radius: var(--bmh-radius, 10px);
				font-family: var(--bmh-font, system-ui, sans-serif);
				--bmh-level: var(--bmh-accent, #4f6bed);
			}
			:scope[data-level="warn"] {
				--bmh-level: var(--bmh-warn, #d98a00);
			}
			:scope[data-level="crit"] {
				--bmh-level: var(--bmh-crit, #d43d4f);
			}
			:scope[data-state="error"] {
				border-color: var(--bmh-crit, #d43d4f);
			}
			:scope .bmh-head {
				display: flex;
				justify-content: space-between;
				gap: .5rem;
				align-items: baseline;
			}
			:scope .bmh-title {
				font-size: .8rem;
				font-weight: 600;
				color: var(--bmh-muted, #6b7385);
			}
			:scope .bmh-error {
				font-size: .75rem;
				color: var(--bmh-crit, #d43d4f);
			}
			:scope .bmh-value {
				font-size: 1.75rem;
				font-weight: 700;
				color: var(--bmh-level);
				font-variant-numeric: tabular-nums;
			}
			:scope svg {
				display: block;
				width: 100%;
				overflow: visible;
			}
			:scope .bmh-line {
				fill: none;
				stroke: var(--bmh-level);
				stroke-width: 2;
				vector-effect: non-scaling-stroke;
				stroke-linejoin: round;
				stroke-linecap: round;
			}
			:scope .bmh-area {
				fill: var(--bmh-level);
				opacity: .12;
			}
			:scope .bmh-spark {
				height: 28px;
			}
			:scope .bmh-chart {
				height: 110px;
			}
			:scope .bmh-series:nth-child(2) {
				--bmh-level: var(--bmh-series-2, #2f9e66);
			}
			:scope .bmh-series:nth-child(3) {
				--bmh-level: var(--bmh-series-3, #b65fd6);
			}
			:scope .bmh-series:nth-child(4) {
				--bmh-level: var(--bmh-series-4, #d98a00);
			}
			:scope .bmh-legend {
				display: flex;
				flex-wrap: wrap;
				gap: .25rem 1rem;
				font-size: .8rem;
				color: var(--bmh-muted, #6b7385);
			}
			:scope .bmh-legend b {
				color: var(--bmh-fg, #1e2430);
				font-variant-numeric: tabular-nums;
			}
			:scope .bmh-gauge-track {
				fill: none;
				stroke: var(--bmh-line, #e3e6ec);
				stroke-width: 10;
				stroke-linecap: round;
			}
			:scope .bmh-gauge-fill {
				fill: none;
				stroke: var(--bmh-level);
				stroke-width: 10;
				stroke-linecap: round;
				transition: stroke-dasharray .4s ease;
			}
			:scope .bmh-gauge {
				max-width: 180px;
				margin: 0 auto;
			}
			:scope .bmh-gauge-value {
				text-align: center;
				margin-top: -1.75rem;
			}
			:scope .bmh-bars {
				display: flex;
				align-items: flex-end;
				gap: 3px;
				height: 110px;
			}
			:scope .bmh-bar {
				flex: 1;
				min-height: 2px;
				background: var(--bmh-level);
				border-radius: 3px 3px 0 0;
				transition: height .3s ease;
			}
			:scope .bmh-bar-labels {
				display: flex;
				gap: 3px;
				font-size: .65rem;
				color: var(--bmh-muted, #6b7385);
			}
			:scope .bmh-bar-labels span {
				flex: 1;
				text-align: center;
				overflow: hidden;
			}
			:scope .bmh-log {
				list-style: none;
				margin: 0;
				padding: 0;
				max-height: 220px;
				overflow-y: auto;
				font: .78rem/1.45 var(--bmh-mono, ui-monospace, monospace);
			}
			:scope .bmh-log li {
				display: flex;
				gap: .6rem;
			}
			:scope .bmh-log time {
				color: var(--bmh-muted, #6b7385);
				flex: none;
			}
			:scope .bmh-log [data-level="warn"] span {
				color: var(--bmh-warn, #d98a00);
			}
			:scope .bmh-log [data-level="error"] span {
				color: var(--bmh-crit, #d43d4f);
			}
			:scope .bmh-checks {
				list-style: none;
				margin: 0;
				padding: 0;
				display: grid;
				gap: .35rem;
				font-size: .9rem;
			}
			:scope .bmh-checks li {
				display: flex;
				gap: .5rem;
				align-items: center;
			}
			:scope .bmh-checks li::before {
				content: "";
				width: .6rem;
				height: .6rem;
				border-radius: 50%;
				background: var(--bmh-ok, #2f9e66);
				flex: none;
			}
			:scope .bmh-checks li[data-ok="false"]::before {
				background: var(--bmh-crit, #d43d4f);
			}
			:scope .bmh-checks small {
				color: var(--bmh-muted, #6b7385);
			}
			:scope .bmh-table {
				overflow-x: auto;
			}
			:scope table {
				width: 100%;
				border-collapse: collapse;
				font-size: .85rem;
			}
			:scope th {
				text-align: left;
				font-weight: 600;
				color: var(--bmh-muted, #6b7385);
				padding: .25rem .5rem;
			}
			:scope td {
				padding: .25rem .5rem;
				border-top: 1px solid var(--bmh-line, #e3e6ec);
				font-variant-numeric: tabular-nums;
			}
			:scope .bmh-empty {
				color: var(--bmh-muted, #6b7385);
				font-size: .85rem;
			}
		`;
	}

	/** The module config as JSON, for markup. Ignored once `module` is set. */
	@prop()
	accessor config: Signal.State<string> = this.signal("");

	/** The module config. Takes precedence over `config`. */
	@prop()
	accessor module: Signal.State<DashModule | null> = this.signal<DashModule | null>(null);

	/** What the module currently shows. `null` until data arrives. */
	@prop()
	accessor data: Signal.State<ModuleView> = this.signal<ModuleView>(null);

	/** Why the last update failed, or empty. */
	@prop()
	accessor error: Signal.State<string> = this.signal("");

	#mod = this.computed(() => this.module.get() ?? parseConfig(this.config.get()));
	#type = this.computed(() => this.#mod.get()?._type ?? "");

	protected override init() {
		this.addEffect(() => {
			const mod = this.#mod.get();
			if (!mod) return;
			this.dataset.type = mod._type;
			this.dataset.level = levelOf(mod, headline(mod, this.data.get()));
		});
		this.addEffect(() => {
			this.data.get();
			const log = this.refs.log.get();
			if (log) queueMicrotask(() => (log.scrollTop = log.scrollHeight));
		});
	}

	#fmt(value: number | undefined): string {
		return formatValue(value, this.#mod.get()?.format);
	}

	#view<T>(): T | null {
		return this.data.get() as T | null;
	}

	#stat() {
		const mod = this.#mod.get();
		return (
			<div class="bmh-stat">
				<div class="bmh-value">{this.computed(() => this.#fmt(this.#view<StatView>()?.value))}</div>
				{mod?._type === "stat" && mod.sparkline
					? (
						<svg class="bmh-spark" viewBox={`0 0 ${W} 28`} preserveAspectRatio="none">
							<path
								class="bmh-line"
								d={this.computed(() => {
									const h = this.#view<StatView>()?.history ?? [];
									return linePath(h, W, 28, domainOf([h]));
								})}
							/>
						</svg>
					)
					: null}
			</div>
		);
	}

	#gauge() {
		const mod = this.#mod.get() as GaugeModule;
		const arc = "M10 50 A40 40 0 0 1 90 50";
		const dash = this.computed(() => {
			const v = this.#view<{ value: number; min?: number; max?: number }>();
			if (!v) return "0 100";
			const pct = fraction(v.value, v.min ?? mod.min ?? 0, v.max ?? mod.max ?? 100) * 100;
			return `${pct.toFixed(1)} 100`;
		});
		return (
			<div>
				<svg class="bmh-gauge" viewBox="0 0 100 58">
					<path class="bmh-gauge-track" d={arc} />
					<path class="bmh-gauge-fill" d={arc} pathLength="100" stroke-dasharray={dash} />
				</svg>
				<div class="bmh-value bmh-gauge-value">
					{this.computed(() => this.#fmt(this.#view<{ value: number }>()?.value))}
				</div>
			</div>
		);
	}

	#timeseries() {
		return (
			<div>
				<svg class="bmh-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
					{this.computed(() => {
						const series = this.#view<TimeseriesPayload>()?.series ?? [];
						const d = domainOf(series.map((s) => s.points));
						return (
							<g>
								{series.map((s) => (
									<g class="bmh-series" data-series={s.name}>
										<path class="bmh-area" d={areaPath(s.points, W, H, d)} />
										<path class="bmh-line" d={linePath(s.points, W, H, d)} />
									</g>
								))}
							</g>
						);
					})}
				</svg>
				<div class="bmh-legend">
					{this.computed(() =>
						(this.#view<TimeseriesPayload>()?.series ?? []).map((s) => (
							<span class="bmh-series">
								{s.name} <b>{this.#fmt(s.points.at(-1)?.[1])}</b>
							</span>
						))
					)}
				</div>
			</div>
		);
	}

	#histogram() {
		return this.computed(() => {
			const buckets = this.#view<HistogramPayload>()?.buckets ?? [];
			if (!buckets.length) return <p class="bmh-empty">No data yet</p>;
			const max = Math.max(1, ...buckets.map((b) => b.count));
			return (
				<div>
					<div class="bmh-bars">
						{buckets.map((b) => (
							<div
								class="bmh-bar"
								style={`height:${(b.count / max) * 100}%`}
								title={`${b.count}`}
							/>
						))}
					</div>
					<div class="bmh-bar-labels">
						{buckets.map((b) => <span>{b.le === null ? "∞" : compact(b.le)}</span>)}
					</div>
				</div>
			);
		});
	}

	#log() {
		const lines = this.computed(() => this.#view<LogView>()?.lines ?? []);
		return (
			<ol class="bmh-log" ref="log">
				{this.each(
					lines,
					(l) => (
						<li data-level={l.level}>
							<time>{clock(l.t)}</time>
							<span>{l.msg}</span>
						</li>
					),
					(l) => l.seq,
				)}
			</ol>
		);
	}

	#status() {
		return this.computed(() => {
			const checks = this.#view<StatusPayload>()?.checks ?? [];
			if (!checks.length) return <p class="bmh-empty">No checks yet</p>;
			return (
				<ul class="bmh-checks">
					{checks.map((c) => (
						<li data-ok={String(c.ok)}>
							{c.name}
							{c.detail ? <small>{c.detail}</small> : null}
						</li>
					))}
				</ul>
			);
		});
	}

	#table() {
		return this.computed(() => {
			const t = this.#view<TablePayload>();
			if (!t) return <p class="bmh-empty">No data yet</p>;
			return (
				<div class="bmh-table">
					<table>
						<thead>
							<tr>{t.columns.map((c) => <th>{c}</th>)}</tr>
						</thead>
						<tbody>
							{t.rows.map((r) => <tr>{r.map((cell) => <td>{String(cell ?? "")}</td>)}</tr>)}
						</tbody>
					</table>
				</div>
			);
		});
	}

	#body() {
		switch (this.#type.get()) {
			case "stat":
				return this.#stat();
			case "gauge":
				return this.#gauge();
			case "timeseries":
				return this.#timeseries();
			case "histogram":
				return this.#histogram();
			case "log":
				return this.#log();
			case "status":
				return this.#status();
			case "table":
				return this.#table();
			default:
				return <p class="bmh-empty">Unknown module</p>;
		}
	}

	override get template(): JSX.Element {
		return (
			<>
				<div class="bmh-head">
					<span class="bmh-title">{this.computed(() => this.#mod.get()?.title ?? "")}</span>
					<span class="bmh-error">{this.error}</span>
				</div>
				{this.computed(() => this.#body())}
			</>
		);
	}
}
