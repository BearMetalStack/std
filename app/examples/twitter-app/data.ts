import type { Notification, Tweet, User } from "./types.ts";

export const USERS = new Map<string, User>([
	["u1", {
		id: "u1",
		handle: "emmaline",
		displayName: "Emmaline",
		bio: "building bearmetal, a signals-first web framework. she/her",
		location: "Pacific Northwest 🌲",
		followers: 2847,
		following: 312,
		joinedYear: 2021,
		color: "#6366f1",
	}],
	["u2", {
		id: "u2",
		handle: "rustacean_pete",
		displayName: "Pete Writes Rust",
		bio: "all i do is fight the borrow checker and i love it",
		location: "🦀",
		followers: 18420,
		following: 502,
		joinedYear: 2018,
		color: "#f97316",
	}],
	["u3", {
		id: "u3",
		handle: "css_witch",
		displayName: "Priya ✨",
		bio: "styling the web one selector at a time. design systems @ dayjob",
		location: "internet",
		followers: 9312,
		following: 741,
		joinedYear: 2019,
		color: "#ec4899",
	}],
	["u4", {
		id: "u4",
		handle: "no_more_yaml",
		displayName: "Marco Devops",
		bio: "if yaml didn't exist i would have so much more free time",
		location: "Berlin 🐻",
		followers: 5102,
		following: 290,
		joinedYear: 2020,
		color: "#22c55e",
	}],
	["u5", {
		id: "u5",
		handle: "type_theorist",
		displayName: "Yuki Nakamura",
		bio: "dependent types are the answer. the question doesn't matter.",
		location: "Tokyo",
		followers: 7891,
		following: 203,
		joinedYear: 2017,
		color: "#a855f7",
	}],
]);

export const ME = USERS.get("u1")!;

export const SEED_TWEETS: Tweet[] = [
	{
		id: "t100",
		authorId: "u3",
		text:
			"finally figured out why my container query wasn't firing. the answer was, as always, display: contents. i have learned nothing.",
		timestamp: new Date(Date.now() - 1000 * 60 * 8),
		likes: 312,
		retweets: 41,
		replies: 27,
		liked: false,
		retweeted: false,
	},
	{
		id: "t101",
		authorId: "u2",
		text:
			"spent 4 hours debugging a segfault. it was a missing semicolon in a macro expansion. i am going to take a walk outside.",
		timestamp: new Date(Date.now() - 1000 * 60 * 22),
		likes: 891,
		retweets: 203,
		replies: 88,
		liked: false,
		retweeted: false,
	},
	{
		id: "t102",
		authorId: "u5",
		text:
			"hot take: refinement types would eliminate an entire class of runtime errors that we just... accept as normal. we've been normalized into helplessness.",
		timestamp: new Date(Date.now() - 1000 * 60 * 47),
		likes: 2104,
		retweets: 441,
		replies: 312,
		liked: false,
		retweeted: false,
	},
	{
		id: "t103",
		authorId: "u1",
		text:
			"bearmetal now supports SSR hydration! signals survive the journey from server to client and it's extremely satisfying to watch. write-up coming soon ✨",
		timestamp: new Date(Date.now() - 1000 * 60 * 71),
		likes: 127,
		retweets: 34,
		replies: 18,
		liked: false,
		retweeted: false,
	},
	{
		id: "t104",
		authorId: "u4",
		text:
			"my job is writing terraform for infrastructure that terraform was not designed to manage. i am very normal and thriving",
		timestamp: new Date(Date.now() - 1000 * 60 * 95),
		likes: 4821,
		retweets: 1203,
		replies: 445,
		liked: false,
		retweeted: false,
	},
	{
		id: "t105",
		authorId: "u3",
		text:
			"new component library dropped. it does nothing react doesn't already do but i wrote it and i love it unconditionally",
		timestamp: new Date(Date.now() - 1000 * 60 * 130),
		likes: 1892,
		retweets: 302,
		replies: 91,
		liked: false,
		retweeted: false,
	},
	{
		id: "t106",
		authorId: "u2",
		text: "rust is just C++ but the compiler is your therapist",
		timestamp: new Date(Date.now() - 1000 * 60 * 210),
		likes: 18241,
		retweets: 4892,
		replies: 1203,
		liked: false,
		retweeted: false,
	},
	{
		id: "t107",
		authorId: "u1",
		text: "web components are genuinely underrated. the platform is good actually",
		timestamp: new Date(Date.now() - 1000 * 60 * 60 * 28),
		likes: 891,
		retweets: 203,
		replies: 77,
		liked: false,
		retweeted: false,
	},
	{
		id: "t108",
		authorId: "u5",
		text: "every type system is just a proof assistant with commitment issues",
		timestamp: new Date(Date.now() - 1000 * 60 * 60 * 36),
		likes: 5420,
		retweets: 1102,
		replies: 498,
		liked: false,
		retweeted: false,
	},
	{
		id: "t109",
		authorId: "u4",
		text:
			'i asked our senior SRE what the p99 latency was and he said "vibes-based" and walked away. he is right and i respect that.',
		timestamp: new Date(Date.now() - 1000 * 60 * 60 * 41),
		likes: 12300,
		retweets: 3100,
		replies: 892,
		liked: false,
		retweeted: false,
	},
	{
		id: "t110",
		authorId: "u3",
		text:
			"the gap between 'i understand CSS' and 'i understand CSS' is the largest knowledge gap in software engineering, and i will not be elaborating",
		timestamp: new Date(Date.now() - 1000 * 60 * 60 * 52),
		likes: 9812,
		retweets: 2301,
		replies: 741,
		liked: false,
		retweeted: false,
	},
	{
		id: "t111",
		authorId: "u2",
		text:
			"unpopular opinion: Cargo.lock should always be committed. i have said what i have said and i welcome the discourse.",
		timestamp: new Date(Date.now() - 1000 * 60 * 60 * 60),
		likes: 3421,
		retweets: 812,
		replies: 1023,
		liked: false,
		retweeted: false,
	},
];

