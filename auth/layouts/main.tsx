import { css } from "@bearmetal/miscellanea";
import type { LayoutEl } from "@bearmetal/app/ssr";

export const mainLayout: LayoutEl = (props) => {
	return (
		<html>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Sign In</title>
				<link
					rel="preload"
					href="https://cdn.bear-metal.dev/webbies/0.0.1/utility.js"
					as="script"
				/>
				<link rel="preload" href="https://cdn.bear-metal.dev/webbies/0.0.1/layout.js" as="script" />
				<link
					rel="preload"
					href="https://cdn.bear-metal.dev/webbies/0.0.1/utility.css"
					as="style"
				/>
				<link rel="preload" href="https://cdn.bear-metal.dev/webbies/0.0.1/layout.css" as="style" />
				<script defer src="https://cdn.bear-metal.dev/webbies/0.0.1/utility.js" />
				<script defer src="https://cdn.bear-metal.dev/webbies/0.0.1/layout.js" />
				<link rel="stylesheet" href="https://cdn.bear-metal.dev/webbies/0.0.1/inputs.css" />
				<style raw>
					{css`
						body {
							width: 100vw;
							height: 100vh;
							display: grid;
						}
						.form {
							color: var(--color-text);
							background-color: var(--color-brand-800);
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
