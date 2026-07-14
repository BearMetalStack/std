import { BMElement, define, each, when } from "@bearmetal/app";
import {
	currentUser,
	followedUsers,
	navigate,
	route,
	toggleFollow,
	toggleLike,
	toggleRetweet,
	tweets,
	USERS,
} from "../store.ts";
import type { Tweet, User } from "../types.ts";
import { fmtCount, timeAgo } from "../utils.ts";

function ProfileTweet(tweet: Tweet, author: User): Element {
	return (
		<article class="tweet">
			<span
				class="avatar avatar--lg"
				style={`--avatar-color: ${author.color}`}
			>
				{author.displayName[0].toUpperCase()}
			</span>
			<div class="tweet-body">
				<div class="tweet-meta">
					<span class="tweet-name">{author.displayName}</span>
					<span class="tweet-handle">@{author.handle}</span>
					<span class="tweet-dot">·</span>
					<span class="tweet-time">{timeAgo(tweet.timestamp)}</span>
				</div>
				<p class="tweet-text">{tweet.text}</p>
				<div class="tweet-actions">
					<button type="button" class="action action--reply">
						<svg
							viewBox="0 0 24 24"
							width="16"
							height="16"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
						</svg>
						{fmtCount(tweet.replies)}
					</button>
					<button
						type="button"
						class={`action action--retweet${tweet.retweeted ? " action--on" : ""}`}
						onClick={() => toggleRetweet(tweet.id)}
					>
						<svg
							viewBox="0 0 24 24"
							width="16"
							height="16"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M17 1l4 4-4 4" />
							<path d="M3 11V9a4 4 0 014-4h14" />
							<path d="M7 23l-4-4 4-4" />
							<path d="M21 13v2a4 4 0 01-4 4H3" />
						</svg>
						{fmtCount(tweet.retweets)}
					</button>
					<button
						type="button"
						class={`action action--like${tweet.liked ? " action--on" : ""}`}
						onClick={() => toggleLike(tweet.id)}
					>
						<svg
							viewBox="0 0 24 24"
							width="16"
							height="16"
							fill={tweet.liked ? "currentColor" : "none"}
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
						</svg>
						{fmtCount(tweet.likes)}
					</button>
				</div>
			</div>
		</article>
	) as Element;
}

@define("twitter-profile")
export class TwitterProfile extends BMElement {
	// `route` is the single source of truth for which profile to show — reading
	// it directly (rather than threading userid through as a prop) sidesteps
	// the browser's lack of native decorator-metadata support, which currently
	// makes `@prop`'s observedAttributes wiring silently do nothing once bundled.
	#userId = this.computed(() => {
		const r = route.get();
		return r.page === "profile" ? r.userId : undefined;
	});

	#tab = this.signal<"posts" | "replies" | "likes">("posts");

	#user = this.computed(() => {
		const uid = this.#userId.get();
		return uid == null ? undefined : USERS.get(uid);
	});
	#hasUser = this.computed(() => this.#user.get() != null);
	#userMissing = this.computed(() => this.#user.get() == null);
	#isMe = this.computed(() => this.#userId.get() === currentUser.get().id);
	#followed = this.computed(() => followedUsers.get().has(this.#userId.get() ?? ""));

	#shown = this.computed(() => {
		const uid = this.#userId.get();
		const tab = this.#tab.get();
		const allTweets = tweets.get();
		return tab === "posts"
			? allTweets.filter((t) => t.authorId === uid)
			: tab === "likes"
			? allTweets.filter((t) => t.liked)
			: [];
	});

	#tabClass = (t: "posts" | "replies" | "likes") =>
		this.computed(() => `tab-btn${this.#tab.get() === t ? " tab-btn--active" : ""}`);

	protected get template() {
		return (
			<div class="profile-page">
				<header class="page-header">
					<button
						type="button"
						class="back-btn"
						onClick={() => navigate({ page: "home" })}
					>
						← Back
					</button>
				</header>

				{when(this.#hasUser, () => (
					<>
						<div class="profile-header">
							{this.computed(() => {
								const u = this.#user.get();
								// The outer `when(hasUser, …)` guards this content, but async
								// effect flushing can re-run this computed one tick after
								// `#user` flips to undefined, before that guard tears it down.
								// deno-lint-ignore jsx-no-useless-fragment
								if (!u) return <></>;
								return (
									<>
										<div
											class="profile-cover"
											style={`--cover-color: ${u.color}`}
										/>
										<div class="profile-info-row">
											<span
												class="avatar avatar--xl"
												style={`--avatar-color: ${u.color}`}
											>
												{u.displayName[0].toUpperCase()}
											</span>
											{this.#isMe.get()
												? (
													<button type="button" class="btn-outline" onClick={() => {}}>
														Edit profile
													</button>
												)
												: (
													<button
														type="button"
														class={this.computed(() =>
															`btn-follow${this.#followed.get() ? " btn-follow--active" : ""}`
														)}
														onClick={() => {
															const uid = this.#userId.get();
															if (uid) toggleFollow(uid);
														}}
													>
														{this.computed(() => this.#followed.get() ? "Following" : "Follow")}
													</button>
												)}
										</div>
										<div class="profile-details">
											<h2 class="profile-display-name">{u.displayName}</h2>
											<span class="profile-handle">@{u.handle}</span>
											{u.bio ? <p class="profile-bio">{u.bio}</p> : null}
											<div class="profile-meta">
												{u.location ? <span class="meta-item">📍 {u.location}</span> : null}
												<span class="meta-item">📅 Joined {u.joinedYear}</span>
											</div>
											<div class="profile-counts">
												<span class="count-item">
													<strong>{fmtCount(u.following)}</strong>
													{" Following"}
												</span>
												<span class="count-item">
													<strong>{fmtCount(u.followers)}</strong>
													{" Followers"}
												</span>
											</div>
										</div>
									</>
								);
							})}
						</div>

						<div class="profile-tabs">
							{(["posts", "replies", "likes"] as const).map((t) => (
								<button
									type="button"
									class={this.#tabClass(t)}
									onClick={() => this.#tab.set(t)}
								>
									{t.charAt(0).toUpperCase() + t.slice(1)}
								</button>
							))}
						</div>

						<div class="tweet-feed">
							{each(
								this.#shown,
								(t) => {
									const author = USERS.get(t.authorId);
									// deno-lint-ignore jsx-no-useless-fragment
									if (!author) return <></>;
									return ProfileTweet(t, author);
								},
								(t) => t.id,
							)}
						</div>
					</>
				))}

				{when(this.#userMissing, () => <div class="empty-state">User not found</div>)}
			</div>
		);
	}
}
