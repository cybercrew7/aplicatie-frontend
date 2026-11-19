/**
 * In-memory demo database used when the backend is unreachable.
 * Mutations persist for the lifetime of the tab so the UI stays fully
 * functional (create / update / delete all behave as expected).
 */
import type { ReservationDTO, ResourceDTO, UserDTO } from '#lib/types/index.ts';

export const DEMO_USERS: readonly UserDTO[] = [
	{ id: 1, name: 'Andrei Popescu', email: 'andrei.popescu@student.atrium.ro', role: 'Student' },
	{ id: 2, name: 'Elena Ionescu', email: 'elena.ionescu@atrium.ro', role: 'Profesor' },
	{ id: 3, name: 'Mihai Dumitrescu', email: 'mihai.dumitrescu@atrium.ro', role: 'Admin' }
];

const RESOURCES: ResourceDTO[] = [
	{
		id: 1,
		name: 'Aula Magna',
		description: 'Sala festivă a universității, cu sistem de sonorizare și scenă.',
		type: 'Room',
		capacity: 420,
		location: 'Corp A, parter',
		isAvailable: true
	},
	{
		id: 2,
		name: 'Amfiteatrul A1',
		description: 'Amfiteatru pentru cursuri, dotat cu videoproiector și tablă dublă.',
		type: 'Room',
		capacity: 180,
		location: 'Corp A, etaj 1',
		isAvailable: true
	},
	{
		id: 3,
		name: 'Laboratorul de Informatică L204',
		description: '30 de stații de lucru, rețea dedicată, ecran interactiv.',
		type: 'Room',
		capacity: 30,
		location: 'Corp B, etaj 2',
		isAvailable: true
	},
	{
		id: 4,
		name: 'Sala de seminar S12',
		description: 'Sală de seminar cu mese modulare.',
		type: 'Room',
		capacity: 36,
		location: 'Corp C, etaj 1',
		isAvailable: false
	},
	{
		id: 5,
		name: 'Sala Senatului',
		description: 'Sală de consiliu pentru ședințe și susțineri de doctorat.',
		type: 'Room',
		capacity: 48,
		location: 'Rectorat, etaj 1',
		isAvailable: true
	},
	{
		id: 6,
		name: 'Laboratorul de Fizică F03',
		description: 'Laborator experimental cu bancuri de lucru și nișă chimică.',
		type: 'Room',
		capacity: 24,
		location: 'Corp D, demisol',
		isAvailable: true
	},
	{
		id: 7,
		name: 'Videoproiector Epson EB-L630U',
		description: 'Proiector laser WUXGA, 6200 lumeni, cu telecomandă și cablu HDMI.',
		type: 'Equipment',
		inventoryCode: 'INV-2023-0412',
		location: 'Depozit Corp A',
		isAvailable: true
	},
	{
		id: 8,
		name: 'Laptop Dell Latitude 5540',
		description: 'Intel Core i7, 16 GB RAM, pachet Office instalat.',
		type: 'Equipment',
		inventoryCode: 'INV-2024-0113',
		location: 'Secretariat Facultate',
		isAvailable: true
	},
	{
		id: 9,
		name: 'Sistem videoconferință Logitech Rally',
		description: 'Cameră PTZ 4K, microfoane și difuzor pentru săli de până la 40 de persoane.',
		type: 'Equipment',
		inventoryCode: 'INV-2022-0907',
		location: 'Sala Senatului',
		isAvailable: false
	},
	{
		id: 10,
		name: 'Set microfoane wireless Shure',
		description: 'Două microfoane de mână și un lavalieră, cu receptor dual.',
		type: 'Equipment',
		inventoryCode: 'INV-2023-0221',
		location: 'Aula Magna, regie',
		isAvailable: true
	},
	{
		id: 11,
		name: 'Cameră video Sony FX30',
		description: 'Kit pentru înregistrarea cursurilor, cu trepied și microfon.',
		type: 'Equipment',
		inventoryCode: 'INV-2024-0058',
		location: 'Centrul Media',
		isAvailable: true
	}
];

/** ISO timestamp `dayOffset` days from today at `hour:minute` local time. */
function at(dayOffset: number, hour: number, minute = 0): string {
	const d = new Date();
	d.setDate(d.getDate() + dayOffset);
	d.setHours(hour, minute, 0, 0);
	return d.toISOString();
}

const RESERVATIONS: ReservationDTO[] = [
	{ id: 1, userId: 2, resourceId: 2, startTime: at(0, 8), endTime: at(0, 10), purpose: 'Curs Algoritmi și structuri de date', status: 'Confirmed' },
	{ id: 2, userId: 1, resourceId: 3, startTime: at(0, 12), endTime: at(0, 14), purpose: 'Pregătire proiect de licență', status: 'Confirmed' },
	{ id: 3, userId: 2, resourceId: 7, startTime: at(0, 14), endTime: at(0, 16), purpose: 'Seminar Baze de date', status: 'Confirmed' },
	{ id: 4, userId: 3, resourceId: 5, startTime: at(0, 16), endTime: at(0, 18), purpose: 'Ședința Consiliului Facultății', status: 'Pending' },
	{ id: 5, userId: 1, resourceId: 8, startTime: at(1, 10), endTime: at(1, 12), purpose: 'Prezentare proiect echipă', status: 'Pending' },
	{ id: 6, userId: 2, resourceId: 1, startTime: at(2, 11), endTime: at(2, 13), purpose: 'Conferința „Zilele Facultății”', status: 'Pending' },
	{ id: 7, userId: 2, resourceId: 6, startTime: at(1, 8), endTime: at(1, 10), purpose: 'Laborator Fizică experimentală', status: 'Confirmed' },
	{ id: 8, userId: 1, resourceId: 11, startTime: at(-1, 15), endTime: at(-1, 17), purpose: 'Înregistrare podcast studențesc', status: 'Cancelled' }
];

function createTable<T extends { id: number }>(seed: T[]) {
	const rows = structuredClone(seed);
	let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

	return {
		all: (): T[] => structuredClone(rows),
		find: (id: number): T | undefined => {
			const row = rows.find((r) => r.id === id);
			return row && structuredClone(row);
		},
		insert: (data: Omit<T, 'id'>): T => {
			const row = { ...structuredClone(data), id: nextId++ } as T;
			rows.push(row);
			return structuredClone(row);
		},
		update: (id: number, patch: Partial<Omit<T, 'id'>>): T | undefined => {
			const row = rows.find((r) => r.id === id);
			if (!row) return undefined;
			Object.assign(row, structuredClone(patch));
			return structuredClone(row);
		},
		remove: (id: number): boolean => {
			const index = rows.findIndex((r) => r.id === id);
			if (index === -1) return false;
			rows.splice(index, 1);
			return true;
		}
	};
}

export const demoDb = {
	users: createTable<UserDTO>([...DEMO_USERS]),
	resources: createTable<ResourceDTO>(RESOURCES),
	reservations: createTable<ReservationDTO>(RESERVATIONS)
};
