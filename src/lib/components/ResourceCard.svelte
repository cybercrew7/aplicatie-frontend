<script lang="ts">
	import { openBookingDrawer } from '#lib/stores/bookingStore.ts';
	import type { ReservationDTO, ResourceDTO } from '#lib/types/index.ts';
	import { toDateInput } from '#lib/utils/reservation.ts';
	import { seatsLabel, TYPE_LABELS } from '#lib/utils/resource.ts';
	import {
		buildDaySlots,
		calculateAvailabilitySummary,
		CLOSING_HOUR,
		hourLabel,
		isFreeNow,
		OPENING_HOUR,
		type DaySlot
	} from '#lib/utils/schedule.ts';

	interface Props {
		resource: ResourceDTO;
		/** All reservations (any resource); `null` while still loading. */
		reservations: readonly ReservationDTO[] | null;
		/** Current time, shared by the page so every card ticks together. */
		now: number;
		/** Opens the detail drawer for this resource. */
		ondetails: (resource: ResourceDTO) => void;
	}

	let { resource, reservations, now, ondetails }: Props = $props();

	type Tone = 'free' | 'busy' | 'closed' | 'loading';

	const titleId = $props.id();
	const isRoom = $derived(resource.type === 'Room');
	/** Romanian agreement: "Disponibilă" (sală) vs. "Disponibil" (echipament). */
	const fem = $derived(isRoom ? 'ă' : '');

	const today = $derived(toDateInput(new Date(now)));
	const currentHour = $derived(new Date(now).getHours());
	const slots = $derived<DaySlot[]>(
		reservations ? buildDaySlots(today, resource.id, reservations, now) : []
	);
	const summary = $derived(calculateAvailabilitySummary(slots));
	const freeNow = $derived(!!reservations && isFreeNow(resource.id, reservations, now));

	const status = $derived.by<{ tone: Tone; label: string }>(() => {
		if (!resource.isAvailable) return { tone: 'closed', label: `Indisponibil${fem} · scos din uz` };
		if (!reservations) return { tone: 'loading', label: 'Se verifică programul…' };

		const free = `${summary.freeHours} ${summary.freeHours === 1 ? 'oră liberă' : 'ore libere'}`;
		if (currentHour < OPENING_HOUR) return { tone: 'free', label: `Deschide la ${hourLabel(OPENING_HOUR)} · ${free}` };
		if (currentHour >= CLOSING_HOUR) return { tone: 'closed', label: 'Program încheiat pentru azi' };
		if (freeNow) return { tone: 'free', label: `Disponibil${fem} acum · ${free}` };
		return {
			tone: 'busy',
			label: summary.nextAvailable ? `Ocupat${fem} acum · liber de la ${summary.nextAvailable.label}` : `Ocupat${fem} până la închidere`
		};
	});

	function blockTitle(slot: DaySlot): string {
		const range = `${slot.label}–${hourLabel(slot.hour + 1)}`;
		if (slot.status === 'occupied') return `${range} · Ocupat`;
		if (slot.status === 'past') return `${range} · Interval trecut`;
		return `${range} · Liber — rezervă`;
	}

	function bookAt(slot: DaySlot) {
		openBookingDrawer(resource.id, today, slot.hour);
	}
</script>

