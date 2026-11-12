/**
 * Old apartment €/m² by larger area, quarterly, assembled from the two
 * vintages Tilastokeskus currently publishes (CC BY 4.0):
 *
 *   - 15is, the 2025=100 release (`ashivq_keskineliohinta`), live and current
 *     but starting only at 2025Q1;
 *   - 13mv, the 2020=100 predecessor (`keskihinta_aritm`), paused since
 *     June 2026 and readable from the StatFin_Passiivi archive, covering
 *     2006Q1-2026Q1.
 *
 * The vintages overlap on 2025Q1-2026Q1 and disagree there, so which one wins
 * matters. 13mv wins every quarter it published, and the release supplies only
 * the quarters after it (2026Q2 onwards). Reason: the release's 2025Q1 average
 * contradicts both its predecessor and Tilastokeskus' own quality-adjusted
 * index — for muu Suomi the index moves +0.9 % into 2025Q2 and 13mv's average
 * +1.0 %, while the release's average jumps +8.7 % (1757 → 1909 €/m²). Taking
 * the release there would draw a one-quarter crash and rebound that no index
 * shows. Don't flip this to "newest wins" without re-checking that quarter.
 *
 *   - `cell()` returns figures exactly as published, so every number on a page
 *     traces back to a StatFin cell. Use it for €/m² levels.
 *   - `chainLinked()` scales the appended quarters by the count-weighted ratio
 *     of the vintages over their overlap, the way a rebased statistic is
 *     chained. Use it for an index, where an unlinked seam reads as a real
 *     move.
 *
 * Consumers: country-history.ts (levels) and regional-history.ts (index).
 */
import {
	AREA_PRICE_TABLES_LEGACY,
	contentCode,
	dimCode,
	lookup,
	pickValue,
	queryTable,
	resolveTable,
	type ResolvedTable
} from './statfin-tables.ts';

/** 2025=100 release — quarterly, by area, with the room-type split. */
const CURRENT_TABLES = ['https://statfin.stat.fi/PxWeb/api/v1/fi/StatFin/ashi/15is.px'] as const;

/**
 * Canonical area keys are the 13mv codes the callers already use; the 2025=100
 * release renamed "koko maa" from `ksu` to the standard `SSS`.
 */
const AREA_ALIASES: Record<string, readonly string[]> = {
	ksu: ['ksu', 'SSS'],
	pks: ['pks'],
	msu: ['msu']
};

/** Both vintages publish the room-type split for kerrostalot only. */
const BUILDING_TYPE = '3';
const PRICE_CODES = ['ashivq_keskineliohinta', 'keskihinta_aritm'] as const;
/** Counts switched register in 2020; the 2025=100 release publishes only the tax one. */
const COUNT_CODES = ['ashivq_kauppamaara_vvero', 'lkm_julk20', 'lkm_julk19'] as const;

export type Vintage = 'current' | 'legacy';

export interface AreaCell {
	eur: number | null;
	n: number | null;
	vintage: Vintage;
}

export interface AreaPriceSeries {
	/** union of both vintages' quarters, ascending */
	quarters: string[];
	/** as published; current vintage wins on the overlap */
	cell(area: string, room: string, q: string): AreaCell | null;
	/**
	 * Transaction-weighted €/m² across `rooms`, chain-linked across the
	 * vintage seam so the series can be indexed without a spurious step.
	 */
	chainLinked(area: string, rooms: readonly string[]): (number | null)[];
	/** first quarter taken from the current vintage, null when it adds none */
	linkedFrom: string | null;
}

async function fetchVintage(
	table: ResolvedTable,
	areas: readonly string[],
	rooms: readonly string[],
	from: string | undefined,
	vintage: Vintage,
	timeoutMs: number
): Promise<Map<string, AreaCell>> {
	const out = new Map<string, AreaCell>();
	const { meta, url } = table;
	const areaDim = dimCode(meta, 'alue');
	const typeDim = dimCode(meta, 'talotyyppi');
	const roomDim = dimCode(meta, 'huoneluku');
	const priceCode = contentCode(meta, PRICE_CODES);
	if (!areaDim || !typeDim || !roomDim || !priceCode) return out;

	const quarters = from ? table.quarters.filter((q) => q >= from) : table.quarters;
	if (!quarters.length) return out;

	const areaCodes = new Map<string, string>();
	for (const area of areas) {
		const code = pickValue(meta, 'alue', AREA_ALIASES[area] ?? [area]);
		if (code) areaCodes.set(area, code);
	}
	if (!areaCodes.size) return out;

	const countCode = contentCode(meta, COUNT_CODES);
	const d = await queryTable(
		url,
		[
			{ code: 'timeperiod_q', selection: { filter: 'item', values: quarters } },
			{ code: areaDim, selection: { filter: 'item', values: [...areaCodes.values()] } },
			{ code: typeDim, selection: { filter: 'item', values: [BUILDING_TYPE] } },
			{ code: roomDim, selection: { filter: 'item', values: [...rooms] } }
		],
		{ timeoutMs }
	);
	if (!d) return out;
	const get = lookup(d);

	for (const [area, code] of areaCodes) {
		for (const room of rooms) {
			for (const q of quarters) {
				const parts: Record<string, string> = {
					timeperiod_q: q,
					[areaDim]: code,
					[typeDim]: BUILDING_TYPE,
					[roomDim]: room
				};
				const eur = get({ ...parts, contentscode: priceCode });
				// 13mv carries both count registers; take whichever is published.
				const n = countCode
					? (get({ ...parts, contentscode: countCode }) ??
						get({ ...parts, contentscode: 'lkm_julk19' }))
					: null;
				if (eur === null && n === null) continue;
				out.set(`${area}|${room}|${q}`, { eur, n, vintage });
			}
		}
	}
	return out;
}

