import { Case, For, Show, Switch } from "../../built-ins/mod.ts";
import { createSignal } from "../../signals.ts";

function main() {
	return (
		<div>
			<For $={createSignal<string[]>(["Test"])} keyOn={(e) => e}>
				{(item, i) => <div>{item}{i}</div>}
			</For>

			<Show when={createSignal<boolean>(true)}>
				{() => <div>I am here!</div>}
			</Show>

			<Switch $={createSignal<"true" | "false">("true")}>
				<Case $="true">
					{() => <div>Ooo-ooh, Switchy woman!</div>}
				</Case>
				<Case $="false">
					{() => <div></div>}
				</Case>
			</Switch>
		</div>
	);
}

document.body.appendChild(main() as Node);
