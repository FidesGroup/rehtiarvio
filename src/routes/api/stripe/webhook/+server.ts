import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { verifyStripeSignature } from '$lib/server/stripe';
import { setStatusBySubscriptionId, upsertSubscriber } from '$lib/server/subscribers';
import type { RequestHandler } from './$types';

/** Stripe subscription lifecycle -> subscribers.status. Raw-body HMAC verify. */
export const POST: RequestHandler = async ({ request }) => {
	if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'not configured' }, { status: 503 });

	const payload = await request.text();
	const ok = verifyStripeSignature(
		payload,
		request.headers.get('stripe-signature'),
		env.STRIPE_WEBHOOK_SECRET
	);
	if (!ok) return json({ error: 'bad signature' }, { status: 400 });

	let event: any;
	try {
		event = JSON.parse(payload);
	} catch {
		return json({ error: 'bad payload' }, { status: 400 });
	}

	const obj = event?.data?.object ?? {};
	switch (event?.type) {
		case 'checkout.session.completed': {
			const email = obj.customer_details?.email ?? obj.customer_email;
			if (email && obj.mode === 'subscription') {
				await upsertSubscriber({
					email: String(email).toLowerCase(),
					stripe_customer_id: typeof obj.customer === 'string' ? obj.customer : null,
					stripe_subscription_id:
						typeof obj.subscription === 'string' ? obj.subscription : null,
					status: 'active'
				});
			}
			break;
		}
		case 'customer.subscription.updated': {
			const map: Record<string, 'active' | 'past_due' | 'canceled'> = {
				active: 'active',
				trialing: 'active',
				past_due: 'past_due',
				unpaid: 'canceled',
				canceled: 'canceled',
				incomplete_expired: 'canceled'
			};
			const status = map[obj.status as string];
			if (obj.id && status) await setStatusBySubscriptionId(obj.id, status);
			break;
		}
		case 'customer.subscription.deleted': {
			if (obj.id) await setStatusBySubscriptionId(obj.id, 'canceled');
			break;
		}
	}
	return json({ received: true });
};
