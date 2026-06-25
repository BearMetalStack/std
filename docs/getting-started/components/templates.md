---
next:
    text: 'Lifecycle'
    link: './lifecycle'
prev:
    text: 'The `\components` Directory'
    link: './component-directory'
---

# Templates

Templating in the BearMetal Stack is done with JSX. To set the template of a component, simply create a getter for `template`.

```tsx
@define("my-component")
export class MyComponent extends BMElement {
    get template() {
        return <h1>Hello, World!</h1>
    }
}
```

## The Shadow DOM

In order to leverage shadow DOM functionality, `BMElement` exposes `this.useShadow()`. This enables the use of DOM slots in the JSX of other components as well as giving access to the other benefits of the shadow DOM.

```tsx
@define("my-component")
export class MyComponent extends BMElement {
    init() {
        this.useShadow();
    }

    get template() {
        return (
            <>
                <slot name="slot-1"></slot>
                <hr/>
                <slot name="slot-2"></slot>
                <hr/>
                <slot name="slot-3"></slot>
            </>
        )
    }
}

// usage
<my-component>
    <div slot="slot-1"></div>
    <div slot="slot-2"></div>
    <div slot="slot-3"></div>
</my-component>
```
