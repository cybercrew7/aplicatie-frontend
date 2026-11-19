import { demoDb } from '#lib/mocks/demoDb.ts';
import type { CreateUserPayload, UpdateUserPayload, UserDTO } from '#lib/types/index.ts';
import { demoNotFound, http, withDemoFallback } from './httpClient.ts';

const BASE = '/User';
const users = demoDb.users;

export const userService = {
	getAll: () => withDemoFallback(() => http.get<UserDTO[]>(BASE), () => users.all()),

	getById: (id: number) =>
		withDemoFallback(
			() => http.get<UserDTO>(`${BASE}/${id}`),
			() => users.find(id) ?? demoNotFound()
		),

	create: (payload: CreateUserPayload) =>
		withDemoFallback(
			() => http.post<UserDTO>(BASE, payload),
			() => {
				const { password: _password, ...user } = payload;
				return users.insert(user);
			}
		),

	update: (id: number, payload: UpdateUserPayload) =>
		withDemoFallback(
			() => http.put<UserDTO>(`${BASE}/${id}`, payload),
			() => {
				const { password: _password, ...patch } = payload;
				return users.update(id, patch) ?? demoNotFound();
			}
		),

	remove: (id: number) =>
		withDemoFallback(
			() => http.delete(`${BASE}/${id}`),
			() => {
				if (!users.remove(id)) demoNotFound();
			}
		)
};
