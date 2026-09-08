import { css } from "@bearmetal/miscellanea";
import { themeCSS } from "./css/generate.ts";
import { getDefaultTheme, loadTheme } from "./theme.ts";
import { type FontKey, themeFontFaceCSS } from "./fonts/mod.ts";

export async function ThemeStyle(
	{ theme }: { theme?: string | null },
): Promise<import("@bearmetal/jsx/jsx-runtime").JSX.Element> {
	const data = theme ? await loadTheme(theme) : await getDefaultTheme();
	return <style id="thingy" $raw>{themeCSS(data, ":root").replaceAll(/\n\s*/g, " ")}</style>;
}

/**
 * Emits the `@font-face` sheet for the self-hosted fonts a theme needs: the
 * lead family of each of its `font.*` roles that Drip hosts (Comfortaa and
 * Monofur, by default), plus any named in `fonts`. Renders nothing when none
 * apply — a theme naming only web-safe or externally loaded fonts.
 *
 * Included in {@linkcode BMDripBase}, so a default app self-hosts its fonts
 * with no wiring. Fonts loaded elsewhere (Google Fonts, a CDN) are unaffected.
 */
export async function Fonts(
	{ theme, fonts = [] }: { theme?: string | null; fonts?: FontKey[] },
): Promise<import("@bearmetal/jsx/jsx-runtime").JSX.Element | null> {
	const data = theme ? await loadTheme(theme) : await getDefaultTheme();
	const sheet = themeFontFaceCSS(data, fonts);
	return sheet ? <style $raw>{sheet}</style> : null;
}

export function BaseStyle(): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	return (
		<style $raw>
			{css`
				/* ============================================================
				   RESET
				   ============================================================ */

				*,
				*::before,
				*::after {
					box-sizing: border-box;
					margin: 0;
					padding: 0;
				}

				html {
					font-size: 16px;
					-webkit-text-size-adjust: 100%;
					tab-size: 2;
					scroll-behavior: smooth;
				}

				body {
					font-family: var(--font-body);
					font-size: var(--text-base);
					line-height: var(--leading-normal);
					color: var(--color-text);
					background-color: var(--color-bg);
					-webkit-font-smoothing: antialiased;
					-moz-osx-font-smoothing: grayscale;
				}

				img,
				video,
				svg {
					display: block;
					max-width: 100%;
				}

				img {
					height: auto;
				}

				button,
				input,
				select,
				textarea {
					font: inherit;
					color: inherit;
				}

				button {
					cursor: pointer;
				}

				a {
					color: var(--color-interactive);
					text-decoration: underline;
					text-underline-offset: 0.15em;
					transition: var(--transition-colors);
				}

				a:hover {
					color: var(--color-interactive-hover);
				}

				p,
				h1,
				h2,
				h3,
				h4,
				h5,
				h6 {
					overflow-wrap: break-word;
				}

				h1,
				h2,
				h3,
				h4,
				h5,
				h6 {
					font-family: var(--font-display);
					font-weight: var(--weight-bold);
					line-height: var(--leading-tight);
					color: var(--color-text);
				}

				h1 {
					font-size: var(--text-3xl);
				}
				h2 {
					font-size: var(--text-2xl);
				}
				h3 {
					font-size: var(--text-xl);
				}
				h4 {
					font-size: var(--text-lg);
				}
				h5 {
					font-size: var(--text-md);
				}
				h6 {
					font-size: var(--text-base);
				}

				code,
				kbd,
				samp,
				pre {
					font-family: var(--font-mono);
					font-size: 0.9em;
				}

				code {
					background-color: var(--color-bg-muted);
					color: var(--color-text-subtle);
					padding: var(--space-1);
					border-radius: var(--radius-base);
				}

				pre {
					overflow: auto;
					padding: var(--space-4);
					background: var(--color-bg-muted);
					border-radius: var(--radius-lg);
					border: var(--border-1) solid var(--color-border);
				}

				ol,
				ul {
					padding-left: 1rem;
				}

				span.highlight {
					background-color: var(--color-bearmetal-400);
					color: var(--color-text-subtle);
					display: inline-block;
					padding: 0 var(--space-0-5);
					border-radius: var(--radius-base);
				}

				:focus-visible {
					outline: var(--border-2) solid var(--color-border-focus);
					outline-offset: 2px;
					border-radius: var(--radius-base);
				}

				:focus:not(:focus-visible) {
					outline: none;
				}

				[disabled],
				[aria-disabled="true"] {
					cursor: not-allowed;
					opacity: 0.5;
					pointer-events: none;
				}

				@media (prefers-reduced-motion: reduce) {
					*,
					*::before,
					*::after {
						animation-duration: 0.01ms !important;
						animation-iteration-count: 1 !important;
						transition-duration: 0.01ms !important;
						scroll-behavior: auto !important;
					}
				}

				/* ============================================================
				   UTILITY HELPERS
				   ============================================================ */

				.container {
					width: 100%;
					max-width: var(--container-xl);
					margin-inline: auto;
					padding-inline: var(--space-6);
				}

				.sr-only {
					position: absolute;
					width: 1px;
					height: 1px;
					padding: 0;
					margin: -1px;
					overflow: hidden;
					clip: rect(0, 0, 0, 0);
					white-space: nowrap;
					border: 0;
				}

				.divider {
					border: none;
					border-top: var(--divider-width) solid var(--divider-color);
					margin-block: var(--space-4);
				}

				.divider--vertical {
					border-top: none;
					border-left: var(--divider-width) solid var(--divider-color);
					align-self: stretch;
					margin-block: 0;
					margin-inline: var(--space-4);
				}

				@keyframes bm-shimmer {
					0% {
						background-position: 200% center;
					}
					100% {
						background-position: -200% center;
					}
				}

				.skeleton {
					display: block;
					border-radius: var(--skeleton-radius);
					background: linear-gradient(
						90deg,
						var(--skeleton-bg) 25%,
						var(--skeleton-shine) 50%,
						var(--skeleton-bg) 75%
					);
					background-size: 200% 100%;
					animation: bm-shimmer var(--skeleton-duration) linear infinite;
				}

				@keyframes bm-spin {
					to {
						transform: rotate(360deg);
					}
				}

				.spinner {
					display: inline-block;
					width: var(--spinner-size-base);
					height: var(--spinner-size-base);
					border: var(--spinner-thickness) solid var(--spinner-track-color);
					border-top-color: var(--spinner-color);
					border-radius: var(--radius-full);
					animation: bm-spin 0.7s linear infinite;
				}

				.spinner-sm {
					width: var(--spinner-size-sm);
					height: var(--spinner-size-sm);
				}
				.spinner-lg {
					width: var(--spinner-size-lg);
					height: var(--spinner-size-lg);
				}
				.spinner-xl {
					width: var(--spinner-size-xl);
					height: var(--spinner-size-xl);
				}

				.flex {
					display: flex;
				}
			`}
		</style>
	);
}

