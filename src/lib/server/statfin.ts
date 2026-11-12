/**
 * Statistics Finland PxWeb client for table 13mt
 * (old apartment EUR/m2 + transaction counts by postal code, quarterly, CC BY 4.0).
 * Used by the refresh cron; the app itself reads the local seed / Supabase cache.
 * Attribution requirement: "Lähde: Tilastokeskus" must be shown wherever values appear.
 */
import type { BenchmarkCell } from './benchmark';
import { POSTAL_PRICE_TABLES, dimCode, lookup, queryTable, resolveTable } from './statfin-tables.ts';

/**
 * The cron pulls every known postal code at once, so it gets a far longer
 * budget than the per-request history fetches.
 */
const TIMEOUT_MS = 120_000;

async function postalTable() {
	const table = await resolveTable(POSTAL_PRICE_TABLES, { timeoutMs: TIMEOUT_MS });
	if (!table) {
		throw new Error('StatFin metadata: 13mt unavailable (live id and archive both failed)');
	}
	return table;
}

// Room types
const TYPES: Record<string, string> = { '1': 'yksiöt', '2': 'kaksiot', '3': 'kolmiot+' };

// Building types (talotyyppi) — used to separate row houses from apartments
// Stage 2 toggle: set SPLIT_BY_BUILDING_TYPE to true to enable row house separation
const SPLIT_BY_BUILDING_TYPE = false; // Phase 2 feature flag
const BUILDING_TYPES: Record<string, string> = {
	'1': 'kerrostalo',  // apartment building
	'2': 'rivitalo'      // row house
};

export async function fetchLatestQuarters(count = 4): Promise<string[]> {
	const { quarters } = await postalTable();
	return quarters.slice(-count);
}

export async function fetchBenchmarks(
	postalCodes: string[],
	quarters: string[]
): Promise<Record<string, BenchmarkCell>> {
	const buildingTypesToFetch = SPLIT_BY_BUILDING_TYPE
		? Object.keys(BUILDING_TYPES)
		: Object.keys(TYPES); // When disabled, fetch all room types (current behavior)

	const table = await postalTable();
	const postalDim = dimCode(table.meta, 'postinumeroalue');
	// talotyyppi can filter by building type (1=kerrostalo, 2=rivitalo) or by room type
	const typeDim = dimCode(table.meta, 'talotyyppi');
	if (!postalDim || !typeDim) throw new Error('StatFin query: 13mt dimensions missing');

	const d = await queryTable(
		table.url,
		[
			{ code: 'timeperiod_q', selection: { filter: 'item', values: quarters } },
			{ code: postalDim, selection: { filter: 'item', values: postalCodes } },
			{ code: typeDim, selection: { filter: 'item', values: buildingTypesToFetch } }
		],
		{ timeoutMs: TIMEOUT_MS }
	);
	if (!d) throw new Error('StatFin query failed');

	const cube = lookup(d);
	const get = (post: string, t: string, q: string, metric: string) =>
		cube({ timeperiod_q: q, [postalDim]: post, [typeDim]: t, contentscode: metric });

	const out: Record<string, BenchmarkCell> = {};
	for (const post of postalCodes) {
		if (SPLIT_BY_BUILDING_TYPE) {
			// Phase 2: separate row houses from apartments
			for (const [bt, btName] of Object.entries(BUILDING_TYPES)) {
				for (const [t, typeName] of Object.entries(TYPES)) {
					const series = quarters.map((q) => ({
						q,
						eur_m2: get(post, bt, q, 'keskihinta_aritm_nw'),
						n: get(post, bt, q, 'lkm_julk20')
					}));
					const good = series.filter((s) => s.eur_m2 !== null && s.n);
					const nSum = good.reduce((a, s) => a + (s.n as number), 0);
					// Key format: postal_buildingtype_roomtype (e.g., "00100_kerrostalo_kaksiot")
					out[`${post}_${btName}_${typeName}`] = {
						benchmark_eur_m2: good.length
							? Math.round(good.reduce((a, s) => a + (s.eur_m2 as number) * (s.n as number), 0) / nSum)
							: null,
						n_4q: nSum,
						series
					};
				}
			}
		} else {
			// Current behavior: blend kerrostalo + rivitalo
			for (const [t, name] of Object.entries(TYPES)) {
				const series = quarters.map((q) => ({
					q,
					eur_m2: get(post, t, q, 'keskihinta_aritm_nw'),
					n: get(post, t, q, 'lkm_julk20')
				}));
				const good = series.filter((s) => s.eur_m2 !== null && s.n);
				const nSum = good.reduce((a, s) => a + (s.n as number), 0);
				out[`${post}_${name}`] = {
					benchmark_eur_m2: good.length
						? Math.round(good.reduce((a, s) => a + (s.eur_m2 as number) * (s.n as number), 0) / nSum)
						: null,
					n_4q: nSum,
					series
				};
			}
		}
	}
	return out;
}
