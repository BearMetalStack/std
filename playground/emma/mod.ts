import { ArraySignal } from "@bearmetal/app/signals";
import { effect } from "@bearmetal/app";

export function run() {
	const banana = new ArraySignal<string>([]);
	setInterval(() => {
		const ban = banana.get();
		ban.push(String(banana.get().length));
		if (banana.get().length > 10) {
			banana.get().shift();
		}
	}, 1000);
	const _ = effect(() => {
		console.log(banana.get().join(", "));
	});
}
