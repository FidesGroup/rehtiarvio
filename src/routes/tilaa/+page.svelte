<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Tilaa | RehtiArvio by Fides</title>
	<meta
		name="description"
		content="RehtiArvio Sijoittaja -tilaus: asuntocardit: taloyhtiön syväkatsaus web-lähteistä koottuna, lähteineen."
	/>
</svelte:head>

<section class="hero">
	<span class="eyebrow">Tilaus</span>
	<h1>Asuntocardit sijoittajalle</h1>
	<p class="lede">
		Ilmainen analyysi kertoo, mitä ilmoitus väittää. Asuntocard kertoo, mitä siitä löytyy
		muualta: remonttihistorian ristivarmistus, saman taloyhtiön muut myynnit, tontti- ja
		isännöintitiedot, jokainen väite lähteineen.
	</p>
</section>

<div class="grid">
	<section class="card">
		<h2>Mitä asuntocard sisältää</h2>
		<ul>
			<li>Remonttihistorian ristivarmistus julkisista web-lähteistä (putket, julkisivu, katto, ikkunat)</li>
			<li>Saman taloyhtiön muut kohteet myynnissä, hintavertailu saman yhtiön sisällä</li>
			<li>Tontin omistuksen ja isännöinnin varmistus</li>
			<li>Punaiset liput: ristiriidat ilmoituksen ja muiden lähteiden välillä</li>
			<li>Kaikki löydökset lähde-URL:eineen, ei mustia laatikoita</li>
		</ul>
		<p class="fine">
			Kortti kootaan koneellisesti julkisista web-lähteistä tilauksen jälkeen (tyypillisesti
			muutamassa minuutissa). Beta: kattavuus vaihtelee taloyhtiön verkkojäljen mukaan.
		</p>
	</section>

	<section class="card">
		<h2>Aloita tilaus</h2>
		{#if data.enabled}
			<form method="POST">
				<label>
					<span class="lbl">Sähköposti</span>
					<input name="email" type="email" required placeholder="sinä@esimerkki.fi" />
				</label>
				<button type="submit">Jatka maksuun</button>
				{#if form?.error}<p class="error">{form.error}</p>{/if}
			</form>
			<p class="fine">Maksu Stripen kautta. Voit perua milloin tahansa.</p>
		{:else}
			<p>
				Tilaus ei ole vielä avoinna. <a href="/#waitlist">Liity odotuslistalle</a>, niin saat
				viestin kun asuntocardit julkaistaan.
			</p>
			{#if form?.error}<p class="error">{form.error}</p>{/if}
		{/if}
	</section>
</div>

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
		margin: 0 0 2rem;
	}
	.grid {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 1.25rem;
		align-items: start;
	}
	@media (max-width: 720px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-md, 0);
		box-shadow: var(--shadow-sm, none);
		padding: 1.5rem;
	}
	.card h2 {
		font-size: 1.05rem;
		margin: 0 0 0.9rem;
	}
	.card ul {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.lbl {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ink-2);
	}
	input {
		font: inherit;
		color: var(--ink);
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--radius-sm, 0);
		padding: 0.6rem 0.7rem;
	}
	input:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	button {
		align-self: flex-start;
		font: inherit;
		font-weight: 700;
		background: var(--accent);
		color: var(--bg);
		border: none;
		border-radius: var(--radius-sm, 0);
		padding: 0.7rem 1.4rem;
		cursor: pointer;
	}
	.error {
		margin: 0;
		color: var(--over);
		font-size: 0.9rem;
	}
	.fine {
		color: var(--ink-3, var(--ink-2));
		font-size: 0.82rem;
		margin: 0.9rem 0 0;
	}
</style>
