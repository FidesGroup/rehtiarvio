import { describe, expect, it } from 'vitest';
import { estimateRent, type RentCell } from './rents';
import areaSeed from './rents-areas.seed.json';
import seed from './rents.seed.json';

/**
 * The tier chain is where the rent engine can quietly mislead: every fall-back
 * widens the area the figure describes, and the reader only learns that from
 * the tier flag and the quarter. These fixtures are real postal codes, picked
 * because each one falls through to a different rung.
 */
describe('estimateRent tier chain', () => {
	it('uses the postal cell when StatFin publishes one', () => {
		const e = estimateRent('00100', 'kaksio', 50);
		expect(e.tier).toBe('postal');
		expect(e.monthlyEurM2).toBe(
			(seed as Record<string, RentCell>)['00100_kaksio'].benchmark_eur_m2_kk
		);
		expect(e.flags).toEqual([]);
	});

	it('falls back to the municipality 15fa publishes, and says so', () => {
		const e = estimateRent('00160', 'kaksio', 50);
		expect(e.tier).toBe('kunta');
		expect(e.monthlyEurM2).toBe(areaSeed.cells['091_kaksio'].benchmark_eur_m2_kk);
		expect(e.flags.join(' ')).toContain('kunnan tasoon');
	});

	it('prefers the published municipality over the synthesised town', () => {
		// 00160 sits in Helsinki, which exists on both rungs. The 15fa figure
		// wins: it covers the whole municipality and is the fresher quarter.
		const e = estimateRent('00160', 'kaksio', 50);
		const synthesised = (seed as Record<string, RentCell>)['Helsinki_kaksio'];
		expect(e.monthlyEurM2).not.toBe(synthesised.benchmark_eur_m2_kk);
		expect(e.latestQuarter).toBe(areaSeed.cells['091_kaksio'].latest_quarter);
		// Quarter labels sort lexicographically, so this is a real recency check.
		expect(e.latestQuarter! > synthesised.latest_quarter!).toBe(true);
	});

	it('uses the synthesised town where 15fa names no municipality', () => {
		const e = estimateRent('01150', 'kaksio', 50);
		expect(e.tier).toBe('town');
		expect(e.flags.join(' ')).toContain('kunnan tasoon');
	});

	it('falls back to the region, and says the figure is region-wide', () => {
		const e = estimateRent('01120', 'kaksio', 50);
		expect(e.tier).toBe('mk');
		expect(e.monthlyEurM2).toBe(areaSeed.cells['MK01_kaksio'].benchmark_eur_m2_kk);
		expect(e.flags.join(' ')).toContain('maakunnan tasoon');
	});

	it('asks for a typed rent where nothing is published (Ahvenanmaa)', () => {
		const e = estimateRent('22100', 'kaksio', 50);
		expect(e.tier).toBeNull();
		expect(e.monthlyRentEur).toBeNull();
		expect(e.flags.join(' ')).toContain('käsin');
	});

	it('scales the monthly rent by living area', () => {
		const e = estimateRent('00100', 'kaksio', 50);
		expect(e.monthlyRentEur).toBe(Math.round(e.monthlyEurM2! * 50));
	});

	it('never substitutes a number for a suppressed cell', () => {
		// Every returned figure must be the cell of the tier it claims.
		for (const pc of ['00100', '00160', '01150', '01120']) {
			const e = estimateRent(pc, 'kaksio', 50);
			expect(e.monthlyEurM2).not.toBeNull();
			expect(e.latestQuarter).toBeTruthy();
			expect(e.n4q).toBeGreaterThan(0);
		}
	});
});
