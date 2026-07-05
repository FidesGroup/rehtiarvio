<script lang="ts">
	let { data } = $props();
	const fmt = new Intl.NumberFormat('fi-FI');
	const facts = $derived(data.report.facts as any);
	const card = $derived(data.scorecard?.data as any);
	const inFlight = $derived(['pending', 'paid', 'processing'].includes(data.report.status));
	const host = (u: string) => {
		try {
			return new URL(u).hostname.replace(/^www\./, '');
		} catch {
			return u;
		}
	};
</script>

<svelte:head>
	<title>Asuntocard | RehtiArvio by Fides</title>
	<meta name="robots" content="noindex" />
	{#if inFlight}
		<meta http-equiv="refresh" content="12" />
	{/if}
</svelte:head>

<section class="hero">
	<span class="eyebrow">Asuntocard</span>
	<h1>{facts?.company ?? facts?.address ?? 'Taloyhtiö'}</h1>
	<p class="crumb">
		{facts?.address ?? '–'} · {facts?.postalCode ?? ''}
		{#if facts?.roomsType}· {facts.roomsType}{/if}
		{#if facts?.livingAreaM2}· {facts.livingAreaM2} m²{/if}
		{#if facts?.buildYear}· rak. {facts.buildYear}{/if}
	</p>
	{#if facts?.verdict?.deltaPct != null}
		<p class="verdict-line">
			Ilmoituksen neliöhinta on
			<b class={facts.verdict.deltaPct >= 0 ? 'ov' : 'un'}>
				{facts.verdict.deltaPct > 0 ? '+' : ''}{String(facts.verdict.deltaPct).replace('.', ',')} %
				{facts.verdict.deltaPct >= 0 ? 'yli' : 'alle'}
			</b>
			alueen toteutuneiden kauppojen ({fmt.format(facts.verdict.listingEurM2)} vs
			{fmt.format(facts.verdict.benchmarkEurM2)} €/m², luotettavuus {facts.verdict.confidence}).
		</p>
	{/if}
</section>

{#if inFlight}
	<section class="card wait">
		<h2>Korttia kootaan…</h2>
		<p>
			Haemme ja ristivarmistamme taloyhtiön tietoja julkisista web-lähteistä. Tämä kestää
			tyypillisesti muutaman minuutin. Sivu päivittyy itsestään, eikä sitä tarvitse pitää auki:
			kortti odottaa tässä osoitteessa valmiina.
		</p>
	</section>
{:else if data.report.status === 'failed'}
	<section class="card">
		<h2>Kortin kokoaminen ei onnistunut</h2>
		<p>
			Taloyhtiölle ei löytynyt riittävästi julkisia web-lähteitä tai haku epäonnistui. Tämä on
			beta. Yritä myöhemmin uudelleen tai vastaa tilausvahvistukseen, niin selvitämme.
		</p>
	</section>
{:else if card}
	<div class="stack">
		{#if card.corroborated?.renovations?.length}
			<section class="card">
				<h2>Ristivarmistettu remonttihistoria</h2>
				<ul>
					{#each card.corroborated.renovations as r (r)}
						<li>
							<b>{r.year}</b> {r.type}{#if r.evidence}: {r.evidence}{/if}
							{#if r.source_url}&nbsp;<a href={r.source_url} rel="nofollow noopener" target="_blank">[{host(r.source_url)}]</a>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if card.listings_same_company?.length}
			<section class="card">
				<h2>Saman taloyhtiön muut kohteet</h2>
				<ul>
					{#each card.listings_same_company as l (l)}
						<li>
							{l.summary}
							{#if l.url}&nbsp;<a href={l.url} rel="nofollow noopener" target="_blank">[{host(l.url)}]</a>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if card.red_flags?.length}
			<section class="card flags">
				<h2>Punaiset liput</h2>
				<ul>
					{#each card.red_flags as f (f)}
						<li>
							{f.text}
							{#if f.source_url}&nbsp;<a href={f.source_url} rel="nofollow noopener" target="_blank">[{host(f.source_url)}]</a>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if card.corroborated?.land_ownership || card.corroborated?.isannointi}
			<section class="card">
				<h2>Tontti ja isännöinti</h2>
				<ul>
					{#if card.corroborated.land_ownership}
						<li>
							Tontti: {card.corroborated.land_ownership.value}
							{#if card.corroborated.land_ownership.source_url}&nbsp;<a href={card.corroborated.land_ownership.source_url} rel="nofollow noopener" target="_blank">[{host(card.corroborated.land_ownership.source_url)}]</a>{/if}
						</li>
					{/if}
					{#if card.corroborated.isannointi}
						<li>
							Isännöinti: {card.corroborated.isannointi.name}
							{#if card.corroborated.isannointi.source_url}&nbsp;<a href={card.corroborated.isannointi.source_url} rel="nofollow noopener" target="_blank">[{host(card.corroborated.isannointi.source_url)}]</a>{/if}
						</li>
					{/if}
				</ul>
			</section>
		{/if}

		{#if card.area_notes?.length}
			<section class="card">
				<h2>Alue</h2>
				<ul>
					{#each card.area_notes as n (n)}
						<li>
							{n.text}
							{#if n.source_url}&nbsp;<a href={n.source_url} rel="nofollow noopener" target="_blank">[{host(n.source_url)}]</a>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="card meta">
			<h2>Lähteet ja luotettavuus</h2>
			{#if card.sources?.length}
				<ul class="sources">
					{#each card.sources as s (s)}
						<li><a href={s} rel="nofollow noopener" target="_blank">{s}</a></li>
					{/each}
				</ul>
			{/if}
			<p class="fine">
				Kortti on koottu koneellisesti julkisista web-lähteistä
				{#if data.scorecard?.confidence != null}(kattavuusarvio
					{Math.round((data.scorecard.confidence ?? 0) * 100)} %){/if}. Vain lähteissä näkyvät
				tiedot on raportoitu. Puuttuva tieto ei tarkoita, ettei sitä ole. Tarkista
				isännöitsijäntodistuksesta ennen ostopäätöstä. Tämä ei ole arvio eikä sijoitusneuvontaa.
			</p>
			{#if card.notes}<p class="fine">{card.notes}</p>{/if}
		</section>
	</div>
{:else}
	<section class="card">
		<h2>Kortti on valmis, mutta sisältöä ei voitu näyttää</h2>
		<p>Yritä ladata sivu uudelleen.</p>
	</section>
{/if}

<style>
	.eyebrow {
		display: inline-block;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 0.5rem;
	}
	.hero h1 {
		font-size: 1.7rem;
		letter-spacing: -0.02em;
		margin: 0 0 0.4rem;
	}
	.crumb {
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.8rem;
		margin: 0 0 0.8rem;
	}
	.verdict-line {
		max-width: 44rem;
		margin: 0 0 1.5rem;
	}
	.ov {
		color: var(--over);
	}
	.un {
		color: var(--under);
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-md, 0);
		box-shadow: var(--shadow-sm, none);
		padding: 1.4rem 1.5rem;
	}
	.card h2 {
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 0.8rem;
	}
	.card ul {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		max-width: 46rem;
	}
	.card a {
		color: var(--accent);
		font-size: 0.85em;
		word-break: break-all;
	}
	.flags {
		border-left: 3px solid var(--over);
	}
	.wait h2::after {
		content: ' ⋯';
	}
	.sources li {
		font-size: 0.82rem;
	}
	.fine {
		color: var(--ink-3, var(--ink-2));
		font-size: 0.82rem;
		margin: 0.9rem 0 0;
		max-width: 46rem;
	}
</style>
