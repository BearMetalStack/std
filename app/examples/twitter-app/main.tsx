import { BMElement, define, each } from "@bearmetal/app";
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
import type { Route } from "./types.ts";

import "./components/sidebar.tsx";
import "./components/feed.tsx";
import "./components/explore.tsx";
import "./components/profile.tsx";
import "./components/notifications.tsx";

function pageTagFor(r: Route): string {
	switch (r.page) {
		case "home":
			return "twitter-home";
		case "explore":
			return "twitter-explore";
		case "notifications":
			return "twitter-notifications";
		case "profile":
			return "twitter-profile";
	}
}

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
				<div class="modal-inner" ref="modal">
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
						<twitter-composer />
					</div>
				</div>
			</div>
		);
	}

	protected override init() {
		this.addEffect(() => {
			const open = composerOpen.get();
			(this as unknown as HTMLElement).style.display = open ? "flex" : "none";
			if (open) {
				const ta = this.refs.modal.querySelector("textarea");
				if (ta) (ta as HTMLTextAreaElement).focus();
			}
		});
	}
}

@define("twitter-app")
export class TwitterApp extends BMElement<{ main: HTMLElement }> {
	protected override init() {
		this.addEffect(() => startLiveFeed());
		let currentPageEl: HTMLElement | null = null;

		this.addEffect(() => {
			const r = route.get();
			const tag = pageTagFor(r);

			if (currentPageEl?.tagName.toLowerCase() === tag) {
				if (tag === "twitter-profile") {
					(currentPageEl as unknown as { setUserId(id: string): void })
						.setUserId(
							(r as { page: "profile"; userId: string }).userId,
						);
				}
				return;
			}

			const el = document.createElement(tag) as HTMLElement;
			if (tag === "twitter-profile") {
				(el as unknown as { setUserId(id: string): void }).setUserId(
					(r as { page: "profile"; userId: string }).userId,
				);
			}

			this.refs.main.replaceChildren(el);
			currentPageEl = el;
		});
	}

	override get template() {
		return (
			<div class="app-layout">
				<twitter-sidebar />
				<main class="main-content" ref="main">
				</main>
				<twitter-right-panel />
				<twitter-modal />
			</div>
		);
	}
}
