# Launch checklist

## Tested, and how

### On the live site, 10 November 2026

The first real run, at https://openresearch.click, with real GitHub sign-in and the operator's own OpenRouter key,
which has a $3 limit. About $1.45 was spent in all.

- **Sign-in:** the @handle and the real avatar appeared in the header, and Admin appeared in the navigation.
- **The key:** its limit and the amount left on it were read from OpenRouter and shown on the account page. The
  donation dialog would not accept $5, because it was more than the key had left.
- **A run on Claude Haiku 5.5, funded with $0.25 (OR-0001):** the run streamed on the project page, to a visitor
  who was not signed in as well, and the ticker moved. The report was complete and cited real sources. Its cost
  agreed with OpenRouter's log: $0.01096 for the first run, shown as $0.01. Further runs then took up the
  report's open questions.
- **`git clone https://openresearch.click/git/SLUG.git`** worked, with one commit for the prompt and one for each run.
- **The card** was served at 1200 × 630, and the `og:` and `twitter:` tags point to it. It was not posted on X.
- **Reports and removal:** a report sent from a browser that was not signed in reached `/admin`. Removing the
  project gave visitors a 410 page and stopped its donation, which the account page showed as "Stopped. The
  project was removed by the operator of this site." The run cut off by the removal was charged ($0.01) but is
  not counted as raised. Restoring the project brought the page back.
- **Claude Sonnet 5.5, funded with $0.50 each (OR-0002, OR-0003 and OR-0004):** every report was complete rather
  than cut short, and a run cost between $0.07 and $0.10.

### Before launch, against stand-ins

Everything below ran against stand-ins for OpenRouter and GitHub, on a production build.

- **Every flow, in Chrome:** visiting, sorting, the full list and its search, filters and pages, the
  leaderboards, signing in, submitting, adding a key (rejected, with no limit, with a limit, replaced, removed),
  donating, a run streaming, stopping a donation, sharing, reports, removal, restoring, deleting and suspending.
  No page errors or server errors were recorded.
- **The main journey on a touch-enabled phone screen in Chrome, at 390 and 320 wide:** signing in, submitting,
  adding a key, donating, a run streaming, sharing, stopping, searching, reporting and signing out.
- **The Safari and Firefox engines, through Playwright:** every public page at desktop and phone widths, and
  signing in, submitting, adding a key, donating, a run streaming and sharing. These are the browsers' engines
  rather than the finished browsers, so an iPhone and desktop Safari remain to be checked by hand.
- **Every word on every page:** in each state, at widths from 320 to 1440 and in all three engines, the visible
  text was checked against a dictionary for words run together, along with clipped text, overlapping controls,
  page headings, and script and server errors.
- **Extreme content:** the longest handle, a 250-word prompt, one very long word, other scripts, emoji, markup,
  sums above $100,000, and more prompts than fit on one page.
- **Failures:** a rejected key, no credit, a charge held back, an unavailable model, a broken stream, a stream
  that closes early, an empty reply, a report cut off at its limit, hostile output, and a server killed during
  a run.
- **Browser tests:** the full suite, with accessibility checks in light and dark, on Node 22 on the final code,
  and on Node 26 shortly before it.
- **A clean install:** a copy made as from a USB drive, `npm ci`, a build for a public address, with runtime
  dependencies only, on Node 22. The server refused to start with each unsafe setting tried.
- **Load:** on a database of 5,000 prompts and 60,000 runs, far beyond launch night, pages were served at
  roughly 140 to 1,450 a second on a laptop with no errors, and the activity feed at 17,000 a second. Hostile Markdown
  took at most 145 ms to render.
- **An independent security review** by a reader who had not seen the reasoning behind the code. Its findings
  are below.

## Only the operator can do these

### Before going public

