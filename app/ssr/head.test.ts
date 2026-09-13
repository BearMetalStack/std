import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assertEquals } from "@std/assert";
import {
	contributeHead,
	contributeRouteHead,
	hasHeadContributors,
	headContributions,
	routeHeadContributions,
} from "./head.ts";

const fixture = await import("./_head_fixture.tsx");

Deno.test("headContributions flattens iterables and skips null/undefined", () => {
	const unregisterA = contributeHead(() => fixture.meta("a", "1"));
	const unregisterB = contributeHead(() => [fixture.meta("b", "1"), fixture.meta("b", "2")]);
	const unregisterC = contributeHead(() => null);
	try {
		const nodes = headContributions();
		assertEquals(nodes.length, 3);
	} finally {
		unregisterA();
		unregisterB();
		unregisterC();
	}
});

Deno.test("a throwing contributor is skipped, not fatal", () => {
	const unregisterBad = contributeHead(() => {
		throw new Error("boom");
	});
	const unregisterGood = contributeHead(() => fixture.meta("good", "1"));
	try {
		const nodes = headContributions();
		assertEquals(nodes.length, 1);
	} finally {
		unregisterBad();
		unregisterGood();
	}
});

Deno.test("unregistering a contributor stops it from contributing", () => {
	const unregister = contributeHead(() => fixture.meta("x", "1"));
	unregister();
	assertEquals(headContributions().length, 0);
});

Deno.test("hasHeadContributors reflects registration state", () => {
	assertEquals(hasHeadContributors(), false);
	const unregister = contributeHead(() => null);
	try {
		assertEquals(hasHeadContributors(), true);
	} finally {
		unregister();
	}
});

Deno.test("routeHeadContributions passes the route through to every contributor", () => {
	const seen: (string | undefined)[] = [];
	const unregister = contributeRouteHead((route) => {
		seen.push(route);
		return null;
	});
	try {
		routeHeadContributions("/users/:id");
		routeHeadContributions(undefined);
		assertEquals(seen, ["/users/:id", undefined]);
	} finally {
		unregister();
	}
});
