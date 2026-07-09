---
next:
    text: 'List Rendering'
    link: './lists'
prev:
    text: 'Reactivity'
    link: './reactivity'
---

# Referencing DOM Elements

`BMElement` exposes a simple way of tracking DOM references: a simple `ref` attribute set to the name you would like the ref to take.
```tsx
<div>
    <p ref="paragraph"></p>
</div>
```
Accessing the refs is easily done through `this.refs`.

```tsx
const paragraph = this.refs.paragraph;
paragraph.textContent = 'Hello, ref!';
```

::: warning Functional Components
Functional components do not have access to `this.refs` and as such, refs are not currently accessible within functional components. This will be addressed in a future release.
:::

## Typing `this.refs`

Ref type inference is something that is currently very difficult to do automatically, so as a workaround you can currently type the refs of a component by passing a type argument to BMElement.

```ts
@define("component")
export class Component extends BMElement<{ paragraph: HTMLParagraphElement }> {
    init() {
        const paragraph = this.refs.paragraph // HTMLParagraphElement
    }
}
```
