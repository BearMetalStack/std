/** @jsxImportSource @bearmetal/jsx */
import { installGlobals } from "@bearmetal/slag";
installGlobals();

import { assertEquals } from "@std/assert";
import type { JSX } from "../types.ts";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

Deno.test("svg: presentation attributes keep their kebab-case names", () => {
	const svg = (
		<svg viewBox="0 0 24 24" width={24} height={24} fill="none">
			<path
				d="M0 0L24 24"
				stroke="currentColor"
				stroke-width={2}
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	) as SVGSVGElement;
	const path = svg.firstChild as SVGPathElement;
	assertEquals(svg.getAttribute("viewBox"), "0 0 24 24");
	assertEquals(path.getAttribute("stroke-width"), "2");
	assertEquals(path.getAttribute("stroke-linecap"), "round");
});

Deno.test("svg: a numeric width or height is unitless, not px", () => {
	const svg = <svg width={24} height={12} /> as SVGSVGElement;
	const mask = <mask width={1.2} height={1.2} /> as SVGMaskElement;
	assertEquals(svg.getAttribute("width"), "24");
	assertEquals(svg.getAttribute("height"), "12");
	assertEquals(mask.getAttribute("width"), "1.2");
	const img = <img width={24} /> as HTMLImageElement;
	assertEquals(img.getAttribute("width"), "24px");
});

Deno.test("svg: every SVG-only tag is built in the SVG namespace", () => {
	const tags = [
		<stop offset="50%" stop-color="red" />,
		<clipPath clipPathUnits="objectBoundingBox" />,
		<mask maskUnits="userSpaceOnUse" />,
		<pattern patternUnits="userSpaceOnUse" />,
		<symbol viewBox="0 0 1 1" />,
		<marker orient="auto-start-reverse" markerWidth={4} />,
		<image href="/a.png" />,
		<foreignObject width={10} height={10} />,
		<switch />,
		<desc />,
		<metadata />,
		<view viewBox="0 0 1 1" />,
		<animateMotion dur="1s" rotate="auto" />,
		<mpath href="#p" />,
		<feDropShadow stdDeviation={2} />,
		<feFuncA type="linear" slope={0.5} />,
	];
	for (const el of tags) assertEquals((el as Element).namespaceURI, SVG_NAMESPACE);
});

Deno.test("svg: a custom element starting with fe stays HTML", () => {
	const el = <fe-widget /> as Element;
	assertEquals(el.namespaceURI, "http://www.w3.org/1999/xhtml");
});

Deno.test("svg: gradients, filters and animation type-check and render", () => {
	const svg = (
		<svg>
			<defs>
				<linearGradient id="g" x1={0} x2={1} gradientUnits="objectBoundingBox">
					<stop offset={0} stop-color="#000" stop-opacity={0.5} />
				</linearGradient>
				<filter id="f" filterUnits="userSpaceOnUse">
					<feGaussianBlur in="SourceGraphic" stdDeviation={3} result="blur" />
					<feComposite in="blur" in2="SourceAlpha" operator="arithmetic" k2={1} />
				</filter>
			</defs>
			<circle cx={5} cy={5} r={4} fill="url(#g)" filter="url(#f)">
				<animate
					attributeName="r"
					from={4}
					to={2}
					dur="1s"
					repeatCount="indefinite"
					fill="freeze"
				/>
			</circle>
			<text x={0} y={10} text-anchor="middle" dominant-baseline="central">
				<tspan dy="1em">hi</tspan>
			</text>
		</svg>
	) as SVGSVGElement;
	assertEquals(
		svg.querySelector("animate")?.getAttribute("repeatCount"),
		"indefinite",
	);
});

Deno.test("svg: handlers are typed for the SVG element they are on", () => {
	let target: SVGCircleElement | undefined;
	const onClick = (e: JSX.ElementEvent<SVGCircleElement, "click">) => {
		target = e.currentTarget;
	};
	const circle = <circle onClick={onClick} /> as SVGCircleElement;
	circle.dispatchEvent(new Event("click"));
	assertEquals(target, circle);
});

Deno.test("svg: props the element does not take are rejected", () => {
	// @ts-expect-error: not an attribute of <path>
	<path href="#x" />;
	// @ts-expect-error: not a stroke-linecap
	<path stroke-linecap="pointy" />;
	// @ts-expect-error: animation elements take fill="freeze|remove", not paint
	<animate fill="red" />;
	// @ts-expect-error: not a gradientUnits value
	<linearGradient gradientUnits="pixels" />;
	// @ts-expect-error: HTML-only global
	<g popover />;
});
