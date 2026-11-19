<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { reservationService } from '#lib/api/reservationService.ts';
	import { resourceService } from '#lib/api/resourceService.ts';
	import { userService } from '#lib/api/userService.ts';
	import ReservationModal from '#lib/components/ReservationModal.svelte';
	import { authStore, connectionMode } from '#lib/stores/authStore.ts';
	import type { ReservationDTO, ResourceDTO, UserDTO } from '#lib/types/index.ts';
	import { isUpcoming, STATUS_LABELS } from '#lib/utils/reservation.ts';
	import { TYPE_LABELS } from '#lib/utils/resource.ts';

	type Scope = 'mine' | 'all';
	type Period = 'upcoming' | 'history';
	type ToastKind = 'success' | 'error';

	const SCOPES: { value: Scope; label: string }[] = [
		{ value: 'mine', label: 'Rezervările Mele' },
		{ value: 'all', label: 'Toate Rezervările' }
	];

	const PERIODS: { value: Period; label: string }[] = [
		{ value: 'upcoming', label: 'Viitoare' },
		{ value: 'history', label: 'Istoric / Anulate' }
	];

	const weekdayFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'short' });
	const monthFmt = new Intl.DateTimeFormat('ro-RO', { month: 'short' });
	const dateFmt = new Intl.DateTimeFormat('ro-RO', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
	const timeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });
	const shortDateFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

	// ---------- Data ----------
	let reservations = $state<ReservationDTO[] | null>(null);
	let resources = $state<ResourceDTO[]>([]);
	let users = $state<UserDTO[]>([]);
	let error = $state<string | null>(null);
	let now = $state(Date.now());

	const user = $derived($authStore.currentUser);

	const resourceById = $derived(new Map(resources.map((r) => [r.id, r])));
	const userById = $derived(new Map(users.map((u) => [u.id, u])));

	// ---------- Filters ----------
	let scope = $state<Scope>('mine');
	let period = $state<Period>('upcoming');

	const inScope = $derived.by<ReservationDTO[]>(() => {
		if (!reservations) return [];
		if (scope === 'all') return reservations;
		return user ? reservations.filter((r) => r.userId === user.id) : [];
	});

	const scopeCounts = $derived<Record<Scope, number>>({
		mine: user ? (reservations?.filter((r) => r.userId === user.id).length ?? 0) : 0,
		all: reservations?.length ?? 0
	});

	const periodCounts = $derived<Record<Period, number>>({
		upcoming: inScope.filter((r) => isUpcoming(r, now)).length,
		history: inScope.filter((r) => !isUpcoming(r, now)).length
	});

	/** Upcoming: soonest first. History: most recent first. */
	const visible = $derived(
		inScope
			.filter((r) => isUpcoming(r, now) === (period === 'upcoming'))
			.toSorted((a, b) =>
				period === 'upcoming'
					? Date.parse(a.startTime) - Date.parse(b.startTime)
					: Date.parse(b.startTime) - Date.parse(a.startTime)
			)
	);

	// ---------- Modal ----------
	let modalOpen = $state(false);
	let presetResourceId = $state<number | null>(null);
	let freshId = $state<number | null>(null);

	function openModal(resourceId: number | null = null) {
		presetResourceId = resourceId;
		modalOpen = true;
	}

	// `/reservations?resourceId=<id>` (from the catalogue) opens the modal pre-filled,
	// then the parameter is dropped so a refresh or "back" does not reopen it.
	$effect(() => {
		const raw = page.url.searchParams.get('resourceId');
		if (raw === null || reservations === null) return;

		untrack(() => {
			const id = Number(raw);
			if (resources.some((r) => r.id === id)) openModal(id);
			else showToast('error', 'Resursa solicitată nu a fost găsită în catalog.');

			const clean = new URL(page.url.href);
			clean.searchParams.delete('resourceId');
			goto(clean, { replace: true, shallow: true });
		});
	});

	function onCreated(created: ReservationDTO) {
		modalOpen = false;
		reservations = [...(reservations ?? []), created];
		period = 'upcoming';
		freshId = created.id;
		const name = resourceById.get(created.resourceId)?.name ?? 'Resursa';
		showToast('success', `Rezervarea pentru ${name} a fost înregistrată.`);
	}

	// ---------- Cancellation ----------
	let confirmingId = $state<number | null>(null);
	let cancellingId = $state<number | null>(null);

	async function cancelReservation(r: ReservationDTO) {
		cancellingId = r.id;
		try {
			const updated = await reservationService.cancel(r.id);
			reservations = (reservations ?? []).map((x) =>
				x.id === r.id ? (updated ?? { ...x, status: 'Cancelled' }) : x
			);
			showToast('success', 'Rezervarea a fost anulată.');
		} catch (e) {
			showToast(
				'error',
				e instanceof ApiError ? e.message : 'Rezervarea nu a putut fi anulată. Încercați din nou.'
			);
		} finally {
			cancellingId = null;
			confirmingId = null;
		}
	}

	// ---------- Toast ----------
	let toast = $state<{ id: number; kind: ToastKind; message: string } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;

	function showToast(kind: ToastKind, message: string) {
		clearTimeout(toastTimer);
		toast = { id: Date.now(), kind, message };
		toastTimer = setTimeout(() => (toast = null), 4500);
	}

	function dismissToast() {
		clearTimeout(toastTimer);
		toast = null;
	}

	// ---------- Formatting ----------
	function timeRange(r: ReservationDTO): string {
		const start = new Date(r.startTime);
		const end = new Date(r.endTime);
		const sameDay = start.toDateString() === end.toDateString();
		return sameDay
			? `${timeFmt.format(start)} – ${timeFmt.format(end)}`
			: `${timeFmt.format(start)} – ${shortDateFmt.format(end)}, ${timeFmt.format(end)}`;
	}

	function userName(id: number): string {
		if (user?.id === id) return user.name;
		return userById.get(id)?.name ?? `Utilizator #${id}`;
	}

	function statusOf(r: ReservationDTO): { key: string; label: string } {
		if (r.status !== 'Cancelled' && Date.parse(r.endTime) <= now) {
			return { key: 'Ended', label: 'Încheiată' };
		}
		return { key: r.status, label: STATUS_LABELS[r.status] };
	}

	// ---------- Load ----------
	onMount(() => {
		(async () => {
			try {
				const [res, resv, us] = await Promise.all([
					resourceService.getAll(),
					reservationService.getAll(),
					// The user list may be restricted to admins; names fall back gracefully.
					userService.getAll().catch(() => [] as UserDTO[])
				]);
				resources = res;
				users = us;
				reservations = resv;
			} catch (e) {
				error = e instanceof ApiError ? e.message : 'Rezervările nu au putut fi încărcate.';
			}
		})();

		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => {
			clearInterval(timer);
			clearTimeout(toastTimer);
		};
	});
