import { Callout, Code, Diagram, type DocContent, H2, Table, Term } from "@bearmetal/gutenbearg";

export const reactivity: DocContent = {
	kind: "doc",
	file: "learn/reactivity.md",
	frontmatter: {
		title: "Reactivity",
		description:
			"How signals, computed values and effects keep your UI in sync without a virtual DOM.",
		package: "core",
		status: "beta",
		since: "0.6",
		updated: "Oct 12, 2026",
	},
	body: () => (
		<>
			<H2>The mental model</H2>
			<p>
				Bramble tracks reads, not renders. When a component reads a{" "}
				<Term id="signal">signal</Term>, Bramble records the dependency. When the signal changes,
				only the code that read it runs again. There is no diffing step and no component re-render.
			</p>
			<Diagram chains="signal -[write]-> computed -[read]-> effect -> DOM" />
			<p>That chain is the whole system. Everything else on this page is a variation on it.</p>

			<H2>Signals</H2>
			<p>
				A signal holds one value. Call it to read; call <code>.set()</code> to write.
			</p>
			<Code
				lang="ts"
				code={`import { signal } from "@bramble/core";

const count = signal(0);

count();          // 0
count.set(1);
count.update((n) => n + 1);`}
			/>
			<Callout type="tip" title="Reads are subscriptions">
				<p>
					Calling <code>count()</code> inside a component, a <Term id="computed">computed</Term>
					{" "}
					or an <Term id="effect">effect</Term> subscribes that scope. Reading with{" "}
					<code>count.peek()</code> returns the value without subscribing.
				</p>
			</Callout>
			<p>
				Signals compare with <code>Object.is</code>{" "}
				by default, so setting the same value twice notifies nobody. Pass <code>equals: false</code>
				{" "}
				when you store a mutable object and want every write to propagate.
			</p>

			<H2>Derived values</H2>
			<p>
				A <Term id="computed">computed</Term>{" "}
				is a signal whose value comes from other signals. It is lazy: nothing runs until something
				reads it, and it caches until a dependency changes.
			</p>
			<Code
				lang="ts"
				code={`const price = signal(40);
const qty = signal(3);
const total = computed(() => price() * qty());`}
			/>
			<Table
				head={["Primitive", "Holds state", "Runs eagerly", "Writable"]}
				rows={[
					[<code>signal</code>, "Yes", "—", "Yes"],
					[<code>computed</code>, "Cached", "No", "No"],
					[<code>effect</code>, "No", "Yes", "Through signals"],
				]}
			/>

			<H2>Effects</H2>
			<p>
				An <Term id="effect">effect</Term>{" "}
				runs once immediately, then again whenever anything it read changes. Use effects for the
				edges of your app: DOM APIs, logging, network calls. Return a function to clean up before
				the next run.
			</p>
			<Code
				lang="ts"
				code={`effect(() => {
  const id = setInterval(tick, interval());
  return () => clearInterval(id);
});`}
			/>
			<Callout type="warning" title="Don't write the signal you read">
				<p>
					An effect that sets a signal it also reads will loop. Bramble stops after 100 iterations
					and throws <code>CycleError</code>. Move the derived value into a <code>computed</code>
					{" "}
					instead.
				</p>
			</Callout>

			<H2>Batching</H2>
			<p>
				Every <code>.set()</code>{" "}
				notifies subscribers synchronously. When you update several signals together, wrap the
				writes in <Term id="batch">batch</Term> so dependents run once with the final values.
			</p>
			<Code
				lang="ts"
				code={`batch(() => {
  first.set("Ada");
  last.set("Lovelace");
});`}
			/>
			<p>
				Event handlers attached through Bramble's JSX are batched automatically. You only need{" "}
				<code>batch</code> in timers, sockets and other callbacks Bramble doesn't own.
			</p>
			<Diagram
				chains={`set(first) -> queue
set(last) -> queue -[flush]-> effects run once`}
			/>

			<H2>Ownership and cleanup</H2>
			<p>
				Every effect and computed belongs to an{" "}
				<Term id="owner">owner</Term>, usually the component that created it. When the owner
				unmounts, everything it owns is disposed. This is why effects inside components never leak.
			</p>
			<ul>
				<li>Effects created at module scope have no owner and live forever.</li>
				<li>
					<code>createRoot(fn)</code> creates a detached owner you dispose yourself.
				</li>
				<li>
					<code>onCleanup(fn)</code> registers teardown on the current owner.
				</li>
			</ul>
			<Callout type="danger" title="Async boundaries lose the owner">
				<p>
					Code after an <code>await</code>{" "}
					runs outside the owner that started it. Capture it first with <code>getOwner()</code>{" "}
					and restore it with <code>runWithOwner()</code>.
				</p>
			</Callout>

			<H2>Common pitfalls</H2>
			<ol>
				<li>
					<strong>Destructuring props.</strong> <code>const {"{ name }"} = props</code>{" "}
					reads once. Read <code>props.name</code> where you use it.
				</li>
				<li>
					<strong>Reading outside a scope.</strong>{" "}
					A signal read outside any tracked scope is a plain value and never updates.
				</li>
				<li>
					<strong>Storing derived state.</strong>{" "}
					If it can be computed from other signals, make it a <code>computed</code>.
				</li>
			</ol>
			<p>
				The full option list for each primitive lives in the reference, starting with{" "}
				<a href="/reference/signal">signal()</a>.
			</p>
		</>
	),
};
