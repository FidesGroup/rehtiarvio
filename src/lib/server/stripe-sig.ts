/**
 * Stripe webhook signature verification (HMAC-SHA256 over `${t}.${payload}`,
 * https://docs.stripe.com/webhooks/signature). Pure — no env, no fetch — so it
 * is unit-testable outside SvelteKit.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyStripeSignature(
	payload: string,
	header: string | null,
	secret: string,
	toleranceS = 300,
	nowS = Math.floor(Date.now() / 1000)
): boolean {
	if (!header) return false;
	const parts = new Map<string, string[]>();
	for (const kv of header.split(',')) {
		const [k, v] = kv.split('=', 2);
		if (!k || !v) continue;
		parts.set(k.trim(), [...(parts.get(k.trim()) ?? []), v.trim()]);
	}
	const t = Number(parts.get('t')?.[0]);
	const sigs = parts.get('v1') ?? [];
	if (!Number.isFinite(t) || sigs.length === 0) return false;
	if (Math.abs(nowS - t) > toleranceS) return false;
	const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
	const exp = Buffer.from(expected, 'utf8');
	return sigs.some((s) => {
		const got = Buffer.from(s, 'utf8');
		return got.length === exp.length && timingSafeEqual(got, exp);
	});
}
