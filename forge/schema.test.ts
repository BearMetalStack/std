import { assertEquals, assertThrows } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import {
	ArraySchema,
	BooleanSchema,
	EnumSchema,
	FormDataSchema,
	LiteralSchema,
	NullableSchema,
	NumberSchema,
	ObjectSchema,
	OptionalSchema,
	s,
	Schema,
	SchemaError,
	StringSchema,
} from "./schema.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(schema: Schema<T>, value: unknown): T {
	const result = schema.safeParse(value);
	if (!result.success) {
		throw new Error(`Expected success, got: ${result.issues.map((i) => i.message).join("; ")}`);
	}
	return result.data;
}

function fail<T>(schema: Schema<T>, value: unknown): string[] {
	const result = schema.safeParse(value);
	if (result.success) {
		throw new Error(`Expected failure, got success with: ${JSON.stringify(result.data)}`);
	}
	return result.issues.map((i) => i.message);
}

// ─── s.string() ───────────────────────────────────────────────────────────────

describe("s.string()", () => {
	it("accepts strings", () => {
		assertEquals(ok(s.string(), "hello"), "hello");
		assertEquals(ok(s.string(), ""), "");
	});

	it("rejects non-strings", () => {
		fail(s.string(), 42);
		fail(s.string(), true);
		fail(s.string(), null);
		fail(s.string(), undefined);
		fail(s.string(), {});
	});

	it(".min() enforces minimum length", () => {
		assertEquals(ok(s.string().min(3), "abc"), "abc");
		fail(s.string().min(3), "ab");
	});

	it(".max() enforces maximum length", () => {
		assertEquals(ok(s.string().max(3), "abc"), "abc");
		fail(s.string().max(3), "abcd");
	});

	it(".email() validates email format", () => {
		assertEquals(ok(s.string().email(), "user@example.com"), "user@example.com");
		fail(s.string().email(), "notanemail");
		fail(s.string().email(), "@missing-local.com");
	});

	it(".url() validates URL format", () => {
		assertEquals(ok(s.string().url(), "https://example.com"), "https://example.com");
		fail(s.string().url(), "not a url");
	});

	it(".uuid() validates UUID format", () => {
		assertEquals(
			ok(s.string().uuid(), "123e4567-e89b-12d3-a456-426614174000"),
			"123e4567-e89b-12d3-a456-426614174000",
		);
		fail(s.string().uuid(), "not-a-uuid");
	});

	it(".regex() validates against a pattern", () => {
		assertEquals(ok(s.string().regex(/^\d+$/), "123"), "123");
		fail(s.string().regex(/^\d+$/), "abc");
	});

	it(".trim() strips whitespace before other checks", () => {
		assertEquals(ok(s.string().trim(), "  hello  "), "hello");
		assertEquals(ok(s.string().trim().min(3), "  abc  "), "abc");
		fail(s.string().trim().min(5), "  hi  ");
	});

	it("chains multiple checks", () => {
		const schema = s.string().min(2).max(10).email();
		assertEquals(ok(schema, "a@b.com"), "a@b.com");
		fail(schema, "x");
		fail(schema, "toolooooooong@example.com");
	});

	it("is immutable - chaining returns a new instance", () => {
		const base = s.string();
		const withMin = base.min(5);
		assertEquals(ok(base, "hi"), "hi");
		fail(withMin, "hi");
	});

	it(".toJSONSchema() emits correct JSON Schema", () => {
		assertEquals(s.string().toJSONSchema(), { type: "string" });
		assertEquals(s.string().min(2).max(10).toJSONSchema(), {
			type: "string",
			minLength: 2,
			maxLength: 10,
		});
		assertEquals(s.string().email().toJSONSchema(), { type: "string", format: "email" });
		assertEquals(s.string().uuid().toJSONSchema(), { type: "string", format: "uuid" });
		assertEquals(s.string().url().toJSONSchema(), { type: "string", format: "uri" });
	});
});

// ─── s.number() ───────────────────────────────────────────────────────────────

