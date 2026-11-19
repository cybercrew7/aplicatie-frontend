<script lang="ts">
	import { page } from '$app/state';
	import { authStore, connectionMode, DEMO_USERS } from '#lib/stores/authStore.ts';
	import { openBookingDrawer } from '#lib/stores/bookingStore.ts';
	import type { UserRole } from '#lib/types/index.ts';

	type NavLink = { href: string; label: string };

	const links: NavLink[] = [
		{ href: '/', label: 'Prezentare' },
		{ href: '/resources', label: 'Săli & Echipamente' },
		{ href: '/reservations', label: 'Rezervări' },
		{ href: '/admin', label: 'Administrare' }
	];

	const ROLE_LABELS: Record<UserRole, string> = {
		Student: 'Student',
		Profesor: 'Profesor',
		Admin: 'Administrator'
	};

	let menuOpen = $state(false);
	let accountOpen = $state(false);
	let accountEl: HTMLDivElement | undefined = $state();

	const user = $derived($authStore.currentUser);
	const initials = $derived(user ? initialsOf(user.name) : '?');
	const modeLabel = $derived(
		$connectionMode === 'api' ? 'Conectat la server' : 'Mod demonstrativ — date locale'
	);

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
	}

	function initialsOf(name: string): string {
		const parts = name.trim().split(/\s+/);
		const first = parts[0]?.[0] ?? '';
		const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
		return (first + last).toUpperCase();
	}

	function chooseUser(id: number) {
		authStore.switchDemoUser(id);
		accountOpen = false;
	}

	function logout() {
		authStore.logout();
		accountOpen = false;
	}

	function quickBook() {
		menuOpen = false;
		accountOpen = false;
		openBookingDrawer();
	}

	function onWindowClick(event: MouseEvent) {
		if (accountOpen && accountEl && !accountEl.contains(event.target as Node)) {
			accountOpen = false;
		}
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			accountOpen = false;
			menuOpen = false;
		}
	}

	// Close menus whenever the route changes.
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
		accountOpen = false;
	});
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

