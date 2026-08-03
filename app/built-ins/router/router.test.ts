// The DOM here is @bearmetal/slag. The side-effect import must stay first:
// everything below reaches `@bearmetal/jsx/jsx-runtime`, which picks its client
// or server half from `typeof document !== "undefined"` once, at import time.
import "@bearmetal/slag/global";
import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { getCurrentOwner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import type { JSX } from "@bearmetal/jsx/jsx-runtime";
import { Outlet, Route, Router, useParam, useParams, useRoutes } from "./Router.ts";
import { navigate, resetLocationState, setUrl } from "./location.ts";
import type { RouteDescriptor } from "./match.ts";

function at(pathname: string) {
	resetLocationState();
	setUrl(pathname);
}

/** `<Route>`, called the way the client JSX runtime calls it. */
function route(props: Parameters<typeof Route>[0]): RouteDescriptor {
	return Route(props) as unknown as RouteDescriptor;
}

function leaf(text: string): () => JSX.Element {
	return () => {
		const el = document.createElement("div");
		el.textContent = text;
		return el as unknown as JSX.Element;
	};
}

/** Renders a router and reads the element it currently resolves to. */
function render(props: Parameters<typeof Router>[0]) {
	const signal = Router(props) as unknown as { get(): JSX.Element | null };
	return {
		get node(): Element | null {
			return signal.get() as Element | null;
		},
		get text(): string | null {
			return (signal.get() as Element | null)?.textContent ?? null;
		},
	};
}

function fakeOwner() {
	const cleanups: Array<() => void> = [];
	return {
		owner: { registerCleanup: (fn: () => void) => cleanups.push(fn) },
		cleanups,
	};
}

Deno.test("renders the route matching the URL it is created at", () => {
	// The regression this router exists to kill: on a reload there is no
	// navigation event, so a router that only reacts to navigation shows nothing.
	at("/about");
	const view = render({
		children: [
			route({ path: "/", children: leaf("home") }),
			route({ path: "/about", children: leaf("about") }),
		],
	});
	assertEquals(view.text, "about");
});

Deno.test("renders the fallback when nothing matches", () => {
	at("/nowhere");
	const view = render({
		children: [route({ path: "/", children: leaf("home") })],
		fallback: leaf("404"),
	});
	assertEquals(view.text, "404");
});

Deno.test("renders nothing when nothing matches and there is no fallback", () => {
	at("/nowhere");
	const view = render({ children: [route({ path: "/", children: leaf("home") })] });
	assertEquals(view.node, null);
});

Deno.test("swaps the rendered route when the URL changes", () => {
	at("/");
	const view = render({
		children: [
			route({ path: "/", children: leaf("home") }),
			route({ path: "/about", children: leaf("about") }),
		],
	});
	assertEquals(view.text, "home");
	navigate("/about");
	assertEquals(view.text, "about");
	navigate("/");
	assertEquals(view.text, "home");
});

Deno.test("honours a base path", () => {
	at("/app/about");
	const view = render({
		base: "/app",
		children: [route({ path: "/about", children: leaf("about") })],
	});
	assertEquals(view.text, "about");
});

Deno.test("a pinned url prop ignores the live location", () => {
	at("/");
	const view = render({
		url: "/about",
		children: [
			route({ path: "/", children: leaf("home") }),
			route({ path: "/about", children: leaf("about") }),
		],
	});
	assertEquals(view.text, "about");
	navigate("/");
	assertEquals(view.text, "about");
});

Deno.test("nested routes render through <Outlet>", () => {
	at("/settings/profile");
	const shell = () => {
		const el = document.createElement("section");
		el.textContent = "shell:";
		el.appendChild(Outlet() as unknown as Node);
		return el as unknown as JSX.Element;
	};
	const view = render({
		children: [
			route({
				path: "/settings",
				children: [shell, route({ path: "/profile", children: leaf("profile") })],
			}),
		],
	});
	assertEquals(view.text, "shell:profile");
});

Deno.test("<Outlet> renders nothing at the end of the chain", () => {
	at("/settings");
	const shell = () => {
		const el = document.createElement("section");
		el.textContent = "shell";
		const nested = Outlet();
		if (nested) el.appendChild(nested as unknown as Node);
		return el as unknown as JSX.Element;
	};
	const view = render({
		children: [
			route({
				path: "/settings",
				children: [shell, route({ path: "/profile", children: leaf("profile") })],
			}),
		],
	});
	assertEquals(view.text, "shell");
});

Deno.test("a params-only navigation keeps the rendered tree and updates useParams", () => {
	at("/users/1");
	let renders = 0;
	let id: { get(): string | undefined } | undefined;
	const view = render({
		children: [
			route({
				path: "/users/:id",
				children: () => {
					renders++;
					id = useParam("id");
					const el = document.createElement("div");
					el.textContent = "user";
					return el as unknown as JSX.Element;
				},
			}),
		],
	});

	const first = view.node;
	assertEquals(renders, 1);
	assertEquals(id?.get(), "1");

	navigate("/users/2");
	assertStrictEquals(view.node, first, "the route did not change, so its tree should survive");
	assertEquals(renders, 1);
	assertEquals(id?.get(), "2");
});

Deno.test("useParams exposes params from the whole matched chain", () => {
	at("/orgs/bearmetal/repos/app");
	let params: { get(): Record<string, string> } | undefined;
	const view = render({
		children: [
			route({
				path: "/orgs/:org",
				children: [
					() => {
						const el = document.createElement("div");
						el.appendChild(Outlet() as unknown as Node);
						return el as unknown as JSX.Element;
					},
					route({
						path: "/repos/:repo",
						children: () => {
							params = useParams();
							return leaf("repo")();
						},
					}),
				],
			}),
		],
	});
	view.node;
	assertEquals(params?.get(), { org: "bearmetal", repo: "app" });
});

Deno.test("useRoutes exposes the declared route tree", () => {
	at("/");
	let chains: readonly { pattern: string }[] = [];
	const view = render({
		children: [
			route({
				path: "/",
				children: () => {
					chains = useRoutes();
					return leaf("home")();
				},
			}),
			route({ path: "/about", label: "About", children: leaf("about") }),
		],
	});
	view.node;
	assertEquals(chains.map((c) => c.pattern), ["/", "/about"]);
});

Deno.test("route metadata rides along on the descriptor", () => {
	const descriptor = route({
		path: "/about",
		label: "About",
		icon: "info",
		hidden: true,
		children: leaf("about"),
	});
	assertEquals(descriptor.meta, { label: "About", icon: "info", hidden: true });
});

Deno.test("leaving a route runs the cleanups registered while it rendered", () => {
	at("/a");
	const { owner, cleanups } = fakeOwner();
	let disposed = 0;

	const previous = getCurrentOwner();
	setCurrentOwner(owner);
	let view: ReturnType<typeof render>;
	try {
		view = render({
			children: [
				route({
					path: "/a",
					children: () => {
						getCurrentOwner()?.registerCleanup(() => disposed++);
						return leaf("a")();
					},
				}),
				route({ path: "/b", children: leaf("b") }),
			],
		});
		assertEquals(view.text, "a");
	} finally {
		setCurrentOwner(previous);
	}

	assertEquals(disposed, 0);
	navigate("/b");
	assertEquals(view.text, "b");
	assertEquals(disposed, 1, "the departed route's cleanup should have run");
	assert(cleanups.length > 0, "the router should register its teardown with the owner");
});

Deno.test("a child that is neither a renderer nor a <Route> warns and is dropped", () => {
	const warn = console.warn;
	const warnings: string[] = [];
	console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
	try {
		const descriptor = route({
			path: "/x",
			children: ["stray text", leaf("x")] as unknown as JSX.Children,
		});
		assert(descriptor.render, "the render function should still be picked up");
		assertEquals(descriptor.children.length, 0);
	} finally {
		console.warn = warn;
	}
	assertEquals(warnings.length, 1);
	assert(warnings[0].includes("{() => <Thing />}"));
});
