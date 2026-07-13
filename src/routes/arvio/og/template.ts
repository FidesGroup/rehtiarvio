/**
 * OG image element tree for /arvio share cards. Satori (from @vercel/og) takes
 * a React-like element tree and renders it to a PNG. We use createElement
 * instead of JSX so the file can be plain .ts and survive svelte-check.
 *
 * Design rules: CLAUDE.md rule 10 — square corners, Baltic petrol accent,
 * copper / pine for over/under market, no gradient, no emoji section markers.
 * Attribution: "Lähde: Tilastokeskus, 13mt" must appear (CLAUDE.md rule 2).
 */

// Satori expects a React-like element tree. The shape is structurally compatible
// with React.ReactNode; we keep it untyped here to avoid pulling in react as a
// project dep (it is bundled inside @vercel/og at runtime).
type OgNode = unknown;

const BG = '#f5f4ee';
const INK = '#101414';
const INK_2 = '#4a5252';
const INK_3 = '#7a8080';
const LINE = '#e0ddd1';
const OVER = '#a4512e';
const UNDER = '#2e6b46';

export interface OgTemplateInput {
	postalCode: string;
	roomsType: string;
	livingAreaM2: number;
	buildYear: number | null | undefined;
	deltaPct: number | null;
	confidence: string;
	transactions4q: number;
}

// Minimal createElement that produces the exact shape Satori consumes.
// Signature: createElement(type, props, ...children) -> element
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

export function OgTemplate(p: OgTemplateInput): OgNode {
	const deltaStr =
		p.deltaPct === null
			? '–'
			: `${p.deltaPct > 0 ? '+' : ''}${String(p.deltaPct).replace('.', ',')} %`;
	const deltaColor = p.deltaPct === null ? INK : p.deltaPct >= 0 ? OVER : UNDER;
	const verdictLabel =
		p.deltaPct === null
			? 'Ei vertailuarvoa'
			: p.deltaPct >= 0
				? 'Pyyntihinta on alueen toteutuneiden kauppojen yläpuolella'
				: 'Pyyntihinta on alueen toteutuneiden kauppojen alapuolella';

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
				padding: 64,
				fontFamily: 'IBM Plex Sans',
				color: INK
			})
		},
		h(
			'div',
			{ style: style({ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }) },
			h('div', { style: style({ width: 14, height: 14, background: '#0f6a78' }) }),
			h(
				'div',
				{ style: style({ fontSize: 24, fontWeight: 600, letterSpacing: -0.5 }) },
				'RehtiArvio'
			),
			h('div', { style: style({ fontSize: 22, color: INK_3 }) }, 'by Fides')
		),
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
				{ style: style({ fontSize: 22, color: INK_2 }) },
				`${p.postalCode} · ${p.roomsType} · ${p.livingAreaM2} m²${p.buildYear ? ` · rak. ${p.buildYear}` : ''}`
			),
			h(
				'div',
				{
					style: style({
						fontSize: 140,
						fontWeight: 600,
						letterSpacing: -4,
						color: deltaColor,
						lineHeight: 1
					})
				},
				deltaStr
			),
			h(
				'div',
				{ style: style({ fontSize: 32, color: INK_2, maxWidth: 900, lineHeight: 1.25 }) },
				verdictLabel
			),
			h(
				'div',
				{ style: style({ display: 'flex', gap: 32, marginTop: 16, alignItems: 'baseline' }) },
				h(
					'div',
					{ style: style({ display: 'flex', flexDirection: 'column' }) },
					h('div', { style: style({ fontSize: 18, color: INK_3 }) }, 'Luotettavuus'),
					h(
						'div',
						{ style: style({ fontSize: 28, fontWeight: 600 }) },
						p.confidence
					)
				),
				h(
					'div',
					{ style: style({ display: 'flex', flexDirection: 'column' }) },
					h(
						'div',
						{ style: style({ fontSize: 18, color: INK_3 }) },
						'Kaupat (4 neljännestä)'
					),
					h(
						'div',
						{ style: style({ fontSize: 28, fontWeight: 600 }) },
						p.transactions4q.toLocaleString('fi-FI')
					)
				)
			)
		),
		h(
			'div',
			{
				style: style({
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'baseline',
					borderTop: `1px solid ${LINE}`,
					paddingTop: 20,
					fontSize: 18,
					color: INK_3
				})
			},
			h('div', null, 'Lähde: Tilastokeskus, 13mt'),
			h('div', null, 'rehtiarvio.vercel.app')
		)
	);
}