import { Layout } from "@bearmetal/app/ssr";
import { BMDripBase } from "@bearmetal/drip/ssr";

export const page = Layout((props) => (
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<title>{props.title}</title>
			<BMDripBase theme={props.theme} />
		</head>
		<body style="max-width: 48rem; margin: 2rem auto; padding: 0 1rem; font-family: var(--font-body)">
			{props.children}
		</body>
	</html>
));