describe("s.number()", () => {
	it("accepts numbers", () => {
		assertEquals(ok(s.number(), 42), 42);
		assertEquals(ok(s.number(), -3.14), -3.14);
		assertEquals(ok(s.number(), 0), 0);
	});

	it("rejects non-numbers and NaN", () => {
		fail(s.number(), "42");
		fail(s.number(), null);
		fail(s.number(), NaN);
		fail(s.number(), true);
	});

	it(".min() and .max()", () => {
		assertEquals(ok(s.number().min(0), 0), 0);
		fail(s.number().min(0), -1);
		assertEquals(ok(s.number().max(10), 10), 10);
		fail(s.number().max(10), 11);
	});

	it(".gt() and .lt() are exclusive bounds", () => {
		assertEquals(ok(s.number().gt(0), 1), 1);
		fail(s.number().gt(0), 0);
		assertEquals(ok(s.number().lt(10), 9), 9);
		fail(s.number().lt(10), 10);
	});

	it(".int() rejects floats", () => {
		assertEquals(ok(s.number().int(), 5), 5);
		fail(s.number().int(), 5.5);
	});

	it(".positive() and .negative()", () => {
		assertEquals(ok(s.number().positive(), 1), 1);
		fail(s.number().positive(), 0);
		fail(s.number().positive(), -1);
		assertEquals(ok(s.number().negative(), -1), -1);
		fail(s.number().negative(), 0);
	});

	it(".multipleOf()", () => {
		assertEquals(ok(s.number().multipleOf(5), 10), 10);
		fail(s.number().multipleOf(5), 7);
	});

	it(".coerce() converts strings to numbers", () => {
		assertEquals(ok(s.number().coerce(), "42"), 42);
		fail(s.number().coerce(), "abc");
	});

	it(".toJSONSchema() emits correct JSON Schema", () => {
		assertEquals(s.number().toJSONSchema(), { type: "number" });
		assertEquals(s.number().int().toJSONSchema(), { type: "integer" });
		assertEquals(s.number().min(0).max(100).toJSONSchema(), {
			type: "number",
			minimum: 0,
			maximum: 100,
		});
		assertEquals(s.number().gt(0).lt(10).toJSONSchema(), {
			type: "number",
			exclusiveMinimum: 0,
			exclusiveMaximum: 10,
		});
	});
});

// ─── s.boolean() ──────────────────────────────────────────────────────────────

describe("s.boolean()", () => {
	it("accepts booleans", () => {
		assertEquals(ok(s.boolean(), true), true);
		assertEquals(ok(s.boolean(), false), false);
	});

	it("rejects non-booleans", () => {
		fail(s.boolean(), 1);
		fail(s.boolean(), "true");
		fail(s.boolean(), null);
	});

	it(".coerce() converts string/number representations", () => {
		assertEquals(ok(s.boolean().coerce(), "true"), true);
		assertEquals(ok(s.boolean().coerce(), "false"), false);
		assertEquals(ok(s.boolean().coerce(), 1), true);
		assertEquals(ok(s.boolean().coerce(), 0), false);
		fail(s.boolean().coerce(), "yes");
	});

	it(".toJSONSchema()", () => {
		assertEquals(s.boolean().toJSONSchema(), { type: "boolean" });
	});
});

// ─── s.literal() ──────────────────────────────────────────────────────────────

describe("s.literal()", () => {
	it("accepts only the exact value", () => {
		assertEquals(ok(s.literal("admin"), "admin"), "admin");
		assertEquals(ok(s.literal(42), 42), 42);
		assertEquals(ok(s.literal(true), true), true);
		assertEquals(ok(s.literal(null), null), null);
	});

	it("rejects anything else", () => {
		fail(s.literal("admin"), "user");
		fail(s.literal(42), 43);
		fail(s.literal(true), false);
	});

	it(".toJSONSchema() uses const", () => {
		assertEquals(s.literal("admin").toJSONSchema(), { const: "admin" });
		assertEquals(s.literal(42).toJSONSchema(), { const: 42 });
	});
});

// ─── s.enum() ─────────────────────────────────────────────────────────────────

describe("s.enum()", () => {
	it("accepts listed values", () => {
		const schema = s.enum("red", "green", "blue");
		assertEquals(ok(schema, "red"), "red");
		assertEquals(ok(schema, "blue"), "blue");
	});

	it("rejects values not in the list", () => {
		fail(s.enum("a", "b"), "c");
		fail(s.enum("a", "b"), 1);
	});

	it(".toJSONSchema()", () => {
		assertEquals(s.enum("a", "b", "c").toJSONSchema(), {
			type: "string",
			enum: ["a", "b", "c"],
		});
	});
});

// ─── s.object() ───────────────────────────────────────────────────────────────

