<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import BookingDrawer from '#lib/components/BookingDrawer.svelte';
	import Navbar from '#lib/components/Navbar.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const year = new Date().getFullYear();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Atrium — Gestiune Spații & Resurse</title>
</svelte:head>

<div class="shell">
	<Navbar />

	<main class="content">
		{@render children()}
	</main>

	<footer class="footer">
		<div class="footer-inner">
			<p>
				<span class="footer-brand">ATRIUM</span>
				<span class="footer-dot">·</span>
				<span class="footer-tag">Gestiune Spații &amp; Resurse</span>
			</p>
			<p>© {year} Toate drepturile rezervate.</p>
		</div>
	</footer>
</div>

<BookingDrawer />

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		background-color: var(--bg-canvas);
	}

	.content {
		flex: 1;
		width: 100%;
		max-width: 72rem;
		margin-inline: auto;
		padding: 3rem 1rem;
	}

	.footer {
		border-top: 1px solid var(--border-hairline);
		background-color: var(--bg-surface);
	}

	.footer-tag {
		font-family: var(--font-display);
		font-size: 0.9rem;
		font-style: italic;
		letter-spacing: 0.02em;
	}

	.footer-inner {
		max-width: 72rem;
		margin-inline: auto;
		padding: 2rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.75rem;
		line-height: 1rem;
		letter-spacing: 0.025em;
		color: var(--ink-secondary);
	}

	.footer-inner p {
		margin: 0;
	}

	.footer-brand {
		font-family: var(--font-display);
		font-size: 0.875rem;
		letter-spacing: 0.18em;
		color: var(--ink-primary);
	}

	.footer-dot {
		margin-inline: 0.5rem;
		color: var(--border-gold);
	}

	@media (min-width: 640px) {
		.content {
			padding: 4rem 1.5rem;
		}

		.footer-inner {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			padding-inline: 1.5rem;
		}
	}

	@media (min-width: 1024px) {
		.content,
		.footer-inner {
			padding-inline: 2rem;
		}
	}
</style>
