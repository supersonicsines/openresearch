<script lang="ts">
	import StageDemo from '#lib/components/StageDemo.svelte';
</script>

<svelte:head><title>About · OpenResearch</title></svelte:head>

<article class="page">
	<h1 class="serif">About OpenResearch</h1>

	<StageDemo />

	<div class="prose">
		<p>OpenResearch is a public board of research prompts. Any prompt of up to 250 words may be listed by anyone with a GitHub account, and a public repository is created for it. Research on that prompt is then paid for by whoever chooses to donate towards it, and what is asked next may be proposed and backed by anyone.</p>

		<h2>How a donation is made</h2>
		<p>An OpenRouter account is connected, or a key is pasted, and an amount and a model are chosen. Credit is drawn directly from the key by OpenRouter as each run is carried out. Any part of a donation left unspent is not charged.</p>

		<h2>What may be asked</h2>
		<p>A prompt need not ask what is already known. It may ask for something to be worked out: a new hypothesis, a design for an experiment, a plan of treatment, a method. Models are instructed to put such things forward where the question calls for them, with the reasoning and the evidence that each rests on, what would show it to be wrong, and what could do harm. Whatever is put forward in this way is marked as a proposal that has not been tested, and is kept apart from what sources establish.</p>

		<h2>What a run does</h2>
		<p>Each run takes one open question, searches the web and writes a report. The findings for the project are then revised to include it, and a list of further questions is drawn up for the next run. The findings open with the answer as it stands, and everything after it is set out in sections, each of which opens under its heading. Reports and findings are committed to the repository as text and as HTML, and every commit records the donor, the model, the tokens used and the cost.</p>
		<p>A donation is closed when it has been spent, when no open questions remain, or after 40 runs.</p>

		<h2>How the next question is chosen</h2>
		<p>A donation works through the questions listed by the editor. The direction may also be set by those who fund it. On every project, anyone may propose the next question, in 60 words or fewer, and anyone with a key may pledge an amount towards a question.</p>
		<p>A round opens with its first pledge and closes a day later. A pledge made in the last ten minutes keeps the round open for ten minutes more. When the round closes, the question with the most pledged is researched with the pledges made towards it, and they are spent as donations are. Where two questions are level, the earlier one leads.</p>
		<p>Nothing is charged for the other questions. What was pledged towards them stands for the next round, and a pledge may be withdrawn at any time before its round closes. One standing question is listed on every project: an audit of the findings against the sources cited for them.</p>
		<p>No money is held by this site, so a pledge is a promise to spend from the pledger's own key. Each key is checked again when the round closes, and a pledge that can no longer be met is set aside before the leading question is decided. An account with three such pledges in 30 days may not pledge further for the present.</p>

		<h2>The research tree</h2>
		<p>Every question asked of a prompt is recorded with where it came from: the prompt itself, the list drawn up by the editor after a run, or a proposal made by a visitor. Each is shown beneath the run that raised it, as researched, open, in a round, or set aside by the editor. The tree can be seen as it stood after any run, so the course of the research can be followed from the beginning. The same record is kept in the repository, where each commit names the run that raised its question.</p>

		<h2>API keys</h2>
		<p>A key is created for this site when an OpenRouter account is connected, on OpenRouter's own page. A key may be pasted in its place. In either case it should carry a credit limit that would be acceptable to lose. Keys are checked with OpenRouter when they are added and are encrypted when stored. A key is used only for donations and pledges made from the account that added it, and it may be removed at any time from the account page.</p>
		<p>The amount chosen for a donation is enforced by this site. The credit limit on the key is enforced by OpenRouter, and it is the only protection that does not depend on this site.</p>

		<h2>Amounts and leaderboards</h2>
		<p>An amount is shown as raised once it has actually been spent on a completed run, at the figure reported by OpenRouter. Until then it is shown as pledged, and it is not counted on the leaderboards. Any part of a pledge that goes unused is never charged.</p>
		<p>Each project shows its progress towards the next milestone: $1, $5, $25, $100, $500 and so on. Milestones are round figures that indicate progress. They have no effect on how a donation is spent, and nothing is withheld until one is reached.</p>

		<h2>Reliability</h2>
		<p>All findings are generated by AI models and have not been independently reviewed. Sources should be consulted before any finding is relied upon. The contents of prompts and findings do not represent the views of this site.</p>

		<h2>Reports and removal</h2>
		<p>Prompts and proposed questions are not reviewed before they are published. Anyone may report a project with the link on its page, and reports are read by the operator of this site. A project or a question is removed if it is unlawful, or if it exposes or targets a private person. The <a href="/terms">terms</a> and the <a href="/privacy">privacy notice</a> give further detail.</p>
	</div>
</article>

<style>
	.page {
		padding-top: 48px;
	}
	h1 {
		font-size: clamp(2rem, 1.6rem + 1.6vw, 2.75rem);
		line-height: 1.15;
		letter-spacing: -0.014em;
		margin-bottom: 28px;
	}
	.prose {
		margin-top: 32px;
	}
	@media (max-width: 560px) {
		.page {
			padding-top: 24px;
		}
	}
</style>
