<script lang="ts">
	import { page } from '$app/state';
	import { authStore, connectionMode, DEMO_USERS } from '#lib/stores/authStore.ts';
	import type { UserRole } from '#lib/types/index.ts';

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

	let accountOpen = $state(false);
	let accountEl: HTMLDivElement | undefined = $state();

	const ROLE_LABELS: Record<UserRole, string> = {
		Student: 'Student',
		Profesor: 'Profesor',
		Admin: 'Administrator'
	};

	const user = $derived($authStore.currentUser);
	const initials = $derived(user ? initialsOf(user.name) : '?');
	const modeLabel = $derived(
		$connectionMode === 'api' ? 'Conectat la server' : 'Mod demonstrativ — date locale'
	);

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

	function onWindowClick(event: MouseEvent) {
		if (accountOpen && accountEl && !accountEl.contains(event.target as Node)) {
			accountOpen = false;
		}
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') accountOpen = false;
	}

	// Close menus whenever the route changes.
	$effect(() => {
		page.url.pathname;
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
					<span class="account-label">{user ? user.name : 'Alege un cont'}</span>
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
							<p class="mode" data-mode={$connectionMode}>
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

	/* ---------- Account dropdown ---------- */
	.account-wrap {
		position: relative;
	}

	.avatar {
		position: relative;
		flex-shrink: 0;
	}

	.avatar.small {
		width: 2rem;
		height: 2rem;
		font-size: 0.7rem;
		letter-spacing: 0.04em;
	}

	.status-dot {
		position: absolute;
		right: -1px;
		bottom: -1px;
		width: 0.55rem;
		height: 0.55rem;
		border: 2px solid var(--color-surface);
		border-radius: 9999px;
		background-color: var(--color-api, #3f7d5a);
	}

	.status-dot[data-mode='demo'] {
		background-color: var(--color-brass);
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
		margin-left: -0.25rem;
		color: var(--color-muted);
		transition: transform 200ms ease;
	}

	.account[aria-expanded='true'] {
		border-color: var(--color-brass);
	}

	.account[aria-expanded='true'] .chevron {
		transform: rotate(180deg);
	}

	.account-label {
		max-width: 11rem;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 0.625rem);
		right: 0;
		width: 18rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
		box-shadow: 0 18px 40px -24px rgb(19 34 56 / 0.35);
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
		border-bottom: 1px solid var(--color-hairline);
	}

	.dropdown-head p {
		margin: 0;
	}

	.head-name {
		font-family: var(--font-serif);
		font-size: 1.05rem;
		color: var(--color-ink);
	}

	.head-meta {
		margin-top: 0.125rem !important;
		font-size: 0.8rem;
		color: var(--color-muted);
		overflow-wrap: anywhere;
	}

	.role-badge {
		display: inline-block;
		margin-top: 0.625rem !important;
		padding: 0.125rem 0.5rem;
		border: 1px solid var(--color-brass);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--color-ink);
	}

	.mode {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem !important;
		font-size: 0.75rem;
		color: var(--color-muted);
	}

	.list-heading {
		margin: 0;
		padding: 0.875rem 1.25rem 0.375rem;
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--color-muted);
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
		background: transparent;
		text-align: left;
		color: var(--color-ink);
		transition: background-color 150ms ease;
	}

	.user-option:hover {
		background-color: var(--color-canvas);
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
		font-size: 0.75rem;
		color: var(--color-muted);
	}

	.check {
		width: 1rem;
		height: 1rem;
		margin-left: auto;
		color: var(--color-brass);
	}

	.logout {
		display: block;
		width: 100%;
		padding: 0.75rem 1.25rem;
		border: 0;
		border-top: 1px solid var(--color-hairline);
		background: transparent;
		text-align: left;
		font-size: 0.8rem;
		letter-spacing: 0.04em;
		color: var(--color-bordeaux);
	}

	.logout:hover {
		background-color: var(--color-canvas);
	}

	.mobile-users {
		margin-top: 0.75rem;
	}

	.mobile-users .list-heading {
		padding-inline: 0;
	}

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

	@media (prefers-reduced-motion: reduce) {
		.dropdown {
			animation: none;
		}
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
