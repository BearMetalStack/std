import { Layout } from "@bearmetal/app/ssr";
import { ThemeStyle } from "@bearmetal/drip/ssr";

export const Document = Layout((props) => (
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<meta name="description" content={props.description ?? "Generated with BearMetal SSR"} />
			<title>{props.title}</title>
			<link rel="preconnect" href="https://fonts.googleapis.com" />
			<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
			<ThemeStyle theme={props.theme} />
			<link
				href="https://fonts.googleapis.com/css2?family=Urbanist:ital,wght@0,100..900;1,100..900&display=swap"
				rel="stylesheet"
			/>
		</head>
		<body>
			{props.children}
		</body>
	</html>
));
