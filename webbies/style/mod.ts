import { css } from "@bearmetal/miscellanea";
export * from "./animations.ts";
import "./components.css";

// const GLOBAL_STYLES = css`
// 	/* ============================================================
// 	   BearMetal Webbies — Base Stylesheet
// 	   ============================================================ */

// 	/* ============================================================
// 	   SECTION 1 — TOKEN LAYER
// 	   ============================================================ */

// 	:root {
// 		/* ----------------------------------------------------------
// 		   COLOR — Brand
// 		   ---------------------------------------------------------- */
// 		--color-bearmetal-50: #f5eeff;
// 		--color-bearmetal-100: #e8ccff;
// 		--color-bearmetal-200: #cc99ff;
// 		--color-bearmetal-300: #aa55ee;
// 		--color-bearmetal-400: #7711cc;
// 		--color-bearmetal-600: #36005c;
// 		--color-bearmetal-500: #4a0080;
// 		--color-bearmetal-700: #290047;
// 		--color-bearmetal-800: #1a0030;
// 		--color-bearmetal-900: #0d0018;
// 		--color-bearmetal-950: #060009;

// 		/* ----------------------------------------------------------
// 		   COLOR — Brand Grey
// 		   ---------------------------------------------------------- */
// 		--color-bearmetal-grey-50: #faf8fc;
// 		--color-bearmetal-grey-100: #f2eff6;
// 		--color-bearmetal-grey-200: #e8e4f0;
// 		--color-bearmetal-grey-300: #d8d2e6;
// 		--color-bearmetal-grey-400: #c2bace;
// 		--color-bearmetal-grey-500: #a89eb8;
// 		--color-bearmetal-grey-600: #7a7085;
// 		--color-bearmetal-grey-700: #544d5e;
// 		--color-bearmetal-grey-800: #332d3a;
// 		--color-bearmetal-grey-900: #1c1820;
// 		--color-bearmetal-grey-950: #100d14;

// 		/* ----------------------------------------------------------
// 		   COLOR — Brand Success
// 		   ---------------------------------------------------------- */
// 		--color-bearmetal-success-50: #f0faf1;
// 		--color-bearmetal-success-100: #d6f5d8;
// 		--color-bearmetal-success-200: #a8e8ac;
// 		--color-bearmetal-success-300: #6bcf72;
// 		--color-bearmetal-success-400: #2ea838;
// 		--color-bearmetal-success-500: #005c08;
// 		--color-bearmetal-success-600: #004d07;
// 		--color-bearmetal-success-700: #003d05;
// 		--color-bearmetal-success-800: #002803;
// 		--color-bearmetal-success-900: #001602;
// 		--color-bearmetal-success-950: #000a01;

// 		/* ----------------------------------------------------------
// 		   COLOR — Brand Danger
// 		   ---------------------------------------------------------- */
// 		--color-bearmetal-danger-50: #fdf0f4;
// 		--color-bearmetal-danger-100: #f8d6e3;
// 		--color-bearmetal-danger-200: #f0a8c2;
// 		--color-bearmetal-danger-300: #d96690;
// 		--color-bearmetal-danger-400: #b03060;
// 		--color-bearmetal-danger-500: #5c0026;
// 		--color-bearmetal-danger-600: #4a001e;
// 		--color-bearmetal-danger-700: #380016;
// 		--color-bearmetal-danger-800: #25000e;
// 		--color-bearmetal-danger-900: #140008;
// 		--color-bearmetal-danger-950: #0a0004;

// 		/* ----------------------------------------------------------
// 		   COLOR — Brand Warning
// 		   ---------------------------------------------------------- */
// 		--color-bearmetal-warning-50: #fdf9ee;
// 		--color-bearmetal-warning-100: #faefc8;
// 		--color-bearmetal-warning-200: #f5dc88;
// 		--color-bearmetal-warning-300: #e8c030;
// 		--color-bearmetal-warning-400: #a88800;
// 		--color-bearmetal-warning-500: #3d2e00;
// 		--color-bearmetal-warning-600: #332600;
// 		--color-bearmetal-warning-700: #261c00;
// 		--color-bearmetal-warning-800: #181100;
// 		--color-bearmetal-warning-900: #0d0900;
// 		--color-bearmetal-warning-950: #070400;

// 		/* ----------------------------------------------------------
// 		   COLOR — Brand Info
// 		   ---------------------------------------------------------- */
// 		--color-bearmetal-info-50: #eef4fd;
// 		--color-bearmetal-info-100: #cce0f8;
// 		--color-bearmetal-info-200: #96c4f0;
// 		--color-bearmetal-info-300: #4e9add;
// 		--color-bearmetal-info-400: #1a6ab8;
// 		--color-bearmetal-info-500: #001f4a;
// 		--color-bearmetal-info-600: #001838;
// 		--color-bearmetal-info-700: #001028;
// 		--color-bearmetal-info-800: #000a18;
// 		--color-bearmetal-info-900: #00050e;
// 		--color-bearmetal-info-950: #000208;

// 		/* ----------------------------------------------------------
// 		   COLOR — Neutral
// 		   ---------------------------------------------------------- */
// 		--color-bearmetal-pebble-0: #ffffff;
// 		--color-bearmetal-pebble-50: #f8fafc;
// 		--color-bearmetal-pebble-100: #f1f5f9;
// 		--color-bearmetal-pebble-200: #e2e8f0;
// 		--color-bearmetal-pebble-300: #cbd5e1;
// 		--color-bearmetal-pebble-400: #94a3b8;
// 		--color-bearmetal-pebble-500: #64748b;
// 		--color-bearmetal-pebble-600: #475569;
// 		--color-bearmetal-pebble-700: #334155;
// 		--color-bearmetal-pebble-800: #1e293b;
// 		--color-bearmetal-pebble-900: #0f172a;
// 		--color-bearmetal-pebble-950: #020617;

// 		/* ----------------------------------------------------------
// 		   COLOR — Semantic
// 		   ---------------------------------------------------------- */
// 		--color-success-text: var(--color-bearmetal-success-500);
// 		--color-success-bg: var(--color-bearmetal-success-50);
// 		--color-success-light: var(--color-bearmetal-success-100);
// 		--color-success: var(--color-bearmetal-success-500);
// 		--color-success-vibrant: var(--color-bearmetal-success-400);
// 		--color-success-dark: var(--color-bearmetal-success-700);

// 		--color-warning-text: var(--color-bearmetal-warning-500);
// 		--color-warning-bg: var(--color-bearmetal-warning-50);
// 		--color-warning-light: var(--color-bearmetal-warning-100);
// 		--color-warning: var(--color-bearmetal-warning-500);
// 		--color-warning-vibrant: var(--color-bearmetal-warning-400);
// 		--color-warning-dark: var(--color-bearmetal-warning-700);

