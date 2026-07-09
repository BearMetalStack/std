---
next:
    text: 'Templates'
    link: './templates'
prev: 
    text: 'Components'
    link: './index'
---


# `/components`

The `/components` directory (also referred to as `@components`) contains all components that you wish to be permanently available on the client. By default, all components within this directory will be served as a single bundle to the client. This enables you to use the compliant names set by `@define` for any of these components without worrying about needing to import them and having them get missed in the bundle.

Since there is no discrimination or code-splitting around these, you should be mindful about what is actually being included here.

## `manifest.ts` and `<subset>.manifest.ts` files

Inside the `@components` directory, you can optionally provide `manifest.ts` files to define which components should be included in the bundle. This is useful if you have a large number of components and only want to include a subset of them, or if you wish to import components from external libraries or from @bearmetal/webbies. When doing so, `@components/manifest.ts` will generate the default bundle that will always be included instead of compiling a single bundle that includes *all* of the components in `@components`. 

```ts
```

### Component Subsets

Other bundle subsets can be created in `@components/<subset>.manifest.ts` files. These will generate unique bundles that can be accessed from the `/@bearmetal/components` endpoint in a script tag.

```ts
// @components/subsetAB.manifest.ts
import "./component-a.ts"
import "./component-b.ts"
```

```html
<script type="module" src="/@bearmetal/components/subsetAB"></script>
```
