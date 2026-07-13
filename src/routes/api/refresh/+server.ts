import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { knownPostalCodes } from '$lib/server/benchmark';
import { fetchBenchmarks, fetchLatestQuarters } from '$lib/server/statfin';
import { buildRentsSeed } from '$lib/server/statfin-rents-refresh';
import type { RequestHandler } from './$types';

/**
 * GET /api/refresh — Vercel cron target (see vercel.json).
 *
 * Refreshes two StatFin datasets:
 *   - 13mt (realized apartment sale prices by postal code, quarterly)
 *   - asvu 13eb (non-subsidised rents by postal code, quarterly, archive table)
 *
 * With Supabase configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) the
 * cells are upserted into `benchmarks` and `rents`. Without it, the fresh
 * cells are returned in the response so the seed JSON files can be updated
 * manually. Guarded by CRON_SECRET.
 *
 * Runs the two fetches in parallel: the rent pull is the larger one (580
 * postal codes × 3 room types × 4 quarters × 2 metrics ≈ 14k values) so
 * starting it alongside the price pull trims wall-clock time.
 */
export const GET: RequestHandler = async ({ request }) => {
	const auth = request.headers.get('authorization');
	if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [quarters, rentsResult] = await Promise.all([
		fetchLatestQuarters(4),
		buildRentsSeed()
	]);
	const priceCells = await fetchBenchmarks(knownPostalCodes(), quarters);

	const useSupabase = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
	if (useSupabase) {
		const priceRows = Object.entries(priceCells).map(([key, cell]) => {
			const [postal_code, rooms_type] = [key.slice(0, 5), key.slice(6)];
			return { postal_code, rooms_type, ...cell, refreshed_at: new Date().toISOString() };
		});
		const rentRows = Object.entries(rentsResult.cells).map(([key, cell]) => {
			const [pc, ...rest] = key.split('_');
			const rooms_type = rest.join('_');
			return {
				postal_or_town: /^\d{5}$/.test(pc) ? 'postal' : 'town',
				key,
				postal_code: pc,
				rooms_type,
				benchmark_eur_m2_kk: cell.benchmark_eur_m2_kk,
				n_4q: cell.n_4q,
				latest_quarter: cell.latest_quarter,
				series: cell.series,
				refreshed_at: new Date().toISOString()
			};
		});

		const headers = {
			apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
			authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
			'content-type': 'application/json',
			prefer: 'resolution=merge-duplicates'
		};
		const [priceRes, rentRes] = await Promise.all([
			fetch(`${env.SUPABASE_URL}/rest/v1/benchmarks`, {
				method: 'POST',
				headers,
				body: JSON.stringify(priceRows)
			}),
			fetch(`${env.SUPABASE_URL}/rest/v1/rents`, {
				method: 'POST',
				headers,
				body: JSON.stringify(rentRows)
			})
		]);
		if (!priceRes.ok) return json({ error: `Supabase benchmarks upsert failed: ${priceRes.status}` }, { status: 502 });
		if (!rentRes.ok) return json({ error: `Supabase rents upsert failed: ${rentRes.status}` }, { status: 502 });
		return json({
			sink: 'supabase',
			quarters,
			prices: { refreshed: priceRows.length },
			rents: {
				refreshed: rentRows.length,
				postal: rentsResult.postalCells,
				town: rentsResult.townCells
			}
		});
	}

	return json({
		sink: 'response-only',
		quarters,
		prices: { refreshed: Object.keys(priceCells).length, cells: priceCells },
		rents: {
			refreshed: Object.keys(rentsResult.cells).length,
			postal: rentsResult.postalCells,
			town: rentsResult.townCells,
			cells: rentsResult.cells
		}
	});
};