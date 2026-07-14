import { BMElement, Case, define, each, Show, Switch } from "@bearmetal/app";
import {
	composerOpen,
	followedUsers,
	navigate,
	route,
	startLiveFeed,
	toggleFollow,
	USERS,
} from "./store.ts";
import { TRENDING } from "./data.ts";

import "./components/sidebar.tsx";
import "./components/feed.tsx";
import "./components/explore.tsx";
import "./components/profile.tsx";
import "./components/notifications.tsx";

@define("twitter-right-panel")
export class TwitterRightPanel extends BMElement {
	#query = this.signal("");

	override get template() {
		return (
			<aside class="right-panel">
				<div class="right-search-wrap">
					<div class="right-search">
						<svg
							class="search-icon"
							viewBox="0 0 24 24"
							width="16"
							height="16"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="11" cy="11" r="8" />
							<line x1="21" y1="21" x2="16.65" y2="16.65" />
						</svg>
						<input
							type="search"
							placeholder="Search"
							class="right-search-input"
							onInput={(e: Event) => this.#query.set((e.target as HTMLInputElement).value)}
						/>
					</div>
				</div>

				<div class="panel-card">
					<h3 class="panel-title">Trending</h3>
					{TRENDING.slice(0, 5).map((t) => (
						<div class="trending-row">
							<span class="trending-topic">{t.topic}</span>
							<span class="trending-count">{t.posts} posts</span>
						</div>
					))}
				</div>

				<div class="panel-card">
					<h3 class="panel-title">Who to follow</h3>
					<div class="suggest-list">
						{each(followedUsers, (uid) => {
							const user = USERS.get(uid)!;
							const isFollowed = followedUsers.get().has(uid);
							return (
								<div class="suggest-item">
									<button
										type="button"
										class="suggest-profile-btn"
										onClick={() => navigate({ page: "profile", userId: uid })}
									>
										<span
											class="avatar avatar--md"
											style={`--avatar-color: ${user.color}`}
										>
											{user.displayName[0].toUpperCase()}
										</span>
										<div class="suggest-info">
											<span class="suggest-name">{user.displayName}</span>
											<span class="profile-handle">@{user.handle}</span>
										</div>
									</button>
									<button
										type="button"
										class={`btn-follow btn-follow--sm${isFollowed ? " btn-follow--active" : ""}`}
										onClick={() => toggleFollow(uid)}
									>
										{isFollowed ? "Following" : "Follow"}
									</button>
								</div>
							);
						}, (u) => u)}
					</div>
				</div>

				<div class="panel-footer">
					Built with 🐻 bearmetal
				</div>
			</aside>
		);
	}
}

@define("twitter-modal")
export class TwitterModal extends BMElement {
	override get template() {
		return (
			<div
				class="modal-backdrop"
				onClick={(e: Event) => {
					if (e.target === e.currentTarget) composerOpen.set(false);
				}}
			>
				<div class="modal-inner">
					<div class="modal-composer">
						<div class="modal-header">
							<button
								type="button"
								class="modal-close"
								onClick={() => composerOpen.set(false)}
							>
								✕
							</button>
						</div>
						<twitter-composer autofocus />
					</div>
				</div>
			</div>
		);
	}
}

@define("twitter-app")
export class TwitterApp extends BMElement {
	protected override init() {
		this.addEffect(() => startLiveFeed());
	}

	override get template() {
		return (
			<div class="app-layout">
				<twitter-sidebar />
				<main class="main-content">
					<Switch $={this.computed(() => route.get().page)}>
						<Case $="home">{() => <twitter-home />}</Case>
						<Case $="explore">{() => <twitter-explore />}</Case>
						<Case $="notifications">{() => <twitter-notifications />}</Case>
						<Case $="profile">{() => <twitter-profile />}</Case>
					</Switch>
				</main>
				<twitter-right-panel />
				<Show when={composerOpen}>{() => <twitter-modal />}</Show>
			</div>
		);
	}
}
