import { css } from "@bearmetal/miscellanea";
import { injectStyle } from "@bearmetal/drip";
export * from "./animations.ts";

injectStyle(
	"bm-base",
	css`
		/* ============================================================
		   SECTION 3 - RESET / BASE STYLES
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
		   SECTION 4 - UTILITY HELPERS
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

		.spinner--sm {
			width: var(--spinner-size-sm);
			height: var(--spinner-size-sm);
		}
		.spinner--lg {
			width: var(--spinner-size-lg);
			height: var(--spinner-size-lg);
		}
		.spinner--xl {
			width: var(--spinner-size-xl);
			height: var(--spinner-size-xl);
		}

		.flex {
			display: flex;
		}
	`,
);

injectStyle(
	"bm-components",
	css`
		/* ============================================================
		   form elements
		   ============================================================ */

		input,
		select,
		textarea {
			font-family: var(--input-font-family);
			font-size: var(--input-font-size);
			background-color: var(--input-bg);
			color: var(--input-text);
			border: var(--input-border) solid var(--input-border-width);
			border-radius: var(--input-radius);
			padding: var(--input-padding-y) var(--input-padding-x);
			box-shadow: var(--input-shadow);
			transition: var(--input-transition);

			&.small {
				font-size: var(--input-font-size-sm);
			}
			&.large {
				font-size: var(--input-font-size-lg);
			}
			&:focus {
				border-color: var(--input-border-focus);
			}
			&:hover {
				border-color: var(--input-border-hover);
			}
			&:invalid {
				border-color: var(--input-border-error);
			}
		}

		fieldset {
			padding: var(--space-2);
			display: grid;
			grid-template-columns: 1fr;
			border: var(--color-text-subtle) solid var(--border-1);
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
			--btn-active-border: var(--color-bearmetal-100);

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

			&.ghost,
			&[type="reset"] {
				background-color: var(--btn-ghost-bg);
				--btn-hover-color: var(--btn-ghost-bg-hover);
				color: var(--btn-ghost-color);
				border-color: var(--btn-ghost-border);
				box-shadow: var(--btn-ghost-shadow);
			}
			&.secondary,
			&[type="button"] {
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
				box-shadow: var(--btn-danger-shadow);
			}
			&.warn {
				background-color: var(--btn-warning-bg);
				--btn-hover-color: var(--btn-warning-bg-hover);
				color: var(--btn-warning-color);
				border-color: var(--btn-warning-border);
				box-shadow: var(--btn-warning-shadow);
			}
			&.info {
				background-color: var(--btn-info-bg);
				--btn-hover-color: var(--btn-info-bg-hover);
				color: var(--btn-info-color);
				border-color: var(--btn-info-border);
				box-shadow: var(--btn-info-shadow);
			}
			&.success {
				background-color: var(--btn-success-bg);
				--btn-hover-color: var(--btn-success-bg-hover);
				color: var(--btn-success-color);
				border-color: var(--btn-success-border);
				box-shadow: var(--btn-success-shadow);
			}
			&.orange {
				background-color: var(--btn-orange-bg);
				--btn-hover-color: var(--btn-orange-bg-hover);
				color: var(--btn-orange-color);
				border-color: var(--btn-orange-border);
				box-shadow: var(--btn-orange-shadow);
			}

			&:active {
				border-color: var(--btn-active-border);
			}
			&:hover {
				background-color: var(--btn-hover-color);
			}
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
				--b-gradient-from: var(--color-bearmetal-600);
				--b-gradient-to: var(--color-bearmetal-orange-400);
			}
			&.border-nightshade {
				--b-gradient-from: var(--color-bearmetal-600);
				--b-gradient-to: var(--color-bearmetal-danger-500);
			}
			&.border-abyss {
				--b-gradient-from: var(--color-bearmetal-success-500);
				--b-gradient-to: var(--color-bearmetal-info-500);
			}
			&.border-harvest {
				--b-gradient-from: var(--color-bearmetal-warning-300);
				--b-gradient-to: var(--color-bearmetal-orange-400);
			}
			&.border-witchwood {
				--b-gradient-from: var(--color-bearmetal-500);
				--b-gradient-to: var(--color-bearmetal-success-500);
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
				--gradient-from: var(--color-bearmetal-600);
				--gradient-to: var(--color-bearmetal-orange-400);
			}
			&.nightshade {
				--gradient-from: var(--color-bearmetal-600);
				--gradient-to: var(--color-bearmetal-danger-500);
			}
			&.abyss {
				--gradient-from: var(--color-bearmetal-success-500);
				--gradient-to: var(--color-bearmetal-info-500);
			}
			&.harvest {
				--gradient-from: var(--color-bearmetal-warning-300);
				--gradient-to: var(--color-bearmetal-orange-400);
			}
			&.witchwood {
				--gradient-from: var(--color-bearmetal-500);
				--gradient-to: var(--color-bearmetal-success-500);
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
	`,
);

if (typeof document !== "undefined") {
	// document.head.insertAdjacentHTML(
	// 	"beforeend",
	// 	`<link rel="preconnect" href="https://fonts.googleapis.com">
	// 	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	// 	<link href="https://fonts.googleapis.com/css2?family=Urbanist:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">`,
	// 	// <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Jost:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&family=Syne:wght@400..800&family=Urbanist:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
	// );
}