// 		--color-danger-text: var(--color-bearmetal-danger-500);
// 		--color-danger-bg: var(--color-bearmetal-danger-50);
// 		--color-danger-light: var(--color-bearmetal-danger-100);
// 		--color-danger: var(--color-bearmetal-danger-500);
// 		--color-danger-vibrant: var(--color-bearmetal-danger-400);
// 		--color-danger-dark: var(--color-bearmetal-danger-700);

// 		--color-info-text: var(--color-bearmetal-info-500);
// 		--color-info-bg: var(--color-bearmetal-info-50);
// 		--color-info-light: var(--color-bearmetal-info-100);
// 		--color-info: var(--color-bearmetal-info-500);
// 		--color-info-vibrant: var(--color-bearmetal-info-400);
// 		--color-info-dark: var(--color-bearmetal-info-700);

// 		/* ----------------------------------------------------------
// 		   COLOR — Surface / Background aliases
// 		   ---------------------------------------------------------- */
// 		--color-bg: var(--color-bearmetal-grey-50);
// 		--color-bg-subtle: var(--color-bearmetal-grey-100);
// 		--color-bg-muted: var(--color-bearmetal-grey-200);
// 		--color-bg-emphasis: var(--color-bearmetal-grey-300);

// 		--color-surface: var(--color-bearmetal-grey-50);
// 		--color-surface-raised: var(--color-bearmetal-grey-100);
// 		--color-surface-overlay: var(--color-bearmetal-grey-50);

// 		/* ----------------------------------------------------------
// 		   COLOR — Text aliases
// 		   ---------------------------------------------------------- */
// 		--color-text: var(--color-bearmetal-grey-950);
// 		--color-text-subtle: var(--color-bearmetal-grey-700);
// 		--color-text-muted: var(--color-bearmetal-grey-600);
// 		--color-text-disabled: var(--color-bearmetal-pebble-300);
// 		--color-text-inverse: var(--color-bearmetal-pebble-0);
// 		--color-text-on-brand: var(--color-bearmetal-pebble-0);

// 		/* ----------------------------------------------------------
// 		   COLOR — Border aliases
// 		   ---------------------------------------------------------- */
// 		--color-border: var(--color-bearmetal-grey-200);
// 		--color-border-strong: var(--color-bearmetal-grey-300);
// 		--color-border-subtle: var(--color-bearmetal-grey-100);
// 		--color-border-focus: var(--color-bearmetal-info-300);

// 		/* ----------------------------------------------------------
// 		   COLOR — Interactive aliases
// 		   ---------------------------------------------------------- */
// 		--color-interactive: var(--color-bearmetal-400);
// 		--color-interactive-hover: var(--color-bearmetal-500);
// 		--color-interactive-active: var(--color-bearmetal-700);
// 		--color-interactive-disabled: var(--color-bearmetal-pebble-300);
// 		--color-interactive-subtle: var(--color-bearmetal-50);

// 		/* ----------------------------------------------------------
// 		   TYPOGRAPHY — Font families
// 		   ---------------------------------------------------------- */
// 		--font-sans:
// 			"Urbanist",
// 			system-ui,
// 			-apple-system,
// 			BlinkMacSystemFont,
// 			"Segoe UI",
// 			Helvetica,
// 			Arial,
// 			sans-serif,
// 			"Apple Color Emoji";
// 		--font-serif: "Georgia", "Times New Roman", Times, serif;
// 		--font-mono:
// 			"JetBrains Mono",
// 			"Fira Code",
// 			"Cascadia Code",
// 			ui-monospace,
// 			"Courier New",
// 			monospace;
// 		--font-display: var(--font-sans);
// 		--font-body: var(--font-sans);

// 		/* ----------------------------------------------------------
// 		   TYPOGRAPHY — Scale (Major Third: 1.25)
// 		   ---------------------------------------------------------- */
// 		--text-xs: 0.64rem;
// 		--text-sm: 0.8rem;
// 		--text-base: 1rem;
// 		--text-md: 1.25rem;
// 		--text-lg: 1.563rem;
// 		--text-xl: 1.953rem;
// 		--text-2xl: 2.441rem;
// 		--text-3xl: 3.052rem;
// 		--text-4xl: 3.815rem;

// 		/* ----------------------------------------------------------
// 		   TYPOGRAPHY — Line heights
// 		   ---------------------------------------------------------- */
// 		--leading-none: 1;
// 		--leading-tight: 1.25;
// 		--leading-snug: 1.375;
// 		--leading-normal: 1.5;
// 		--leading-relaxed: 1.625;
// 		--leading-loose: 2;

// 		/* ----------------------------------------------------------
// 		   TYPOGRAPHY — Font weights
// 		   ---------------------------------------------------------- */
// 		--weight-thin: 100;
// 		--weight-light: 300;
// 		--weight-normal: 400;
// 		--weight-medium: 500;
// 		--weight-semibold: 600;
// 		--weight-bold: 700;
// 		--weight-extrabold: 800;
// 		--weight-black: 900;

// 		/* ----------------------------------------------------------
// 		   TYPOGRAPHY — Letter spacing
// 		   ---------------------------------------------------------- */
// 		--tracking-tighter: -0.05em;
// 		--tracking-tight: -0.025em;
// 		--tracking-normal: 0;
// 		--tracking-wide: 0.025em;
// 		--tracking-wider: 0.05em;
// 		--tracking-widest: 0.1em;

// 		/* ----------------------------------------------------------
// 		   SPACING
// 		   ---------------------------------------------------------- */
// 		--space-unit: 0.25rem;
// 		--space-0: 0;
// 		--space-px: 1px;
// 		--space-0-5: calc(var(--space-unit) * 0.5);
// 		--space-1: calc(var(--space-unit) * 1);
// 		--space-1-5: calc(var(--space-unit) * 1.5);
// 		--space-2: calc(var(--space-unit) * 2);
// 		--space-2-5: calc(var(--space-unit) * 2.5);
// 		--space-3: calc(var(--space-unit) * 3);
// 		--space-4: calc(var(--space-unit) * 4);
// 		--space-5: calc(var(--space-unit) * 5);
// 		--space-6: calc(var(--space-unit) * 6);
// 		--space-7: calc(var(--space-unit) * 7);
// 		--space-8: calc(var(--space-unit) * 8);
// 		--space-10: calc(var(--space-unit) * 10);
// 		--space-12: calc(var(--space-unit) * 12);
// 		--space-14: calc(var(--space-unit) * 14);
// 		--space-16: calc(var(--space-unit) * 16);
// 		--space-20: calc(var(--space-unit) * 20);
// 		--space-24: calc(var(--space-unit) * 24);
// 		--space-32: calc(var(--space-unit) * 32);
// 		--space-40: calc(var(--space-unit) * 40);
// 		--space-48: calc(var(--space-unit) * 48);
// 		--space-64: calc(var(--space-unit) * 64);

