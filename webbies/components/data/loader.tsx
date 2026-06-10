import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";
import { animationSheet } from "@style";
import { BmIcon } from "@components";

@define("bm-loader", import.meta)
export class Loader extends BMElement {
	get template() {
		return (
			<>
				<style raw>
					{css`
						.notched {
							width: var(--space-8);
							height: var(--space-8);
							animation: spin 1s steps(8, end) infinite;

							/*animation: spin 1s infinite;
							border: 1px solid white;
							border-top: none;
							border-radius: var(--space-4);*/
						}

						:host > div {
							display: flex;
							flex-direction: column;
							justify-content: center;
							align-items: center;
						}
					`}
				</style>
				<div>
					<BmIcon icon="spinner-gap" class="notched" />
					{/*<div class="notched"></div>*/}
					<div>
						<slot></slot>
					</div>
				</div>
			</>
		);
	}

	init() {
		this.useShadow();
		this.adoptStyleSheet(animationSheet);
	}
}
