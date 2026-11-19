import { writable } from 'svelte/store';
import { toDateInput } from '#lib/utils/reservation.ts';

export interface BookingDrawerState {
	isOpen: boolean;
	preselectedResourceId: number | string | null;
	/** `YYYY-MM-DD`, local time. */
	preselectedDate: string;
	preselectedStartHour: number | null;
}

function closedState(): BookingDrawerState {
	return {
		isOpen: false,
		preselectedResourceId: null,
		preselectedDate: toDateInput(new Date()),
		preselectedStartHour: null
	};
}

/** Global state of the slide-over booking drawer. */
export const bookingStore = writable<BookingDrawerState>(closedState());

/** Open the drawer, optionally pre-filling resource, day (`YYYY-MM-DD`) and start hour. */
export function openBookingDrawer(
	resourceId: number | string | null = null,
	date?: string,
	startHour: number | null = null
): void {
	bookingStore.set({
		isOpen: true,
		preselectedResourceId: resourceId,
		preselectedDate: date || toDateInput(new Date()),
		preselectedStartHour: startHour
	});
}

/** Close the drawer and clear any preselection. */
export function closeBookingDrawer(): void {
	bookingStore.set(closedState());
}
