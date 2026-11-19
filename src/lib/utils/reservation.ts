import type { ReservationDTO, ReservationStatus } from '#lib/types/index.ts';

export const STATUS_LABELS: Record<ReservationStatus, string> = {
	Confirmed: 'Confirmată',
	Pending: 'În așteptare',
	Cancelled: 'Anulată'
};

/** Half-open interval in epoch milliseconds. */
export interface Interval {
	start: number;
	end: number;
}

export function intervalOf(r: Pick<ReservationDTO, 'startTime' | 'endTime'>): Interval {
	return { start: Date.parse(r.startTime), end: Date.parse(r.endTime) };
}

/** True when two half-open intervals share at least one instant. */
export function overlaps(a: Interval, b: Interval): boolean {
	return a.start < b.end && a.end > b.start;
}

/**
 * Active reservations of `resourceId` that collide with `slot`.
 * Cancelled bookings never block a slot, mirroring the backend rule.
 */
export function findConflicts(
	reservations: readonly ReservationDTO[],
	resourceId: number,
	slot: Interval,
	ignoreId?: number
): ReservationDTO[] {
	return reservations.filter(
		(r) =>
			r.id !== ignoreId &&
			r.resourceId === resourceId &&
			r.status !== 'Cancelled' &&
			overlaps(intervalOf(r), slot)
	);
}

/** An upcoming reservation is still active and has not ended yet. */
export function isUpcoming(r: ReservationDTO, now: number): boolean {
	return r.status !== 'Cancelled' && Date.parse(r.endTime) > now;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in local time, as expected by `<input type="date">`. */
export function toDateInput(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `HH:MM` in local time, as expected by `<input type="time">`. */
export function toTimeInput(d: Date): string {
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Combine `<input type="date">` and `<input type="time">` values into a local timestamp. */
export function fromInputs(date: string, time: string): number {
	if (!date || !time) return Number.NaN;
	return new Date(`${date}T${time}`).getTime();
}
