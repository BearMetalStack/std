import { Layout } from "@bearmetal/app/ssr";
import { BMDripBase } from "@bearmetal/drip/ssr";
import { GoogleFonts } from "@bearmetal/stack";

export const Document = Layout((props) => (
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<meta name="description" content={props.description ?? "Generated with BearMetal SSR"} />
			<title>{props.title}</title>
			{
				/*<link rel="preconnect" href="https://fonts.googleapis.com" />
			<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />*/
			}
			<BMDripBase theme={props.theme} />
			<GoogleFonts
				fonts={[
					{
						family: "Urbanist",
						wght: ["0,100..900", "1,100..900"],
						ital: true,
					},
					{
						family: "Orbitron",
						wght: "400..900",
					},
				]}
			/>
			{
				/*<link
				href="https://fonts.googleapis.com/css2?family=Urbanist:ital,wght@0,100..900;1,100..900&family=Orbitron:wght@400..900&display=swap"
				rel="stylesheet"
			/>*/
			}
		</head>
		<body>
			{props.children}
		</body>
	</html>
));
