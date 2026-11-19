import { demoDb } from '#lib/mocks/demoDb.ts';
import type {
	CreateResourcePayload,
	ResourceDTO,
	ResourceType,
	UpdateResourcePayload
} from '#lib/types/index.ts';
import { demoNotFound, http, withDemoFallback } from './httpClient.ts';

const BASE = '/Resource';
const resources = demoDb.resources;

export const resourceService = {
	getAll: () => withDemoFallback(() => http.get<ResourceDTO[]>(BASE), () => resources.all()),

	/** Client-side filter over `getAll`, so it works against any backend version. */
	getByType: async (type: ResourceType) =>
		(await resourceService.getAll()).filter((r) => r.type === type),

	getById: (id: number) =>
		withDemoFallback(
			() => http.get<ResourceDTO>(`${BASE}/${id}`),
			() => resources.find(id) ?? demoNotFound()
		),

	create: (payload: CreateResourcePayload) =>
		withDemoFallback(
			() => http.post<ResourceDTO>(BASE, payload),
			() => resources.insert(payload)
		),

	update: (id: number, payload: UpdateResourcePayload) =>
		withDemoFallback(
			() => http.put<ResourceDTO>(`${BASE}/${id}`, payload),
			() => resources.update(id, payload) ?? demoNotFound()
		),

	remove: (id: number) =>
		withDemoFallback(
			() => http.delete(`${BASE}/${id}`),
			() => {
				if (!resources.remove(id)) demoNotFound();
			}
		)
};