describe("s.object()", () => {
	const User = s.object({
		name: s.string(),
		age: s.number(),
	});

	it("accepts valid objects", () => {
		assertEquals(ok(User, { name: "Alice", age: 30 }), { name: "Alice", age: 30 });
	});

	it("rejects non-objects", () => {
		fail(User, "string");
		fail(User, null);
		fail(User, []);
		fail(User, 42);
	});

	it("collects all field errors", () => {
		const errors = fail(User, { name: 123, age: "thirty" });
		assertEquals(errors.length, 2);
	});

	it("ignores extra fields", () => {
		const result = ok(User, { name: "Alice", age: 30, extra: "ignored" });
		assertEquals(result, { name: "Alice", age: 30 });
	});

	it(".extend() adds fields", () => {
		const Extended = User.extend({ email: s.string().email() });
		assertEquals(
			ok(Extended, { name: "Alice", age: 30, email: "a@b.com" }),
			{ name: "Alice", age: 30, email: "a@b.com" },
		);
		fail(Extended, { name: "Alice", age: 30 }); // missing email
	});

	it(".pick() selects fields", () => {
		const NameOnly = User.pick("name");
		assertEquals(ok(NameOnly, { name: "Alice" }), { name: "Alice" });
		fail(NameOnly, {});
	});

	it(".omit() removes fields", () => {
		const NoAge = User.omit("age");
		assertEquals(ok(NoAge, { name: "Alice" }), { name: "Alice" });
	});

	it(".partial() makes all fields optional", () => {
		const Partial = User.partial();
		const empty = ok(Partial, {});
		assertEquals(empty.name, undefined);
		assertEquals(empty.age, undefined);
		assertEquals(ok(Partial, { name: "Alice" }).name, "Alice");
	});

	it("nests correctly and reports the full path", () => {
		const schema = s.object({ inner: s.object({ x: s.number() }) });
		assertEquals(ok(schema, { inner: { x: 1 } }), { inner: { x: 1 } });
		const result = schema.safeParse({ inner: { x: "bad" } });
		if (result.success) throw new Error("expected failure");
		assertEquals(result.issues[0].path, ["inner", "x"]);
	});

	it(".toJSONSchema() emits required and properties", () => {
		const json = User.toJSONSchema();
		assertEquals(json.type, "object");
		assertEquals(json.required, ["name", "age"]);
		assertEquals(json.properties?.name, { type: "string" });
		assertEquals(json.properties?.age, { type: "number" });
	});

	it(".toJSONSchema() omits required for optional fields", () => {
		const schema = s.object({ name: s.string(), nick: s.string().optional() });
		const json = schema.toJSONSchema();
		assertEquals(json.required, ["name"]);
	});
});

// ─── s.array() ────────────────────────────────────────────────────────────────

describe("s.array()", () => {
	it("accepts arrays of the item type", () => {
		assertEquals(ok(s.array(s.string()), ["a", "b"]), ["a", "b"]);
		assertEquals(ok(s.array(s.number()), [1, 2, 3]), [1, 2, 3]);
		assertEquals(ok(s.array(s.string()), []), []);
	});

	it("rejects non-arrays", () => {
		fail(s.array(s.string()), "string");
		fail(s.array(s.string()), null);
	});

	it("validates each item and reports paths", () => {
		const errors = fail(s.array(s.number()), [1, "bad", 3]);
		assertEquals(errors.length, 1);
		// Path should include item index
		const result = s.array(s.number()).safeParse([1, "bad", 3]);
		if (!result.success) assertEquals(result.issues[0].path, [1]);
	});

	it(".min() and .max() check length", () => {
		fail(s.array(s.string()).min(2), ["a"]);
		assertEquals(ok(s.array(s.string()).min(2), ["a", "b"]), ["a", "b"]);
		fail(s.array(s.string()).max(2), ["a", "b", "c"]);
	});

	it(".nonempty() rejects empty arrays", () => {
		fail(s.array(s.string()).nonempty(), []);
		assertEquals(ok(s.array(s.string()).nonempty(), ["x"]), ["x"]);
	});

	it(".toJSONSchema()", () => {
		assertEquals(s.array(s.string()).toJSONSchema(), {
			type: "array",
			items: { type: "string" },
		});
		assertEquals(s.array(s.number()).min(1).max(5).toJSONSchema(), {
			type: "array",
			items: { type: "number" },
			minItems: 1,
			maxItems: 5,
		});
	});
});

// ─── s.union() ────────────────────────────────────────────────────────────────

describe("s.union()", () => {
	const StringOrNumber = s.union(s.string(), s.number());

	it("accepts values matching any member", () => {
		assertEquals(ok(StringOrNumber, "hello"), "hello");
		assertEquals(ok(StringOrNumber, 42), 42);
	});

	it("rejects values matching no member", () => {
		fail(StringOrNumber, true);
		fail(StringOrNumber, null);
	});

	it(".toJSONSchema() uses oneOf", () => {
		const json = StringOrNumber.toJSONSchema();
		assertEquals(json.oneOf?.length, 2);
		assertEquals(json.oneOf?.[0], { type: "string" });
		assertEquals(json.oneOf?.[1], { type: "number" });
	});
});

// ─── s.optional() ─────────────────────────────────────────────────────────────

describe("s.optional()", () => {
	it("accepts the wrapped type", () => {
		assertEquals(ok(s.optional(s.string()), "hello"), "hello");
	});

	it("accepts undefined", () => {
		assertEquals(ok(s.optional(s.string()), undefined), undefined);
	});

	it("still rejects wrong types", () => {
		fail(s.optional(s.string()), 42);
		fail(s.optional(s.string()), null);
	});

	it("can be used inline via .optional()", () => {
		assertEquals(ok(s.string().optional(), undefined), undefined);
		assertEquals(ok(s.string().optional(), "hi"), "hi");
	});
});