// 		/* ----------------------------------------------------------
// 		   BORDER RADIUS
// 		   ---------------------------------------------------------- */
// 		--radius-none: 0;
// 		--radius-sm: 0.125rem;
// 		--radius-base: 0.25rem;
// 		--radius-md: 0.375rem;
// 		--radius-lg: 0.5rem;
// 		--radius-xl: 0.75rem;
// 		--radius-2xl: 1rem;
// 		--radius-3xl: 1.5rem;
// 		--radius-full: 9999px;

// 		/* ----------------------------------------------------------
// 		   BORDER WIDTH
// 		   ---------------------------------------------------------- */
// 		--border-0: 0;
// 		--border-1: 1px;
// 		--border-1-5: 1.5px;
// 		--border-2: 2px;
// 		--border-4: 4px;
// 		--border-8: 8px;

// 		/* ----------------------------------------------------------
// 		   SHADOWS
// 		   ---------------------------------------------------------- */
// 		--shadow-none: none;
// 		--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
// 		--shadow-sm:
// 			0 1px 3px 0 rgb(0 0 0 / 0.10),
// 			0 1px 2px -1px rgb(0 0 0 / 0.10);
// 		--shadow-base:
// 			0 4px 6px -1px rgb(0 0 0 / 0.10),
// 			0 2px 4px -2px rgb(0 0 0 / 0.10);
// 		--shadow-md:
// 			0 10px 15px -3px rgb(0 0 0 / 0.10),
// 			0 4px 6px -4px rgb(0 0 0 / 0.10);
// 		--shadow-lg:
// 			0 20px 25px -5px rgb(0 0 0 / 0.10),
// 			0 8px 10px -6px rgb(0 0 0 / 0.10);
// 		--shadow-xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
// 		--shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
// 		--shadow-focus: 0 0 0 3px rgb(from var(--color-bearmetal-600) r g b / 0.35);

// 		/* ----------------------------------------------------------
// 		   Z-INDEX
// 		   ---------------------------------------------------------- */
// 		--z-hide: -1;
// 		--z-base: 0;
// 		--z-raised: 10;
// 		--z-dropdown: 100;
// 		--z-sticky: 200;
// 		--z-overlay: 300;
// 		--z-modal: 400;
// 		--z-popover: 500;
// 		--z-toast: 600;
// 		--z-tooltip: 700;
// 		--z-top: 9999;

// 		/* ----------------------------------------------------------
// 		   TRANSITIONS
// 		   ---------------------------------------------------------- */
// 		--duration-instant: 0ms;
// 		--duration-fast: 80ms;
// 		--duration-base: 150ms;
// 		--duration-slow: 300ms;
// 		--duration-slower: 500ms;
// 		--duration-lazy: 700ms;

// 		--ease-linear: linear;
// 		--ease-in: cubic-bezier(0.4, 0, 1, 1);
// 		--ease-out: cubic-bezier(0, 0, 0.2, 1);
// 		--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
// 		--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
// 		--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);

// 		--transition-colors:
// 			color var(--duration-base) var(--ease-in-out),
// 			background-color var(--duration-base) var(--ease-in-out),
// 			border-color var(--duration-base) var(--ease-in-out),
// 			text-decoration-color var(--duration-base) var(--ease-in-out),
// 			fill var(--duration-base) var(--ease-in-out),
// 			stroke var(--duration-base) var(--ease-in-out);
// 		--transition-opacity: opacity var(--duration-base) var(--ease-in-out);
// 		--transition-shadow: box-shadow var(--duration-base) var(--ease-in-out);
// 		--transition-transform: transform var(--duration-base) var(--ease-in-out);
// 		--transition-all: all var(--duration-base) var(--ease-in-out);

// 		/* ----------------------------------------------------------
// 		   LAYOUT
// 		   ---------------------------------------------------------- */
// 		--bp-xs: 480px;
// 		--bp-sm: 640px;
// 		--bp-md: 768px;
// 		--bp-lg: 1024px;
// 		--bp-xl: 1280px;
// 		--bp-2xl: 1536px;

// 		--container-xs: 480px;
// 		--container-sm: 640px;
// 		--container-md: 768px;
// 		--container-lg: 1024px;
// 		--container-xl: 1280px;
// 		--container-2xl: 1536px;
// 		--container-prose: 65ch;

// 		--grid-cols: 12;
// 		--grid-gap: var(--space-6);

// 		/* ----------------------------------------------------------
// 		   COMPONENT TOKENS — Button
// 		   ---------------------------------------------------------- */
// 		--btn-font-family: var(--font-body);
// 		--btn-font-weight: var(--weight-semibold);
// 		--btn-letter-spacing: var(--tracking-wide);
// 		--btn-border-width: var(--border-2);
// 		--btn-transition:
// 			var(--transition-colors),
// 			var(--transition-shadow),
// 			var(--transition-transform);

// 			--btn-padding-y-xs: var(--space-1);
// 			--btn-padding-x-xs: var(--space-2);
// 			--btn-font-size-xs: var(--text-xs);
// 			--btn-radius-xs: var(--radius-base);

// 			--btn-padding-y-sm: var(--space-1-5);
// 			--btn-padding-x-sm: var(--space-3);
// 			--btn-font-size-sm: var(--text-sm);
// 			--btn-radius-sm: var(--radius-md);

// 			--btn-padding-y-base: var(--space-2);
// 			--btn-padding-x-base: var(--space-4);
// 			--btn-font-size-base: var(--text-base);
// 			--btn-radius-base: var(--radius-md);

// 			--btn-padding-y-lg: var(--space-3);
// 			--btn-padding-x-lg: var(--space-6);
// 			--btn-font-size-lg: var(--text-md);
// 			--btn-radius-lg: var(--radius-lg);

// 			--btn-primary-bg: var(--color-interactive);
// 			--btn-primary-bg-hover: var(--color-interactive-hover);
// 			--btn-primary-bg-active: var(--color-interactive-active);
// 			--btn-primary-color: var(--color-text-on-brand);
// 			--btn-primary-border: transparent;
// 			--btn-primary-shadow: var(--shadow-xs);

// 			--btn-secondary-bg: var(--color-surface);
// 			--btn-secondary-bg-hover: var(--color-bg-muted);
// 			--btn-secondary-color: var(--color-text);
// 			--btn-secondary-border: var(--color-border-strong);
// 			--btn-secondary-shadow: var(--shadow-xs);

// 			--btn-ghost-bg: transparent;
// 			--btn-ghost-bg-hover: var(--color-bg-muted);
// 			--btn-ghost-color: var(--color-text-subtle);
// 			--btn-ghost-border: transparent;

