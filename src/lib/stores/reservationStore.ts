import { get, writable } from 'svelte/store';
import { reservationService } from '#lib/api/reservationService.ts';
import type { ReservationDTO } from '#lib/types/index.ts';

/**
 * Shared, app-wide cache of reservations. `null` until first loaded.
 * Lets the booking drawer, the catalogue timelines and the reservations page
 * all reflect a new booking the moment it is created.
 */
export const reservationsStore = writable<ReservationDTO[] | null>(null);

/** The most recent reservation created through the booking drawer. */
export const lastCreatedReservation = writable<ReservationDTO | null>(null);

let inflight: Promise<ReservationDTO[]> | null = null;

/** Fetch reservations once (or again with `force`), sharing concurrent calls. */
export function loadReservations(force = false): Promise<ReservationDTO[]> {
	const cached = get(reservationsStore);
	if (cached && !force) return Promise.resolve(cached);
	if (inflight) return inflight;

	inflight = reservationService
		.getAll()
		.then((rows) => {
			reservationsStore.set(rows);
			return rows;
		})
		.finally(() => {
			inflight = null;
		});
	return inflight;
}

/** Insert a freshly created reservation into the shared cache and announce it. */
export function addReservation(reservation: ReservationDTO): void {
	reservationsStore.update((rows) =>
		rows ? [...rows.filter((r) => r.id !== reservation.id), reservation] : [reservation]
	);
	lastCreatedReservation.set(reservation);
}
