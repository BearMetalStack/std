# @bearmetal/forge

Runtime validation, TypeScript type inference, and JSON Schema generation.

```ts
import { f, type Infer } from "@bearmetal/forge";
```

Also available via `@bearmetal/router`, which re-exports everything.

## Quick start

```ts
const CreateUser = f.object({
  name: f.string().min(1),
  email: f.string().email(),
  age: f.number().int().min(0).optional(),
});

type CreateUser = Infer<typeof CreateUser>;
// { name: string; email: string; age?: number }

const user = CreateUser.parse(req.body);

const result = CreateUser.safeParse(req.body);
if (result.success) {
  result.data; // CreateUser
} else {
  result.issues; // ValidationIssue[]
}
```

---

## Parsing

### parse()

Parses and validates a value. Returns the typed output on success, throws `SchemaError` on failure.

```ts
const id = f.string().uuid().parse(rawId);
```

### safeParse()

Same as `parse()` but never throws. Returns a discriminated union:

```ts
const result = schema.safeParse(value);
if (result.success) {
  result.data;   // typed output
} else {
  result.issues; // ValidationIssue[]
}
```

### SchemaError

Thrown by `parse()` on failure. Contains an `issues` array with a `path` and `message` for each problem:

```ts
try {
  schema.parse(value);
} catch (e) {
  if (e instanceof SchemaError) {
    for (const issue of e.issues) {
      console.log(issue.path, issue.message);
      // e.g. ["address", "zip"] "Expected string"
    }
  }
}
```

---

## Schemas

### f.string()

```ts
f.string()
  .min(n)              // minimum length
  .max(n)              // maximum length
  .email()             // valid email format
  .url()               // valid URL
  .uuid()              // valid UUID
  .regex(pattern, msg) // custom regex; msg is optional
  .trim()              // strip whitespace before validation
  .describe(text)      // adds a description to the JSON Schema output
```

### f.number()

```ts
f.number()
  .min(n, exclusive?)  // >= n by default; pass true for > n
  .max(n, exclusive?)  // <= n by default; pass true for < n
  .gt(n)               // > n  (exclusive minimum)
  .gte(n)              // >= n (inclusive minimum)
  .lt(n)               // < n  (exclusive maximum)
  .lte(n)              // <= n (inclusive maximum)
  .int()               // must be an integer
  .integer()           // alias for .int()
  .positive()          // > 0
  .negative()          // < 0
  .multipleOf(n)       // must be divisible by n
  .coerce()            // parse strings to numbers ("42" -> 42)
  .describe(text)
```

### f.boolean()

```ts
f.boolean()
  .coerce()      // "true"/1 -> true, "false"/0 -> false
  .describe(text)
```

### f.literal()

Matches exactly one value. The value type is narrowed to the literal:

```ts
f.literal("admin")   // Infer -> "admin"
f.literal(42)        // Infer -> 42
f.literal(true)      // Infer -> true
f.literal(null)      // Infer -> null
```

### f.object()

```ts
const Address = f.object({
  street: f.string(),
  city: f.string(),
  zip: f.string().regex(/^\d{5}$/),
});
```

Shape methods return new schemas and do not mutate the original:

```ts
Address.extend({ country: f.string() })     // add fields
Address.pick("street", "city")              // keep only these fields
Address.omit("zip")                         // remove these fields
Address.partial()                           // make all fields optional
```

The `shape` property is publicly accessible if you need to inspect or reuse field schemas.

### f.array()

```ts
f.array(f.string())
  .min(n)       // minimum length
  .max(n)       // maximum length
  .nonempty()   // at least one item (equivalent to .min(1))
  .describe(text)
```

### f.union()

Accepts a value if it matches any of the provided schemas. Takes two or more schemas:

```ts
const StringOrNumber = f.union(f.string(), f.number());
// Infer -> string | number

const Status = f.union(
  f.literal("active"),
  f.literal("inactive"),
  f.literal("pending"),
);
// Infer -> "active" | "inactive" | "pending"
```

### f.enum()

String-only enum. Prefer `f.union(f.literal(...), ...)` for mixed or non-string enums:

```ts
const Role = f.enum("admin", "editor", "viewer");
// Infer -> "admin" | "editor" | "viewer"
```

### f.file()

