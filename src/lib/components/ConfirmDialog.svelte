<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		eyebrow?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		/** Shows a pending label and locks the dialog while the action runs. */
		busy?: boolean;
		children?: Snippet;
		onconfirm: () => void;
		onclose: () => void;
	}

	let {
		open,
		title,
		eyebrow = 'Confirmare',
		confirmLabel = 'Confirmă',
		cancelLabel = 'Renunță',
		busy = false,
		children,
		onconfirm,
		onclose
	}: Props = $props();

	const uid = $props.id();
	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	// Escape must not dismiss the dialog halfway through the action.
	function oncancel(event: Event) {
		if (busy) event.preventDefault();
	}
</script>

<dialog
	bind:this={dialog}
	class="confirm"
	role="alertdialog"
	aria-labelledby="{uid}-title"
	aria-describedby="{uid}-desc"
	{oncancel}
	{onclose}
>
	{#if open}
		<div class="panel">
			<span class="mark" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
				</svg>
			</span>
			<p class="eyebrow">{eyebrow}</p>
			<h2 id="{uid}-title" class="title">{title}</h2>
			<div id="{uid}-desc" class="desc">
				{@render children?.()}
			</div>
			<div class="buttons">
				<button type="button" class="btn ghost" disabled={busy} onclick={() => dialog?.close()}>
					{cancelLabel}
				</button>
				<button type="button" class="btn danger" disabled={busy} onclick={onconfirm}>
					{busy ? 'Se procesează…' : confirmLabel}
				</button>
			</div>
		</div>
	{/if}
</dialog>

<style>
	.confirm {
		width: min(calc(100% - 2rem), 26rem);
		max-width: 100%;
		margin: auto;
		padding: 0;
		border: 1px solid var(--color-hairline);
		border-top: 3px solid var(--color-bordeaux);
		background-color: var(--color-surface);
		color: var(--color-ink);
		box-shadow: 0 30px 80px -40px rgb(19 34 56 / 0.55);
	}

	.confirm[open] {
		animation: rise 200ms cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	.confirm::backdrop {
		background-color: rgb(19 34 56 / 0.38);
		backdrop-filter: blur(2px);
	}

	@keyframes rise {
		from {
			transform: translateY(0.5rem);
			opacity: 0;
		}
	}

	.panel {
		padding: 1.75rem 1.5rem 1.5rem;
		text-align: center;
	}

	.mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border: 1px solid color-mix(in srgb, var(--color-bordeaux) 35%, transparent);
		border-radius: 9999px;
		color: var(--color-bordeaux);
	}

	.mark svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	.eyebrow {
		margin: 1rem 0 0;
		font-size: 0.65rem;
		font-weight: 500;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--color-brass);
	}

	.title {
		margin: 0.5rem 0 0;
		font-size: 1.4rem;
		overflow-wrap: anywhere;
	}

	.desc {
		margin-top: 0.75rem;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--color-muted);
	}

	.desc :global(p) {
		margin: 0;
	}

	.desc :global(p + p) {
		margin-top: 0.5rem;
	}

	.desc :global(strong) {
		font-weight: 600;
		color: var(--color-ink);
	}

	.buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.625rem;
		margin-top: 1.5rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.75rem;
		padding: 0.5rem 1rem;
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

	.btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
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

	@media (prefers-reduced-motion: reduce) {
		.confirm[open] {
			animation: none;
		}
	}
</style>
