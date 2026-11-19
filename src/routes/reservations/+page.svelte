<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { reservationService } from '#lib/api/reservationService.ts';
	import { resourceService } from '#lib/api/resourceService.ts';
	import { userService } from '#lib/api/userService.ts';
	import { authStore, connectionMode } from '#lib/stores/authStore.ts';
	import { openBookingDrawer } from '#lib/stores/bookingStore.ts';
	import {
		lastCreatedReservation,
		loadReservations,
		reservationsStore
	} from '#lib/stores/reservationStore.ts';
	import type { ReservationDTO, ResourceDTO, UserDTO } from '#lib/types/index.ts';
	import { isUpcoming, STATUS_LABELS, toDateInput } from '#lib/utils/reservation.ts';
	import { TYPE_LABELS } from '#lib/utils/resource.ts';

	type Scope = 'mine' | 'all';
	type StatusFilter = 'any' | 'active' | 'cancelled';
	type ToastKind = 'success' | 'error';

	const SCOPES: { value: Scope; label: string }[] = [
		{ value: 'mine', label: 'Rezervările Mele' },
		{ value: 'all', label: 'Toate Rezervările' }
	];

	const STATUSES: { value: Exclude<StatusFilter, 'any'>; label: string }[] = [
		{ value: 'active', label: 'Active' },
		{ value: 'cancelled', label: 'Anulate' }
	];

	const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
	const DAY_MS = 86_400_000;

	const weekdayFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'short' });
	const monthFmt = new Intl.DateTimeFormat('ro-RO', { month: 'short' });
	const longDateFmt = new Intl.DateTimeFormat('ro-RO', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
	const timeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });
	const shortDateFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

	// ---------- Data ----------
	let resources = $state<ResourceDTO[]>([]);
	let users = $state<UserDTO[]>([]);
	let error = $state<string | null>(null);
	let now = $state(Date.now());

	const reservations = $derived($reservationsStore);
	const user = $derived($authStore.currentUser);
	const resourceById = $derived(new Map(resources.map((r) => [r.id, r])));
	const userById = $derived(new Map(users.map((u) => [u.id, u])));

	// ---------- Date navigation ----------
	const todayKey = $derived(toDateInput(new Date(now)));
	let selectedDate = $state(toDateInput(new Date()));
	let urlReady = $state(false);

	/** Local midnight of a `YYYY-MM-DD` key. */
	function parseDay(key: string): Date {
		const [y, m, d] = key.split('-').map(Number);
		return new Date(y, m - 1, d);
	}

	function shiftDay(key: string, days: number): string {
		const d = parseDay(key);
		d.setDate(d.getDate() + days);
		return toDateInput(d);
	}

	function setDate(key: string) {
		selectedDate = DATE_PATTERN.test(key) ? key : todayKey;
	}

	const selectedDay = $derived(parseDay(selectedDate));
	const dayStart = $derived(selectedDay.getTime());
	const dayEnd = $derived(parseDay(shiftDay(selectedDate, 1)).getTime());
	const isPastDay = $derived(selectedDate < todayKey);

	/** Monday-first week containing the selected day. */
	const week = $derived.by(() => {
		const offset = (selectedDay.getDay() + 6) % 7;
		const monday = shiftDay(selectedDate, -offset);
		return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
	});

	// ---------- Filters ----------
	let scope = $state<Scope>(get(authStore).currentUser ? 'mine' : 'all');
	let statusFilter = $state<StatusFilter>('active');

	function toggleStatus(value: Exclude<StatusFilter, 'any'>) {
		statusFilter = statusFilter === value ? 'any' : value;
	}

	const inScope = $derived.by<ReservationDTO[]>(() => {
		if (!reservations) return [];
		if (scope === 'all') return reservations;
		return user ? reservations.filter((r) => r.userId === user.id) : [];
	});

	function matchesStatus(r: ReservationDTO, filter: StatusFilter): boolean {
		if (filter === 'active') return r.status !== 'Cancelled';
		if (filter === 'cancelled') return r.status === 'Cancelled';
		return true;
	}

	function onDay(r: ReservationDTO, start: number, end: number): boolean {
		return Date.parse(r.startTime) < end && Date.parse(r.endTime) > start;
	}

	const filtered = $derived(inScope.filter((r) => matchesStatus(r, statusFilter)));

	const visible = $derived(
		filtered
			.filter((r) => onDay(r, dayStart, dayEnd))
			.toSorted((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
	);

	const weekCounts = $derived(
		week.map((key) => {
			const start = parseDay(key).getTime();
			return filtered.filter((r) => onDay(r, start, start + DAY_MS)).length;
		})
	);

	/** Per-pill counts for the selected day. */
	const scopeCounts = $derived.by<Record<Scope, number>>(() => {
		const day = (reservations ?? []).filter(
			(r) => matchesStatus(r, statusFilter) && onDay(r, dayStart, dayEnd)
		);
		return {
			mine: user ? day.filter((r) => r.userId === user.id).length : 0,
			all: day.length
		};
	});

	const statusCounts = $derived.by<Record<Exclude<StatusFilter, 'any'>, number>>(() => {
		const day = inScope.filter((r) => onDay(r, dayStart, dayEnd));
		return {
			active: day.filter((r) => r.status !== 'Cancelled').length,
			cancelled: day.filter((r) => r.status === 'Cancelled').length
		};
	});

	const bookedMinutes = $derived(
		visible
			.filter((r) => r.status !== 'Cancelled')
			.reduce(
				(sum, r) =>
					sum +
					(Math.min(Date.parse(r.endTime), dayEnd) - Math.max(Date.parse(r.startTime), dayStart)) /
						60_000,
				0
			)
	);

	// ---------- URL sync (`?date=YYYY-MM-DD`) ----------
	$effect(() => {
		const date = selectedDate;
		if (!urlReady) return;
		untrack(() => {
			const url = new URL(page.url.href);
			if (date === todayKey) url.searchParams.delete('date');
			else url.searchParams.set('date', date);
			url.searchParams.delete('resourceId');
			if (url.href !== page.url.href) goto(url, { replace: true, shallow: true });
		});
	});

	// ---------- New bookings from the global drawer ----------
	let freshId = $state<number | null>(null);
	// Ignore whatever was booked before this page was opened.
	let seenCreatedId = get(lastCreatedReservation)?.id ?? null;

	$effect(() => {
		const created = $lastCreatedReservation;
		if (!created || created.id === seenCreatedId) return;
		untrack(() => {
			seenCreatedId = created.id;
			freshId = created.id;
			if (statusFilter === 'cancelled') statusFilter = 'active';
			if (scope === 'mine' && user && created.userId !== user.id) scope = 'all';
			setDate(toDateInput(new Date(created.startTime)));
		});
	});

	function newBooking() {
		openBookingDrawer(null, isPastDay ? todayKey : selectedDate);
	}

	// ---------- Cancellation (inline confirmation) ----------
	let confirmingId = $state<number | null>(null);
	let cancellingId = $state<number | null>(null);

	async function cancelReservation(r: ReservationDTO) {
		cancellingId = r.id;
		try {
			const updated = await reservationService.cancel(r.id);
			reservationsStore.update((rows) =>
				(rows ?? []).map((x) =>
					x.id === r.id ? (updated ?? { ...x, status: 'Cancelled' as const }) : x
				)
			);
			confirmingId = null;
			showToast('success', 'Rezervarea a fost anulată.');
		} catch (e) {
			showToast(
				'error',
				e instanceof ApiError ? e.message : 'Rezervarea nu a putut fi anulată. Încercați din nou.'
			);
		} finally {
			cancellingId = null;
		}
	}

	function onConfirmKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && cancellingId === null) {
			event.stopPropagation();
			confirmingId = null;
		}
	}

	/** Attachment: move focus into the confirmation strip when it appears. */
	function autofocus(node: HTMLElement) {
		node.focus();
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

	function formatMinutes(total: number): string {
		const minutes = Math.round(total);
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h === 0) return `${m} min`;
		return m === 0 ? `${h} h` : `${h} h ${m} min`;
	}

	function durationOf(r: ReservationDTO): string {
		return formatMinutes((Date.parse(r.endTime) - Date.parse(r.startTime)) / 60_000);
	}

	function userName(id: number): string {
		if (user?.id === id) return user.name;
		return userById.get(id)?.name ?? `Utilizator #${id}`;
	}

	function statusOf(r: ReservationDTO): { key: string; label: string } {
		if (r.status === 'Cancelled') return { key: 'Cancelled', label: STATUS_LABELS.Cancelled };
		const start = Date.parse(r.startTime);
		const end = Date.parse(r.endTime);
		if (end <= now) return { key: 'Ended', label: 'Încheiată' };
		if (start <= now) return { key: 'Live', label: 'În desfășurare' };
		return { key: r.status, label: STATUS_LABELS[r.status] };
	}

	function countLabel(n: number): string {
		if (n === 1) return '1 rezervare';
		return `${n} ${n >= 20 && (n % 100 === 0 || n % 100 >= 20) ? 'de ' : ''}rezervări`;
	}

	// ---------- Load ----------
	onMount(() => {
		const params = page.url.searchParams;
		const requestedDate = params.get('date');
		if (requestedDate && DATE_PATTERN.test(requestedDate)) selectedDate = requestedDate;
		const requestedResource = params.get('resourceId');

		(async () => {
			try {
				const [res, , us] = await Promise.all([
					resourceService.getAll(),
					loadReservations(true),
					// The user list may be restricted to admins; names fall back gracefully.
					userService.getAll().catch(() => [] as UserDTO[])
				]);
				resources = res;
				users = us;

				// `/reservations?resourceId=<id>` (from the catalogue) opens the drawer pre-filled.
				if (requestedResource !== null) {
					const id = Number(requestedResource);
					if (res.some((r) => r.id === id)) openBookingDrawer(id, isPastDay ? todayKey : selectedDate);
					else showToast('error', 'Resursa solicitată nu a fost găsită în catalog.');
				}
			} catch (e) {
				error = e instanceof ApiError ? e.message : 'Rezervările nu au putut fi încărcate.';
			} finally {
				urlReady = true;
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
		<h1 class="title">Rezervări &amp; <em>Program</em></h1>
		<div class="rule" aria-hidden="true"></div>
		<p class="lead">
			Parcurgeți programul zi cu zi, urmăriți rezervările dumneavoastră și anulați-le la nevoie —
			totul dintr-un singur registru.
		</p>
	</div>
	<button type="button" class="btn primary" onclick={newBooking}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
			<path d="M12 5v14M5 12h14" />
		</svg>
		Rezervare Nouă
	</button>
</section>

<!-- ---------- Navigator & filters ---------- -->
<section class="console" aria-label="Navigare și filtre">
	<div class="navigator">
		<button type="button" class="nav-step" onclick={() => setDate(shiftDay(selectedDate, -1))}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M15 6l-6 6 6 6" />
			</svg>
			<span>Ziua anterioară</span>
		</button>

		<div class="picker">
			<label class="visually-hidden" for="day-picker">Alegeți ziua</label>
			<input
				id="day-picker"
				type="date"
				value={selectedDate}
				onchange={(e) => setDate(e.currentTarget.value)}
			/>
			{#if selectedDate !== todayKey}
				<button type="button" class="today-btn" onclick={() => setDate(todayKey)}>Astăzi</button>
			{/if}
		</div>

		<button type="button" class="nav-step next" onclick={() => setDate(shiftDay(selectedDate, 1))}>
			<span>Ziua următoare</span>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M9 6l6 6-6 6" />
			</svg>
		</button>
	</div>

	<ol class="week" aria-label="Săptămâna selectată">
		{#each week as key, i (key)}
			{@const d = parseDay(key)}
			<li>
				<button
					type="button"
					class="week-day"
					class:today={key === todayKey}
					class:past={key < todayKey}
					aria-pressed={key === selectedDate}
					aria-label="{longDateFmt.format(d)}, {countLabel(weekCounts[i])}"
					onclick={() => setDate(key)}
				>
					<span class="wd">{weekdayFmt.format(d)}</span>
					<span class="wn">{d.getDate()}</span>
					<span class="wdots" aria-hidden="true">
						{#each { length: Math.min(weekCounts[i], 4) }, j (j)}<i></i>{/each}
					</span>
				</button>
			</li>
		{/each}
	</ol>

	<div class="pills" role="group" aria-label="Filtre rezervări">
		{#each SCOPES as s (s.value)}
			<button
				type="button"
				class="pill"
				aria-pressed={scope === s.value}
				onclick={() => (scope = s.value)}
			>
				{s.label}
				<span class="pill-count">{reservations ? scopeCounts[s.value] : '–'}</span>
			</button>
		{/each}
		<span class="pill-divider" aria-hidden="true"></span>
		{#each STATUSES as s (s.value)}
			<button
				type="button"
				class="pill"
				data-tone={s.value}
				aria-pressed={statusFilter === s.value}
				onclick={() => toggleStatus(s.value)}
			>
				{s.label}
				<span class="pill-count">{reservations ? statusCounts[s.value] : '–'}</span>
			</button>
		{/each}
	</div>
</section>

<!-- ---------- Day ---------- -->
<section class="day" aria-labelledby="day-heading" aria-busy={reservations === null && !error}>
	<header class="day-head">
		<div>
			<p class="day-eyebrow">
				{#if selectedDate === todayKey}Astăzi{:else if selectedDate === shiftDay(todayKey, 1)}Mâine{:else if selectedDate === shiftDay(todayKey, -1)}Ieri{:else}Ziua selectată{/if}
			</p>
			<h2 id="day-heading" class="day-title">{longDateFmt.format(selectedDay)}</h2>
		</div>
		{#if reservations}
			<p class="day-summary">
				<span>{countLabel(visible.length)}</span>
				{#if bookedMinutes > 0}
					<span class="dot-sep" aria-hidden="true">·</span>
					<span>{formatMinutes(bookedMinutes)} rezervate</span>
				{/if}
			</p>
		{/if}
	</header>

	{#if error}
		<p class="state error" role="alert">{error}</p>
	{:else if reservations === null}
		<ul class="list">
			{#each { length: 3 }, i (i)}
				<li class="card skeleton" aria-hidden="true">
					<span class="badge"><span class="bone tall"></span></span>
					<span class="main">
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
				{statusFilter === 'cancelled' ? 'Nicio rezervare anulată în această zi.' : 'Nicio rezervare în această zi.'}
			</p>
			<p>
				{#if isPastDay}
					Ziua a trecut — folosiți navigatorul pentru a consulta alte zile.
				{:else}
					Spațiile sunt libere — programați o sală sau un echipament.
				{/if}
			</p>
			{#if !isPastDay && statusFilter !== 'cancelled'}
				<button type="button" class="link" onclick={newBooking}>Rezervați pentru această zi</button>
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
				<li
					class="card"
					data-status={status.key}
					class:fresh={freshId === r.id}
					class:confirming={confirmingId === r.id}
				>
					<time class="badge" datetime={r.startTime}>
						<span class="b-weekday">{weekdayFmt.format(start)}</span>
						<span class="b-day">{start.getDate()}</span>
						<span class="b-month">{monthFmt.format(start)}</span>
					</time>

					<div class="main">
						<p class="interval">
							<span class="time">{timeRange(r)}</span>
							<span class="duration">{durationOf(r)}</span>
						</p>
						<h3 class="resource">{resource?.name ?? `Resursa #${r.resourceId}`}</h3>
						<p class="facts">
							{#if resource}
								<span class="kind" data-type={resource.type}>{TYPE_LABELS[resource.type]}</span>
								{#if resource.location}<span class="loc">{resource.location}</span>{/if}
							{/if}
							<span class="owner">
								{userName(r.userId)}{#if own}<span class="you">Dvs.</span>{/if}
							</span>
						</p>
						{#if r.purpose}<p class="purpose">{r.purpose}</p>{/if}
					</div>

					<div class="side">
						<span class="status" data-status={status.key}>{status.label}</span>
						{#if cancellable && confirmingId !== r.id}
							<button type="button" class="cancel-link" onclick={() => (confirmingId = r.id)}>
								Anulează rezervarea
							</button>
						{/if}
					</div>

					{#if cancellable && confirmingId === r.id}
						<div class="confirm" role="group" aria-label="Confirmați anularea">
							<p class="confirm-text">
								<strong>Anulați rezervarea?</strong>
								{resource?.name ?? 'Resursa'}, {timeRange(r)} va fi eliberată pentru alți utilizatori.
							</p>
							<div class="confirm-actions">
								<button
									type="button"
									class="btn ghost small"
									disabled={cancellingId === r.id}
									onclick={() => (confirmingId = null)}
									onkeydown={onConfirmKeydown}
									{@attach autofocus}
								>
									Păstrează
								</button>
								<button
									type="button"
									class="btn danger small"
									disabled={cancellingId === r.id}
									onclick={() => cancelReservation(r)}
									onkeydown={onConfirmKeydown}
								>
									{cancellingId === r.id ? 'Se anulează…' : 'Da, anulează'}
								</button>
							</div>
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
		max-width: 44rem;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--border-gold);
	}

	.title {
		margin: 1rem 0 0;
		font-size: 2.5rem;
		line-height: 1.05;
	}

	.title em {
		font-weight: 500;
		color: var(--accent-bordeaux);
	}

	.rule {
		width: 4rem;
		height: 1px;
		margin-top: 1.5rem;
		background-color: var(--border-gold);
	}

	.lead {
		margin: 1.5rem 0 0;
		font-size: 1.05rem;
		line-height: 1.65;
		color: var(--ink-secondary);
	}

	/* ---------- Buttons ---------- */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 3rem;
		padding: 0.625rem 1.5rem;
		border: 1px solid var(--ink-primary);
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		white-space: nowrap;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.btn svg {
		width: 1rem;
		height: 1rem;
	}

	.btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.btn.small {
		min-height: 2.25rem;
		padding: 0.375rem 1rem;
		font-size: 0.7rem;
	}

	.primary {
		align-self: flex-start;
		background-color: var(--ink-primary);
		color: var(--bg-canvas);
	}

	.primary:hover:not(:disabled) {
		background-color: var(--accent-bordeaux);
		border-color: var(--accent-bordeaux);
	}

	.ghost {
		border-color: var(--border-hairline);
		background-color: var(--bg-surface);
		color: var(--ink-primary);
	}

	.ghost:hover:not(:disabled) {
		border-color: var(--ink-primary);
	}

	.danger {
		border-color: var(--accent-bordeaux);
		background-color: var(--accent-bordeaux);
		color: var(--bg-canvas);
	}

	.danger:hover:not(:disabled) {
		background-color: color-mix(in srgb, var(--accent-bordeaux) 82%, black);
	}

	.link {
		margin-top: 1.25rem;
		padding: 0;
		border: 0;
		background: transparent;
		font-size: 0.85rem;
		color: var(--accent-bordeaux);
		text-decoration: underline;
		text-decoration-color: var(--border-gold);
		text-underline-offset: 0.25em;
	}

	/* ---------- Console (navigator + filters) ---------- */
	.console {
		margin-top: 3rem;
		border: 1px solid var(--border-hairline);
		border-top: 2px solid var(--ink-primary);
		background-color: var(--bg-surface);
	}

	.navigator {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: stretch;
		border-bottom: 1px solid var(--border-hairline);
	}

	.nav-step {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 3.5rem;
		padding: 0 1rem;
		border: 0;
		background: transparent;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-primary);
		transition:
			background-color 150ms ease,
			color 150ms ease;
	}

	.nav-step span {
		display: none;
	}

	.nav-step svg {
		width: 1.15rem;
		height: 1.15rem;
		color: var(--border-gold);
		transition: transform 150ms ease;
	}

	.nav-step:hover {
		background-color: var(--bg-subtle);
		color: var(--accent-bordeaux);
	}

	.nav-step:hover svg {
		transform: translateX(-2px);
	}

	.nav-step.next:hover svg {
		transform: translateX(2px);
	}

	.nav-step:first-child {
		border-right: 1px solid var(--border-hairline);
	}

	.nav-step.next {
		border-left: 1px solid var(--border-hairline);
	}

	.picker {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		padding: 0.5rem;
	}

	.picker input {
		min-height: 2.5rem;
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-canvas);
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 600;
		font-variant-numeric: lining-nums tabular-nums;
		color: var(--ink-primary);
		box-shadow: none;
		cursor: pointer;
	}

	.picker input:focus {
		border-color: var(--border-gold);
		outline: none;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--border-gold) 22%, transparent);
	}

	.today-btn {
		min-height: 2rem;
		padding: 0 0.75rem;
		border: 1px solid var(--border-gold);
		border-radius: 9999px;
		background: transparent;
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-primary);
		transition: background-color 150ms ease;
	}

	.today-btn:hover {
		background-color: color-mix(in srgb, var(--border-gold) 14%, var(--bg-surface));
	}

	/* Week ribbon */
	.week {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		border-bottom: 1px solid var(--border-hairline);
	}

	.week li + li {
		border-left: 1px solid var(--border-hairline);
	}

	.week-day {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		width: 100%;
		padding: 0.625rem 0 0.5rem;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--ink-primary);
		transition: background-color 150ms ease;
	}

	.week-day:hover {
		background-color: var(--bg-subtle);
	}

	.week-day.past {
		color: var(--ink-secondary);
	}

	.week-day::after {
		content: '';
		position: absolute;
		inset: auto 0 -1px;
		height: 2px;
		background-color: var(--border-gold);
		transform: scaleX(0);
		transition: transform 220ms ease;
	}

	.week-day[aria-pressed='true'] {
		background-color: color-mix(in srgb, var(--border-gold) 9%, var(--bg-surface));
	}

	.week-day[aria-pressed='true']::after {
		transform: scaleX(1);
	}

	.wd {
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-secondary);
	}

	.wn {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 600;
		line-height: 1.1;
		font-variant-numeric: lining-nums;
	}

	.week-day.today .wn {
		color: var(--accent-bordeaux);
	}

	.week-day.today .wd::after {
		content: ' ·';
		color: var(--accent-bordeaux);
	}

	.wdots {
		display: flex;
		gap: 3px;
		height: 4px;
	}

	.wdots i {
		width: 4px;
		height: 4px;
		border-radius: 9999px;
		background-color: var(--border-gold);
	}

	/* Filter pills */
	.pills {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.25rem;
		padding: 0.25rem 0.875rem;
		border: 1px solid var(--border-hairline);
		border-radius: 9999px;
		background-color: var(--bg-surface);
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		color: var(--ink-secondary);
		transition:
			border-color 150ms ease,
			background-color 150ms ease,
			color 150ms ease;
	}

	.pill:hover {
		border-color: var(--border-gold);
		color: var(--ink-primary);
	}

	.pill[aria-pressed='true'] {
		border-color: var(--ink-primary);
		background-color: var(--ink-primary);
		font-weight: 500;
		color: var(--bg-canvas);
	}

	.pill[data-tone][aria-pressed='true'] {
		border-color: var(--border-gold);
		background-color: color-mix(in srgb, var(--border-gold) 14%, var(--bg-surface));
		color: var(--ink-primary);
	}

	.pill[data-tone='cancelled'][aria-pressed='true'] {
		border-color: var(--accent-bordeaux);
		background-color: color-mix(in srgb, var(--accent-bordeaux) 8%, var(--bg-surface));
		color: var(--accent-bordeaux);
	}

	.pill-count {
		min-width: 1.25rem;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		text-align: center;
		opacity: 0.75;
	}

	.pill-divider {
		width: 1px;
		height: 1.25rem;
		margin-inline: 0.375rem;
		background-color: var(--border-hairline);
	}

	/* ---------- Day ---------- */
	.day {
		margin-top: 2.5rem;
	}

	.day-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.5rem 1.5rem;
		padding-bottom: 1rem;
		margin-bottom: 1.25rem;
		border-bottom: 1px solid var(--border-hairline);
	}

	.day-eyebrow {
		margin: 0;
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--border-gold);
	}

	.day-title {
		margin: 0.375rem 0 0;
		font-size: 1.75rem;
	}

	.day-title::first-letter {
		text-transform: uppercase;
	}

	.day-summary {
		margin: 0;
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink-secondary);
	}

	.dot-sep {
		margin-inline: 0.375rem;
		color: var(--border-gold);
	}

	/* ---------- Cards ---------- */
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.card {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 1rem 1.25rem;
		padding: 1.25rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-surface);
		transition:
			border-color 200ms ease,
			box-shadow 200ms ease;
	}

	.card::before {
		content: '';
		position: absolute;
		inset: -1px auto -1px -1px;
		width: 2px;
		background-color: var(--border-gold);
		transform: scaleY(0);
		transform-origin: top;
		transition: transform 280ms ease;
	}

	.card:hover {
		border-color: color-mix(in srgb, var(--border-gold) 55%, var(--border-hairline));
		box-shadow: 0 24px 44px -36px rgb(11 25 44 / 0.5);
	}

	.card:hover::before,
	.card.confirming::before {
		transform: scaleY(1);
	}

	.card.confirming::before {
		background-color: var(--accent-bordeaux);
	}

	.card[data-status='Cancelled'] {
		background-color: color-mix(in srgb, var(--bg-subtle) 55%, var(--bg-surface));
	}

	.card[data-status='Cancelled'] .resource,
	.card[data-status='Cancelled'] .time {
		color: var(--ink-secondary);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--accent-bordeaux) 55%, transparent);
		text-decoration-thickness: 1px;
	}

	.card[data-status='Ended'] .resource,
	.card[data-status='Ended'] .b-day {
		color: var(--ink-secondary);
	}

	.card.fresh {
		animation: fresh 2.4s ease-out;
	}

	@keyframes fresh {
		0%,
		40% {
			border-color: var(--border-gold);
			box-shadow: 0 0 0 3px color-mix(in srgb, var(--border-gold) 25%, transparent);
		}
	}

	.badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		align-self: start;
		width: 4rem;
		padding: 0.5rem 0 0.625rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-canvas);
		text-align: center;
	}

	.b-weekday,
	.b-month {
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-secondary);
	}

	.b-month {
		color: var(--border-gold);
	}

	.b-day {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 600;
		line-height: 1.05;
		font-variant-numeric: lining-nums;
		color: var(--ink-primary);
	}

	.main {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.interval {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.75rem;
		margin: 0;
	}

	.time {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.1;
		font-variant-numeric: lining-nums tabular-nums;
		color: var(--ink-primary);
	}

	.duration {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--border-gold);
	}

	.resource {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.35;
		letter-spacing: 0;
		overflow-wrap: anywhere;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem 0.75rem;
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-secondary);
	}

	.kind {
		padding: 0.05rem 0.45rem;
		border: 1px solid var(--border-gold);
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-primary);
	}

	.kind[data-type='Equipment'] {
		border-color: color-mix(in srgb, var(--accent-bordeaux) 45%, transparent);
		color: var(--accent-bordeaux);
	}

	.loc::before,
	.owner::before {
		content: '·';
		margin-right: 0.75rem;
		color: var(--border-gold);
	}

	.facts > :first-child::before {
		content: none;
	}

	.you {
		margin-left: 0.375rem;
		padding: 0 0.375rem;
		border: 1px solid var(--border-gold);
		font-size: 0.56rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		vertical-align: 0.1em;
		color: #7a5c22;
	}

	.purpose {
		margin: 0.25rem 0 0;
		padding-left: 0.75rem;
		border-left: 1px solid var(--border-gold);
		font-family: var(--font-display);
		font-size: 1.02rem;
		font-style: italic;
		line-height: 1.4;
		color: var(--ink-secondary);
		overflow-wrap: anywhere;
	}

	.side {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding-top: 0.875rem;
		border-top: 1px solid var(--border-hairline);
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
	}

	.status[data-status='Ended'] {
		background-color: var(--bg-subtle);
		color: var(--ink-secondary);
	}

	.status[data-status='Cancelled'] {
		background-color: color-mix(in srgb, var(--accent-bordeaux) 8%, var(--bg-surface));
		color: var(--accent-bordeaux);
	}

	.cancel-link {
		padding: 0.25rem 0;
		border: 0;
		border-bottom: 1px solid color-mix(in srgb, var(--accent-bordeaux) 35%, transparent);
		border-radius: 0;
		background: transparent;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--accent-bordeaux);
		transition: border-color 150ms ease;
	}

	.cancel-link:hover {
		border-bottom-color: var(--accent-bordeaux);
	}

	/* Inline confirmation strip */
	.confirm {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		margin: 0 -1.25rem -1.25rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid color-mix(in srgb, var(--accent-bordeaux) 25%, var(--border-hairline));
		background-color: color-mix(in srgb, var(--accent-bordeaux) 5%, var(--bg-surface));
		animation: reveal 220ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	.confirm-text {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--ink-secondary);
	}

	.confirm-text strong {
		display: block;
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--accent-bordeaux);
	}

	.confirm-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	@keyframes reveal {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	/* ---------- Skeleton ---------- */
	.skeleton .main {
		gap: 0.75rem;
		padding-block: 0.25rem;
	}

	.bone {
		display: block;
		height: 0.75rem;
		width: 45%;
		background-color: var(--bg-subtle);
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

	.skeleton .badge {
		padding: 0;
		border: 0;
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
		border: 1px dashed var(--border-hairline);
		background-color: var(--bg-surface);
		text-align: center;
		color: var(--ink-secondary);
	}

	.state p {
		margin: 0.5rem 0 0;
		font-size: 0.9rem;
	}

	.state .empty-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		color: var(--ink-primary);
	}

	.state.error {
		border-style: solid;
		border-left: 3px solid var(--accent-bordeaux);
		padding: 1rem 1.25rem;
		text-align: left;
		color: var(--accent-bordeaux);
	}

	.demo-note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1.5rem 0 0;
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		color: var(--ink-secondary);
	}

	.demo-mark {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 9999px;
		background-color: var(--border-gold);
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
		border: 1px solid var(--border-hairline);
		border-left: 3px solid var(--accent-emerald);
		background-color: var(--bg-surface);
		box-shadow: 0 18px 40px -24px rgb(11 25 44 / 0.45);
		animation: toast-in 260ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	.toast[data-kind='error'] {
		border-left-color: var(--accent-bordeaux);
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
		background-color: var(--accent-emerald);
	}

	.toast[data-kind='error'] .toast-mark {
		background-color: var(--accent-bordeaux);
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
		color: var(--ink-secondary);
	}

	.toast-close:hover {
		color: var(--ink-primary);
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

		.primary {
			align-self: flex-end;
			flex-shrink: 0;
		}

		.title {
			font-size: 3.25rem;
		}

		.nav-step {
			padding: 0 1.5rem;
		}

		.nav-step span {
			display: inline;
		}

		.pills {
			padding: 1rem 1.25rem;
		}

		.card {
			grid-template-columns: auto minmax(0, 1fr) auto;
			padding: 1.5rem 1.75rem;
		}

		.side {
			grid-column: auto;
			flex-direction: column;
			align-items: flex-end;
			justify-content: space-between;
			padding-top: 0;
			border-top: 0;
		}

		.confirm {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			margin: 0 -1.75rem -1.5rem;
			padding: 1rem 1.75rem;
		}

		.confirm-actions {
			flex-shrink: 0;
		}

		.toast-region {
			inset-inline: auto 1.5rem;
			bottom: 1.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bone,
		.toast,
		.card.fresh,
		.confirm {
			animation: none;
		}

		.card::before,
		.week-day::after {
			transition: none;
		}
	}
</style>