export function ComponentStyle(
	{ root }: { root?: string },
): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	let style = css`
		/* ============================================================
		 form elements
		 ============================================================ */

		input,
		select,
		textarea {
			font-family: var(--input-font-family);
			font-size: var(--input-font-size);
			background-color: var(--input-bg);
			color: var(--input-color);
			border: var(--input-border-width) solid var(--input-border);
			border-radius: var(--input-radius);
			padding: var(--input-padding-y) var(--input-padding-x);
			box-shadow: var(--input-shadow);
			transition: var(--input-transition);

			&::placeholder {
				color: var(--input-color-placeholder);
			}
			&.small {
				font-size: var(--input-font-size-sm);
			}
			&.large {
				font-size: var(--input-font-size-lg);
			}
			&:focus {
				border-color: var(--input-border-focus);
				box-shadow: var(--input-shadow-focus);
			}
			&:hover {
				border-color: var(--input-border-hover);
			}
			&:invalid {
				border-color: var(--input-border-error);
			}
			&:disabled {
				background-color: var(--input-bg-disabled);
			}
		}

		fieldset {
			padding: var(--space-2);
			display: grid;
			grid-template-columns: 1fr;
			border: var(--border-1) solid var(--color-border);
			border-radius: var(--radius-base);
			gap: var(--space-2);
		}

		input[type="submit"],
		input[type="reset"],
		input[type="button"],
		button {
			font-family: var(--btn-font-family);
			font-weight: var(--btn-font-weight);
			font-size: var(--btn-font-size-base);
			letter-spacing: var(--btn-letter-spacing);

			height: min-content;
			min-width: max-content;

			display: inline-flex;
			gap: var(--space-2);
			justify-content: center;
			align-items: center;

			border-style: solid;
			border-width: var(--btn-border-width);
			border-radius: var(--btn-radius-base);

			transition: var(--btn-transition);

			--btn-padding: var(--btn-padding-y-base);
			--btn-padding-x: var(--btn-padding-x-base);
			padding: var(--btn-padding) var(--btn-padding-x);

			--btn-hover-color: var(--btn-primary-bg-hover);

			&.full {
				width: 100%;
				margin-top: var(--space-2);
			}

			&.icon {
				width: min-content;
				padding: var(--btn-padding);
			}
			&.xs {
				font-size: var(--btn-font-size-xs);
				border-radius: var(--btn-radius-xs);
				--btn-padding: var(--btn-padding-y-xs);
				--btn-padding-x: var(--btn-padding-x-xs);
			}
			&.sm {
				font-size: var(--btn-font-size-sm);
				border-radius: var(--btn-radius-sm);
				--btn-padding: var(--btn-padding-y-sm);
				--btn-padding-x: var(--btn-padding-x-sm);
			}
			&.lg {
				font-size: var(--btn-font-size-lg);
				border-radius: var(--btn-radius-lg);
				--btn-padding: var(--btn-padding-y-lg);
				--btn-padding-x: var(--btn-padding-x-lg);
			}

			background-color: var(--btn-primary-bg);
			color: var(--btn-primary-color);
			border-color: var(--btn-primary-border);
			box-shadow: var(--btn-primary-shadow);

			&.ghost {
				background-color: var(--btn-ghost-bg);
				--btn-hover-color: var(--btn-ghost-bg-hover);
				color: var(--btn-ghost-color);
				border-color: var(--btn-ghost-border);
				box-shadow: none;
			}
			&.secondary {
				background-color: var(--btn-secondary-bg);
				--btn-hover-color: var(--btn-secondary-bg-hover);
				color: var(--btn-secondary-color);
				border-color: var(--btn-secondary-border);
				box-shadow: var(--btn-secondary-shadow);
			}
			&.danger {
				background-color: var(--btn-danger-bg);
				--btn-hover-color: var(--btn-danger-bg-hover);
				color: var(--btn-danger-color);
				border-color: var(--btn-danger-border);
			}
			&.warn {
				background-color: var(--btn-warning-bg);
				--btn-hover-color: var(--btn-warning-bg-hover);
				color: var(--btn-warning-color);
				border-color: var(--btn-warning-border);
			}
			&.info {
				background-color: var(--btn-info-bg);
				--btn-hover-color: var(--btn-info-bg-hover);
				color: var(--btn-info-color);
				border-color: var(--btn-info-border);
			}
			&.success {
				background-color: var(--btn-success-bg);
				--btn-hover-color: var(--btn-success-bg-hover);
				color: var(--btn-success-color);
				border-color: var(--btn-success-border);
			}

			&.accent,
			&.orange {
				background-color: var(--btn-accent-bg);
				--btn-hover-color: var(--btn-accent-bg-hover);
				color: var(--btn-accent-color);
				border-color: var(--btn-accent-border);
			}

			&:active {
				border-color: var(--btn-active-border);
			}
			&:hover {
				background-color: var(--btn-hover-color);
			}
		}

		input[type="reset"] {
			background-color: var(--btn-ghost-bg);
			--btn-hover-color: var(--btn-ghost-bg-hover);
			color: var(--btn-ghost-color);
			border-color: var(--btn-ghost-border);
			box-shadow: none;
		}
		input[type="button"] {
			background-color: var(--btn-secondary-bg);
			--btn-hover-color: var(--btn-secondary-bg-hover);
			color: var(--btn-secondary-color);
			border-color: var(--btn-secondary-border);
			box-shadow: var(--btn-secondary-shadow);
		}

		body.rave-mode *:not(:has(*)) {
			animation: spin 1s linear infinite;
		}

		.prose {
			max-width: var(--container-prose);
		}

		@property --gradient-angle {
			syntax: "<angle>";
			inherits: false;
			initial-value: 0deg;
		}
		@property --b-gradient-angle {
			syntax: "<angle>";
			inherits: false;
			initial-value: 180deg;
		}

		.gradient-border {
			border: 2px solid transparent;

			--b-gradient-angle: 315deg;
			--b-gradient: linear-gradient(
						in oklch var(--b-gradient-angle),
						oklch(from var(--b-gradient-from) l c h),
						oklch(from var(--b-gradient-to) l c h)
					);
			--bg: linear-gradient(var(--color-bg), var(--color-bg));
			background:
				var(--bg) padding-box,
				var(--b-gradient) border-box;

			&.border-ember {
				--b-gradient-from: var(--color-interactive);
				--b-gradient-to: var(--color-accent);
			}
			&.border-nightshade {
				--b-gradient-from: var(--color-interactive);
				--b-gradient-to: var(--btn-danger-bg);
			}
			&.border-abyss {
				--b-gradient-from: var(--btn-success-bg);
				--b-gradient-to: var(--btn-info-bg);
			}
			&.border-harvest {
				--b-gradient-from: var(--btn-warning-bg);
				--b-gradient-to: var(--color-accent);
			}
			&.border-witchwood {
				--b-gradient-from: var(--color-interactive-hover);
				--b-gradient-to: var(--btn-success-bg);
			}
		}

		.gradient {
			--gradient-angle: 135deg;
			--gradient: linear-gradient(
						in oklch var(--gradient-angle),
						oklch(from var(--gradient-from) l c h),
						oklch(from var(--gradient-to) l c h)
					);

			--bg: var(--gradient);
			&:not(.gradient-border) {
				background: var(--bg);
			}

			&.ember {
				--gradient-from: var(--color-interactive);
				--gradient-to: var(--color-accent);
			}
			&.nightshade {
				--gradient-from: var(--color-interactive);
				--gradient-to: var(--btn-danger-bg);
			}
			&.abyss {
				--gradient-from: var(--btn-success-bg);
				--gradient-to: var(--btn-info-bg);
			}
			&.harvest {
				--gradient-from: var(--btn-warning-bg);
				--gradient-to: var(--color-accent);
			}
			&.witchwood {
				--gradient-from: var(--color-interactive-hover);
				--gradient-to: var(--btn-success-bg);
			}
		}

		@keyframes rotate-gradient {
			from {
				--gradient-angle: 0deg;
				--b-gradient-angle: 360deg;
			}
			to {
				--gradient-angle: 360deg;
				--b-gradient-angle: 0deg;
			}
		}

		.gradient.animate,
		.gradient-border.animate {
			animation: rotate-gradient 30s linear infinite;
		}

		bm-grid.bg div {
			aspect-ratio: 1;
			animation:
				woob 600s linear infinite,
				woom 100s linear infinite alternate,
				woop 300s linear infinite;
			corner-shape: bevel;
			border-radius: 50%;
			mix-blend-mode: exclusion;
			background-color: darkmagenta;
		}

		@keyframes woom {
			0% {
				border-radius: 0;
				transform: scale(100%);
			}
			50% {
				border-radius: 50%;
				transform: scale(100%);
			}
			100% {
				border-radius: 50%;
				transform: scale(0);
			}
		}
		@keyframes woop {
			0% {
				corner-shape: scoop;
			}
			25% {
				corner-shape: bevel;
			}
			50% {
				corner-shape: notch;
			}
			75% {
				corner-shape: round;
			}
			100% {
				corner-shape: scoop;
			}
		}
		@keyframes woob {
			0% {
				background-color: darkmagenta;
			}
			10% {
				background-color: crimson;
			}
			30% {
				background-color: darkblue;
			}
			60% {
				background-color: darkorange;
			}
			90% {
				background-color: brown;
			}
			100% {
				background-color: darkmagenta;
			}
		}

		bm-grid.bg {
			z-index: -100;
			width: 100vw;
			scale: 200%;
			position: fixed;
			rotate: 30deg;
			filter: blur(5px);
			animation:
				gloop-spin 600s linear infinite,
				gloop-grow 400s linear infinite alternate,
				gloop-shift 500s linear infinite alternate;
		}

		@keyframes gloop-spin {
			from {
				rotate: 0deg;
			}
			to {
				rotate: 360deg;
			}
		}
		@keyframes gloop-grow {
			from {
				scale: 150%;
			}
			to {
				scale: 200%;
			}
		}
		@keyframes gloop-shift {
			from {
				translate: 0 0;
			}
			to {
				translate: 0 -50%;
			}
		}
	`;
	if (root) style = `${root} {${style}}`;
	return (
		<style $raw>
			{style}
		</style>
	);
}

