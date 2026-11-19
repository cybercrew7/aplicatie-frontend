<script lang="ts">
	import { onMount } from 'svelte';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { resourceService } from '#lib/api/resourceService.ts';
	import { connectionMode } from '#lib/stores/authStore.ts';
	import { openBookingDrawer } from '#lib/stores/bookingStore.ts';
	import { loadReservations, reservationsStore } from '#lib/stores/reservationStore.ts';
	import type { ReservationDTO, ResourceDTO } from '#lib/types/index.ts';
	import { isUpcoming, STATUS_LABELS, toDateInput } from '#lib/utils/reservation.ts';
	import { TYPE_LABELS } from '#lib/utils/resource.ts';
	import { CLOSING_HOUR, isFreeNow, OPENING_HOUR } from '#lib/utils/schedule.ts';

	type Kpi = {
		label: string;
		value: string;
		unit?: string;
		note: string;
		/** 0–1, renders a brass meter under the figure. */
		meter?: number;
	};

	type RowState = { key: string; label: string };

	const UPCOMING_LIMIT = 5;
	const HOUR_MS = 3_600_000;

	const weekdayFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'long' });
	const shortWeekdayFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'short' });
	const monthYearFmt = new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' });
	const monthFmt = new Intl.DateTimeFormat('ro-RO', { month: 'short' });
	const timeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

	let resources = $state<ResourceDTO[] | null>(null);
	let error = $state<string | null>(null);
	let now = $state(Date.now());

	const reservations = $derived($reservationsStore);
	const loading = $derived((resources === null || reservations === null) && !error);
	const resourceById = $derived(new Map((resources ?? []).map((r) => [r.id, r])));

	// ---------- Today's window ----------
	const today = $derived(new Date(now));
	const todayKey = $derived(toDateInput(today));
	const dayStart = $derived(new Date(today).setHours(0, 0, 0, 0));
	const dayEnd = $derived(dayStart + 24 * HOUR_MS);
	const openAt = $derived(new Date(today).setHours(OPENING_HOUR, 0, 0, 0));
	const closeAt = $derived(new Date(today).setHours(CLOSING_HOUR, 0, 0, 0));

	const active = $derived((reservations ?? []).filter((r) => r.status !== 'Cancelled'));

	/** Active bookings touching today, in chronological order. */
	const todays = $derived(
		active
			.filter((r) => Date.parse(r.startTime) < dayEnd && Date.parse(r.endTime) > dayStart)
			.toSorted((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
	);

	/** Upcoming bookings after today, soonest first. */
	const later = $derived(
		(reservations ?? [])
			.filter((r) => isUpcoming(r, now) && Date.parse(r.startTime) >= dayEnd)
			.toSorted((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
			.slice(0, UPCOMING_LIMIT)
	);

	const freeNow = $derived(
		resources && reservations
			? resources.filter((r) => r.isAvailable && isFreeNow(r.id, reservations, now)).length
			: null
	);

	/**
	 * Share of today's bookable hours (08:00–20:00 × in-service resources)
	 * already covered by active reservations.
	 */
	const occupancy = $derived.by(() => {
		if (!resources || !reservations) return null;
		const inService = resources.filter((r) => r.isAvailable);
		if (inService.length === 0) return 0;
		const ids = new Set(inService.map((r) => r.id));
		let booked = 0;
		for (const r of todays) {
			if (!ids.has(r.resourceId)) continue;
			const start = Math.max(Date.parse(r.startTime), openAt);
			const end = Math.min(Date.parse(r.endTime), closeAt);
			if (end > start) booked += end - start;
		}
		const capacity = inService.length * (closeAt - openAt);
		return Math.min(1, booked / capacity);
	});

	const kpis = $derived.by<Kpi[]>(() => {
		const rooms = resources?.filter((r) => r.type === 'Room');
		const equipment = resources?.filter((r) => r.type === 'Equipment');
		const fmt = (n: number | null | undefined) => (n == null ? '—' : String(n));
		const liveCount = todays.filter(
			(r) => Date.parse(r.startTime) <= now && Date.parse(r.endTime) > now
		).length;

		return [
			{
				label: 'Săli Active',
				value: fmt(rooms?.filter((r) => r.isAvailable).length),
				note: rooms ? `din ${rooms.length} săli înregistrate` : 'săli în funcțiune'
			},
			{
				label: 'Echipamente',
				value: fmt(equipment?.length),
				note: equipment
					? `${equipment.filter((e) => e.isAvailable).length} disponibile în inventar`
					: 'în inventar'
			},
			{
				label: 'Rezervări Azi',
				value: reservations ? String(todays.length) : '—',
				note: reservations
					? liveCount > 0
						? `${liveCount} în desfășurare acum`
						: 'nicio sesiune în desfășurare'
					: 'programări active'
			},
			{
				label: 'Grad de Ocupare',
				value: occupancy === null ? '—' : String(Math.round(occupancy * 100)),
				unit: occupancy === null ? undefined : '%',
				note: `ore rezervate, ${String(OPENING_HOUR).padStart(2, '0')}:00 – ${CLOSING_HOUR}:00`,
				meter: occupancy ?? undefined
			}
		];
	});

	// ---------- Formatting ----------
	function timeRange(r: ReservationDTO): string {
		return `${timeFmt.format(new Date(r.startTime))} – ${timeFmt.format(new Date(r.endTime))}`;
	}

	function duration(r: ReservationDTO): string {
		const minutes = Math.round((Date.parse(r.endTime) - Date.parse(r.startTime)) / 60_000);
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m} min`;
		return m === 0 ? `${h} h` : `${h} h ${m} min`;
	}

	function rowState(r: ReservationDTO): RowState {
		const start = Date.parse(r.startTime);
		const end = Date.parse(r.endTime);
		if (end <= now) return { key: 'Ended', label: 'Încheiată' };
		if (start <= now) return { key: 'Live', label: 'În desfășurare' };
		return { key: r.status, label: STATUS_LABELS[r.status] };
	}

	function dayHref(iso: string): string {
		return `/reservations?date=${toDateInput(new Date(iso))}`;
	}

	function bookAgain(r: ReservationDTO) {
		const start = new Date(r.startTime);
		const sameDay = toDateInput(start) === todayKey;
		openBookingDrawer(r.resourceId, sameDay ? todayKey : toDateInput(start));
	}

	// Client-only: the relative `/api` URL is resolved by the browser (and Nginx).
	onMount(() => {
		Promise.all([resourceService.getAll(), loadReservations(true)])
			.then(([rows]) => (resources = rows))
			.catch((e: unknown) => {
				error = e instanceof ApiError ? e.message : 'Datele nu au putut fi încărcate.';
			});

		// Keeps "în desfășurare", occupancy and the agenda honest while the page stays open.
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Prezentare — Atrium</title>
</svelte:head>

<!-- ---------- Hero ---------- -->
<section class="hero" aria-labelledby="hero-title">
	<div class="hero-text">
		<p class="eyebrow">Atrium · Registrul spațiilor</p>
		<h1 id="hero-title" class="hero-title">
			Spații gândite pentru <em>studiu</em>, <em>creație</em> și întâlnire.
		</h1>
		<div class="rule" aria-hidden="true"></div>
		<p class="lead">
			Rezervați săli de curs, laboratoare și echipamente ale instituției într-un singur registru —
			cu disponibilitatea zilei la vedere.
		</p>
		<div class="hero-actions">
			<button type="button" class="btn primary" onclick={() => openBookingDrawer()}>
				Rezervă un Spațiu
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M5 12h14M13 6l6 6-6 6" />
				</svg>
			</button>
			<a href="/resources" class="text-link">Explorează Catalogul</a>
		</div>
	</div>

	<aside class="almanac" aria-label="Astăzi">
		<p class="almanac-eyebrow">Astăzi</p>
		<p class="almanac-day">{today.getDate()}</p>
		<p class="almanac-weekday">{weekdayFmt.format(today)}</p>
		<p class="almanac-month">{monthYearFmt.format(today)}</p>
		<div class="almanac-rule" aria-hidden="true"></div>
		<dl class="almanac-facts">
			<div>
				<dt>Program</dt>
				<dd>{String(OPENING_HOUR).padStart(2, '0')}:00 – {CLOSING_HOUR}:00</dd>
			</div>
			<div>
				<dt>Libere acum</dt>
				<dd>{freeNow ?? '—'}{#if resources} <span class="of">/ {resources.filter((r) => r.isAvailable).length}</span>{/if}</dd>
			</div>
		</dl>
	</aside>
</section>

<!-- ---------- KPIs ---------- -->
<section class="kpis" aria-label="Indicatori principali">
	<ul class="kpi-grid" aria-busy={loading}>
		{#each kpis as kpi, i (kpi.label)}
			<li class="kpi">
				<span class="kpi-index" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
				<h2 class="kpi-label">{kpi.label}</h2>
				<p class="kpi-value">
					{kpi.value}{#if kpi.unit}<span class="kpi-unit">{kpi.unit}</span>{/if}
				</p>
				{#if kpi.meter !== undefined}
					<div
						class="meter"
						role="meter"
						aria-label="Grad de ocupare"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={Math.round(kpi.meter * 100)}
					>
						<span style:width="{kpi.meter * 100}%"></span>
					</div>
				{/if}
				<p class="kpi-note">{kpi.note}</p>
			</li>
		{/each}
	</ul>

	{#if error}
		<p class="notice error" role="alert">{error}</p>
	{:else if $connectionMode === 'demo' && resources}
		<p class="notice">
			<span class="notice-mark" aria-hidden="true"></span>
			Serverul nu este disponibil — sunt afișate date demonstrative.
		</p>
	{/if}
</section>

<!-- ---------- Schedule ---------- -->
{#snippet row(r: ReservationDTO, showDate: boolean)}
	{@const resource = resourceById.get(r.resourceId)}
	{@const state = rowState(r)}
	{@const start = new Date(r.startTime)}
	<tr data-state={state.key}>
		<td class="cell-when">
			{#if showDate}
				<span class="when-date">
					<span class="when-day">{start.getDate()}</span>
					<span class="when-month">{shortWeekdayFmt.format(start)} · {monthFmt.format(start)}</span>
				</span>
			{/if}
			<span class="when-time">{timeRange(r)}</span>
			<span class="when-duration">{duration(r)}</span>
		</td>
		<th scope="row" class="cell-resource">
			<span class="res-name">{resource?.name ?? `Resursa #${r.resourceId}`}</span>
			{#if resource}
				<span class="res-kind" data-type={resource.type}>{TYPE_LABELS[resource.type]}</span>
				{#if resource.location}<span class="res-loc">{resource.location}</span>{/if}
			{/if}
		</th>
		<td class="cell-purpose" data-label="Scop">{r.purpose || '—'}</td>
		<td class="cell-status" data-label="Stare">
			<span class="status" data-status={state.key}>{state.label}</span>
		</td>
		<td class="cell-actions">
			<div class="row-actions">
				<button
					type="button"
					class="mini"
					onclick={() => bookAgain(r)}
					aria-label="Rezervă din nou {resource?.name ?? 'resursa'}"
				>
					Rezervă
				</button>
				<a class="mini ghost" href={dayHref(r.startTime)} aria-label="Vezi programul din {start.toLocaleDateString('ro-RO')}">
					Programul zilei
				</a>
			</div>
		</td>
	</tr>
{/snippet}

<section class="schedule" aria-labelledby="schedule-title">
	<header class="section-head">
		<div>
			<p class="eyebrow">Agenda instituției</p>
			<h2 id="schedule-title" class="section-title">Programul Zilei &amp; Următoarele Rezervări</h2>
		</div>
		<a href="/reservations" class="text-link small">
			Registrul complet
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M5 12h14M13 6l6 6-6 6" />
			</svg>
		</a>
	</header>

	{#if error}
		<!-- The notice above already explains the failure. -->
	{:else if loading}
		<div class="sheet" aria-busy="true">
			{#each { length: 4 }, i (i)}
				<div class="bone-row" aria-hidden="true">
					<span class="bone short"></span><span class="bone wide"></span><span class="bone"></span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="sheet">
			<table class="agenda">
				<caption class="visually-hidden">Rezervările de astăzi și următoarele programări</caption>
				<thead>
					<tr>
						<th scope="col">Interval</th>
						<th scope="col">Spațiu / Resursă</th>
						<th scope="col">Scop</th>
						<th scope="col">Stare</th>
						<th scope="col"><span class="visually-hidden">Acțiuni</span></th>
					</tr>
				</thead>

				<tbody>
					<tr class="group">
						<th scope="colgroup" colspan="5">
							<span>Astăzi</span>
							<span class="group-count">{todays.length}</span>
						</th>
					</tr>
					{#each todays as r (r.id)}
						{@render row(r, false)}
					{:else}
						<tr class="empty">
							<td colspan="5">
								<p class="empty-title">Nicio rezervare astăzi.</p>
								<p>
									Toate spațiile sunt libere în programul zilei.
									<button type="button" class="inline-link" onclick={() => openBookingDrawer()}>
										Faceți o rezervare
									</button>
								</p>
							</td>
						</tr>
					{/each}
				</tbody>

				<tbody>
					<tr class="group">
						<th scope="colgroup" colspan="5">
							<span>În zilele următoare</span>
							<span class="group-count">{later.length}</span>
						</th>
					</tr>
					{#each later as r (r.id)}
						{@render row(r, true)}
					{:else}
						<tr class="empty">
							<td colspan="5">
								<p>Nicio programare viitoare în registru.</p>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	button {
		font: inherit;
		cursor: pointer;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--border-gold);
	}

	.rule {
		width: 4rem;
		height: 1px;
		margin-top: 1.75rem;
		background-color: var(--border-gold);
	}

	/* ---------- Buttons & links ---------- */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		min-height: 3rem;
		padding: 0.625rem 1.5rem;
		border: 1px solid var(--ink-primary);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
		transition:
			background-color 180ms ease,
			border-color 180ms ease,
			color 180ms ease;
	}

	.btn svg {
		width: 1rem;
		height: 1rem;
		transition: transform 180ms ease;
	}

	.primary {
		background-color: var(--ink-primary);
		color: var(--bg-canvas);
	}

	.primary:hover {
		background-color: var(--accent-bordeaux);
		border-color: var(--accent-bordeaux);
	}

	.primary:hover svg {
		transform: translateX(3px);
	}

	.text-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding-block: 0.25rem;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-primary);
		text-decoration: none;
		border-bottom: 1px solid var(--border-gold);
		transition:
			color 150ms ease,
			border-color 150ms ease;
	}

	.text-link:hover {
		color: var(--accent-bordeaux);
		border-color: var(--accent-bordeaux);
	}

	.text-link.small {
		font-size: 0.72rem;
		border-bottom: 0;
		color: var(--accent-bordeaux);
	}

	.text-link svg {
		width: 1rem;
		height: 1rem;
		transition: transform 150ms ease;
	}

	.text-link:hover svg {
		transform: translateX(3px);
	}

	/* ---------- Hero ---------- */
	.hero {
		display: grid;
		gap: 2.5rem;
		padding-bottom: 3rem;
		border-bottom: 1px solid var(--border-hairline);
	}

	.hero-text {
		max-width: 44rem;
	}

	.hero-title {
		margin: 1.25rem 0 0;
		font-size: 2.6rem;
		font-weight: 500;
		line-height: 1.05;
	}

	.hero-title em {
		font-weight: 500;
		color: var(--accent-bordeaux);
	}

	.lead {
		max-width: 36rem;
		margin: 1.5rem 0 0;
		font-size: 1.05rem;
		line-height: 1.65;
		color: var(--ink-secondary);
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.25rem 2rem;
		margin-top: 2.25rem;
	}

	/* Almanac — a framed "today" plaque */
	.almanac {
		position: relative;
		align-self: end;
		padding: 1.75rem 1.75rem 1.5rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-surface);
		text-align: center;
	}

	.almanac::before {
		content: '';
		position: absolute;
		inset: 6px;
		border: 1px solid color-mix(in srgb, var(--border-gold) 45%, transparent);
		pointer-events: none;
	}

	.almanac p {
		margin: 0;
	}

	.almanac-eyebrow {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--border-gold);
	}

	.almanac-day {
		margin-top: 0.5rem !important;
		font-family: var(--font-display);
		font-size: 4.5rem;
		font-weight: 500;
		line-height: 0.95;
		font-variant-numeric: lining-nums;
		color: var(--ink-primary);
	}

	.almanac-weekday {
		margin-top: 0.375rem !important;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-style: italic;
		color: var(--ink-primary);
	}

	.almanac-weekday::first-letter {
		text-transform: uppercase;
	}

	.almanac-month {
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-secondary);
	}

	.almanac-rule {
		width: 2.5rem;
		height: 1px;
		margin: 1.25rem auto;
		background-color: var(--border-gold);
	}

	.almanac-facts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		margin: 0;
	}

	.almanac-facts > div + div {
		border-left: 1px solid var(--border-hairline);
	}

	.almanac-facts dt {
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-secondary);
	}

	.almanac-facts dd {
		margin: 0.25rem 0 0;
		font-size: 0.9rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ink-primary);
	}

	.of {
		font-weight: 400;
		color: var(--ink-secondary);
	}

	/* ---------- KPIs ---------- */
	.kpis {
		margin-top: 3rem;
	}

	.kpi-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1px;
		border: 1px solid var(--border-hairline);
		background-color: var(--border-hairline);
	}

	.kpi {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 1.5rem 1.5rem 1.375rem;
		background-color: var(--bg-surface);
		transition: background-color 200ms ease;
	}

	.kpi::before {
		content: '';
		position: absolute;
		inset: 0 0 auto;
		height: 2px;
		background-color: var(--border-gold);
		transform: scaleX(0);
		transform-origin: left;
		transition: transform 300ms ease;
	}

	.kpi:hover::before {
		transform: scaleX(1);
	}

	.kpi-index {
		position: absolute;
		top: 1.375rem;
		right: 1.5rem;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-style: italic;
		color: color-mix(in srgb, var(--border-gold) 80%, transparent);
	}

	.kpi-label {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 0.66rem;
		font-weight: 600;
		line-height: 1.6;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-secondary);
	}

	.kpi-value {
		margin: 1rem 0 0;
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: 500;
		line-height: 1;
		font-variant-numeric: lining-nums tabular-nums;
		color: var(--ink-primary);
	}

	.kpi-unit {
		margin-left: 0.15rem;
		font-size: 1.6rem;
		color: var(--border-gold);
	}

	.kpi-grid[aria-busy='true'] .kpi-value {
		color: var(--border-hairline);
	}

	.meter {
		height: 3px;
		margin-top: 0.875rem;
		background-color: var(--bg-subtle);
		overflow: hidden;
	}

	.meter span {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--border-gold), var(--accent-bordeaux));
		transition: width 600ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	.kpi-note {
		margin: 0.75rem 0 0;
		font-size: 0.82rem;
		line-height: 1.4;
		color: var(--ink-secondary);
	}

	.notice {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1rem 0 0;
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		color: var(--ink-secondary);
	}

	.notice-mark {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 9999px;
		background-color: var(--border-gold);
	}

	.notice.error {
		padding: 0.875rem 1rem;
		border: 1px solid var(--border-hairline);
		border-left: 3px solid var(--accent-bordeaux);
		background-color: var(--bg-surface);
		color: var(--accent-bordeaux);
	}

	/* ---------- Schedule ---------- */
	.schedule {
		margin-top: 4rem;
	}

	.section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.section-title {
		margin: 0.625rem 0 0;
		font-size: 1.85rem;
	}

	.sheet {
		border: 1px solid var(--border-hairline);
		border-top: 2px solid var(--ink-primary);
		background-color: var(--bg-surface);
	}

	.agenda {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.agenda thead {
		display: none;
	}

	.agenda th,
	.agenda td {
		padding: 0;
		text-align: left;
		font-weight: 400;
		vertical-align: middle;
	}

	/* Mobile: each row is a stacked card */
	.agenda tbody tr:not(.group):not(.empty) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.625rem 1rem;
		padding: 1.125rem 1.25rem;
		border-top: 1px solid var(--border-hairline);
	}

	.cell-when {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.625rem;
	}

	.cell-resource,
	.cell-purpose,
	.cell-actions {
		grid-column: 1 / -1;
	}

	.cell-status {
		grid-column: 2;
		grid-row: 1;
		justify-self: end;
	}

	.group th {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.75rem 1.25rem;
		border-top: 1px solid var(--border-hairline);
		background-color: var(--bg-canvas);
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-style: italic;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ink-primary);
	}

	tbody:first-of-type .group th {
		border-top: 0;
	}

	.group-count {
		min-width: 1.4rem;
		padding: 0 0.4rem;
		border: 1px solid var(--border-gold);
		border-radius: 9999px;
		font-family: var(--font-sans);
		font-size: 0.66rem;
		font-style: normal;
		font-weight: 600;
		text-align: center;
		font-variant-numeric: tabular-nums;
		color: var(--ink-primary);
	}

	.when-date {
		display: inline-flex;
		align-items: baseline;
		gap: 0.375rem;
		margin-right: 0.25rem;
	}

	.when-day {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1;
		font-variant-numeric: lining-nums;
	}

	.when-month {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--border-gold);
	}

	.when-time {
		font-size: 0.95rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--ink-primary);
	}

	.when-duration {
		font-size: 0.75rem;
		color: var(--ink-secondary);
	}

	.res-name {
		display: block;
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink-primary);
		overflow-wrap: anywhere;
	}

	.res-kind {
		display: inline-block;
		margin-top: 0.3rem;
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--border-gold);
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-primary);
	}

	.res-kind[data-type='Equipment'] {
		border-color: color-mix(in srgb, var(--accent-bordeaux) 45%, transparent);
		color: var(--accent-bordeaux);
	}

	.res-loc {
		margin-left: 0.5rem;
		font-size: 0.78rem;
		color: var(--ink-secondary);
	}

	.cell-purpose {
		font-family: var(--font-display);
		font-size: 1rem;
		font-style: italic;
		line-height: 1.4;
		color: var(--ink-secondary);
		overflow-wrap: anywhere;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		white-space: nowrap;
		background-color: color-mix(in srgb, var(--accent-emerald) 9%, var(--bg-surface));
		color: var(--accent-emerald);
	}

	.status::before {
		content: '';
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 9999px;
		background-color: currentColor;
	}

	.status[data-status='Pending'] {
		background-color: color-mix(in srgb, var(--border-gold) 16%, var(--bg-surface));
		color: #7a5c22;
	}

	.status[data-status='Live'] {
		background-color: var(--ink-primary);
		color: var(--bg-canvas);
	}

	.status[data-status='Live']::before {
		background-color: var(--border-gold);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--border-gold) 30%, transparent);
	}

	.status[data-status='Ended'] {
		background-color: var(--bg-subtle);
		color: var(--ink-secondary);
	}

	tr[data-state='Ended'] .res-name,
	tr[data-state='Ended'] .when-time {
		color: var(--ink-secondary);
	}

	.row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.mini {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--ink-primary);
		border-radius: var(--radius-frame);
		background-color: var(--ink-primary);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--bg-canvas);
		text-decoration: none;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.mini:hover {
		border-color: var(--accent-bordeaux);
		background-color: var(--accent-bordeaux);
	}

	.mini.ghost {
		border-color: var(--border-hairline);
		background-color: transparent;
		color: var(--ink-primary);
	}

	.mini.ghost:hover {
		border-color: var(--border-gold);
		background-color: color-mix(in srgb, var(--border-gold) 8%, var(--bg-surface));
	}

	.empty td {
		display: block;
		padding: 1.75rem 1.25rem;
		border-top: 1px solid var(--border-hairline);
		font-size: 0.875rem;
		color: var(--ink-secondary);
	}

	.empty p {
		margin: 0;
	}

	.empty-title {
		margin-bottom: 0.25rem !important;
		font-family: var(--font-display);
		font-size: 1.2rem;
		color: var(--ink-primary);
	}

	.inline-link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent-bordeaux);
		text-decoration: underline;
		text-decoration-color: var(--border-gold);
		text-underline-offset: 0.2em;
	}

	/* ---------- Skeleton ---------- */
	.bone-row {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 1.25rem;
		border-top: 1px solid var(--border-hairline);
	}

	.bone-row:first-child {
		border-top: 0;
	}

	.bone {
		display: block;
		width: 40%;
		height: 0.75rem;
		background-color: var(--bg-subtle);
		animation: pulse 1.4s ease-in-out infinite;
	}

	.bone.wide {
		width: 60%;
		height: 1.1rem;
	}

	.bone.short {
		width: 18%;
	}

	@keyframes pulse {
		50% {
			opacity: 0.45;
		}
	}

	/* ---------- Breakpoints ---------- */
	@media (min-width: 640px) {
		.hero-title {
			font-size: 3.4rem;
		}

		.kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.kpi {
			padding: 1.75rem;
		}
	}

	@media (min-width: 900px) {
		.hero {
			grid-template-columns: minmax(0, 1fr) 17rem;
			align-items: end;
			gap: 3.5rem;
		}

		/* Real table layout */
		.agenda thead {
			display: table-header-group;
		}

		.agenda tbody tr:not(.group):not(.empty) {
			display: table-row;
			padding: 0;
			transition: background-color 150ms ease;
		}

		.agenda tbody tr:not(.group):not(.empty):hover {
			background-color: color-mix(in srgb, var(--bg-canvas) 55%, var(--bg-surface));
		}

		.agenda thead th {
			padding: 0.875rem 1.25rem;
			border-bottom: 1px solid var(--border-hairline);
			font-size: 0.6rem;
			letter-spacing: 0.2em;
			white-space: nowrap;
		}

		.agenda tbody tr:not(.group):not(.empty) > * {
			padding: 1.125rem 1.25rem;
			border-top: 1px solid var(--border-hairline);
		}

		.group th {
			display: table-cell;
		}

		.group-count {
			display: inline-block;
			margin-left: 0.5rem;
		}

		.cell-when {
			display: table-cell;
			width: 11rem;
		}

		.when-date {
			display: flex;
			margin: 0 0 0.25rem;
		}

		.when-time,
		.when-duration {
			display: block;
		}

		.cell-purpose {
			max-width: 18rem;
		}

		.cell-actions {
			width: 1%;
		}

		.row-actions {
			flex-wrap: nowrap;
			justify-content: flex-end;
		}

		.empty td {
			display: table-cell;
		}
	}

	@media (min-width: 1024px) {
		.kpi-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.hero-title {
			font-size: 4rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bone {
			animation: none;
		}

		.meter span,
		.kpi::before {
			transition: none;
		}
	}
</style>
