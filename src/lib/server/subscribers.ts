/**
 * Subscriber entitlements (Supabase PostgREST, service role). Unlike supalog
 * these surface failures — losing a paying customer's entitlement silently is
 * not acceptable.
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

export interface Subscriber {
	id: string;
	email: string;
	status: 'active' | 'past_due' | 'canceled';
	access_token: string;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSubscriberByToken(token: string): Promise<Subscriber | null> {
	if (!configured() || !UUID.test(token)) return null;
	try {
		const res = await fetch(
			`${env.SUPABASE_URL}/rest/v1/subscribers?access_token=eq.${token}&limit=1`,
			{ headers: headers(), signal: AbortSignal.timeout(3000) }
		);
		if (!res.ok) return null;
		const rows = (await res.json()) as Subscriber[];
		return rows[0] ?? null;
	} catch {
		return null;
	}
}

/** Idempotent upsert on email; returns the row (with access_token). */
export async function upsertSubscriber(fields: {
	email: string;
	stripe_customer_id?: string | null;
	stripe_subscription_id?: string | null;
	status?: Subscriber['status'];
}): Promise<Subscriber | null> {
	if (!configured()) return null;
	try {
		const res = await fetch(
			`${env.SUPABASE_URL}/rest/v1/subscribers?on_conflict=email`,
			{
				method: 'POST',
				headers: {
					...headers(),
					prefer: 'resolution=merge-duplicates,return=representation'
				},
				body: JSON.stringify(fields),
				signal: AbortSignal.timeout(5000)
			}
		);
		if (!res.ok) return null;
		const rows = (await res.json()) as Subscriber[];
		return rows[0] ?? null;
	} catch {
		return null;
	}
}

/** Webhook lifecycle: update status by Stripe subscription id. */
export async function setStatusBySubscriptionId(
	subscriptionId: string,
	status: Subscriber['status']
): Promise<boolean> {
	if (!configured() || !/^sub_[a-zA-Z0-9_]+$/.test(subscriptionId)) return false;
	try {
		const res = await fetch(
			`${env.SUPABASE_URL}/rest/v1/subscribers?stripe_subscription_id=eq.${subscriptionId}`,
			{
				method: 'PATCH',
				headers: headers(),
				body: JSON.stringify({ status }),
				signal: AbortSignal.timeout(5000)
			}
		);
		return res.ok;
	} catch {
		return false;
	}
}
