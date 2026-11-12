/**
 * Rent estimate engine: postal code + room type -> monthly rent estimate
 * (€/m²/kk) + confidence tier + flags. Used by /arvio and the landing form
 * prefill. Sourced from StatFin asvu tables 13eb and 15fa, CC BY 4.0.
 *
 * Two tables, because no single one covers the chain. 13eb is the only source
 * of postal-code rents, and it is archived and frozen at 2025Q4. 15fa is live
 * (currently 2026Q3) and publishes whole municipalities and regions, so it
 * carries the fall-back tiers — and it covers each municipality fully, where a
 * town synthesised from published postal cells drops every suppressed small
 * area. Each cell keeps its own `latest_quarter`, which the UI prints: a
 * municipality figure and its neighbour's synthesised one can be from
 * different quarters, and the reader gets to see that.
 *
 * Honesty discipline (rule 4): every RentEstimate carries the source tier and
 * a flag string list. Suppressed cells fall through to the next tier; we never
 * substitute a different number.
 */
import seed from './rents.seed.json';
import areaSeed from './rents-areas.seed.json';
import { postalToTown } from './postal-areas';
import type { RoomsType } from './benchmark';

export interface RentSeriesPoint {
	q: string;
	eur_m2: number | null;
	n: number | null;
}

export interface RentCell {
	benchmark_eur_m2_kk: number | null;
	n_4q: number;
	latest_quarter: string | null;
	series: RentSeriesPoint[];
}

/**
 * Narrowest first: the postal cell, then the municipality as 15fa publishes
 * it, then the municipality synthesised from 13eb's postal cells (which
 * reaches ~135 towns 15fa does not name), then the region.
 */
export type RentTier = 'postal' | 'kunta' | 'town' | 'mk' | null;

export interface RentEstimate {
	monthlyEurM2: number | null;
	monthlyRentEur: number | null;
	n4q: number;
	latestQuarter: string | null;
	tier: RentTier;
	flags: string[];
}

const TYPE_KEY: Record<RoomsType, string> = {
	'yksiö': 'yksiö',
	kaksio: 'kaksio',
	'kolmio+': 'kolmio+'
};

const cells = seed as Record<string, RentCell>;
const areaCells = areaSeed.cells as Record<string, RentCell>;
const kuntaByPostal = areaSeed.kuntaByPostal as Record<string, string>;
const maakuntaByKunta = areaSeed.maakuntaByKunta as Record<string, string>;

function getCell(postalCode: string, roomsType: RoomsType): {
	cell: RentCell | null;
	tier: RentTier;
} {
	const room = TYPE_KEY[roomsType];
	const populated = (source: Record<string, RentCell>, key: string) => {
		const c = source[key];
		return c && c.benchmark_eur_m2_kk !== null ? c : null;
	};

	const direct = populated(cells, `${postalCode}_${room}`);
	if (direct) return { cell: direct, tier: 'postal' };

	// 15fa names 27 municipalities; everywhere else falls to the synthesised
	// town below, which covers far more of them but only from published cells.
	const kunta = kuntaByPostal[postalCode];
	if (kunta) {
		const c = populated(areaCells, `${kunta}_${room}`);
		if (c) return { cell: c, tier: 'kunta' };
	}

	const town = postalToTown(postalCode);
	if (town) {
		const c = populated(cells, `${town}_${room}`);
		if (c) return { cell: c, tier: 'town' };
	}

	const mk = kunta ? maakuntaByKunta[kunta] : null;
	if (mk) {
		const c = populated(areaCells, `${mk}_${room}`);
		if (c) return { cell: c, tier: 'mk' };
	}

	return { cell: null, tier: null };
}

/**
 * Estimate a monthly rent for a listing. Returns null monthlyRentEur when no
 * cell is available at any tier — the UI must then ask the user to type rent.
 *
 * `monthlyEurM2` is the per-m²-per-month benchmark from StatFin; multiply by
 * the listing's living area to get the suggested monthly rent.
 */
export function estimateRent(
	postalCode: string,
	roomsType: RoomsType,
	livingAreaM2: number
): RentEstimate {
	const flags: string[] = [];
	const { cell, tier } = getCell(postalCode, roomsType);

	if (!cell || cell.benchmark_eur_m2_kk === null || tier === null) {
		flags.push(
			'Tilastokeskus ei julkaise tälle postinumerolle ja huonetyypille vuokra-aineistoa. Syötäthän vuokran käsin.'
		);
		return {
			monthlyEurM2: null,
			monthlyRentEur: null,
			n4q: 0,
			latestQuarter: null,
			tier: null,
			flags
		};
	}

	if (tier === 'kunta' || tier === 'town') {
		flags.push(
			`Vuokra-arvio nojaa kunnan tasoon (${cell.benchmark_eur_m2_kk} €/m²/kk), koska postinumeroalueen omaa aineistoa Tilastokeskus ei julkaise.`
		);
	} else if (tier === 'mk') {
		flags.push(
			`Vuokra-arvio nojaa maakunnan tasoon, koska kuntatasollakaan ei ole julkaistua vuokratietoa.`
		);
	}

	if (cell.n_4q < 20) {
		flags.push(
			`Otos on pieni (${cell.n_4q} havaintoa). Tilastokeskuksen salassapitoraja on 20 havaintoa.`
		);
	}

	const monthlyRentEur = Math.round(cell.benchmark_eur_m2_kk * livingAreaM2);
	return {
		monthlyEurM2: cell.benchmark_eur_m2_kk,
		monthlyRentEur,
		n4q: cell.n_4q,
		latestQuarter: cell.latest_quarter,
		tier,
		flags
	};
}

export function knownRentPostalCodes(): string[] {
	return [
		...new Set(
			Object.keys(cells)
				.map((k) => k.split('_')[0])
				.filter((pc) => /^\d{5}$/.test(pc))
		)
	].sort();
}