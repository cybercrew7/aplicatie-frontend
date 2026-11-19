import { demoDb } from '#lib/mocks/demoDb.ts';
import type {
	CreateReservationPayload,
	ReservationDTO,
	UpdateReservationPayload
} from '#lib/types/index.ts';
import { ApiError, demoNotFound, http, withDemoFallback } from './httpClient.ts';

const BASE = '/Reservation';
const reservations = demoDb.reservations;

/** Mirror the backend's double-booking rule in demo mode. */
function assertNoOverlap(candidate: Omit<ReservationDTO, 'id'>, ignoreId?: number): void {
	if (candidate.status === 'Cancelled') return;
	const start = Date.parse(candidate.startTime);
	const end = Date.parse(candidate.endTime);

	if (!(end > start)) {
		throw new ApiError(400, 'Ora de sfârșit trebuie să fie după ora de început.');
	}

	const clash = reservations
		.all()
		.some(
			(r) =>
				r.id !== ignoreId &&
				r.resourceId === candidate.resourceId &&
				r.status !== 'Cancelled' &&
				Date.parse(r.startTime) < end &&
				Date.parse(r.endTime) > start
		);

	if (clash) {
		throw new ApiError(409, 'Resursa este deja rezervată în intervalul selectat.');
	}
}

export const reservationService = {
	getAll: () =>
		withDemoFallback(() => http.get<ReservationDTO[]>(BASE), () => reservations.all()),

	getById: (id: number) =>
		withDemoFallback(
			() => http.get<ReservationDTO>(`${BASE}/${id}`),
			() => reservations.find(id) ?? demoNotFound()
		),

	create: (payload: CreateReservationPayload) =>
		withDemoFallback(
			() => http.post<ReservationDTO>(BASE, payload),
			() => {
				const row = { ...payload, status: 'Pending' as const };
				assertNoOverlap(row);
				return reservations.insert(row);
			}
		),

	update: (id: number, payload: UpdateReservationPayload) =>
		withDemoFallback(
			() => http.put<ReservationDTO>(`${BASE}/${id}`, payload),
			() => {
				const current = reservations.find(id) ?? demoNotFound();
				const { id: _id, ...merged } = { ...current, ...payload };
				assertNoOverlap(merged, id);
				return reservations.update(id, payload) ?? demoNotFound();
			}
		),

	/** Soft-cancel, keeping the record for history. */
	cancel: (id: number) => reservationService.update(id, { status: 'Cancelled' }),

	remove: (id: number) =>
		withDemoFallback(
			() => http.delete(`${BASE}/${id}`),
			() => {
				if (!reservations.remove(id)) demoNotFound();
			}
		)
};
