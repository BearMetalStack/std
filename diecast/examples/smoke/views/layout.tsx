import { Layout } from "@bearmetal/app/ssr";

/**
 * Deliberately offline - no font CDN, no external stylesheet. A generated
 * site should build with the network unplugged.
 */
export const layout = Layout((props) => (
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<title>{props.title}</title>
			<style>
				{`body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 40rem; }`}
			</style>
		</head>
		<body>
			{props.children}
		</body>
	</html>
));
