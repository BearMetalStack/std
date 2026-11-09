import { assertEquals, assertThrows } from "@std/assert";
import { getCurrentOwner, type Owner, setCurrentOwner } from "@bearmetal/jsx/jsx-runtime";
import { borrowOwnership } from "./ownership.ts";

Deno.test("borrowOwnership restores the previous owner when the action throws", () => {
	const parent: Owner = { registerCleanup: () => {} };
	setCurrentOwner(parent);
	try {
		assertThrows(() =>
			borrowOwnership({ registerCleanup: () => {} }, () => {
				throw new Error("boom");
			}, () => {})
		);
		assertEquals(getCurrentOwner(), parent);
	} finally {
		setCurrentOwner(null);
	}
});