</script>

<svelte:head>
	<title>Rezervări — Atrium</title>
</svelte:head>

<!-- ---------- Header ---------- -->
<section class="intro">
	<div class="intro-text">
		<p class="eyebrow">Registrul rezervărilor</p>
		<h1 class="title">Rezervările Mele & Program</h1>
		<div class="rule" aria-hidden="true"></div>
		<p class="lead">
			Urmăriți programările dumneavoastră, consultați calendarul instituției și rezervați o sală sau
			un echipament în câteva momente.
		</p>
	</div>
	<button type="button" class="btn primary new" onclick={() => openModal()} disabled={reservations === null}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
			<path d="M12 5v14M5 12h14" />
		</svg>
		Rezervare Nouă
	</button>
</section>

<!-- ---------- Filters ---------- -->
<div class="toolbar">
	<div class="segmented" role="group" aria-label="Rezervări afișate">
		{#each SCOPES as tab (tab.value)}
			<button
				type="button"
				class="segment"
				aria-pressed={scope === tab.value}
				onclick={() => (scope = tab.value)}
			>
				{tab.label}
				<span class="count">{reservations ? scopeCounts[tab.value] : '–'}</span>
			</button>
		{/each}
	</div>

	<div class="periods" role="group" aria-label="Perioadă">
		{#each PERIODS as p (p.value)}
			<button
				type="button"
				class="period"
				aria-pressed={period === p.value}
				onclick={() => (period = p.value)}
			>
				{p.label}
				<span class="period-count">{reservations ? periodCounts[p.value] : '–'}</span>
			</button>
		{/each}
	</div>
</div>

<!-- ---------- List ---------- -->
<section class="results" aria-labelledby="results-heading" aria-busy={reservations === null && !error}>
	<h2 id="results-heading" class="visually-hidden">
		{SCOPES.find((s) => s.value === scope)?.label} — {PERIODS.find((p) => p.value === period)?.label}
	</h2>

	{#if error}
		<p class="state error" role="alert">{error}</p>
	{:else if reservations === null}
		<ul class="list">
			{#each { length: 4 }, i (i)}
				<li class="card skeleton" aria-hidden="true">
					<span class="date-block"><span class="bone tall"></span></span>
					<span class="card-main">
						<span class="bone short"></span>
						<span class="bone wide"></span>
						<span class="bone"></span>
					</span>
				</li>
			{/each}
		</ul>
	{:else if scope === 'mine' && !user}
		<div class="state">
			<p class="empty-title">Nu sunteți autentificat.</p>
			<p>Alegeți un cont din meniul de utilizator pentru a vedea rezervările dumneavoastră.</p>
			<button type="button" class="link" onclick={() => (scope = 'all')}>Vedeți toate rezervările</button>
		</div>
	{:else if visible.length === 0}
		<div class="state">
			<p class="empty-title">
				{period === 'upcoming' ? 'Nicio rezervare viitoare.' : 'Istoricul este gol.'}
			</p>
			<p>
				{period === 'upcoming'
					? 'Programați o sală sau un echipament pentru a-l vedea aici.'
					: 'Rezervările încheiate sau anulate vor apărea aici.'}
			</p>
			{#if period === 'upcoming'}
				<button type="button" class="link" onclick={() => openModal()}>Creați o rezervare</button>
			{/if}
		</div>
	{:else}
		<ul class="list">
			{#each visible as r (r.id)}
				{@const resource = resourceById.get(r.resourceId)}
				{@const start = new Date(r.startTime)}
				{@const status = statusOf(r)}
				{@const own = user?.id === r.userId}
				{@const cancellable = own && isUpcoming(r, now)}
				<li class="card" class:inactive={period === 'history'} class:fresh={freshId === r.id}>
					<time class="date-block" datetime={r.startTime}>
						<span class="weekday">{weekdayFmt.format(start)}</span>
						<span class="day-num">{start.getDate()}</span>
						<span class="month">{monthFmt.format(start)}</span>
					</time>

					<div class="card-main">
						<div class="badges">
							{#if resource}
								<span class="type-badge" data-type={resource.type}>{TYPE_LABELS[resource.type]}</span>
							{/if}
							<span class="pill" data-status={status.key}>{status.label}</span>
						</div>

						<h3 class="resource">{resource?.name ?? `Resursa #${r.resourceId}`}</h3>

						<dl class="meta">
							<div>
								<dt>Când</dt>
								<dd>
									<span class="full-date">{dateFmt.format(start)}</span>
									<span class="sep" aria-hidden="true">·</span>
									<span class="time">{timeRange(r)}</span>
								</dd>
							</div>
							<div>
								<dt>Rezervat de</dt>
								<dd>
									{userName(r.userId)}
									{#if own}<span class="you">Dvs.</span>{/if}
								</dd>
							</div>
						</dl>

						<p class="purpose">{r.purpose}</p>
					</div>

					{#if cancellable}
						<div class="actions">
							{#if confirmingId === r.id}
								<div class="confirm" role="group" aria-label="Confirmați anularea">
									<span class="confirm-text">Anulați această rezervare?</span>
									<div class="confirm-buttons">
										<button
											type="button"
											class="btn danger"
											disabled={cancellingId === r.id}
											onclick={() => cancelReservation(r)}
										>
											{cancellingId === r.id ? 'Se anulează…' : 'Da, anulează'}
										</button>
										<button
											type="button"
											class="btn ghost"
											disabled={cancellingId === r.id}
											onclick={() => (confirmingId = null)}
										>
											Păstrează
										</button>
									</div>
								</div>
							{:else}
								<button type="button" class="btn outline-danger" onclick={() => (confirmingId = r.id)}>
									Anulează
								</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if $connectionMode === 'demo' && reservations}
		<p class="demo-note">
			<span class="demo-mark" aria-hidden="true"></span>
			Serverul nu este disponibil — sunt afișate date demonstrative.
		</p>
	{/if}
</section>

<ReservationModal
	open={modalOpen}
	{resources}
	initialResourceId={presetResourceId}
	onclose={() => (modalOpen = false)}
	oncreated={onCreated}
/>

<!-- ---------- Toast ---------- -->
<div class="toast-region" role="status" aria-live="polite">
	{#if toast}
		{#key toast.id}
			<div class="toast" data-kind={toast.kind}>
				<span class="toast-mark" aria-hidden="true"></span>
				<p>{toast.message}</p>
				<button type="button" class="toast-close" aria-label="Închide notificarea" onclick={dismissToast}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</div>
		{/key}
	{/if}
</div>

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

	/* ---------- Intro ---------- */
	.intro {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.intro-text {
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

	/* ---------- Buttons ---------- */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		padding: 0.5rem 1.25rem;
		border: 1px solid var(--color-ink);
		font-size: 0.85rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		white-space: nowrap;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.primary {
		background-color: var(--color-ink);
		color: var(--color-canvas);
	}

	.primary:hover:not(:disabled) {
		background-color: var(--color-bordeaux);
		border-color: var(--color-bordeaux);
	}

	.new {
		align-self: flex-start;
		padding-inline: 1.5rem;
	}

	.new svg {
		width: 1rem;
		height: 1rem;
	}

	.ghost {
		border-color: var(--color-hairline);
		background-color: transparent;
		color: var(--color-ink);
	}

	.ghost:hover:not(:disabled) {
		border-color: var(--color-ink);
	}

	.danger {
		border-color: var(--color-bordeaux);
		background-color: var(--color-bordeaux);
		color: var(--color-canvas);
	}

	.danger:hover:not(:disabled) {
		background-color: color-mix(in srgb, var(--color-bordeaux) 85%, black);
	}

	.outline-danger {
		min-height: 2.25rem;
		padding-inline: 1rem;
		border-color: color-mix(in srgb, var(--color-bordeaux) 45%, transparent);
		background-color: transparent;
		color: var(--color-bordeaux);
	}

	.outline-danger:hover {
		border-color: var(--color-bordeaux);
		background-color: color-mix(in srgb, var(--color-bordeaux) 6%, transparent);
	}

	.link {
		margin-top: 1.25rem;
		padding: 0;
		border: 0;
		background: transparent;
		font-size: 0.85rem;
		color: var(--color-bordeaux);
		text-decoration: underline;
		text-decoration-color: var(--color-brass);
		text-underline-offset: 0.25em;
	}

	/* ---------- Toolbar ---------- */
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 3rem;
		padding: 1.25rem 1.25rem 1rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
	}

	.segmented {
		display: flex;
		border-bottom: 1px solid var(--color-hairline);
		overflow-x: auto;
		scrollbar-width: none;
	}

	.segment {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.25rem 0.875rem;
		margin-right: 1.75rem;
		border: 0;
		background: transparent;
		font-size: 0.9rem;
		letter-spacing: 0.02em;
		white-space: nowrap;
		color: var(--color-muted);
		transition: color 150ms ease;
	}

	.segment::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		bottom: -1px;
		height: 2px;
		background-color: var(--color-brass);
		transform: scaleX(0);
		transition: transform 250ms ease;
	}

	.segment:hover {
		color: var(--color-ink);
	}

	.segment[aria-pressed='true'] {
		font-weight: 500;
		color: var(--color-ink);
	}

	.segment[aria-pressed='true']::after {
		transform: scaleX(1);
	}

	.count {
		min-width: 1.5rem;
		padding: 0 0.375rem;
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		font-size: 0.7rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		text-align: center;
		color: var(--color-muted);
	}

	.segment[aria-pressed='true'] .count {
		border-color: var(--color-ink);
		background-color: var(--color-ink);
		color: var(--color-canvas);
	}

	.periods {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.period {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.25rem;
		padding: 0.25rem 0.875rem;
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		background-color: var(--color-canvas);
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		color: var(--color-muted);
		transition:
			border-color 150ms ease,
			background-color 150ms ease,
			color 150ms ease;
	}

	.period:hover {
		border-color: var(--color-brass);
		color: var(--color-ink);
	}

	.period[aria-pressed='true'] {
		border-color: var(--color-brass);
		background-color: color-mix(in srgb, var(--color-brass) 12%, var(--color-surface));
		color: var(--color-ink);
		font-weight: 500;
	}

	.period-count {
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-muted);
	}

	/* ---------- List ---------- */
	.results {
		margin-top: 2rem;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 1rem 1.25rem;
		padding: 1.25rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
		transition: border-color 150ms ease;
	}

	.card:hover {
		border-color: color-mix(in srgb, var(--color-brass) 55%, var(--color-hairline));
	}

	.card.fresh {
		animation: fresh 2.4s ease-out;
	}

	@keyframes fresh {
		0%,
		40% {
			border-color: var(--color-brass);
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-brass) 25%, transparent);
		}
	}

	.date-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		width: 3.75rem;
		padding-right: 1.25rem;
		border-right: 1px solid var(--color-hairline);
		text-align: center;
	}

	.weekday,
	.month {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.month {
		color: var(--color-brass);
	}

	.day-num {
		font-family: var(--font-serif);
		font-size: 2rem;
		font-weight: 600;
		line-height: 1.1;
		font-variant-numeric: lining-nums;
	}

	.card.inactive .day-num,
	.card.inactive .resource {
		color: var(--color-muted);
	}

	.card-main {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.badges {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.type-badge {
		padding: 0.1rem 0.5rem;
		background-color: var(--color-canvas);
		border: 1px solid var(--color-hairline);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--color-ink);
	}

	.type-badge[data-type='Equipment'] {
		color: var(--color-bordeaux);
	}

	.pill {
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

	.pill[data-status='Cancelled'] {
		color: var(--color-bordeaux);
	}

	.pill[data-status='Ended'] {
		color: var(--color-muted);
	}

	.resource {
		margin: 0.125rem 0 0;
		font-size: 1.3rem;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.meta {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.meta > div {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.625rem;
	}

	.meta dt {
		min-width: 5.5rem;
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.meta dd {
		margin: 0;
		font-size: 0.875rem;
	}

	.full-date::first-letter {
		text-transform: uppercase;
	}

	.sep {
		margin-inline: 0.25rem;
		color: var(--color-brass);
	}

	.time {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.you {
		margin-left: 0.375rem;
		padding: 0 0.375rem;
		border: 1px solid var(--color-brass);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #8a6a2f;
	}

	.purpose {
		margin: 0.25rem 0 0;
		padding-left: 0.75rem;
		border-left: 2px solid var(--color-hairline);
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 0.95rem;
		color: var(--color-muted);
		overflow-wrap: anywhere;
	}

	.actions {
		grid-column: 1 / -1;
		display: flex;
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid var(--color-hairline);
	}

	.confirm {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.625rem;
		width: 100%;
	}

	.confirm-text {
		font-size: 0.85rem;
		color: var(--color-bordeaux);
	}

	.confirm-buttons {
		display: flex;
		gap: 0.5rem;
	}

	.confirm-buttons .btn {
		min-height: 2.25rem;
		padding-inline: 1rem;
	}

	/* ---------- Skeleton ---------- */
	.skeleton .card-main {
		gap: 0.75rem;
		padding-block: 0.25rem;
	}

	.bone {
		display: block;
		height: 0.75rem;
		background-color: var(--color-canvas);
		animation: pulse 1.4s ease-in-out infinite;
	}

	.bone.short {
		width: 25%;
	}

	.bone.wide {
		width: 60%;
		height: 1.25rem;
	}

	.bone.tall {
		width: 100%;
		height: 3.5rem;
	}

	@keyframes pulse {
		50% {
			opacity: 0.45;
		}
	}

	/* ---------- States ---------- */
	.state {
		margin: 0;
		padding: 3rem 1.5rem;
		border: 1px dashed var(--color-hairline);
		text-align: center;
		color: var(--color-muted);
	}

	.state p {
		margin: 0.5rem 0 0;
		font-size: 0.9rem;
	}

	.state .empty-title {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.35rem;
		color: var(--color-ink);
	}

	.state.error {
		color: var(--color-bordeaux);
	}

	.demo-note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1.5rem 0 0;
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		color: var(--color-muted);
	}

	.demo-mark {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 9999px;
		background-color: var(--color-brass);
	}

	/* ---------- Toast ---------- */
	.toast-region {
		position: fixed;
		inset-inline: 1rem;
		bottom: calc(1rem + env(safe-area-inset-bottom));
		z-index: 50;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: min(100%, 26rem);
		padding: 0.75rem 0.75rem 0.75rem 1rem;
		border: 1px solid var(--color-hairline);
		border-left: 3px solid var(--color-forest);
		background-color: var(--color-surface);
		box-shadow: 0 18px 40px -24px rgb(19 34 56 / 0.45);
		animation: toast-in 260ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	.toast[data-kind='error'] {
		border-left-color: var(--color-bordeaux);
	}

	.toast p {
		flex: 1;
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.45;
	}

	.toast-mark {
		flex-shrink: 0;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 9999px;
		background-color: var(--color-forest);
	}

	.toast[data-kind='error'] .toast-mark {
		background-color: var(--color-bordeaux);
	}

	.toast-close {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-muted);
	}

	.toast-close:hover {
		color: var(--color-ink);
	}

	.toast-close svg {
		width: 1rem;
		height: 1rem;
	}

	@keyframes toast-in {
		from {
			transform: translateY(0.75rem);
			opacity: 0;
		}
	}

	/* ---------- Breakpoints ---------- */
	@media (min-width: 640px) {
		.intro {
			flex-direction: row;
			align-items: flex-end;
			justify-content: space-between;
		}

		.new {
			align-self: flex-end;
			flex-shrink: 0;
		}

		.title {
			font-size: 3rem;
			line-height: 1;
		}

		.toolbar {
			flex-direction: row;
			align-items: flex-end;
			justify-content: space-between;
			padding: 1.25rem 1.75rem 0;
		}

		.segmented {
			border-bottom: 0;
		}

		.periods {
			padding-bottom: 0.75rem;
		}

		.card {
			grid-template-columns: auto minmax(0, 1fr) auto;
			padding: 1.5rem 1.75rem;
		}

		.actions {
			grid-column: auto;
			align-items: flex-start;
			padding-top: 0;
			border-top: 0;
		}

		.confirm {
			width: auto;
		}

		.toast-region {
			inset-inline: auto 1.5rem;
			bottom: 1.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bone,
		.toast,
		.card.fresh {
			animation: none;
		}

		.segment::after {
			transition: none;
		}
	}
</style>
