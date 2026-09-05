import { BMElement, define, state } from "@bearmetal/app";
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
					color: var(--color-bearmetal-info-200);
					&.banana {
						color: var(--color-bearmetal-warning-200);
					}
					&.orange {
						color: var(--color-bearmetal-orange-200);
					}
				}
			}
		`;
	}

	/**
	 * The punchline, loaded on the server and carried to the browser in the
	 * markup — `@state` is what makes it survive the trip, so the client never
	 * fetches it.
	 */
	@state()
	accessor punchline = this.signal("");

	override async serverInit() {
		await Promise.resolve();
		this.punchline.set("Orange you glad I didn't say banana?");
	}

	override init() {
		this.addEffect(() => {
			const punchline = this.punchline.get();
			if (!punchline) return;
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
						return punchline;
					default:
						return joke[count % joke.length];
				}
			};
			const to = setInterval(() => {
				const jokeEl = this.refs.joke.get();
				if (!jokeEl) return;
				const l = line();
				const c = l.toLowerCase().includes("orange")
					? "orange"
					: l.toLowerCase().includes("banana")
					? "banana"
					: "";
				jokeEl.append(<p class={c}>{l}</p>);

				if (l === punchline) {
					clearInterval(to);
				}
				jokeEl.scrollTop = jokeEl.scrollHeight;
				count++;
			}, 4000);
			return () => clearInterval(to);
		});
	}

	override get template() {
		const m = this.computed(() => {
			if (this.punchline.get()) return null;
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