// 			--btn-danger-bg: var(--color-bearmetal-danger-300);
// 			--btn-danger-bg-hover: var(--color-danger-dark);
// 			--btn-danger-color: var(--color-bearmetal-pebble-0);
// 			--btn-danger-border: transparent;

// 			--btn-warning-bg: var(--color-bearmetal-warning-300);
// 			--btn-warning-bg-hover: var(--color-warning-dark);
// 			--btn-warning-color: var(--color-bearmetal-pebble-0);
// 			--btn-warning-border: transparent;

// 			--btn-info-bg: var(--color-bearmetal-info-300);
// 			--btn-info-bg-hover: var(--color-info-dark);
// 			--btn-info-color: var(--color-bearmetal-pebble-0);
// 			--btn-info-border: transparent;

// 			--btn-success-bg: var(--color-bearmetal-success-300);
// 			--btn-success-bg-hover: var(--color-success-dark);
// 			--btn-success-color: var(--color-bearmetal-pebble-0);
// 			--btn-success-border: transparent;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Input / Textarea / Select
// 			   ---------------------------------------------------------- */
// 			--input-font-family: var(--font-body);
// 			--input-font-size: var(--text-base);
// 			--input-font-size-sm: var(--text-sm);
// 			--input-font-size-lg: var(--text-md);
// 			--input-bg: var(--color-surface);
// 			--input-bg-disabled: var(--color-bg-muted);
// 			--input-color: var(--color-text);
// 			--input-color-placeholder: var(--color-text-muted);
// 			--input-border: var(--color-border-strong);
// 			--input-border-hover: var(--color-bearmetal-pebble-400);
// 			--input-border-focus: var(--color-border-focus);
// 			--input-border-error: var(--color-danger);
// 			--input-border-width: var(--border-1);
// 			--input-radius: var(--radius-md);
// 			--input-padding-y: var(--space-2);
// 			--input-padding-x: var(--space-3);
// 			--input-shadow: var(--shadow-xs);
// 			--input-shadow-focus: var(--shadow-focus);
// 			--input-transition: var(--transition-colors), var(--transition-shadow);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Card
// 			   ---------------------------------------------------------- */
// 			--card-bg: var(--color-surface);
// 			--card-border: var(--color-border);
// 			--card-border-width: var(--border-1);
// 			--card-radius: var(--radius-base);
// 			--card-shadow: var(--shadow-sm);
// 			--card-padding: var(--space-6);
// 			--card-padding-sm: var(--space-4);
// 			--card-padding-lg: var(--space-8);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Badge / Tag
// 			   ---------------------------------------------------------- */
// 			--badge-font-size: var(--text-xs);
// 			--badge-font-weight: var(--weight-semibold);
// 			--badge-padding-y: var(--space-0-5);
// 			--badge-padding-x: var(--space-2);
// 			--badge-radius: var(--radius-full);
// 			--badge-letter-spacing: var(--tracking-wide);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Modal / Dialog
// 			   ---------------------------------------------------------- */
// 			--modal-bg: var(--color-surface-overlay);
// 			--modal-border: var(--color-border);
// 			--modal-radius: var(--radius-2xl);
// 			--modal-shadow: var(--shadow-xl);
// 			--modal-padding: var(--space-8);
// 			--modal-max-width-sm: 24rem;
// 			--modal-max-width-base: 32rem;
// 			--modal-max-width-lg: 48rem;
// 			--modal-max-width-xl: 64rem;
// 			--modal-backdrop: rgb(0 0 0 / 0.5);
// 			--modal-backdrop-blur: 4px;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Popover
// 			   ---------------------------------------------------------- */
// 			--popover-bg: var(--color-surface-overlay);
// 			--popover-border: var(--color-border);
// 			--popover-radius: var(--radius-lg);
// 			--popover-shadow: var(--shadow-xl);
// 			--popover-padding: var(--space-2);
// 			--popover-max-width: 24rem;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Drawer
// 			   ---------------------------------------------------------- */
// 			--drawer-bg: var(--modal-bg);
// 			--drawer-border: var(--modal-border);
// 			--drawer-radius: var(--modal-radius);
// 			--drawer-shadow: var(--modal-shadow);
// 			--drawer-padding: var(--modal-padding);
// 			--drawer-backdrop: var(--modal-backdrop);
// 			--drawer-backdrop-blur: var(--modal-backdrop-blur);
// 			--drawer-handle-color: var(--color-border-strong);
// 			--drawer-max-height: 90dvh;
// 			--drawer-max-width: 480px;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Toast / Notification
// 			   ---------------------------------------------------------- */
// 			--toast-bg: var(--color-bearmetal-pebble-200);
// 			--toast-color: var(--color-bearmetal-pebble-900);
// 			--toast-border: var(--color-bearmetal-pebble-400);
// 			--toast-border-radius: var(--radius-lg);
// 			--toast-shadow: var(--shadow-lg);
// 			--toast-padding-y: var(--space-3);
// 			--toast-padding-x: var(--space-4);
// 			--toast-font-size: var(--text-sm);
// 			--toast-max-width: 24rem;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Tooltip
// 			   ---------------------------------------------------------- */
// 			--tooltip-bg: var(--color-bearmetal-pebble-800);
// 			--tooltip-color: var(--color-bearmetal-pebble-0);
// 			--tooltip-font-size: var(--text-xs);
// 			--tooltip-padding-y: var(--space-1);
// 			--tooltip-padding-x: var(--space-2);
// 			--tooltip-radius: var(--radius-base);
// 			--tooltip-shadow: var(--shadow-md);
// 			--tooltip-max-width: 16rem;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Table
// 			   ---------------------------------------------------------- */
// 			--table-bg: transparent;
// 			--table-header-bg: var(--color-bg-subtle);
// 			--table-row-bg-alt: var(--color-bg-subtle);
// 			--table-row-bg-hover: var(--color-bg-muted);
// 			--table-border: var(--color-border);
// 			--table-cell-padding-y: var(--space-3);
// 			--table-cell-padding-x: var(--space-4);
// 			--table-font-size: var(--text-sm);
// 			--table-header-font-weight: var(--weight-semibold);
// 			--table-header-color: var(--color-text-subtle);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Navigation / Navbar
// 			   ---------------------------------------------------------- */
// 			--nav-bg: var(--color-surface);
// 			--nav-border: var(--color-border);
// 			--nav-height: var(--space-16);
// 			--nav-shadow: var(--shadow-xs);
// 			--nav-item-color: var(--color-text-subtle);
// 			--nav-item-color-hover: var(--color-text);
// 			--nav-item-color-active: var(--color-interactive);
// 			--nav-item-bg-hover: var(--color-bg-muted);
// 			--nav-item-font-weight: var(--weight-medium);
// 			--nav-item-font-size: var(--text-sm);
// 			--nav-item-radius: var(--radius-md);
// 			--nav-item-padding-y: var(--space-2);
// 			--nav-item-padding-x: var(--space-3);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Sidebar
// 			   ---------------------------------------------------------- */
// 			--sidebar-bg: var(--color-bg-subtle);
// 			--sidebar-border: var(--color-border);
// 			--sidebar-width: 16rem;
// 			--sidebar-width-collapsed: 4rem;
// 			--sidebar-padding: var(--space-4);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Avatar
// 			   ---------------------------------------------------------- */
// 			--avatar-size-xs: var(--space-6);
// 			--avatar-size-sm: var(--space-8);
// 			--avatar-size-base: var(--space-10);
// 			--avatar-size-lg: var(--space-14);
// 			--avatar-size-xl: var(--space-16);
// 			--avatar-radius: var(--radius-full);
// 			--avatar-border: var(--color-bearmetal-pebble-0);
// 			--avatar-border-width: 2px;
// 			--avatar-bg: var(--color-bearmetal-100);
// 			--avatar-color: var(--color-bearmetal-700);
// 			--avatar-font-weight: var(--weight-semibold);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Progress / Spinner
// 			   ---------------------------------------------------------- */
// 			--progress-bg: var(--color-bg-emphasis);
// 			--progress-fill: var(--color-interactive);
// 			--progress-height: var(--space-2);
// 			--progress-radius: var(--radius-full);

