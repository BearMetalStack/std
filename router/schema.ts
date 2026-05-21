/**
 * @module
 * BearMetal Router schema system.
 * Provides runtime validation, TypeScript inference, and JSON Schema output for OpenAPI generation.
 */

// ─── Result types ─────────────────────────────────────────────────────────────

export type ValidationIssue = { path: (string | number)[]; message: string };

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ValidationIssue[] };

function fail(
  path: (string | number)[],
  message: string,
): { success: false; issues: ValidationIssue[] } {
  return { success: false, issues: [{ path, message }] };
}

// ─── JSON Schema (OpenAPI 3.x subset) ─────────────────────────────────────────

export interface JSONSchema {
  type?: string | string[];
  format?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  items?: JSONSchema;
  enum?: unknown[];
  const?: unknown;
  oneOf?: JSONSchema[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  /** Signals to the router how to source the value for this schema */
  "x-content-type"?: "multipart/form-data" | "application/x-www-form-urlencoded" | "query";
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class SchemaError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(
      issues
        .map((i) => `${i.path.length ? i.path.join(".") : "root"}: ${i.message}`)
        .join("; "),
    );
    this.name = "SchemaError";
  }
}

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class Schema<T> {
  // Phantom property — never exists at runtime, only for TypeScript inference.
  declare readonly _output: T;

  abstract _parse(value: unknown, path: (string | number)[]): ParseResult<T>;
  abstract toJSONSchema(): JSONSchema;

  parse(value: unknown): T {
    const result = this._parse(value, []);
    if (!result.success) throw new SchemaError(result.issues);
    return result.data;
  }

  safeParse(value: unknown): ParseResult<T> {
    return this._parse(value, []);
  }

  optional(): OptionalSchema<T> {
    return new OptionalSchema(this);
  }

  nullable(): NullableSchema<T> {
    return new NullableSchema(this);
  }
}

// ─── String ───────────────────────────────────────────────────────────────────

type StringCheck =
  | { kind: "min"; value: number }
  | { kind: "max"; value: number }
  | { kind: "email" }
  | { kind: "url" }
  | { kind: "uuid" }
  | { kind: "regex"; pattern: RegExp; message?: string }
  | { kind: "trim" };

export class StringSchema extends Schema<string> {
  constructor(
    private readonly checks: StringCheck[] = [],
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<string> {
    if (typeof value !== "string") {
      return fail(path, `Expected string, got ${value === null ? "null" : typeof value}`);
    }
    let str = value;
    const issues: ValidationIssue[] = [];

    for (const check of this.checks) {
      switch (check.kind) {
        case "trim":
          str = str.trim();
          break;
        case "min":
          if (str.length < check.value) {
            issues.push({ path, message: `Must be at least ${check.value} characters` });
          }
          break;
        case "max":
          if (str.length > check.value) {
            issues.push({ path, message: `Must be at most ${check.value} characters` });
          }
          break;
        case "email":
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
            issues.push({ path, message: "Invalid email address" });
          }
          break;
        case "url":
          try {
            new URL(str);
          } catch {
            issues.push({ path, message: "Invalid URL" });
          }
          break;
        case "uuid":
          if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
          ) {
            issues.push({ path, message: "Invalid UUID" });
          }
          break;
        case "regex":
          if (!check.pattern.test(str)) {
            issues.push({ path, message: check.message ?? `Must match pattern ${check.pattern}` });
          }
          break;
      }
    }

