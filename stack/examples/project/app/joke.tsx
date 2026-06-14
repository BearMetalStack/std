import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";

@define("app-joke", import.meta)
export class Joke extends BMElement<{ joke: Element }> {
	static get stylesheet() {
		return css`
			.joke {
				max-height: 10ch;
				overflow-y: auto;
				width: 100%;
				scroll-behavior: smooth;
				scrollbar-width: none;
				text-align: center;
				p:nth-child(odd) {
					color: var(--color-bearmetal-info-300);
				}
			}
		`;
	}

	static async serverLoad(_props: Record<string, unknown>) {
		await Promise.resolve();
		return { orange: "Orange you glad I didn't say banana?" };
	}

	init() {
		this.addEffect(() => {
			if (!this.signals.$orange) return;
			let count = 0;
			const joke = [
				"Knock knock",
				"Who's there?",
				"Banana",
				"Banana who?",
			];
			const line = () => {
				switch (count) {
					case 14:
						return "Orange";
					case 15:
						return "Orange who?";
					case 16:
						return this.signals.$orange.get() as string;
					default:
						return joke[count % joke.length];
				}
			};
			const to = setInterval(() => {
				const l = line();
				this.refs.joke.append(<p>{l}</p> as Node);

				if (l === this.signals.$orange.get()) {
					clearInterval(to);
				}
				this.refs.joke.scrollTop = this.refs.joke.scrollHeight;
				count++;
			}, 4000);
			return () => clearInterval(to);
		});
	}

	get template() {
		return <div class="joke" ref="joke"></div>;
	}
}
