<script lang="ts">
	import { onMount } from 'svelte';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { resourceService } from '#lib/api/resourceService.ts';
	import { reservationService } from '#lib/api/reservationService.ts';
	import { connectionMode } from '#lib/stores/authStore.ts';
	import type { ReservationDTO, ResourceDTO } from '#lib/types/index.ts';
	import { isUpcoming, STATUS_LABELS } from '#lib/utils/reservation.ts';
	import { TYPE_LABELS } from '#lib/utils/resource.ts';

	type Metric = { label: string; value: string; note: string };

	let resources = $state<ResourceDTO[] | null>(null);
	let reservations = $state<ReservationDTO[] | null>(null);
	let error = $state<string | null>(null);
	let now = $state(Date.now());

	const UPCOMING_LIMIT = 4;

	const weekdayFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'short' });
	const monthFmt = new Intl.DateTimeFormat('ro-RO', { month: 'short' });
	const timeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

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

	const resourceById = $derived(new Map((resources ?? []).map((r) => [r.id, r])));

	/** Active reservations that have not ended yet, soonest first. */
	const upcoming = $derived(
		(reservations ?? [])
			.filter((r) => isUpcoming(r, now))
			.toSorted((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
			.slice(0, UPCOMING_LIMIT)
	);

	function relativeDay(iso: string): string {
		const day = new Date(iso);
		day.setHours(0, 0, 0, 0);
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
		if (diff === 0) return 'Astăzi';
		if (diff === 1) return 'Mâine';
		return weekdayFmt.format(day);
	}

	function timeRange(r: ReservationDTO): string {
		return `${timeFmt.format(new Date(r.startTime))} – ${timeFmt.format(new Date(r.endTime))}`;
	}

	// Client-only: the relative `/api` URL is resolved by the browser (and Nginx).
	onMount(() => {
		(async () => {
			try {
				[resources, reservations] = await Promise.all([
					resourceService.getAll(),
					reservationService.getAll()
				]);
			} catch (e) {
				error = e instanceof ApiError ? e.message : 'Datele nu au putut fi încărcate.';
			}
		})();

		// Keep "în desfășurare" and the list itself honest while the page stays open.
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
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

<section class="upcoming" aria-labelledby="upcoming-heading">
	<header class="section-head">
		<div>
			<p class="eyebrow">Agenda instituției</p>
			<h2 id="upcoming-heading" class="section-title">Următoarele Rezervări</h2>
		</div>
		<a href="/reservations" class="text-link">
			Toate rezervările
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M5 12h14M13 6l6 6-6 6" />
			</svg>
		</a>
	</header>

	{#if reservations === null && !error}
		<ul class="agenda" aria-busy="true">
			{#each { length: 3 }, i (i)}
				<li class="agenda-item skeleton" aria-hidden="true">
					<span class="bone date"></span>
					<span class="agenda-main"><span class="bone wide"></span><span class="bone"></span></span>
				</li>
			{/each}
		</ul>
	{:else if upcoming.length === 0 && !error}
		<div class="agenda-empty">
			<p class="empty-title">Nicio rezervare programată.</p>
			<p>Agenda este liberă — alegeți o sală sau un echipament pentru a face o programare.</p>
		</div>
	{:else if !error}
		<ul class="agenda">
			{#each upcoming as r (r.id)}
				{@const resource = resourceById.get(r.resourceId)}
				{@const start = new Date(r.startTime)}
				{@const live = Date.parse(r.startTime) <= now}
				<li class="agenda-item">
					<time class="date" datetime={r.startTime}>
						<span class="weekday">{relativeDay(r.startTime)}</span>
						<span class="day-num">{start.getDate()}</span>
						<span class="month">{monthFmt.format(start)}</span>
					</time>
					<div class="agenda-main">
						<p class="agenda-meta">
							<span class="time">{timeRange(r)}</span>
							{#if resource}
								<span class="sep" aria-hidden="true">·</span>
								<span class="kind">{TYPE_LABELS[resource.type]}</span>
							{/if}
						</p>
						<h3 class="agenda-title">{resource?.name ?? `Resursa #${r.resourceId}`}</h3>
						<p class="agenda-purpose">{r.purpose}</p>
					</div>
					<span class="pill" data-status={live ? 'Live' : r.status}>
						{live ? 'În desfășurare' : STATUS_LABELS[r.status]}
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	<nav class="quick-links" aria-label="Acces rapid">
		<a href="/resources" class="quick-link">
			<span class="quick-eyebrow">Catalog</span>
			<span class="quick-title">Explorați sălile și echipamentele</span>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M5 12h14M13 6l6 6-6 6" />
			</svg>
		</a>
		<a href="/reservations" class="quick-link">
			<span class="quick-eyebrow">Programare</span>
			<span class="quick-title">Faceți o rezervare nouă</span>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M5 12h14M13 6l6 6-6 6" />
			</svg>
		</a>
	</nav>
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

	/* ---------- Upcoming ---------- */
	.upcoming {
		margin-top: 4rem;
	}

	.section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--color-hairline);
	}

	.section-title {
		margin: 0.625rem 0 0;
		font-size: 1.75rem;
	}

	.text-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.85rem;
		letter-spacing: 0.02em;
		color: var(--color-bordeaux);
		text-decoration: none;
	}

	.text-link svg {
		width: 1rem;
		height: 1rem;
		transition: transform 150ms ease;
	}

	.text-link:hover {
		text-decoration: underline;
	}

	.text-link:hover svg {
		transform: translateX(3px);
	}

	.agenda {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.agenda-item {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.75rem 1.25rem;
		align-items: center;
		padding: 1.25rem 0;
		border-bottom: 1px solid var(--color-hairline);
	}

	.date {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 3.75rem;
		padding-right: 1.25rem;
		border-right: 1px solid var(--color-hairline);
		text-align: center;
	}

	.weekday,
	.month {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--color-muted);
		white-space: nowrap;
	}

	.month {
		color: var(--color-brass);
	}

	.day-num {
		font-family: var(--font-serif);
		font-size: 1.85rem;
		font-weight: 600;
		line-height: 1.1;
		font-variant-numeric: lining-nums;
	}

	.agenda-main {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.agenda-meta {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	.time {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--color-ink);
	}

	.sep {
		margin-inline: 0.375rem;
		color: var(--color-brass);
	}

	.kind {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.agenda-title {
		margin: 0;
		font-size: 1.2rem;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.agenda-purpose {
		margin: 0;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 0.9rem;
		color: var(--color-muted);
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.pill {
		grid-column: 2;
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.1rem 0.55rem;
		border: 1px solid currentColor;
		border-radius: 9999px;
		font-size: 0.65rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--color-forest);
	}

	.pill::before {
		content: '';
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 9999px;
		background-color: currentColor;
	}

	.pill[data-status='Pending'] {
		color: #8a6a2f;
	}

	.pill[data-status='Live'] {
		border-color: var(--color-ink);
		background-color: var(--color-ink);
		color: var(--color-canvas);
	}

	.agenda-empty {
		padding: 2.5rem 0;
		border-bottom: 1px solid var(--color-hairline);
		font-size: 0.9rem;
		color: var(--color-muted);
	}

	.agenda-empty p {
		margin: 0;
	}

	.empty-title {
		margin-bottom: 0.375rem !important;
		font-family: var(--font-serif);
		font-size: 1.2rem;
		color: var(--color-ink);
	}

	.skeleton .bone {
		display: block;
		height: 0.75rem;
		width: 45%;
		background-color: var(--color-hairline);
		opacity: 0.6;
		animation: pulse 1.4s ease-in-out infinite;
	}

	.skeleton .bone.date {
		width: 3.75rem;
		height: 3.25rem;
	}

	.skeleton .bone.wide {
		width: 65%;
		height: 1.1rem;
	}

	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}

	.quick-links {
		display: grid;
		gap: 1px;
		margin-top: 2rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-hairline);
	}

	.quick-link {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 1.25rem 3.5rem 1.25rem 1.5rem;
		background-color: var(--color-surface);
		text-decoration: none;
		transition: background-color 150ms ease;
	}

	.quick-link:hover {
		background-color: color-mix(in srgb, var(--color-brass) 6%, var(--color-surface));
	}

	.quick-eyebrow {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--color-brass);
	}

	.quick-title {
		font-family: var(--font-serif);
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.quick-link svg {
		position: absolute;
		top: 50%;
		right: 1.5rem;
		width: 1.25rem;
		height: 1.25rem;
		color: var(--color-bordeaux);
		transform: translateY(-50%);
		transition: transform 150ms ease;
	}

	.quick-link:hover svg {
		transform: translate(4px, -50%);
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton .bone {
			animation: none;
		}
	}

	@media (min-width: 640px) {
		.agenda-item {
			grid-template-columns: auto minmax(0, 1fr) auto;
		}

		.pill {
			grid-column: auto;
			justify-self: end;
		}

		.quick-links {
			grid-template-columns: 1fr 1fr;
		}

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
