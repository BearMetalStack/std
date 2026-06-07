import { Signal } from "@signals";
import type { Notification, Route, Tweet, User } from "./types.ts";
import { getNextFreshTweet, ME, SEED_NOTIFICATIONS, SEED_TWEETS, USERS } from "./data.ts";

export { USERS };

export const currentUser = new Signal.State<User>(ME);
export const tweets = new Signal.State<Tweet[]>(SEED_TWEETS);
export const notifications = new Signal.State<Notification[]>(SEED_NOTIFICATIONS);
export const route = new Signal.State<Route>({ page: "home" });
export const followedUsers = new Signal.State<Set<string>>(new Set());
export const composerOpen = new Signal.State(false);

export function navigate(r: Route) {
	route.set(r);
}

export function toggleLike(tweetId: string) {
	tweets.set(
		tweets.get().map((t) => {
			if (t.id !== tweetId) return t;
			const liked = !t.liked;
			return { ...t, liked, likes: liked ? t.likes + 1 : t.likes - 1 };
		}),
	);
}

export function toggleRetweet(tweetId: string) {
	tweets.set(
		tweets.get().map((t) => {
			if (t.id !== tweetId) return t;
			const retweeted = !t.retweeted;
			return {
				...t,
				retweeted,
				retweets: retweeted ? t.retweets + 1 : t.retweets - 1,
			};
		}),
	);
}

export function postTweet(text: string) {
	if (!text.trim()) return;
	const newTweet: Tweet = {
		id: `user_${Date.now()}`,
		authorId: ME.id,
		text: text.trim(),
		timestamp: new Date(),
		likes: 0,
		retweets: 0,
		replies: 0,
		liked: false,
		retweeted: false,
	};
	tweets.set([newTweet, ...tweets.get()]);
}

export function toggleFollow(userId: string) {
	const current = new Set(followedUsers.get());
	if (current.has(userId)) {
		current.delete(userId);
	} else {
		current.add(userId);
	}
	followedUsers.set(current);
}

export function markAllRead() {
	notifications.set(notifications.get().map((n) => ({ ...n, read: true })));
}

export const unreadCount = new Signal.Computed(
	() => notifications.get().filter((n) => !n.read).length,
);

export function startLiveFeed(): () => void {
	const id = setInterval(() => {
		const tweet = getNextFreshTweet();
		tweets.set([tweet, ...tweets.get()]);
	}, 18000);
	return () => clearInterval(id);
}
