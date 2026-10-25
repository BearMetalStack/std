import {
	Callout,
	Code,
	CodeGroup,
	type DocContent,
	H2,
	Step,
	Steps,
	Table,
	Term,
} from "@bearmetal/gutenbearg";
import { install } from "./home.tsx";

export const gettingStarted: DocContent = {
	kind: "doc",
	file: "learn/getting-started.md",
	frontmatter: {
		title: "Getting started",
		description: "Install Bramble, scaffold a project and render your first component.",
		package: "core",
		status: "stable",
		since: "0.1",
		updated: "Oct 3, 2026",
	},
	body: () => (
		<>
			<p>
				Bramble runs anywhere modern JavaScript does. You need Deno 2 or Node 20 and a terminal.
			</p>
			<Steps>
				<Step title="Install the package">
					<CodeGroup tabs={install} />
				</Step>
				<Step title="Write a component">
					<p>
						Components are plain functions that return JSX. Any <Term id="signal">signal</Term>{" "}
						they read becomes a live binding.
					</p>
					<Code
						lang="tsx"
						label="app.tsx"
						code={`import { signal, mount } from "@bramble/core";

function Counter() {
  const count = signal(0);
  return <button onClick={() => count.update((n) => n + 1)}>{count}</button>;
}

mount(Counter, document.getElementById("app"));`}
					/>
				</Step>
				<Step title="Start the dev server">
					<Code lang="sh" code="npx bramble dev" />
					<p>Open the printed URL. Edits reload without losing signal state.</p>
				</Step>
			</Steps>
			<Callout type="tip" title="Prefer a template?">
				<p>
					<code>npx create-bramble my-app</code>{" "}
					scaffolds the same project with a router and tests already wired up.
				</p>
			</Callout>

			<H2>Project layout</H2>
			<Code
				lang="txt"
				code={`my-app/
  app.tsx          # entry
  routes/          # one file per route
  bramble.config.ts`}
			/>
			<Table
				head={["File", "Purpose"]}
				rows={[
					[<code>app.tsx</code>, "Mounts the root component"],
					[
						<code>routes/</code>,
						<>
							File-based routes, picked up by <code>@bramble/router</code>
						</>,
					],
					[<code>bramble.config.ts</code>, "Dev server and build options"],
				]}
			/>

			<H2>Next steps</H2>
			<ul>
				<li>
					Learn how updates flow in <a href="/learn/reactivity">Reactivity</a>.
				</li>
				<li>
					Look up every option on <a href="/reference/signal">signal()</a>.
				</li>
				<li>
					See what changed recently in the <a href="/changelog">Changelog</a>.
				</li>
			</ul>
		</>
	),
};
