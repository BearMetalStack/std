---
prev:
    text: 'List Rendering'
    link: './lists'
next:
    text: ''
    link: ''
---

# Accessing Props

Props are stored in various ways depending on their value. Because of this, `BMElement` exposes a props proxy object. This proxy object gives you access to all props regardless of type.

```tsx
export class MyComponent extends BMElement {
    get template() {
        return (
            <h1>Hello, {this.props.name}</h1>
        )
    }
}
```

It should be noted that props are not reactive unless passed as a signal.

## Accessing Server Side Props

It will become quickly apparent that you cannot access `this.props` in a server-side context. The `serverLoad` and `serverRender` static methods instead receive the props as their first argument. These will both be a plain object, with `serverRender` having access to any additional props generated during `serverLoad`

```tsx
export class MyComponent extends BMElement {
    static async serverLoad(props: {id: string}) {
        const user = await db.getUserById(id);
        return { user } // becomes a signal on the client
    }

    static serverRender(props: {id: string, user: User}) {
        return <h1>Hello, {props.user.firstName}!</h1>
    }
}
```

# Passing Props

## String and Boolean Values

Strings and booleans passed as props are added to the DOM as attributes of the element. This allows you to use attribute selectors on these props.
