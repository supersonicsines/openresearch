<script lang="ts" module>
	/** A question in the round. With one given, the dialog records a pledge towards it, not a donation. */
	export type PledgeTarget = {
		/** Null for the standing question, until it has been backed for the first time. */
		id: number | null;
		question: string;
		kind: 'question' | 'audit';
		/** What the visitor has already pledged towards it. */
		mine: number;
	};
</script>

<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { fade } from 'svelte/transition';
	import {
		estimateRuns,
		MAX_RUNS_PER_DONATION,
		minimumDonationMicro,
		type Pricing
	} from '#lib/budget.ts';
	import { connectHref, postJson } from '#lib/client.ts';
	import { money, plural, shortModelName } from '#lib/format.ts';
	import Dialog from './Dialog.svelte';
	import KeyForm from './KeyForm.svelte';
	import GitHubMark from './GitHubMark.svelte';

	type Model = { id: string; name: string; pricing: Pricing };
	type KeyInfo = { preview: string; limit_micro: number | null; remaining_micro: number | null };

	let {
		open = $bindable(false),
		slug,
		signedIn,
		keyInfo,
		target = null,
		keyOutcome = null,
		ondonated,
		onpledged
	}: {
		open?: boolean;
		slug: string;
		signedIn: boolean;
		keyInfo: KeyInfo | null;
		target?: PledgeTarget | null;
		/** How an attempt to connect OpenRouter ended, where the visitor has just come back from one. */
		keyOutcome?: string | null;
		ondonated: (publicId: string, amountMicro: number) => void;
		onpledged?: (amountMicro: number) => void;
	} = $props();

	/** The page is returned to with the same dialog open, after GitHub or OpenRouter has been connected. */
	const returnTo = $derived(
		`${page.url.pathname}?${target ? `back=${target.id ?? 'audit'}` : 'donate=1'}`
	);

	const PRESETS = [1, 5, 20];
	const SUGGESTED = [
		'anthropic/claude-sonnet-5.5',
		'anthropic/claude-opus-5.5',
		'anthropic/claude-haiku-5.5',
		'google/gemini-3.8-flash',
		'openai/gpt-5.6-luna-pro',
		'x-ai/grok-4.7',
		'deepseek/deepseek-v4.1-flash'
	];

	let models = $state<Model[]>([]);
	let loadError = $state('');
	let chosen = $state<string>('');
	let search = $state('');
	let preset = $state<number | 'other'>(5);
	let other = $state('');
	let busy = $state(false);
	let error = $state('');

	$effect(() => {
		if (open && signedIn && keyInfo && models.length === 0) load();
	});

	async function load() {
		loadError = '';
		try {
			const res = await fetch('/api/models');
			if (!res.ok) throw new Error();
			const data = (await res.json()) as { models: Model[] };
			models = data.models;
			chosen ||= SUGGESTED.find((id) => models.some((m) => m.id === id)) ?? models[0]?.id ?? '';
		} catch {
			loadError = 'The list of models could not be loaded from OpenRouter.';
		}
	}

	const amountMicro = $derived.by(() => {
		const dollars = preset === 'other' ? Number(other) : preset;
		return Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 1_000_000) : 0;
	});

	const current = $derived(models.find((m) => m.id === chosen));
	const runs = $derived(current && amountMicro ? estimateRuns(amountMicro, current.pricing) : 0);

	const visible = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (q) {
			return models
				.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
				.slice(0, 60);
		}
		const top = SUGGESTED.map((id) => models.find((m) => m.id === id)).filter(Boolean) as Model[];
		return top.length ? top : models.slice(0, 8);
	});

	const overLimit = $derived(
		keyInfo?.remaining_micro != null && amountMicro > keyInfo.remaining_micro
	);
	const smallest = $derived(current ? minimumDonationMicro(current.pricing) : 100_000);
	const tooSmall = $derived(amountMicro > 0 && amountMicro < smallest);

	function perMillion(price: number) {
		return `$${(price * 1_000_000).toFixed(2)}`;
	}

	async function pledge(to: PledgeTarget) {
		let id = to.id;
		if (id === null) {
			// The standing question is listed the first time that it is backed.
			const listed = await postJson<{ id: number }>(`/api/projects/${slug}/proposals`, { kind: 'audit' });
			if (!listed.ok) {
				error = listed.data.message ?? 'The pledge could not be recorded.';
				return;
			}
			id = listed.data.id;
		}
		const { ok, data } = await postJson(`/api/proposals/${id}/pledge`, { amountMicro, model: chosen });
		if (!ok) {
			error = data.message ?? 'The pledge could not be recorded.';
			return;
		}
		await refreshAll();
		open = false;
		onpledged?.(amountMicro);
	}

	async function donate(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !amountMicro || !chosen) return;
		busy = true;
		error = '';
		try {
			if (target) return await pledge(target);
			const { ok, data } = await postJson<{ publicId: string }>(`/api/projects/${slug}/donations`, {
				amountMicro,
				model: chosen
			});
			if (!ok) {
				error = data.message ?? 'The donation could not be recorded.';
				return;
			}
			await refreshAll();
			open = false;
			ondonated(data.publicId, amountMicro);
		} catch {
			error = target
				? 'The pledge could not be sent. The connection should be examined and the attempt repeated.'
				: 'The donation could not be sent. The connection should be examined and the attempt repeated.';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog bind:open title={target ? 'Back this question' : 'Donate to this project'}>
	{#if target}<p class="serif asked">{target.question}</p>{/if}
	{#if !signedIn}
		<p class="lead">A GitHub account must be connected before a {target ? 'pledge' : 'donation'} can be made.</p>
		<a
			class="btn btn-primary btn-wide"
			href={connectHref(returnTo)}
			data-sveltekit-reload
			data-sveltekit-preload-data="false"
		>
			<GitHubMark /> Connect GitHub
		</a>
	{:else if !keyInfo}
		<div in:fade={{ duration: 160 }}>
			<p class="lead">{target ? 'Pledges' : 'Donations'} are drawn from an OpenRouter key. A key must be added first.</p>
			<KeyForm submitLabel="Save key and continue" {returnTo} outcome={keyOutcome} />
		</div>
	{:else}
		<form onsubmit={donate} class="form" in:fade={{ duration: 160 }}>
			{#if keyInfo.limit_micro === null}
				<div class="warning" role="alert">
					<strong>This key has no spending limit.</strong>
					The amount below is enforced by this site, but nothing is enforced at OpenRouter. A limit can
					be set at <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/settings/keys</a>.
				</div>
			{/if}

			<fieldset>
				<legend class="label">Amount</legend>
				<div class="amounts">
					{#each PRESETS as value}
						<label class="amount" class:on={preset === value}>
							<input type="radio" name="amount" value={String(value)} checked={preset === value} onchange={() => (preset = value)} />
							<span class="figures">${value}</span>
						</label>
					{/each}
					<label class="amount" class:on={preset === 'other'}>
						<input type="radio" name="amount" value="other" checked={preset === 'other'} onchange={() => (preset = 'other')} />
						<span>Other</span>
					</label>
				</div>
				{#if preset === 'other'}
					<div class="other">
						<span class="figures" aria-hidden="true">$</span>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="field"
							type="text"
							inputmode="decimal"
							enterkeyhint="done"
							aria-label="Amount in US dollars"
							placeholder="0.00"
							autofocus
							bind:value={other}
						/>
					</div>
				{/if}
			</fieldset>

			<fieldset>
				<legend class="label">Model</legend>
				{#if loadError}
					<p class="error" role="alert">{loadError}</p>
					<button class="btn btn-quiet btn-small retry" type="button" onclick={load}>Try again</button>
				{:else if models.length === 0}
					<p class="small muted" role="status">The list of models is being loaded.</p>
				{:else}
					<input
						class="field"
						type="search"
						placeholder="Search {models.length} models"
						aria-label="Search models"
						autocomplete="off"
						autocapitalize="off"
						enterkeyhint="search"
						spellcheck="false"
						bind:value={search}
					/>
					<div class="models" role="radiogroup" aria-label="Model">
						{#each visible as model (model.id)}
							<label class="model" class:on={chosen === model.id}>
								<input type="radio" name="model" value={model.id} checked={chosen === model.id} onchange={() => (chosen = model.id)} />
								<span class="name">{shortModelName(model.name)}</span>
								<span class="price figures">{perMillion(model.pricing.prompt)} / {perMillion(model.pricing.completion)}</span>
							</label>
						{:else}
							<p class="small muted none">No models match this search.</p>
						{/each}
					</div>
					<p class="small muted caption">Prices per million tokens, input and output.</p>
				{/if}
			</fieldset>

			<div class="summary">
				{#if tooSmall}
					<p class="error" role="alert">An amount of at least {money(smallest)} is required for a run{current ? ` of ${shortModelName(current.name)}` : ''} to be completed.</p>
				{:else if overLimit && keyInfo.remaining_micro != null}
					<p class="error" role="alert">This amount exceeds the {money(keyInfo.remaining_micro)} remaining on the key's limit.</p>
				{:else if current && amountMicro}
					<p class="small muted">
						{#if runs >= MAX_RUNS_PER_DONATION}
							This should cover the maximum of {MAX_RUNS_PER_DONATION} runs of {shortModelName(current.name)}.
						{:else if runs > 0}
							This should cover about {plural(runs, 'run')} of {shortModelName(current.name)}.
						{:else}
							This may cover less than one typical run of {shortModelName(current.name)}.
						{/if}
						{#if target}
							Nothing is charged unless this question leads when the round closes.
						{:else}
							Any part left unspent is not charged.
						{/if}
					</p>
				{/if}
				{#if target && target.mine > 0}
					<p class="small muted">The pledge of {money(target.mine)} already made towards this question is replaced.</p>
				{/if}
				<p class="small muted keyline">{target ? 'Drawn from' : 'Charged to'} the key {keyInfo.preview}{keyInfo.remaining_micro != null ? `, with ${money(keyInfo.remaining_micro)} remaining on its limit` : ''}.</p>
			</div>

			{#if error}<p class="error" role="alert">{error}</p>{/if}

			<button
				class="btn btn-signal btn-wide"
				type="submit"
				disabled={busy || !amountMicro || !chosen || tooSmall || overLimit}
			>
				{#if target}
					{busy ? 'Recording the pledge' : amountMicro ? `Pledge ${money(amountMicro)}` : 'Pledge'}
				{:else}
					{busy ? 'Recording the donation' : amountMicro ? `Donate ${money(amountMicro)}` : 'Donate'}
				{/if}
			</button>
		</form>
	{/if}
</Dialog>

<style>
	.lead {
		margin-bottom: 16px;
		color: var(--ink-2);
	}
	.asked {
		margin-bottom: 18px;
		padding-left: 14px;
		border-left: 2px solid var(--rule-2);
		overflow-wrap: anywhere;
		font-size: 1.125rem;
		line-height: 1.35;
	}
	.form {
		display: grid;
		gap: 20px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	legend {
		padding: 0;
	}
	.amounts {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}
	.amount {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 44px;
		border: 1px solid var(--rule-2);
		border-radius: 8px;
		font-size: 1rem;
		cursor: pointer;
		transition:
			background-color 0.14s ease,
			color 0.14s ease,
			border-color 0.14s ease,
			transform 0.12s var(--ease-out);
	}
	.amount:active {
		transform: scale(0.97);
	}
	.amount.on {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--bg);
	}
	.amount input,
	.model input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.amount:has(:focus-visible),
	.model:has(:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.other {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		font-size: 1.125rem;
		animation: arrive 0.2s var(--ease-out);
	}
	.models {
		margin-top: 8px;
		height: 208px;
		overflow-y: auto;
		overscroll-behavior: contain;
		border: 1px solid var(--rule);
		border-radius: 8px;
	}
	.model {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 44px;
		padding: 8px 12px;
		font-size: 0.9375rem;
		cursor: pointer;
		transition: background-color 0.12s ease;
	}
	.model + .model {
		border-top: 1px solid var(--rule);
	}
	.model.on {
		background: var(--surface);
		box-shadow: inset 2px 0 0 var(--ink);
	}
	@media (hover: hover) and (pointer: fine) {
		.model:hover {
			background: var(--surface);
		}
	}
	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.price {
		flex: none;
		font-size: 0.875rem;
		color: var(--ink-2);
	}
	.none {
		padding: 14px 12px;
	}
	.caption {
		margin-top: 6px;
	}
	.retry {
		margin-top: 8px;
	}
	.summary {
		display: grid;
		gap: 4px;
		min-height: 3em;
	}
	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
</style>
