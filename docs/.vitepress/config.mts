// deno-lint-ignore no-import-prefix no-unversioned-import
import { defineConfig } from "npm:vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: "BearMetal",
	description: "Documentation for the BearMetal stack",
	head: [
		["link", { rel: "icon", href: "https://cdn.bear-metal.dev/resources/images/bmicon.svg" }],
	],
	themeConfig: {
		logo: "https://cdn.bear-metal.dev/resources/images/bmicon.svg",

		nav: [
			{ text: "Home", link: "/" },
			{ text: "Get Started", link: "/getting-started" },
			{
				text: "Packages",
				items: [
					{ text: "@bearmetal/app", link: "/app" },
					{ text: "@bearmetal/router", link: "/router" },
					{ text: "@bearmetal/forge", link: "/forge" },
					{ text: "@bearmetal/events", link: "/events" },
					{ text: "@bearmetal/sockpuppet", link: "/sockpuppet" },
					{ text: "@bearmetal/clawmark", link: "/clawmark/" },
					{ text: "@bearmetal/den", link: "/den" },
				],
			},
		],

		sidebar: {
			"/getting-started/": {
				base: "getting-started",
				items: [
					{ text: "Quick Start", link: "/quickstart" },
					{
						text: "Components",
						base: "getting-started/components",
						link: "/index",
						collapsed: false,
						items: [
							{ text: "/components", link: "/component-directory" },
							{ text: "Templates", link: "/templates" },
							{ text: "Lifecycle", link: "/lifecycle" },
							{ text: "Reactivity", link: "/reactivity" },
							{ text: "DOM refs", link: "/dom-refs" },
							{ text: "List Rendering", link: "/lists" },
						],
					},
					{
						text: "Interactivity",
						base: "getting-started/interactivity",
						link: "/interactivity",
						collapsed: false,
						items: [
							{ text: "banana", link: "/bananas" },
						],
					},
					{
						text: "SSR",
						base: "getting-started/ssr",
						link: "/ssr",
						collapsed: false,
						items: [
							{ text: "banana", link: "/bananas" },
						],
					},
				],
			},
			// The package reference. A package is either a single page
			// (`{ text, link }`) or, once it outgrows one, a collapsed group whose
			// `link` is its overview and whose `items` are its sub-pages - see
			// clawmark below. Either way every package keeps an entry here, so the
			// full package list stays visible from anywhere in the reference.
			//
			// No `base` on purpose: vitepress concatenates `base + link`, so a
			// base of "/" would turn "/app" into the protocol-relative "//app".
			"/": {
				items: [
					{ text: "@bearmetal/app", link: "/app" },
					{ text: "@bearmetal/router", link: "/router" },
					{ text: "@bearmetal/forge", link: "/forge" },
					{ text: "@bearmetal/events", link: "/events" },
					{ text: "@bearmetal/sockpuppet", link: "/sockpuppet" },
					{
						text: "@bearmetal/clawmark",
						link: "/clawmark/",
						collapsed: true,
						items: [
							{ text: "Overview", link: "/clawmark/" },
							{ text: "Rules", link: "/clawmark/rules" },
							{ text: "Reverse pipeline", link: "/clawmark/reverse" },
							{ text: "Writing", link: "/clawmark/write" },
							{ text: "Profile DSL", link: "/clawmark/dsl" },
							{
								text: "Profiles",
								collapsed: false,
								items: [
									{ text: "HTML", link: "/clawmark/profiles/html" },
									{ text: "docx", link: "/clawmark/profiles/docx" },
									{ text: "odt", link: "/clawmark/profiles/odt" },
								],
							},
							{ text: "XML parser", link: "/clawmark/xml" },
							{ text: "API reference", link: "/clawmark/api" },
						],
					},
					{ text: "@bearmetal/den", link: "/den" },
				],
			},
		},
	},
});
