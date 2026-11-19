export type ResourceType = 'Room' | 'Equipment';

/** Mirrors `ResourceDTO` on the backend. */
export interface ResourceDTO {
	id: number;
	name: string;
	description: string;
	type: ResourceType;
	/** Seats — rooms only. */
	capacity?: number;
	/** Inventory tag — equipment only. */
	inventoryCode?: string;
	location?: string;
	isAvailable: boolean;
}

/** Payload for `POST /api/Resource`. */
export type CreateResourcePayload = Omit<ResourceDTO, 'id'>;

/** Payload for `PUT /api/Resource/{id}`. */
export type UpdateResourcePayload = Partial<CreateResourcePayload>;
