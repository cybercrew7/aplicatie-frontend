export type ReservationStatus = 'Confirmed' | 'Pending' | 'Cancelled';

/** Mirrors `ReservationDTO` on the backend. Times are ISO-8601 strings. */
export interface ReservationDTO {
	id: number;
	userId: number;
	resourceId: number;
	startTime: string;
	endTime: string;
	purpose: string;
	status: ReservationStatus;
}

/** Payload for `POST /api/Reservation`. Status is decided by the backend. */
export interface CreateReservationPayload {
	userId: number;
	resourceId: number;
	startTime: string;
	endTime: string;
	purpose: string;
}

/** Payload for `PUT /api/Reservation/{id}`. */
export type UpdateReservationPayload = Partial<CreateReservationPayload> & {
	status?: ReservationStatus;
};
