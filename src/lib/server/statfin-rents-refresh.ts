/**
 * Build a fresh rent seed map (postal cells + synthesized town fall-backs)
 * from the StatFin asvu 13eb table. Mirrors scripts/build-rents-seed.mts so
 * the cron produces an output shape the rents engine already consumes.
 *
 * Used by /api/refresh when Supabase is configured (writes to `rents` table),
 * and by the one-shot bootstrap script when it isn't (writes the JSON seed).
 *
 * Suppression rule (StatFin note, 13eb): cells with < 20 observations OR a
 * high share of rental-housing-company data are returned as null. We never
 * substitute a different number — the engine's postal→town tier chain handles
 * fall-back.
 */
import { fetchRentsMeta, fetchRents } from './statfin-rents';
import type { RentCell } from './rents';

const TABLE_URL =
	'https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin_Passiivi/asvu/statfinpas_asvu_pxt_13eb_2025q4.px';

const ROOM_KEY: Record<'yksiö' | 'kaksio' | 'kolmio+', string> = {
	'yksiö': 'yksiö',
	kaksio: 'kaksio',
	'kolmio+': 'kolmio+'
};

async function fetchPostalToTown(): Promise<Map<string, string>> {
	const res = await fetch(TABLE_URL);
	if (!res.ok) throw new Error(`StatFin asvu meta: HTTP ${res.status}`);
	const meta = (await res.json()) as {
		variables: { code: string; values: string[]; valueTexts: string[] }[];
	};
	const pcDim = meta.variables.find((v) => v.code === 'Postinumero');
	if (!pcDim) throw new Error('Postinumero dim missing');
	const out = new Map<string, string>();
	for (let i = 0; i < pcDim.values.length; i++) {
		const pc = pcDim.values[i];
		const m = (pcDim.valueTexts[i] ?? '').match(/\(([^)]+)\)/);
		if (!m) continue;
		const town = m[1].trim();
		if (town) out.set(pc, town);
	}
	return out;
}

export async function buildRentsSeed(): Promise<{
	quarters: string[];
	postalCells: number;
	townCells: number;
	cells: Record<string, RentCell>;
}> {
	const { quarters, postalCodes } = await fetchRentsMeta();
	const wantedQuarters = quarters.slice(-4);
	const pcToTown = await fetchPostalToTown();
	const cells = await fetchRents({ quarters: wantedQuarters, postalCodes });

	const out: Record<string, RentCell> = {};
	let populated = 0;
	for (const [k, v] of Object.entries(cells)) {
		out[k] = v;
		if (v.benchmark_eur_m2_kk !== null) populated++;
	}

	// Synthesize town-level fall-back cells (transaction-weighted across populated
	// postal cells in the same town). Identical math to build-rents-seed.mts so
	// the engine's tier chain resolves to the same numbers either way.
	const townAgg = new Map<
		string,
		{
			num: number;
			den: number;
			n: number;
			seriesMap: Map<string, { num: number; den: number; n: number }>;
		}
	>();
	for (const [key, v] of Object.entries(cells)) {
		if (v.benchmark_eur_m2_kk === null) continue;
		const pc = key.split('_')[0];
		const town = pcToTown.get(pc);
		if (!town) continue;
		const room = key.split('_')[1] as keyof typeof ROOM_KEY;
		const k = `${town}_${ROOM_KEY[room]}`;
		if (!townAgg.has(k)) townAgg.set(k, { num: 0, den: 0, n: 0, seriesMap: new Map() });
		const a = townAgg.get(k)!;
		a.num += v.benchmark_eur_m2_kk * v.n_4q;
		a.den += v.n_4q;
		a.n += v.n_4q;
		for (const s of v.series) {
			if (s.eur_m2 === null || s.n === null) continue;
			const ek = s.q;
			if (!a.seriesMap.has(ek)) a.seriesMap.set(ek, { num: 0, den: 0, n: 0 });
			const e = a.seriesMap.get(ek)!;
			e.num += s.eur_m2 * s.n;
			e.den += s.n;
			e.n += s.n;
		}
	}
	let townCells = 0;
	for (const [k, a] of townAgg) {
		if (a.den === 0) continue;
		const eurM2 = a.num / a.den;
		const series = wantedQuarters.map((q) => {
			const e = a.seriesMap.get(q);
			return e && e.den > 0
				? { q, eur_m2: e.num / e.den, n: e.n }
				: { q, eur_m2: null, n: null };
		});
		out[k] = {
			benchmark_eur_m2_kk: eurM2,
			n_4q: a.n,
			latest_quarter: [...series].reverse().find((s) => s.eur_m2 !== null)?.q ?? null,
			series
		};
		townCells++;
	}
	const postalCells = Object.keys(cells).length;
	return { quarters: wantedQuarters, postalCells, townCells, cells: out };
}