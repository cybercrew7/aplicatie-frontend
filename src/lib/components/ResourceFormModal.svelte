<script lang="ts">
	import { untrack } from 'svelte';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { resourceService } from '#lib/api/resourceService.ts';
	import type { CreateResourcePayload, ResourceDTO, ResourceType } from '#lib/types/index.ts';
	import { TYPE_LABELS } from '#lib/utils/resource.ts';

	interface Props {
		open: boolean;
		/** Resource being edited; `null` creates a new one. */
		resource?: ResourceDTO | null;
		/** Full catalogue, used to keep inventory codes unique. */
		existing: readonly ResourceDTO[];
		onclose: () => void;
		onsaved: (resource: ResourceDTO, mode: 'created' | 'updated') => void;
	}

	let { open, resource = null, existing, onclose, onsaved }: Props = $props();

	const RESOURCE_TYPES: readonly ResourceType[] = ['Room', 'Equipment'];
	const NAME_MAX = 120;
	const DESCRIPTION_MAX = 300;

	const uid = $props.id();
	let dialog: HTMLDialogElement | undefined = $state();

	// ---------- Form state ----------
	let type = $state<ResourceType>('Room');
	let name = $state('');
	let description = $state('');
	let capacity = $state<number | null>(null);
	let location = $state('');
	let inventoryCode = $state('');
	let isAvailable = $state(true);

	let attempted = $state(false);
	let submitting = $state(false);
	let serverError = $state<string | null>(null);

	const editing = $derived(resource !== null);

	function reset() {
		type = resource?.type ?? 'Room';
		name = resource?.name ?? '';
		description = resource?.description ?? '';
		capacity = resource?.capacity ?? null;
		location = resource?.location ?? '';
		inventoryCode = resource?.inventoryCode ?? '';
		isAvailable = resource?.isAvailable ?? true;
		attempted = false;
		submitting = false;
		serverError = null;
	}

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			untrack(reset);
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	// ---------- Validation ----------
	const nameError = $derived(name.trim() ? null : 'Introduceți denumirea resursei.');

	const capacityError = $derived.by(() => {
		if (type !== 'Room') return null;
		if (capacity === null || capacity === undefined || Number.isNaN(capacity)) {
			return 'Introduceți numărul de locuri.';
		}
		if (!Number.isInteger(capacity) || capacity < 1) {
			return 'Capacitatea trebuie să fie un număr întreg pozitiv.';
		}
		return null;
	});

	const locationError = $derived(
		type === 'Room' && !location.trim() ? 'Introduceți amplasarea sălii.' : null
	);

	const inventoryError = $derived.by(() => {
		if (type !== 'Equipment') return null;
		const code = inventoryCode.trim().toUpperCase();
		if (!code) return 'Introduceți codul de inventar.';
		const taken = existing.some(
			(r) => r.id !== resource?.id && r.inventoryCode?.trim().toUpperCase() === code
		);
		return taken ? 'Acest cod de inventar este deja folosit.' : null;
	});

	const valid = $derived(!nameError && !capacityError && !locationError && !inventoryError);

	// ---------- Submit ----------
	function buildPayload(): CreateResourcePayload {
		const base = {
			name: name.trim(),
			description: description.trim(),
			type,
			isAvailable
		};
		if (type === 'Room') {
			return { ...base, capacity: capacity ?? undefined, location: location.trim() };
		}
		// Equipment keeps any location it already had, since the form does not edit it.
		return {
			...base,
			inventoryCode: inventoryCode.trim().toUpperCase(),
			location: resource?.type === 'Equipment' ? resource.location : undefined
		};
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		attempted = true;
		serverError = null;
		if (!valid || submitting) return;

		submitting = true;
		const payload = buildPayload();
		try {
			if (resource) {
				const updated = await resourceService.update(resource.id, payload);
				onsaved(updated ?? { ...resource, ...payload }, 'updated');
			} else {
				const created = await resourceService.create(payload);
				onsaved(created, 'created');
			}
		} catch (e) {
			serverError =
				e instanceof ApiError ? e.message : 'Resursa nu a putut fi salvată. Încercați din nou.';
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
					<p class="eyebrow">{editing ? 'Editare resursă' : 'Resursă nouă'}</p>
					<h2 id="{uid}-title" class="title">
						{editing ? (resource?.name ?? 'Resursă') : 'Adăugați în catalog'}
					</h2>
				</div>
				<button type="button" class="close" aria-label="Închide" onclick={() => dialog?.close()}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			</header>

			<div class="body">
				<fieldset class="group">
					<legend class="label">Tip resursă</legend>
					<div class="segmented">
						{#each RESOURCE_TYPES as value (value)}
							<label class="segment">
								<input type="radio" name="{uid}-type" {value} bind:group={type} />
								<span>{TYPE_LABELS[value]}</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<div class="field">
					<div class="label-row">
						<label class="label" for="{uid}-name">Denumire</label>
						<span class="counter">{name.length}/{NAME_MAX}</span>
					</div>
					<div class="control" class:invalid={attempted && nameError}>
						<input
							id="{uid}-name"
							type="text"
							maxlength={NAME_MAX}
							placeholder={type === 'Room' ? 'De exemplu: Amfiteatrul A2' : 'De exemplu: Videoproiector Epson'}
							bind:value={name}
							aria-invalid={attempted && !!nameError}
						/>
					</div>
					{#if attempted && nameError}<p class="hint error">{nameError}</p>{/if}
				</div>

				{#if type === 'Room'}
					<div class="pair">
						<div class="field">
							<label class="label" for="{uid}-capacity">Capacitate (locuri)</label>
							<div class="control" class:invalid={attempted && capacityError}>
								<input
									id="{uid}-capacity"
									type="number"
									min="1"
									step="1"
									inputmode="numeric"
									placeholder="30"
									bind:value={capacity}
									aria-invalid={attempted && !!capacityError}
								/>
							</div>
							{#if attempted && capacityError}<p class="hint error">{capacityError}</p>{/if}
						</div>
						<div class="field">
							<label class="label" for="{uid}-location">Amplasare</label>
							<div class="control" class:invalid={attempted && locationError}>
								<input
									id="{uid}-location"
									type="text"
									placeholder="Corp A, etaj 1"
									bind:value={location}
									aria-invalid={attempted && !!locationError}
								/>
							</div>
							{#if attempted && locationError}<p class="hint error">{locationError}</p>{/if}
						</div>
					</div>
				{:else}
					<div class="field">
						<label class="label" for="{uid}-inventory">Cod de inventar</label>
						<div class="control" class:invalid={attempted && inventoryError}>
							<input
								id="{uid}-inventory"
								type="text"
								class="mono"
								autocomplete="off"
								spellcheck="false"
								placeholder="INV-2026-0001"
								bind:value={inventoryCode}
								aria-invalid={attempted && !!inventoryError}
							/>
						</div>
						{#if attempted && inventoryError}
							<p class="hint error">{inventoryError}</p>
						{:else}
							<p class="hint">Codul unic de pe eticheta de inventar.</p>
						{/if}
					</div>
				{/if}

				<div class="field">
					<div class="label-row">
						<label class="label" for="{uid}-description">Descriere</label>
						<span class="counter">{description.length}/{DESCRIPTION_MAX}</span>
					</div>
					<div class="control textarea">
						<textarea
							id="{uid}-description"
							rows="3"
							maxlength={DESCRIPTION_MAX}
							placeholder="Dotări, observații, condiții de utilizare…"
							bind:value={description}
						></textarea>
					</div>
				</div>

				<label class="toggle">
					<input type="checkbox" bind:checked={isAvailable} />
					<span class="switch" aria-hidden="true"></span>
					<span class="toggle-text">
						<span class="toggle-title">Disponibil pentru rezervări</span>
						<span class="hint">
							{isAvailable
								? 'Resursa apare ca disponibilă în catalog.'
								: 'Resursa nu poate fi rezervată (de exemplu, în renovare sau service).'}
						</span>
					</span>
				</label>

				{#if serverError}
					<p class="notice" role="alert">{serverError}</p>
				{/if}
			</div>

			<footer class="foot">
				<button type="button" class="btn ghost" onclick={() => dialog?.close()}>Renunță</button>
				<button type="submit" class="btn primary" disabled={submitting}>
					{#if submitting}
						Se salvează…
					{:else}
						{editing ? 'Salvează modificările' : 'Adaugă resursa'}
					{/if}
				</button>
			</footer>
		</form>
	{/if}
</dialog>

<style>
	/* ---------- Dialog shell ---------- */
	.modal {
		width: min(calc(100% - 2rem), 36rem);
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
		overflow-wrap: anywhere;
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

	.pair {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.25rem 0.875rem;
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

	.control input:focus,
	.control textarea:focus {
		outline: none;
		box-shadow: none;
	}

	.control input::placeholder,
	.control textarea::placeholder {
		color: var(--color-muted);
		opacity: 0.7;
	}

	.control textarea {
		resize: vertical;
		min-height: 5rem;
		line-height: 1.5;
	}

	.mono {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	.hint.error {
		color: var(--color-bordeaux);
	}

	/* Availability switch */
	.toggle {
		position: relative;
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 1rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-canvas);
		cursor: pointer;
	}

	.toggle input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		margin: 0;
	}

	.switch {
		position: relative;
		flex-shrink: 0;
		width: 2.5rem;
		height: 1.4rem;
		margin-top: 0.1rem;
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		background-color: var(--color-surface);
		transition:
			background-color 150ms ease,
			border-color 150ms ease;
	}

	.switch::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 0.2rem;
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 9999px;
		background-color: var(--color-muted);
		transform: translateY(-50%);
		transition:
			transform 180ms ease,
			background-color 150ms ease;
	}

	.toggle input:checked + .switch {
		border-color: var(--color-forest);
		background-color: var(--color-forest);
	}

	.toggle input:checked + .switch::after {
		background-color: var(--color-surface);
		transform: translate(1.05rem, -50%);
	}

	.toggle input:focus-visible + .switch {
		outline: 2px solid var(--color-brass);
		outline-offset: 2px;
	}

	.toggle-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.toggle-title {
		font-size: 0.9rem;
		font-weight: 500;
	}

	.notice {
		margin: 0;
		padding: 0.75rem 0.875rem;
		border: 1px solid color-mix(in srgb, var(--color-bordeaux) 35%, transparent);
		border-left: 3px solid var(--color-bordeaux);
		background-color: color-mix(in srgb, var(--color-bordeaux) 7%, var(--color-surface));
		font-size: 0.85rem;
		color: var(--color-bordeaux);
	}

	/* ---------- Footer ---------- */
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
		opacity: 0.6;
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

		.pair {
			grid-template-columns: 0.8fr 1.2fr;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.modal[open] {
			animation: none;
		}

		.switch,
		.switch::after {
			transition: none;
		}
	}
</style>