// 			--spinner-color: var(--color-interactive);
// 			--spinner-track-color: var(--color-bg-emphasis);
// 			--spinner-size-sm: var(--space-4);
// 			--spinner-size-base: var(--space-6);
// 			--spinner-size-lg: var(--space-8);
// 			--spinner-size-xl: var(--space-10);
// 			--spinner-thickness: 2px;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Skeleton
// 			   ---------------------------------------------------------- */
// 			--skeleton-bg: var(--color-bg-emphasis);
// 			--skeleton-shine: var(--color-bg-muted);
// 			--skeleton-radius: var(--radius-base);
// 			--skeleton-duration: 1.5s;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Alert / Banner
// 			   ---------------------------------------------------------- */
// 			--alert-padding-y: var(--space-3);
// 			--alert-padding-x: var(--space-4);
// 			--alert-radius: var(--radius-lg);
// 			--alert-border-width: var(--border-1);
// 			--alert-font-size: var(--text-sm);

// 			--alert-info-bg: var(--color-info-light);
// 			--alert-info-border: var(--color-info);
// 			--alert-info-color: var(--color-info-dark);

// 			--alert-success-bg: var(--color-success-light);
// 			--alert-success-border: var(--color-success);
// 			--alert-success-color: var(--color-success-dark);

// 			--alert-warning-bg: var(--color-warning-light);
// 			--alert-warning-border: var(--color-warning);
// 			--alert-warning-color: var(--color-warning-dark);

// 			--alert-danger-bg: var(--color-danger-light);
// 			--alert-danger-border: var(--color-danger);
// 			--alert-danger-color: var(--color-danger-dark);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Divider
// 			   ---------------------------------------------------------- */
// 			--divider-color: var(--color-border);
// 			--divider-width: var(--border-1);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Tabs
// 			   ---------------------------------------------------------- */
// 			--tab-bar-border: var(--color-border);
// 			--tab-item-color: var(--color-text-subtle);
// 			--tab-item-color-hover: var(--color-text);
// 			--tab-item-color-active: var(--color-interactive);
// 			--tab-item-font-weight: var(--weight-medium);
// 			--tab-item-font-size: var(--text-sm);
// 			--tab-indicator-color: var(--color-interactive);
// 			--tab-indicator-height: 2px;
// 			--tab-padding-y: var(--space-3);
// 			--tab-padding-x: var(--space-4);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Toggle / Switch
// 			   ---------------------------------------------------------- */
// 			--toggle-bg-off: var(--color-bearmetal-pebble-300);
// 			--toggle-bg-on: var(--color-interactive);
// 			--toggle-thumb-bg: var(--color-bearmetal-pebble-0);
// 			--toggle-thumb-shadow: var(--shadow-sm);
// 			--toggle-width: 2.75rem;
// 			--toggle-height: 1.5rem;
// 			--toggle-thumb-size: 1.25rem;
// 			--toggle-radius: var(--radius-full);
// 			--toggle-transition: var(--transition-colors), var(--transition-transform);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Checkbox & Radio
// 			   ---------------------------------------------------------- */
// 			--check-size: 1rem;
// 			--check-border: var(--color-border-strong);
// 			--check-border-hover: var(--color-bearmetal-400);
// 			--check-bg: var(--color-surface);
// 			--check-bg-checked: var(--color-interactive);
// 			--check-border-checked: var(--color-interactive);
// 			--check-color: var(--color-bearmetal-pebble-0);
// 			--check-radius: var(--radius-base);
// 			--radio-radius: var(--radius-full);
// 			--check-transition: var(--transition-colors);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Dropdown / Select Menu
// 			   ---------------------------------------------------------- */
// 			--dropdown-bg: var(--color-surface-overlay);
// 			--dropdown-border: var(--color-border);
// 			--dropdown-radius: var(--radius-lg);
// 			--dropdown-shadow: var(--shadow-md);
// 			--dropdown-padding-y: var(--space-1);
// 			--dropdown-item-padding-y: var(--space-2);
// 			--dropdown-item-padding-x: var(--space-3);
// 			--dropdown-item-font-size: var(--text-sm);
// 			--dropdown-item-color: var(--color-text);
// 			--dropdown-item-color-hover: var(--color-text);
// 			--dropdown-item-bg-hover: var(--color-bg-muted);
// 			--dropdown-item-bg-active: var(--color-interactive-subtle);
// 			--dropdown-item-color-active: var(--color-interactive);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Breadcrumb
// 			   ---------------------------------------------------------- */
// 			--breadcrumb-font-size: var(--text-sm);
// 			--breadcrumb-color: var(--color-text-subtle);
// 			--breadcrumb-color-active: var(--color-text);
// 			--breadcrumb-separator-color: var(--color-text-muted);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Pagination
// 			   ---------------------------------------------------------- */
// 			--pagination-item-size: var(--space-8);
// 			--pagination-item-radius: var(--radius-md);
// 			--pagination-item-bg: transparent;
// 			--pagination-item-bg-hover: var(--color-bg-muted);
// 			--pagination-item-bg-active: var(--color-interactive);
// 			--pagination-item-color: var(--color-text-subtle);
// 			--pagination-item-color-hover: var(--color-text);
// 			--pagination-item-color-active: var(--color-text-on-brand);
// 			--pagination-item-font-size: var(--text-sm);
// 			--pagination-item-font-weight: var(--weight-medium);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Form Field
// 			   ---------------------------------------------------------- */
// 			--field-label-font-size: var(--text-sm);
// 			--field-label-font-weight: var(--weight-medium);
// 			--field-label-color: var(--color-text);
// 			--field-label-gap: var(--space-1-5);
// 			--field-hint-font-size: var(--text-xs);
// 			--field-hint-color: var(--color-text-subtle);
// 			--field-error-font-size: var(--text-xs);
// 			--field-error-color: var(--color-danger);
// 			--field-gap: var(--space-4);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS — Empty State
// 			   ---------------------------------------------------------- */
// 			--empty-icon-color: var(--color-text-muted);
// 			--empty-title-color: var(--color-text);
// 			--empty-body-color: var(--color-text-subtle);
// 			--empty-padding: var(--space-12);
// 		}

