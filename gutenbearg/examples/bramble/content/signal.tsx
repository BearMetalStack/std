import {
	Badge,
	Callout,
	Code,
	type DocContent,
	H2,
	Signature,
	Table,
	Term,
} from "@bearmetal/gutenbearg";

export const signal: DocContent = {
	kind: "doc",
	file: "reference/signal.md",
	frontmatter: {
		title: "signal()",
		description: "Create a reactive value that notifies its subscribers when it changes.",
		package: "core",
		status: "beta",
		since: "0.6",
		updated: "Sep 28, 2026",
		source: "packages/core/src/signal.ts",
	},
	body: () => (
		<>
			<Signature
				source="packages/core/src/signal.ts"
				href="https://example.com/bramble/blob/main/packages/core/src/signal.ts"
				code="function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>"
			/>

			<H2>Parameters</H2>
			<Table
				head={["Name", "Type", "Default", "Description"]}
				rows={[
					[<code>initial</code>, <code>T</code>, "—", "The starting value."],
					[
						<code>options.equals</code>,
						<code>((a: T, b: T) =&gt; boolean) | false</code>,
						<code>Object.is</code>,
						<>
							Decides whether a write notifies. <code>false</code> always notifies.
						</>,
					],
					[
						<code>options.name</code>,
						<code>string</code>,
						"—",
						<>
							Label shown in devtools and in <code>CycleError</code> messages.
						</>,
					],
				]}
			/>

			<H2>Returns</H2>
			<p>
				A <code>Signal&lt;T&gt;</code>: a function you call to read, with these members attached.
			</p>
			<Table
				head={["Member", "Type", "Description"]}
				rows={[
					[<code>()</code>, <code>T</code>, "Read the value and subscribe the current scope."],
					[<code>.peek()</code>, <code>T</code>, "Read without subscribing."],
					[<code>.set(value)</code>, <code>void</code>, "Replace the value."],
					[
						<code>.update(fn)</code>,
						<code>void</code>,
						<>
							Replace the value with <code>fn(current)</code>.
						</>,
					],
					[
						<code>.subscribe(fn)</code>,
						<code>() =&gt; void</code>,
						"Listen outside a tracked scope. Returns an unsubscribe function.",
					],
				]}
			/>

			<H2>Example</H2>
			<Code
				lang="ts"
				code={`import { signal, effect } from "@bramble/core";

const user = signal({ name: "Ada" }, { name: "user", equals: false });

effect(() => console.log(user().name));

user.update((u) => { u.name = "Grace"; return u; }); // logs "Grace"`}
			/>

			<H2>Behaviour</H2>
			<ul>
				<li>
					Writes are synchronous. Subscribers run before <code>.set()</code> returns, unless inside
					{" "}
					<Term id="batch">batch</Term>.
				</li>
				<li>
					Reading a signal inside its own <Term id="effect">effect</Term>{" "}
					and writing it there throws <code>CycleError</code> after 100 runs.
				</li>
				<li>
					Signals are not deep. Mutating an object in place does nothing unless you write it back.
				</li>
			</ul>
			<Callout
				type="info"
				title={
					<>
						Renamed in 0.6 <Badge tone="warn">deprecated alias</Badge>
					</>
				}
			>
				<p>
					<code>createSignal</code> is still exported as an alias for <code>signal</code>{" "}
					and will be removed in 1.0.
				</p>
			</Callout>

			<H2>See also</H2>
			<ul>
				<li>
					<a href="/learn/reactivity">Reactivity guide</a>{" "}
					for how signals fit with computed values and effects.
				</li>
				<li>
					<a href="/reference/computed">computed()</a> for derived values.
				</li>
			</ul>
		</>
	),
};
