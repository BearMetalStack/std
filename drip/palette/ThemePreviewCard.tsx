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
		overflow: hidden;

		background: var(--color-bg);
		color: var(--color-text);
		font-size: .5rem;
		--text-base: 1em;
		--text-xs: .64em;
		--text-sm: .8em;
		--text-md: 1.25em;
		--text-lg: 1.44em;
		--text-xl: 1.66em;
		--text-2xl: 1.91em;
		--text-3xl: 2.2em;
		--text-4xl: 2.53em;

		.header {
			grid-area: h;
			background: var(--color-bg-emphasis);
			border-bottom: var(--border-rule) solid var(--color-border);
			padding: 1em 1.5em;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1em;
		}

		/* #region badges — the semantic text/bg/border triplets */
		.badges {
			display: flex;
			flex-wrap: wrap;
			gap: .5em;
		}
		.badge {
			font-size: var(--text-md);
			padding: .15em .9em;
			border-radius: var(--radius-full);
			border: var(--border-1) solid;
		}
		.badge.success {
			background: var(--color-success-bg);
			color: var(--color-success-text);
			border-color: var(--color-success-border);
		}
		.badge.warn {
			background: var(--color-warning-bg);
			color: var(--color-warning-text);
			border-color: var(--color-warning-border);
		}
		.badge.danger {
			background: var(--color-danger-bg);
			color: var(--color-danger-text);
			border-color: var(--color-danger-border);
		}
		.badge.info {
			background: var(--color-info-bg);
			color: var(--color-info-text);
			border-color: var(--color-info-border);
		}
		/* #endregion */

		.sidebar {
			grid-area: s;
			background: var(--sidebar-bg);
			border-right: var(--sidebar-border-width) solid var(--sidebar-border);
			padding: 2em 1.5em;

			nav {
				display: flex;
				flex-direction: column;
				font-size: var(--text-lg);
			}
			nav a {
				padding: .2em .6em;
				border-radius: var(--nav-item-radius);
				color: var(--nav-item-color);
				text-decoration: none;
			}
			nav a[aria-current] {
				background: var(--sidebar-item-bg-active);
				box-shadow: var(--sidebar-item-indicator-active);
				text-decoration: none;
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
		mark {
			background: var(--color-highlight-bg);
			color: var(--color-highlight-text);
		}
		a {
			color: var(--color-interactive);
		}
		.modal {
			position: absolute;
			padding: 2em;
			gap: 1em;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			max-width: 80%;
			max-height: 70%;
			overflow: hidden;
			background: var(--color-surface-overlay);
			border: var(--modal-border-width) solid var(--modal-border);
			box-shadow: var(--shadow-lg);
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

	section[data-theme] {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 1rem;
		padding: 1rem;
		margin-top: .5rem;
		border: 5px solid black;
		border-radius: var(--radius-lg);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: .75rem;

		> div {
			display: flex;
			flex-direction: column;
			gap: .5rem;
		}
		> div > div:has(> button) {
			display: flex;
			flex-wrap: wrap;
			gap: .5rem;
		}
		nav {
			display: flex;
			gap: 1rem;
		}
	}
	/* the palette's own controls stretch to fill; the previews should not */
	.theme-previews section[data-theme] :is(button, input) {
		min-width: auto;
		width: auto;
	}
`;

/** Every state treatment a theme controls, rendered against the compliant sheets. */
function StatesPreview({ variant }: { variant: string }) {
	return (
		<section data-theme={variant}>
			<div>
				<div role="tablist">
					<button type="button" role="tab" aria-selected="true">Overview</button>
					<button type="button" role="tab" aria-selected="false">Activity</button>
					<button type="button" role="tab" aria-selected="false">Settings</button>
				</div>
				<nav>
					<a href="#">Home</a>
					<a href="#" aria-current="page">Docs</a>
					<a href="#">Blog</a>
				</nav>
			</div>
			<div>
				<div>
					<button type="button">Primary</button>
					<button type="button" class="secondary">Secondary</button>
					<button type="button" class="secondary" aria-pressed="true">Pressed</button>
				</div>
				<div>
					<button type="button" disabled>Disabled</button>
					<button type="button" class="secondary" disabled>Disabled</button>
					<button type="button" class="danger">Delete</button>
				</div>
			</div>
			<div>
				<input placeholder="Plain input" />
				<input aria-invalid="true" placeholder="Invalid" />
				<input disabled placeholder="Disabled" />
			</div>
			<div>
				<div class="alert">Info alert</div>
				<div class="alert success">Success alert</div>
				<div class="alert warning">Warning alert</div>
				<div class="alert danger">Danger alert</div>
			</div>
			<div>
				<div role="listbox">
					<div role="option">Option one</div>
					<div role="option" aria-selected="true">Option two</div>
					<div role="option">Option three</div>
				</div>
			</div>
			<div>
				<table>
					<thead>
						<tr>
							<th>Name</th>
							<th>State</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Alpha</td>
							<td>Live</td>
						</tr>
						<tr>
							<td>Beta</td>
							<td>Draft</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>
	);
}

export function ThemePreviewCard({ variant }: { variant: string }) {
	return (
		<div class="preview">
			<h4>{variant}</h4>
			<div data-theme={variant}>
				<div class="header">
					<h2>Header</h2>
					<div class="badges">
						<span class="badge success">Live</span>
						<span class="badge warn">Draft</span>
						<span class="badge danger">Failed</span>
						<span class="badge info">Queued</span>
					</div>
				</div>
				<div class="sidebar">
					<h1>Site Name</h1>
					<nav>
						<a href="#">Home</a>
						<a href="#" aria-current="page">Documents</a>
						<a href="#">Users</a>
						<a href="#">Spaces</a>
						<a href="#">Settings</a>
					</nav>
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
						Recusandae placeat <mark>voluptate obcaecati</mark>{" "}
						assumenda laboriosam omnis deserunt impedit vitae! Dolore amet distinctio quidem fugit
						tenetur odio rem <a href="#">commodi ipsum</a>{" "}
						exercitationem, suscipit, fuga nobis perspiciatis impedit, aut nam? Deserunt, velit?
					</p>
				</div>
				<div class="modal">
					<p>
						Lorem, ipsum dolor sit amet consectetur adipisicing elit. Dolorum totam molestiae, dicta
						voluptatem rerum aut. Ea, provident, ipsam ipsum odio, fugiat harum laborum.
					</p>

					<div>
						<button type="button" class="btn primary">Primary</button>
						<button type="button" class="btn accent">Accent</button>
						<button type="button" class="btn secondary">Secondary</button>
						<button type="button" class="btn ghost">Ghost</button>
						<button type="button" class="btn success">Success</button>
						<button type="button" class="btn warn">Warn</button>
						<button type="button" class="btn danger">Danger</button>
						<button type="button" class="btn info">Info</button>
					</div>
				</div>
			</div>
			<StatesPreview variant={variant} />
		</div>
	);
}