// 		/* ============================================================
// 		   SECTION 2 — DARK MODE
// 		   ============================================================ */

// 		@media (prefers-color-scheme: dark) {
// 			:root {
// 				--color-bg: var(--color-bearmetal-grey-950);
// 				--color-bg-subtle: var(--color-bearmetal-grey-900);
// 				--color-bg-muted: var(--color-bearmetal-grey-800);
// 				--color-bg-emphasis: var(--color-bearmetal-grey-700);

// 				--color-surface: var(--color-bearmetal-grey-900);
// 				--color-surface-raised: var(--color-bearmetal-grey-800);
// 				--color-surface-overlay: var(--color-bearmetal-grey-900);

// 				--color-text: var(--color-bearmetal-grey-50);
// 				--color-text-subtle: var(--color-bearmetal-100);
// 				--color-text-muted: var(--color-bearmetal-grey-500);
// 				--color-text-disabled: var(--color-bearmetal-grey-700);

// 				--color-border: var(--color-bearmetal-grey-800);
// 				--color-border-strong: var(--color-bearmetal-grey-700);
// 				--color-border-subtle: var(--color-bearmetal-grey-900);

// 				--color-interactive: var(--color-bearmetal-600);
// 				--color-interactive-hover: var(--color-bearmetal-700);

// 				--toast-bg: var(--color-bearmetal-grey-800);
// 				--toast-color: var(--color-bearmetal-grey-0);
// 				--toast-border: var(--color-bearmetal-grey-700);
// 				--modal-backdrop: rgb(0 0 0 / 0.7);

// 				--color-success-text: var(--color-bearmetal-success-50);
// 				--color-danger-text: var(--color-bearmetal-danger-50);
// 				--color-info-text: var(--color-bearmetal-info-50);
// 				--color-warning-text: var(--color-bearmetal-warning-50);

// 				--color-success-bg: var(--color-bearmetal-success-500);
// 				--color-danger-bg: var(--color-bearmetal-danger-500);
// 				--color-info-bg: var(--color-bearmetal-info-500);
// 				--color-warning-bg: var(--color-bearmetal-warning-500);

// 				--btn-danger-bg: var(--color-danger);
// 				--btn-warning-bg: var(--color-warning);
// 				--btn-info-bg: var(--color-info);
// 				--btn-success-bg: var(--color-success);
// 			}
// 		}

// 		[data-theme="dark"] {
// 			--color-bg: var(--color-bearmetal-grey-950);
// 			--color-bg-subtle: var(--color-bearmetal-grey-900);
// 			--color-bg-muted: var(--color-bearmetal-grey-800);
// 			--color-bg-emphasis: var(--color-bearmetal-grey-700);

// 			--color-surface: var(--color-bearmetal-grey-900);
// 			--color-surface-raised: var(--color-bearmetal-grey-800);
// 			--color-surface-overlay: var(--color-bearmetal-grey-900);

// 			--color-text: var(--color-bearmetal-grey-50);
// 			--color-text-subtle: var(--color-bearmetal-grey-400);
// 			--color-text-muted: var(--color-bearmetal-grey-500);
// 			--color-text-disabled: var(--color-bearmetal-grey-700);

// 			--color-border: var(--color-bearmetal-grey-800);
// 			--color-border-strong: var(--color-bearmetal-grey-700);
// 			--color-border-subtle: var(--color-bearmetal-grey-900);

// 			--color-interactive: var(--color-bearmetal-600);
// 			--color-interactive-hover: var(--color-bearmetal-700);

// 			--toast-bg: var(--color-bearmetal-grey-800);
// 			--toast-color: var(--color-bearmetal-grey-0);
// 			--toast-border: var(--color-bearmetal-grey-700);
// 			--modal-backdrop: rgb(0 0 0 / 0.7);

// 			--color-success-text: var(--color-bearmetal-success-50);
// 			--color-danger-text: var(--color-bearmetal-danger-50);
// 			--color-info-text: var(--color-bearmetal-info-50);
// 			--color-warning-text: var(--color-bearmetal-warning-50);

// 			--color-success-bg: var(--color-bearmetal-success-500);
// 			--color-danger-bg: var(--color-bearmetal-danger-500);
// 			--color-info-bg: var(--color-bearmetal-info-500);
// 			--color-warning-bg: var(--color-bearmetal-warning-500);

// 			--btn-danger-bg: var(--color-danger);
// 			--btn-warning-bg: var(--color-warning);
// 			--btn-info-bg: var(--color-info);
// 			--btn-success-bg: var(--color-success);
// 		}

// 		[data-theme="light"] {
// 			--color-bg: var(--color-bearmetal-grey-50);
// 			--color-bg-subtle: var(--color-bearmetal-grey-100);
// 			--color-bg-muted: var(--color-bearmetal-grey-200);
// 			--color-bg-emphasis: var(--color-bearmetal-grey-300);

// 			--color-surface: var(--color-bearmetal-grey-50);
// 			--color-surface-raised: var(--color-bearmetal-grey-100);
// 			--color-surface-overlay: var(--color-bearmetal-grey-50);

// 			--color-text: var(--color-bearmetal-grey-900);
// 			--color-text-subtle: var(--color-bearmetal-grey-600);
// 			--color-text-muted: var(--color-bearmetal-grey-400);
// 			--color-text-disabled: var(--color-bearmetal-grey-300);

// 			--color-border: var(--color-bearmetal-grey-200);
// 			--color-border-strong: var(--color-bearmetal-grey-300);
// 			--color-border-subtle: var(--color-bearmetal-grey-100);

// 			--color-interactive: var(--color-bearmetal-400);
// 			--color-interactive-hover: var(--color-bearmetal-500);

// 			--toast-bg: var(--color-bearmetal-pebble-200);
// 			--toast-color: var(--color-bearmetal-pebble-900);
// 			--toast-border: var(--color-bearmetal-pebble-400);

// 			--color-success-text: var(--color-bearmetal-success-500);
// 			--color-danger-text: var(--color-bearmetal-danger-500);
// 			--color-info-text: var(--color-bearmetal-info-500);
// 			--color-warning-text: var(--color-bearmetal-warning-500);

