<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { ApiError } from '#lib/api/httpClient.ts';
	import { reservationService } from '#lib/api/reservationService.ts';
	import { resourceService } from '#lib/api/resourceService.ts';
	import { userService } from '#lib/api/userService.ts';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import ResourceFormModal from '#lib/components/ResourceFormModal.svelte';
	import { authStore, connectionMode } from '#lib/stores/authStore.ts';
	import type { ReservationDTO, ResourceDTO, ResourceType, UserDTO, UserRole } from '#lib/types/index.ts';
	import { isUpcoming } from '#lib/utils/reservation.ts';
	import { availabilityLabel, seatsLabel, TYPE_LABELS } from '#lib/utils/resource.ts';

	type Tab = 'resources' | 'users';
	type TypeFilter = 'all' | ResourceType;
	type ToastKind = 'success' | 'error';

	const TABS: { value: Tab; label: string }[] = [
		{ value: 'resources', label: 'Resurse' },
		{ value: 'users', label: 'Utilizatori' }
	];

	const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
		{ value: 'all', label: 'Toate' },
		{ value: 'Room', label: 'Săli' },
		{ value: 'Equipment', label: 'Echipamente' }
	];

	const ROLES: readonly UserRole[] = ['Student', 'Profesor', 'Admin'];
	const ROLE_LABELS: Record<UserRole, string> = {
		Student: 'Student',
		Profesor: 'Profesor',
		Admin: 'Administrator'
	};

	const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	// ---------- Session ----------
	const currentUser = $derived($authStore.currentUser);
	const isAdmin = $derived(currentUser?.role === 'Admin');

	// ---------- Data ----------
	let resources = $state<ResourceDTO[] | null>(null);
	let users = $state<UserDTO[] | null>(null);
	let reservations = $state<ReservationDTO[]>([]);
	let resourcesError = $state<string | null>(null);
	let usersError = $state<string | null>(null);

	const activeBookings = $derived.by(() => {
		const now = Date.now();
		const byResource = new Map<number, number>();
		const byUser = new Map<number, number>();
		for (const r of reservations) {
			if (!isUpcoming(r, now)) continue;
			byResource.set(r.resourceId, (byResource.get(r.resourceId) ?? 0) + 1);
			byUser.set(r.userId, (byUser.get(r.userId) ?? 0) + 1);
		}
		return { byResource, byUser };
	});

	// ---------- Tabs ----------
	let tab = $state<Tab>('resources');
	const tabButtons: Partial<Record<Tab, HTMLButtonElement>> = {};

	function onTabKeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const index = TABS.findIndex((t) => t.value === tab);
		const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
		tab = next.value;
		tabButtons[next.value]?.focus();
	}

	// ---------- Resource filters ----------
	let typeFilter = $state<TypeFilter>('all');
	let query = $state('');

	const visibleResources = $derived.by(() => {
		if (!resources) return [];
		const q = query.trim().toLocaleLowerCase('ro');
		return resources
			.filter((r) => typeFilter === 'all' || r.type === typeFilter)
			.filter(
				(r) =>
					!q ||
					[r.name, r.location, r.inventoryCode]
						.filter(Boolean)
						.some((v) => v!.toLocaleLowerCase('ro').includes(q))
			)
			.toSorted((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'ro'));
	});

	const typeCounts = $derived<Record<TypeFilter, number>>({
		all: resources?.length ?? 0,
		Room: resources?.filter((r) => r.type === 'Room').length ?? 0,
		Equipment: resources?.filter((r) => r.type === 'Equipment').length ?? 0
	});

	// ---------- Create / edit resource ----------
	let formOpen = $state(false);
	let editing = $state<ResourceDTO | null>(null);
	let freshResourceId = $state<number | null>(null);

	function openForm(resource: ResourceDTO | null = null) {
		if (!isAdmin) return;
		editing = resource;
		formOpen = true;
	}

	function onResourceSaved(saved: ResourceDTO, mode: 'created' | 'updated') {
		formOpen = false;
		const list = resources ?? [];
		resources =
			mode === 'created' ? [...list, saved] : list.map((r) => (r.id === saved.id ? saved : r));
		freshResourceId = saved.id;
		if (mode === 'created' && typeFilter !== 'all' && typeFilter !== saved.type) typeFilter = 'all';
		showToast(
			'success',
			mode === 'created'
				? `${saved.name} a fost adăugat în catalog.`
				: `Modificările pentru ${saved.name} au fost salvate.`
		);
	}

	// ---------- Delete resource ----------
	let deleting = $state<ResourceDTO | null>(null);
	let deleteBusy = $state(false);
	const deletingBookings = $derived(
		deleting ? (activeBookings.byResource.get(deleting.id) ?? 0) : 0
	);

	async function confirmDelete() {
		const target = deleting;
		if (!target || !isAdmin) return;
		deleteBusy = true;
		try {
			await resourceService.remove(target.id);
			resources = (resources ?? []).filter((r) => r.id !== target.id);
			showToast('success', `${target.name} a fost eliminat din catalog.`);
			deleting = null;
		} catch (e) {
			showToast(
				'error',
				e instanceof ApiError ? e.message : 'Resursa nu a putut fi ștearsă. Încercați din nou.'
			);
		} finally {
			deleteBusy = false;
		}
	}

	// ---------- Register user ----------
	let newName = $state('');
	let newEmail = $state('');
	let newRole = $state<UserRole>('Student');
	let userAttempted = $state(false);
	let userSubmitting = $state(false);
	let userServerError = $state<string | null>(null);
	let freshUserId = $state<number | null>(null);
	let nameInput: HTMLInputElement | undefined = $state();

	const userNameError = $derived(newName.trim() ? null : 'Introduceți numele complet.');
	const userEmailError = $derived.by(() => {
		const email = newEmail.trim().toLowerCase();
		if (!email) return 'Introduceți adresa de e-mail.';
		if (!EMAIL_PATTERN.test(email)) return 'Adresa de e-mail nu este validă.';
		if (users?.some((u) => u.email.toLowerCase() === email)) {
			return 'Există deja un cont cu această adresă.';
		}
		return null;
	});

	async function registerUser(event: SubmitEvent) {
		event.preventDefault();
		userAttempted = true;
		userServerError = null;
		if (!isAdmin || userNameError || userEmailError || userSubmitting) return;

		userSubmitting = true;
		try {
			const created = await userService.create({
				name: newName.trim(),
				email: newEmail.trim().toLowerCase(),
				role: newRole
			});
			users = [...(users ?? []), created];
			freshUserId = created.id;
			showToast('success', `Contul pentru ${created.name} a fost creat.`);
			newName = '';
			newEmail = '';
			newRole = 'Student';
			userAttempted = false;
			await tick();
			nameInput?.focus();
		} catch (e) {
			userServerError =
				e instanceof ApiError ? e.message : 'Utilizatorul nu a putut fi înregistrat.';
		} finally {
			userSubmitting = false;
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

	// ---------- Helpers ----------
	function initialsOf(name: string): string {
		const parts = name.trim().split(/\s+/);
		const first = parts[0]?.[0] ?? '';
		const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
		return (first + last).toUpperCase();
	}

	function messageOf(e: unknown, fallback: string): string {
		return e instanceof ApiError ? e.message : fallback;
	}

	// ---------- Load ----------
	onMount(() => {
		resourceService
			.getAll()
			.then((rows) => (resources = rows))
			.catch((e: unknown) => (resourcesError = messageOf(e, 'Catalogul nu a putut fi încărcat.')));

		userService
			.getAll()
			.then((rows) => (users = rows))
			.catch((e: unknown) => (usersError = messageOf(e, 'Utilizatorii nu au putut fi încărcați.')));

		// Only used for "active bookings" hints; failure is not fatal.
		reservationService
			.getAll()
			.then((rows) => (reservations = rows))
			.catch(() => {});

		return () => clearTimeout(toastTimer);
	});
</script>

<svelte:head>
	<title>Administrare — Atrium</title>
</svelte:head>

<!-- ---------- Header ---------- -->
<section class="intro">
	<p class="eyebrow">Cancelaria resurselor</p>
	<h1 class="title">Administrare</h1>
	<div class="rule" aria-hidden="true"></div>
	<p class="lead">
		Gestionați catalogul de săli și echipamente și conturile utilizatorilor instituției.
	</p>
</section>

<!-- ---------- Role notice ---------- -->
{#if !isAdmin}
	<aside class="role-notice" aria-labelledby="role-notice-title">
		<span class="seal" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="5" y="10.5" width="14" height="10" rx="1" />
				<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
			</svg>
		</span>
		<div class="notice-text">
			<h2 id="role-notice-title" class="notice-title">Acces în regim de consultare</h2>
			<p>
				{#if currentUser}
					Sunteți conectat ca <strong>{currentUser.name}</strong> ({ROLE_LABELS[currentUser.role]}).
				{:else}
					Nu sunteți autentificat.
				{/if}
				Adăugarea, modificarea și ștergerea înregistrărilor necesită rolul
				<span class="role-tag">Admin</span>.
			</p>
		</div>
		<button type="button" class="btn primary" onclick={() => authStore.switchDemoUser('Admin')}>
			Comută pe profilul Admin
		</button>
	</aside>
{/if}

<!-- ---------- Tabs ---------- -->
<div class="tabs" role="tablist" aria-label="Secțiuni de administrare" tabindex="-1" onkeydown={onTabKeydown}>
	{#each TABS as t (t.value)}
		<button
			type="button"
			role="tab"
			id="tab-{t.value}"
			class="tab"
			aria-selected={tab === t.value}
			aria-controls="panel-{t.value}"
			tabindex={tab === t.value ? 0 : -1}
			bind:this={tabButtons[t.value]}
			onclick={() => (tab = t.value)}
		>
			{t.label}
			<span class="count">
				{#if t.value === 'resources'}{resources?.length ?? '–'}{:else}{users?.length ?? '–'}{/if}
			</span>
		</button>
	{/each}
</div>

<!-- ---------- Resources ---------- -->
{#if tab === 'resources'}
	<div id="panel-resources" class="panel" role="tabpanel" aria-labelledby="tab-resources">
		<div class="toolbar">
			<div class="filters" role="group" aria-label="Tip resursă">
				{#each TYPE_FILTERS as f (f.value)}
					<button
						type="button"
						class="chip"
						aria-pressed={typeFilter === f.value}
						onclick={() => (typeFilter = f.value)}
					>
						{f.label}
						<span class="chip-count">{resources ? typeCounts[f.value] : '–'}</span>
					</button>
				{/each}
			</div>

			<div class="toolbar-end">
				<label class="search">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
						<circle cx="11" cy="11" r="6.5" />
						<path d="M20 20l-4.2-4.2" />
					</svg>
					<span class="visually-hidden">Caută în catalog</span>
					<input type="search" placeholder="Denumire, amplasare, cod…" bind:value={query} />
				</label>
				<button
					type="button"
					class="btn primary"
					disabled={!isAdmin || resources === null}
					title={isAdmin ? undefined : 'Necesită rolul Admin'}
					onclick={() => openForm()}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
						<path d="M12 5v14M5 12h14" />
					</svg>
					Resursă nouă
				</button>
			</div>
		</div>

		{#if resourcesError}
			<p class="state error" role="alert">{resourcesError}</p>
		{:else if resources === null}
			<div class="table-card" aria-busy="true">
				{#each { length: 5 }, i (i)}
					<div class="bone-row" aria-hidden="true">
						<span class="bone wide"></span><span class="bone"></span><span class="bone short"></span>
					</div>
				{/each}
			</div>
		{:else if visibleResources.length === 0}
			<div class="state">
				<p class="empty-title">Nicio resursă găsită.</p>
				<p>
					{query ? 'Încercați un alt termen de căutare.' : 'Catalogul nu conține încă resurse de acest tip.'}
				</p>
			</div>
		{:else}
			<div class="table-card">
				<table class="table">
					<caption class="visually-hidden">Catalogul resurselor</caption>
					<thead>
						<tr>
							<th scope="col">Denumire</th>
							<th scope="col">Tip</th>
							<th scope="col">Capacitate / Cod</th>
							<th scope="col">Amplasare</th>
							<th scope="col">Stare</th>
							<th scope="col"><span class="visually-hidden">Acțiuni</span></th>
						</tr>
					</thead>
					<tbody>
						{#each visibleResources as r (r.id)}
							{@const bookings = activeBookings.byResource.get(r.id) ?? 0}
							<tr class:fresh={freshResourceId === r.id}>
								<th scope="row" class="name-cell">
									<span class="row-name">{r.name}</span>
									{#if r.description}<span class="row-desc">{r.description}</span>{/if}
								</th>
								<td data-label="Tip">
									<span class="type-badge" data-type={r.type}>{TYPE_LABELS[r.type]}</span>
								</td>
								<td data-label={r.type === 'Room' ? 'Capacitate' : 'Cod inventar'}>
									{#if r.type === 'Room'}
										{r.capacity !== undefined ? seatsLabel(r.capacity) : '—'}
									{:else}
										<span class="code">{r.inventoryCode ?? '—'}</span>
									{/if}
								</td>
								<td data-label="Amplasare">{r.location || '—'}</td>
								<td data-label="Stare">
									<span class="pill" data-available={r.isAvailable}>{availabilityLabel(r)}</span>
									{#if bookings > 0}
										<span class="sub">{bookings} {bookings === 1 ? 'rezervare activă' : 'rezervări active'}</span>
									{/if}
								</td>
								<td class="actions-cell">
									<div class="row-actions">
										<button
											type="button"
											class="icon-btn"
											disabled={!isAdmin}
											aria-label="Editează {r.name}"
											title={isAdmin ? 'Editează' : 'Necesită rolul Admin'}
											onclick={() => openForm(r)}
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
											</svg>
										</button>
										<button
											type="button"
											class="icon-btn danger"
											disabled={!isAdmin}
											aria-label="Șterge {r.name}"
											title={isAdmin ? 'Șterge' : 'Necesită rolul Admin'}
											onclick={() => (deleting = r)}
										>
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
											</svg>
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{:else}
	<!-- ---------- Users ---------- -->
	<div id="panel-users" class="panel users-layout" role="tabpanel" aria-labelledby="tab-users">
		<div class="users-list">
			{#if usersError}
				<p class="state error" role="alert">{usersError}</p>
			{:else if users === null}
				<div class="table-card" aria-busy="true">
					{#each { length: 3 }, i (i)}
						<div class="bone-row" aria-hidden="true">
							<span class="bone wide"></span><span class="bone"></span>
						</div>
					{/each}
				</div>
			{:else if users.length === 0}
				<div class="state">
					<p class="empty-title">Niciun utilizator înregistrat.</p>
					<p>Folosiți formularul pentru a crea primul cont.</p>
				</div>
			{:else}
				<div class="table-card">
					<table class="table">
						<caption class="visually-hidden">Utilizatori înregistrați</caption>
						<thead>
							<tr>
								<th scope="col">Utilizator</th>
								<th scope="col">E-mail</th>
								<th scope="col">Rol</th>
								<th scope="col" class="num">Rezervări active</th>
							</tr>
						</thead>
						<tbody>
							{#each users as u (u.id)}
								<tr class:fresh={freshUserId === u.id}>
									<th scope="row" class="name-cell">
										<span class="user-cell">
											<span class="avatar" aria-hidden="true">{initialsOf(u.name)}</span>
											<span class="row-name">
												{u.name}
												{#if currentUser?.id === u.id}<span class="you">Dvs.</span>{/if}
											</span>
										</span>
									</th>
									<td data-label="E-mail" class="email">{u.email}</td>
									<td data-label="Rol"><span class="role-badge" data-role={u.role}>{ROLE_LABELS[u.role]}</span></td>
									<td data-label="Rezervări active" class="num">{activeBookings.byUser.get(u.id) ?? 0}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<form class="user-form" novalidate onsubmit={registerUser} aria-labelledby="user-form-title">
			<p class="eyebrow small">Cont nou</p>
			<h2 id="user-form-title" class="form-title">Înregistrați un utilizator</h2>

			<div class="field">
				<label class="label" for="new-user-name">Nume complet</label>
				<div class="control" class:invalid={userAttempted && userNameError}>
					<input
						id="new-user-name"
						type="text"
						autocomplete="off"
						placeholder="Ioana Marinescu"
						bind:value={newName}
						bind:this={nameInput}
						disabled={!isAdmin}
						aria-invalid={userAttempted && !!userNameError}
					/>
				</div>
				{#if userAttempted && userNameError}<p class="hint error">{userNameError}</p>{/if}
			</div>

			<div class="field">
				<label class="label" for="new-user-email">E-mail</label>
				<div class="control" class:invalid={userAttempted && userEmailError}>
					<input
						id="new-user-email"
						type="email"
						autocomplete="off"
						placeholder="ioana.marinescu@atrium.ro"
						bind:value={newEmail}
						disabled={!isAdmin}
						aria-invalid={userAttempted && !!userEmailError}
					/>
				</div>
				{#if userAttempted && userEmailError}<p class="hint error">{userEmailError}</p>{/if}
			</div>

			<fieldset class="field roles">
				<legend class="label">Rol</legend>
				<div class="role-options">
					{#each ROLES as role (role)}
						<label class="role-option">
							<input type="radio" name="new-user-role" value={role} bind:group={newRole} disabled={!isAdmin} />
							<span>{role}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			{#if userServerError}
				<p class="form-error" role="alert">{userServerError}</p>
			{/if}

			<button type="submit" class="btn primary full" disabled={!isAdmin || userSubmitting}>
				{userSubmitting ? 'Se înregistrează…' : 'Înregistrează utilizatorul'}
			</button>
			{#if !isAdmin}
				<p class="hint center">Disponibil doar pentru administratori.</p>
			{/if}
		</form>
	</div>
{/if}

{#if $connectionMode === 'demo' && (resources || users)}
	<p class="demo-note">
		<span class="demo-mark" aria-hidden="true"></span>
		Serverul nu este disponibil — modificările se aplică datelor demonstrative din această sesiune.
	</p>
{/if}

<ResourceFormModal
	open={formOpen}
	resource={editing}
	existing={resources ?? []}
	onclose={() => (formOpen = false)}
	onsaved={onResourceSaved}
/>

<ConfirmDialog
	open={deleting !== null}
	eyebrow="Ștergere resursă"
	title="Ștergeți definitiv resursa?"
	confirmLabel="Da, șterge"
	cancelLabel="Păstrează"
	busy={deleteBusy}
	onconfirm={confirmDelete}
	onclose={() => (deleting = null)}
>
	<p><strong>{deleting?.name}</strong> va fi eliminat{deleting?.type === 'Room' ? 'ă' : ''} din catalog. Acțiunea nu poate fi anulată.</p>
	{#if deletingBookings > 0}
		<p class="warn">
			Atenție: resursa are {deletingBookings}
			{deletingBookings === 1 ? 'rezervare activă' : 'rezervări active'}.
		</p>
	{/if}
</ConfirmDialog>

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

	.eyebrow.small {
		font-size: 0.65rem;
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

	.btn svg {
		width: 1rem;
		height: 1rem;
	}

	.btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.primary {
		background-color: var(--color-ink);
		color: var(--color-canvas);
	}

	.primary:hover:not(:disabled) {
		background-color: var(--color-bordeaux);
		border-color: var(--color-bordeaux);
	}

	.full {
		width: 100%;
	}

	/* ---------- Role notice ---------- */
	.role-notice {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 1rem 1.25rem;
		align-items: center;
		margin-top: 2.5rem;
		padding: 1.25rem;
		border: 1px solid var(--color-hairline);
		border-left: 3px solid var(--color-brass);
		background-color: color-mix(in srgb, var(--color-brass) 7%, var(--color-surface));
	}

	.seal {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		border: 1px solid var(--color-brass);
		border-radius: 9999px;
		background-color: var(--color-surface);
		color: #8a6a2f;
	}

	.seal svg {
		width: 1.2rem;
		height: 1.2rem;
	}

	.notice-title {
		margin: 0;
		font-size: 1.15rem;
	}

	.notice-text p {
		margin: 0.25rem 0 0;
		font-size: 0.875rem;
		line-height: 1.55;
		color: var(--color-muted);
	}

	.notice-text strong {
		font-weight: 600;
		color: var(--color-ink);
	}

	.role-tag {
		padding: 0 0.375rem;
		border: 1px solid var(--color-brass);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ink);
	}

	.role-notice .btn {
		grid-column: 1 / -1;
	}

	/* ---------- Tabs ---------- */
	.tabs {
		display: flex;
		gap: 2rem;
		margin-top: 3rem;
		border-bottom: 1px solid var(--color-hairline);
	}

	.tabs:focus {
		outline: none;
	}

	.tab {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.125rem 0.875rem;
		border: 0;
		background: transparent;
		font-family: var(--font-serif);
		font-size: 1.15rem;
		color: var(--color-muted);
		transition: color 150ms ease;
	}

	.tab::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		bottom: -1px;
		height: 2px;
		background-color: var(--color-brass);
		transform: scaleX(0);
		transition: transform 250ms ease;
	}

	.tab:hover {
		color: var(--color-ink);
	}

	.tab[aria-selected='true'] {
		color: var(--color-ink);
	}

	.tab[aria-selected='true']::after {
		transform: scaleX(1);
	}

	.count {
		min-width: 1.5rem;
		padding: 0 0.375rem;
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		font-family: var(--font-sans);
		font-size: 0.7rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		text-align: center;
		color: var(--color-muted);
	}

	.tab[aria-selected='true'] .count {
		border-color: var(--color-ink);
		background-color: var(--color-ink);
		color: var(--color-canvas);
	}

	.panel {
		margin-top: 1.75rem;
	}

	/* ---------- Toolbar ---------- */
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.25rem;
		padding: 0.25rem 0.875rem;
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		background-color: var(--color-surface);
		font-size: 0.8rem;
		letter-spacing: 0.02em;
		color: var(--color-muted);
		transition:
			border-color 150ms ease,
			background-color 150ms ease,
			color 150ms ease;
	}

	.chip:hover {
		border-color: var(--color-brass);
		color: var(--color-ink);
	}

	.chip[aria-pressed='true'] {
		border-color: var(--color-brass);
		background-color: color-mix(in srgb, var(--color-brass) 12%, var(--color-surface));
		font-weight: 500;
		color: var(--color-ink);
	}

	.chip-count {
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--color-muted);
	}

	.toolbar-end {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		padding-left: 0.875rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
		color: var(--color-muted);
		transition: border-color 150ms ease;
	}

	.search:focus-within {
		border-color: var(--color-brass);
	}

	.search svg {
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
	}

	.search input {
		flex: 1;
		min-width: 0;
		padding: 0.5rem 0.875rem 0.5rem 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 0.875rem;
		color: var(--color-ink);
		box-shadow: none;
	}

	.search input:focus {
		outline: none;
		box-shadow: none;
	}

	/* ---------- Table ---------- */
	.table-card {
		border: 1px solid var(--color-hairline);
		background-color: var(--color-surface);
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.table thead {
		display: none;
	}

	.table tr {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem 1rem;
		padding: 1.125rem 1.25rem;
		border-top: 1px solid var(--color-hairline);
	}

	.table tbody tr:first-child {
		border-top: 0;
	}

	.table th,
	.table td {
		padding: 0;
		text-align: left;
		font-weight: 400;
		vertical-align: middle;
	}

	.table td[data-label]::before {
		content: attr(data-label);
		display: block;
		margin-bottom: 0.2rem;
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.name-cell {
		grid-column: 1 / -1;
	}

	.actions-cell {
		grid-column: 1 / -1;
	}

	.table tr.fresh {
		animation: fresh 2.4s ease-out;
	}

	@keyframes fresh {
		0%,
		40% {
			background-color: color-mix(in srgb, var(--color-brass) 14%, var(--color-surface));
		}
	}

	.row-name {
		display: block;
		font-family: var(--font-serif);
		font-size: 1.05rem;
		font-weight: 600;
		line-height: 1.3;
		color: var(--color-ink);
		overflow-wrap: anywhere;
	}

	.row-desc {
		display: -webkit-box;
		margin-top: 0.2rem;
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--color-muted);
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.type-badge {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--color-hairline);
		background-color: var(--color-canvas);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--color-ink);
	}

	.type-badge[data-type='Equipment'] {
		color: var(--color-bordeaux);
	}

	.code {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.04em;
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
		white-space: nowrap;
		color: var(--color-forest);
	}

	.pill::before {
		content: '';
		width: 0.35rem;
		height: 0.35rem;
		border-radius: 9999px;
		background-color: currentColor;
	}

	.pill[data-available='false'] {
		color: var(--color-bordeaux);
	}

	.sub {
		display: block;
		margin-top: 0.3rem;
		font-size: 0.75rem;
		color: var(--color-muted);
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		background: transparent;
		color: var(--color-ink);
		transition:
			border-color 150ms ease,
			background-color 150ms ease;
	}

	.icon-btn svg {
		width: 1rem;
		height: 1rem;
	}

	.icon-btn:hover:not(:disabled) {
		border-color: var(--color-ink);
	}

	.icon-btn.danger {
		color: var(--color-bordeaux);
	}

	.icon-btn.danger:hover:not(:disabled) {
		border-color: var(--color-bordeaux);
		background-color: color-mix(in srgb, var(--color-bordeaux) 6%, transparent);
	}

	.icon-btn:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}

	/* Users table */
	.user-cell {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.avatar {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 9999px;
		background-color: var(--color-ink);
		font-family: var(--font-serif);
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		color: var(--color-canvas);
	}

	.you {
		margin-left: 0.375rem;
		padding: 0 0.375rem;
		border: 1px solid var(--color-brass);
		font-family: var(--font-sans);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		vertical-align: middle;
		color: #8a6a2f;
	}

	.email {
		grid-column: 1 / -1;
		overflow-wrap: anywhere;
	}

	.role-badge {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border: 1px solid var(--color-hairline);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

	.role-badge[data-role='Profesor'] {
		border-color: color-mix(in srgb, var(--color-ink) 40%, transparent);
		color: var(--color-ink);
	}

	.role-badge[data-role='Admin'] {
		border-color: var(--color-bordeaux);
		background-color: var(--color-bordeaux);
		color: var(--color-canvas);
	}

	.num {
		font-variant-numeric: tabular-nums;
	}

	/* ---------- Users layout & form ---------- */
	.users-layout {
		display: grid;
		gap: 1.5rem;
	}

	.users-list {
		min-width: 0;
	}

	.user-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-self: start;
		padding: 1.5rem 1.25rem;
		border: 1px solid var(--color-hairline);
		border-top: 2px solid var(--color-brass);
		background-color: var(--color-surface);
	}

	.form-title {
		margin: -0.5rem 0 0.25rem;
		font-size: 1.35rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.label {
		padding: 0;
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--color-muted);
	}

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

	.control input {
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

	.control input:focus {
		outline: none;
		box-shadow: none;
	}

	.control input::placeholder {
		color: var(--color-muted);
		opacity: 0.7;
	}

	.control input:disabled {
		cursor: not-allowed;
	}

	.role-options {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-top: 0.375rem;
		border: 1px solid var(--color-hairline);
	}

	.role-option {
		position: relative;
		cursor: pointer;
	}

	.role-option + .role-option {
		border-left: 1px solid var(--color-hairline);
	}

	.role-option input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		margin: 0;
	}

	.role-option span {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 2.5rem;
		font-size: 0.8rem;
		color: var(--color-muted);
		background-color: var(--color-canvas);
		transition:
			background-color 150ms ease,
			color 150ms ease;
	}

	.role-option:hover span {
		color: var(--color-ink);
	}

	.role-option input:checked + span {
		background-color: var(--color-ink);
		font-weight: 500;
		color: var(--color-canvas);
	}

	.role-option input:focus-visible + span {
		outline: 2px solid var(--color-brass);
		outline-offset: -2px;
	}

	.role-option input:disabled + span {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	.hint.error {
		color: var(--color-bordeaux);
	}

	.hint.center {
		margin-top: -0.25rem;
		text-align: center;
	}

	.form-error {
		margin: 0;
		padding: 0.625rem 0.75rem;
		border-left: 3px solid var(--color-bordeaux);
		background-color: color-mix(in srgb, var(--color-bordeaux) 7%, var(--color-surface));
		font-size: 0.85rem;
		color: var(--color-bordeaux);
	}

	/* ---------- States ---------- */
	.state {
		padding: 3rem 1.5rem;
		border: 1px dashed var(--color-hairline);
		background-color: var(--color-surface);
		text-align: center;
		font-size: 0.9rem;
		color: var(--color-muted);
	}

	.state p {
		margin: 0;
	}

	.state.error {
		border-style: solid;
		border-left: 3px solid var(--color-bordeaux);
		color: var(--color-bordeaux);
		text-align: left;
		padding: 1rem 1.25rem;
	}

	.empty-title {
		margin-bottom: 0.375rem !important;
		font-family: var(--font-serif);
		font-size: 1.25rem;
		color: var(--color-ink);
	}

	.bone-row {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 1.25rem;
		border-top: 1px solid var(--color-hairline);
	}

	.bone-row:first-child {
		border-top: 0;
	}

	.bone {
		display: block;
		width: 40%;
		height: 0.75rem;
		background-color: var(--color-canvas);
		animation: pulse 1.4s ease-in-out infinite;
	}

	.bone.wide {
		width: 60%;
		height: 1.1rem;
	}

	.bone.short {
		width: 20%;
	}

	@keyframes pulse {
		50% {
			opacity: 0.45;
		}
	}

	.warn {
		color: var(--color-bordeaux);
	}

	.demo-note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1.5rem 0 0;
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	.demo-mark {
		flex-shrink: 0;
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
		.title {
			font-size: 3rem;
			line-height: 1;
		}

		.role-notice {
			grid-template-columns: auto minmax(0, 1fr) auto;
			padding: 1.25rem 1.5rem;
		}

		.role-notice .btn {
			grid-column: auto;
		}

		.toolbar-end {
			flex-direction: row;
		}

		.search {
			flex: 1;
		}

		.toast-region {
			inset-inline: auto 1.5rem;
			bottom: 1.5rem;
		}
	}

	@media (min-width: 900px) {
		.toolbar {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
		}

		.search {
			width: 17rem;
			flex: none;
		}

		/* Real table layout */
		.table thead {
			display: table-header-group;
		}

		.table tr {
			display: table-row;
			padding: 0;
		}

		.table th,
		.table td {
			padding: 1rem 1.25rem;
			border-top: 1px solid var(--color-hairline);
		}

		.table thead th {
			padding-block: 0.875rem;
			border-top: 0;
			border-bottom: 1px solid var(--color-hairline);
			background-color: var(--color-canvas);
			font-size: 0.62rem;
			font-weight: 600;
			letter-spacing: 0.2em;
			text-transform: uppercase;
			white-space: nowrap;
			color: var(--color-muted);
		}

		.table tbody tr:first-child th,
		.table tbody tr:first-child td {
			border-top: 0;
		}

		.table tbody tr {
			transition: background-color 150ms ease;
		}

		.table tbody tr:hover {
			background-color: color-mix(in srgb, var(--color-canvas) 60%, var(--color-surface));
		}

		.table td[data-label]::before {
			display: none;
		}

		.name-cell {
			max-width: 20rem;
		}

		.actions-cell {
			width: 1%;
		}

		.table .num {
			text-align: right;
		}

		.users-layout {
			grid-template-columns: minmax(0, 1fr) 20rem;
			align-items: start;
		}

		.user-form {
			position: sticky;
			top: 6rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bone,
		.toast,
		.table tr.fresh {
			animation: none;
		}

		.tab::after {
			transition: none;
		}
	}
</style>