    return issues.length ? { success: false, issues } : { success: true, data: str };
  }

  toJSONSchema(): JSONSchema {
    const schema: JSONSchema = { type: "string" };
    if (this.description) schema.description = this.description;
    for (const check of this.checks) {
      switch (check.kind) {
        case "min":
          schema.minLength = check.value;
          break;
        case "max":
          schema.maxLength = check.value;
          break;
        case "email":
          schema.format = "email";
          break;
        case "url":
          schema.format = "uri";
          break;
        case "uuid":
          schema.format = "uuid";
          break;
        case "regex":
          schema.pattern = check.pattern.source;
          break;
      }
    }
    return schema;
  }

  describe(description: string): StringSchema {
    return new StringSchema(this.checks, description);
  }

  min(n: number): StringSchema {
    return new StringSchema([...this.checks, { kind: "min", value: n }], this.description);
  }

  max(n: number): StringSchema {
    return new StringSchema([...this.checks, { kind: "max", value: n }], this.description);
  }

  email(): StringSchema {
    return new StringSchema([...this.checks, { kind: "email" }], this.description);
  }

  url(): StringSchema {
    return new StringSchema([...this.checks, { kind: "url" }], this.description);
  }

  uuid(): StringSchema {
    return new StringSchema([...this.checks, { kind: "uuid" }], this.description);
  }

  regex(pattern: RegExp, message?: string): StringSchema {
    return new StringSchema(
      [...this.checks, { kind: "regex", pattern, message }],
      this.description,
    );
  }

  trim(): StringSchema {
    return new StringSchema([...this.checks, { kind: "trim" }], this.description);
  }
}

// ─── Number ───────────────────────────────────────────────────────────────────

type NumberCheck =
  | { kind: "min"; value: number; exclusive: boolean }
  | { kind: "max"; value: number; exclusive: boolean }
  | { kind: "integer" }
  | { kind: "positive" }
  | { kind: "negative" }
  | { kind: "multipleOf"; value: number };

