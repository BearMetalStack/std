---
prev:
    text: 'Templates'
    link: './templates'
next:
    text: 'Reactivity'
    link: './reactivity'
---

# Component Lifecycle

The component lifecycle in BearMetal is simple: `connected` and `disconnected`. Both stages are accessed through `init()`

```tsx
@define("my-component")
export class MyComponent extends BMElement {
    init() {
        // Do things when `connectedCallback()` runs
        // Useful for effects
        console.log("`my-component` added to DOM");
         
        return () => {
            // Do things when `disconnectedCallback()` runs
            // Useful for cleanup
            console.log("`my-component` removed to DOM");
        }
    }
}
```
