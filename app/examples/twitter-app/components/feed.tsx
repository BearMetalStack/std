import { BMElement, define, each } from "@bearmetal/app";
import {
	composerOpen,
	currentUser,
	navigate,
	postTweet,
	toggleLike,
	toggleRetweet,
	tweets,
	USERS,
} from "../store.ts";
import type { Tweet, User } from "../types.ts";
import { fmtCount, timeAgo } from "../utils.ts";

function TweetCard(tweet: Tweet, author: User): Element {
	return (
		<article class="tweet">
			<button
				type="button"
				class="tweet-avatar-btn"
				onClick={() => navigate({ page: "profile", userId: author.id })}
			>
				<span
					class="avatar avatar--lg"
					style={`--avatar-color: ${author.color}`}
				>
					{author.displayName[0].toUpperCase()}
				</span>
			</button>
			<div class="tweet-body">
				<div class="tweet-meta">
					<button
						type="button"
						class="tweet-author-btn"
						onClick={() => navigate({ page: "profile", userId: author.id })}
					>
						<span class="tweet-name">{author.displayName}</span>
						<span class="tweet-handle">@{author.handle}</span>
					</button>
					<span class="tweet-dot">·</span>
					<span class="tweet-time">{timeAgo(tweet.timestamp)}</span>
				</div>
				<p class="tweet-text">{tweet.text}</p>
				<div class="tweet-actions">
					<button type="button" class="action action--reply">
						<span class="action-icon">
							<svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
							</svg>
						</span>
						<span class="action-label">{fmtCount(tweet.replies)}</span>
					</button>
					<button
						type="button"
						class={`action action--retweet${tweet.retweeted ? " action--on" : ""}`}
						onClick={() => toggleRetweet(tweet.id)}
					>
						<span class="action-icon">
							<svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M17 1l4 4-4 4" />
								<path d="M3 11V9a4 4 0 014-4h14" />
								<path d="M7 23l-4-4 4-4" />
								<path d="M21 13v2a4 4 0 01-4 4H3" />
							</svg>
						</span>
						<span class="action-label">{fmtCount(tweet.retweets)}</span>
					</button>
					<button
						type="button"
						class={`action action--like${tweet.liked ? " action--on" : ""}`}
						onClick={() => toggleLike(tweet.id)}
					>
						<span class="action-icon">
							<svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill={tweet.liked ? "currentColor" : "none"}
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
							</svg>
						</span>
						<span class="action-label">{fmtCount(tweet.likes)}</span>
					</button>
					<button type="button" class="action action--share">
						<span class="action-icon">
							<svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
								<polyline points="16 6 12 2 8 6" />
								<line x1="12" y1="2" x2="12" y2="15" />
							</svg>
						</span>
					</button>
				</div>
			</div>
		</article>
	) as Element;
}

@define("twitter-composer")
export class TwitterComposer extends BMElement<{ textarea: HTMLTextAreaElement }> {
	#text = this.signal("");
	#posting = this.signal(false);

	#charCount = this.computed(() => this.#text.get().length);
	#overLimit = this.computed(() => this.#charCount.get() > 280);
	#canPost = this.computed(
		() =>
			this.#text.get().trim().length > 0 &&
			!this.#overLimit.get() &&
			!this.#posting.get(),
	);
	#charCountClass = this.computed(() =>
		this.#overLimit.get() ? "char-count char-count--over" : "char-count"
	);
	#btnLabel = this.computed(() => this.#posting.get() ? "Posting…" : "Post");

	#submit = async (e: Event) => {
		e.preventDefault();
		const text = this.#text.get().trim();
		if (!text || this.#overLimit.get()) return;
		this.#posting.set(true);
		await new Promise((r) => setTimeout(r, 280));
		postTweet(text);
		this.#text.set("");
		const textarea = this.refs.textarea.get();
		if (textarea) textarea.value = "";
		this.#posting.set(false);
		composerOpen.set(false);
	};

	protected override init() {
		// A plain attribute check, not a reactive `@prop` — this only needs to
		// run once at mount, and the modal remounts the composer fresh each open.
		// `init()` runs before the template fragment is attached to the DOM, so
		// `.focus()` needs to be deferred to a microtask to take effect.
		if (this.hasAttribute("autofocus")) {
			queueMicrotask(() => this.refs.textarea.get()?.focus());
		}
	}

	protected get template() {
		const user = currentUser.get();
		return (
			<form class="composer" onSubmit={this.#submit}>
				<span
					class="avatar avatar--lg"
					style={`--avatar-color: ${user.color}`}
				>
					{user.displayName[0].toUpperCase()}
				</span>
				<div class="composer-right">
					<textarea
						ref="textarea"
						class="composer-textarea"
						placeholder="What's on your mind?"
						onInput={(e: Event) => this.#text.set((e.target as HTMLTextAreaElement).value)}
					/>
					<div class="composer-footer">
						<span class={this.#charCountClass}>
							{this.#charCount}
							<span class="composer-limit">/ 280</span>
						</span>
						<button
							type="submit"
							class="post-btn"
							disabled={this.#canPost}
						>
							{this.#btnLabel}
						</button>
					</div>
				</div>
			</form>
		);
	}
}

@define("twitter-home")
export class TwitterHome extends BMElement {
	protected get template() {
		return (
			<div class="home-page">
				<header class="page-header">
					<h2 class="page-title">Home</h2>
				</header>
				<div class="home-composer-wrap">
					<twitter-composer />
				</div>
				<div class="feed-divider" />
				<div class="tweet-feed">
					{each(
						tweets,
						(tweet) => TweetCard(tweet, USERS.get(tweet.authorId)!),
						(tweet) => tweet.id,
					)}
				</div>
			</div>
		);
	}
}
