/**
 * Whole-country price history from StatFin's area price tables (old apartment
 * €/m² and transaction counts, quarterly since 2006, CC BY 4.0): the 2025=100
 * release for 2025Q1 onwards, 13mv from the archive before that — see
 * statfin-areaprices.ts. Yearly figures are the €/m² each vintage published,
 * never a rescaled number.
 *
 * Same shape as AreaHistory so the /arvio history charts render it unchanged
 * on the Kartta page. Best-effort + cached.
 */
import { fetchAreaPrices } from './statfin-areaprices.ts';
import type { AreaHistory, YearPoint } from './history';

const AREA = 'ksu'; // Koko maa
const ROOMS: Record<string, string> = { '01': 'yksiöt', '02': 'kaksiot', '03': 'kolmiot+' };

let cache: { at: number; data: AreaHistory | null } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000;

export async function fetchCountryHistory(): Promise<AreaHistory | null> {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
	let data: AreaHistory | null = null;
	try {
		data = await fetchUncached();
	} catch (e) {
		console.error('country-history:', e);
		data = null;
	}
	cache = { at: Date.now(), data };
	return data;
}

async function fetchUncached(): Promise<AreaHistory | null> {
	const series = await fetchAreaPrices([AREA], Object.keys(ROOMS));
	if (!series) return null;
	const quarters = series.quarters;
	if (!quarters.length) return null;

	const get = (room: string, q: string) => series.cell(AREA, room, q)?.eur ?? null;
	const getN = (room: string, q: string) => series.cell(AREA, room, q)?.n ?? null;

	// Yearly figures are levels, so they stay as each vintage published them.
	const byYear = new Map<number, { sums: Record<string, number>; ns: Record<string, number>; n: number }>();
	for (const q of quarters) {
		const year = Number(q.slice(0, 4));
		if (!byYear.has(year)) byYear.set(year, { sums: {}, ns: {}, n: 0 });
		const y = byYear.get(year)!;
		for (const [room, name] of Object.entries(ROOMS)) {
			const eur = get(room, q);
			const n = getN(room, q);
			if (eur !== null && n) {
				y.sums[name] = (y.sums[name] ?? 0) + eur * n;
				y.ns[name] = (y.ns[name] ?? 0) + n;
				y.n += n;
			}
		}
	}
	// The 12-month change and the trend are rates over the most recent
	// quarters, which straddle the vintage seam — take those from the
	// chain-linked series so the handover cannot show up as price movement.
	const qMeans = series
		.chainLinked(AREA, Object.keys(ROOMS))
		.filter((v): v is number => v !== null);
	const years: YearPoint[] = [...byYear.entries()]
		.map(([year, y]) => ({
			year,
			eur: Object.fromEntries(
				Object.values(ROOMS).map((name) => [
					name,
					y.ns[name] ? Math.round(y.sums[name] / y.ns[name]) : null
				])
			),
			n: y.n
		}))
		.sort((a, b) => a.year - b.year);
	if (!years.some((y) => y.n > 0)) return null;

	const means = years
		.map((y) => {
			const vals = Object.values(ROOMS)
				.map((name) => y.eur[name])
				.filter((e): e is number => e !== null);
			return vals.length
				? { year: y.year, eur: vals.reduce((a, b) => a + b, 0) / vals.length }
				: null;
		})
		.filter((m): m is { year: number; eur: number } => m !== null);
	let annualChangePct: number | null = null;
	if (means.length >= 3) {
		const first = means[0];
		const last = means[means.length - 1];
		const span = last.year - first.year;
		if (span >= 2 && first.eur > 0) {
			annualChangePct = Math.round(((last.eur / first.eur) ** (1 / span) - 1) * 1000) / 10;
		}
	}
	let last12moChangePct: number | null = null;
	if (qMeans.length >= 8) {
		const recent = qMeans.slice(-4).reduce((a, b) => a + b, 0) / 4;
		const prev = qMeans.slice(-8, -4).reduce((a, b) => a + b, 0) / 4;
		if (prev > 0) last12moChangePct = Math.round((recent / prev - 1) * 1000) / 10;
	}
	let next12moTrendPct: number | null = null;
	{
		const N = Math.min(qMeans.length, 20);
		if (N >= 8) {
			const ys = qMeans.slice(-N);
			const xm = (N - 1) / 2;
			const ym = ys.reduce((a, b) => a + b, 0) / N;
			const denom = ys.reduce((a, _, i) => a + (i - xm) ** 2, 0);
			const slope = ys.reduce((a, y, i) => a + (i - xm) * (y - ym), 0) / denom;
			const lastMean = qMeans.slice(-4).reduce((a, b) => a + b, 0) / 4;
			const nextMean = lastMean + slope * 4;
			if (lastMean > 0) next12moTrendPct = Math.round((nextMean / lastMean - 1) * 1000) / 10;
		}
	}

	return { postalCode: AREA, years, annualChangePct, last12moChangePct, next12moTrendPct };
}