export class NumberSchema extends Schema<number> {
  constructor(
    private readonly checks: NumberCheck[] = [],
    private readonly _coerce = false,
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<number> {
    let num: number;

    if (this._coerce && typeof value === "string") {
      num = Number(value);
      if (isNaN(num)) return fail(path, `Cannot coerce "${value}" to number`);
    } else if (typeof value !== "number") {
      return fail(path, `Expected number, got ${value === null ? "null" : typeof value}`);
    } else {
      num = value;
    }

    if (isNaN(num)) return fail(path, "Expected number, got NaN");

    const issues: ValidationIssue[] = [];
    for (const check of this.checks) {
      switch (check.kind) {
        case "min":
          if (check.exclusive ? num <= check.value : num < check.value) {
            issues.push({
              path,
              message: `Must be ${check.exclusive ? ">" : ">="} ${check.value}`,
            });
          }
          break;
        case "max":
          if (check.exclusive ? num >= check.value : num > check.value) {
            issues.push({
              path,
              message: `Must be ${check.exclusive ? "<" : "<="} ${check.value}`,
            });
          }
          break;
        case "integer":
          if (!Number.isInteger(num)) issues.push({ path, message: "Must be an integer" });
          break;
        case "positive":
          if (num <= 0) issues.push({ path, message: "Must be positive" });
          break;
        case "negative":
          if (num >= 0) issues.push({ path, message: "Must be negative" });
          break;
        case "multipleOf":
          if (num % check.value !== 0) {
            issues.push({ path, message: `Must be a multiple of ${check.value}` });
          }
          break;
      }
    }

    return issues.length ? { success: false, issues } : { success: true, data: num };
  }

  toJSONSchema(): JSONSchema {
    const schema: JSONSchema = { type: "number" };
    if (this.description) schema.description = this.description;
    for (const check of this.checks) {
      switch (check.kind) {
        case "integer":
          schema.type = "integer";
          break;
        case "min":
          if (check.exclusive) schema.exclusiveMinimum = check.value;
          else schema.minimum = check.value;
          break;
        case "max":
          if (check.exclusive) schema.exclusiveMaximum = check.value;
          else schema.maximum = check.value;
          break;
      }
    }
    return schema;
  }

  describe(description: string): NumberSchema {
    return new NumberSchema(this.checks, this._coerce, description);
  }

  coerce(): NumberSchema {
    return new NumberSchema(this.checks, true, this.description);
  }

  min(value: number, exclusive = false): NumberSchema {
    return new NumberSchema(
      [...this.checks, { kind: "min", value, exclusive }],
      this._coerce,
      this.description,
    );
  }

  max(value: number, exclusive = false): NumberSchema {
    return new NumberSchema(
      [...this.checks, { kind: "max", value, exclusive }],
      this._coerce,
      this.description,
    );
  }

  gt(value: number): NumberSchema {
    return this.min(value, true);
  }

  gte(value: number): NumberSchema {
    return this.min(value, false);
  }

  lt(value: number): NumberSchema {
    return this.max(value, true);
  }

  lte(value: number): NumberSchema {
    return this.max(value, false);
  }

  int(): NumberSchema {
    return new NumberSchema(
      [...this.checks, { kind: "integer" }],
      this._coerce,
      this.description,
    );
  }

  integer(): NumberSchema {
    return this.int();
  }

  positive(): NumberSchema {
    return new NumberSchema(
      [...this.checks, { kind: "positive" }],
      this._coerce,
      this.description,
    );
  }

  negative(): NumberSchema {
    return new NumberSchema(
      [...this.checks, { kind: "negative" }],
      this._coerce,
      this.description,
    );
  }

  multipleOf(value: number): NumberSchema {
    return new NumberSchema(
      [...this.checks, { kind: "multipleOf", value }],
      this._coerce,
      this.description,
    );
  }
}

// ─── Boolean ──────────────────────────────────────────────────────────────────

export class BooleanSchema extends Schema<boolean> {
  constructor(
    private readonly _coerce = false,
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<boolean> {
    if (this._coerce) {
      if (value === "true" || value === 1) return { success: true, data: true };
      if (value === "false" || value === 0) return { success: true, data: false };
    }
    if (typeof value !== "boolean") {
      return fail(path, `Expected boolean, got ${value === null ? "null" : typeof value}`);
    }
    return { success: true, data: value };
  }

  toJSONSchema(): JSONSchema {
    return { type: "boolean", ...(this.description ? { description: this.description } : {}) };
  }

  describe(description: string): BooleanSchema {
    return new BooleanSchema(this._coerce, description);
  }

  coerce(): BooleanSchema {
    return new BooleanSchema(true, this.description);
  }
}

// ─── Literal ──────────────────────────────────────────────────────────────────

export class LiteralSchema<T extends string | number | boolean | null> extends Schema<T> {
  constructor(
    private readonly value: T,
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<T> {
    if (value !== this.value) {
      return fail(
        path,
        `Expected ${JSON.stringify(this.value)}, got ${JSON.stringify(value)}`,
      );
    }
    return { success: true, data: value as T };
  }

  toJSONSchema(): JSONSchema {
    return {
      const: this.value,
      ...(this.description ? { description: this.description } : {}),
    };
  }

  describe(description: string): LiteralSchema<T> {
    return new LiteralSchema(this.value, description);
  }
}

// ─── Object ───────────────────────────────────────────────────────────────────

export type SchemaShape = Record<string, Schema<unknown>>;

export type InferShape<S extends SchemaShape> = {
  [K in keyof S]: S[K]["_output"];
};

export class ObjectSchema<S extends SchemaShape> extends Schema<InferShape<S>> {
  constructor(
    readonly shape: S,
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<InferShape<S>> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return fail(
        path,
        `Expected object, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`,
      );
    }

    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const issues: ValidationIssue[] = [];

    for (const [key, schema] of Object.entries(this.shape)) {
      const fieldResult = schema._parse(obj[key], [...path, key]);
      if (fieldResult.success) {
        if (fieldResult.data !== undefined) result[key] = fieldResult.data;
      } else {
        issues.push(...fieldResult.issues);
      }
    }

    return issues.length
      ? { success: false, issues }
      : { success: true, data: result as InferShape<S> };
  }

