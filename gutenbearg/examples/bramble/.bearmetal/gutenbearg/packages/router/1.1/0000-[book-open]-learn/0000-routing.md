---
description: Map URLs to components.
status: stable
---

# Routing

## Defining routes

Routes are inferred from files under `routes/`. Each file exports a component.

```ts [routes/users/[id].tsx]
export default function User({ params }) {
  return <h1>User {params.id}</h1>;
}
```
