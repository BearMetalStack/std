/** @jsxRuntime automatic */
/** @jsxImportSource @bearmetal/jsx */
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assertType, type IsExact } from "@std/testing/types";
import type { JSX } from "../types.ts";

type Handler<Tag extends keyof JSX.IntrinsicElements, Prop extends string> = NonNullable<
	JSX.IntrinsicElements[Tag][Prop]
>;
type EventOf<Tag extends keyof JSX.IntrinsicElements, Prop extends string> = Parameters<
	Handler<Tag, Prop>
>[0];

Deno.test("submit on a form targets the form", () => {
	type E = EventOf<"form", "onSubmit">;
	assertType<IsExact<E["target"], HTMLFormElement>>(true);
	assertType<IsExact<E["currentTarget"], HTMLFormElement>>(true);
	assertType<IsExact<E["submitter"], HTMLElement | null>>(true);
});

Deno.test("input on a form control targets the control", () => {
	assertType<IsExact<EventOf<"input", "onInput">["target"], HTMLInputElement>>(true);
	assertType<IsExact<EventOf<"textarea", "onChange">["target"], HTMLTextAreaElement>>(true);
	assertType<IsExact<EventOf<"select", "onChange">["target"], HTMLSelectElement>>(true);
});

Deno.test("a bubbling event keeps an open target and a typed currentTarget", () => {
	type E = EventOf<"button", "onClick">;
	assertType<IsExact<E["target"], EventTarget | null>>(true);
	assertType<IsExact<E["currentTarget"], HTMLButtonElement>>(true);
	assertType<IsExact<E["clientX"], number>>(true);
});

Deno.test("a non-bubbling event targets the element", () => {
	assertType<IsExact<EventOf<"div", "onFocus">["target"], HTMLDivElement>>(true);
	assertType<IsExact<EventOf<"dialog", "onClose">["target"], HTMLDialogElement>>(true);
});

Deno.test("element-specific event maps are used", () => {
	type E = EventOf<"video", "onEnterpictureinpicture">;
	assertType<IsExact<E["pictureInPictureWindow"], PictureInPictureWindow>>(true);
});

Deno.test("handlers infer their event from the element in JSX", () => {
	<form
		onSubmit={(e) => {
			assertType<IsExact<typeof e.target, HTMLFormElement>>(true);
		}}
	/>;
	<input
		onInput={(e) => {
			assertType<IsExact<typeof e.target.value, string>>(true);
		}}
	/>;
});

Deno.test("extracted handlers can be typed with the exported generics", () => {
	const save = (e: JSX.TargetedEvent<HTMLFormElement, SubmitEvent>) => e.target.reset();
	const search = (e: JSX.ElementEvent<HTMLInputElement, "input">) => e.target.value;
	const click: JSX.EventHandler<JSX.ElementEvent<HTMLButtonElement, "click">> = (e) =>
		e.currentTarget.disabled;
	<form onSubmit={save} />;
	<input onInput={search} />;
	<button type="button" onClick={click} />;

	// @ts-expect-error a form's submit handler does not fit an input
	<input onInput={save} />;
	// @ts-expect-error click's target may be a descendant, so it is not narrowed
	<button type="button" onClick={(e: JSX.TargetedEvent<HTMLButtonElement, MouseEvent>) => e} />;
});
