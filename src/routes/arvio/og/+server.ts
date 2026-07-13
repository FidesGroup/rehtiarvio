import { error } from '@sveltejs/kit';
import { ImageResponse } from '@vercel/og';
import { evaluate, parseFacts } from '$lib/server/benchmark';
import { OgTemplate } from './template';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const facts = parseFacts(url.searchParams);
	if ('error' in facts) throw error(400, facts.error);
	const verdict = evaluate(facts);
	return new ImageResponse(
		OgTemplate({
			postalCode: facts.postalCode,
			roomsType: facts.roomsType,
			livingAreaM2: facts.livingAreaM2,
			buildYear: facts.buildYear,
			deltaPct: verdict.deltaPct,
			confidence: verdict.confidence,
			transactions4q: verdict.transactions4q
		}),
		{ width: 1200, height: 630 }
	);
};