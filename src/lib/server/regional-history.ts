/**
 * Regional divergence series from StatFin's area price tables (old apartment
 * €/m² by larger areas, quarterly, CC BY 4.0): Pääkaupunkiseutu (pks) vs the
 * rest of the country (msu, "Koko maa ilman pääkaupunkiseutua"), indexed
 * 2020 = 100. Optionally deflated with the consumer price index (khi 11xs)
 * into real terms. Best-effort + cached like country-history; the page
 * renders nothing when StatFin does not answer.
 *
 * The 2020=100 and 2025=100 vintages disagree on the level by a few per cent,
 * in opposite directions for the two regions, so the quarters are chain-linked
 * before indexing (statfin-areaprices.ts) — an unlinked seam at 2025Q1 would
 * draw a divergence step that never happened.
 */
import { fetchAreaPrices } from './statfin-areaprices.ts';
import { lookup, queryTable, type JsonStat2 } from './statfin-tables.ts';

const CPI_URL = 'https://statfin.stat.fi/PxWeb/api/v1/fi/StatFin/khi/11xs.px';
const AREAS = { pks: 'Pääkaupunkiseutu', msu: 'Muu Suomi' } as const;
const ROOMS = ['01', '02', '03'];
const FIRST_QUARTER = '2015Q1';
const BASE_YEAR = 2020;

export type RegionKey = keyof typeof AREAS;

export interface DivergenceSeries {
	quarters: string[];
	/** price index per region, base 2020 = 100; null where suppressed */
	nominal: Record<RegionKey, (number | null)[]>;
	/** CPI-deflated variant, same base; null when the CPI fetch failed */
	real: Record<RegionKey, (number | null)[]> | null;
	baseYear: number;
}

let cache: { at: number; data: DivergenceSeries | null } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000;

export async function fetchDivergence(): Promise<DivergenceSeries | null> {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
	let data: DivergenceSeries | null = null;
	try {
		data = await fetchUncached();
	} catch (e) {
		console.error('regional-history:', e);
		data = null;
	}
	cache = { at: Date.now(), data };
	return data;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

async function fetchUncached(): Promise<DivergenceSeries | null> {
	const series = await fetchAreaPrices(Object.keys(AREAS), ROOMS, { from: FIRST_QUARTER });
	if (!series) return null;
	const quarters = series.quarters;
	if (!quarters.length) return null;

	// Transaction-weighted €/m² across room types per (region, quarter),
	// chain-linked across the 2020=100 → 2025=100 vintage seam.
	const eurByRegion: Record<RegionKey, (number | null)[]> = {
		pks: series.chainLinked('pks', ROOMS),
		msu: series.chainLinked('msu', ROOMS)
	};

	// Rebase both regions to their own 2020 average = 100.
	const nominal = {} as Record<RegionKey, (number | null)[]>;
	for (const region of Object.keys(AREAS) as RegionKey[]) {
		const base = baseAverage(quarters, eurByRegion[region]);
		if (base === null) return null;
		nominal[region] = eurByRegion[region].map((v) => (v === null ? null : round1((v / base) * 100)));
	}

	const cpiQ = await fetchCpiQuarterly(quarters).catch(() => null);
	let real: Record<RegionKey, (number | null)[]> | null = null;
	if (cpiQ) {
		const cpiBase = baseAverage(quarters, cpiQ);
		if (cpiBase !== null) {
			real = {} as Record<RegionKey, (number | null)[]>;
			for (const region of Object.keys(AREAS) as RegionKey[]) {
				real[region] = nominal[region].map((v, i) => {
					const cpi = cpiQ[i];
					return v === null || cpi === null ? null : round1(v / (cpi / cpiBase));
				});
			}
		}
	}

	return { quarters, nominal, real, baseYear: BASE_YEAR };
}

function baseAverage(quarters: string[], values: (number | null)[]): number | null {
	const base = quarters
		.map((q, i) => ({ q, v: values[i] }))
		.filter((x) => x.q.startsWith(String(BASE_YEAR)) && x.v !== null)
		.map((x) => x.v as number);
	if (base.length < 4) return null;
	return base.reduce((a, b) => a + b, 0) / base.length;
}

/**
 * Quarterly CPI point figures (mean of the three months). 11xs publishes one
 * series per base year and newer bases don't reach back in time, so all
 * point-figure series are fetched and the newest one that covers both the
 * 2020 base window and the latest complete quarter wins. The base year is
 * irrelevant — everything is rebased to 2020 by the caller.
 */
async function fetchCpiQuarterly(quarters: string[]): Promise<(number | null)[] | null> {
	const metaRes = await fetch(CPI_URL, { signal: AbortSignal.timeout(6000) });
	if (!metaRes.ok) return null;
	const meta = (await metaRes.json()) as { variables: { code: string; values: string[] }[] };
	const pisteCodes = (meta.variables.find((v) => v.code === 'contentscode')?.values ?? []).filter(
		(c) => c.startsWith('ip_0_')
	);
	const allMonths = meta.variables.find((v) => v.code === 'timeperiod_m')?.values ?? [];
	const firstYear = quarters[0].slice(0, 4);
	const months = allMonths.filter((m) => m.slice(0, 4) >= firstYear);
	if (!pisteCodes.length || !months.length) return null;

	const res = await fetch(CPI_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: [
				{ code: 'timeperiod_m', selection: { filter: 'item', values: months } },
				{ code: 'contentscode', selection: { filter: 'item', values: pisteCodes } }
			],
			response: { format: 'json-stat2' }
		}),
		signal: AbortSignal.timeout(6000)
	});
	if (!res.ok) return null;
	const d = (await res.json()) as JsonStat2;
	const get = lookup(d);

	const quarterly = (code: string) =>
		quarters.map((q) => {
			const year = q.slice(0, 4);
			const nr = Number(q.slice(5));
			const vals: number[] = [];
			for (let m = (nr - 1) * 3 + 1; m <= nr * 3; m++) {
				const v = get({
					timeperiod_m: `${year}M${String(m).padStart(2, '0')}`,
					contentscode: code
				});
				if (v !== null) vals.push(v);
			}
			return vals.length === 3 ? vals.reduce((a, b) => a + b, 0) / 3 : null;
		});

	for (const code of [...pisteCodes].reverse()) {
		const series = quarterly(code);
		if (baseAverage(quarters, series) !== null && series.at(-1) !== null) return series;
	}
	return null;
}
