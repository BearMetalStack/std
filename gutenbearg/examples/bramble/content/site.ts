import type { SiteConfig } from "@bearmetal/gutenbearg";

// Bramble is the design's stand-in library: fictional, but shaped like a real multi-package
// project so every template has something to show.
export const site: SiteConfig = {
	name: "Bramble",
	repository: "https://example.com/bramble",
	editBase: "https://example.com/bramble/edit/main/docs/",
	versions: ["0.9", "0.8", "0.7"],
	packages: [
		{ id: "core", name: "@bramble/core", status: "beta", version: "0.9.2" },
		{
			id: "router",
			name: "@bramble/router",
			status: "stable",
			version: "1.1.0",
			href: "/reference/create-router",
		},
		{
			id: "store",
			name: "@bramble/store",
			status: "alpha",
			version: "0.4.0",
			href: "/reference/create-store",
		},
		{
			id: "cli",
			name: "@bramble/cli",
			status: "alpha",
			version: "0.2.1",
			href: "/learn/deploying",
		},
	],
	shelves: [
		{ id: "start", label: "Start here", icon: "rocket" },
		{ id: "concepts", label: "Concepts", icon: "lightbulb" },
		{ id: "guides", label: "How-to guides", icon: "signpost" },
		{ id: "reference", label: "Reference", icon: "brackets-curly" },
		{ id: "releases", label: "Releases", icon: "git-branch" },
	],
	nav: [
		{
			id: "learn",
			label: "Learn",
			icon: "book-open",
			pages: [
				{ slug: "getting-started", title: "Getting started", shelf: "start", package: "core" },
				{ slug: "reactivity", title: "Reactivity", shelf: "concepts", package: "core" },
				{ slug: "components", title: "Components", shelf: "guides", package: "core", minutes: 7 },
				{ slug: "routing", title: "Routing", shelf: "guides", package: "router", minutes: 9 },
				{
					slug: "data-loading",
					title: "Data loading",
					shelf: "guides",
					package: "router",
					minutes: 6,
					status: "alpha",
				},
				{ slug: "deploying", title: "Deploying", shelf: "guides", package: "cli", minutes: 4 },
			],
		},
		{
			id: "reference",
			label: "Reference",
			icon: "brackets-curly",
			pages: [
				{ slug: "signal", title: "signal()", shelf: "reference", package: "core" },
				{ slug: "computed", title: "computed()", shelf: "reference", package: "core", minutes: 3 },
				{ slug: "effect", title: "effect()", shelf: "reference", package: "core", minutes: 4 },
				{ slug: "batch", title: "batch()", shelf: "reference", package: "core", minutes: 2 },
				{
					slug: "create-router",
					title: "createRouter()",
					shelf: "reference",
					package: "router",
					minutes: 5,
				},
				{
					slug: "create-store",
					title: "createStore()",
					shelf: "reference",
					package: "store",
					minutes: 4,
					status: "alpha",
					isNew: true,
				},
			],
		},
		{
			id: "changelog",
			label: "Changelog",
			icon: "git-branch",
			pages: [{ slug: "", title: "All releases", shelf: "releases" }],
		},
	],
	glossary: {
		signal: {
			term: "Signal",
			definition:
				"A container for one value. Reading it inside a tracked scope subscribes that scope to future writes.",
			href: "/reference/signal",
		},
		computed: {
			term: "Computed",
			definition:
				"A cached, read-only signal derived from other signals. Recomputes lazily when a dependency changes.",
			href: "/reference/computed",
		},
		effect: {
			term: "Effect",
			definition:
				"A function that runs immediately and again whenever a signal it read changes. Used for side effects.",
			href: "/reference/effect",
		},
		batch: {
			term: "Batch",
			definition: "Groups several writes so dependents run once, after the last write.",
			href: "/reference/batch",
		},
		owner: {
			term: "Owner",
			definition:
				"The scope, usually a component, that disposes the effects and computed values created inside it.",
			href: "/learn/reactivity",
		},
	},
};
