<script lang="ts">
	import { onMount } from 'svelte';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { resourceService } from '#lib/api/resourceService.ts';
	import ResourceCard from '#lib/components/ResourceCard.svelte';
	import ResourceDetailModal from '#lib/components/ResourceDetailModal.svelte';
	import { connectionMode } from '#lib/stores/authStore.ts';
	import type { ResourceDTO, ResourceType } from '#lib/types/index.ts';

	type TypeFilter = 'All' | ResourceType;

	const TABS: { value: TypeFilter; label: string }[] = [
		{ value: 'All', label: 'Toate' },
		{ value: 'Room', label: 'Săli' },
		{ value: 'Equipment', label: 'Echipamente' }
	];

	let resources = $state<ResourceDTO[] | null>(null);
	let error = $state<string | null>(null);

	let typeFilter = $state<TypeFilter>('All');
	let query = $state('');
	let minCapacity = $state<number | null>(null);
	let availableOnly = $state(false);

	let selected = $state<ResourceDTO | null>(null);

	/** Case- and diacritic-insensitive, so "sala" matches "Sală". */
	function normalize(text: string): string {
		return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('ro');
	}

	const counts = $derived<Record<TypeFilter, number>>({
		All: resources?.length ?? 0,
		Room: resources?.filter((r) => r.type === 'Room').length ?? 0,
		Equipment: resources?.filter((r) => r.type === 'Equipment').length ?? 0
	});

	/** Capacity only applies on the "Săli" tab, where its input is shown. */
	const capacityApplies = $derived(typeFilter === 'Room' && !!minCapacity && minCapacity > 0);

	const filtered = $derived.by<ResourceDTO[]>(() => {
		if (!resources) return [];
		const q = normalize(query.trim());

		return resources.filter((r) => {
			if (typeFilter !== 'All' && r.type !== typeFilter) return false;
			if (availableOnly && !r.isAvailable) return false;
			if (capacityApplies && (r.capacity ?? 0) < (minCapacity ?? 0)) return false;
			if (!q) return true;
			return [r.name, r.description, r.location, r.inventoryCode].some(
				(field) => field !== undefined && normalize(field).includes(q)
			);
		});
	});

	const hasFilters = $derived(
		typeFilter !== 'All' || query.trim() !== '' || capacityApplies || availableOnly
	);

	function resetFilters() {
		typeFilter = 'All';
		query = '';
		minCapacity = null;
		availableOnly = false;
	}

	// Client-only: the relative `/api` URL is resolved by the browser (and Nginx).
	onMount(async () => {
		try {
			resources = await resourceService.getAll();
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Resursele nu au putut fi încărcate.';
		}
	});
</script>

<svelte:head>
	<title>Săli & Echipamente — Atrium</title>
</svelte:head>

<!-- ---------- Header ---------- -->
<section class="intro">
	<p class="eyebrow">Catalogul resurselor</p>
	<h1 class="title">Săli & Echipamente</h1>
	<div class="rule" aria-hidden="true"></div>
	<p class="lead">
		Consultați spațiile și dotările instituției, verificați programul zilei și rezervați direct
		resursa potrivită.
	</p>
</section>