- [ ] The terms and privacy pages have been read, and adjusted as needed. They are a sensible draft, not legal advice, and they name no company or jurisdiction.
- [x] The Railway service is set up as [DEPLOY.md](DEPLOY.md#railway) describes, and the site answers at https://openresearch.click.
- [x] The generated `*.up.railway.app` domain has been removed.
- [x] The GitHub OAuth app is registered, and its callback is `https://YOUR-DOMAIN/auth/github/callback` ([DEPLOY.md](DEPLOY.md), step 1).
- [x] `ADMIN_HANDLES` and `CONTACT_EMAIL` are set.
- [x] `ENCRYPTION_KEY` has been stored somewhere other than the server.
- [x] `npm run preflight` reports that nothing is blocking a launch, or, on Railway, the deployment has started and its logs show no warnings. The only warning is Node's own, that SQLite is experimental.
- [x] Backups are scheduled: the volume's scheduled backups on Railway.

### The first real run: about ten minutes and a few cents

Done on 10 November 2026, with the results at the top of this file. Step 8 was checked by fetching the card and
its tags, not by posting on X.

A **new OpenRouter key with a $2 limit** is used. These parts have never touched the real services.

1. `npm run preflight -- --key sk-or-v1-...` is run. It makes one real request with web search, for about a cent.
2. GitHub is connected on the live site. The @handle should appear in the header, with the real avatar.
3. `/admin` should appear in the navigation.
4. A real prompt is submitted.
5. The key is added, and **$0.25 on a cheap model** is donated (Claude Haiku or DeepSeek Flash).
6. These should all be seen:
   - The run streams on the project page, and the ticker on the home page moves.
   - The report has real sources, and it reads as complete rather than stopping mid-sentence.
   - The cost on the run agrees with the [OpenRouter activity page](https://openrouter.ai/activity), to within a cent.
   - The donation closes, or continues, with a sensible reason on the account page.
7. `git clone https://YOUR-DOMAIN/git/SLUG.git` works.
8. The project link is posted on X, or checked with a card validator. The card should appear.
9. The project is reported from a private window. It is then removed and restored from `/admin`.
10. One run on the preselected model, **Claude Sonnet**, is then funded with $0.50. That model always
    reasons, so this is the test that matters most for reports being complete.

If a report is cut short on Sonnet, `MAX_RESEARCH_TOKENS` in `src/lib/budget.ts` is the value to raise.

### The first hour

- [x] Three or four good prompts are funded first, so that the first visitor does not see an empty board.
- [ ] `/admin` and the server's log are kept open: the deployment's logs on Railway, or `journalctl -u openresearch -f` under systemd.
- [ ] To stop all spending at once: `MAX_ACTIVE_PROJECTS=0` and a restart.

## Risks that remain

- **Real API behaviour.** The code was compared with the live documentation and the live model list on
  3 November 2026, but it has not made an authenticated call. Findings are in the section below.
- **OpenRouter's web plugin is deprecated.** It is still documented and working as far as can be told.
  The replacement is in beta, so the plugin has been kept. No end date was found.
- **Keys are pasted, not granted by OAuth.** If the server and `ENCRYPTION_KEY` were both compromised,
  stored keys would be exposed. Spending limits on keys are what limits the damage, which is why the
  warning is so prominent.
- **Prompts are not reviewed in advance.** Everything is published immediately under the site's name.
  Removal is available, and the operator should expect to use it.
- **One process, one SQLite file.** It should carry far more than a launch night, but it is not
  redundant. If the server is lost, only the latest backup remains.
- **Limits are held in memory**, and reset when the server restarts.

## Findings from the security review

Fixed, each with a test unless noted:

- **A $0.10 donation could freeze the whole site.** A slow pattern read the model's reply on the server's only
  thread, and a reply of blank lines stalled every visitor for over a minute. It is now read in a single pass.
- **Limits could be avoided by encoding the address,** as `/%63ard/` in place of `/card/`.
- **A dropped connection could be billed but not counted,** and was then retried. An attempt is now treated as
  possibly charged once OpenRouter has accepted it. *Tested only against the stand-in's closed streams.*
- **One account could hold every research slot.** There are now 3 open donations per account, and 16 slots.
- **A public site could start with no way of telling visitors apart.** `ADDRESS_HEADER` is now required.
- **IPv6 visitors could change address to avoid limits.** A /64 now counts as one visitor.
- **Odd page numbers caused a server error,** and **a removed project's title stayed on its donors' accounts.**

Also fixed while walking the flows:

- A restored project stayed "removed" for anyone who had already seen the removal, because browsers keep a 410.
- Presses on a cell's funding meter did nothing.
- On phones, the report link and the donors' @handles could not be reached.
- When signed in at tablet widths, the header ran 32 pixels off the page.
- One very long word in a prompt could widen the profile and account pages by up to 922 pixels.
- Totals above about $1,000 were clipped, and large amounts broke across lines on the full list.
- Text typed into a prompt before the page had finished loading could be lost on a slow connection.
- A keyboard user had to pass through every item in the activity feed to reach the page.
- A tab left open kept running old code after a release. It now takes the release at its next navigation.

Left as they are, knowingly:

- An admin is matched by @handle. If that handle were given up on GitHub and registered by someone else, they would
  gain `/admin`. The handle should be removed from `ADMIN_HANDLES` before it is ever changed.
- `npm audit` reports a low advisory in `deepmerge`, which has no fixed version. It is used only while the site is
  built, by the Svelte plugin to merge the project's own configuration, and it is not in the built site. The `fflate`
  advisory about malformed ZIP64 archives was fixed on 9 November 2026 by pinning `fflate` to 0.7.5 in `overrides`.

The review found these to be sound: keys are never returned or logged; OAuth state, PKCE and cookie flags;
cross-site requests; hostile output; database queries; file paths and git arguments; removal across every
route; the admin check; spoofed proxy headers; and the startup checks.

## Findings from checking the live APIs

Fixed:

- **Reasoning used up the reply.** Sonnet, Opus, Gemini and Grok must reason, and reasoning counts
  against `max_tokens`, so reports could have been cut short and billed. Runs now request low effort, a
  report that reaches the limit is marked as such, and a run now requires room for at least 2,000 tokens.
- **Temporary refusals ended donations.** OpenRouter answers 402 with `Retry-After` when too much is held
  for requests in progress, and the donation was closed as out of credit. It is now retried.
- **Unusable models were offered.** Models that cannot write a full report, or cannot be held to a
  length, are no longer listed.
- **Small donations on costly models** closed without doing anything. They are now refused up front, with
  the minimum stated.
- **The X share link** now uses the documented `intent/tweet` address.

Checked and found to match: the key endpoint, the model list and its fields, all seven suggested models,
the cost of web search, the cost in the final stream chunk, the forms of stream errors and keep-alives,
the GitHub sign-in addresses, and the size and format of the cards.

Could not be established without a real account: whether sources
arrive in the stream in the form documented. The code accepts both documented forms.
