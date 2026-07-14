<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import Field from '$lib/components/ui/Field.svelte';
	import { inview } from '$lib/styles/actions';
	import { copy } from '$lib/copy/fi';

	let {
		reportPayload
	}: {
		reportPayload: string;
	} = $props();

	let pending = $state(false);
	// A failed ?/report must not replace the page's form data — that would
	// wipe the analysis the order form sits under. Keep the error local.
	let error = $state<string | null>(null);
</script>

<Card variant="raised" inview>
	{#snippet header()}
		<div class="head">
			<h3 class="head__title">{copy.landing.result.asuntocardTitle}</h3>
			<Chip size="sm" tone="brand">{copy.landing.result.asuntocardBeta}</Chip>
		</div>
	{/snippet}

	<p class="lede">{copy.landing.result.asuntocardLede}</p>

	<form
		method="POST"
		action="?/report"
		class="form"
		use:enhance={() => {
			pending = true;
			error = null;
			return async ({ result }) => {
				pending = false;
				if (result.type === 'failure') {
					error = String((result.data as { reportError?: string })?.reportError ?? copy.errors.generic);
				} else {
					await applyAction(result);
				}
			};
		}}
	>
		<input type="hidden" name="payload" value={reportPayload} />
		<div class="form__docs">
			<Field
				label={copy.landing.result.asuntocardDocsLabel}
				helper={copy.landing.result.asuntocardDocsHelper}
				{error}
				optional
			>
				{#snippet children({ id })}
					<textarea
						{id}
						name="docs"
						rows="6"
						maxlength="300000"
						placeholder={copy.landing.result.asuntocardDocsPlaceholder}
					></textarea>
				{/snippet}
			</Field>
		</div>
		<Button type="submit" loading={pending}>{copy.landing.result.asuntocardCta}</Button>
		<a class="form__sub" href="/tilaa">{copy.landing.result.asuntocardNoSub}</a>
	</form>
</Card>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.head__title {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: 0;
	}

	.lede {
		color: var(--ink-2);
		font-size: var(--text-md);
		line-height: var(--lh-body);
		margin: 0 0 1rem;
	}

	.form {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		flex-wrap: wrap;
	}

	.form__docs {
		flex-basis: 100%;
	}

	.form__docs :global(textarea) {
		min-height: 120px;
		font-size: var(--text-sm);
	}

	.form__sub {
		font-size: var(--text-sm);
		color: var(--ink-2);
		text-decoration: underline;
		text-decoration-color: var(--border-2);
	}

	.form__sub:hover {
		text-decoration-color: var(--brand);
		color: var(--brand);
	}
</style>