import { CodeGroup, Features, type HomeContent } from "@bearmetal/gutenbearg";

export const install = [
	{ label: "deno", lang: "sh", code: "deno add jsr:@bramble/core" },
	{ label: "npm", lang: "sh", code: "npm install @bramble/core" },
	{ label: "pnpm", lang: "sh", code: "pnpm add @bramble/core" },
];

export const home: HomeContent = {
	kind: "home",
	frontmatter: {
		name: "Bramble",
		text: "Small reactive pieces for the web",
		tagline:
			"Signals, components and a router in under 9 kB. No virtual DOM, no build step required.",
		badge: "v0.9.2 · beta",
		primary: { label: "Get started", href: "/learn/getting-started" },
		secondary: { label: "Read the reactivity guide", href: "/learn/reactivity" },
	},
	body: () => (
		<>
			<CodeGroup tabs={install} />
			<Features
				items={[
					{
						icon: "lightning",
						title: "Fine-grained updates",
						text: "Only the text node that read a signal changes. Nothing else re-runs.",
					},
					{
						icon: "tree-structure",
						title: "Ownership built in",
						text: "Effects are disposed with the component that created them, so leaks are opt-in.",
					},
					{
						icon: "path",
						title: "A router that types itself",
						text: "Route params and loaders are inferred from the path string.",
					},
					{
						icon: "terminal-window",
						title: "One CLI",
						text: (
							<>
								Scaffold, serve, test and build with a single <code>bramble</code> command.
							</>
						),
					},
				]}
			/>
		</>
	),
};
