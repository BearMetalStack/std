import { BMElement, define, each } from "@bearmetal/app";
import { navigate, toggleLike, toggleRetweet, tweets, USERS } from "../store.ts";
import { TRENDING } from "../data.ts";
import type { Tweet, User } from "../types.ts";
import { fmtCount, timeAgo } from "../utils.ts";

function MiniTweet(tweet: Tweet, author: User): Element {
	return (
		<article class="mini-tweet">
			<button
				type="button"
				class="tweet-avatar-btn"
				onClick={() => navigate({ page: "profile", userId: author.id })}
			>
				<span
					class="avatar avatar--sm"
					style={`--avatar-color: ${author.color}`}
				>
					{author.displayName[0].toUpperCase()}
				</span>
			</button>
			<div class="mini-tweet-body">
				<div class="mini-tweet-meta">
					<span class="tweet-name">{author.displayName}</span>
					<span class="tweet-handle">@{author.handle}</span>
					<span class="tweet-dot">·</span>
					<span class="tweet-time">{timeAgo(tweet.timestamp)}</span>
				</div>
				<p class="tweet-text">{tweet.text}</p>
				<div class="mini-tweet-actions">
					<button
						type="button"
						class={`action action--like${tweet.liked ? " action--on" : ""}`}
						onClick={() => toggleLike(tweet.id)}
					>
						<svg
							viewBox="0 0 24 24"
							width="14"
							height="14"
							fill={tweet.liked ? "currentColor" : "none"}
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
						</svg>{" "}
						{fmtCount(tweet.likes)}
					</button>
					<button
						type="button"
						class={`action action--retweet${tweet.retweeted ? " action--on" : ""}`}
						onClick={() => toggleRetweet(tweet.id)}
					>
						<svg
							viewBox="0 0 24 24"
							width="14"
							height="14"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M17 1l4 4-4 4" />
							<path d="M3 11V9a4 4 0 014-4h14" />
							<path d="M7 23l-4-4 4-4" />
							<path d="M21 13v2a4 4 0 01-4 4H3" />
						</svg>{" "}
						{fmtCount(tweet.retweets)}
					</button>
				</div>
			</div>
		</article>
	) as Element;
}

@define("twitter-explore")
export class TwitterExplore extends BMElement<{ search: HTMLInputElement }> {
	#query = this.signal("search");
	#filtered = this.computed(() => {
		const q = this.#query.get().toLowerCase().trim();
		const allTweets = tweets.get();
		return q
			? allTweets.filter(
				(t) =>
					t.text.toLowerCase().includes(q) ||
					(USERS.get(t.authorId)?.handle ?? "").includes(q) ||
					(USERS.get(t.authorId)?.displayName ?? "").toLowerCase().includes(q),
			)
			: [...allTweets].sort((a, b) => b.likes - a.likes).slice(0, 8);
	});
	#sectionTitle = this.computed(() => {
		const q = this.#query.get().toLowerCase().trim();
		return q ? `Results for "${q}"` : "Top Posts";
	});

	protected override get template() {
		return (
			<div class="explore-page">
				<header class="page-header">
					<h2 class="page-title">Explore</h2>
				</header>
				<div class="explore-search-wrap">
					<input
						ref="search"
						type="search"
						class="explore-search"
						placeholder="Search BearPost"
						onInput={(e: Event) => this.#query.set((e.target as HTMLInputElement).value)}
					/>
				</div>

				<section class="explore-section">
					<h3 class="section-title">Trending</h3>
					<div class="trending-list">
						{TRENDING.map((t) => (
							<button
								type="button"
								class="trending-item"
								onClick={() => {
									const term = t.topic.replace(/^#/, "");
									this.#query.set(term);
									this.refs.search.value = term;
								}}
							>
								<span class="trending-topic">{t.topic}</span>
								<span class="trending-posts">{t.posts} posts</span>
							</button>
						))}
					</div>
				</section>

				<section class="explore-section">
					<h3 class="section-title">{this.#sectionTitle}</h3>
					{each(
						this.#filtered,
						(tweet) => {
							const author = USERS.get(tweet.authorId);
							// deno-lint-ignore jsx-no-useless-fragment
							if (!author) return <></>;
							return MiniTweet(tweet, author);
						},
						(tweet) => tweet.id,
					)}
				</section>
			</div>
		);
	}
}
