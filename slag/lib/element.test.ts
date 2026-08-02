import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { SlagDocument } from "./document.ts";
import { SlagCSSStyleSheet } from "./css.ts";

Deno.test("attribute names are case-folded for HTML elements", () => {
	const document = new SlagDocument();
	const element = document.createElement("DIV");

	element.setAttribute("DataValue", "1");

	assertEquals(element.localName, "div");
	assertEquals(element.tagName, "DIV");
	assertEquals(element.getAttribute("datavalue"), "1");
	assertEquals(element.getAttributeNames(), ["datavalue"]);
	assertEquals(element.hasAttribute("DATAVALUE"), true);
});

Deno.test("classList reads and writes the class attribute", () => {
	const document = new SlagDocument();
	const element = document.createElement("div");

	element.classList.add("a", "b", "a");
	assertEquals(element.getAttribute("class"), "a b");
	assertEquals(element.classList.contains("b"), true);

	assertEquals(element.classList.toggle("b"), false);
	assertEquals(element.classList.toggle("c", true), true);
	assertEquals(element.className, "a c");

	element.classList.remove("a", "c");
	assertEquals(element.hasAttribute("class"), false, "an empty list drops the attribute");
});

Deno.test("dataset maps camelCase onto data- attributes", () => {
	const document = new SlagDocument();
	const element = document.createElement("div");

	element.dataset.serverProps = "eyJ9";

	assertEquals(element.getAttribute("data-server-props"), "eyJ9");
	assertEquals(element.dataset.serverProps, "eyJ9");
	assertEquals("serverProps" in element.dataset, true);
	assertEquals(Object.keys(element.dataset), ["serverProps"]);

	delete element.dataset.serverProps;
	assertEquals(element.dataset.serverProps, undefined);
	assertEquals(element.hasAttribute("data-server-props"), false);
});

Deno.test("dataset reads attributes set directly", () => {
	const document = new SlagDocument();
	const element = document.createElement("div");
	element.setAttribute("data-server-props", "payload");

	assertEquals(element.dataset.serverProps, "payload");
});

Deno.test("style is live against the style attribute", () => {
	const document = new SlagDocument();
	const element = document.createElement("div");

	element.style.backgroundColor = "red";
	assertEquals(element.getAttribute("style"), "background-color: red");
	assertEquals(element.style.backgroundColor, "red");

	element.setAttribute("style", "color: blue; margin-top: 2px");
	assertEquals(element.style.color, "blue");
	assertEquals(element.style.getPropertyValue("margin-top"), "2px");
	assertEquals(element.style.length, 2);

	element.style.removeProperty("color");
	assertEquals(element.getAttribute("style"), "margin-top: 2px");
});

Deno.test("attachShadow returns a root once, and hides a closed one", () => {
	const document = new SlagDocument();
	const open = document.createElement("div");
	const shadow = open.attachShadow({ mode: "open" });

	assertStrictEquals(open.shadowRoot, shadow);
	assertStrictEquals(shadow.host, open);
	assertThrows(() => open.attachShadow({ mode: "open" }), Error, "cannot be created twice");

	const closed = document.createElement("div");
	closed.attachShadow({ mode: "closed" });
	assertEquals(closed.shadowRoot, null);
});

Deno.test("adoptedStyleSheets holds constructed stylesheets", () => {
	const document = new SlagDocument();
	const host = document.createElement("div");
	const shadow = host.attachShadow({ mode: "open" });
	const sheet = new SlagCSSStyleSheet();
	sheet.replaceSync(":host { display: block }");

	shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];

	assertEquals(shadow.adoptedStyleSheets.length, 1);
	assertEquals(shadow.adoptedStyleSheets[0].cssText, ":host { display: block }");
});

Deno.test("innerHTML clears on empty and stores raw markup otherwise", () => {
	const document = new SlagDocument();
	const element = document.createElement("div");
	element.appendChild(document.createElement("span"));

	element.innerHTML = "";
	assertEquals(element.childNodes.length, 0);

	element.innerHTML = "<b>bold</b>";
	assertEquals(element.innerHTML, "<b>bold</b>");
	assertEquals(element.childNodes.length, 1, "unparsed markup is a single opaque node");
});

Deno.test("insertAdjacentHTML places raw markup at each position", () => {
	const document = new SlagDocument();
	const wrapper = document.createElement("div");
	const target = document.createElement("p");
	wrapper.appendChild(target);

	target.insertAdjacentHTML("beforebegin", "<i>1</i>");
	target.insertAdjacentHTML("afterbegin", "<i>2</i>");
	target.insertAdjacentHTML("beforeend", "<i>3</i>");
	target.insertAdjacentHTML("afterend", "<i>4</i>");

	assertEquals(wrapper.innerHTML, "<i>1</i><p><i>2</i><i>3</i></p><i>4</i>");
});

Deno.test("browser-only APIs are inert rather than missing", () => {
	const document = new SlagDocument();
	const element = document.createElement("button");
	let clicks = 0;
	element.addEventListener("click", () => clicks++);

	element.focus();
	element.blur();
	element.scrollIntoView();
	element.click();

	assertEquals(clicks, 1);
	assertEquals(element.getBoundingClientRect().width, 0);
});

Deno.test("events capture, target, and bubble through the tree", () => {
	const document = new SlagDocument();
	const outer = document.createElement("div");
	const inner = document.createElement("span");
	outer.appendChild(inner);
	document.body.appendChild(outer);

	const seen: string[] = [];
	outer.addEventListener("ping", () => seen.push("capture"), { capture: true });
	outer.addEventListener("ping", () => seen.push("bubble"));
	inner.addEventListener("ping", () => seen.push("target"));

	inner.dispatchEvent(new Event("ping", { bubbles: true }));
	assertEquals(seen, ["capture", "target", "bubble"]);

	seen.length = 0;
	inner.dispatchEvent(new Event("ping"));
	assertEquals(seen, ["capture", "target"], "a non-bubbling event still captures");
});

Deno.test("stopPropagation halts the walk", () => {
	const document = new SlagDocument();
	const outer = document.createElement("div");
	const inner = document.createElement("span");
	outer.appendChild(inner);
	document.body.appendChild(outer);

	const seen: string[] = [];
	outer.addEventListener("ping", () => seen.push("outer"));
	inner.addEventListener("ping", (event) => {
		seen.push("inner");
		event.stopPropagation();
	});

	inner.dispatchEvent(new Event("ping", { bubbles: true }));
	assertEquals(seen, ["inner"]);
});

Deno.test("a composed event does not escape a shadow root", () => {
	// A documented limitation: Deno's EventTarget tracks a shadow host in an
	// internal slot Slag cannot set, so the event path ends at the shadow root.
	const document = new SlagDocument();
	const host = document.createElement("my-host");
	const shadow = host.attachShadow({ mode: "open" });
	const inner = document.createElement("b");
	shadow.appendChild(inner);
	document.body.appendChild(host);

	let escaped = false;
	document.body.addEventListener("zap", () => escaped = true);
	inner.dispatchEvent(new Event("zap", { bubbles: true, composed: true }));

	assertEquals(escaped, false);
});
