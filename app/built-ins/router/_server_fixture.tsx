/** Views for `server.test.ts`. Separate because the test file is `.ts`. */

import { Outlet, Route, Router } from "./Router.ts";

export function Basic() {
	return (
		<Router fallback={() => <p>404</p>}>
			<Route path="/">{() => <p>home</p>}</Route>
			<Route path="/about">{() => <p>about</p>}</Route>
		</Router>
	);
}

export function Nested() {
	return (
		<Router>
			<Route path="/settings">
				{() => (
					<section>
						<Outlet />
					</section>
				)}
				<Route path="/profile">{() => <p>profile</p>}</Route>
			</Route>
		</Router>
	);
}

/** An explicit `url` prop, which should win over whatever the render is for. */
export function Pinned() {
	return (
		<Router url="/">
			<Route path="/">{() => <p>home</p>}</Route>
			<Route path="/about">{() => <p>about</p>}</Route>
		</Router>
	);
}