<!-- ---------- Filter toolbar ---------- -->
<search class="toolbar" aria-label="Filtrare resurse">
	<div class="segmented" role="group" aria-label="Tip resursă">
		{#each TABS as tab (tab.value)}
			<button
				type="button"
				class="segment"
				aria-pressed={typeFilter === tab.value}
				onclick={() => (typeFilter = tab.value)}
			>
				{tab.label}
				<span class="count">{resources ? counts[tab.value] : '–'}</span>
			</button>
		{/each}
	</div>

	<div class="controls">
		<label class="field search">
			<span class="field-label">Căutare</span>
			<span class="input-wrap">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
					<circle cx="11" cy="11" r="6.5" />
					<path d="M16 16l4.5 4.5" />
				</svg>
				<input
					type="search"
					placeholder="Nume, descriere sau locație"
					autocomplete="off"
					bind:value={query}
				/>
			</span>
		</label>

		{#if typeFilter === 'Room'}
			<label class="field capacity">
				<span class="field-label">Capacitate minimă</span>
				<span class="input-wrap">
					<input type="number" min="1" step="1" inputmode="numeric" placeholder="Orice" bind:value={minCapacity} />
					<span class="suffix" aria-hidden="true">locuri</span>
				</span>
			</label>
		{/if}

		<label class="switch">
			<input type="checkbox" role="switch" bind:checked={availableOnly} />
			<span class="track" aria-hidden="true"><span class="thumb"></span></span>
			<span class="switch-label">Doar disponibile</span>
		</label>
	</div>
</search>

<!-- ---------- Results ---------- -->
<section class="results" aria-labelledby="results-heading">
	<div class="results-head">
		<h2 id="results-heading" class="results-count" aria-live="polite">
			{#if resources}
				{filtered.length === resources.length
					? `${resources.length} resurse`
					: `${filtered.length} din ${resources.length} resurse`}
			{:else if !error}
				Se încarcă resursele…
			{/if}
		</h2>
		{#if hasFilters}
			<button type="button" class="reset" onclick={resetFilters}>Resetează filtrele</button>
		{/if}
	</div>

	{#if error}
		<p class="state error" role="alert">{error}</p>
	{:else if resources === null}
		<ul class="grid" aria-busy="true">
			{#each { length: 6 }, i (i)}
				<li class="skeleton" aria-hidden="true">
					<span class="bone short"></span>
					<span class="bone title-bone"></span>
					<span class="bone"></span>
					<span class="bone"></span>
				</li>
			{/each}
		</ul>
	{:else if filtered.length === 0}
		<div class="state empty">
			<p class="empty-title">Nicio resursă nu corespunde criteriilor.</p>
			<p>Încercați un alt termen de căutare sau eliminați unele filtre.</p>
			<button type="button" class="reset" onclick={resetFilters}>Resetează filtrele</button>
		</div>
	{:else}
		<ul class="grid">
			{#each filtered as resource (resource.id)}
				<li>
					<ResourceCard {resource} ondetails={(r) => (selected = r)} />
				</li>
			{/each}
		</ul>
	{/if}

	{#if $connectionMode === 'demo' && resources}
		<p class="demo-note">
			<span class="demo-mark" aria-hidden="true"></span>
			Serverul nu este disponibil — sunt afișate date demonstrative.
		</p>
	{/if}
</section>

<ResourceDetailModal resource={selected} onclose={() => (selected = null)} />

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

	/* ---------- Toolbar ---------- */
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		margin-top: 3rem;
		padding: 1.25rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
	}

	button {
		font: inherit;
		cursor: pointer;
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

	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.field-label {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.input-wrap {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 2.75rem;
		padding-inline: 0.875rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-canvas);
		transition:
			border-color 150ms ease,
			background-color 150ms ease;
	}

	.input-wrap:focus-within {
		border-color: var(--color-brass);
		background-color: var(--color-surface);
	}

	.input-wrap svg {
		flex-shrink: 0;
		width: 1.1rem;
		height: 1.1rem;
		color: var(--color-muted);
	}

	.input-wrap input {
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 0.9rem;
		color: var(--color-ink);
		box-shadow: none;
	}

	.input-wrap input:focus {
		outline: none;
		box-shadow: none;
	}

	.input-wrap input::placeholder {
		color: var(--color-muted);
		opacity: 0.75;
	}

	.suffix {
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	/* ---------- Switch ---------- */
	.switch {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		align-self: flex-start;
		min-height: 2.75rem;
		cursor: pointer;
		user-select: none;
	}

	.switch input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		margin: 0;
	}

	.switch .track {
		position: relative;
		width: 2.5rem;
		height: 1.375rem;
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		background-color: var(--color-canvas);
		transition:
			background-color 200ms ease,
			border-color 200ms ease;
	}

	.thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: calc(1.375rem - 6px);
		height: calc(1.375rem - 6px);
		border-radius: 9999px;
		background-color: var(--color-muted);
		transition:
			transform 200ms ease,
			background-color 200ms ease;
	}

	.switch input:checked + .track {
		border-color: var(--color-forest);
		background-color: var(--color-forest);
	}

	.switch input:checked + .track .thumb {
		background-color: var(--color-surface);
		transform: translateX(1.125rem);
	}

	.switch input:focus-visible + .track {
		outline: 2px solid var(--color-brass);
		outline-offset: 2px;
	}

	.switch-label {
		font-size: 0.875rem;
		color: var(--color-ink);
	}

	/* ---------- Results ---------- */
	.results {
		margin-top: 2.5rem;
	}

	.results-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.results-count {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.reset {
		padding: 0;
		border: 0;
		background: transparent;
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		color: var(--color-bordeaux);
		text-decoration: underline;
		text-decoration-color: var(--color-brass);
		text-underline-offset: 0.25em;
	}

	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1.25rem;
	}

	/* ---------- Loading skeleton ---------- */
	.skeleton {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-height: 17rem;
		padding: 1.5rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
	}

	.bone {
		height: 0.75rem;
		background-color: var(--color-canvas);
		animation: pulse 1.4s ease-in-out infinite;
	}

	.bone.short {
		width: 30%;
	}

	.bone.title-bone {
		width: 70%;
		height: 1.5rem;
		margin-block: 0.75rem 0.25rem;
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

	.state .reset {
		margin-top: 1.25rem;
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

	/* ---------- Breakpoints ---------- */
	@media (min-width: 640px) {
		.title {
			font-size: 3rem;
			line-height: 1;
		}

		.toolbar {
			padding: 1.5rem 1.75rem;
		}

		.controls {
			flex-direction: row;
			align-items: flex-end;
			gap: 1.25rem;
		}

		.search {
			flex: 1;
		}

		.capacity {
			width: 11rem;
		}

		.switch {
			align-self: flex-end;
		}

		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (min-width: 1024px) {
		.grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 1.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bone {
			animation: none;
		}

		.segment::after,
		.thumb,
		.switch .track {
			transition: none;
		}
	}
</style>
