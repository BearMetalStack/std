import { css } from "@bearmetal/miscellanea";

export const ThemePreviewCardStyles = css`
	.theme-previews {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	div[data-theme] {
		position: relative;
		display: grid;
		aspect-ratio: 16/9;
		grid-template:
			"s h" auto
			"s b" 1fr / 25% auto;
		border: 5px solid black;
		border-radius: var(--radius-lg);

		background: var(--color-bg);
		color: var(--color-text);
		font-size: .5rem;
		--text-base: 1em;
		--text-xs: .64em;
		--text-sm: .8em;
		--text-md: 1.25em;
		--text-lg: 1.563em;
		--text-xl: 1.953em;
		--text-2xl: 2.441em;
		--text-3xl: 3.052em;
		--text-4xl: 3.815em;

		.header {
			grid-area: h;
			background: var(--color-bg-emphasis);
			padding: 1em;
		}
		.sidebar {
			grid-area: s;
			background: var(--color-surface);
			padding: 2em;

			ul {
				font-size: var(--text-lg);
				list-style: none;
			}
		}
		.body {
			grid-area: b;
			background: var(--color-bg);
			padding: 3em 5em;
		}
		p {
			margin-bottom: 1em;
		}
		.modal {
			position: absolute;
			padding: 3em;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			max-width: 75%;
			max-height: 50%;
			overflow: hidden;
			background: var(--color-surface-raised);
			border-radius: var(--radius-lg);
			display: flex;
			flex-direction: column;
		}

		div:has(>.btn) {
			display: flex;
			flex-wrap: wrap;
			gap: 1em;
		}
		.btn {
			display: inline;
			min-width: unset;
			font-size: var(--text-base);
			padding: .5em 1em;
		}
	}
`;

export function ThemePreviewCard({ variant }: { variant: string }) {
	return (
		<div class="preview">
			<h4>{variant}</h4>
			<div data-theme={variant}>
				<div class="header">
					<h2>Header</h2>
				</div>
				<div class="sidebar">
					<h1>Site Name</h1>
					<ul>
						<li>Home</li>
						<li>Documents</li>
						<li>Users</li>
						<li>Spaces</li>
						<li>Settings</li>
					</ul>
				</div>
				<div class="body">
					<p>
						Lorem ipsum dolor sit amet consectetur adipisicing elit. Soluta et quibusdam praesentium
						dignissimos expedita porro quaerat, corrupti veniam laborum repellat hic nisi minima
						obcaecati, cum optio maxime temporibus necessitatibus vitae?
					</p>
					<p>
						Delectus magnam, aliquid voluptate laborum magni architecto non, natus sapiente
						assumenda tenetur eum illo ipsum quam officiis libero asperiores voluptatem odio! Ut,
						quis! Repudiandae, quisquam! Doloribus labore a explicabo quisquam?
					</p>
					<p>
						Quibusdam, facere, sed, accusamus saepe omnis excepturi cupiditate qui iste architecto
						iusto molestiae eius! Numquam expedita atque laboriosam animi suscipit facere pariatur
						beatae tempore velit, illo obcaecati doloribus molestias asperiores?
					</p>
					<p>
						Cupiditate tenetur modi at reiciendis maiores vel, in cum vero libero iste corrupti
						error exercitationem necessitatibus facere accusantium eos adipisci aut culpa labore, ea
						id ad! Quam eaque accusamus doloribus.
					</p>
					<p>
						Recusandae placeat voluptate obcaecati assumenda laboriosam omnis deserunt impedit
						vitae! Dolore amet distinctio quidem fugit tenetur odio rem commodi ipsum
						exercitationem, suscipit, fuga nobis perspiciatis impedit, aut nam? Deserunt, velit?
					</p>
				</div>
				<div class="modal">
					<p>
						Lorem, ipsum dolor sit amet consectetur adipisicing elit. Dolorum totam molestiae, dicta
						voluptatem rerum aut. Ea, provident, ipsam ipsum odio, fugiat harum laborum
						exercitationem corporis earum enim minima sint esse!
					</p>

					<div>
						<button type="button" class="btn primary">Primary</button>
						<button type="button" class="btn secondary">Secondary</button>
						<button type="button" class="btn ghost">Ghost</button>
						<button type="button" class="btn success">Success</button>
						<button type="button" class="btn warn">Warn</button>
						<button type="button" class="btn danger">Danger</button>
						<button type="button" class="btn info">Info</button>
					</div>
				</div>
			</div>
		</div>
	);
}
