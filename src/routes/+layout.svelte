<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import Navbar from '#lib/components/Navbar.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const year = new Date().getFullYear();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Atrium — Resource Concierge</title>
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
				Gestiunea resurselor
			</p>
			<p>© {year} Toate drepturile rezervate.</p>
		</div>
	</footer>
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		background-color: var(--color-canvas);
	}

	.content {
		flex: 1;
		width: 100%;
		max-width: 72rem;
		margin-inline: auto;
		padding: 3rem 1rem;
	}

	.footer {
		border-top: 1px solid var(--color-hairline);
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
		color: var(--color-muted);
	}

	.footer-inner p {
		margin: 0;
	}

	.footer-brand {
		font-family: var(--font-serif);
		font-size: 0.875rem;
		letter-spacing: 0.18em;
		color: var(--color-ink);
	}

	.footer-dot {
		margin-inline: 0.5rem;
		color: var(--color-brass);
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
