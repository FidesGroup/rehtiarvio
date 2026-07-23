/**
 * Canonical RehtiArvio logo mark — the single source of truth for the monogram.
 *
 * A bespoke geometric "R" (paper on an ink tile) sitting above a short baseline
 * rule — a quiet nod to the product question: is the asking price above or below
 * the realized-market baseline? Editorial ink-on-paper, true square corners
 * (CLAUDE.md rule 10). Colors are hardcoded to the exact token values
 * (--brand #0a0a0a / --brand-ink #fafaf7) so every surface renders identically,
 * independent of the IBM Plex webfont being loaded.
 *
 * Consumers: Header + Footer inline it via {@html}; the /og share image embeds
 * MARK_DATA_URI. `static/favicon.svg` and `static/logo.svg` mirror MARK_SVG
 * byte-for-byte — keep them in sync if the artwork ever changes.
 */

export const MARK_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
	'<rect width="32" height="32" fill="#0a0a0a"/>' +
	'<rect x="8" y="7" width="4.5" height="14" fill="#fafaf7"/>' +
	'<path d="M12.5 7 H16.6 C20 7 22.2 9 22.2 11 C22.2 13.1 20 15 16.6 15 H12.5 Z" fill="#fafaf7"/>' +
	'<path d="M13 13.4 H17.4 L22 21 H17.6 Z" fill="#fafaf7"/>' +
	'<path d="M12.5 9 H16.2 C18.3 9 19.7 9.9 19.7 11 C19.7 12.1 18.3 12.9 16.2 12.9 H12.5 Z" fill="#0a0a0a"/>' +
	'<rect x="8" y="24" width="15" height="1.6" fill="#fafaf7"/>' +
	'</svg>';

/** Same artwork as a data URI, for contexts that need an <img> src (Satori/OG). */
export const MARK_DATA_URI = 'data:image/svg+xml,' + encodeURIComponent(MARK_SVG);
