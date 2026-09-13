// A shared client-side store: plain @app modules like this one are just
// ordinary imports, so both a @pages file (to populate it) and a @components
// file (to render it) can pull in the same signal.
import { createSignal } from "@bearmetal/app";

export interface UserProfile {
	id: string;
	name: string;
}

const profile = createSignal<UserProfile | null>(null);

export const usersStore = {
	profile,
	load(id: string) {
		profile.set({ id, name: `User ${id}` });
	},
};
