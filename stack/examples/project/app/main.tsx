import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";
import { Joke } from "@app/joke.tsx";

@define("app-main", import.meta)
export class App extends BMElement {
	static get stylesheet() {
		return css`
			${this.tag} {
				display: grid;
				width: 100vw;
				height: 100vh;
				overflow: hidden;
				position: relative;
				&::before,
				&::after {
					content: "";
					position: absolute;
					border-radius: 50%;
					filter: blur(100px);
					pointer-events: none;
					mix-blend-mode: difference;
				}

				&::before {
					width: 700px;
					height: 500px;
					background: var(--color-bearmetal-danger-400);
					opacity: 0.18;
					top: -20%;
					left: -10%;
					animation: drift-warm 96s ease-in-out infinite;
				}

				&::after {
					width: 600px;
					height: 600px;
					background: var(--color-bearmetal-300);
					opacity: 0.14;
					bottom: -20%;
					right: -10%;
					animation: drift-cool 120s ease-in-out infinite;
				}
			}

			@keyframes drift-warm {
				0%, 100% {
					transform: translate(0, 0) scale(1);
				}
				40% {
					transform: translate(70vw, 50vh) scale(1.2);
				}
				70% {
					transform: translate(45vw, 60vh) scale(0.85);
				}
			}

			@keyframes drift-cool {
				0%, 100% {
					transform: translate(0, 0) scale(1);
				}
				35% {
					transform: translate(-80vw, -60vh) scale(0.8);
				}
				65% {
					transform: translate(-40vw, -90vh) scale(1.15);
				}
			}

			main {
				place-self: center;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 2rem;
				position: relative;
				z-index: 1;
				background: #00000020;
				padding: 3rem;
				border-radius: var(--radius-lg);
			}

			.hero {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 1rem;
			}

			.hero__eyebrow {
				font-size: 1.1rem;
				font-family: Comfortaa, system-ui, sans-serif;
				color: var(--color-bearmetal-muted-300);
				letter-spacing: 0.15em;
			}

			.hero__logo {
				width: 90vw;
				max-width: 300px;
			}

			.hero__wordmark {
				font-size: 2.5rem;
				letter-spacing: 0.5rem;
				font-family: Orbitron, sans-serif;
				color: var(--color-bearmetal-muted-300);
				span {
					letter-spacing: 0;
				}
			}

			.callout {
				padding: 1rem 1.5rem;
				border-radius: var(--radius-md);
				background: var(--color-surface);
				text-align: center;
				max-width: 42ch;
				p:not(:last-child) {
					margin-bottom: 1rem;
				}
			}
		`;
	}

	get template() {
		return (
			<main>
				<div class="hero">
					<p class="hero__eyebrow">Welcome to the</p>
					<img class="hero__logo" src="/bmicon.svg" alt="BearMetal" fetchPriority="high" />
					<p class="hero__wordmark">
						STAC<span>K</span>
					</p>
				</div>
				<my-counter />
				<div class="callout">
					<p>
						Zero dependencies. Pure, handwritten web components made for the weekender.
					</p>
					<p>
						Edit <code>app/main.tsx</code> to make it yours.
					</p>
				</div>
				<Joke />
			</main>
		);
	}
}
