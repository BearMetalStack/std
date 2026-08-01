import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { SlagDocument } from "./document.ts";
import { SlagHTMLElement } from "./element.ts";
import { customElementRegistry } from "./custom_elements.ts";

let counter = 0;
/** The registry is process-wide, exactly as in a browser — never reuse a tag. */
function freshTag(): string {
	return `slag-probe-${++counter}`;
}

interface Probe extends SlagHTMLElement {
	log: string[];
}

function defineProbe(): { tag: string; log: string[] } {
	const tag = freshTag();
	const log: string[] = [];
	class ProbeElement extends SlagHTMLElement {
		static get observedAttributes(): string[] {
			return ["watched"];
		}
		log = log;
		connectedCallback() {
			log.push("connected");
		}
		disconnectedCallback() {
			log.push("disconnected");
		}
		attributeChangedCallback(name: string, previous: string | null, value: string | null) {
			log.push(`attr:${name}:${previous}:${value}`);
		}
	}
	customElementRegistry.define(tag, ProbeElement);
	return { tag, log };
}

Deno.test("createElement upgrades a registered tag and infers its name", () => {
	const { tag } = defineProbe();
	const document = new SlagDocument();

	const element = document.createElement(tag) as Probe;

	assertEquals(element.localName, tag);
	assertEquals(element.tagName, tag.toUpperCase());
	assertEquals(Array.isArray(element.log), true, "the registered class was constructed");
});

Deno.test("connectedCallback fires only once the node reaches the document", () => {
	const { tag, log } = defineProbe();
	const document = new SlagDocument();
	const element = document.createElement(tag);
	const detached = document.createElement("div");

	detached.appendChild(element);
	assertEquals(log, [], "a detached parent connects nothing");

	document.body.appendChild(detached);
	assertEquals(log, ["connected"]);

	detached.remove();
	assertEquals(log, ["connected", "disconnected"]);
});

Deno.test("a same-document move fires disconnected then connected", () => {
	const { tag, log } = defineProbe();
	const document = new SlagDocument();
	const from = document.createElement("div");
	const to = document.createElement("div");
	document.body.append(from, to);

	const element = document.createElement(tag);
	from.appendChild(element);
	assertEquals(log, ["connected"]);

	// This is the exact sequence a reactive child slot produces when it reinserts
	// content it has already mounted, and what BMElement's disconnect debounce
	// has to absorb.
	to.appendChild(element);
	assertEquals(log, ["connected", "disconnected", "connected"]);
	assertStrictEquals(element.parentNode, to);
});

Deno.test("reactions reach the whole subtree, in tree order", () => {
	const { tag, log } = defineProbe();
	const document = new SlagDocument();
	const wrapper = document.createElement("div");
	const outer = document.createElement(tag);
	const inner = document.createElement(tag);
	outer.appendChild(inner);
	wrapper.appendChild(outer);

	document.body.appendChild(wrapper);

	assertEquals(log, ["connected", "connected"]);
});

Deno.test("attributeChangedCallback fires only for observed attributes", () => {
	const { tag, log } = defineProbe();
	const document = new SlagDocument();
	const element = document.createElement(tag);

	element.setAttribute("ignored", "1");
	assertEquals(log, [], "unobserved attributes are silent");

	element.setAttribute("watched", "a");
	element.setAttribute("watched", "a");
	element.setAttribute("watched", "b");
	element.removeAttribute("watched");

	assertEquals(log, [
		"attr:watched:null:a",
		"attr:watched:a:b",
		"attr:watched:b:null",
	], "an unchanged write is not reported");
});

Deno.test("constructing a registered element directly recovers its tag", () => {
	const tag = freshTag();
	class Standalone extends SlagHTMLElement {}
	customElementRegistry.define(tag, Standalone);

	assertEquals(new Standalone().localName, tag);
});

Deno.test("constructing an unregistered element without a tag throws", () => {
	class Unregistered extends SlagHTMLElement {}
	assertThrows(() => new Unregistered(), Error, "not registered with customElements");
});

Deno.test("defining the same tag twice throws", () => {
	const tag = freshTag();
	class First extends SlagHTMLElement {}
	class Second extends SlagHTMLElement {}
	customElementRegistry.define(tag, First);

	assertThrows(() => customElementRegistry.define(tag, Second), Error, "already been used");
});

Deno.test("whenDefined resolves for a tag defined later", async () => {
	const tag = freshTag();
	class Later extends SlagHTMLElement {}
	const pending = customElementRegistry.whenDefined(tag);
	customElementRegistry.define(tag, Later);

	assertStrictEquals(await pending, Later);
});
