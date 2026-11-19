import type { ResourceDTO, ResourceType } from '#lib/types/index.ts';

export const TYPE_LABELS: Record<ResourceType, string> = {
	Room: 'Sală',
	Equipment: 'Echipament'
};

/** "Disponibilă" for rooms (feminine), "Disponibil" for equipment (neuter). */
export function availabilityLabel(resource: Pick<ResourceDTO, 'type' | 'isAvailable'>): string {
	const base = resource.isAvailable ? 'Disponibil' : 'Indisponibil';
	return resource.type === 'Room' ? `${base}ă` : base;
}

/** Romanian numeral agreement: "12 locuri", "36 de locuri", "101 locuri". */
export function seatsLabel(count: number): string {
	if (count === 1) return '1 loc';
	const rest = count % 100;
	const needsDe = count >= 20 && (rest === 0 || rest >= 20);
	return `${count} ${needsDe ? 'de ' : ''}locuri`;
}

export function bookingHref(resource: Pick<ResourceDTO, 'id'>): string {
	return `/reservations?resourceId=${resource.id}`;
}
