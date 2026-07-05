/**
 * Asuntocard jobs (`reports` rows) and results (`scorecards`). The web app
 * only creates jobs and reads results; extraction runs on the offline worker
 * (private repo) — no LLM in the request path.
 */
import { env } from '$env/dynamic/private';

function headers(): Record<string, string> {
	return {
		apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
		authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
		'content-type': 'application/json'
	};
}

function configured(): boolean {
	return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export interface ReportRow {
	id: string;
	created_at: string;
	status: 'pending' | 'paid' | 'processing' | 'done' | 'failed';
	email: string;
	listing_url: string | null;
	facts: Record<string, unknown>;
	scorecard_id: number | null;
	subscriber_id: string | null;
}

export interface ScorecardRow {
	id: number;
	company_name: string | null;
	data: Record<string, unknown>;
	extraction_confidence: number | null;
	created_at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createReport(args: {
	email: string;
	subscriberId: string;
	listingUrl: string | null;
	facts: Record<string, unknown>;
}): Promise<string | null> {
	if (!configured()) return null;
	try {
		const res = await fetch(`${env.SUPABASE_URL}/rest/v1/reports`, {
			method: 'POST',
			headers: { ...headers(), prefer: 'return=representation' },
			body: JSON.stringify({
				email: args.email,
				subscriber_id: args.subscriberId,
				listing_url: args.listingUrl,
				facts: args.facts,
				status: 'pending'
			}),
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) return null;
		const rows = (await res.json()) as { id: string }[];
		return rows[0]?.id ?? null;
	} catch {
		return null;
	}
}

export async function getReport(
	id: string
): Promise<{ report: ReportRow; scorecard: ScorecardRow | null } | null> {
	if (!configured() || !UUID.test(id)) return null;
	try {
		const res = await fetch(`${env.SUPABASE_URL}/rest/v1/reports?id=eq.${id}&limit=1`, {
			headers: headers(),
			signal: AbortSignal.timeout(4000)
		});
		if (!res.ok) return null;
		const rows = (await res.json()) as ReportRow[];
		const report = rows[0];
		if (!report) return null;

		let scorecard: ScorecardRow | null = null;
		if (report.scorecard_id !== null) {
			const sres = await fetch(
				`${env.SUPABASE_URL}/rest/v1/scorecards?id=eq.${report.scorecard_id}&limit=1`,
				{ headers: headers(), signal: AbortSignal.timeout(4000) }
			);
			if (sres.ok) scorecard = ((await sres.json()) as ScorecardRow[])[0] ?? null;
		}
		return { report, scorecard };
	} catch {
		return null;
	}
}
