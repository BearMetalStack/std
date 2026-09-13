/** Views/layouts for `mod.test.ts`. Separate because the test file is `.ts`. */

import type { LayoutEl } from "./mod.ts";

export const layoutWithHead: LayoutEl = ({ children, title }) => (
	<html>
		<head>
			<title>{title}</title>
		</head>
		<body>{children}</body>
	</html>
);

export const layoutWithoutHead: LayoutEl = ({ children }) => <body>{children}</body>;

export function simpleView() {
	return <div>hello</div>;
}
