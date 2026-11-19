<script lang="ts">
	import { page } from '$app/state';

	type NavLink = { href: string; label: string };

	const links: NavLink[] = [
		{ href: '/', label: 'Prezentare' },
		{ href: '/resources', label: 'Săli & Echipamente' },
		{ href: '/reservations', label: 'Rezervări' },
		{ href: '/admin', label: 'Administrare' }
	];

	let menuOpen = $state(false);

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
	}

	// Close the mobile menu whenever the route changes.
	$effect(() => {
		page.url.pathname;
		menuOpen = false;
	});
</script>

<header class="navbar">
	<nav class="bar" aria-label="Navigație principală">
		<!-- Brand -->
		<a href="/" class="brand">
			<span class="wordmark">ATRIUM</span>
			<span class="tagline">RESOURCE CONCIERGE</span>
		</a>

		<!-- Desktop links -->
		<ul class="links">
			{#each links as link (link.href)}
				<li>
					<a
						href={link.href}
						class="link"
						aria-current={isActive(link.href) ? 'page' : undefined}
					>
						{link.label}
					</a>
				</li>
			{/each}
		</ul>

		<!-- Right side -->
		<div class="actions">
			<!-- TODO: wire to API user store -->
			<button type="button" class="account">
				<span class="avatar" aria-hidden="true">A</span>
				<span class="account-label">Cont Activ</span>
			</button>

			<button
				type="button"
				class="toggle"
				aria-expanded={menuOpen}
				aria-controls="mobile-menu"
				aria-label={menuOpen ? 'Închide meniul' : 'Deschide meniul'}
				onclick={() => (menuOpen = !menuOpen)}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					aria-hidden="true"
				>
					{#if menuOpen}
						<path d="M6 6l12 12M18 6L6 18" />
					{:else}
						<path d="M4 7h16M4 12h16M4 17h16" />
					{/if}
				</svg>
			</button>
		</div>
	</nav>

	<!-- Mobile menu -->
	{#if menuOpen}
		<div id="mobile-menu" class="mobile-menu">
			<ul class="mobile-links">
				{#each links as link (link.href)}
					<li>
						<a
							href={link.href}
							class="mobile-link"
							aria-current={isActive(link.href) ? 'page' : undefined}
						>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
			<div class="mobile-account">
				<span class="mobile-account-inner">
					<span class="avatar" aria-hidden="true">A</span>
					Cont Activ
				</span>
			</div>
		</div>
	{/if}
</header>

<style>
	/* ---------- Shell ---------- */
	.navbar {
		position: sticky;
		top: 0;
		z-index: 40;
		border-bottom: 1px solid var(--color-hairline);
		background-color: rgb(255 255 255 / 0.95);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	.bar {
		max-width: 72rem;
		height: 4.5rem;
		margin-inline: auto;
		padding-inline: 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	/* ---------- Brand ---------- */
	.brand {
		display: flex;
		flex-direction: column;
		line-height: 1;
		text-decoration: none;
	}

	.wordmark {
		font-family: var(--font-serif);
		font-size: 1.4rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		color: var(--color-ink);
	}

	.tagline {
		margin-top: 0.25rem;
		font-size: 0.6rem;
		font-weight: 500;
		letter-spacing: 0.32em;
		color: var(--color-brass);
	}

	/* ---------- Desktop links ---------- */
	.links {
		display: none;
		align-items: center;
		gap: 2rem;
	}

	.link {
		position: relative;
		display: inline-block;
		padding-block: 1.5rem;
		font-size: 0.875rem;
		line-height: 1.25rem;
		letter-spacing: 0.025em;
		color: var(--color-muted);
		text-decoration: none;
		transition: color 150ms ease;
	}

	.link::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		bottom: -1px;
		height: 1px;
		background-color: var(--color-brass);
		transform: scaleX(0);
		transform-origin: center;
		transition: transform 300ms ease;
	}

	.link:hover {
		color: var(--color-ink);
	}

	.link[aria-current='page'] {
		font-weight: 500;
		color: var(--color-ink);
	}

	.link[aria-current='page']::after {
		transform: scaleX(1);
	}

	/* ---------- Right side ---------- */
	.actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	button {
		font: inherit;
		cursor: pointer;
	}

	.account {
		display: none;
		align-items: center;
		gap: 0.625rem;
		padding: 0.375rem 1rem 0.375rem 0.375rem;
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		background-color: var(--color-surface);
		font-size: 0.875rem;
		line-height: 1.25rem;
		color: var(--color-ink);
		transition: border-color 150ms ease;
	}

	.account:hover {
		border-color: var(--color-brass);
	}

	.account-label {
		letter-spacing: 0.025em;
	}

	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 9999px;
		background-color: var(--color-ink);
		font-family: var(--font-serif);
		font-size: 0.75rem;
		line-height: 1;
		color: var(--color-canvas);
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		border: 0;
		border-radius: 9999px;
		background: transparent;
		color: var(--color-ink);
		transition: background-color 150ms ease;
	}

	.toggle:hover {
		background-color: var(--color-canvas);
	}

	.toggle svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	/* ---------- Mobile menu ---------- */
	.mobile-menu {
		border-top: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
	}

	.mobile-links {
		max-width: 72rem;
		margin-inline: auto;
		padding: 0.75rem 1rem;
	}

	.mobile-link {
		display: flex;
		align-items: center;
		padding: 0.75rem 0 0.75rem 1rem;
		border-left: 2px solid transparent;
		font-size: 0.95rem;
		color: var(--color-muted);
		text-decoration: none;
		transition: color 150ms ease;
	}

	.mobile-link:hover {
		color: var(--color-ink);
	}

	.mobile-link[aria-current='page'] {
		border-left-color: var(--color-brass);
		font-weight: 500;
		color: var(--color-ink);
	}

	.mobile-account {
		max-width: 72rem;
		margin-inline: auto;
		padding: 1rem;
		border-top: 1px solid var(--color-hairline);
	}

	.mobile-account-inner {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		font-size: 0.875rem;
		color: var(--color-ink);
	}

	/* ---------- Breakpoints ---------- */
	@media (min-width: 640px) {
		.bar {
			padding-inline: 1.5rem;
		}

		.account {
			display: inline-flex;
		}

		.mobile-links {
			padding-inline: 1.5rem;
		}

		.mobile-account {
			display: none;
		}
	}

	@media (min-width: 768px) {
		.links {
			display: flex;
		}

		.toggle,
		.mobile-menu {
			display: none;
		}
	}

	@media (min-width: 1024px) {
		.bar {
			padding-inline: 2rem;
		}
	}
</style>
