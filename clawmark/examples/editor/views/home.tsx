import { Page } from "@bearmetal/app/ssr";

const SAMPLE = "# Hello\n\nSome **bold**, some *italic*, and a [link](https://example.com).\n\n- one\n- two\n";

export const home = Page(() => (
	<main>
		<h1>Clawmark editor</h1>
		<cm-editor id="full" value={SAMPLE} placeholder="Write something…"></cm-editor>
		<h2>Reduced toolbar</h2>
		<note-editor id="note" value="Just **notes**."></note-editor>
	</main>
));
