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
					{ text: "@bearmetal/jsx", link: "/jsx" },
					{ text: "@bearmetal/router", link: "/router/" },
					{ text: "@bearmetal/diecast", link: "/diecast/" },
					{ text: "@bearmetal/forge", link: "/forge" },
					{ text: "@bearmetal/events", link: "/events" },
					{ text: "@bearmetal/sockpuppet", link: "/sockpuppet" },
					{ text: "@bearmetal/den", link: "/den" },
					{ text: "@bearmetal/cli", link: "/cli/" },
					{ text: "@bearmetal/clawmark", link: "/clawmark/" },
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
							{ text: "@components", link: "/component-directory" },
							{ text: "Templates", link: "/templates" },
							{ text: "Lifecycle", link: "/lifecycle" },
							{ text: "Reactivity", link: "/reactivity" },
							{ text: "Props", link: "/props" },
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
						link: "/index",
						collapsed: false,
						items: [
							{ text: "Loading data", link: "/data-loading" },
							{ text: "The render API", link: "/rendering" },
						],
					},
				],
			},
			"/": {
				items: [
					{ text: "@bearmetal/app", link: "/app" },
					{ text: "@bearmetal/jsx", link: "/jsx" },
					{
						text: "@bearmetal/router",
						link: "/router/",
						collapsed: true,
						items: [
							{ text: "Overview", link: "/router/" },
							{ text: "Routing", link: "/router/routing" },
							{ text: "Middleware", link: "/router/middleware" },
							{ text: "RouterContext", link: "/router/context" },
							{ text: "Modules", link: "/router/modules" },
							{ text: "Services", link: "/router/services" },
							{ text: "Request validation", link: "/router/validation" },
							{ text: "Responses", link: "/router/responses" },
							{ text: "Error handling", link: "/router/errors" },
							{
								text: "API contracts",
								link: "/router/api/",
								collapsed: false,
								items: [
									{ text: "Overview", link: "/router/api/" },
									{ text: "Defining", link: "/router/api/defining" },
									{ text: "Server", link: "/router/api/server" },
									{ text: "Client", link: "/router/api/client" },
								],
							},
							{ text: "Static files", link: "/router/static-files" },
							{ text: "Trusted modules", link: "/router/trusted-modules" },
							{ text: "Forager", link: "/router/forager" },
						],
					},
					{
						text: "@bearmetal/diecast",
						link: "/diecast/",
						collapsed: true,
						items: [
							{ text: "Overview", link: "/diecast/" },
							{ text: "Routes", link: "/diecast/routes" },
							{ text: "Manifest", link: "/diecast/manifest" },
							{ text: "Output", link: "/diecast/output" },
							{ text: "Discovery", link: "/diecast/discovery" },
							{ text: "CLI", link: "/diecast/cli" },
							{ text: "Write-through", link: "/diecast/write-through" },
							{ text: "API reference", link: "/diecast/api" },
						],
					},
					{ text: "@bearmetal/forge", link: "/forge" },
					{ text: "@bearmetal/events", link: "/events" },
					{ text: "@bearmetal/sockpuppet", link: "/sockpuppet" },
					{ text: "@bearmetal/den", link: "/den" },
					{
						text: "@bearmetal/cli",
						link: "/cli/",
						collapsed: true,
						items: [
							{ text: "Overview", link: "/cli/" },
							{ text: "Sessions", link: "/cli/sessions" },
							{ text: "Prompts", link: "/cli/prompts" },
							{ text: "Menus", link: "/cli/menus" },
							{ text: "Regions", link: "/cli/regions" },
							{ text: "Custom widgets", link: "/cli/widgets" },
							{ text: "Argument parsing", link: "/cli/args" },
							{ text: "Styling", link: "/cli/styling" },
							{ text: "Tables", link: "/cli/tables" },
							{ text: "Testing", link: "/cli/testing" },
						],
					},
					{
						text: "@bearmetal/clawmark",
						link: "/clawmark/",
						collapsed: true,
						items: [
							{ text: "Overview", link: "/clawmark/" },
							{ text: "Rules", link: "/clawmark/rules" },
							{ text: "Reverse pipeline", link: "/clawmark/reverse" },
							{ text: "Writing", link: "/clawmark/write" },
							{ text: "Document styles", link: "/clawmark/styles" },
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
				],
			},
		},
	},
});
