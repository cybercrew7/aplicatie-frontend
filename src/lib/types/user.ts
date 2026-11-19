/** Roles exactly as emitted by the ASP.NET Core backend. */
export type UserRole = 'Student' | 'Profesor' | 'Admin';

/** Mirrors `UserDTO` on the backend. */
export interface UserDTO {
	id: number;
	name: string;
	email: string;
	role: UserRole;
}

/** Payload for `POST /api/User`. Password is only sent on creation. */
export interface CreateUserPayload {
	name: string;
	email: string;
	role: UserRole;
	password?: string;
}

/** Payload for `PUT /api/User/{id}`. */
export type UpdateUserPayload = Partial<CreateUserPayload>;

/** An authenticated session: the user plus the JWT issued for them. */
export interface AuthSession {
	user: UserDTO;
	token: string;
}