// ─── s.nullable() ─────────────────────────────────────────────────────────────

describe("s.nullable()", () => {
	it("accepts the wrapped type", () => {
		assertEquals(ok(s.nullable(s.string()), "hello"), "hello");
	});

	it("accepts null", () => {
		assertEquals(ok(s.nullable(s.string()), null), null);
	});

	it("still rejects undefined", () => {
		fail(s.nullable(s.string()), undefined);
	});

	it(".toJSONSchema() adds nullable: true", () => {
		assertEquals(s.nullable(s.string()).toJSONSchema(), {
			type: "string",
			nullable: true,
		});
	});
});

// ─── s.formData() ─────────────────────────────────────────────────────────────

describe("s.formData()", () => {
	const Upload = s.formData({
		title: s.string().min(1),
		file: s.file(),
		tags: s.string().optional(),
	});

	it("parses a FormData object", () => {
		const fd = new FormData();
		fd.set("title", "My Upload");
		fd.set("file", new File(["content"], "test.txt", { type: "text/plain" }));

		const result = ok(Upload, fd);
		assertEquals(result.title, "My Upload");
		assertEquals(result.file instanceof File, true);
		assertEquals(result.file.name, "test.txt");
	});

	it("rejects missing required fields", () => {
		const fd = new FormData();
		fd.set("title", "No file");
		fail(Upload, fd);
	});

	it("rejects non-FormData values", () => {
		fail(Upload, { title: "plain object" });
		fail(Upload, "string");
	});

	it("handles optional fields being absent", () => {
		const fd = new FormData();
		fd.set("title", "Hello");
		fd.set("file", new File(["x"], "x.txt"));
		const result = ok(Upload, fd);
		assertEquals(result.tags, undefined);
	});

	it("collects multiple values for a key into an array", () => {
		const Multi = s.formData({ tags: s.array(s.string()) });
		const fd = new FormData();
		fd.append("tags", "alpha");
		fd.append("tags", "beta");
		const result = ok(Multi, fd);
		assertEquals(result.tags, ["alpha", "beta"]);
	});

	it("._isFormData is true (used by router to pick formData parsing)", () => {
		assertEquals(Upload._isFormData, true);
	});

	it(".toJSONSchema() includes x-content-type marker", () => {
		const json = Upload.toJSONSchema();
		assertEquals(json["x-content-type"], "multipart/form-data");
		assertEquals(json.type, "object");
		assertEquals(json.required?.includes("title"), true);
		assertEquals(json.required?.includes("file"), true);
		assertEquals(json.required?.includes("tags"), false);
	});
});

// ─── s.file() ─────────────────────────────────────────────────────────────────

describe("s.file()", () => {
	it("accepts File instances", () => {
		const f = new File(["data"], "test.txt");
		assertEquals(ok(s.file(), f), f);
	});

	it("rejects non-File values", () => {
		fail(s.file(), "string");
		fail(s.file(), null);
		fail(s.file(), { name: "fake.txt" });
	});

	it(".toJSONSchema()", () => {
		assertEquals(s.file().toJSONSchema(), { type: "string", format: "binary" });
	});
});

// ─── Schema base - parse() and safeParse() ────────────────────────────────────

describe("Schema.parse()", () => {
	it("returns the parsed value on success", () => {
		assertEquals(s.string().parse("hello"), "hello");
	});

	it("throws SchemaError on failure", () => {
		assertThrows(() => s.string().parse(42), SchemaError);
	});

	it("SchemaError message lists all issues", () => {
		try {
			s.object({ a: s.string(), b: s.number() }).parse({ a: 1, b: "x" });
		} catch (e) {
			assertEquals(e instanceof SchemaError, true);
			assertEquals((e as SchemaError).issues.length, 2);
		}
	});
});

// ─── Type inference ───────────────────────────────────────────────────────────

describe("Schema type class checks", () => {
	it("each factory returns the correct class", () => {
		assertEquals(s.string() instanceof StringSchema, true);
		assertEquals(s.number() instanceof NumberSchema, true);
		assertEquals(s.boolean() instanceof BooleanSchema, true);
		assertEquals(s.literal("x") instanceof LiteralSchema, true);
		assertEquals(s.object({}) instanceof ObjectSchema, true);
		assertEquals(s.array(s.string()) instanceof ArraySchema, true);
		assertEquals(s.enum("a") instanceof EnumSchema, true);
		assertEquals(s.optional(s.string()) instanceof OptionalSchema, true);
		assertEquals(s.nullable(s.string()) instanceof NullableSchema, true);
		assertEquals(s.formData({}) instanceof FormDataSchema, true);
	});
});
