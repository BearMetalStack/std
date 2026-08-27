import { assertEquals, assertThrows } from "@std/assert";
import {
	defaultFilename,
	fileNameToSegment,
	moduleFnName,
	normalizePath,
	relativeSpecifier,
	segmentToFileName,
	splitSegments,
	validatePath,
} from "./path.ts";

Deno.test("normalizePath adds a leading slash and trims the trailing one", () => {
	assertEquals(normalizePath("api/users/"), "/api/users");
	assertEquals(normalizePath("/api//users"), "/api/users");
	assertEquals(normalizePath("/"), "/");
});

Deno.test("splitSegments returns the non-empty segments", () => {
	assertEquals(splitSegments("/api/users/:id"), ["api", "users", ":id"]);
	assertEquals(splitSegments("/"), []);
});

Deno.test("segmentToFileName maps params to underscore names", () => {
	assertEquals(segmentToFileName("users"), "users");
	assertEquals(segmentToFileName(":id"), "_id");
	assertEquals(segmentToFileName("*"), "_wildcard");
});

Deno.test("fileNameToSegment is the inverse", () => {
	assertEquals(fileNameToSegment("users.ts"), "users");
	assertEquals(fileNameToSegment("_id.ts"), ":id");
	assertEquals(fileNameToSegment("_wildcard"), "*");
});

Deno.test("moduleFnName builds a camelCase factory name", () => {
	assertEquals(moduleFnName("users"), "usersModule");
	assertEquals(moduleFnName(":id"), "idModule");
	assertEquals(moduleFnName("user-posts"), "userPostsModule");
});

Deno.test("defaultFilename uses the last segment", () => {
	assertEquals(defaultFilename("/api/users"), "users");
	assertEquals(defaultFilename("/api/users/:id"), "_id");
});

Deno.test("validatePath rejects empty and malformed paths", () => {
	assertThrows(() => validatePath("/"));
	assertThrows(() => validatePath("/api/ /users"));
	assertEquals(validatePath("api/users"), "/api/users");
});

Deno.test("relativeSpecifier computes module specifiers", () => {
	assertEquals(
		relativeSpecifier("/app/routes/api/mod.ts", "/app/routes/api/users.ts"),
		"./users.ts",
	);
	assertEquals(
		relativeSpecifier("/app/routes/api/users.ts", "/app/schemas.ts"),
		"../../schemas.ts",
	);
	assertEquals(
		relativeSpecifier("/app/routes/api/mod.ts", "/app/routes/api/users/mod.ts"),
		"./users/mod.ts",
	);
});