Validates that the value is a `File` instance. Intended for use inside `f.formData()`:

```ts
f.formData({
  avatar: f.file(),
  caption: f.string().optional(),
});
```

### f.formData()

Parses a `FormData` object. Single values are unwrapped; repeated keys become arrays. Missing keys become `undefined`.

When used as a route schema in `@bearmetal/router`, the router calls `req.formData()` automatically instead of `req.json()`.

```ts
f.formData({
  title: f.string(),
  file: f.file(),
  tags: f.string().optional(),
})
```

### f.query()

Parses a `URLSearchParams` object. Single values are unwrapped; repeated keys become arrays. Missing keys become `undefined`.

When used as a route schema in `@bearmetal/router`, the router reads `url.searchParams` instead of the request body.

```ts
f.query({
  q: f.string(),
  page: f.number().int().coerce().optional(),
  sort: f.enum("asc", "desc").optional(),
})
```

`.coerce()` on number and boolean fields is useful here since query params are always strings.

---

## Modifiers

### .optional()

Wraps any schema to also accept `undefined`. Shorthand for `f.optional(schema)`:

```ts
f.string().optional()       // string | undefined
f.object({...}).optional()  // { ... } | undefined
```

Object field marked optional:

```ts
f.object({
  name: f.string(),
  bio: f.string().optional(),
})
// Infer -> { name: string; bio?: string }
```

### .nullable()

Wraps any schema to also accept `null`. Shorthand for `f.nullable(schema)`:

```ts
f.string().nullable()  // string | null
```

Can be chained with `.optional()`:

```ts
f.string().nullable().optional()  // string | null | undefined
```

### .describe()

Adds a `description` field to the JSON Schema output. Available on every schema:

```ts
f.object({
  id: f.string().uuid().describe("The resource identifier"),
  status: f.enum("active", "archived").describe("Current lifecycle status"),
})
```

---

## Type inference :: Infer\<T\>

`Infer<S>` extracts the TypeScript output type from any schema:

```ts
import { type Infer } from "@bearmetal/forge";

const Post = f.object({
  id: f.string().uuid(),
  title: f.string(),
  tags: f.array(f.string()),
  publishedAt: f.string().optional(),
});

type Post = Infer<typeof Post>;
// {
//   id: string;
//   title: string;
//   tags: string[];
//   publishedAt?: string;
// }
```

Using the same name for the type and the schema variable is a common pattern -- TypeScript resolves the ambiguity automatically.

---

## JSON Schema output

Every schema implements `.toJSONSchema(): JSONSchema` producing an OpenAPI 3.x-compatible object. Useful for documentation generation, editor tooling, or validation outside of Forge.

```ts
f.object({
  name: f.string().min(1),
  role: f.enum("admin", "viewer"),
  score: f.number().int().min(0).max(100).nullable(),
}).toJSONSchema();

// {
//   type: "object",
//   properties: {
//     name: { type: "string", minLength: 1 },
//     role: { type: "string", enum: ["admin", "viewer"] },
//     score: { type: "integer", minimum: 0, maximum: 100, nullable: true },
//   },
//   required: ["name", "role", "score"],
// }
```

Reference of what each schema produces:

| Schema | JSON Schema output |
|---|---|
| `f.string()` | `{ type: "string" }` + constraints as `minLength`, `maxLength`, `pattern`, `format` |
| `f.number()` | `{ type: "number" }` or `{ type: "integer" }` + `minimum`, `maximum`, etc. |
| `f.boolean()` | `{ type: "boolean" }` |
| `f.literal(v)` | `{ const: v }` |
| `f.object({...})` | `{ type: "object", properties: {...}, required: [...] }` |
| `f.array(s)` | `{ type: "array", items: {...} }` + `minItems`, `maxItems` |
| `f.union(a, b)` | `{ oneOf: [...] }` |
| `f.enum(...)` | `{ type: "string", enum: [...] }` |
| `f.file()` | `{ type: "string", format: "binary" }` |
| `f.formData({...})` | `{ type: "object", ..., "x-content-type": "multipart/form-data" }` |
| `f.query({...})` | `{ type: "object", ..., "x-content-type": "query" }` |
| `.optional()` | Same as inner schema |
| `.nullable()` | Inner schema + `nullable: true` |
| `.describe(text)` | Adds `description` to any of the above |
