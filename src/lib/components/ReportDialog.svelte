<script lang="ts">
	import { postJson } from '#lib/client.ts';
	import Dialog from './Dialog.svelte';

	let { open = $bindable(false), slug }: { open?: boolean; slug: string } = $props();

	let reason = $state('');
	let busy = $state(false);
	let error = $state('');
	let sent = $state(false);

	const MAX = 1000;

	async function send(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			const { ok, data } = await postJson(`/api/projects/${slug}/report`, { reason });
			if (!ok) {
				error = data.message ?? 'The report could not be sent.';
				return;
			}
			sent = true;
			reason = '';
		} catch {
			error = 'The report could not be sent. The connection should be examined and the attempt repeated.';
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		if (!open) sent = false;
	});
</script>

<Dialog bind:open title="Report this project">
	{#if sent}
		<p role="status">The report has been received and will be reviewed by the operator of this site.</p>
	{:else}
		<form onsubmit={send} class="form">
			<p class="muted small">Reports are read by the operator of this site. A project is removed if it is unlawful, or if it exposes or targets a private person.</p>
			<div>
				<label class="label" for="report-reason">Reason</label>
				<textarea id="report-reason" class="field" rows="4" maxlength={MAX} required bind:value={reason}></textarea>
			</div>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button class="btn btn-primary btn-wide" type="submit" disabled={busy || reason.trim().length < 3}>
				{busy ? 'Sending the report' : 'Send report'}
			</button>
		</form>
	{/if}
</Dialog>

<style>
	.form {
		display: grid;
		gap: 14px;
	}
	textarea {
		display: block;
		resize: vertical;
	}
</style>