  toJSONSchema(): JSONSchema {
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, schema] of Object.entries(this.shape)) {
      properties[key] = schema.toJSONSchema();
      if (!(schema instanceof OptionalSchema)) required.push(key);
    }

    const schema: JSONSchema = { type: "object", properties };
    if (required.length) schema.required = required;
    if (this.description) schema.description = this.description;
    return schema;
  }

  describe(description: string): ObjectSchema<S> {
    return new ObjectSchema(this.shape, description);
  }

  extend<E extends SchemaShape>(extra: E): ObjectSchema<S & E> {
    return new ObjectSchema({ ...this.shape, ...extra });
  }

  pick<K extends keyof S>(...keys: K[]): ObjectSchema<Pick<S, K>> {
    const picked = {} as Pick<S, K>;
    for (const key of keys) picked[key] = this.shape[key];
    return new ObjectSchema(picked);
  }

  omit<K extends keyof S>(...keys: K[]): ObjectSchema<Omit<S, K>> {
    const result = { ...this.shape };
    for (const key of keys) delete result[key as string];
    return new ObjectSchema(result as Omit<S, K>);
  }

  partial(): ObjectSchema<{ [K in keyof S]: OptionalSchema<S[K]["_output"]> }> {
    const partial = {} as { [K in keyof S]: OptionalSchema<S[K]["_output"]> };
    for (const [key, schema] of Object.entries(this.shape)) {
      (partial as Record<string, Schema<unknown>>)[key] = schema instanceof OptionalSchema
        ? schema
        : new OptionalSchema(schema);
    }
    return new ObjectSchema(partial);
  }
}

// ─── Array ────────────────────────────────────────────────────────────────────

type ArrayCheck =
  | { kind: "min"; value: number }
  | { kind: "max"; value: number }
  | { kind: "nonempty" };

export class ArraySchema<T> extends Schema<T[]> {
  constructor(
    private readonly items: Schema<T>,
    private readonly checks: ArrayCheck[] = [],
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<T[]> {
    if (!Array.isArray(value)) {
      return fail(path, `Expected array, got ${value === null ? "null" : typeof value}`);
    }

    const result: T[] = [];
    const issues: ValidationIssue[] = [];

    for (let i = 0; i < value.length; i++) {
      const itemResult = this.items._parse(value[i], [...path, i]);
      if (itemResult.success) result.push(itemResult.data);
      else issues.push(...itemResult.issues);
    }

    for (const check of this.checks) {
      switch (check.kind) {
        case "min":
          if (value.length < check.value) {
            issues.push({ path, message: `Must have at least ${check.value} items` });
          }
          break;
        case "max":
          if (value.length > check.value) {
            issues.push({ path, message: `Must have at most ${check.value} items` });
          }
          break;
        case "nonempty":
          if (value.length === 0) issues.push({ path, message: "Array must not be empty" });
          break;
      }
    }

    return issues.length ? { success: false, issues } : { success: true, data: result };
  }

  toJSONSchema(): JSONSchema {
    const schema: JSONSchema = { type: "array", items: this.items.toJSONSchema() };
    for (const check of this.checks) {
      if (check.kind === "min") schema.minItems = check.value;
      if (check.kind === "max") schema.maxItems = check.value;
    }
    if (this.description) schema.description = this.description;
    return schema;
  }

  describe(description: string): ArraySchema<T> {
    return new ArraySchema(this.items, this.checks, description);
  }

  min(n: number): ArraySchema<T> {
    return new ArraySchema(this.items, [...this.checks, { kind: "min", value: n }], this.description);
  }

  max(n: number): ArraySchema<T> {
    return new ArraySchema(this.items, [...this.checks, { kind: "max", value: n }], this.description);
  }

  nonempty(): ArraySchema<T> {
    return new ArraySchema(this.items, [...this.checks, { kind: "nonempty" }], this.description);
  }
}

// ─── Union ────────────────────────────────────────────────────────────────────

type UnionMembers = [Schema<unknown>, Schema<unknown>, ...Schema<unknown>[]];
type InferUnion<T extends UnionMembers> = T[number]["_output"];

export class UnionSchema<T extends UnionMembers> extends Schema<InferUnion<T>> {
  constructor(
    private readonly options: T,
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<InferUnion<T>> {
    for (const option of this.options) {
      const result = option._parse(value, path);
      if (result.success) return result as ParseResult<InferUnion<T>>;
    }
    return fail(path, "Value did not match any union member");
  }

  toJSONSchema(): JSONSchema {
    return {
      oneOf: this.options.map((o) => o.toJSONSchema()),
      ...(this.description ? { description: this.description } : {}),
    };
  }

  describe(description: string): UnionSchema<T> {
    return new UnionSchema(this.options, description);
  }
}

// ─── Enum ─────────────────────────────────────────────────────────────────────

export class EnumSchema<T extends string> extends Schema<T> {
  constructor(
    private readonly values: readonly T[],
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<T> {
    if (!this.values.includes(value as T)) {
      return fail(
        path,
        `Expected one of: ${this.values.map((v) => JSON.stringify(v)).join(", ")}`,
      );
    }
    return { success: true, data: value as T };
  }

  toJSONSchema(): JSONSchema {
    return {
      type: "string",
      enum: [...this.values],
      ...(this.description ? { description: this.description } : {}),
    };
  }

  describe(description: string): EnumSchema<T> {
    return new EnumSchema(this.values, description);
  }
}

// ─── Optional ─────────────────────────────────────────────────────────────────

export class OptionalSchema<T> extends Schema<T | undefined> {
  constructor(private readonly inner: Schema<T>) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<T | undefined> {
    if (value === undefined) return { success: true, data: undefined };
    return this.inner._parse(value, path) as ParseResult<T | undefined>;
  }

