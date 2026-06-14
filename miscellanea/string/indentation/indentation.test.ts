import { assertEquals } from "@std/assert";

import { dedent } from "./mod.ts";
const correct = "\nthis is a base line\n\tthis is an indented line\n";
Deno.test("dedent tabs", () => {
	const indented = `
		this is a base line
			this is an indented line
		`;
	const dedented = dedent(indented);
	assertEquals(dedented, correct);
});
Deno.test("dedent spaces", () => {
	const indented = `
        this is a base line
            this is an indented line
        `;
	const dedented = dedent(indented);
	assertEquals(dedented, correct);
});
Deno.test("dedent spaces with different spacing", () => {
	const indented = `
    this is a base line
      this is an indented line
    `;
	const dedented = dedent(indented, 2);
	assertEquals(dedented, correct);
});

Deno.test("dedent with mixed tabs and spaces", () => {
	const indented = `
	this is a base line
	  this is an indented line
	`;
	const dedented = dedent(indented, 2);
	assertEquals(dedented, correct);
});