// 			--color-success-bg: var(--color-bearmetal-success-50);
// 			--color-danger-bg: var(--color-bearmetal-danger-50);
// 			--color-info-bg: var(--color-bearmetal-info-50);
// 			--color-warning-bg: var(--color-bearmetal-warning-50);

// 			--btn-danger-bg: var(--color-bearmetal-danger-300);
// 			--btn-warning-bg: var(--color-bearmetal-warning-300);
// 			--btn-info-bg: var(--color-bearmetal-info-300);
// 			--btn-success-bg: var(--color-bearmetal-success-300);
// 		}

// 		/* ============================================================
// 		   SECTION 3 — RESET / BASE STYLES
// 		   ============================================================ */

// 		*, *::before, *::after {
// 			box-sizing: border-box;
// 			margin: 0;
// 			padding: 0;
// 		}

// 		html {
// 			font-size: 16px;
// 			-webkit-text-size-adjust: 100%;
// 			tab-size: 2;
// 			scroll-behavior: smooth;
// 		}

// 		body {
// 			font-family: var(--font-body);
// 			font-size: var(--text-base);
// 			line-height: var(--leading-normal);
// 			color: var(--color-text);
// 			background-color: var(--color-bg);
// 			-webkit-font-smoothing: antialiased;
// 			-moz-osx-font-smoothing: grayscale;
// 		}

// 		img, video, svg {
// 			display: block;
// 			max-width: 100%;
// 		}

// 		img {
// 			height: auto;
// 		}

// 		button, input, select, textarea {
// 			font: inherit;
// 			color: inherit;
// 		}
// 		button {
// 			cursor: pointer;
// 		}

// 		a {
// 			color: var(--color-interactive);
// 			text-decoration: underline;
// 			text-underline-offset: 0.15em;
// 			transition: var(--transition-colors);
// 		}
// 		a:hover {
// 			color: var(--color-interactive-hover);
// 		}

// 		p, h1, h2, h3, h4, h5, h6 {
// 			overflow-wrap: break-word;
// 		}

// 		h1, h2, h3, h4, h5, h6 {
// 			font-family: var(--font-display);
// 			font-weight: var(--weight-bold);
// 			line-height: var(--leading-tight);
// 			color: var(--color-text);
// 			padding: 0.1em 0;
// 		}

// 		h1 {
// 			font-size: var(--text-3xl);
// 		}
// 		h2 {
// 			font-size: var(--text-2xl);
// 		}
// 		h3 {
// 			font-size: var(--text-xl);
// 		}
// 		h4 {
// 			font-size: var(--text-lg);
// 		}
// 		h5 {
// 			font-size: var(--text-md);
// 		}
// 		h6 {
// 			font-size: var(--text-base);
// 		}

// 		header {
// 			h1 {
// 				font-size: 4em;
// 			}
// 			h4 {
// 				font-size: 1.5em;
// 				color: var(--color-text-subtle);
// 			}
// 		}

// 		p {
// 			padding: 0.25em 0;
// 		}

// 		blockquote {
// 			border-radius: var(--radius-sm);
// 			margin: 1rem 2rem;
// 			background-color: var(--color-bg-subtle);
// 			border-left: 3px solid var(--color-bearmetal-200);
// 			padding: 0.5rem 1.5rem;
// 			> p {
// 				color: var(--color-text-subtle);
// 				margin: 0;
// 			}
// 		}

// 		hr {
// 			color: var(--color-bearmetal-200);
// 		}

// 		code, kbd, samp, pre {
// 			font-family: var(--font-mono);
// 			font-size: 0.9em;
// 		}

// 		code {
// 			background-color: var(--color-bg-muted);
// 			color: var(--color-text-subtle);
// 			padding: var(--space-1);
// 			border-radius: var(--radius-base);
// 		}

// 		pre {
// 			overflow: auto;
// 			padding: var(--space-4);
// 			background: var(--color-bg-muted);
// 			border-radius: var(--radius-lg);
// 			border: var(--border-1) solid var(--color-border);
// 		}

// 		ol, ul {
// 			padding-left: 1rem;
// 		}

// 		span.highlight {
// 			background-color: var(--color-bearmetal-400);
// 			color: var(--color-text-subtle);
// 			display: inline-block;
// 			padding: 0 var(--space-0-5);
// 			border-radius: var(--radius-base);
// 		}

// 		:focus-visible {
// 			outline: var(--border-2) solid var(--color-border-focus);
// 			outline-offset: 2px;
// 			border-radius: var(--radius-base);
// 		}
// 		:focus:not(:focus-visible) {
// 			outline: none;
// 		}

// 		[disabled], [aria-disabled="true"] {
// 			cursor: not-allowed;
// 			opacity: 0.5;
// 			pointer-events: none;
// 		}

// 		@media (prefers-reduced-motion: reduce) {
// 			*, *::before, *::after {
// 				animation-duration: 0.01ms !important;
// 				animation-iteration-count: 1 !important;
// 				transition-duration: 0.01ms !important;
// 				scroll-behavior: auto !important;
// 			}
// 		}

// 		/* ============================================================
// 		   SECTION 4 — UTILITY HELPERS
// 		   ============================================================ */

// 		.container {
// 			width: 100%;
// 			max-width: var(--container-xl);
// 			margin-inline: auto;
// 			padding-inline: var(--space-6);
// 		}

// 		.sr-only {
// 			position: absolute;
// 			width: 1px;
// 			height: 1px;
// 			padding: 0;
// 			margin: -1px;
// 			overflow: hidden;
// 			clip: rect(0, 0, 0, 0);
// 			white-space: nowrap;
// 			border: 0;
// 		}

// 		.divider {
// 			border: none;
// 			border-top: var(--divider-width) solid var(--divider-color);
// 			margin-block: var(--space-4);
// 		}
// 		.divider--vertical {
// 			border-top: none;
// 			border-left: var(--divider-width) solid var(--divider-color);
// 			align-self: stretch;
// 			margin-block: 0;
// 			margin-inline: var(--space-4);
// 		}

// 		@keyframes bm-shimmer {
// 			0% {
// 				background-position: 200% center;
// 			}
// 			100% {
// 				background-position: -200% center;
// 			}
// 		}

// 		.skeleton {
// 			display: block;
// 			border-radius: var(--skeleton-radius);
// 			background: linear-gradient(
// 				90deg,
// 				var(--skeleton-bg) 25%,
// 				var(--skeleton-shine) 50%,
// 				var(--skeleton-bg) 75%
// 			);
// 			background-size: 200% 100%;
// 			animation: bm-shimmer var(--skeleton-duration) linear infinite;
// 		}

// 		@keyframes bm-spin {
// 			to {
// 				transform: rotate(360deg);
// 			}
// 		}

