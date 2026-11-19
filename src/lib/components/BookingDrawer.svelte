<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { reservationService } from '#lib/api/reservationService.ts';
	import { resourceService } from '#lib/api/resourceService.ts';
	import { authStore } from '#lib/stores/authStore.ts';
	import { bookingStore, closeBookingDrawer } from '#lib/stores/bookingStore.ts';
	import { addReservation, loadReservations, reservationsStore } from '#lib/stores/reservationStore.ts';
	import type { ReservationDTO, ResourceDTO } from '#lib/types/index.ts';
	import { fromInputs, STATUS_LABELS, toDateInput } from '#lib/utils/reservation.ts';
	import { seatsLabel } from '#lib/utils/resource.ts';
	import {
		buildDaySlots,
		calculateAvailabilitySummary,
		hourLabel,
		validateSlotRange,
		type DaySlot
	} from '#lib/utils/schedule.ts';

	const PURPOSE_MIN = 3;
	const PURPOSE_MAX = 200;
	const DAYS_AHEAD = 7;

	const uid = $props.id();
	const dayFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
	const weekdayFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'short' });
	const monthFmt = new Intl.DateTimeFormat('ro-RO', { month: 'short' });

	const open = $derived($bookingStore.isOpen);
	const user = $derived($authStore.currentUser);

	// ---------- Data ----------
	let resources = $state<ResourceDTO[] | null>(null);
	let resourcesError = $state<string | null>(null);
	let reservationsError = $state<string | null>(null);
	let now = $state(Date.now());

	// ---------- Form ----------
	let resourceId = $state<number | null>(null);
	let date = $state(toDateInput(new Date()));
	let selStart = $state<number | null>(null);
	/** Exclusive end hour of the selected range. */
	let selEnd = $state<number | null>(null);
	/** Whether the next click on the grid picks the end of the range. */
	let pickingEnd = $state(false);
	let hoverHour = $state<number | null>(null);
	let purpose = $state('');
	let attempted = $state(false);
	let submitting = $state(false);
	let serverError = $state<string | null>(null);
	let confirmed = $state<ReservationDTO | null>(null);

	let panel: HTMLElement | undefined = $state();
	let closeBtn: HTMLButtonElement | undefined = $state();
	let returnFocus: HTMLElement | null = null;

	// ---------- Open / reset ----------
	$effect(() => {
		if (!open) return;
		untrack(() => {
			const s = $bookingStore;
			returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			resourceId = s.preselectedResourceId === null ? null : Number(s.preselectedResourceId);
			date = s.preselectedDate || toDateInput(new Date());
			if (s.preselectedStartHour !== null) {
				selStart = s.preselectedStartHour;
				selEnd = s.preselectedStartHour + 1;
				pickingEnd = true;
			} else {
				clearSelection();
			}
			purpose = '';
			attempted = false;
			submitting = false;
			serverError = null;
			confirmed = null;
			now = Date.now();
			void loadData();
			void tick().then(() => closeBtn?.focus());
		});

		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const timer = setInterval(() => (now = Date.now()), 30_000);

		return () => {
			clearInterval(timer);
			document.body.style.overflow = prevOverflow;
			returnFocus?.focus?.();
		};
	});

	async function loadData() {
		resourcesError = null;
		reservationsError = null;
		if (!resources) {
			resourceService
				.getAll()
				.then((rows) => (resources = rows))
				.catch((e: unknown) => {
					resourcesError = e instanceof ApiError ? e.message : 'Resursele nu au putut fi încărcate.';
				});
		}
		try {
			await loadReservations(true);
		} catch (e) {
			reservationsError =
				e instanceof ApiError ? e.message : 'Programul resurselor nu a putut fi încărcat.';
		}
	}

	// ---------- Derived ----------
	const rooms = $derived(
		(resources ?? []).filter((r) => r.type === 'Room').toSorted((a, b) => a.name.localeCompare(b.name, 'ro'))
	);
	const equipment = $derived(
		(resources ?? [])
			.filter((r) => r.type === 'Equipment')
			.toSorted((a, b) => a.name.localeCompare(b.name, 'ro'))
	);
	const selected = $derived(resources?.find((r) => r.id === resourceId) ?? null);
	const bookable = $derived(!!selected && selected.isAvailable);

	const slots = $derived<DaySlot[]>(
		resourceId !== null && $reservationsStore
			? buildDaySlots(date, resourceId, $reservationsStore, now)
			: []
	);
	const summary = $derived(calculateAvailabilitySummary(slots));

	const validation = $derived(
		selStart !== null && selEnd !== null ? validateSlotRange(slots, selStart, selEnd) : null
	);
	const rangeValid = $derived(!!validation?.valid && bookable);

	/** Range shown on the grid: hover preview while picking the end, else the selection. */
	const shownRange = $derived.by<[number, number] | null>(() => {
		if (selStart === null || selEnd === null) return null;
		if (pickingEnd && hoverHour !== null && hoverHour >= selStart) return [selStart, hoverHour + 1];
		return [selStart, selEnd];
	});

	const purposeError = $derived(
		purpose.trim().length < PURPOSE_MIN ? 'Descrieți pe scurt scopul rezervării.' : null
	);

	const step = $derived(!selected ? 1 : !rangeValid ? 2 : 3);

	const dayChoices = $derived.by(() => {
		const base = new Date(now);
		base.setHours(0, 0, 0, 0);
		return Array.from({ length: DAYS_AHEAD }, (_, i) => {
			const d = new Date(base);
			d.setDate(base.getDate() + i);
			return {
				value: toDateInput(d),
				weekday: i === 0 ? 'Azi' : i === 1 ? 'Mâine' : weekdayFmt.format(d).replace('.', ''),
				day: d.getDate(),
				month: monthFmt.format(d).replace('.', '')
			};
		});
	});
	const today = $derived(dayChoices[0]?.value ?? toDateInput(new Date()));
	const dateLabel = $derived.by(() => {
		const t = fromInputs(date, '00:00');
		return Number.isNaN(t) ? '' : dayFmt.format(t);
	});

	const durationHours = $derived(selStart !== null && selEnd !== null ? selEnd - selStart : 0);

	// ---------- Interaction ----------
	function clearSelection() {
		selStart = null;
		selEnd = null;
		pickingEnd = false;
		hoverHour = null;
	}

	function onResourceChange() {
		clearSelection();
		serverError = null;
	}

	function chooseDate(value: string) {
		if (!value || value === date) return;
		date = value;
		clearSelection();
		serverError = null;
	}

	function pickSlot(slot: DaySlot) {
		if (slot.status !== 'available' || !bookable) return;
		serverError = null;
		confirmed = null;
		if (!pickingEnd || selStart === null || slot.hour < selStart) {
			selStart = slot.hour;
			selEnd = slot.hour + 1;
			pickingEnd = true;
			return;
		}
		selEnd = slot.hour + 1;
		pickingEnd = false;
		hoverHour = null;
	}

	function slotState(slot: DaySlot) {
		const r = shownRange;
		const inRange = !!r && slot.hour >= r[0] && slot.hour < r[1];
		return {
			inRange,
			isStart: inRange && slot.hour === r?.[0],
			isEnd: inRange && slot.hour === (r?.[1] ?? 0) - 1,
			conflict: inRange && slot.status !== 'available'
		};
	}

	function slotTitle(slot: DaySlot): string {
		const range = `${slot.label} – ${hourLabel(slot.hour + 1)}`;
		if (slot.status === 'occupied') return `${range} · Ocupat${slot.reservation ? ` — ${slot.reservation.purpose}` : ''}`;
		if (slot.status === 'past') return `${range} · Interval trecut`;
		return `${range} · Liber`;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		attempted = true;
		serverError = null;
		if (!user || !selected || !rangeValid || purposeError || selStart === null || selEnd === null) return;

		submitting = true;
		try {
			const created = await reservationService.create({
				userId: user.id,
				resourceId: selected.id,
				startTime: new Date(fromInputs(date, hourLabel(selStart))).toISOString(),
				endTime: new Date(fromInputs(date, hourLabel(selEnd))).toISOString(),
				purpose: purpose.trim()
			});
			addReservation(created);
			confirmed = created;
			clearSelection();
			purpose = '';
			attempted = false;
			panel?.querySelector('.body')?.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (e) {
			serverError =
				e instanceof ApiError ? e.message : 'Rezervarea nu a putut fi înregistrată. Încercați din nou.';
			if (e instanceof ApiError && e.status === 409) {
				clearSelection();
				void loadReservations(true);
			}
		} finally {
			submitting = false;
		}
	}

	function confirmedSummary(r: ReservationDTO): string {
		const name = resources?.find((x) => x.id === r.resourceId)?.name ?? 'Resursa';
		const start = new Date(r.startTime);
		const end = new Date(r.endTime);
		return `${name} · ${dayFmt.format(start)} · ${hourLabel(start.getHours())} – ${hourLabel(end.getHours())}`;
	}

	function onKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			closeBookingDrawer();
			return;
		}
		// Keep keyboard focus inside the panel.
		if (event.key === 'Tab' && panel) {
			const focusable = panel.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
			);
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!first || !last) return;
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div class="backdrop" transition:fade={{ duration: 220 }} onclick={closeBookingDrawer} aria-hidden="true"></div>

	<div
		bind:this={panel}
		class="drawer"
		role="dialog"
		aria-modal="true"
		aria-labelledby="{uid}-title"
		transition:fly={{ x: 480, duration: 320, easing: cubicOut, opacity: 1 }}
	>
		<!-- ---------- Header ---------- -->
		<header class="head">
			<div class="head-text">
				<p class="eyebrow">Rezervare nouă</p>
				<h2 id="{uid}-title" class="title">Rezervați un spațiu</h2>
			</div>
			<button bind:this={closeBtn} type="button" class="close" aria-label="Închide panoul" onclick={closeBookingDrawer}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</header>

		<ol class="steps" aria-label="Pași">
			{#each ['Resursă & dată', 'Interval orar', 'Confirmare'] as label, i (label)}
				{@const n = i + 1}
				<li class="step" class:done={step > n} class:current={step === n} aria-current={step === n ? 'step' : undefined}>
					<span class="step-num">{step > n ? '✓' : n}</span>
					<span class="step-label">{label}</span>
				</li>
			{/each}
		</ol>

		<form class="form" onsubmit={submit} novalidate>
			<div class="body">
				{#if confirmed}
					<div class="banner" role="status" transition:fly={{ y: -8, duration: 220 }}>
						<span class="banner-mark" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
								<path d="M5 12.5l4.5 4.5L19 7.5" />
							</svg>
						</span>
						<div class="banner-text">
							<p class="banner-title">Rezervarea a fost înregistrată</p>
							<p class="banner-meta">{confirmedSummary(confirmed)}</p>
							<p class="banner-status">Status: {STATUS_LABELS[confirmed.status]}</p>
						</div>
						<a class="banner-link" href="/reservations" onclick={closeBookingDrawer}>Vezi rezervările</a>
					</div>
				{/if}

				<!-- ---------- Step 1 ---------- -->
				<section class="section" aria-labelledby="{uid}-s1">
					<h3 id="{uid}-s1" class="section-title"><span class="numeral">I.</span> Resursă &amp; dată</h3>

					<label class="field">
						<span class="field-label">Resursa</span>
						{#if resourcesError}
							<p class="inline-error" role="alert">{resourcesError}</p>
						{:else}
							<span class="select-wrap">
								<select bind:value={resourceId} onchange={onResourceChange} disabled={!resources}>
									<option value={null} disabled>{resources ? 'Alegeți o sală sau un echipament' : 'Se încarcă…'}</option>
									{#if rooms.length}
										<optgroup label="Săli">
											{#each rooms as r (r.id)}
												<option value={r.id} disabled={!r.isAvailable}>
													{r.name}{r.capacity ? ` · ${seatsLabel(r.capacity)}` : ''}{r.isAvailable ? '' : ' — indisponibilă'}
												</option>
											{/each}
										</optgroup>
									{/if}
									{#if equipment.length}
										<optgroup label="Echipamente">
											{#each equipment as r (r.id)}
												<option value={r.id} disabled={!r.isAvailable}>
													{r.name}{r.isAvailable ? '' : ' — indisponibil'}
												</option>
											{/each}
										</optgroup>
									{/if}
								</select>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
									<path d="M7 10l5 5 5-5" />
								</svg>
							</span>
						{/if}
					</label>

					{#if selected}
						<div class="resource-summary">
							<span class="type-badge">{selected.type === 'Room' ? 'Sală' : 'Echipament'}</span>
							<span class="resource-meta">
								{selected.location ?? 'Locație nespecificată'}
								{#if selected.type === 'Room' && selected.capacity}· {seatsLabel(selected.capacity)}{/if}
								{#if selected.type === 'Equipment' && selected.inventoryCode}· {selected.inventoryCode}{/if}
							</span>
						</div>
						{#if !selected.isAvailable}
							<p class="inline-error">Resursa este scoasă temporar din uz și nu poate fi rezervată.</p>
						{/if}
					{/if}

					<div class="field">
						<span class="field-label" id="{uid}-date-label">Data</span>
						<div class="days" role="group" aria-labelledby="{uid}-date-label">
							{#each dayChoices as d (d.value)}
								<button type="button" class="day" aria-pressed={date === d.value} onclick={() => chooseDate(d.value)}>
									<span class="day-week">{d.weekday}</span>
									<span class="day-num">{d.day}</span>
									<span class="day-month">{d.month}</span>
								</button>
							{/each}
						</div>
						<label class="other-date">
							<span>Altă dată</span>
							<input type="date" min={today} value={date} onchange={(e) => chooseDate(e.currentTarget.value)} />
						</label>
					</div>
				</section>

				<!-- ---------- Step 2 ---------- -->
				<section class="section" aria-labelledby="{uid}-s2">
					<div class="section-head">
						<h3 id="{uid}-s2" class="section-title"><span class="numeral">II.</span> Interval orar</h3>
						{#if selected && slots.length}
							<span class="free-count">{summary.freeHours} / {summary.totalHours} ore libere</span>
						{/if}
					</div>
					<p class="section-hint">
						{#if !selected}
							Alegeți mai întâi o resursă pentru a vedea programul.
						{:else}
							<span class="date-label">{dateLabel}</span> — selectați ora de început, apoi ora de final.
						{/if}
					</p>

					{#if reservationsError}
						<p class="inline-error" role="alert">{reservationsError}</p>
					{:else if selected && !$reservationsStore}
						<div class="slot-grid" aria-busy="true">
							{#each { length: 12 }, i (i)}
								<span class="slot skeleton"></span>
							{/each}
						</div>
					{:else if selected}
						<div class="slot-grid" role="group" aria-label="Intervale orare {dateLabel}" onpointerleave={() => (hoverHour = null)}>
							{#each slots as slot (slot.hour)}
								{@const st = slotState(slot)}
								<button
									type="button"
									class="slot"
									data-status={slot.status}
									class:in-range={st.inRange}
									class:edge-start={st.isStart}
									class:edge-end={st.isEnd}
									class:conflict={st.conflict}
									class:invalid={st.inRange && !!validation && !validation.valid}
									disabled={slot.status !== 'available' || !bookable}
									aria-pressed={st.inRange && slot.status === 'available'}
									title={slotTitle(slot)}
									onclick={() => pickSlot(slot)}
									onpointerenter={() => (hoverHour = slot.hour)}
								>
									<span class="slot-time">{slot.label}</span>
									<span class="slot-note">
										{#if slot.status === 'occupied'}Ocupat{:else if slot.status === 'past'}Trecut{:else if st.isStart && pickingEnd}Început{:else}Liber{/if}
									</span>
								</button>
							{/each}
						</div>

						<ul class="legend" aria-hidden="true">
							<li><span class="swatch free"></span>Liber</li>
							<li><span class="swatch taken"></span>Ocupat</li>
							<li><span class="swatch past"></span>Trecut</li>
							<li><span class="swatch chosen"></span>Selectat</li>
						</ul>

						<div class="range" aria-live="polite">
							{#if selStart !== null && selEnd !== null}
								<p class="range-value" class:bad={validation && !validation.valid}>
									{hourLabel(selStart)} <span class="dash">—</span> {hourLabel(selEnd)}
									<span class="range-dur">{durationHours} {durationHours === 1 ? 'oră' : 'ore'}</span>
								</p>
								{#if validation && !validation.valid}
									<p class="inline-error">{validation.error}</p>
								{:else if pickingEnd}
									<p class="range-hint">Alegeți ora de final sau continuați cu un interval de o oră.</p>
								{/if}
								<button type="button" class="text-btn" onclick={clearSelection}>Resetează intervalul</button>
							{:else if slots.length && !summary.nextAvailable}
								<p class="range-hint">Nu mai există intervale libere în această zi. Alegeți o altă dată.</p>
							{/if}
						</div>
					{/if}
				</section>

				<!-- ---------- Step 3 ---------- -->
				<section class="section" aria-labelledby="{uid}-s3" class:muted={step < 3}>
					<h3 id="{uid}-s3" class="section-title"><span class="numeral">III.</span> Confirmare</h3>
					<label class="field">
						<span class="field-label">Scopul rezervării</span>
						<textarea
							rows="3"
							maxlength={PURPOSE_MAX}
							placeholder="Ex.: Seminar de arhitectură, ședință de proiect…"
							bind:value={purpose}
							aria-invalid={attempted && !!purposeError}
							aria-describedby="{uid}-purpose-help"
						></textarea>
						<span id="{uid}-purpose-help" class="help" class:error={attempted && !!purposeError}>
							{#if attempted && purposeError}{purposeError}{:else}{purpose.length} / {PURPOSE_MAX}{/if}
						</span>
					</label>

					{#if !user}
						<p class="inline-error">Alegeți un utilizator din meniul contului pentru a putea rezerva.</p>
					{/if}
					{#if serverError}
						<p class="inline-error" role="alert">{serverError}</p>
					{/if}
				</section>
			</div>

			<!-- ---------- Footer ---------- -->
			<footer class="foot">
				<div class="foot-summary">
					{#if selected && rangeValid && selStart !== null && selEnd !== null}
						<span class="foot-name">{selected.name}</span>
						<span class="foot-when">{dateLabel} · {hourLabel(selStart)}–{hourLabel(selEnd)}</span>
					{:else}
						<span class="foot-when">Completați pașii pentru a confirma.</span>
					{/if}
				</div>
				<div class="foot-actions">
					<button type="button" class="btn ghost" onclick={closeBookingDrawer}>Anulează</button>
					<button type="submit" class="btn primary" disabled={submitting || !rangeValid || !user}>
						{submitting ? 'Se înregistrează…' : 'Confirmă rezervarea'}
					</button>
				</div>
			</footer>
		</form>
	</div>
{/if}

<style>
	/* ---------- Shell ---------- */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background-color: rgb(11 25 44 / 0.42);
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
	}

	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 61;
		display: flex;
		flex-direction: column;
		width: min(34rem, 100vw);
		background-color: var(--bg-canvas);
		border-left: 1px solid var(--border-gold);
		box-shadow: -32px 0 64px -32px rgb(11 25 44 / 0.45);
	}

	button {
		font: inherit;
		cursor: pointer;
	}

	p {
		margin: 0;
	}

	/* ---------- Header ---------- */
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.5rem 1.5rem 1.25rem;
		background-color: var(--bg-surface);
		border-top: 2px solid var(--border-gold);
	}

	.eyebrow {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--border-gold);
	}

	.title {
		margin: 0.4rem 0 0;
		font-size: 1.9rem;
		font-weight: 500;
	}

	.close {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		border: 1px solid var(--border-hairline);
		background: transparent;
		color: var(--ink-primary);
		transition: border-color 150ms ease;
	}

	.close:hover {
		border-color: var(--ink-primary);
	}

	.close svg {
		width: 1.15rem;
		height: 1.15rem;
	}

	/* ---------- Steps ---------- */
	.steps {
		list-style: none;
		margin: 0;
		padding: 0 1.5rem;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		background-color: var(--bg-surface);
		border-bottom: 1px solid var(--border-hairline);
	}

	.step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 0;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		color: var(--ink-secondary);
		min-width: 0;
	}

	.step.current {
		border-bottom-color: var(--border-gold);
		color: var(--ink-primary);
	}

	.step-num {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		border: 1px solid var(--border-hairline);
		border-radius: 9999px;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		line-height: 1;
	}

	.step.current .step-num {
		border-color: var(--border-gold);
		color: var(--ink-primary);
	}

	.step.done .step-num {
		border-color: var(--ink-primary);
		background-color: var(--ink-primary);
		color: var(--border-gold);
		font-family: var(--font-sans);
		font-size: 0.7rem;
	}

	.step-label {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	/* ---------- Body ---------- */
	.form {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.body {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 1.25rem 1.5rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.section {
		padding: 1.25rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-surface);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		transition: opacity 200ms ease;
	}

	.section.muted {
		opacity: 0.6;
	}

	.section.muted:focus-within {
		opacity: 1;
	}

	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.section-title {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 600;
	}

	.numeral {
		margin-right: 0.35rem;
		font-style: italic;
		font-weight: 500;
		color: var(--border-gold);
	}

	.section-hint {
		margin-top: -0.5rem;
		font-size: 0.82rem;
		color: var(--ink-secondary);
	}

	.date-label {
		color: var(--ink-primary);
		font-weight: 500;
	}

	.free-count {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: var(--accent-emerald);
		white-space: nowrap;
	}

	/* ---------- Fields ---------- */
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.field-label {
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink-secondary);
	}

	.select-wrap {
		position: relative;
		display: block;
	}

	.select-wrap select {
		appearance: none;
		-webkit-appearance: none;
		width: 100%;
		height: 2.875rem;
		padding: 0 2.5rem 0 0.875rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-canvas);
		background-image: none;
		font: inherit;
		font-size: 0.92rem;
		color: var(--ink-primary);
		cursor: pointer;
	}

	.select-wrap select:focus {
		outline: none;
		border-color: var(--border-gold);
		box-shadow: none;
		background-color: var(--bg-surface);
	}

	.select-wrap svg {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		width: 1rem;
		height: 1rem;
		transform: translateY(-50%);
		color: var(--ink-secondary);
		pointer-events: none;
	}

	.resource-summary {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		margin-top: -0.25rem;
		font-size: 0.8rem;
		color: var(--ink-secondary);
	}

	.type-badge {
		flex-shrink: 0;
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--border-gold);
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-primary);
	}

	/* ---------- Day strip ---------- */
	.days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.375rem;
	}

	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		padding: 0.5rem 0.125rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-canvas);
		color: var(--ink-primary);
		line-height: 1.1;
		transition:
			border-color 150ms ease,
			background-color 150ms ease;
	}

	.day:hover {
		border-color: var(--border-gold);
	}

	.day[aria-pressed='true'] {
		border-color: var(--ink-primary);
		background-color: var(--ink-primary);
		color: var(--bg-canvas);
		box-shadow: inset 0 -2px 0 var(--border-gold);
	}

	.day-week {
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.day-num {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 600;
	}

	.day-month {
		font-size: 0.6rem;
		color: var(--ink-secondary);
	}

	.day[aria-pressed='true'] .day-month {
		color: var(--border-gold);
	}

	.other-date {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.625rem;
		font-size: 0.75rem;
		color: var(--ink-secondary);
	}

	.other-date input {
		height: 2.125rem;
		padding: 0 0.5rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-canvas);
		font: inherit;
		font-size: 0.8rem;
		color: var(--ink-primary);
	}

	/* ---------- Slot grid ---------- */
	.slot-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.slot {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		min-height: 3.5rem;
		padding: 0.5rem 0.625rem;
		border: 1px solid color-mix(in srgb, var(--accent-emerald) 28%, var(--border-hairline));
		background-color: color-mix(in srgb, var(--accent-emerald) 5%, var(--bg-surface));
		color: var(--ink-primary);
		text-align: left;
		transition:
			border-color 120ms ease,
			background-color 120ms ease,
			color 120ms ease;
	}

	.slot:not(:disabled):hover {
		border-color: var(--border-gold);
		background-color: color-mix(in srgb, var(--border-gold) 10%, var(--bg-surface));
	}

	.slot-time {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 600;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.slot-note {
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent-emerald);
	}

	.slot[data-status='occupied'] {
		cursor: not-allowed;
		border-color: color-mix(in srgb, var(--accent-bordeaux) 70%, transparent);
		background-color: color-mix(in srgb, var(--accent-bordeaux) 84%, var(--bg-surface));
		color: color-mix(in srgb, var(--bg-surface) 82%, transparent);
	}

	.slot[data-status='occupied'] .slot-note {
		color: color-mix(in srgb, var(--border-gold) 80%, var(--bg-surface));
	}

	.slot[data-status='past'] {
		cursor: not-allowed;
		border-style: dashed;
		border-color: var(--border-hairline);
		background-color: var(--bg-subtle);
		background-image: repeating-linear-gradient(
			135deg,
			transparent 0 6px,
			rgb(11 25 44 / 0.04) 6px 7px
		);
		color: var(--ink-secondary);
	}

	.slot[data-status='past'] .slot-note {
		color: var(--ink-secondary);
	}

	.slot[data-status='available']:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* Selected range — midnight navy + champagne frame */
	.slot.in-range[data-status='available'] {
		border-color: var(--border-gold);
		background-color: var(--ink-primary);
		color: var(--bg-canvas);
	}

	.slot.in-range[data-status='available'] .slot-note {
		color: var(--border-gold);
	}

	.slot.edge-start,
	.slot.edge-end {
		box-shadow: inset 0 0 0 1px var(--border-gold);
	}

	.slot.in-range.invalid[data-status='available'] {
		background-color: color-mix(in srgb, var(--ink-primary) 70%, var(--accent-bordeaux));
	}

	.slot.conflict {
		outline: 2px solid var(--border-gold);
		outline-offset: -2px;
	}

	.slot.skeleton {
		border-color: var(--border-hairline);
		background-color: var(--bg-subtle);
		animation: pulse 1.4s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.45;
		}
	}

	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem 1rem;
		font-size: 0.7rem;
		color: var(--ink-secondary);
	}

	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	.swatch {
		width: 0.75rem;
		height: 0.75rem;
		border: 1px solid var(--border-hairline);
	}

	.swatch.free {
		background-color: color-mix(in srgb, var(--accent-emerald) 12%, var(--bg-surface));
		border-color: color-mix(in srgb, var(--accent-emerald) 35%, var(--border-hairline));
	}

	.swatch.taken {
		background-color: var(--accent-bordeaux);
		border-color: var(--accent-bordeaux);
	}

	.swatch.past {
		background-color: var(--bg-subtle);
		border-style: dashed;
	}

	.swatch.chosen {
		background-color: var(--ink-primary);
		border-color: var(--border-gold);
	}

	.range {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.375rem;
		padding-top: 0.875rem;
		border-top: 1px solid var(--border-hairline);
	}

	.range:empty {
		display: none;
	}

	.range-value {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-size: 1.6rem;
		font-weight: 600;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: var(--ink-primary);
	}

	.range-value.bad {
		color: var(--accent-bordeaux);
		text-decoration: line-through;
		text-decoration-thickness: 1px;
	}

	.dash {
		color: var(--border-gold);
	}

	.range-dur {
		margin-left: 0.25rem;
		font-family: var(--font-sans);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-secondary);
	}

	.range-hint {
		font-size: 0.78rem;
		color: var(--ink-secondary);
	}

	.text-btn {
		padding: 0;
		border: 0;
		background: transparent;
		font-size: 0.75rem;
		color: var(--accent-bordeaux);
		text-decoration: underline;
		text-decoration-color: var(--border-gold);
		text-underline-offset: 0.25em;
	}

	/* ---------- Purpose ---------- */
	textarea {
		width: 100%;
		min-height: 5.5rem;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-canvas);
		font: inherit;
		font-size: 0.9rem;
		line-height: 1.5;
		color: var(--ink-primary);
		resize: vertical;
	}

	textarea:focus {
		outline: none;
		border-color: var(--border-gold);
		background-color: var(--bg-surface);
		box-shadow: none;
	}

	textarea[aria-invalid='true'] {
		border-color: var(--accent-bordeaux);
	}

	.help {
		align-self: flex-end;
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink-secondary);
	}

	.help.error {
		align-self: flex-start;
		color: var(--accent-bordeaux);
	}

	.inline-error {
		padding: 0.5rem 0.75rem;
		border-left: 2px solid var(--accent-bordeaux);
		background-color: color-mix(in srgb, var(--accent-bordeaux) 6%, var(--bg-surface));
		font-size: 0.8rem;
		color: var(--accent-bordeaux);
	}

	/* ---------- Confirmation banner ---------- */
	.banner {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 0.875rem;
		padding: 1rem 1.125rem;
		border: 1px solid var(--border-gold);
		border-left-width: 3px;
		background-color: var(--ink-primary);
		color: var(--bg-canvas);
	}

	.banner-mark {
		grid-row: span 2;
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--border-gold);
		border-radius: 9999px;
		color: var(--border-gold);
	}

	.banner-mark svg {
		width: 1rem;
		height: 1rem;
	}

	.banner-title {
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.banner-meta {
		margin-top: 0.15rem;
		font-size: 0.8rem;
		color: color-mix(in srgb, var(--bg-canvas) 80%, transparent);
	}

	.banner-status {
		margin-top: 0.25rem;
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--border-gold);
	}

	.banner-link {
		grid-column: 2;
		justify-self: start;
		margin-top: 0.375rem;
		font-size: 0.78rem;
		color: var(--bg-canvas);
		text-decoration: underline;
		text-decoration-color: var(--border-gold);
	}

	/* ---------- Footer ---------- */
	.foot {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-top: 1px solid var(--border-hairline);
		background-color: var(--bg-surface);
	}

	.foot-summary {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.3;
	}

	.foot-name {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 600;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.foot-when {
		font-size: 0.75rem;
		color: var(--ink-secondary);
	}

	.foot-actions {
		display: flex;
		gap: 0.625rem;
	}

	.btn {
		flex: 1;
		min-height: 2.75rem;
		padding: 0.5rem 1rem;
		border: 1px solid var(--ink-primary);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.btn.ghost {
		flex: 0 0 auto;
		border-color: var(--border-hairline);
		background: transparent;
		color: var(--ink-primary);
	}

	.btn.ghost:hover {
		border-color: var(--ink-primary);
	}

	.btn.primary {
		background-color: var(--ink-primary);
		color: var(--bg-canvas);
		box-shadow: inset 0 -2px 0 var(--border-gold);
	}

	.btn.primary:not(:disabled):hover {
		background-color: var(--accent-bordeaux);
		border-color: var(--accent-bordeaux);
	}

	.btn.primary:disabled {
		cursor: not-allowed;
		border-color: var(--border-hairline);
		background-color: var(--bg-subtle);
		color: var(--ink-secondary);
		box-shadow: none;
	}

	/* ---------- Breakpoints ---------- */
	@media (min-width: 480px) {
		.slot-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		.foot {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}

		.foot-actions .btn.primary {
			flex: 0 0 auto;
		}
	}

	@media (max-width: 400px) {
		.step-label {
			display: none;
		}

		.head,
		.body,
		.foot {
			padding-inline: 1rem;
		}

		.steps {
			padding-inline: 1rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.slot,
		.day,
		.btn,
		.section {
			transition: none;
		}

		.slot.skeleton {
			animation: none;
		}
	}
</style>
