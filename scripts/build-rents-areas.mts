/**
 * Build rents-areas.seed.json: area-level rents from StatFin asvu 15fa
 * (Vuokraindeksi 2025=100 ja keskineliövuokrat, CC BY 4.0), plus the postal
 * code → municipality → region lookups the rent tier chain needs.
 *
 * Why this exists: 13eb, the postal-code rent table, is archived and frozen at
 * 2025Q4. 15fa is live and currently runs to 2026Q3, and it publishes whole
 * municipalities rather than only the postal cells that clear the 20-
 * observation publication threshold — so it is both fresher than the town
 * cells synthesised in build-rents-seed.mts and free of their selection bias
 * (a town synthesised from published postal cells silently drops every
 * suppressed small area). It does not replace 13eb: nothing publishes rents
 * per postal code any more, so the postal tier stays on the archived table.
 *
 * Rerun when 15fa publishes a quarter (quarterly), or when the municipality
 * classification changes (annually):
 *   node --experimental-strip-types scripts/build-rents-areas.mts
 *
 * Output: src/lib/server/rents-areas.seed.json
 *   { table, quarters, kuntaByPostal, maakuntaByKunta, cells }
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RentCell } from '../src/lib/server/rents.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TABLE_URL = 'https://statfin.stat.fi/PxWeb/api/v1/fi/StatFin/asvu/15fa.px';
/** Paavo carries the municipality number per postal area; it has no region field. */
const PAAVO_WFS =
	'https://geo.stat.fi/geoserver/postialue/wfs' +
	'?service=WFS&version=2.0.0&request=GetFeature&typeName=postialue:pno_tilasto' +
	'&propertyName=postinumeroalue,kunta&outputFormat=application/json';
/** …so the region comes from the classification service's correspondence table. */
const KUNTA_TO_MK =
	'https://data.stat.fi/api/classifications/v2/correspondenceTables/' +
	'kunta_1_20260101%23maakunta_1_20260101/maps?content=data&meta=min&lang=fi';

/** Non-subsidised dwellings only — the same population 13eb covers. */
const FINANCING = '1';
const ROOMS: Record<string, string> = { '1': 'yksiö', '2': 'kaksio', '3': 'kolmio+' };
const PRICE = 'asvu_keskineliovuokra';
const COUNT = 'asvu_keskineliovuokra_lkm';

interface PxMeta {
	variables: { code: string; text?: string; values: string[]; valueTexts?: string[] }[];
}
interface JsonStat2 {
	id: string[];
	size: number[];
	value: (number | null)[];
	dimension: Record<string, { category: { index: Record<string, number> } }>;
}

function lookup(d: JsonStat2) {
	const codesByDim = d.id.map((dim) => {
		const index = d.dimension[dim].category.index;
		const arr: string[] = [];
		for (const [code, i] of Object.entries(index)) arr[i] = code;
		return arr;
	});
	const strides = d.size.map((_, i) => d.size.slice(i + 1).reduce((a, b) => a * b, 1));
	const data = new Map<string, number | null>();
	d.value.forEach((v, flat) => {
		data.set(
			d.id.map((_, i) => codesByDim[i][Math.floor(flat / strides[i]) % d.size[i]]).join('|'),
			v
		);
	});
	return (parts: Record<string, string>) =>
		data.get(d.id.map((dim) => parts[dim]).join('|')) ?? null;
}

/** MK01-MK19 in 15fa; sub-municipal rows ("Helsinki 1") end in _<digit>. */
const isRegion = (code: string) => /^MK\d\d$/.test(code);
const isSubArea = (code: string) => /_\d$/.test(code);
const isNational = (code: string) => ['SSS', 'pks', 'msu', 'keh'].includes(code);