  toJSONSchema(): JSONSchema {
    return this.inner.toJSONSchema();
  }
}

// ─── Nullable ─────────────────────────────────────────────────────────────────

export class NullableSchema<T> extends Schema<T | null> {
  constructor(private readonly inner: Schema<T>) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<T | null> {
    if (value === null) return { success: true, data: null };
    return this.inner._parse(value, path) as ParseResult<T | null>;
  }

  toJSONSchema(): JSONSchema {
    return { ...this.inner.toJSONSchema(), nullable: true };
  }
}

// ─── File (for FormData) ──────────────────────────────────────────────────────

export class FileSchema extends Schema<File> {
  constructor(private readonly description?: string) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<File> {
    if (!(value instanceof File)) {
      return fail(path, `Expected File, got ${value === null ? "null" : typeof value}`);
    }
    return { success: true, data: value };
  }

  toJSONSchema(): JSONSchema {
    return {
      type: "string",
      format: "binary",
      ...(this.description ? { description: this.description } : {}),
    };
  }

  describe(description: string): FileSchema {
    return new FileSchema(description);
  }
}

// ─── FormData ─────────────────────────────────────────────────────────────────

export class FormDataSchema<S extends SchemaShape> extends Schema<InferShape<S>> {
  /** Marker used by the router to choose req.formData() over req.json() */
  readonly _isFormData = true as const;

  constructor(
    readonly shape: S,
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<InferShape<S>> {
    if (!(value instanceof FormData)) {
      return fail(path, `Expected FormData, got ${value === null ? "null" : typeof value}`);
    }

    const result: Record<string, unknown> = {};
    const issues: ValidationIssue[] = [];

    for (const [key, schema] of Object.entries(this.shape)) {
      const all = value.getAll(key);
      // Single value → unwrap; multiple values → keep as array; missing → undefined
      const raw: unknown = all.length === 0 ? undefined : all.length === 1 ? all[0] : all;

      const fieldResult = schema._parse(raw, [...path, key]);
      if (fieldResult.success) {
        if (fieldResult.data !== undefined) result[key] = fieldResult.data;
      } else {
        issues.push(...fieldResult.issues);
      }
    }

    return issues.length
      ? { success: false, issues }
      : { success: true, data: result as InferShape<S> };
  }

  toJSONSchema(): JSONSchema {
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, schema] of Object.entries(this.shape)) {
      properties[key] = schema.toJSONSchema();
      if (!(schema instanceof OptionalSchema)) required.push(key);
    }

