import { Page } from "@bearmetal/app/ssr";

// `slot` is not in the JSX prop types yet; spreading sidesteps the excess-property check.
const slot = (name: string) => ({ slot: name });

const SAMPLE =
	"# Hello\n\nSome **bold**, some *italic*, and a [link](https://example.com).\n\n- one\n- two\n";

export const home = Page(() => (
	<main>
		<h1>Clawmark editor</h1>
		<cm-editor id="full" value={SAMPLE} placeholder="Write something…">
			<span {...slot("control-bold")}>𝐁</span>
			<span {...slot("control-italic")}>𝘐</span>
			<span {...slot("view-rich")}>✎</span>
			<span {...slot("view-raw")}>{"</>"}</span>
			<span {...slot("view-preview")}>👁</span>
			<small {...slot("below-controls")}>Markdown is saved as you type.</small>
		</cm-editor>
		<h2>Reduced toolbar</h2>
		<note-editor id="note" value="Just **notes**."></note-editor>
	</main>
));
