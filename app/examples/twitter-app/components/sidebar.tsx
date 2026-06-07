import { BMElement, define } from "@bearmetal/app";
import { composerOpen, currentUser, navigate, route, unreadCount } from "../store.ts";
import type { Route } from "../types.ts";

type NavItem = { icon: string; label: string; target: Route };

const NAV: NavItem[] = [
	{ icon: "⌂", label: "Home", target: { page: "home" } },
	{ icon: "⊹", label: "Explore", target: { page: "explore" } },
	{ icon: "♪", label: "Notifications", target: { page: "notifications" } },
	{
		icon: "◉",
		label: "Profile",
		target: { page: "profile", userId: "u1" },
	},
];

@define("twitter-sidebar")
export class TwitterSidebar extends BMElement {
	#navItemClass = (page: string) =>
		this.computed(() => `nav-item${route.get().page === page ? " nav-item--active" : ""}`);

	#badgeText = this.computed(() => {
		const n = unreadCount.get();
		if (n === 0) return null;
		return n > 99 ? "99+" : String(n);
	});

	protected override get template() {
		const user = currentUser.get();
		return (
			<aside class="sidebar">
				<div class="sidebar-brand">
					<span class="brand-bear">🐻</span>
					<span class="brand-name">BearPost</span>
				</div>

				<nav class="sidebar-nav">
					{NAV.map((item) => (
						<button
							type="button"
							class={this.#navItemClass(item.target.page)}
							onClick={() => navigate(item.target)}
						>
							<span class="nav-icon">{item.icon}</span>
							<span class="nav-label">{item.label}</span>
							{item.label === "Notifications"
								? (
									<span
										class="notif-badge"
										hidden={this.computed(() => this.#badgeText.get() === null)}
									>
										{this.#badgeText}
									</span>
								)
								: null}
						</button>
					))}
				</nav>

				<button
					type="button"
					class="compose-btn"
					onClick={() => composerOpen.set(true)}
				>
					Post
				</button>

				<button
					type="button"
					class="sidebar-profile"
					onClick={() => navigate({ page: "profile", userId: user.id })}
				>
					<span
						class="avatar avatar--md"
						style={`--avatar-color: ${user.color}`}
					>
						{user.displayName[0].toUpperCase()}
					</span>
					<div class="sidebar-profile-info">
						<span class="profile-name">{user.displayName}</span>
						<span class="profile-handle">@{user.handle}</span>
					</div>
					<span class="profile-more">···</span>
				</button>
			</aside>
		);
	}
}
