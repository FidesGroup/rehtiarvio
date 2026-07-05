/**
 * Stripe over plain REST — deliberately no SDK dependency. Only three
 * operations are needed: create a subscription Checkout Session, retrieve a
 * session after redirect, and verify webhook signatures (see stripe-sig.ts).
 * Everything no-ops cleanly when STRIPE_SECRET_KEY / STRIPE_PRICE_ID are not
 * configured.
 */
import { env } from '$env/dynamic/private';

export { verifyStripeSignature } from './stripe-sig';

const API = 'https://api.stripe.com/v1';

export function stripeEnabled(): boolean {
	return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID);
}

async function stripePost(path: string, params: Record<string, string>): Promise<any> {
	const res = await fetch(`${API}${path}`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams(params),
		signal: AbortSignal.timeout(10_000)
	});
	const body = await res.json();
	if (!res.ok) throw new Error(`Stripe ${path}: ${body?.error?.message ?? res.status}`);
	return body;
}

/** Create a subscription-mode Checkout Session; returns the redirect URL. */
export async function createSubscriptionCheckout(
	email: string,
	origin: string
): Promise<string> {
	const session = await stripePost('/checkout/sessions', {
		mode: 'subscription',
		'line_items[0][price]': env.STRIPE_PRICE_ID!,
		'line_items[0][quantity]': '1',
		customer_email: email,
		allow_promotion_codes: 'true',
		success_url: `${origin}/tili?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${origin}/tilaa`
	});
	return session.url as string;
}

export interface CheckoutResult {
	email: string | null;
	customerId: string | null;
	subscriptionId: string | null;
	paid: boolean;
}

export async function getCheckoutSession(id: string): Promise<CheckoutResult | null> {
	if (!/^cs_[a-zA-Z0-9_]+$/.test(id)) return null;
	const res = await fetch(`${API}/checkout/sessions/${id}`, {
		headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) return null;
	const s = await res.json();
	return {
		email: s.customer_details?.email ?? s.customer_email ?? null,
		customerId: typeof s.customer === 'string' ? s.customer : (s.customer?.id ?? null),
		subscriptionId:
			typeof s.subscription === 'string' ? s.subscription : (s.subscription?.id ?? null),
		paid: s.payment_status === 'paid' || s.status === 'complete'
	};
}