function weightedFrom(
	source: Map<string, AreaCell>,
	area: string,
	rooms: readonly string[],
	q: string
): { eur: number; n: number } | null {
	let sum = 0;
	let n = 0;
	for (const room of rooms) {
		const c = source.get(`${area}|${room}|${q}`);
		if (!c || c.eur === null || !c.n) continue;
		sum += c.eur * c.n;
		n += c.n;
	}
	return n > 0 ? { eur: sum / n, n } : null;
}

/**
 * Best-effort: returns whichever vintages answered, or null if neither did.
 * `from` trims both pulls to quarters >= that value.
 */
export async function fetchAreaPrices(
	areas: readonly string[],
	rooms: readonly string[],
	opts: { from?: string; timeoutMs?: number } = {}
): Promise<AreaPriceSeries | null> {
	const timeoutMs = opts.timeoutMs ?? 6000;
	const [currentTable, legacyTable] = await Promise.all([
		resolveTable(CURRENT_TABLES, { timeoutMs }),
		resolveTable(AREA_PRICE_TABLES_LEGACY, { timeoutMs })
	]);
	const empty = () => new Map<string, AreaCell>();
	const [current, legacy] = await Promise.all([
		currentTable
			? fetchVintage(currentTable, areas, rooms, opts.from, 'current', timeoutMs).catch(empty)
			: empty(),
		legacyTable
			? fetchVintage(legacyTable, areas, rooms, opts.from, 'legacy', timeoutMs).catch(empty)
			: empty()
	]);
	if (!current.size && !legacy.size) return null;

	// 13mv wins every quarter it published (see the note at the top); the
	// current release only extends the series past the end of the paused table.
	const legacyLast = [...legacy.keys()].map((k) => k.split('|')[2]).sort().at(-1) ?? null;
	const cells = new Map<string, AreaCell>(legacy);
	for (const [k, v] of current) {
		if (legacyLast !== null && k.split('|')[2] <= legacyLast) continue;
		cells.set(k, v);
	}

	const quarters = [...new Set([...cells.keys()].map((k) => k.split('|')[2]))].sort();
	const linkedFrom =
		[...cells.keys()]
			.filter((k) => cells.get(k)!.vintage === 'current')
			.map((k) => k.split('|')[2])
			.sort()[0] ?? null;

	const cell = (area: string, room: string, q: string) => cells.get(`${area}|${room}|${q}`) ?? null;

	const chainLinked = (area: string, rooms2: readonly string[]) => {
		// Mean of the per-quarter level ratios over the overlapping quarters,
		// weighted by the smaller of the two transaction counts. A ratio of
		// summed values would not do: the vintages disagree on the counts too
		// (the paused table froze 2026Q1 half-counted), and that mismatch would
		// swamp the level difference the factor is meant to capture.
		let weightSum = 0;
		let ratioSum = 0;
		for (const q of quarters) {
			const l = weightedFrom(legacy, area, rooms2, q);
			const c = weightedFrom(current, area, rooms2, q);
			if (!l || !c || c.eur <= 0) continue;
			const w = Math.min(l.n, c.n);
			ratioSum += (l.eur / c.eur) * w;
			weightSum += w;
		}
		const factor = weightSum > 0 ? ratioSum / weightSum : 1;
		return quarters.map((q) => {
			const linked = linkedFrom !== null && q >= linkedFrom;
			const w = weightedFrom(linked ? current : legacy, area, rooms2, q);
			if (!w) return null;
			return linked ? w.eur * factor : w.eur;
		});
	};

	return { quarters, cell, chainLinked, linkedFrom };
}
