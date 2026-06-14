import { Layout } from "@bearmetal/app/ssr";
import { ThemeStyle } from "@bearmetal/drip/ssr";

export const Document = Layout((props) => (
	<html>
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<title>{props.title}</title>
			<ThemeStyle theme={props.theme} />
		</head>
		<body>
			{props.children}
		</body>
	</html>
));
