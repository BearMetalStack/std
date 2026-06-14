import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";

@define("app-joke")
export class Joke extends BMElement<{ joke: Element }> {
	static get stylesheet() {
		return css`
			.joke {
				height: 5ch;
				overflow-y: auto;
				width: 100%;
				scroll-behavior: smooth;
				scrollbar-width: none;
				text-align: center;
				p:nth-child(odd) {
					max-width: 45ch;
					color: var(--color-bearmetal-info-300);
					&.banana {
						color: var(--color-bearmetal-warning-300);
					}
					&.orange {
						color: var(--color-bearmetal-orange-300);
					}
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
				const c = l.toLowerCase().includes("orange")
					? "orange"
					: l.toLowerCase().includes("banana")
					? "banana"
					: "";
				this.refs.joke.append(<p class={c}>{l}</p> as Node);

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
		const m = this.computed(() => {
			if (this.signals.$orange) return undefined;
			return (
				<p class="banana">
					If you are seeing this, it means I wasn't rendered on the server. Dang, guess there's no
					joke for you here.
				</p>
			);
		});
		return (
			<div class="joke" ref="joke">
				{m}
			</div>
		);
	}
}
