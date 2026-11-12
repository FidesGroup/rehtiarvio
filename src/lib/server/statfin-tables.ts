/**
 * StatFin PxWeb table resolution, shared by every module that reads a
 * quarterly price table (CC BY 4.0 — "Lähde: Tilastokeskus" stays visible
 * wherever the values appear, rule 2).
 *
 * Tilastokeskus paused three `ashi` tables — 12dd, 13mt and 13mv — from
 * June 2026 for production reasons (stat.fi change notice
 * cms4b6l867u9006ultlfde2ik) and moved the last published snapshots into the
 * StatFin_Passiivi archive. The live ids answer HTTP 400 until the pause
 * ends; the archived copies carry identical variable codes and end at 2026Q1,
 * which is the newest postal-code quarter published anywhere.
 *
 * So every caller resolves through `resolveTable`, live id first: the site
 * reads the archive today and picks fresh quarters up by itself the moment
 * the live table returns, with no code change. Metadata is cached per process
 * for 12 h, the same TTL the history modules use for their data.
 */

export interface PxVariable {
	code: string;
	text?: string;
	values: string[];
	valueTexts?: string[];
}

export interface PxMeta {
	title: string;
	variables: PxVariable[];
}

export interface ResolvedTable {
	url: string;
	meta: PxMeta;
	/** true when the live id was unavailable and the archived snapshot answered */
	archived: boolean;
	/** published quarters, ascending */
	quarters: string[];
}

/** Old apartment €/m² + transaction counts by postal code, quarterly (13mt). */
export const POSTAL_PRICE_TABLES = [
	'https://statfin.stat.fi/PxWeb/api/v1/fi/StatFin/ashi/13mt.px',
	'https://statfin.stat.fi/PxWeb/api/v1/fi/StatFin_Passiivi/ashi/statin_pas_13mt.px'
] as const;

/**
 * Old apartment €/m² + transaction counts by larger area, quarterly (13mv).
 * The 2025=100 release (15is, see statfin-areaprices.ts) continues this
 * series from 2025Q1 on; 13mv remains the only source for earlier quarters.
 */
export const AREA_PRICE_TABLES_LEGACY = [
	'https://statfin.stat.fi/PxWeb/api/v1/fi/StatFin/ashi/13mv.px',
	'https://statfin.stat.fi/PxWeb/api/v1/fi/StatFin_Passiivi/ashi/statfin_pas_13mv.px'
] as const;

const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; table: ResolvedTable | null }>();

/**
 * First candidate whose metadata answers. Returns null when none does —
 * callers decide whether that is fatal (the refresh cron) or a best-effort
 * miss (the history charts).
 */
export async function resolveTable(
	candidates: readonly string[],
	opts: { timeoutMs?: number } = {}
): Promise<ResolvedTable | null> {
	const key = candidates.join('|');
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.table;

	let table: ResolvedTable | null = null;
	for (const [i, url] of candidates.entries()) {
		try {
			const res = await fetch(url, {
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(opts.timeoutMs ?? 6000)
			});
			if (!res.ok) continue;
			const meta = (await res.json()) as PxMeta;
			const quarters = meta.variables?.find((v) => v.code === 'timeperiod_q')?.values ?? [];
			if (!quarters.length) continue;
			table = { url, meta, archived: i > 0, quarters };
			break;
		} catch {
			// try the next candidate
		}
	}
	cache.set(key, { at: Date.now(), table });
	return table;
}

/**
 * Variable code by prefix (`alue`, `postinumeroalue`, `talotyyppi`, …).
 * PxWeb versions these codes with a date suffix and bumps them on
 * reclassification, so never hardcode the full code at a call site.
 */
export function dimCode(meta: PxMeta, prefix: string): string | null {
	return meta.variables.find((v) => v.code.startsWith(prefix))?.code ?? null;
}

/** First listed `contentscode` the table actually publishes. */
export function contentCode(meta: PxMeta, candidates: readonly string[]): string | null {
	const published = meta.variables.find((v) => v.code === 'contentscode')?.values ?? [];
	return candidates.find((c) => published.includes(c)) ?? null;
}

/** First alias present in a variable's value list (area codes get renamed). */
export function pickValue(meta: PxMeta, prefix: string, aliases: readonly string[]): string | null {
	const values = meta.variables.find((v) => v.code.startsWith(prefix))?.values ?? [];
	return aliases.find((a) => values.includes(a)) ?? null;
}

export interface JsonStat2 {
	id: string[];
	size: number[];
	value: (number | null)[];
	dimension: Record<string, { category: { index: Record<string, number> } }>;
}

/** POST a PxWeb query and return a flat `dim1|dim2|…` lookup over the cube. */
export function lookup(d: JsonStat2): (parts: Record<string, string>) => number | null {
	const codesByDim = d.id.map((dim) => {
		const index = d.dimension[dim].category.index;
		const arr: string[] = [];
		for (const [code, i] of Object.entries(index)) arr[i] = code;
		return arr;
	});
	const strides = d.size.map((_, i) => d.size.slice(i + 1).reduce((a, b) => a * b, 1));
	const data = new Map<string, number | null>();
	d.value.forEach((v, flat) => {
		const key = d.id
			.map((_, i) => codesByDim[i][Math.floor(flat / strides[i]) % d.size[i]])
			.join('|');
		data.set(key, v);
	});
	return (parts) => data.get(d.id.map((dim) => parts[dim]).join('|')) ?? null;
}

export async function queryTable(
	url: string,
	query: { code: string; selection: { filter: string; values: string[] } }[],
	opts: { timeoutMs?: number } = {}
): Promise<JsonStat2 | null> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query, response: { format: 'json-stat2' } }),
		signal: AbortSignal.timeout(opts.timeoutMs ?? 6000)
	});
	if (!res.ok) return null;
	return (await res.json()) as JsonStat2;
}
