# Track A — Net-yield module + share-cards

Status: planned (2026-07-13). Scope owner decision: build the free tool into
something an investor actually decides with (net yield), and make every verdict
a shareable growth asset (OG cards). Rules and constraints: see `../CLAUDE.md`.

This document is the executable plan plus the market research that justifies it.
Nothing here relaxes a CLAUDE.md rule: everything is deterministic, no LLM in the
request path, Finnish UI, SSR + zero-storage, `nodejs22.x` / `fra1`, StatFin
attribution preserved.

---

## 1. Market research (why Track A, and why these two features)

### 1.1 The free benchmark is a commodity — treat it as funnel, not product

Realized postal-code €/m² is public data that two higher-traffic surfaces already
show:

- **`asuntojen.hintatiedot.fi`** (Ympäristöministeriö / Tilastokeskus) — free
  realized prices by area.
- **Oikotie / Etuovi** — print "alueen keskihinta" on most listings.

RehtiArvio's `/kartta` and `/arvio` are cleaner and more honest, but "nicer
StatFin" has no moat. Stage 0's only job is to capture attention and route it to
the paid taloyhtiö scorecard (Stage 1). Track A accepts this and optimizes the
free tool for **(a) usefulness that earns trust** and **(b) a growth loop**.

### 1.2 Investors decide on yield and risk, not €/m²

The apartment-investor persona buys on **vuokratuotto** (rent ÷ price) and on
**taloyhtiö risk** (yhtiölaina, tuleva remontti, vastike). The current product
delivers neither: the delta is a valuation screen wearing an investor label, and
the delta itself is directionally weak exactly where money is made (the CLAUDE.md
flags already admit new-build premium ±40%, unit-size effects, intra-postal
heterogeneity, suppressed cells). A net-yield number is the cheapest way to close
the gap between the tagline and delivered value, and it keeps the user on-site.

### 1.3 Competitive field for a yield/investor tool (Finland)

- **Vuokratuotto­laskurit** (Vuokranantajat ry, Sijoitusovi, broker blogs) —
  standalone calculators with no price/rent benchmark behind the inputs. RehtiArvio's
  edge: the calc is pre-filled from real StatFin price *and* rent data for the exact
  postal area, not blank fields.
- **KVKL Hintaseurantapalvelu** — the pro/broker standard; paid, closed, not
  investor-self-serve.
- **Oikotie / Etuovi** — distribution giants, but they sell listings; they have no
  incentive to tell a buyer "this yield is thin."
