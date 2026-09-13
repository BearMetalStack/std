import { Page } from "@bearmetal/app/ssr";

// `user-profile` lives in @components, registered and bundled via
// components/users/_id.manifest.ts without this view importing it.
export const userProfile = Page(() => <user-profile />, "Profile");