export const SEED_NOTIFICATIONS: Notification[] = [
	{
		id: "n1",
		type: "like",
		fromUserId: "u2",
		tweetId: "t103",
		text: "bearmetal now supports SSR hydration!",
		timestamp: new Date(Date.now() - 1000 * 60 * 12),
		read: false,
	},
	{
		id: "n2",
		type: "retweet",
		fromUserId: "u3",
		tweetId: "t103",
		text: "bearmetal now supports SSR hydration!",
		timestamp: new Date(Date.now() - 1000 * 60 * 38),
		read: false,
	},
	{
		id: "n3",
		type: "follow",
		fromUserId: "u5",
		timestamp: new Date(Date.now() - 1000 * 60 * 120),
		read: false,
	},
	{
		id: "n4",
		type: "like",
		fromUserId: "u4",
		tweetId: "t107",
		text: "web components are genuinely underrated.",
		timestamp: new Date(Date.now() - 1000 * 60 * 60 * 22),
		read: true,
	},
	{
		id: "n5",
		type: "reply",
		fromUserId: "u3",
		tweetId: "t107",
		text: "web components are genuinely underrated.",
		timestamp: new Date(Date.now() - 1000 * 60 * 60 * 47),
		read: true,
	},
	{
		id: "n6",
		type: "mention",
		fromUserId: "u2",
		tweetId: "t111",
		text: "@emmaline is bearmetal using cargo by any chance",
		timestamp: new Date(Date.now() - 1000 * 60 * 60 * 63),
		read: true,
	},
];

const FRESH_TWEET_DATA: Array<[string, string]> = [
	[
		"u3",
		"just discovered that you can use @layer with container queries and i think i need to sit down for a moment",
	],
	[
		"u2",
		"today in 'rust is fine actually': wrote a full websocket handler without a single .unwrap(). i feel invincible.",
	],
	["u4", "kubernetes is just systemd for people who are afraid of systemd. i'm afraid of both."],
	[
		"u5",
		"a type is just a proposition, a program is just a proof, and i am just tired of explaining this at dinner parties",
	],
	["u3", "me, a CSS person, explaining why 'just center it' is a 47-part question"],
	[
		"u2",
		"the borrow checker has once again prevented me from doing something i thought was clever. it was not clever.",
	],
];

let freshIdx = 0;
let tweetCounter = 200;

export function getNextFreshTweet(): Tweet {
	const [authorId, text] = FRESH_TWEET_DATA[freshIdx++ % FRESH_TWEET_DATA.length];
	return {
		id: `fresh_${tweetCounter++}`,
		authorId,
		text,
		timestamp: new Date(),
		likes: Math.floor(Math.random() * 50),
		retweets: Math.floor(Math.random() * 15),
		replies: Math.floor(Math.random() * 8),
		liked: false,
		retweeted: false,
	};
}

export const TRENDING = [
	{ topic: "#WebComponents", posts: "12.4K" },
	{ topic: "#RustLang", posts: "8.1K" },
	{ topic: "TypeScript", posts: "31.2K" },
	{ topic: "#CSS2026", posts: "5.8K" },
	{ topic: "Deno", posts: "4.2K" },
	{ topic: "#signals", posts: "2.9K" },
];

export const SUGGESTED_USERS = ["u2", "u3", "u4", "u5"];