async function main() {
	const meta = (await (await fetch(TABLE_URL)).json()) as PxMeta;
	const areaVar = meta.variables.find((v) => v.code.startsWith('alue'));
	const roomVar = meta.variables.find((v) => v.code.startsWith('huoneluku'));
	const financingVar = meta.variables.find((v) => v.code.startsWith('rahoitus'));
	if (!areaVar || !roomVar || !financingVar) throw new Error('15fa: expected dimensions missing');

	const quarters = (meta.variables.find((v) => v.code === 'timeperiod_q')?.values ?? []).slice(-4);
	if (quarters.length !== 4) throw new Error(`15fa: expected 4 quarters, got ${quarters.length}`);

	// Municipalities and regions only. Sub-municipal rows need a classification
	// we cannot map postal codes onto, and the national rows are coarser than
	// the region tier already is.
	const areas = areaVar.values.filter(
		(c) => !isSubArea(c) && !isNational(c)
	);
	const municipalities = areas.filter((c) => !isRegion(c));
	const regions = areas.filter(isRegion);
	console.log(
		`[rents-areas] quarters=${quarters.join(',')} municipalities=${municipalities.length} regions=${regions.length}`
	);

	const res = await fetch(TABLE_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: [
				{ code: 'timeperiod_q', selection: { filter: 'item', values: quarters } },
				{ code: areaVar.code, selection: { filter: 'item', values: areas } },
				{ code: financingVar.code, selection: { filter: 'item', values: [FINANCING] } },
				{ code: roomVar.code, selection: { filter: 'item', values: Object.keys(ROOMS) } }
			],
			response: { format: 'json-stat2' }
		})
	});
	if (!res.ok) throw new Error(`15fa query: HTTP ${res.status}`);
	const get = lookup((await res.json()) as JsonStat2);

	const cells: Record<string, RentCell> = {};
	let populated = 0;
	let suppressed = 0;
	for (const area of areas) {
		for (const [roomCode, roomName] of Object.entries(ROOMS)) {
			const base = {
				[areaVar.code]: area,
				[financingVar.code]: FINANCING,
				[roomVar.code]: roomCode
			};
			const series = quarters.map((q) => ({
				q,
				eur_m2: get({ ...base, timeperiod_q: q, contentscode: PRICE }),
				n: get({ ...base, timeperiod_q: q, contentscode: COUNT })
			}));
			// Suppressed quarters stay null and simply drop out of the mean; we
			// never substitute a number from another area or period.
			const good = series.filter((s) => s.eur_m2 !== null && s.n);
			const n4q = good.reduce((a, s) => a + (s.n as number), 0);
			const benchmark = n4q
				? good.reduce((a, s) => a + (s.eur_m2 as number) * (s.n as number), 0) / n4q
				: null;
			if (benchmark === null) {
				suppressed++;
				continue;
			}
			populated++;
			cells[`${area}_${roomName}`] = {
				benchmark_eur_m2_kk: Math.round(benchmark * 100) / 100,
				n_4q: n4q,
				latest_quarter: [...series].reverse().find((s) => s.eur_m2 !== null)?.q ?? null,
				series
			};
		}
	}
	console.log(`[rents-areas] ${populated} cells populated, ${suppressed} with no published quarter`);

	// Postal code -> municipality number (Paavo), municipality -> region
	// (classification service). 15fa keys municipalities by the same numbers.
	const paavo = (await (await fetch(PAAVO_WFS)).json()) as {
		features: { properties: { postinumeroalue: string; kunta: string } }[];
	};
	const kuntaByPostal: Record<string, string> = {};
	for (const f of paavo.features) {
		const { postinumeroalue: pc, kunta } = f.properties;
		if (!/^\d{5}$/.test(pc) || !kunta) continue;
		kuntaByPostal[pc] = String(kunta).padStart(3, '0');
	}

	const corr = (await (await fetch(KUNTA_TO_MK)).json()) as {
		sourceLocalId: string;
		targetLocalId: string;
	}[];
	const maakuntaByKunta: Record<string, string> = {};
	for (const row of corr) {
		const kunta = row.sourceLocalId.split('/')[1];
		const mk = row.targetLocalId.split('/')[1];
		if (!kunta || !mk) continue;
		maakuntaByKunta[kunta.padStart(3, '0')] = `MK${mk.padStart(2, '0')}`;
	}

	const mappedPostals = Object.keys(kuntaByPostal).length;
	const withRegion = Object.values(kuntaByPostal).filter((k) => maakuntaByKunta[k]).length;
	const withMunicipalityCell = Object.values(kuntaByPostal).filter(
		(k) => cells[`${k}_kaksio`]
	).length;
	console.log(
		`[rents-areas] postal codes mapped: ${mappedPostals} | reaching a municipality cell: ${withMunicipalityCell} | reaching a region: ${withRegion}`
	);

	const out = {
		table: '15fa',
		quarters,
		kuntaByPostal,
		maakuntaByKunta,
		cells
	};
	const path = resolve(root, 'src/lib/server/rents-areas.seed.json');
	writeFileSync(path, JSON.stringify(out) + '\n', 'utf8');
	console.log(`[rents-areas] wrote ${path}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