- **Brokerage/valuation tools** (Alma Talent, banks' arviolaskurit) — valuation, not
  yield; conflicted (broker wants the sale).

Conclusion: a **neutral, benchmark-backed net-yield readout** is an unoccupied,
defensible-enough niche for the free tier, and it feeds the Stage-1 story directly
("we told you the yield; pay to see if the taloyhtiö will eat it").

### 1.4 Rent data source — legally clean, same lane as prices

StatFin publishes **Rents of dwellings (asvu)**, CC BY 4.0, same license as the
13mt price table already in use:

- Source: Kela housing-allowance register + rental-housing-company data; published
  quarterly; base year updated to 2025 (2026-04-28).
- Granularity: quarterly by largest towns × room count; an **annual
  postal-code-level table** for non-subsidised (vapaarahoitteiset) rents.
- This means the "rough rent estimate" is sourced exactly like the price benchmark:
  a bundled seed refreshed by cron, no scraping, attribution preserved.

> TODO before building 1.5: confirm the exact asvu table id + the postal-code table's
> coverage (it is sparser than 13mt; many postal areas will fall back to
> municipality- or town-level rent). Fall-back tiering mirrors the existing price
> confidence tiers.

### 1.5 Transfer tax — confirmed rate for the net-yield formula

vero.fi (page updated 2026-01-01): **varainsiirtovero on asunto-osakkeet
(housing-company shares) = 1.5%**; kiinteistöt/rakennukset = 3%. First-home buyers
(ensiasunto) may be exempt, but that is irrelevant to an investment purchase, so the
default is 1.5% on shares. Encode as a named constant with the source + date.

---

## 2. A1 — Net-yield module

Goal: turn a €/m² verdict into an investment decision by adding gross and net
vuokratuotto, pre-filled from StatFin rents, always shipped with its assumption set
(never a naked yield — CLAUDE.md rule 4).

### 2.1 Engine (`src/lib/server/benchmark.ts`, new pure functions, no I/O)

- Types:
  - `YieldInputs { monthlyRentEur; monthlyVastikeEur; priceEur; priceIsDebtFree;
    livingAreaM2 }`
  - `YieldResult { grossYieldPct; netYieldPct; monthlyNetEur; reserveEurYr;
    rentSource: 'user' | 'estimate'; flags: string[] }`
- Constants (auditable, sourced in a comment):
  - `VARAINSIIRTOVERO_OSAKE = 0.015` — vero.fi, 2026-01-01.
  - `REMONTTIVARAUS_EUR_M2_YR` — a labelled *assumption*, not sourced data.
- Math (deterministic):
  - `grossYieldPct = rent * 12 / price`
  - `netYieldPct = (rent - hoitovastike) * 12 / (price + price * VARAINSIIRTOVERO_OSAKE)`
  - `reserveEurYr = livingAreaM2 * REMONTTIVARAUS_EUR_M2_YR` (shown as a line, and
    optionally subtracted in a second "net after reserve" figure)
- Flags (reuse existing pattern in `evaluate`):
  - `!priceIsDebtFree` → net yield optimistic if there is yhtiölaina.
  - `rentSource === 'estimate'` → "Vuokra on alueen tilastollinen arvio
    (Tilastokeskus), ei kohteen toteutunut vuokra."
  - vastike missing → net == gross assumption is stated.

### 2.2 Rent estimate (`src/lib/server/` new module, mirrors benchmark seed)

- New seed `rents.seed.json` (postal area × room type → €/m²/kk + n + tier),
  regenerated by the same monthly cron (extend `/api/refresh` and `statfin.ts` to
  pull the asvu table alongside 13mt).
- `estimateRent(postalCode, roomsType, livingAreaM2)` → monthly rent estimate +
  source tier, with municipality/town fall-back when the postal cell is suppressed.
- Attribution: add rents to the existing "Lähde: Tilastokeskus" note.

### 2.3 Inputs / plumbing

- Extend URL params (keep `/arvio` shareable, zero-storage): optional `rent`,
  `vastike`. Add a sibling `parseYield(params)` next to `parseFacts`, same
  validation style (finite, sane bounds). Old links without the params still render.
- `src/routes/arvio/+page.server.ts` — after `evaluate`, if `rent` present use it
  (`rentSource: 'user'`); else call `estimateRent` (`rentSource: 'estimate'`).
  Return `yield` in data. `logQuery` unchanged (no new personal data).
- `src/routes/arvio/+page.svelte` — add a "Vuokratuotto" card block below the flags
  (or extend the `<dl>` grid, which already collapses 4→2→1). Show gross %, net %,
  monthly net €, reserve line, and a one-line assumption footnote. Keep yield color
  **neutral** — do not reuse `--over`/`--under`, which mean over/under market price.
- `src/routes/+page.svelte` landing form and `src/routes/analyysi/` — add optional
  rent + vastike fields; in `/analyysi`, wire hoitovastike from the parser when it
  extracted it (also satisfies ROADMAP "vastike-per-m² insight").

### 2.4 Tests (CLAUDE.md rule 9 spirit)

Unit-test the pure yield fn before any UI: debt-free vs debt price, zero vastike,
estimate-vs-user rent path, rounding. Add a small fixture for `estimateRent`
postal → fall-back.

---

## 3. A2 — OG share-cards for `/arvio`

Goal: every verdict becomes a link-preview asset — the cheapest growth loop, fully
compatible with the zero-storage SSR model.

### 3.1 Rendering

- Dependency: **`@vercel/og`** (Satori) — owner-approved. Runs on the Node runtime
  already pinned (`nodejs22.x` / `fra1`); no new infra, no storage.
- New endpoint `src/routes/arvio/og/+server.ts` returning `image/png`, built from the
  same URL params. Validate params via `parseFacts` first so the image route cannot
  be driven with junk; on invalid params return a neutral fallback card, not an error.
- Card content (design tokens only — CLAUDE.md rule 10; square corners, petrol accent,
  no gradient/emoji): big delta `+/-X %` in copper/pine, confidence-tier chip,
  `postalCode · roomsType · m²`, and — when yield is present — the net-yield figure,
  plus **"Lähde: Tilastokeskus"** (rule 2) and the RehtiArvio wordmark. Light theme
  only for the card.
- Font: bundle the UI font as a static asset and load it into Satori from disk; do
  **not** fetch a font at request time (keeps it fast + offline-safe like the rest).

### 3.2 Meta tags + share affordance

- `src/routes/arvio/+page.svelte` `<svelte:head>` (currently only `<title>`): add
  `og:title`, `og:description` (reuse the already-computed `verdictLabel`),
  `og:image` → the og endpoint with the same params, and
  `twitter:card=summary_large_image`.
- Add a visible "Kopioi linkki / Jaa" button on the verdict page so users actually
  trigger the loop (clipboard copy of the current URL).

### 3.3 Gotchas (from CLAUDE.md dev notes)

- Local `vite build` fails on Windows (symlink EPERM) — verify the OG route on a
  **Vercel preview deploy**, not locally.
- Confirm Satori/resvg cold-start latency on `fra1` is acceptable; if heavy,
  restrict the OG route's bundle and reuse a single loaded font.

---

## 4. Sequencing & effort

1. Yield engine + unit tests (pure fn) — ~0.5 day, zero risk.
2. `estimateRent` seed + `/api/refresh` + `statfin.ts` asvu pull — ~1 day
   (data-plumbing; gated on confirming the asvu table id, §1.4 TODO).
3. Wire yield into `/arvio` + landing form UI — ~0.5 day.
4. OG endpoint + meta tags + share button — ~1 day (Satori/font is the variable).
5. Extend rent/vastike to `/analyysi` — ~0.5 day.

Total ~3–3.5 focused days. Order 1→3→4 makes the free tool more useful before
growth effort drives traffic to it; step 2 (rent seed) can land in parallel and the
UI degrades gracefully to user-entered-only until it does.

## 5. Out of scope for Track A

Stripe / paid report (Stage 1), MCP (Stage 1.5), map changes, parser breadth beyond
hoitovastike, and any rent data source other than StatFin asvu.

Attribution: price and rent data © Tilastokeskus (Statistics Finland), StatFin
tables 13mt and asvu, CC BY 4.0.
