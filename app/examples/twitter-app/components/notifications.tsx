import { BMElement, define, each } from "@bearmetal/app";
import { markAllRead, navigate, notifications, USERS } from "../store.ts";
import type { Notification } from "../types.ts";
import { timeAgo } from "../utils.ts";

const NOTIF_ICONS: Record<Notification["type"], string> = {
	like: "♥",
	retweet: "🔁",
	follow: "👤",
	reply: "💬",
	mention: "@",
};

const NOTIF_LABELS: Record<Notification["type"], string> = {
	like: "liked your post",
	retweet: "reposted your post",
	follow: "followed you",
	reply: "replied to your post",
	mention: "mentioned you",
};

function NotifCard(notif: Notification): Element {
	const user = USERS.get(notif.fromUserId);
	if (!user) return document.createElement("div");

	return (
		<div
			class={`notif-card${notif.read ? "" : " notif-card--unread"}`}
			onClick={() => {
				if (notif.type === "follow") {
					navigate({ page: "profile", userId: notif.fromUserId });
				}
			}}
		>
			<span
				class={`notif-type-icon notif-type--${notif.type}`}
			>
				{NOTIF_ICONS[notif.type]}
			</span>
			<div class="notif-body">
				<div class="notif-from">
					<span
						class="avatar avatar--sm"
						style={`--avatar-color: ${user.color}`}
					>
						{user.displayName[0].toUpperCase()}
					</span>
					<button
						type="button"
						class="notif-user-btn"
						onClick={(e: Event) => {
							e.stopPropagation();
							navigate({ page: "profile", userId: user.id });
						}}
					>
						<strong>{user.displayName}</strong>
					</button>
					<span class="notif-action">{NOTIF_LABELS[notif.type]}</span>
					<span class="notif-time">{timeAgo(notif.timestamp)}</span>
				</div>
				{notif.text ? <p class="notif-tweet-text">{notif.text}</p> : null}
			</div>
		</div>
	) as Element;
}

@define("twitter-notifications")
export class TwitterNotifications extends BMElement {
	#filter = this.signal<"all" | "mentions">("all");

	#filtered = this.computed(() => {
		const f = this.#filter.get();
		return notifications.get().filter(
			(n) => f === "all" || n.type === "mention",
		);
	});

	#tabClass = (tab: "all" | "mentions") =>
		this.computed(() => `tab-btn${this.#filter.get() === tab ? " tab-btn--active" : ""}`);

	protected override init() {
		markAllRead();
	}

	protected override get template() {
		return (
			<div class="notifications-page">
				<header class="page-header">
					<h2 class="page-title">Notifications</h2>
				</header>
				<div class="notif-tabs">
					<button
						type="button"
						class={this.#tabClass("all")}
						onClick={() => this.#filter.set("all")}
					>
						All
					</button>
					<button
						type="button"
						class={this.#tabClass("mentions")}
						onClick={() => this.#filter.set("mentions")}
					>
						Mentions
					</button>
				</div>
				<div class="notif-list">
					{each(
						this.#filtered,
						(n) => NotifCard(n),
						(n) => n.id,
					)}
				</div>
			</div>
		);
	}
}
