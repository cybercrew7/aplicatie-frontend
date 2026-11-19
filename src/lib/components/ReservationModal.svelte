<script lang="ts">
	import { untrack } from 'svelte';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { reservationService } from '#lib/api/reservationService.ts';
	import { authStore } from '#lib/stores/authStore.ts';
	import type { ReservationDTO, ResourceDTO, ResourceType } from '#lib/types/index.ts';
	import {
		findConflicts,
		fromInputs,
		intervalOf,
		overlaps,
		STATUS_LABELS,
		toDateInput,
		toTimeInput,
		type Interval
	} from '#lib/utils/reservation.ts';
	import { seatsLabel, TYPE_LABELS } from '#lib/utils/resource.ts';

	interface Props {
		open: boolean;
		/** Full resource catalogue to choose from. */
		resources: readonly ResourceDTO[];
		/** Pre-selects a resource, e.g. when arriving from `/reservations?resourceId=…`. */
		initialResourceId?: number | null;
		onclose: () => void;
		oncreated: (reservation: ReservationDTO) => void;
	}

	let { open, resources, initialResourceId = null, onclose, oncreated }: Props = $props();

	const RESOURCE_TYPES: readonly ResourceType[] = ['Room', 'Equipment'];
	const PURPOSE_MAX = 200;
	const SLOT_MS = 30 * 60_000;

	const timeFmt = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });
	const dayFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });

	const uid = $props.id();
	const user = $derived($authStore.currentUser);

	let dialog: HTMLDialogElement | undefined = $state();

	// ---------- Form state ----------
	let type = $state<ResourceType>('Room');
	let resourceId = $state<number | null>(null);
	let date = $state('');
	let startTime = $state('');
	let endTime = $state('');
	let purpose = $state('');

	let attempted = $state(false);
	let submitting = $state(false);
	let serverError = $state<string | null>(null);
	let now = $state(Date.now());

	/** Active reservations of the selected resource; `null` while loading. */
	let bookings = $state<ReservationDTO[] | null>(null);
	let bookingsError = $state<string | null>(null);

	function reset() {
		const preset = resources.find((r) => r.id === initialResourceId);
		type = preset?.type ?? 'Room';
		resourceId = preset?.id ?? null;

		// Default slot: the next half hour, lasting one hour.
		const start = new Date(Math.ceil(Date.now() / SLOT_MS) * SLOT_MS);
		const end = new Date(start.getTime() + 2 * SLOT_MS);
		date = toDateInput(start);
		startTime = toTimeInput(start);
		// Keep the default on a single day; the user can adjust it.
		endTime = toDateInput(end) === date ? toTimeInput(end) : '23:59';

		purpose = '';
		attempted = false;
		submitting = false;
		serverError = null;
		now = Date.now();
	}

	// ---------- Open / close the native dialog ----------
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			untrack(reset);
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	// Keep the "is it in the past?" check honest while the dialog stays open.
	$effect(() => {
		if (!open) return;
		const timer = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	// ---------- Load existing reservations for the selected resource ----------
	$effect(() => {
		const id = resourceId;
		bookings = null;
		bookingsError = null;
		if (!open || id === null) return;

		let stale = false;
		reservationService
			.getByResource(id)
			.then((rows) => {
				if (!stale) bookings = rows.filter((r) => r.status !== 'Cancelled');
			})
			.catch((e: unknown) => {
				if (stale) return;
				bookingsError =
					e instanceof ApiError ? e.message : 'Disponibilitatea nu a putut fi verificată.';
			});

		return () => {
			stale = true;
		};
	});

	// ---------- Derived selection ----------
	const options = $derived(
		resources
			.filter((r) => r.type === type)
			.toSorted((a, b) => a.name.localeCompare(b.name, 'ro'))
	);

	const selected = $derived(resources.find((r) => r.id === resourceId) ?? null);

	function onTypeChange() {
		if (selected && selected.type !== type) resourceId = null;
	}

	const slot = $derived<Interval>({
		start: fromInputs(date, startTime),
		end: fromInputs(date, endTime)
	});

	// ---------- Validation ----------
	const resourceError = $derived(
		!selected
			? 'Alegeți resursa pe care doriți să o rezervați.'
			: !selected.isAvailable
				? 'Această resursă este momentan indisponibilă pentru rezervări.'
				: null
	);

	const timeError = $derived.by<string | null>(() => {
		if (Number.isNaN(slot.start) || Number.isNaN(slot.end)) {
			return 'Completați data, ora de început și ora de sfârșit.';
		}
		if (slot.end <= slot.start) return 'Ora de sfârșit trebuie să fie după ora de început.';
		if (slot.start < now) return 'Intervalul ales a început deja. Alegeți un moment din viitor.';
		return null;
	});

	const purposeError = $derived(
		purpose.trim().length < 3 ? 'Descrieți pe scurt scopul rezervării.' : null
	);

	const conflicts = $derived(
		selected && bookings && !timeError ? findConflicts(bookings, selected.id, slot) : []
	);

	/** Bookings on the chosen day, to help the user pick a free slot. */
	const dayBookings = $derived.by(() => {
		if (!bookings || !date) return [];
		const dayStart = fromInputs(date, '00:00');
		if (Number.isNaN(dayStart)) return [];
		const day: Interval = { start: dayStart, end: dayStart + 86_400_000 };
		return bookings
			.map((r) => ({ ...r, ...intervalOf(r) }))
			.filter((r) => overlaps(r, day))
			.sort((a, b) => a.start - b.start);
	});

	const conflictIds = $derived(new Set(conflicts.map((c) => c.id)));
	const checking = $derived(selected !== null && bookings === null && !bookingsError);

	const canSubmit = $derived(
		!!user &&
			!resourceError &&
			!timeError &&
			!purposeError &&
			conflicts.length === 0 &&
			!checking &&
			!submitting
	);

	function range(i: Interval): string {
		return `${timeFmt.format(i.start)} – ${timeFmt.format(i.end)}`;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		attempted = true;
		serverError = null;
		now = Date.now();
		if (!canSubmit || !user || !selected) return;

		submitting = true;
		try {
			const created = await reservationService.create({
				userId: user.id,
				resourceId: selected.id,
				startTime: new Date(slot.start).toISOString(),
				endTime: new Date(slot.end).toISOString(),
				purpose: purpose.trim()
			});
			oncreated(created);
		} catch (e) {
			serverError =
				e instanceof ApiError ? e.message : 'Rezervarea nu a putut fi creată. Încercați din nou.';
			// Someone may have booked the slot meanwhile — refresh the schedule.
			if (e instanceof ApiError && e.status === 409) {
				const id = selected.id;
				reservationService
					.getByResource(id)
					.then((rows) => {
						if (resourceId === id) bookings = rows.filter((r) => r.status !== 'Cancelled');
					})
					.catch(() => {});
			}
		} finally {
			submitting = false;
		}
	}
</script>

<dialog bind:this={dialog} class="modal" aria-labelledby="{uid}-title" {onclose}>
	{#if open}
		<form class="panel" novalidate onsubmit={submit}>
			<header class="head">
				<div>
					<p class="eyebrow">Rezervare nouă</p>
					<h2 id="{uid}-title" class="title">Programați o resursă</h2>
				</div>
				<button type="button" class="close" aria-label="Închide" onclick={() => dialog?.close()}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</header>

			<div class="body">
				{#if !user}
					<p class="notice warn" role="alert">
						Nu sunteți autentificat. Alegeți un cont din meniul de utilizator pentru a putea rezerva.
					</p>
				{/if}

				<!-- ---------- Resource ---------- -->
				<fieldset class="group">
					<legend class="label">Tip resursă</legend>
					<div class="segmented">
						{#each RESOURCE_TYPES as value (value)}
							<label class="segment">
								<input type="radio" name="{uid}-type" {value} bind:group={type} onchange={onTypeChange} />
								<span>{TYPE_LABELS[value]}</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<div class="field">
					<label class="label" for="{uid}-resource">{type === 'Room' ? 'Sala' : 'Echipamentul'}</label>
					<div class="control" class:invalid={attempted && resourceError}>
						<select
							id="{uid}-resource"
							bind:value={resourceId}
							aria-invalid={attempted && !!resourceError}
							aria-describedby="{uid}-resource-hint"
						>
							<option value={null} disabled>Alegeți din listă…</option>
							{#each options as r (r.id)}
								<option value={r.id} disabled={!r.isAvailable}>
									{r.name}{r.isAvailable ? '' : ' — indisponibil'}
								</option>
							{/each}
						</select>
					</div>
					<p id="{uid}-resource-hint" class="hint" class:error={attempted && resourceError}>
						{#if attempted && resourceError}
							{resourceError}
						{:else if selected}
							{[
								selected.location,
								selected.capacity !== undefined ? seatsLabel(selected.capacity) : selected.inventoryCode
							]
								.filter(Boolean)
								.join(' · ')}
						{:else}
							{options.length} {type === 'Room' ? 'săli' : 'echipamente'} în catalog
						{/if}
					</p>
				</div>

				<!-- ---------- Slot ---------- -->
				<div class="slot-grid">
					<div class="field date">
						<label class="label" for="{uid}-date">Data</label>
						<div class="control" class:invalid={!!timeError}>
							<input id="{uid}-date" type="date" min={toDateInput(new Date(now))} bind:value={date} required />
						</div>
					</div>
					<div class="field">
						<label class="label" for="{uid}-start">Ora de început</label>
						<div class="control" class:invalid={!!timeError}>
							<input id="{uid}-start" type="time" step="300" bind:value={startTime} required />
						</div>
					</div>
					<div class="field">
						<label class="label" for="{uid}-end">Ora de sfârșit</label>
						<div class="control" class:invalid={!!timeError}>
							<input id="{uid}-end" type="time" step="300" bind:value={endTime} required />
						</div>
					</div>
				</div>

				{#if timeError}
					<p class="hint error" role="alert">{timeError}</p>
				{/if}

				<!-- ---------- Availability ---------- -->
				{#if selected}
					<section class="availability" aria-live="polite" aria-busy={checking}>
						{#if conflicts.length > 0}
							<div class="conflict" role="alert">
								<p class="conflict-title">Intervalul este deja ocupat</p>
								<p>
									{selected.name} este rezervat{selected.type === 'Room' ? 'ă' : ''} în
									{conflicts.length === 1 ? 'intervalul' : 'intervalele'}
									{conflicts.map((c) => range(intervalOf(c))).join(', ')}. Alegeți o altă oră sau o altă
									resursă.
								</p>
							</div>
						{/if}

						{#if bookingsError}
							<p class="hint error">{bookingsError}</p>
						{:else if checking}
							<p class="hint">Se verifică disponibilitatea…</p>
						{:else if date && !Number.isNaN(fromInputs(date, '00:00'))}
							<p class="availability-title">
								Program pentru <span class="day">{dayFmt.format(fromInputs(date, '00:00'))}</span>
							</p>
							{#if dayBookings.length === 0}
								<p class="hint free">Resursa este liberă toată ziua.</p>
							{:else}
								<ul class="busy">
									{#each dayBookings as b (b.id)}
										<li class:clash={conflictIds.has(b.id)}>
											<span class="busy-time">{range(b)}</span>
											<span class="busy-status">{STATUS_LABELS[b.status]}</span>
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
					</section>
				{/if}

				<!-- ---------- Purpose ---------- -->
				<div class="field">
					<div class="label-row">
						<label class="label" for="{uid}-purpose">Scopul rezervării</label>
						<span class="counter">{purpose.length}/{PURPOSE_MAX}</span>
					</div>
					<div class="control textarea" class:invalid={attempted && purposeError}>
						<textarea
							id="{uid}-purpose"
							rows="3"
							maxlength={PURPOSE_MAX}
							placeholder="De exemplu: Seminar de Baze de date, grupa 312"
							bind:value={purpose}
							aria-invalid={attempted && !!purposeError}
						></textarea>
					</div>
					{#if attempted && purposeError}
						<p class="hint error">{purposeError}</p>
					{/if}
				</div>

				{#if serverError}
					<p class="notice error" role="alert">{serverError}</p>
				{/if}
			</div>

			<footer class="foot">
				<button type="button" class="btn ghost" onclick={() => dialog?.close()}>Renunță</button>
				<button type="submit" class="btn primary" disabled={submitting || !user}>
					{submitting ? 'Se trimite…' : 'Confirmă rezervarea'}
				</button>
			</footer>
		</form>
	{/if}
</dialog>

<style>
	/* ---------- Dialog shell ---------- */
	.modal {
		width: min(calc(100% - 2rem), 38rem);
		max-width: 100%;
		max-height: calc(100dvh - 2rem);
		margin: auto;
		padding: 0;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
		color: var(--color-ink);
		box-shadow: 0 30px 80px -40px rgb(19 34 56 / 0.55);
	}

	.modal[open] {
		display: flex;
		animation: rise 220ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	.modal::backdrop {
		background-color: rgb(19 34 56 / 0.38);
		backdrop-filter: blur(2px);
		animation: fade-in 220ms ease;
	}

	:global(html:has(dialog.modal[open])) {
		overflow: hidden;
	}

	@keyframes rise {
		from {
			transform: translateY(0.75rem);
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
		width: 100%;
		min-height: 0;
	}

	/* ---------- Head ---------- */
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.5rem 1.25rem 1.25rem;
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
		font-size: 1.6rem;
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
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 1.5rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.group {
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.label {
		padding: 0;
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.label-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	.counter {
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-muted);
	}

	/* Segmented radio */
	.segmented {
		display: grid;
		grid-template-columns: 1fr 1fr;
		margin-top: 0.375rem;
		border: 1px solid var(--color-hairline);
	}

	.segment {
		position: relative;
		cursor: pointer;
	}

	.segment + .segment {
		border-left: 1px solid var(--color-hairline);
	}

	.segment input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		margin: 0;
	}

	.segment span {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		font-size: 0.875rem;
		color: var(--color-muted);
		background-color: var(--color-canvas);
		transition:
			background-color 150ms ease,
			color 150ms ease;
	}

	.segment:hover span {
		color: var(--color-ink);
	}

	.segment input:checked + span {
		background-color: var(--color-ink);
		color: var(--color-canvas);
		font-weight: 500;
	}

	.segment input:focus-visible + span {
		outline: 2px solid var(--color-brass);
		outline-offset: -2px;
	}

	/* Inputs */
	.control {
		display: flex;
		align-items: center;
		min-height: 2.75rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-canvas);
		transition:
			border-color 150ms ease,
			background-color 150ms ease;
	}

	.control:focus-within {
		border-color: var(--color-brass);
		background-color: var(--color-surface);
	}

	.control.invalid {
		border-color: var(--color-bordeaux);
	}

	.control select,
	.control input,
	.control textarea {
		flex: 1;
		width: 100%;
		min-width: 0;
		padding: 0.625rem 0.875rem;
		border: 0;
		background-color: transparent;
		font: inherit;
		font-size: 0.9rem;
		color: var(--color-ink);
		box-shadow: none;
	}

	.control select {
		padding-right: 2.25rem;
		cursor: pointer;
	}

	.control textarea {
		resize: vertical;
		min-height: 5rem;
		line-height: 1.5;
	}

	.control select:focus,
	.control input:focus,
	.control textarea:focus {
		outline: none;
		box-shadow: none;
	}

	.control textarea::placeholder {
		color: var(--color-muted);
		opacity: 0.75;
	}

	.slot-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.875rem;
	}

	.slot-grid .date {
		grid-column: 1 / -1;
	}

	.hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	.hint.error {
		color: var(--color-bordeaux);
	}

	.hint.free {
		color: var(--color-forest);
	}

	/* ---------- Availability ---------- */
	.availability {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-canvas);
	}

	.availability-title {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	.day {
		font-family: var(--font-serif);
		font-size: 0.95rem;
		color: var(--color-ink);
	}

	.conflict {
		padding: 0.75rem 0.875rem;
		border: 1px solid color-mix(in srgb, var(--color-bordeaux) 35%, transparent);
		border-left: 3px solid var(--color-bordeaux);
		background-color: color-mix(in srgb, var(--color-bordeaux) 7%, var(--color-surface));
		color: var(--color-bordeaux);
	}

	.conflict p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.conflict .conflict-title {
		margin-bottom: 0.25rem;
		font-family: var(--font-serif);
		font-size: 1rem;
		font-weight: 600;
	}

	.busy {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.busy li {
		display: inline-flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.3rem 0.625rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
		font-size: 0.8rem;
	}

	.busy li.clash {
		border-color: var(--color-bordeaux);
		color: var(--color-bordeaux);
	}

	.busy-time {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.busy-status {
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.busy li.clash .busy-status {
		color: inherit;
	}

	/* ---------- Notices ---------- */
	.notice {
		margin: 0;
		padding: 0.75rem 0.875rem;
		border-left: 3px solid var(--color-brass);
		background-color: color-mix(in srgb, var(--color-brass) 10%, var(--color-surface));
		font-size: 0.85rem;
	}

	.notice.error {
		border-left-color: var(--color-bordeaux);
		background-color: color-mix(in srgb, var(--color-bordeaux) 7%, var(--color-surface));
		color: var(--color-bordeaux);
	}

	/* ---------- Foot ---------- */
	.foot {
		display: flex;
		gap: 0.625rem;
		padding: 1rem 1.25rem calc(1rem + env(safe-area-inset-bottom));
		border-top: 1px solid var(--color-hairline);
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

	.primary:hover:not(:disabled) {
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
		.body,
		.foot {
			padding-inline: 2rem;
		}

		.title {
			font-size: 1.85rem;
		}

		.slot-grid {
			grid-template-columns: 1.4fr 1fr 1fr;
		}

		.slot-grid .date {
			grid-column: auto;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.modal[open],
		.modal::backdrop {
			animation: none;
		}
	}
</style>
