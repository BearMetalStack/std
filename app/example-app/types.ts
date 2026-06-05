export type Route =
	| { page: "home" }
	| { page: "explore" }
	| { page: "notifications" }
	| { page: "profile"; userId: string };

export type User = {
	id: string;
	handle: string;
	displayName: string;
	bio: string;
	location: string;
	followers: number;
	following: number;
	joinedYear: number;
	color: string;
};

export type Tweet = {
	id: string;
	authorId: string;
	text: string;
	timestamp: Date;
	likes: number;
	retweets: number;
	replies: number;
	liked: boolean;
	retweeted: boolean;
};

export type Notification = {
	id: string;
	type: "like" | "retweet" | "follow" | "reply" | "mention";
	fromUserId: string;
	tweetId?: string;
	text?: string;
	timestamp: Date;
	read: boolean;
};
