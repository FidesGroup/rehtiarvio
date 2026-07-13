/**
 * Statistics Finland PxWeb client for asvu table 13eb
 * (Average rents per square meter for non-subsidised rental dwellings by postal
 * code area, CC BY 4.0). 580 postal codes × 3 room types, quarterly.
 *
 * NOTE: this table lives in the StatFin archive database (StatFin_Passiivi) but
 * is queryable via the same PxWeb API and continues to be updated. If the table
 * id changes again (PxWeb identifier shortening in 2026-06), update TABLE_URL
 * and the variable codes here.
 *
 * Suppressed-cell rule (per StatFin note): if there are < 20 observations or
 * rental-housing-company share is high in the postal code, values are
 * suppressed (returned as null). Treat nulls as "no estimate for this cell" —
 * callers must fall back to a wider area, never substitute a different number.
 *
 * Attribution requirement: "Lähde: Tilastokeskus" must be shown wherever
 * values appear.
 */
import type { RentCell } from './rents';

const TABLE_URL =
	'https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin_Passiivi/asvu/statfinpas_asvu_pxt_13eb_2025q4.px';

const ROOM_CODE: Record<keyof RentCell, never> | Record<string, string> = {
	'yksiö': '01',
	kaksio: '02',
	'kolmio+': '03'
};
type RoomKey = 'yksiö' | 'kaksio' | 'kolmio+';

export async function fetchRentsMeta(): Promise<{ quarters: string[]; postalCodes: string[] }> {
	const res = await fetch(TABLE_URL);
	if (!res.ok) throw new Error(`StatFin rents meta: HTTP ${res.status}`);
	const meta = (await res.json()) as {
		variables: { code: string; values: string[] }[];
	};
	const quarters =
		meta.variables.find((v) => v.code === 'Vuosineljännes')?.values ?? [];
	const postalCodes =
		meta.variables.find((v) => v.code === 'Postinumero')?.values ?? [];
	return { quarters, postalCodes };
}

export interface FetchRentsOptions {
	quarters: string[];
	postalCodes: string[];
}

export async function fetchRents(
	opts: FetchRentsOptions
): Promise<Record<string, RentCell>> {
	const query = {
		query: [
			{
				code: 'Vuosineljännes',
				selection: { filter: 'item', values: opts.quarters }
			},
			{
				code: 'Postinumero',
				selection: { filter: 'item', values: opts.postalCodes }
			},
			{
				code: 'Huoneluku',
				selection: { filter: 'item', values: ['01', '02', '03'] }
			},
			{
				code: 'Tiedot',
				selection: { filter: 'item', values: ['keskivuokra', 'lkm_ptno'] }
			}
		],
		response: { format: 'json-stat2' }
	};

	const res = await fetch(TABLE_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json; charset=utf-8' },
		body: JSON.stringify(query)
	});
	if (!res.ok) throw new Error(`StatFin rents query: HTTP ${res.status}`);

	const d = (await res.json()) as {
		id: string[];
		size: number[];
		value: (number | null)[];
		dimension: Record<string, { category: { index: Record<string, number> } }>;
	};

	const codesByDim = d.id.map((dim) => {
		const index = d.dimension[dim].category.index;
		const arr: string[] = [];
		for (const [code, i] of Object.entries(index)) arr[i] = code;
		return arr;
	});

	const data = new Map<string, number | null>();
	const strides = d.size.map((_, i) =>
		d.size.slice(i + 1).reduce((a, b) => a * b, 1)
	);
	d.value.forEach((v, flat) => {
		const key = d.id
			.map((_, i) => codesByDim[i][Math.floor(flat / strides[i]) % d.size[i]])
			.join('|');
		data.set(key, v);
	});

	const get = (q: string, post: string, room: string, metric: string) => {
		const parts: Record<string, string> = {
			Vuosineljännes: q,
			Postinumero: post,
			Huoneluku: room,
			Tiedot: metric
		};
		return data.get(d.id.map((dim) => parts[dim]).join('|')) ?? null;
	};

	const out: Record<string, RentCell> = {};
	for (const post of opts.postalCodes) {
		for (const [roomKey, roomCode] of Object.entries(ROOM_CODE) as [
			RoomKey,
			string
		][]) {
			const series = opts.quarters.map((q) => ({
				q,
				eur_m2: get(q, post, roomCode, 'keskivuokra'),
				n: get(q, post, roomCode, 'lkm_ptno')
			}));
			const eurM2 = lastNonNull(series.map((s) => s.eur_m2));
			const n4q = sumNonNull(series.map((s) => s.n));
			const latestQuarter = lastWithData(series);
			out[`${post}_${roomKey}`] = {
				benchmark_eur_m2_kk: eurM2,
				n_4q: n4q,
				latest_quarter: latestQuarter,
				series
			};
		}
	}
	return out;
}

function lastNonNull(vals: (number | null)[]): number | null {
	for (let i = vals.length - 1; i >= 0; i--) {
		if (vals[i] !== null) return vals[i];
	}
	return null;
}

function sumNonNull(vals: (number | null)[]): number {
	let s = 0;
	for (const v of vals) if (v !== null && Number.isFinite(v)) s += v;
	return s;
}

function lastWithData(
	series: { q: string; eur_m2: number | null }[]
): string | null {
	for (let i = series.length - 1; i >= 0; i--) {
		if (series[i].eur_m2 !== null) return series[i].q;
	}
	return null;
}