<script lang="ts">
	import type { ResourceDTO } from '#lib/types/index.ts';
	import { availabilityLabel, bookingHref, seatsLabel, TYPE_LABELS } from '#lib/utils/resource.ts';

	interface Props {
		resource: ResourceDTO;
		/** Opens the detail drawer for this resource. */
		ondetails: (resource: ResourceDTO) => void;
	}

	let { resource, ondetails }: Props = $props();

	const titleId = $props.id();
	const isRoom = $derived(resource.type === 'Room');
</script>

<article class="card" class:unavailable={!resource.isAvailable} aria-labelledby={titleId}>
	<header class="head">
		<span class="type-badge">{TYPE_LABELS[resource.type]}</span>
		<span class="status" data-available={resource.isAvailable}>
			<span class="dot" aria-hidden="true"></span>
			{availabilityLabel(resource)}
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

	<footer class="actions">
		<button type="button" class="btn ghost" onclick={() => ondetails(resource)}>
			Detalii & Program
		</button>
		{#if resource.isAvailable}
			<a class="btn primary" href={bookingHref(resource)}>Rezervă</a>
		{:else}
			<button type="button" class="btn primary" disabled title="Resursa nu poate fi rezervată momentan">
				Rezervă
			</button>
		{/if}
	</footer>
</article>

<style>
	.card {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 1.5rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
		transition:
			border-color 200ms ease,
			box-shadow 200ms ease;
	}

	.card:hover {
		border-color: color-mix(in srgb, var(--color-brass) 55%, var(--color-hairline));
		box-shadow: 0 20px 40px -32px rgb(19 34 56 / 0.45);
	}

	/* ---------- Head ---------- */
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.type-badge {
		padding: 0.125rem 0.5rem;
		border: 1px solid var(--color-brass);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--color-ink);
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.02em;
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

	/* ---------- Body ---------- */
	.name {
		margin: 1.25rem 0 0;
		font-size: 1.375rem;
		line-height: 1.25;
	}

	.description {
		margin: 0.625rem 0 0;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--color-muted);
	}

	.facts {
		margin: auto 0 0;
		padding-top: 1.25rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		font-size: 0.8125rem;
		color: var(--color-ink);
	}

	.fact {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.fact dt {
		display: flex;
		color: var(--color-brass);
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

	/* ---------- Actions ---------- */
	.actions {
		display: flex;
		gap: 0.625rem;
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--color-hairline);
	}

	.btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid var(--color-ink);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease,
			color 150ms ease;
	}

	.ghost {
		background-color: transparent;
		color: var(--color-ink);
		border-color: var(--color-hairline);
	}

	.ghost:hover {
		border-color: var(--color-ink);
	}

	.primary {
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

	.unavailable .name,
	.unavailable .description {
		opacity: 0.75;
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
		.btn {
			transition: none;
		}
	}
</style>