    const schema: JSONSchema = {
      type: "object",
      properties,
      "x-content-type": "multipart/form-data",
    };
    if (required.length) schema.required = required;
    if (this.description) schema.description = this.description;
    return schema;
  }

  describe(description: string): FormDataSchema<S> {
    return new FormDataSchema(this.shape, description);
  }
}

// ─── Query params ─────────────────────────────────────────────────────────────

export class QuerySchema<S extends SchemaShape> extends Schema<InferShape<S>> {
  /** Marker used by the router to source from URLSearchParams instead of the body */
  readonly _isQuery = true as const;

  constructor(
    readonly shape: S,
    private readonly description?: string,
  ) {
    super();
  }

  _parse(value: unknown, path: (string | number)[]): ParseResult<InferShape<S>> {
    if (!(value instanceof URLSearchParams)) {
      return fail(path, `Expected URLSearchParams, got ${value === null ? "null" : typeof value}`);
    }

    const result: Record<string, unknown> = {};
    const issues: ValidationIssue[] = [];

    for (const [key, schema] of Object.entries(this.shape)) {
      const all = value.getAll(key);
      // Single value → unwrap; multiple values → keep as array; missing → undefined
      const raw: unknown = all.length === 0 ? undefined : all.length === 1 ? all[0] : all;

      const fieldResult = schema._parse(raw, [...path, key]);
      if (fieldResult.success) {
        if (fieldResult.data !== undefined) result[key] = fieldResult.data;
      } else {
        issues.push(...fieldResult.issues);
      }
    }

    return issues.length
      ? { success: false, issues }
      : { success: true, data: result as InferShape<S> };
  }

  toJSONSchema(): JSONSchema {
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, schema] of Object.entries(this.shape)) {
      properties[key] = schema.toJSONSchema();
      if (!(schema instanceof OptionalSchema)) required.push(key);
    }

    const schema: JSONSchema = {
      type: "object",
      properties,
      "x-content-type": "query",
    };
    if (required.length) schema.required = required;
    if (this.description) schema.description = this.description;
    return schema;
  }

  describe(description: string): QuerySchema<S> {
    return new QuerySchema(this.shape, description);
  }
}

// ─── Factory namespace ────────────────────────────────────────────────────────

export const s = {
  string: (): StringSchema => new StringSchema(),
  number: (): NumberSchema => new NumberSchema(),
  boolean: (): BooleanSchema => new BooleanSchema(),
  literal: <T extends string | number | boolean | null>(value: T): LiteralSchema<T> =>
    new LiteralSchema(value),
  object: <S extends SchemaShape>(shape: S): ObjectSchema<S> => new ObjectSchema(shape),
  array: <T>(items: Schema<T>): ArraySchema<T> => new ArraySchema(items),
  union: <T extends UnionMembers>(...options: T): UnionSchema<T> => new UnionSchema(options),
  enum: <T extends string>(...values: T[]): EnumSchema<T> => new EnumSchema(values),
  optional: <T>(schema: Schema<T>): OptionalSchema<T> => new OptionalSchema(schema),
  nullable: <T>(schema: Schema<T>): NullableSchema<T> => new NullableSchema(schema),
  formData: <S extends SchemaShape>(shape: S): FormDataSchema<S> => new FormDataSchema(shape),
  query: <S extends SchemaShape>(shape: S): QuerySchema<S> => new QuerySchema(shape),
  file: (): FileSchema => new FileSchema(),
};

// ─── Type extraction ──────────────────────────────────────────────────────────

/** Extract the TypeScript type from a Schema */
export type Infer<S extends Schema<unknown>> = S["_output"];
