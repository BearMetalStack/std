import { css } from "@bearmetal/miscellanea";

export const animationSheet: CSSStyleSheet = ((): CSSStyleSheet => {
	if (typeof document === "undefined") return null!;
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(css`
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
	`);
	document.adoptedStyleSheets = [sheet, ...document.adoptedStyleSheets];
	return sheet;
})();
