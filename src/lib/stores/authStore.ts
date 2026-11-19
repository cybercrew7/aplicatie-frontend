import { browser } from '$app/env';
import { get, writable } from 'svelte/store';
import { DEMO_USERS } from '#lib/mocks/demoDb.ts';
import type { AuthSession, UserDTO, UserRole } from '#lib/types/index.ts';

export interface AuthState {
	currentUser: UserDTO | null;
	jwtToken: string | null;
}

export type ConnectionMode = 'api' | 'demo';

const STORAGE_KEY = 'atrium.auth';
const EMPTY: AuthState = { currentUser: null, jwtToken: null };

function readStorage(): AuthState {
	if (!browser) return EMPTY;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return EMPTY;
		const parsed = JSON.parse(raw) as Partial<AuthState>;
		return {
			currentUser: parsed.currentUser ?? null,
			jwtToken: parsed.jwtToken ?? null
		};
	} catch {
		return EMPTY;
	}
}

function writeStorage(state: AuthState): void {
	if (!browser) return;
	try {
		if (state.currentUser || state.jwtToken) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} else {
			localStorage.removeItem(STORAGE_KEY);
		}
	} catch {
		// Storage unavailable (private mode, quota) — session stays in memory only.
	}
}

/** Placeholder token for demo users. The backend will reject it, by design. */
function demoToken(user: UserDTO): string {
	return `demo.${user.role.toLowerCase()}.${user.id}`;
}

function createAuthStore() {
	const store = writable<AuthState>(readStorage());

	if (browser) {
		store.subscribe(writeStorage);

		// Keep multiple tabs in sync.
		window.addEventListener('storage', (event) => {
			if (event.key === STORAGE_KEY) store.set(readStorage());
		});
	}

	return {
		subscribe: store.subscribe,

		/** Store a session returned by the backend (e.g. after login). */
		setSession(session: AuthSession): void {
			store.set({ currentUser: session.user, jwtToken: session.token });
		},

		/** Impersonate one of the built-in demo users, by role or id. */
		switchDemoUser(target: UserRole | number): void {
			const user = DEMO_USERS.find((u) =>
				typeof target === 'number' ? u.id === target : u.role === target
			);
			if (!user) return;
			store.set({ currentUser: { ...user }, jwtToken: demoToken(user) });
		},

		logout(): void {
			store.set(EMPTY);
		},

		/** Current token, for non-reactive callers such as the HTTP client. */
		getToken(): string | null {
			return get(store).jwtToken;
		}
	};
}

export const authStore = createAuthStore();

/** `'api'` while the backend answers; flips to `'demo'` when it is unreachable. */
export const connectionMode = writable<ConnectionMode>('api');

export { DEMO_USERS };
