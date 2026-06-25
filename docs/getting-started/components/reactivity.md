---
prev:
    text: 'Lifecycle'
    link: './lifecycle'
next:
    text: 'DOM refs'
    link: './dom-refs'
---

# Reactivity

Reactivity is driven by [Signals](https://github.com/tc39/proposal-signals). This enables granular in-place DOM updates.

## Signals

There are two ways to create a signal. Which one you use depends on the specific case you are working in.

### `BMElement.prototype.signal()`

Inside of a class component, you can call `this.signal()` with a default value to initialize a signal. Where you store it is up to you, but it is recommended that you store it as a private member of the component.

```tsx
@define("my-component")
export class MyComponent extends BMElement {
    #signal = this.signal("Hello, World!");

    get template() {
        return <h1>{this.#signal}</h1>
    }
}
```

### `createSignal()`

`@bearmetal/app` exposes a `createSignal` function that will return a signal using the provided default value. This is most useful for closures within functional components, but can be used to some extent as a standalone feature.

```tsx
import { createSignal, define } from "@bearmetal/app";

const signal = createSignal("Hello, World!");

@define("my-component")
export class MyComponent extends BMElement {
    get template() {
        return <h1>{signal}</h1>
    }
}
```

### Computed Signals

Computed signals are derived from other signals using a function. They are updated automatically when the signals they depend on change. These have a similar API to that of the normal `createSignal` function, but take in a callback instead of a value.

```tsx
import { createComputed, createSignal, define } from "@bearmetal/app";

const signal = createSignal("Hello, World!");
const computed = createComputed(() => signal.get() + "!");

@define("my-component")
export class MyComponent extends BMElement {
    #computed = this.computed(() => computed.get() + "!");
    get template() {
        return (
            <>
                <h1>{signal}</h1>           {/* Hello, World! */}
                <h2>{computed}</h2>         {/* Hello, World!! */}
                <h3>{this.#computed}</h3>   {/* Hello, World!!! */}
            </>
        )
    }
}
```

## Effects

::: warning Effect Ownership

In order for effect cleanups to fire properly, you must, at a minimum, have a root component. Effect cleanup happens at **disconnect** of the **nearest** parent `BMElement`

Because of this, it could be problematic to save refs to effectful children without manually defining an effect owner or cleaning up manually.
:::

Effects are effectively watchers of any number of signals. Much like signals, effects can be created in two ways depending on the context, however they do behave slightly differently from each other.

### `BMElement.prototype.addEffect()`

`BMElement.prototype.addEffect()` is a method that allows you to define an effect within a `BMElement` component. It takes in a callback function that will be executed whenever the signals it depends on change. The cleanup for this effect is automatically collected and run during `onDisconnect`

```tsx
@define("my-component")
export class MyComponent extends BLElement {
    init() {
        this.addEffect(() => {
            // Effect logic here
            return () => {
                // Cleanup logic here
            };
        });
    }
}
```

### `createEffect()`

`createEffect()` is a utility function that allows you to define an effect outside of a `BMElement` component. It takes in a callback function that will be executed whenever the signals it depends on change. The cleanup for this effect is returned and must be called at cleanup if there is no effect owner set.

```tsx
const cleanup = createEffect(() => {
    // Effect logic here
    return () => {
        // Cleanup logic here
    };
});

// during cleanup
cleanup();
```

This is useful for effectful functional components, but you should be aware of the possible memory leaks that can occur from unowned cleanup.
