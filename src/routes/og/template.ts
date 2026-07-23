/**
 * Brand OG image element tree for the site's default share card (homepage,
 * /kartta, /kaupunki). Same Satori-via-@vercel/og approach as the /arvio share
 * card (see src/routes/arvio/og/template.ts) — plain h() element tree, no JSX,
 * no react import (CLAUDE.md dev-gotchas). Editorial ink-on-paper, square
 * corners, no gradient, no emoji. StatFin attribution stays visible (rule 2).
 */
import { MARK_DATA_URI } from '$lib/brand/mark';

type OgNode = unknown;

const BG = '#fafaf7';
const INK = '#0a0a0a';
const INK_2 = '#4a4a4a';
const INK_3 = '#7a7a7a';
const LINE = '#d8d4ca';

function h(
	type: string,
	props: Record<string, unknown> | null,
	...children: unknown[]
): unknown {
	const { style, ...rest } = props ?? {};
	const flatStyle =
		style && typeof style === 'object'
			? Object.fromEntries(
					Object.entries(style as Record<string, string | number>).map(([k, v]) => [k, String(v)])
				)
			: undefined;
	return {
		type,
		props: {
			...(flatStyle ? { style: flatStyle } : {}),
			...rest,
			children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children
		}
	};
}

export function BrandOgTemplate(): OgNode {
	const style = (s: Record<string, string | number>): Record<string, string | number> => s;

	return h(
		'div',
		{
			style: style({
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
				height: '100%',
				background: BG,
				padding: 72,
				fontFamily: 'IBM Plex Sans',
				color: INK
			})
		},
		// Lockup: mark + wordmark + attribution to Fides Group
		h(
			'div',
			{ style: style({ display: 'flex', alignItems: 'center', gap: 18 }) },
			h('img', { src: MARK_DATA_URI, width: 64, height: 64 }),
			h(
				'div',
				{ style: style({ fontSize: 40, fontWeight: 600, letterSpacing: -1 }) },
				'RehtiArvio'
			),
			h('div', { style: style({ flexGrow: 1 }) }),
			h('div', { style: style({ fontSize: 24, color: INK_3 }) }, 'Fides Group')
		),
		// Center: tagline + supporting line
		h(
			'div',
			{
				style: style({
					display: 'flex',
					flexDirection: 'column',
					flexGrow: 1,
					justifyContent: 'center',
					gap: 24
				})
			},
			h(
				'div',
				{
					style: style({
						fontSize: 76,
						fontWeight: 600,
						letterSpacing: -3,
						lineHeight: 1.05,
						maxWidth: 1000
					})
				},
				'Toteutuneet hinnat, ei mielipiteet.'
			),
			h(
				'div',
				{ style: style({ fontSize: 30, color: INK_2, maxWidth: 920, lineHeight: 1.3 }) },
				'Vertaa pyyntihintaa Tilastokeskuksen toteutuneisiin kauppoihin postinumeroalueittain. Ilmainen.'
			)
		),
		// Footer: attribution
		h(
			'div',
			{
				style: style({
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'baseline',
					borderTop: `1px solid ${LINE}`,
					paddingTop: 20,
					fontSize: 20,
					color: INK_3
				})
			},
			h('div', null, 'Lähde: Tilastokeskus, 13mt'),
			h('div', null, 'rehtiarvio.fi')
		)
	);
}
