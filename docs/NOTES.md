# BearMetal - Performance Notes & Common Gotchas

A collection of patterns that work, patterns that technically work but will hurt you, and things that just don't work. Keep this somewhere.

---

## Always declare `template` as a getter, never a class field

```ts
// ❌ Field - runs at construction time, before connectedCallback
template = <div ref="container" />;

protected init() {
  this.refs.container; // undefined - refs aren't registered yet
}
```

```ts
// ✅ Getter - runs at connect time, refs available in init()
protected get template() {
  return <div ref="container" />;
}

protected init() {
  this.refs.container; // ✅
}
```

Class fields initialize during construction, before `connectedCallback` fires and before the owner context is set. This means `ref=` attributes won't register and signal scoping won't work correctly. There are no valid reasons to use a field for `template` - always use a getter.

---

## Don't wrap static styles in a reactive signal

If your component uses shadow DOM and you put a `<style>` inside a computed template, the stylesheet gets destroyed and re-created on every signal update:

```ts
// ❌ Style re-parses on every tick
protected get template() {
  return this.computed(() => (
    <>
      <style>{`.foo { color: red; }`}</style>
      <div class="foo">{this.#count.get()}</div>
    </>
  ));
}
```

```ts
// ✅ Style is static, only the changing part is reactive

// using refs, useful for if a signal or effect can update multiple parts of the template
protected get template() {
  return (
    <>
      <style>{`.foo { color: red; }`}</style>
      <div class="foo" ref="counter" />
    </>
  );
}

protected init() {
  this.useShadow();
  this.addEffect(() => {
    this.refs.counter.textContent = String(this.#count.get());
  });
}

// OR passed directly as the child if the child is exactly one signal
protected get template() {
  return (
      <>
        <style>{`.foo { color: red; }`}</style>
        <div class="foo">{this.#count}</div> 
      </>
  );
}
```

This is a specific instance of the general rule below.

---

## Keep effects surgical - don't re-render the whole template reactively

`replaceChildren` on a signal update is a full teardown and rebuild. Any time you find yourself writing a computed that returns the entire component tree, you're doing too much work:

```ts
// ❌ Coarse - entire tree rebuilds on any signal change
// Additionally, simple array mapping does not diff existing entries
protected get template() {
  return this.computed(() => (
    <div>
      <h1>{this.#title.get()}</h1>
      <ul>{this.#items.get().map(i => <li>{i.name}</li>)}</ul>
    </div>
  ));
}
```

```ts
// ✅ Fine-grained - each signal only touches its own DOM

// Using refs when an effect needs to touch multiple parts of the template
protected get template() {
  return (
    <div>
      <h1 ref="title" />
      <ul ref="list" />
    </div>
  );
}

protected init() {
  this.addEffect(() => {
    this.refs.title.textContent = this.#title.get();
  });
  this.addEffect(() => {
    // ... manually update list
  });
}

// Preferred: each() handles reconciliation inline
protected get template() {
  return (
    <div>
      <h1>{this.#title}</h1>
      <ul>
        {this.each(this.#items, renderItem, i => i.id)}
      </ul>
    </div>
  );
}

```

The goal is for `template` to run exactly once, on connect. Effects run surgically forever after. If `template` is reactive at all, it should wrap only the smallest changing piece, not the whole structure.

---

## `each()` re-renders items on shallow data changes, not deep ones

`each()` uses a shallow diff: it detects insertions, removals, reordering, and items whose top-level properties have changed (by reference equality). When a change is detected the item's node is replaced by calling `render` again.

What it does **not** detect is mutation in place - if you update a property on the same object reference, the diff won't see it and the node won't update:

```ts
// ❌ Mutates in place - each() won't notice
item.name = "new name";
this.#items.set([...this.#items.get()]); // forces re-evaluation, but shallow diff sees no change

// ✅ Replace the object - each() detects the changed property
this.#items.set(this.#items.get().map(i =>
  i.id === targetId ? { ...i, name: "new name" } : i
));
```

If your item objects contain signals, those update through normal reactivity and don't need `each()` to re-render the node at all.

---

## `useShadow()` must be called inside `init()`, before it returns

The sequence inside `connectedCallback` is:

1. `template` getter is called - JSX evaluates, refs register
2. Result is held in a `DocumentFragment` (not yet in the DOM)
3. `init()` is called
4. Fragment is appended to `this.root`

`this.root` returns `this.shadowRoot ?? this`, so it needs the shadow root to exist before step 4. Calling `useShadow()` anywhere in `init()` is sufficient. First-line is the safest default since nothing else in `init()` should need `this.root` directly:

```ts
protected init() {
  this.useShadow(); // ensures this.root === this.shadowRoot when template appends
  // ...
}
```

Calling it after `init()` returns is too late - the fragment has already been appended to the host element's light DOM.

---

## Light DOM children aren't available synchronously in `connectedCallback`

The browser fires `connectedCallback` when the opening tag is parsed - before it has seen the children between the tags. If `connectedCallback` tries to read `this.children` to inspect projected content, those children won't be there yet.

`<script type="module">` is already deferred by default (the spec makes `defer` implicit for modules, so adding the attribute is a no-op). The issue isn't the script loading strategy - it's that `customElements.define()` upgrades already-parsed elements immediately, and any element defined in a module that runs after full parse will have all its children available. The problem only bites if you're defining elements via a non-deferred classic script, or if you're trying to read children synchronously during an upgrade triggered mid-parse.

The safe pattern is to not read `this.children` at connect time at all. Use a named `<slot>` and let the browser handle projection, or observe children asynchronously with a `MutationObserver` if you genuinely need to inspect them.

---

## `::slotted()` only selects the top-level slotted element

You can't reach children of a slotted element from inside shadow DOM:

```css
/* ✅ Selects the slotted <nav> itself */
::slotted(nav) { display: flex; }

/* ❌ Does nothing - can't pierce into slotted content */
::slotted(nav a) { color: red; }
```

If you need to style content inside slotted elements, use CSS custom properties that pierce the shadow boundary instead:

```css
/* Inside shadow root */
slot[name="nav"]::slotted(*) {
  gap: var(--nav-gap, 1rem);
}
```

```css
/* Outside, from consumer */
my-layout { --nav-gap: 0.5rem; }
```