<article class="card" class:unavailable={!resource.isAvailable} aria-labelledby={titleId}>
	<header class="head">
		<span class="type-badge">{TYPE_LABELS[resource.type]}</span>
		<span class="status" data-tone={status.tone}>
			<span class="dot" aria-hidden="true"></span>
			{status.label}
		</span>
	</header>

	<h2 id={titleId} class="name">{resource.name}</h2>
	<p class="description">{resource.description}</p>

	<dl class="facts">
		<div class="fact">
			<dt>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
					<circle cx="12" cy="10" r="2.25" />
				</svg>
				<span class="visually-hidden">Locație</span>
			</dt>
			<dd>{resource.location ?? 'Locație nespecificată'}</dd>
		</div>

		{#if isRoom}
			<div class="fact">
				<dt>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="9" cy="8" r="3.25" />
						<path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
						<path d="M16 5a3.25 3.25 0 0 1 0 6.3M18 14.3c1.8.7 3 2.5 3 5.2" />
					</svg>
					<span class="visually-hidden">Capacitate</span>
				</dt>
				<dd>{resource.capacity !== undefined ? seatsLabel(resource.capacity) : 'Capacitate nespecificată'}</dd>
			</div>
		{:else}
			<div class="fact">
				<dt>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7.1 7.1a1.4 1.4 0 0 1-2 0z" />
						<circle cx="8.25" cy="8.25" r="1.25" />
					</svg>
					<span class="visually-hidden">Cod inventar</span>
				</dt>
				<dd class="code">{resource.inventoryCode ?? '—'}</dd>
			</div>
		{/if}
	</dl>

	<!-- ---------- Mini daily timeline ---------- -->
	<div class="timeline">
		<p class="timeline-head">
			<span>Programul de azi</span>
			{#if reservations && resource.isAvailable}
				<span class="timeline-free">{summary.freeHours}/{summary.totalHours}</span>
			{/if}
		</p>
		<div class="strip" role="group" aria-label="Programul de azi pentru {resource.name}">
			{#if !reservations}
				{#each { length: CLOSING_HOUR - OPENING_HOUR }, i (i)}
					<span class="block loading"></span>
				{/each}
			{:else}
				{#each slots as slot (slot.hour)}
					{#if slot.status === 'available' && resource.isAvailable}
						<button
							type="button"
							class="block"
							data-status="available"
							title={blockTitle(slot)}
							aria-label="Rezervă {resource.name}, {slot.label}–{hourLabel(slot.hour + 1)}"
							onclick={() => bookAt(slot)}
						></button>
					{:else}
						<span
							class="block"
							data-status={resource.isAvailable ? slot.status : 'past'}
							class:now={slot.hour === currentHour}
							title={blockTitle(slot)}
						></span>
					{/if}
				{/each}
			{/if}
		</div>
		<div class="ticks" aria-hidden="true">
			<span>08</span><span>11</span><span>14</span><span>17</span><span>20</span>
		</div>
	</div>

	<footer class="actions">
		<button type="button" class="btn ghost" onclick={() => ondetails(resource)}>Detalii</button>
		<button
			type="button"
			class="btn primary"
			disabled={!resource.isAvailable}
			title={resource.isAvailable ? undefined : 'Resursa nu poate fi rezervată momentan'}
			onclick={() => openBookingDrawer(resource.id)}
		>
			Rezervă
		</button>
	</footer>
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 1.5rem;
		border: 1px solid var(--border-hairline);
		background-color: var(--bg-surface);
		transition:
			border-color 200ms ease,
			box-shadow 200ms ease;
	}

	.card::before {
		content: '';
		position: absolute;
		inset: -1px -1px auto;
		height: 2px;
		background-color: var(--border-gold);
		transform: scaleX(0);
		transform-origin: left;
		transition: transform 300ms ease;
	}

	.card:hover {
		border-color: color-mix(in srgb, var(--border-gold) 55%, var(--border-hairline));
		box-shadow: 0 24px 44px -34px rgb(11 25 44 / 0.5);
	}

	.card:hover::before {
		transform: scaleX(1);
	}

	/* ---------- Head ---------- */
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.type-badge {
		flex-shrink: 0;
		padding: 0.125rem 0.5rem;
		border: 1px solid var(--border-gold);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-primary);
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		padding: 0.2rem 0.55rem;
		border-radius: 9999px;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		text-align: right;
	}

	.status[data-tone='free'] {
		background-color: color-mix(in srgb, var(--accent-emerald) 9%, var(--bg-surface));
		color: var(--accent-emerald);
	}

	.status[data-tone='busy'] {
		background-color: color-mix(in srgb, var(--accent-bordeaux) 8%, var(--bg-surface));
		color: var(--accent-bordeaux);
	}

	.status[data-tone='closed'],
	.status[data-tone='loading'] {
		background-color: var(--bg-subtle);
		color: var(--ink-secondary);
	}

	.dot {
		flex-shrink: 0;
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 9999px;
		background-color: currentColor;
	}

	.status[data-tone='free'] .dot {
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-emerald) 18%, transparent);
	}

	/* ---------- Body ---------- */
	.name {
		margin: 1.25rem 0 0;
		font-size: 1.45rem;
		line-height: 1.2;
	}

	.description {
		margin: 0.5rem 0 0;
		font-size: 0.88rem;
		line-height: 1.55;
		color: var(--ink-secondary);
	}

	.facts {
		margin: auto 0 0;
		padding-top: 1.125rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		font-size: 0.8125rem;
		color: var(--ink-primary);
	}

	.fact {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.fact dt {
		display: flex;
		color: var(--border-gold);
	}

	.fact svg {
		width: 1rem;
		height: 1rem;
	}

	.fact dd {
		margin: 0;
	}

	.code {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.06em;
	}

	/* ---------- Timeline ---------- */
	.timeline {
		margin-top: 1.125rem;
	}

	.timeline-head {
		display: flex;
		justify-content: space-between;
		margin: 0 0 0.45rem;
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-secondary);
	}

	.timeline-free {
		letter-spacing: 0.06em;
		color: var(--accent-emerald);
		font-variant-numeric: tabular-nums;
	}

	.strip {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 2px;
		height: 1.5rem;
	}

	.block {
		position: relative;
		display: block;
		height: 100%;
		padding: 0;
		border: 0;
		border-radius: 1px;
	}

	.block[data-status='available'] {
		background-color: color-mix(in srgb, var(--accent-emerald) 16%, #fbf8f0);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-emerald) 22%, transparent);
		cursor: pointer;
		transition:
			background-color 120ms ease,
			transform 120ms ease;
	}

	.block[data-status='available']:hover,
	.block[data-status='available']:focus-visible {
		background-color: var(--accent-emerald);
		box-shadow: inset 0 0 0 1px var(--border-gold);
		transform: scaleY(1.15);
		outline: none;
	}

	.block[data-status='occupied'] {
		background-color: var(--accent-bordeaux);
	}

	.block[data-status='past'] {
		background-color: var(--bg-subtle);
		background-image: repeating-linear-gradient(
			135deg,
			transparent 0 3px,
			rgb(11 25 44 / 0.06) 3px 4px
		);
	}

	.block.loading {
		background-color: var(--bg-subtle);
		animation: pulse 1.4s ease-in-out infinite;
	}

	.block.now::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -5px;
		width: 4px;
		height: 4px;
		border-radius: 9999px;
		background-color: var(--border-gold);
		transform: translateX(-50%);
	}

	@keyframes pulse {
		50% {
			opacity: 0.45;
		}
	}

	.ticks {
		display: flex;
		justify-content: space-between;
		margin-top: 0.35rem;
		font-size: 0.6rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink-secondary);
		opacity: 0.8;
	}

	/* ---------- Actions ---------- */
	.actions {
		display: flex;
		gap: 0.625rem;
		margin-top: 1.125rem;
		padding-top: 1.125rem;
		border-top: 1px solid var(--border-hairline);
	}

	.btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid var(--ink-primary);
		font: inherit;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.ghost {
		background-color: transparent;
		color: var(--ink-primary);
		border-color: var(--border-hairline);
	}

	.ghost:hover {
		border-color: var(--ink-primary);
	}

	.primary {
		background-color: var(--ink-primary);
		color: var(--bg-canvas);
	}

	.primary:not(:disabled):hover {
		background-color: var(--accent-bordeaux);
		border-color: var(--accent-bordeaux);
	}

	.primary:disabled {
		cursor: not-allowed;
		background-color: transparent;
		border-color: var(--border-hairline);
		color: var(--ink-secondary);
	}

	.unavailable .name,
	.unavailable .description {
		opacity: 0.7;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.card,
		.card::before,
		.btn,
		.block {
			transition: none;
		}

		.block.loading {
			animation: none;
		}
	}
</style>
