import { Page } from "@bearmetal/app/ssr";

// `app-main` lives in @components, so it is registered and bundled without this
// view importing it. Views name components; they do not import them.
export const home = Page(() => <app-main />);
