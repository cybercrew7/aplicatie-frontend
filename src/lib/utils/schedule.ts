import type { ReservationDTO } from '#lib/types/index.ts';
import { findConflicts, fromInputs } from '#lib/utils/reservation.ts';

/** First bookable hour of the day (inclusive). */
export const OPENING_HOUR = 8;
/** Closing hour of the day (exclusive) — the last block is 19:00–20:00. */
export const CLOSING_HOUR = 20;
/** Length of one schedule block, in hours. */
export const SLOT_DURATION_HOURS = 1;

const HOUR_MS = 60 * 60 * 1000;

export type SlotStatus = 'available' | 'occupied' | 'past';

export interface DaySlot {
	/** Start hour of the block, 0–23 (local time). */
	hour: number;
	/** `HH:00`, e.g. `"09:00"`. */
	label: string;
	status: SlotStatus;
	/** The active reservation covering this block, when `status === 'occupied'`. */
	reservation?: ReservationDTO;
}

export interface SlotRangeValidation {
	valid: boolean;
	error?: string;
}

export interface AvailabilitySummary {
	/** Number of blocks still bookable. */
	freeHours: number;
	/** Total number of blocks in the operating day. */
	totalHours: number;
	/** First bookable block, or `null` when the day is full / over. */
	nextAvailable: DaySlot | null;
	/** Human-readable status, e.g. `"Liber de la 14:00"`. */
	label: string;
}

/** `HH:00` label for a whole hour. */
export function hourLabel(hour: number): string {
	return `${String(hour).padStart(2, '0')}:00`;
}

/** Every block start hour within operating hours: `[8, 9, …, 19]`. */
export function operatingHours(): number[] {
	const hours: number[] = [];
	for (let h = OPENING_HOUR; h < CLOSING_HOUR; h += SLOT_DURATION_HOURS) hours.push(h);
	return hours;
}

/**
 * Build the hourly schedule of `resourceId` for the local day `dateStr` (`YYYY-MM-DD`).
 *
 * - A block is `occupied` when an active (non-cancelled) reservation overlaps it.
 *   Occupation wins over `past` so the UI can still show who held the slot.
 * - Otherwise a block is `past` once its start time has been reached — a block
 *   already in progress can no longer be booked.
 * - Everything else is `available`.
 *
 * `now` is injectable for deterministic tests.
 */
export function buildDaySlots(
	dateStr: string,
	resourceId: number | string,
	reservations: readonly ReservationDTO[],
	now: number = Date.now()
): DaySlot[] {
	const id = Number(resourceId);
	const dayStart = fromInputs(dateStr, '00:00');
	if (Number.isNaN(dayStart) || Number.isNaN(id)) return [];

	return operatingHours().map((hour) => {
		const label = hourLabel(hour);
		const start = fromInputs(dateStr, label);
		const end = start + SLOT_DURATION_HOURS * HOUR_MS;

		const [reservation] = findConflicts(reservations, id, { start, end });
		if (reservation) return { hour, label, status: 'occupied', reservation };
		if (start <= now) return { hour, label, status: 'past' };
		return { hour, label, status: 'available' };
	});
}

/**
 * Check that the half-open range `[startHour, endHour)` can be booked as one
 * continuous reservation: inside operating hours, and every block available.
 * E.g. `10 → 14` covers 10:00, 11:00, 12:00 and 13:00.
 */
export function validateSlotRange(
	slots: readonly DaySlot[],
	startHour: number,
	endHour: number
): SlotRangeValidation {
	if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
		return { valid: false, error: 'Intervalul trebuie să înceapă și să se termine la oră fixă.' };
	}
	if (endHour <= startHour) {
		return { valid: false, error: 'Ora de sfârșit trebuie să fie după ora de început.' };
	}
	if (startHour < OPENING_HOUR || endHour > CLOSING_HOUR) {
		return {
			valid: false,
			error: `Rezervările sunt posibile doar între ${hourLabel(OPENING_HOUR)} și ${hourLabel(CLOSING_HOUR)}.`
		};
	}

	const byHour = new Map(slots.map((s) => [s.hour, s]));
	for (let h = startHour; h < endHour; h += SLOT_DURATION_HOURS) {
		const slot = byHour.get(h);
		if (!slot) {
			return { valid: false, error: `Intervalul ${hourLabel(h)} nu este disponibil.` };
		}
		if (slot.status === 'past') {
			return { valid: false, error: `Intervalul ${slot.label} a trecut deja.` };
		}
		if (slot.status === 'occupied') {
			return {
				valid: false,
				error: `Intervalul ${slot.label} este deja ocupat — alegeți un interval continuu liber.`
			};
		}
	}
	return { valid: true };
}

/** Count bookable blocks and describe when the resource is next free. */
export function calculateAvailabilitySummary(slots: readonly DaySlot[]): AvailabilitySummary {
	const available = slots.filter((s) => s.status === 'available');
	const nextAvailable = available[0] ?? null;
	const anyOccupied = slots.some((s) => s.status === 'occupied');

	let label: string;
	if (nextAvailable) label = `Liber de la ${nextAvailable.label}`;
	else if (anyOccupied) label = 'Complet ocupat';
	else label = 'Indisponibil';

	return {
		freeHours: available.length * SLOT_DURATION_HOURS,
		totalHours: slots.length * SLOT_DURATION_HOURS,
		nextAvailable,
		label
	};
}

/**
 * True when `resourceId` can be used right now: the current instant falls inside
 * operating hours and no active reservation covers it.
 */
export function isFreeNow(
	resourceId: number,
	reservations: readonly ReservationDTO[],
	now: number = Date.now()
): boolean {
	const hour = new Date(now).getHours();
	if (hour < OPENING_HOUR || hour >= CLOSING_HOUR) return false;
	return findConflicts(reservations, resourceId, { start: now, end: now + 1 }).length === 0;
}
