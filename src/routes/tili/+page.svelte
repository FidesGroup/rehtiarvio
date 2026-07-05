<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Tili — RehtiArvio by Fides</title>
</svelte:head>

<section class="hero">
	<span class="eyebrow">Tili</span>
	{#if data.state === 'activated'}
		<h1>Tilaus aktivoitu</h1>
		<p class="lede">
			Kiitos! Tilaus on nyt käytössä tällä selaimella ({data.email}). Asuntocardin saat
			ilmoitusanalyysin tuloksista — analysoi kohde ja paina
			<b>”Kokoa asuntocard”</b>.
		</p>
		<p><a class="cta" href="/analyysi">Siirry ilmoitusanalyysiin →</a></p>
	{:else if data.state === 'active'}
		<h1>Tilaus voimassa</h1>
		<p class="lede">{data.email} — asuntocardit käytettävissä ilmoitusanalyysin tuloksista.</p>
		<p><a class="cta" href="/analyysi">Siirry ilmoitusanalyysiin →</a></p>
	{:else if data.state === 'past_due'}
		<h1>Maksu odottaa</h1>
		<p class="lede">
			Viimeisin veloitus ei onnistunut ({data.email}). Päivitä maksutapa Stripen
			sähköpostilinkistä, niin asuntocardit palaavat käyttöön.
		</p>
	{:else if data.state === 'canceled'}
		<h1>Tilaus päättynyt</h1>
		<p class="lede">Tilauksesi on päättynyt. Voit tilata uudelleen milloin tahansa.</p>
		<p><a class="cta" href="/tilaa">Tilaa uudelleen →</a></p>
	{:else if data.state === 'session-failed'}
		<h1>Aktivointi ei onnistunut</h1>
		<p class="lede">
			Maksuistunnon vahvistus epäonnistui. Jos kortiltasi veloitettiin, tilaus aktivoituu
			hetken kuluttua automaattisesti — lataa tämä sivu uudelleen. Muussa tapauksessa yritä
			tilausta uudelleen.
		</p>
	{:else}
		<h1>Ei aktiivista tilausta</h1>
		<p class="lede">
			Tällä selaimella ei ole aktiivista tilausta. Jos olet jo tilannut, avaa tilaussähköpostin
			vahvistuslinkki samalla selaimella — tai tilaa alta.
		</p>
		<p><a class="cta" href="/tilaa">Tilaa asuntocardit →</a></p>
	{/if}
</section>

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
		font-size: 1.9rem;
		letter-spacing: -0.02em;
		margin: 0 0 0.6rem;
	}
	.lede {
		color: var(--ink-2);
		max-width: 44rem;
		margin: 0 0 1.2rem;
	}
	.cta {
		font-weight: 700;
		color: var(--accent);
	}
</style>