// 		.spinner {
// 			display: inline-block;
// 			width: var(--spinner-size-base);
// 			height: var(--spinner-size-base);
// 			border: var(--spinner-thickness) solid var(--spinner-track-color);
// 			border-top-color: var(--spinner-color);
// 			border-radius: var(--radius-full);
// 			animation: bm-spin 0.7s linear infinite;
// 		}
// 		.spinner--sm {
// 			width: var(--spinner-size-sm);
// 			height: var(--spinner-size-sm);
// 		}
// 		.spinner--lg {
// 			width: var(--spinner-size-lg);
// 			height: var(--spinner-size-lg);
// 		}
// 		.spinner--xl {
// 			width: var(--spinner-size-xl);
// 			height: var(--spinner-size-xl);
// 		}

// 		.flex {
// 			display: flex;
// 		}
// 		.prose {
// 			max-width: var(--container-prose);
// 		}

// 		/* ============================================================
// 		   SECTION 5 — FORM ELEMENTS
// 		   ============================================================ */

// 		input, select, textarea {
// 			font-family: var(--input-font-family);
// 			font-size: var(--input-font-size);
// 			background-color: var(--input-bg);
// 			color: var(--input-text);
// 			border: var(--input-border) solid var(--input-border-width);
// 			border-radius: var(--input-radius);
// 			padding: var(--input-padding-y) var(--input-padding-x);
// 			box-shadow: var(--input-shadow);
// 			transition: var(--input-transition);

// 			&.small {
// 				font-size: var(--input-font-size-sm);
// 			}
// 			&.large {
// 				font-size: var(--input-font-size-lg);
// 			}
// 			&:focus {
// 				border-color: var(--input-border-focus);
// 			}
// 			&:hover {
// 				border-color: var(--input-border-hover);
// 			}
// 			&:invalid {
// 				border-color: var(--input-border-error);
// 			}
// 		}

// 		fieldset {
// 			padding: var(--space-2);
// 			display: grid;
// 			grid-template-columns: auto 1fr;
// 			border: var(--color-text-subtle) solid var(--border-1);
// 			border-radius: var(--radius-base);
// 			gap: var(--space-2);
// 		}

// 		input[type="submit"], input[type="reset"], input[type="button"], button {
// 			font-family: var(--btn-font-family);
// 			font-weight: var(--btn-font-weight);
// 			font-size: var(--btn-font-size-base);
// 			letter-spacing: var(--btn-letter-spacing);

// 			height: min-content;
// 			min-width: max-content;

// 			display: inline-flex;
// 			gap: var(--space-2);
// 			justify-content: center;
// 			align-items: center;

// 			border-style: solid;
// 			border-width: var(--btn-border-width);
// 			border-radius: var(--btn-radius-base);

// 			transition: var(--btn-transition);

// 			--btn-padding: var(--btn-padding-y-base);
// 			--btn-padding-x: var(--btn-padding-x-base);
// 			padding: var(--btn-padding) var(--btn-padding-x);

// 			--btn-hover-color: var(--btn-primary-bg-hover);
// 			--btn-active-border: var(--color-bearmetal-100);

// 			&.full {
// 				width: 100%;
// 				margin-top: var(--space-2);
// 			}

// 			&.icon {
// 				width: min-content;
// 				padding: var(--btn-padding);
// 			}
// 			&.xs {
// 				font-size: var(--btn-font-size-xs);
// 				border-radius: var(--btn-radius-xs);
// 				--btn-padding: var(--btn-padding-y-xs);
// 				--btn-padding-x: var(--btn-padding-x-xs);
// 			}
// 			&.sm {
// 				font-size: var(--btn-font-size-sm);
// 				border-radius: var(--btn-radius-sm);
// 				--btn-padding: var(--btn-padding-y-sm);
// 				--btn-padding-x: var(--btn-padding-x-sm);
// 			}
// 			&.lg {
// 				font-size: var(--btn-font-size-lg);
// 				border-radius: var(--btn-radius-lg);
// 				--btn-padding: var(--btn-padding-y-lg);
// 				--btn-padding-x: var(--btn-padding-x-lg);
// 			}

// 			background-color: var(--btn-primary-bg);
// 			color: var(--btn-primary-color);
// 			border-color: var(--btn-primary-border);
// 			box-shadow: var(--btn-primary-shadow);

// 			&.ghost, &[type="reset"] {
// 				background-color: var(--btn-ghost-bg);
// 				--btn-hover-color: var(--btn-ghost-bg-hover);
// 				color: var(--btn-ghost-color);
// 				border-color: var(--btn-ghost-border);
// 				box-shadow: var(--btn-ghost-shadow);
// 			}
// 			&.secondary, &[type="button"] {
// 				background-color: var(--btn-secondary-bg);
// 				--btn-hover-color: var(--btn-secondary-bg-hover);
// 				color: var(--btn-secondary-color);
// 				border-color: var(--btn-secondary-border);
// 				box-shadow: var(--btn-secondary-shadow);
// 			}
// 			&.danger {
// 				background-color: var(--btn-danger-bg);
// 				--btn-hover-color: var(--btn-danger-bg-hover);
// 				color: var(--btn-danger-color);
// 				border-color: var(--btn-danger-border);
// 				box-shadow: var(--btn-danger-shadow);
// 			}
// 			&.warn {
// 				background-color: var(--btn-warning-bg);
// 				--btn-hover-color: var(--btn-warning-bg-hover);
// 				color: var(--btn-warning-color);
// 				border-color: var(--btn-warning-border);
// 				box-shadow: var(--btn-warning-shadow);
// 			}
// 			&.info {
// 				background-color: var(--btn-info-bg);
// 				--btn-hover-color: var(--btn-info-bg-hover);
// 				color: var(--btn-info-color);
// 				border-color: var(--btn-info-border);
// 				box-shadow: var(--btn-info-shadow);
// 			}
// 			&.success {
// 				background-color: var(--btn-success-bg);
// 				--btn-hover-color: var(--btn-success-bg-hover);
// 				color: var(--btn-success-color);
// 				border-color: var(--btn-success-border);
// 				box-shadow: var(--btn-success-shadow);
// 			}

// 			&:active {
// 				border-color: var(--btn-active-border);
// 			}
// 			&:hover {
// 				background-color: var(--btn-hover-color);
// 			}
// 		}

// 		body.rave-mode *:not(:has(*)) {
// 			animation: spin 1s linear infinite;
// 		}
// 	`;

if (typeof document !== "undefined") {
	// const style = document.createElement("style");
	// style.id = "bm-styles";
	// style.textContent = GLOBAL_STYLES;
	// document.head.insertAdjacentElement("afterbegin", style);

	document.head.insertAdjacentHTML(
		"beforeend",
		`<link rel="preconnect" href="https://fonts.googleapis.com">
		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
		<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Jost:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&family=Syne:wght@400..800&family=Urbanist:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">`,
	);
}
