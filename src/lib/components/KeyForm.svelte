<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { postJson } from '#lib/client.ts';
	import { money } from '#lib/format.ts';

	let { onsaved, submitLabel = 'Save key' }: { onsaved?: () => void; submitLabel?: string } = $props();

	let key = $state('');
	let acknowledged = $state(false);
	let needsAck = $state(false);
	let error = $state('');
	let busy = $state(false);
	let capped = $state<{ limit: number; remaining: number | null } | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const { ok, data } = await postJson<{
				status?: string;
				limit_micro?: number;
				remaining_micro?: number | null;
			}>('/api/key', { key: key.trim(), acknowledged });
			if (!ok) {
				error = data.message ?? 'The key could not be saved.';
				return;
			}
			if (data.status === 'needs_acknowledgement') {
				needsAck = true;
				return;
			}
			if (data.limit_micro != null) {
				capped = { limit: data.limit_micro, remaining: data.remaining_micro ?? null };
			}
			key = '';
			needsAck = false;
			acknowledged = false;
			await refreshAll();
			onsaved?.();
		} catch {
			error = 'The key could not be checked. The connection should be examined and the attempt repeated.';
		} finally {
			busy = false;
		}
	}
</script>

<form onsubmit={submit} class="form">
	<div class="warning" role="note">
		<strong>A spending limit should be set on this key.</strong>
		A key without a limit can spend the entire balance of the OpenRouter account. A new key should be
		created for this site at
		<a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/settings/keys</a>,
		with a credit limit that would be acceptable to lose.
	</div>

	<div>
		<label class="label" for="or-key">OpenRouter API key</label>
		<input
			id="or-key"
			class="field key"
			type="password"
			name="openrouter-key"
			placeholder="sk-or-v1-…"
			autocomplete="off"
			autocapitalize="off"
			autocorrect="off"
			enterkeyhint="done"
			spellcheck="false"
			required
			bind:value={key}
			oninput={() => {
				needsAck = false;
				acknowledged = false;
				error = '';
			}}
		/>
		<p class="note small muted">
			The key is encrypted when stored and is used only for donations made from this account. It may
			be removed at any time.
		</p>
	</div>

	{#if needsAck}
		<div class="no-limit" role="alert">
			<strong>This key has no spending limit.</strong>
			<p>Any amount held in the OpenRouter account could be spent through it. A key with a limit is strongly recommended.</p>
			<label class="ack">
				<input type="checkbox" bind:checked={acknowledged} />
				<span>It is understood that this key has no spending limit.</span>
			</label>
		</div>
	{/if}

	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if capped}<p class="small muted" role="status">The key has been saved. Its limit is {money(capped.limit)}.</p>{/if}

	<button class="btn btn-primary btn-wide" type="submit" disabled={busy || !key.trim() || (needsAck && !acknowledged)}>
		{#if busy}Checking the key{:else if needsAck}Save key without a limit{:else}{submitLabel}{/if}
	</button>
</form>

<style>
	.form {
		display: grid;
		gap: 16px;
	}
	.key {
		font-family: var(--mono);
		font-size: 1rem;
	}
	.note {
		margin-top: 8px;
	}
	.no-limit {
		padding: 14px 16px;
		border: 1.5px solid var(--warn);
		border-radius: 10px;
		background: var(--warn-soft);
		font-size: 0.9375rem;
		animation: arrive 0.24s var(--ease-out);
	}
	.no-limit strong {
		font-weight: 600;
	}
	.no-limit p {
		margin: 4px 0 12px;
	}
	.ack {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		font-weight: 500;
		cursor: pointer;
	}
	.ack input {
		width: 18px;
		height: 18px;
		margin: 2px 0 0;
		flex: none;
		accent-color: var(--warn);
	}
	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
</style>
