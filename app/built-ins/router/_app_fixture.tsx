/**
 * The app under test for `component.test.ts`, written the way a real one would
 * be.
 *
 * It lives in its own file, reached by dynamic import, for one reason: the JSX
 * transform injects its `jsx-runtime` import *above* everything the source
 * writes, and that runtime chooses its client or server half from `typeof
 * document` at evaluation time. A `.tsx` test could therefore never install
 * Slag early enough — the runtime would already have picked the server half.
 * Importing this module dynamically, after the globals are in place, is what
 * makes the client runtime the one that loads.
 *
 * @module
 */

import { BMElement } from "../../BMElement.ts";
import { define } from "../../define.ts";
import type { BMTemplate } from "../../types.ts";
import { Outlet, Route, Router, useParam } from "./Router.ts";
import { Link } from "./Link.tsx";

function Home() {
	return <p class="home">Home</p>;
}

function Shell() {
	return (
		<section class="shell">
			<h1>Settings</h1>
			<Outlet />
		</section>
	);
}

function Profile() {
	return <p class="profile">Profile {useParam("id")}</p>;
}

let counter = 0;

/** Defines a fresh custom element wrapping the router, and returns its tag. */
export function defineApp(): string {
	const tag = `bm-router-test-${++counter}`;

	// Never referenced by name — `@define` registers it as a side effect.
	@define(tag)
	class _App extends BMElement {
		protected override get template(): BMTemplate {
			return (
				<div class="app">
					<nav>
						<Link href="/">Home</Link>
						<Link href="/settings">Settings</Link>
					</nav>
					<Router fallback={() => <p class="missing">Not found</p>}>
						<Route path="/">{() => <Home />}</Route>
						<Route path="/settings" label="Settings">
							{() => <Shell />}
							<Route path="/profile/:id">{() => <Profile />}</Route>
						</Route>
					</Router>
				</div>
			) as unknown as BMTemplate;
		}
	}

	return tag;
}
