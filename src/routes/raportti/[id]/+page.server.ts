import { error } from '@sveltejs/kit';
import { getReport } from '$lib/server/reports';
import type { PageServerLoad } from './$types';

/**
 * Asuntocard view. The uuid in the URL is the capability: unguessable, held
 * only by the subscriber who ordered the card. While the offline worker runs,
 * the page self-refreshes; once scorecard_id is set it renders the card.
 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const result = await getReport(params.id);
	if (!result) error(404, 'Raporttia ei löytynyt.');
	setHeaders({ 'cache-control': 'no-store' });
	return {
		report: {
			id: result.report.id,
			status: result.report.status,
			createdAt: result.report.created_at,
			facts: result.report.facts,
			listingUrl: result.report.listing_url
		},
		scorecard: result.scorecard
			? { data: result.scorecard.data, confidence: result.scorecard.extraction_confidence }
			: null
	};
};
