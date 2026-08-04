---
next:
    text: "Props"
    link: "./props"
prev:
    text: "DOM refs"
    link: "./dom-refs"
---

# List Rendering

There are two acceptable methods of rendering lists, but both have substantial and known drawbacks
at this time.

## Static Lists

If a list's content does not change, you can use a simple `.map()` as you would with normal JSX.
This is acceptable and frequently the correct choice.

```tsx
const list = ["Chicken", "Beef", "Pork", "Dairy", "Eggs"];

return (
	<>
		<h1>Things I cannot eat</h1>
		<ul>
			{list.map((item) => (
				<li>{item}</li>
			))}
		</ul>
	</>
);
```

It's worth noting that `.map` will not reactively update if `list` is a signal getter. You can
derive a static list from a signal using a computed signal, but that will force the entire list to
render each time the list changes.

## Reactive Lists via Signals

`@bearmetal/app` exposes a helper function called `each` (also provided as
`BMElement.prototype.each`). This takes in a signal and two callbacks, the first to render the item,
the second to get a unique key for that item.

```tsx
import { createSignal, each } from "@bearmetal/app";

function foods(item: string) {
	const foods = createSignal(["Chicken", "Beef", "Pork", "Dairy", "Eggs"]);

	return (
		<>
			<h1>Foods that I will absolutely eat anyway</h1>
			<ul>
				{each(
					list,
					(item) => (
						<li>{item}</li>
					),
					(item) => item,
				)}
			</ul>
		</>
	);
}
```

### Keys

::: tip Why a separate callback for the key? Keys are crucial for performant rendering. When a
reference changes, the key steps in to say "I am still the same item" which allows us to reuse
existing nodes instead of tearing them down and starting fresh.

I found it was best to enforce key use by explicitly requiring the second callback. It's an easy and
mindful way of remembering the key. :::

`each` does some very shallow diffing of the current DOM, which should prevent massive re-renders of
content when the list changes, however it cannot easily diff deep changes in list objects, so keep
that in mind.

#### What NOT to do

Something like this would likely not be great for performance:

```tsx
function ListExploder({ list }) {
	if (!Array.isArray(list) && typeof list === "object") {
		return ListExploder({ list: Object.values(list) });
	}
	if (typeof list === "string" || typeof list === "number") {
		if (String(list).length === 1) {
			return <li>{list}</li>;
		}
		return ListExploder({ list: String(list) });
	}
	if (Array.isArray(list)) {
		return <ul>{list.map((item) => ListExploder({ list: item }))}</ul>;
	}
	return (
		<ul>
			{each(
				list,
				(item) => ListExploder({ list: item }),
				(item) => item,
			)}
		</ul>
	);
}

@define("list-explosion")
export class ListExplosion extends Component {
	#list = this.signal([]);

	get template() {
		return (
			<>
				<h1>
					That's a nice chunk of memory you have there. Would be a
					shame if I were to...
				</h1>
				<ListExploder list={this.#list} />
			</>
		);
	}

	init() {
		this.addEffect(() => {
			const interval = setInterval(() => {
				this.#list.set([
					...this.#list().map((e) => ({
						...e,
						[Object.keys(e).reduce((k, h) => (k > h ? k : h), "")]:
							"word",
					})),
					{ k1: "word" },
				]);
			}, 1000);
			return () => clearInterval(interval);
		});
	}
}
```

In this example, ListExploder takes any value and creates many DOM nodes from it. Every tick,
ListExplosion adds a new item to the list and then adds a new key to every object, destroying the
reference used by the key in ListExploder and causing massive amounts of DOM teardown every tick.

#### What to do instead

Keys should instead not mutate between frames. In the example above, that's not very practical,
which indicates that it is an anti-pattern.

For items with deep or frequently-changing internal state, put that state in a signal _on the item
itself_. `each` only diffs the top level of each item, so a signal held on an item updates through
normal reactivity without the list ever needing to tear the node down and rebuild it. `each` handles
structure, signals handle depth.

```tsx
const items = createSignal([{ id: 1, label: createSignal("Chicken") }]);

each(
	items,
	(item) => <li>{item.label}</li>,
	(item) => item.id,
);
```

Here, setting `item.label` re-renders only that `<li>`'s text node. Replacing the array, adding,
removing, or reordering items is what `each` reconciles.
