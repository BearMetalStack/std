import type { SiteContent } from "@bearmetal/gutenbearg";
import { site } from "./site.ts";
import { home } from "./home.tsx";
import { gettingStarted } from "./getting_started.tsx";
import { reactivity } from "./reactivity.tsx";
import { signal } from "./signal.tsx";
import { changelog } from "./changelog.tsx";

// Pages in the nav without an entry here render as drafts ("still hibernating").
export const content: SiteContent = {
	site,
	home,
	pages: {
		"learn/getting-started": gettingStarted,
		"learn/reactivity": reactivity,
		"reference/signal": signal,
		"changelog": changelog,
	},
};
