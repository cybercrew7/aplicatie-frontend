<script lang="ts">
	import { ApiError } from '#lib/api/httpClient.ts';
	import { reservationService } from '#lib/api/reservationService.ts';
	import type { ReservationDTO, ReservationStatus, ResourceDTO } from '#lib/types/index.ts';
	import { availabilityLabel, bookingHref, seatsLabel, TYPE_LABELS } from '#lib/utils/resource.ts';

	interface Props {
		/** The resource to show; `null` keeps the drawer closed. */
		resource: ResourceDTO | null;
		onclose: () => void;
	}

	let { resource, onclose }: Props = $props();

	type Interval = { start: number; end: number };
	type Booking = ReservationDTO & Interval;

	const HOUR = 3_600_000;
	const DEFAULT_OPEN_HOUR = 8;
	const DEFAULT_CLOSE_HOUR = 20;
	const MIN_FREE_GAP = 30 * 60_000;

	const STATUS_LABELS: Record<ReservationStatus, string> = {
		Confirmed: 'Confirmată',
		Pending: 'În așteptare',
		Cancelled: 'Anulată'
	};

	const timeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });
	const dayFmt = new Intl.DateTimeFormat('ro-RO', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});

	const titleId = $props.id();

	let dialog: HTMLDialogElement | undefined = $state();
	let bookings = $state<Booking[] | null>(null);
	let scheduleError = $state<string | null>(null);
	let now = $state(Date.now());

	// ---------- Open / close the native dialog ----------
	$effect(() => {
		if (!dialog) return;
		if (resource && !dialog.open) dialog.showModal();
		else if (!resource && dialog.open) dialog.close();
	});

	// ---------- Load today's reservations for the selected resource ----------
	$effect(() => {
		const id = resource?.id;
		bookings = null;
		scheduleError = null;
		if (id === undefined) return;

		let stale = false;
		const { start: dayStart, end: dayEnd } = today();

		reservationService
			.getByResource(id)
			.then((rows) => {
				if (stale) return;
				bookings = rows
					.filter((r) => r.status !== 'Cancelled')
					.map((r) => ({ ...r, start: Date.parse(r.startTime), end: Date.parse(r.endTime) }))
					.filter((r) => r.start < dayEnd && r.end > dayStart)
					.map((r) => ({ ...r, start: Math.max(r.start, dayStart), end: Math.min(r.end, dayEnd) }))
					.sort((a, b) => a.start - b.start);
			})
			.catch((e: unknown) => {
				if (stale) return;
				scheduleError =
					e instanceof ApiError ? e.message : 'Programul nu a putut fi încărcat.';
			});

		return () => {
			stale = true;
		};
	});

	// Keep the "now" marker fresh while the drawer is open.
	$effect(() => {
		if (!resource) return;
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(timer);
	});

	function today(): Interval {
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		return { start: start.getTime(), end: end.getTime() };
	}

	/** Visible window: 08:00–20:00, stretched to whole hours around any booking outside it. */
	const timeline = $derived.by<Interval>(() => {
		const { start: dayStart } = today();
		let start = dayStart + DEFAULT_OPEN_HOUR * HOUR;
		let end = dayStart + DEFAULT_CLOSE_HOUR * HOUR;
		for (const b of bookings ?? []) {
			start = Math.min(start, dayStart + Math.floor((b.start - dayStart) / HOUR) * HOUR);
			end = Math.max(end, dayStart + Math.ceil((b.end - dayStart) / HOUR) * HOUR);
		}
		return { start, end };
	});

	const ticks = $derived.by<number[]>(() => {
		const out: number[] = [];
		for (let t = timeline.start; t <= timeline.end; t += 2 * HOUR) out.push(t);
		return out;
	});

	/** Gaps of at least 30 minutes between now and the end of the window. */
	const freeSlots = $derived.by<Interval[]>(() => {
		if (!bookings) return [];
		const slots: Interval[] = [];
		let cursor = Math.max(timeline.start, now);
		for (const b of bookings) {
			if (b.start - cursor >= MIN_FREE_GAP) slots.push({ start: cursor, end: b.start });
			cursor = Math.max(cursor, b.end);
		}
		if (timeline.end - cursor >= MIN_FREE_GAP) slots.push({ start: cursor, end: timeline.end });
		return slots;
	});

	function pct(t: number): number {
		const span = timeline.end - timeline.start;
		return ((Math.min(Math.max(t, timeline.start), timeline.end) - timeline.start) / span) * 100;
	}

	function range(i: Interval): string {
		return `${timeFmt.format(i.start)} – ${timeFmt.format(i.end)}`;
	}

	function onDialogClick(event: MouseEvent) {
		// The panel fills the dialog box, so a click on the dialog itself is a backdrop click.
		if (event.target === dialog) dialog.close();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialog}
	class="drawer"
	aria-labelledby={titleId}
	onclose={onclose}
	onclick={onDialogClick}
