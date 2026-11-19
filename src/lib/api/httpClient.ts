import { authStore, connectionMode } from '#lib/stores/authStore.ts';

/**
 * Base URL for every API call. Defaults to the relative `/api`, which Nginx
 * reverse-proxies to the ASP.NET Core backend in production.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = 10_000;

const STATUS_MESSAGES: Record<number, string> = {
	0: 'Nu se poate stabili conexiunea cu serverul. Verificați conexiunea la internet.',
	400: 'Cererea conține date invalide. Verificați câmpurile completate.',
	401: 'Nu sunteți autentificat sau sesiunea a expirat. Vă rugăm să vă autentificați din nou.',
	403: 'Nu aveți permisiunea de a efectua această acțiune.',
	404: 'Elementul solicitat nu a fost găsit.',
	408: 'Serverul nu a răspuns la timp. Încercați din nou.',
	409: 'Operațiunea intră în conflict cu datele existente (de exemplu, intervalul este deja rezervat).',
	422: 'Datele trimise nu au putut fi procesate.',
	429: 'Prea multe cereri într-un timp scurt. Așteptați câteva momente.',
	500: 'A apărut o eroare internă pe server. Încercați din nou mai târziu.',
	502: 'Serverul nu este disponibil momentan.',
	503: 'Serviciul este temporar indisponibil.',
	504: 'Serverul nu a răspuns la timp.'
};

function messageFor(status: number): string {
	return (
		STATUS_MESSAGES[status] ??
		(status >= 500
			? STATUS_MESSAGES[500]
			: `Cererea a eșuat (cod ${status}). Încercați din nou.`)
	);
}

export class ApiError extends Error {
	override readonly name = 'ApiError';

	constructor(
		/** HTTP status, or `0` when no response was received. */
		readonly status: number,
		message: string = messageFor(status),
		/** Raw body returned by the server (e.g. ASP.NET ProblemDetails), if any. */
		readonly details?: unknown,
		/**
		 * True when the backend itself could not be reached: network failure,
		 * timeout, proxy gateway error, or a non-API (HTML) response.
		 */
		readonly unreachable = false
	) {
		super(message);
	}

	/** Validation messages from an ASP.NET `ValidationProblemDetails` body. */
	get validationErrors(): Record<string, string[]> {
		const body = this.details as { errors?: Record<string, string[]> } | undefined;
		return body?.errors ?? {};
	}
}

export function isUnreachable(error: unknown): error is ApiError {
	return error instanceof ApiError && error.unreachable;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
	const headers = new Headers({ Accept: 'application/json' });
	if (body !== undefined) headers.set('Content-Type', 'application/json');

	const token = authStore.getToken();
	if (token) headers.set('Authorization', `Bearer ${token}`);

	let response: Response;
	try {
		response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
	} catch (error) {
		// TypeError → DNS/connection refused/CORS; DOMException → timeout/abort.
		const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
		throw new ApiError(timedOut ? 408 : 0, undefined, error, true);
	}

	const contentType = response.headers.get('content-type') ?? '';
	const isJson = contentType.includes('json');

	// An HTML page means something other than the API answered — the Vite dev
	// server without a proxy, or an Nginx error page. Treat it as unreachable.
	const gatewayDown = [502, 503, 504].includes(response.status);
	if (gatewayDown || contentType.includes('text/html')) {
		throw new ApiError(gatewayDown ? response.status : 503, messageFor(503), undefined, true);
	}

	if (!response.ok) {
		const details = isJson ? await response.json().catch(() => undefined) : await response.text();
		throw new ApiError(response.status, messageFor(response.status), details || undefined);
	}

	connectionMode.set('api');

	if (response.status === 204 || !isJson) return undefined as T;
	return (await response.json()) as T;
}

export const http = {
	get: <T>(path: string) => request<T>('GET', path),
	post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
	put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
	patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
	delete: <T = void>(path: string) => request<T>('DELETE', path)
};

/**
 * Run an API call; if the backend is unreachable, switch to demo mode and
 * serve the result from the in-memory demo database instead.
 * Every call re-tries the API first, so the app recovers as soon as the
 * backend comes back.
 */
export async function withDemoFallback<T>(
	apiCall: () => Promise<T>,
	demoCall: () => T | Promise<T>
): Promise<T> {
	try {
		return await apiCall();
	} catch (error) {
		if (!isUnreachable(error)) throw error;
		connectionMode.set('demo');
		return demoCall();
	}
}

/** Throw the same error the backend would for a missing record. */
export function demoNotFound(): never {
	throw new ApiError(404);
}
