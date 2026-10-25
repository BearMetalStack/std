import type { Signal } from "@bearmetal/app/signals";
import { BMElement, define, prop } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";
import type { DashModule } from "../types.ts";
import { type Incoming, reduce } from "../reduce.ts";
import type { BmhModule } from "./module.tsx";

const METRICS = "/@bearmetal/health/m";

interface Subscriber {
	data: (payload: unknown) => void;
	state: (live: boolean) => void;
}

/**
 * One EventSource per app for every built-in metric on the page. Subscriptions made in the same
 * tick share a single (re)connection.
 */
class MetricMux {
	static #all = new Map<string, MetricMux>();

	static for(origin: string, token: string): MetricMux {
		const key = `${origin} ${token}`;
		let mux = MetricMux.#all.get(key);
		if (!mux) MetricMux.#all.set(key, mux = new MetricMux(origin, token));
		return mux;
	}

	#subs = new Map<string, Set<Subscriber>>();
	#es?: EventSource;
	#scheduled = false;

	private constructor(readonly origin: string, readonly token: string) {}

	subscribe(name: string, sub: Subscriber): () => void {
		let set = this.#subs.get(name);
		if (!set) this.#subs.set(name, set = new Set());
		set.add(sub);
		this.#reconnect();
		return () => {
			set.delete(sub);
			if (!set.size) {
				this.#subs.delete(name);
				this.#reconnect();
			}
		};
	}

	#reconnect() {
		if (this.#scheduled) return;
		this.#scheduled = true;
		queueMicrotask(() => {
			this.#scheduled = false;
			this.#es?.close();
			this.#es = undefined;
			const names = [...this.#subs.keys()];
			if (!names.length) return;
			const url = new URL(METRICS, this.origin);
			url.searchParams.set("stream", "");
			url.searchParams.set("names", names.join(","));
			if (this.token) url.searchParams.set("token", this.token);
			const es = this.#es = new EventSource(url);
			const each = (fn: (s: Subscriber) => void) => this.#subs.forEach((set) => set.forEach(fn));
			es.onopen = () => each((s) => s.state(true));
			es.onerror = () => each((s) => s.state(false));
			for (const name of names) {
				es.addEventListener(name, (e) => {
					const payload = JSON.parse((e as MessageEvent).data);
					this.#subs.get(name)?.forEach((s) => s.data(payload));
				});
			}
		});
	}
}

/**
 * Fetches data for the `<bmh-module>` inside it, straight from the app: polls a `static` source,
 * or subscribes to an `sse` source (after a best-effort JSON backfill). Sources resolve against
 * `base`, which defaults to the page's own origin.
 *
 * Sets `data-state` to `loading`, `live`, or `error` on itself and the module.
 *
 * @example
 * ```html
 * <bmh-feed token="s3cret"><bmh-module config='{...}'></bmh-module></bmh-feed>
 * ```
 */
@define("bmh-feed")
export class BmhFeed extends BMElement {
	static override get stylesheet(): string {
		return css`
			:scope {
				display: contents;
			}
		`;
	}

	/** Origin the module's `source` is resolved against. */
	@prop()
	accessor base: Signal.State<string> = this.signal("");

	/** Sent as `?token=` so the requests pass `healthModule`'s gate. */
	@prop()
	accessor token: Signal.State<string> = this.signal("");

	protected override init() {
		queueMicrotask(() => this.#start());
	}

	#start() {
		if (!this.isConnected) return;
		const el = this.querySelector("bmh-module") as BmhModule | null;
		if (!el) return;
		let mod: DashModule;
		try {
			mod = el.module.get() ?? JSON.parse(el.config.get());
		} catch {
			el.error.set("Invalid module config");
			return;
		}
		const url = new URL(mod.source, this.base.get() || location.href);
		if (this.token.get()) url.searchParams.set("token", this.token.get());

		const setState = (state: "loading" | "live" | "error", error = "") => {
			this.dataset.state = el.dataset.state = state;
			el.error.set(error);
		};
		const apply = (payload: unknown, kind: Incoming) => {
			const result = reduce(mod, el.data.get(), payload, kind);
			if (result.ok) {
				el.data.set(result.view);
				setState("live");
			} else {
				setState("error", result.error);
			}
		};
		setState("loading");

		const abort = new AbortController();
		const fetchJson = async (): Promise<unknown> => {
			const res = await fetch(url, {
				headers: { accept: "application/json" },
				signal: abort.signal,
			});
			if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
				await res.body?.cancel();
				throw new Error(res.ok ? "Not JSON" : `${res.status} ${res.statusText}`);
			}
			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
			return await res.json();
		};

		if (mod.sourceType === "static") {
			const poll = () =>
				fetchJson().then((p) => apply(p, "snapshot")).catch((e) => {
					if (!abort.signal.aborted) setState("error", String(e?.message ?? e));
				});
			poll();
			const id = mod.pollInterval ? setInterval(poll, mod.pollInterval) : undefined;
			this.#onDisconnect(() => {
				clearInterval(id);
				abort.abort();
			});
			return;
		}

		let streaming = false;
		fetchJson().then((p) => streaming || apply(p, "snapshot")).catch(() => {});

		if (url.pathname.startsWith(`${METRICS}/`)) {
			const unsubscribe = MetricMux.for(url.origin, this.token.get()).subscribe(
				url.pathname.slice(METRICS.length + 1),
				{
					data: (payload) => {
						streaming = true;
						apply(payload, "event");
					},
					state: (live) => live || setState("loading", "Reconnecting…"),
				},
			);
			this.#onDisconnect(() => {
				unsubscribe();
				abort.abort();
			});
			return;
		}

		const es = new EventSource(url);
		es.onmessage = (e) => {
			streaming = true;
			try {
				apply(JSON.parse(e.data), "event");
			} catch {
				setState("error", "Malformed event");
			}
		};
		es.onerror = () =>
			setState(es.readyState === EventSource.CLOSED ? "error" : "loading", "Reconnecting…");
		this.#onDisconnect(() => {
			es.close();
			abort.abort();
		});
	}

	/** An effect that reads nothing runs once, and its cleanup runs on disconnect. */
	#onDisconnect(fn: () => void): void {
		this.addEffect(() => fn);
	}
}
