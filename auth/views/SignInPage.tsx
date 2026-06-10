import { BmGrid, BmIcon } from "@bearmetal/webbies";

export const SignInPage = (
	{ buttonText, headerText = buttonText, switchPage, redirectUrl, submitUrl }: {
		buttonText: string;
		headerText?: string;
		switchPage: [string, string];
		redirectUrl?: string;
		submitUrl: string;
	},
) => {
	return (() => {
		return (
			<>
				<form action={submitUrl} method="post">
					{redirectUrl && <input type="hidden" name="redirectUrl" value={redirectUrl} />}
					<fieldset>
						<legend>{headerText}</legend>
						<label>
							<input type="text" name="alias" placeholder="Username" />
						</label>
						<br />
						<label>
							<input type="password" name="password" placeholder="Password" />
						</label>
						<br />
						<button type="submit">{buttonText}</button>
					</fieldset>
				</form>
				<div class="dividery">
					OR
				</div>
				<BmGrid columns="1" gap=".5rem">
					<form>
						<button class="secondary wide" type="submit">
							<BmIcon
								icon="google-logo"
								sheet="https://cdn.bear-metal.dev/icons/phosphor/bold.svg"
							>
							</BmIcon>
							Sign In with Google
						</button>
					</form>
					<form>
						<button class="secondary wide" type="submit">
							<BmIcon icon="discord-logo">
							</BmIcon>
							Sign In with Discord
						</button>
					</form>
					<form>
						<button class="secondary wide" type="submit">
							<BmIcon icon="github-logo">
							</BmIcon>
							Sign In with GitHub
						</button>
					</form>
				</BmGrid>
				<p>
					<a href={switchPage[0]}>{switchPage[1]}</a>
				</p>
			</>
		);
	});
};
