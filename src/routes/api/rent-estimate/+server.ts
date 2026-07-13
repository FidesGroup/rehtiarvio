import { error, json } from '@sveltejs/kit';
import { estimateRent } from '$lib/server/rents';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const pc = (url.searchParams.get('pc') ?? '').trim();
	const rt = (url.searchParams.get('rt') ?? '').trim();
	const m2Raw = url.searchParams.get('m2') ?? '';
	if (!/^\d{5}$/.test(pc)) throw error(400, 'pc');
	if (rt !== 'yksiö' && rt !== 'kaksio' && rt !== 'kolmio+') throw error(400, 'rt');
	const m2 = Number(m2Raw);
	if (!Number.isFinite(m2) || m2 < 10 || m2 > 400) throw error(400, 'm2');
	const est = estimateRent(pc, rt, m2);
	return json({
		monthlyRentEur: est.monthlyRentEur,
		tier: est.tier,
		latestQuarter: est.latestQuarter
	});
};