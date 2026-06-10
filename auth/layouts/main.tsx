import { css } from "@bearmetal/miscellanea";
import type { LayoutEl } from "@bearmetal/app/ssr";
import { ThemeStyle } from "@bearmetal/drip/ssr";

export const mainLayout: LayoutEl = (props) => {
	return (
		<html>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Sign In</title>
				<ThemeStyle />
				<style raw>
					{css`
						body {
							width: 100vw;
							height: 100vh;
							display: grid;
						}
						.form {
							color: var(--color-text);
							background-color: var(--color-bearmetal-800);
							place-self: center;
							min-width: 200px;
							padding: 1rem;
							border-radius: var(--modal-radius);
							box-shadow: var(--modal-shadow);

							p {
								margin-top: 0.5rem;
								padding: 0;
								a {
									color: var(--color-text-subtle);
								}
							}
						}
						div > form > fieldset {
							grid-template-columns: 1fr;
							border: none;
							padding: 1rem 0 0;
						}
						.dividery {
							display: flex;
							align-items: center;
							gap: 0.5rem;
							margin: 0.5rem;

							&::before, &::after {
								content: "";
								flex: 1;
								border-top: 1px solid currentColor;
							}
						}
						.wide {
							width: 100%;
							& bm-icon {
								margin-right: 0.5rem;
							}
						}
						input {
							width: 100%;
						}
					`}
				</style>
			</head>
			<body>
				<div class="form">
					{props.children}
				</div>
			</body>
		</html>
	);
};
