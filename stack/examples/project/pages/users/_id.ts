import { registerPage } from "@bearmetal/app";
import { usersStore } from "@app/stores/users.ts";

// Resolves for /users/:id - the server already picked this key via the same
// _id/main fallback @components manifests use, so this is a plain lookup,
// not a route match, by the time it runs in the browser.
registerPage("users/_id", () => {
	const id = location.pathname.split("/").pop() ?? "";
	usersStore.load(id);
});