export function Animations(): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	return (
		<style>
			{css`
				@keyframes spin {
					to {
						rotate: 360deg;
					}
				}
				@keyframes fade-in {
					from {
						opacity: 0;
					}
					to {
						opacity: 1;
					}
				}
				@keyframes fade-out {
					from {
						opacity: 1;
					}
					to {
						opacity: 0;
					}
				}
				@keyframes slide-in-left {
					from {
						translate: 100%;
					}
					to {
						translate: 0;
					}
				}
				@keyframes slide-in-right {
					from {
						translate: -100%;
					}
					to {
						translate: 0;
					}
				}
				@keyframes slide-in-up {
					from {
						translate: 0 100%;
					}
					to {
						translate: 0;
					}
				}
				@keyframes slide-in-down {
					from {
						translate: 0 -100%;
					}
					to {
						translate: 0;
					}
				}
				@keyframes shrink-height {
					to {
						height: 0;
						padding: 0;
						margin: 0;
						border-width: 0;
					}
				}
				@keyframes shrink-width {
					to {
						width: 0;
						padding: 0;
						margin: 0;
						border-width: 0;
					}
				}
			`}
		</style>
	);
}

export function BMDripBase(
	{ theme }: { theme?: string },
): import("@bearmetal/jsx/jsx-runtime").JSX.Element {
	return (
		<>
			<ThemeStyle theme={theme} />
			<Fonts theme={theme} />
			<BaseStyle />
			<ComponentStyle />
		</>
	);
}
