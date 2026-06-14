import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";

@define("app-main", import.meta)
export class App extends BMElement {
	static get stylesheet() {
		return css`
			${this.tag} {
				display: grid;
				width: 100vw;
				height: 100vh;
			}

			main {
				place-self: center;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 2rem;
			}

			img {
				width: 90vw;
				max-width: 300px;
			}

			.thing {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 1rem;
				font-size: 2rem;
				letter-spacing: 0.5rem;
				font-family: Orbitron, sans-serif;
				color: var(--color-bearmetal-muted-300);
				span {
					letter-spacing: 0;
				}
			}

			h1 {
				font-size: 2rem;
				font-family: Comfortaa, system-ui, system, sans-serif;
			}

			.instruct {
				padding: 1rem;
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
				<h1>Welcome to the</h1>
				<div class="thing">
					<img src="/bmicon.svg" alt="BearMetal Logo" />
					<p>
						STAC<span>K</span>
					</p>
				</div>
				<my-counter />
				<div class="instruct">
					<p>
						Welcome to BearMetal! No external dependencies, 100% handwritten, made for the
						weekender.
					</p>
					<p>
						To get started, edit <code>app/main.tsx</code>
					</p>
				</div>
				<p>Powered by BearMetal Stack</p>
			</main>
		);
	}
}
