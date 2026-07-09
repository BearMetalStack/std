---
next:
    text: 'The `\components` Directory'
    link: './component-directory'
prev: false
---

# Components

BearMetal is built around the modern web component/custom element standard. 

## Defining Components

### The `@define` decorator

In order define your components, the `@define` decorator is exposed through the `@bearmetal/app` package.

```ts
import { define } from "@bearmetal/app";

@define("my-component")
class MyComponent extends HTMLElement {
    // ...
}
```

The `@define` decorator takes in a name for your custom element. If the name provided does not comply with the requirements, your provided name will be normalized. 

```ts
@define("My Component") // becomes "my-component"
@define("My *very cool* Component") // becomes "my-very-cool-component"
```

If the normalized name still does not comply, the prefix "my-" will be added. 

```ts
@define("component") // becomes "my-component"
```
::: info
This means that when using your components, you should expect to refer to them by this compliant name. This can be circumvented by importing the class and using the class name in the JSX, but know that you will likely be increasing the bundle size unecessarily.
:::

### BMElement

While not strictly necessary, it is recommended that you extend the `BMElement` class, also exposed through `@bearmetal/app`.

```ts
import { define, BMElement } from "@bearmetal/app";

@define("my-component")
class MyComponent extends BMElement {
    // ...
}
```

This will give you access to various features such as SSR, signals, managed shadow DOMs, and more. If you find that your custom element/component doesn't require access to these, it may be prudent to use [functional components](#functional-components) instead.

## Functional Components

Functional components are largely just small reusable templates rather than full scale components. Unlike class components, these cannot use the `@define` decorator. This means they must be referenced by function name in the JSX template of another component.

```tsx
import { define, BMElement } from "@bearmetal/app";

function CounterButton({countSignal, amount, children}) {
    const onClick = () => countSignal.set(countSignal.get() + amount);
    return <button onClick={onClick}>{children}</button>
}

@define("counter-app")
export class CounterApp extends BMElement {
    #counter = this.signal(0)
    
    get template() {
        return (
            <div>
                <CounterButton 
                    countSignal={this.#counter}
                    amount={-10}
                >
                    -10
                </CounterButton>
                <CounterButton
                    countSignal={this.#counter}
                    amount={-1}
                >
                    -1
                </CounterButton>
                
                <span>{this.#counter}</span>

                <CounterButton
                    countSignal={this.#counter}
                    amount={1}
                >
                    +1
                </CounterButton>
                <CounterButton
                    countSignal={this.#counter}
                    amount={10}
                >
                    +10
                </CounterButton>
            </div>
        )
    }
}
```
