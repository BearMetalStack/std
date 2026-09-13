import { BMElement, define } from "@bearmetal/app";
import { css } from "@bearmetal/miscellanea";
import { usersStore } from "@app/stores/users.ts";

// A component reading a store from @app - the whole point of splitting
// shared modules out from per-route orchestration is that this import is
// perfectly ordinary, no different from importing anything else.
@define("user-profile")
export class UserProfile extends BMElement {
	static get stylesheet() {
		return css`
			:scope {
				display: block;
				padding: 1rem 1.5rem;
				border-radius: var(--radius-md);
				background: var(--color-surface);
			}
		`;
	}

	get template() {
		return (
			<p>
				{this.computed(() => {
					const profile = usersStore.profile.get();
					return profile ? `User: ${profile.name} (#${profile.id})` : "Loading…";
				})}
			</p>
		);
	}
}
