import type { ChangelogContent } from "@bearmetal/gutenbearg";

export const changelog: ChangelogContent = {
	kind: "changelog",
	file: "changelog.md",
	frontmatter: {
		title: "Changelog",
		description: "Every release across the Bramble packages, newest first.",
		updated: "Oct 18, 2026",
	},
	releases: () => [
		{
			version: "0.9.2",
			date: "Oct 18, 2026",
			changes: [
				{
					type: "fixed",
					package: "core",
					text: (
						<>
							Effects created inside <code>untrack</code> no longer subscribe their parent.
						</>
					),
				},
				{
					type: "fixed",
					package: "router",
					text: <>Trailing slashes match the same route as the bare path.</>,
				},
				{
					type: "added",
					package: "cli",
					text: (
						<>
							<code>bramble dev --open</code> opens the browser after the first build.
						</>
					),
				},
			],
		},
		{
			version: "0.9.0",
			date: "Oct 2, 2026",
			changes: [
				{
					type: "breaking",
					package: "core",
					text: (
						<>
							<code>effect</code>{" "}
							now runs synchronously on creation. Code that relied on a microtask delay should use
							{" "}
							<code>queueMicrotask</code>.
						</>
					),
				},
				{
					type: "added",
					package: "store",
					text: (
						<>
							First alpha of <code>createStore()</code> for nested reactive objects.
						</>
					),
				},
				{
					type: "changed",
					package: "core",
					text: (
						<>
							<code>CycleError</code> messages include the signal <code>name</code>.
						</>
					),
				},
				{
					type: "deprecated",
					package: "core",
					text: (
						<>
							<code>createSignal</code> is now an alias for <code>signal</code>.
						</>
					),
				},
			],
		},
		{
			version: "0.8.4",
			date: "Sep 9, 2026",
			changes: [
				{ type: "fixed", package: "router", text: <>Loaders no longer run twice on hydration.</> },
				{
					type: "changed",
					package: "cli",
					text: <>Build output is 12% smaller with the new minifier defaults.</>,
				},
			],
		},
		{
			version: "0.8.0",
			date: "Aug 20, 2026",
			changes: [
				{
					type: "added",
					package: "router",
					text: <>Typed route params inferred from the path string.</>,
				},
				{
					type: "added",
					package: "core",
					text: (
						<>
							<code>onCleanup</code> works inside <code>computed</code>.
						</>
					),
				},
				{
					type: "breaking",
					package: "router",
					text: (
						<>
							<code>useParams()</code> returns signals instead of plain values.
						</>
					),
				},
			],
		},
		{
			version: "0.7.1",
			date: "Jul 30, 2026",
			changes: [
				{
					type: "fixed",
					package: "core",
					text: <>Memory leak when a keyed list removed its last item.</>,
				},
			],
		},
	],
};
