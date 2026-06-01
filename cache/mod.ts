import { isModification, Module } from "@bearmetal/router";
import { escapeRegex, isDev } from "@bearmetal/miscellanea";

let inMem: Map<string, unknown>;

type CacheKey = string;
interface CacheProvider {
	has: (key: CacheKey) => boolean | Promise<boolean>;
	get: (key: CacheKey) => unknown | Promise<unknown>;
	set: (key: CacheKey, value: unknown) => void;
	delete: (key: CacheKey) => void;
	invalidateByPattern?: (pattern: RegExp) => void | Promise<void>;
}

function inMemoryCache(): CacheProvider {
	if (!inMem) inMem = new Map();
	return inMem;
}

type CacheOptions =
	& {
		gzip?: boolean; // currently a no-op
		devInMem?: boolean;
	}
	& ({
		provider: "in-memory";
	} | {
		provider: "redis";
		redisUrl?: string;
		redisPassword?: string;
		redisUsername?: string;
	});

function connectProvider(_options: CacheOptions): CacheProvider {
	throw new Error("not implemented, please use in-mem cache");
}

export class Cache implements CacheProvider {
	private provider: CacheProvider;
	constructor(private options: CacheOptions) {
		if (
			this.options.provider === "in-memory" ||
			(this.options.devInMem && isDev())
		) {
			this.provider = inMemoryCache();
		} else {
			this.provider = connectProvider(this.options);
		}
	}
	async has(key: CacheKey) {
		return await this.provider.has(key);
	}
	async get(key: CacheKey) {
		return await this.provider.get(key);
	}
	set(key: CacheKey, value: unknown) {
		this.provider.set(key, value);
	}
	delete(key: CacheKey) {
		this.provider.delete(key);
	}

	async getOrNull<T = unknown>(key: CacheKey): Promise<T | null> {
		return await this.provider.get(key) as T ?? null;
	}

	async invalidate(keyOrPattern: string | RegExp) {
		if (keyOrPattern instanceof RegExp) {
			if (this.provider instanceof Map) {
				for (const key of this.provider.keys()) {
					if (keyOrPattern.test(key)) {
						this.provider.delete(key);
					}
				}
				return;
			}
			await this.provider.invalidateByPattern?.(keyOrPattern);
		} else {
			this.provider.delete(keyOrPattern);
		}
	}
}

export function cacheModule(
	opts: CacheOptions,
	ignoredRoutes: (string | URLPattern)[] = [],
): Module {
	const cache = new Cache(opts);
	const mod = new Module();
	ignoredRoutes = ignoredRoutes.map((n) => n instanceof URLPattern ? n : new URLPattern(n));
	mod.route("/.*")
		.get(async (ctx, next) => {
			const pathname = ctx.url.pathname;
			if (ignoredRoutes.some((p) => (p as URLPattern).test(pathname, ctx.url.origin))) {
				return await next();
			}
			const cacheKey = pathname + ctx.url.search;
			const cached = await cache.getOrNull<Response>(cacheKey);
			if (cached) {
				return cached.clone();
			}
			const res = await next();
			const cachedRes = res.clone();
			cache.set(cacheKey, cachedRes);
			return res;
		})
		.use(async (ctx, next) => {
			if (!isModification(ctx)) return await next();
			const res = await next();
			if (!res.ok) return res;
			const pathname = ctx.url.pathname;
			cache.invalidate(new RegExp(`^${escapeRegex(pathname)}`));
			return res;
		});
	return mod;
}
