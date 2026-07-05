import { fail, redirect } from '@sveltejs/kit';
import { createSubscriptionCheckout, stripeEnabled } from '$lib/server/stripe';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ enabled: stripeEnabled() });

export const actions: Actions = {
	default: async ({ request, url }) => {
		if (!stripeEnabled()) {
			return fail(503, { error: 'Tilaus ei ole vielä avoinna — liity odotuslistalle etusivulla.' });
		}
		const email = String((await request.formData()).get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
			return fail(400, { error: 'Tarkista sähköpostiosoite.' });
		}
		let checkoutUrl: string;
		try {
			checkoutUrl = await createSubscriptionCheckout(email, url.origin);
		} catch {
			return fail(502, { error: 'Maksusivun avaaminen epäonnistui — yritä hetken kuluttua.' });
		}
		redirect(303, checkoutUrl);
	}
};