>
	{#if resource}
		{@const nowVisible = now > timeline.start && now < timeline.end}
		<div class="panel">
			<header class="head">
				<div>
					<p class="eyebrow">{TYPE_LABELS[resource.type]}</p>
					<h2 id={titleId} class="title">{resource.name}</h2>
				</div>
				<button type="button" class="close" aria-label="Închide" onclick={() => dialog?.close()}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</header>

			<div class="body">
				<!-- ---------- Specifications ---------- -->
				<section aria-labelledby="{titleId}-specs">
					<h3 id="{titleId}-specs" class="section-title">Specificații</h3>
					<p class="description">{resource.description}</p>

					<dl class="specs">
						<div>
							<dt>Stare</dt>
							<dd class="status" data-available={resource.isAvailable}>
								<span class="dot" aria-hidden="true"></span>
								{availabilityLabel(resource)}
							</dd>
						</div>
						<div>
							<dt>Tip</dt>
							<dd>{TYPE_LABELS[resource.type]}</dd>
						</div>
						<div>
							<dt>Locație</dt>
							<dd>{resource.location ?? '—'}</dd>
						</div>
						{#if resource.type === 'Room'}
							<div>
								<dt>Capacitate</dt>
								<dd>{resource.capacity !== undefined ? seatsLabel(resource.capacity) : '—'}</dd>
							</div>
						{:else}
							<div>
								<dt>Cod inventar</dt>
								<dd class="code">{resource.inventoryCode ?? '—'}</dd>
							</div>
						{/if}
						<div>
							<dt>Identificator</dt>
							<dd class="code">#{resource.id}</dd>
						</div>
					</dl>
				</section>

				<!-- ---------- Today's schedule ---------- -->
				<section class="schedule" aria-labelledby="{titleId}-schedule" aria-busy={bookings === null && !scheduleError}>
					<h3 id="{titleId}-schedule" class="section-title">Programul de astăzi</h3>
					<p class="day">{dayFmt.format(now)}</p>

					{#if scheduleError}
						<p class="notice error" role="alert">{scheduleError}</p>
					{:else if bookings === null}
						<div class="track skeleton" aria-hidden="true"></div>
						<p class="notice">Se încarcă programul…</p>
					{:else}
						<div class="timeline" aria-hidden="true">
							<div class="track">
								{#each ticks as t (t)}
									<span class="gridline" style:left="{pct(t)}%"></span>
								{/each}
								{#each bookings as b (b.id)}
									<span
										class="slot"
										data-status={b.status}
										style:left="{pct(b.start)}%"
										style:width="{pct(b.end) - pct(b.start)}%"
									></span>
								{/each}
								{#if nowVisible}
									<span class="now" style:left="{pct(now)}%"></span>
								{/if}
							</div>
							<div class="ticks">
								{#each ticks as t (t)}
									<span style:left="{pct(t)}%">{timeFmt.format(t)}</span>
								{/each}
							</div>
						</div>

						<ul class="legend" aria-hidden="true">
							<li><span class="swatch" data-status="Confirmed"></span>Confirmată</li>
							<li><span class="swatch" data-status="Pending"></span>În așteptare</li>
							{#if nowVisible}<li><span class="swatch now-swatch"></span>Acum</li>{/if}
						</ul>

						{#if bookings.length === 0}
							<p class="notice">Nicio rezervare astăzi — resursa este liberă toată ziua.</p>
						{:else}
							<ol class="bookings">
								{#each bookings as b (b.id)}
									<li class="booking" class:past={b.end <= now}>
										<span class="booking-time">{range(b)}</span>
										<span class="booking-purpose">{b.purpose}</span>
										<span class="pill" data-status={b.status}>{STATUS_LABELS[b.status]}</span>
									</li>
								{/each}
							</ol>
						{/if}

						<h4 class="subheading">Intervale libere în restul zilei</h4>
						{#if freeSlots.length === 0}
							<p class="notice">Nu mai sunt intervale libere de cel puțin 30 de minute astăzi.</p>
						{:else}
							<ul class="free">
								{#each freeSlots as slot (slot.start)}
									<li>{range(slot)}</li>
								{/each}
							</ul>
						{/if}
					{/if}
				</section>
			</div>

			<footer class="foot">
				<button type="button" class="btn ghost" onclick={() => dialog?.close()}>Închide</button>
				{#if resource.isAvailable}
					<a class="btn primary" href={bookingHref(resource)}>Rezervă această resursă</a>
				{:else}
					<button type="button" class="btn primary" disabled>Indisponibilă pentru rezervare</button>
				{/if}
			</footer>
		</div>
	{/if}
</dialog>

<style>
	/* ---------- Dialog shell (right-hand drawer) ---------- */
	.drawer {
		width: min(100%, 34rem);
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
		margin: 0 0 0 auto;
		padding: 0;
		border: 0;
		border-left: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
		color: var(--color-ink);
		box-shadow: -24px 0 60px -40px rgb(19 34 56 / 0.5);
	}

	.drawer[open] {
		animation: slide-in 240ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	.drawer::backdrop {
		background-color: rgb(19 34 56 / 0.38);
		backdrop-filter: blur(2px);
		animation: fade-in 240ms ease;
	}

	:global(html:has(dialog.drawer[open])) {
		overflow: hidden;
	}

	@keyframes slide-in {
		from {
			transform: translateX(2rem);
			opacity: 0;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	/* ---------- Head ---------- */
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.75rem 1.5rem 1.25rem;
		border-bottom: 1px solid var(--color-hairline);
	}

	.eyebrow {
		margin: 0;
		font-size: 0.65rem;
		font-weight: 500;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--color-brass);
	}

	.title {
		margin: 0.5rem 0 0;
		font-size: 1.75rem;
		line-height: 1.15;
	}

	.close {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		background: transparent;
		color: var(--color-ink);
		cursor: pointer;
		transition: border-color 150ms ease;
	}

	.close:hover {
		border-color: var(--color-ink);
	}

	.close svg {
		width: 1.1rem;
		height: 1.1rem;
	}

	/* ---------- Body ---------- */
	.body {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 2.25rem;
	}

	.section-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.description {
		margin: 0.75rem 0 0;
		font-size: 0.95rem;
		line-height: 1.6;
	}

	.specs {
		margin: 1.25rem 0 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-hairline);
	}

	.specs > div {
		padding: 0.75rem 1rem;
		background-color: var(--color-surface);
	}

	.specs dt {
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		color: var(--color-muted);
	}

	.specs dd {
		margin: 0.2rem 0 0;
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}

	.code {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.06em;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 500;
		color: var(--color-forest);
	}

	.status[data-available='false'] {
		color: var(--color-bordeaux);
	}

	.dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 9999px;
		background-color: currentColor;
	}

	/* ---------- Schedule ---------- */
	.day {
		margin: 0.375rem 0 0;
		font-family: var(--font-serif);
		font-size: 1.15rem;
		text-transform: capitalize;
	}

	.timeline {
		margin-top: 1.25rem;
	}

	.track {
		position: relative;
		height: 2.25rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-canvas);
	}

	.gridline {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background-color: var(--color-hairline);
	}

	.track.skeleton {
		margin-top: 1.25rem;
		animation: pulse 1.4s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.5;
		}
	}

	.slot {
		position: absolute;
		top: 3px;
		bottom: 3px;
		min-width: 3px;
		background-color: var(--color-ink);
	}

	.slot[data-status='Pending'],
	.swatch[data-status='Pending'] {
		background-color: var(--color-brass);
		background-image: repeating-linear-gradient(
			-45deg,
			transparent 0 4px,
			rgb(255 255 255 / 0.35) 4px 7px
		);
	}

	.now {
		position: absolute;
		top: -4px;
		bottom: -4px;
		width: 2px;
		margin-left: -1px;
		background-color: var(--color-bordeaux);
	}

	.ticks {
		position: relative;
		height: 1.25rem;
		margin-top: 0.375rem;
		font-size: 0.65rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-muted);
	}

	.ticks span {
		position: absolute;
		transform: translateX(-50%);
	}

	.ticks span:first-child {
		transform: none;
	}

	.ticks span:last-child {
		transform: translateX(-100%);
	}

	.legend {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem 1.25rem;
		font-size: 0.75rem;
		color: var(--color-muted);
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.swatch {
		width: 0.875rem;
		height: 0.5rem;
		background-color: var(--color-ink);
	}

	.now-swatch {
		width: 2px;
		height: 0.875rem;
		background-color: var(--color-bordeaux);
	}

	.bookings {
		list-style: none;
		margin: 1.25rem 0 0;
		padding: 0;
		border-top: 1px solid var(--color-hairline);
	}

	.booking {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: baseline;
		gap: 0.25rem 1rem;
		padding: 0.875rem 0;
		border-bottom: 1px solid var(--color-hairline);
	}

	.booking.past {
		opacity: 0.55;
	}

	.booking-time {
		font-size: 0.85rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.booking-purpose {
		font-size: 0.9rem;
		min-width: 0;
	}

	.pill {
		grid-column: 2;
		justify-self: start;
		padding: 0.05rem 0.5rem;
		border: 1px solid currentColor;
		font-size: 0.65rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-forest);
	}

	.pill[data-status='Pending'] {
		color: #8a6a2f;
	}

	.subheading {
		margin: 1.75rem 0 0;
		font-family: var(--font-sans);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.free {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.free li {
		padding: 0.3rem 0.75rem;
		border: 1px solid color-mix(in srgb, var(--color-forest) 35%, transparent);
		background-color: color-mix(in srgb, var(--color-forest) 6%, transparent);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-forest);
	}

	.notice {
		margin: 1rem 0 0;
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	.notice.error {
		color: var(--color-bordeaux);
	}

	/* ---------- Foot ---------- */
	.foot {
		display: flex;
		gap: 0.625rem;
		padding: 1rem 1.5rem calc(1rem + env(safe-area-inset-bottom));
		border-top: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0.5rem 1.25rem;
		border: 1px solid var(--color-ink);
		font: inherit;
		font-size: 0.85rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease;
	}

	.ghost {
		border-color: var(--color-hairline);
		background-color: transparent;
		color: var(--color-ink);
	}

	.ghost:hover {
		border-color: var(--color-ink);
	}

	.primary {
		flex: 1;
		background-color: var(--color-ink);
		color: var(--color-canvas);
	}

	.primary:hover {
		background-color: var(--color-bordeaux);
		border-color: var(--color-bordeaux);
	}

	.primary:disabled {
		cursor: not-allowed;
		background-color: transparent;
		border-color: var(--color-hairline);
		color: var(--color-muted);
	}

	@media (min-width: 640px) {
		.head,
		.body {
			padding-inline: 2rem;
		}

		.foot {
			padding-inline: 2rem;
		}

		.title {
			font-size: 2rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.drawer[open],
		.drawer::backdrop,
		.track.skeleton {
			animation: none;
		}
	}
</style>