{#snippet userList(variant: 'dropdown' | 'mobile')}
	<p class="list-heading">Schimbă utilizatorul de test</p>
	<ul class="user-list">
		{#each DEMO_USERS as demo (demo.id)}
			{@const active = user?.id === demo.id}
			<li>
				<button
					type="button"
					class="user-option"
					class:compact={variant === 'mobile'}
					class:active
					role={variant === 'dropdown' ? 'menuitemradio' : undefined}
					aria-checked={variant === 'dropdown' ? active : undefined}
					aria-pressed={variant === 'mobile' ? active : undefined}
					onclick={() => chooseUser(demo.id)}
				>
					<span class="avatar small" aria-hidden="true">{initialsOf(demo.name)}</span>
					<span class="option-text">
						<span class="option-name">{demo.name}</span>
						<span class="option-role">{ROLE_LABELS[demo.role]}</span>
					</span>
					{#if active}
						<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M5 12.5l4.5 4.5L19 7.5" />
						</svg>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
	{#if user}
		<button type="button" class="logout" role={variant === 'dropdown' ? 'menuitem' : undefined} onclick={logout}>
			Deconectare
		</button>
	{/if}
{/snippet}

<header class="navbar">
	<div class="accent" aria-hidden="true"></div>

	<nav class="bar" aria-label="Navigație principală">
		<!-- Brand -->
		<a href="/" class="brand" aria-label="ATRIUM — Gestiune Spații & Resurse, pagina principală">
			<span class="monogram" aria-hidden="true">A</span>
			<span class="brand-text">
				<span class="wordmark">ATRIUM</span>
				<span class="tagline">Gestiune Spații &amp; Resurse</span>
			</span>
		</a>

		<!-- Desktop links -->
		<ul class="links">
			{#each links as link (link.href)}
				<li>
					<a href={link.href} class="link" aria-current={isActive(link.href) ? 'page' : undefined}>
						{link.label}
					</a>
				</li>
			{/each}
		</ul>

		<!-- Right side -->
		<div class="actions">
			<button type="button" class="quick-book" onclick={quickBook}>
				<span class="plus" aria-hidden="true">+</span>
				<span class="quick-label">Rezervare</span>
			</button>

			<div class="account-wrap" bind:this={accountEl}>
				<button
					type="button"
					class="account"
					aria-haspopup="menu"
					aria-expanded={accountOpen}
					aria-controls="account-menu"
					onclick={() => (accountOpen = !accountOpen)}
				>
					<span class="avatar" aria-hidden="true">
						{initials}
						<span class="status-dot" data-mode={$connectionMode} title={modeLabel}></span>
					</span>
					<span class="account-text">
						<span class="account-name">{user ? user.name : 'Alege un cont'}</span>
						<span class="account-role">{user ? ROLE_LABELS[user.role] : 'Vizitator'}</span>
					</span>
					<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
						<path d="M7 10l5 5 5-5" />
					</svg>
					<span class="visually-hidden">— {modeLabel}</span>
				</button>

				{#if accountOpen}
					<div id="account-menu" class="dropdown" role="menu" aria-label="Cont">
						<div class="dropdown-head">
							{#if user}
								<p class="head-name">{user.name}</p>
								<p class="head-meta">{user.email}</p>
								<p class="role-badge">{ROLE_LABELS[user.role]}</p>
							{:else}
								<p class="head-name">Niciun utilizator activ</p>
							{/if}
							<p class="mode">
								<span class="status-dot inline" data-mode={$connectionMode} aria-hidden="true"></span>
								{modeLabel}
							</p>
						</div>
						{@render userList('dropdown')}
					</div>
				{/if}
			</div>

			<button
				type="button"
				class="toggle"
				aria-expanded={menuOpen}
				aria-controls="mobile-menu"
				aria-label={menuOpen ? 'Închide meniul' : 'Deschide meniul'}
				onclick={() => (menuOpen = !menuOpen)}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
					{#if menuOpen}
						<path d="M6 6l12 12M18 6L6 18" />
					{:else}
						<path d="M4 8h16M4 16h16" />
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
						<a href={link.href} class="mobile-link" aria-current={isActive(link.href) ? 'page' : undefined}>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
			<div class="mobile-account">
				<span class="mobile-account-inner">
					<span class="avatar" aria-hidden="true">
						{initials}
						<span class="status-dot" data-mode={$connectionMode}></span>
					</span>
					<span class="option-text">
						<span class="option-name">{user ? user.name : 'Niciun utilizator activ'}</span>
						<span class="option-role">{modeLabel}</span>
					</span>
				</span>
				<div class="mobile-users">
					{@render userList('mobile')}
				</div>
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
		border-bottom: 1px solid var(--border-hairline);
		background-color: rgb(255 255 255 / 0.94);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	}

	.accent {
		height: 2px;
		background: linear-gradient(
			90deg,
			transparent 0%,
			var(--border-gold) 18%,
			var(--border-gold) 82%,
			transparent 100%
		);
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

	button {
		font: inherit;
		cursor: pointer;
	}

	/* ---------- Brand ---------- */
	.brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
		flex-shrink: 0;
	}

	.monogram {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border: 1px solid var(--border-gold);
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 600;
		line-height: 1;
		color: var(--ink-primary);
		position: relative;
	}

	.monogram::after {
		content: '';
		position: absolute;
		inset: 3px;
		border: 1px solid color-mix(in srgb, var(--border-gold) 40%, transparent);
	}

	.brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1;
	}

	.wordmark {
		font-family: var(--font-display);
		font-size: 1.45rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		color: var(--ink-primary);
	}

	.tagline {
		display: none;
		margin-top: 0.3rem;
		font-family: var(--font-display);
		font-size: 0.8rem;
		font-style: italic;
		font-weight: 500;
		letter-spacing: 0.04em;
		color: var(--border-gold);
	}

	/* ---------- Desktop links ---------- */
	.links {
		display: none;
		align-items: center;
		gap: 1.75rem;
	}

	.link {
		position: relative;
		display: inline-block;
		padding-block: 1.5rem;
		font-size: 0.78rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-secondary);
		text-decoration: none;
		transition: color 150ms ease;
	}

	.link::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		bottom: -1px;
		height: 1px;
		background-color: var(--border-gold);
		transform: scaleX(0);
		transition: transform 300ms ease;
	}

	.link:hover {
		color: var(--ink-primary);
	}

	.link[aria-current='page'] {
		color: var(--ink-primary);
	}

	.link[aria-current='page']::after {
		transform: scaleX(1);
	}

	/* ---------- Right side ---------- */
	.actions {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.quick-book {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		height: 2.5rem;
		padding: 0 0.9rem;
		border: 1px solid var(--ink-primary);
		background-color: var(--ink-primary);
		color: var(--bg-canvas);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		transition:
			background-color 150ms ease,
			border-color 150ms ease;
	}

	.quick-book:hover {
		background-color: var(--accent-bordeaux);
		border-color: var(--accent-bordeaux);
	}

	.plus {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 500;
		line-height: 1;
		color: var(--border-gold);
	}

	.quick-label {
		display: none;
	}

	.account-wrap {
		position: relative;
	}

	.account {
		display: none;
		align-items: center;
		gap: 0.625rem;
		height: 2.5rem;
		padding: 0 0.875rem 0 0.25rem;
		border: 1px solid var(--border-hairline);
		border-radius: 9999px;
		background-color: var(--bg-surface);
		color: var(--ink-primary);
		transition: border-color 150ms ease;
	}

	.account:hover,
	.account[aria-expanded='true'] {
		border-color: var(--border-gold);
	}

	.account-text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.15;
		min-width: 0;
	}

	.account-name {
		max-width: 9rem;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 0.8rem;
		font-weight: 500;
	}

	.account-role {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--border-gold);
	}

	.avatar {
		position: relative;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		background-color: var(--ink-primary);
		font-family: var(--font-display);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1;
		color: var(--bg-canvas);
	}

	.avatar.small {
		font-size: 0.7rem;
	}

	.status-dot {
		position: absolute;
		right: -1px;
		bottom: -1px;
		width: 0.55rem;
		height: 0.55rem;
		border: 2px solid var(--bg-surface);
		border-radius: 9999px;
		background-color: var(--accent-emerald);
	}

	.status-dot[data-mode='demo'] {
		background-color: var(--border-gold);
	}

	.status-dot.inline {
		position: static;
		display: inline-block;
		border: 0;
		width: 0.45rem;
		height: 0.45rem;
	}

	.chevron {
		width: 0.9rem;
		height: 0.9rem;
		color: var(--ink-secondary);
		transition: transform 200ms ease;
	}

	.account[aria-expanded='true'] .chevron {
		transform: rotate(180deg);
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		border: 1px solid var(--border-hairline);
		background: transparent;
		color: var(--ink-primary);
	}

	.toggle svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	/* ---------- Dropdown ---------- */
	.dropdown {
		position: absolute;
		top: calc(100% + 0.75rem);
		right: 0;
		width: 18.5rem;
		border: 1px solid var(--border-hairline);
		border-top: 2px solid var(--border-gold);
		background-color: var(--bg-surface);
		box-shadow: 0 24px 48px -28px rgb(11 25 44 / 0.4);
		animation: drop-in 160ms ease-out;
	}

	@keyframes drop-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	.dropdown-head {
		padding: 1.125rem 1.25rem 1rem;
		border-bottom: 1px solid var(--border-hairline);
	}

	.dropdown-head p {
		margin: 0;
	}

	.head-name {
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--ink-primary);
	}

	.dropdown-head .head-meta {
		margin-top: 0.125rem;
		font-size: 0.8rem;
		color: var(--ink-secondary);
		overflow-wrap: anywhere;
	}

	.dropdown-head .role-badge {
		display: inline-block;
		margin-top: 0.625rem;
		padding: 0.125rem 0.5rem;
		border: 1px solid var(--border-gold);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-primary);
	}

	.dropdown-head .mode {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
		font-size: 0.75rem;
		color: var(--ink-secondary);
	}

	.list-heading {
		margin: 0;
		padding: 0.875rem 1.25rem 0.375rem;
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--ink-secondary);
	}

	.user-list {
		padding-bottom: 0.5rem;
	}

	.user-option {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.5rem 1.25rem;
		border: 0;
		border-radius: 0;
		background: transparent;
		text-align: left;
		color: var(--ink-primary);
		transition: background-color 150ms ease;
	}

	.user-option:hover {
		background-color: var(--bg-canvas);
	}

	.user-option.active .avatar {
		box-shadow: 0 0 0 2px var(--bg-surface), 0 0 0 3px var(--border-gold);
	}

	.user-option.compact {
		padding-inline: 0;
	}

	.option-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.3;
	}

	.option-name {
		font-size: 0.875rem;
	}

	.option-role {
		font-size: 0.72rem;
		color: var(--ink-secondary);
	}

	.check {
		width: 1rem;
		height: 1rem;
		margin-left: auto;
		color: var(--border-gold);
	}

	.logout {
		display: block;
		width: 100%;
		padding: 0.75rem 1.25rem;
		border: 0;
		border-top: 1px solid var(--border-hairline);
		border-radius: 0;
		background: transparent;
		text-align: left;
		font-size: 0.8rem;
		letter-spacing: 0.04em;
		color: var(--accent-bordeaux);
	}

	.logout:hover {
		background-color: var(--bg-canvas);
	}

	/* ---------- Mobile menu ---------- */
	.mobile-menu {
		border-top: 1px solid var(--border-hairline);
		background-color: var(--bg-surface);
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
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 500;
		color: var(--ink-secondary);
		text-decoration: none;
	}

	.mobile-link[aria-current='page'] {
		border-left-color: var(--border-gold);
		color: var(--ink-primary);
	}

	.mobile-account {
		max-width: 72rem;
		margin-inline: auto;
		padding: 1rem;
		border-top: 1px solid var(--border-hairline);
	}

	.mobile-account-inner {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		font-size: 0.875rem;
		color: var(--ink-primary);
	}

	.mobile-users {
		margin-top: 0.75rem;
	}

	.mobile-users .list-heading,
	.mobile-users .logout {
		padding-inline: 0;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	/* ---------- Breakpoints ---------- */
	@media (min-width: 640px) {
		.bar {
			padding-inline: 1.5rem;
		}

		.account {
			display: inline-flex;
		}

		.quick-label {
			display: inline;
		}

		.mobile-account {
			display: none;
		}
	}

	@media (min-width: 900px) {
		.links {
			display: flex;
		}

		.toggle,
		.mobile-menu {
			display: none;
		}
	}

	@media (min-width: 1100px) {
		.bar {
			padding-inline: 2rem;
		}

		.tagline {
			display: block;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dropdown {
			animation: none;
		}

		.link::after,
		.chevron {
			transition: none;
		}
	}
</style>
