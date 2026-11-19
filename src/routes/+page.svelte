<script lang="ts">
	import { onMount } from 'svelte';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { resourceService } from '#lib/api/resourceService.ts';
	import { reservationService } from '#lib/api/reservationService.ts';
	import { connectionMode } from '#lib/stores/authStore.ts';
	import type { ReservationDTO, ResourceDTO } from '#lib/types/index.ts';

	type Metric = { label: string; value: string; note: string };

	let resources = $state<ResourceDTO[] | null>(null);
	let reservations = $state<ReservationDTO[] | null>(null);
	let error = $state<string | null>(null);

	function isToday(iso: string): boolean {
		const d = new Date(iso);
		const now = new Date();
		return (
			d.getFullYear() === now.getFullYear() &&
			d.getMonth() === now.getMonth() &&
			d.getDate() === now.getDate()
		);
	}

	const metrics = $derived.by<Metric[]>(() => {
		const rooms = resources?.filter((r) => r.type === 'Room');
		const equipment = resources?.filter((r) => r.type === 'Equipment');
		const fmt = (n: number | undefined) => (n === undefined ? '—' : String(n));

		return [
			{
				label: 'Săli disponibile',
				value: fmt(rooms?.filter((r) => r.isAvailable).length),
				note: rooms ? `din ${rooms.length} înregistrate` : 'din totalul înregistrat'
			},
			{
				label: 'Echipamente',
				value: fmt(equipment?.length),
				note: equipment
					? `${equipment.filter((e) => e.isAvailable).length} disponibile acum`
					: 'în inventar'
			},
			{
				label: 'Rezervări astăzi',
				value: fmt(
					reservations?.filter((r) => r.status === 'Confirmed' && isToday(r.startTime)).length
				),
				note: 'confirmate'
			},
			{
				label: 'În așteptare',
				value: fmt(reservations?.filter((r) => r.status === 'Pending').length),
				note: 'necesită aprobare'
			}
		];
	});

	// Client-only: the relative `/api` URL is resolved by the browser (and Nginx).
	onMount(async () => {
		try {
			[resources, reservations] = await Promise.all([
				resourceService.getAll(),
				reservationService.getAll()
			]);
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Datele nu au putut fi încărcate.';
		}
	});
</script>

<svelte:head>
	<title>Prezentare — Atrium</title>
</svelte:head>

<section class="intro">
	<p class="eyebrow">Prezentare generală</p>
	<h1 class="title">Gestiunea Sălilor și Echipamentelor</h1>
	<div class="rule" aria-hidden="true"></div>
	<p class="lead">
		O privire de ansamblu asupra spațiilor, echipamentelor și rezervărilor instituției — totul într-un
		singur loc.
	</p>
</section>

<section class="metrics" aria-label="Indicatori principali">
	<ul class="metric-grid" aria-busy={resources === null && !error}>
		{#each metrics as metric (metric.label)}
			<li class="metric">
				<h2 class="metric-label">{metric.label}</h2>
				<p class="metric-value">{metric.value}</p>
				<p class="metric-note">{metric.note}</p>
			</li>
		{/each}
	</ul>

	{#if error}
		<p class="status error" role="alert">{error}</p>
	{:else if $connectionMode === 'demo' && resources}
		<p class="status">
			<span class="status-mark" aria-hidden="true"></span>
			Serverul nu este disponibil — sunt afișate date demonstrative.
		</p>
	{/if}
</section>

<style>
	/* ---------- Intro ---------- */
	.intro {
		max-width: 48rem;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--color-brass);
	}

	.title {
		margin: 1rem 0 0;
		font-size: 2.25rem;
		line-height: 1.11;
	}

	.rule {
		width: 4rem;
		height: 1px;
		margin-top: 1.5rem;
		background-color: var(--color-brass);
	}

	.lead {
		margin: 1.5rem 0 0;
		font-size: 1.125rem;
		line-height: 1.625;
		color: var(--color-muted);
	}

	/* ---------- Metrics ---------- */
	.metrics {
		margin-top: 3.5rem;
	}

	.metric-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1px;
		overflow: hidden;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-hairline);
	}

	.metric {
		padding: 1.5rem;
		background-color: var(--color-surface);
	}

	.metric-label {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 0.7rem;
		font-weight: 500;
		line-height: 1.6;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.metric-value {
		margin: 1rem 0 0;
		font-family: var(--font-serif);
		font-size: 2.25rem;
		line-height: 2.5rem;
		color: var(--color-ink);
	}

	.metric-note {
		margin: 0.5rem 0 0;
		font-size: 0.875rem;
		line-height: 1.25rem;
		color: var(--color-muted);
	}

	.metric-grid[aria-busy='true'] .metric-value {
		color: var(--color-hairline);
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1rem 0 0;
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		color: var(--color-muted);
	}

	.status-mark {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 9999px;
		background-color: var(--color-brass);
	}

	.status.error {
		color: var(--color-bordeaux);
	}

	@media (min-width: 640px) {
		.title {
			font-size: 3rem;
			line-height: 1;
		}

		.metric-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.metric {
			padding: 1.75rem;
		}
	}

	@media (min-width: 1024px) {
		.metric-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
