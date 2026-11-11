# OpenResearch: handoff for the next agent

Read this first. It holds what is not in the code: where the project stands, what the operator has
decided, and how they expect work to be done. `README.md` describes the project, `docs/DEPLOY.md` covers
putting it on Railway or a server, and `docs/LAUNCH.md` is the launch checklist and the record of what has been tested.

## Spinning it up

Node 22.17 or later and git are required. Nothing else, and no accounts, keys or money.

```sh
npm install
npm run demo       # the whole site at http://localhost:3000, with sample data; about two minutes the first time
```

Sign-in and model responses are simulated. Any handle may be used, and keys beginning `sk-or-v1-capped`
are accepted. `npm run demo -- --no-open` leaves the browser alone.

```sh
npm test           # unit tests
npm run test:e2e   # browser tests, about five minutes, using the installed copy of Chrome
npm run check      # types
npm run qa:sweep   # reads every word on every page; the instructions are at the top of scripts/qa-sweep.mjs
```

## Where it stands

**Live at https://openresearch.click since 9 November 2026**, on Railway. A push to `main` that passes CI is
deployed by the `deploy` job, so every push restarts the site, and runs in progress get up to 100 seconds to finish.

- The code is a public repository at https://github.com/supersonicsines/openresearch. Every commit is authored and committed as
  `supersonicsines <279517770+supersonicsines@users.noreply.github.com>`, set in the repository's own git config,
  with UTC dates and no trailers. Nothing in the files may point to a person: no real names, personal emails or
  absolute paths. `.env` and `data/` hold keys and must never be committed.
- **The first real run was made on 10 November 2026**, with real GitHub sign-in and the operator's own OpenRouter
  key, capped at $3, and every step passed. What was checked is recorded at the top of `docs/LAUNCH.md`. Four
  prompts were funded on launch day so that the board is not empty. No real key should be used without the
  operator's say.
- **Rounds and the OpenRouter connection were added on 11 November 2026**, at the operator's request, after
  feedback that pasting a key lost people and that the thread should be steered by those who fund it. They were
  tested against the stand-ins only. What was and was not checked is at the top of `docs/LAUNCH.md`. **The
  connection has never been made against the real OpenRouter**, so the operator is to try it once on the live site.
- What is left is in `docs/LAUNCH.md`: the operator is to read the terms and privacy pages, and the site is to be
  checked on a physical iPhone and in desktop Safari.
- Hosting: Railway, at https://openresearch.click, with one service built from the `Dockerfile`, one replica and a
  volume at `/data`. The exact settings are in the Railway section of `docs/DEPLOY.md`, and the facts about Railway's
  proxy behind them were measured on 9 November 2026. The `docker` job in CI builds the image, starts it with a
  volume and waits for its health check. A small VPS with Caddy, as in the rest of `docs/DEPLOY.md`, is the
  alternative. Either way, the host should hold nothing else with keys or money, because this site stores other
  people's API keys.
- Not checked: a physical iPhone and desktop Safari (only the Safari engine). Docker was not available where this
  was written, so the image is built only by CI and by Railway.

## Decisions the operator has made

These were weighed and decided, so they should not be reopened unless the operator raises them.

- **Donors' own OpenRouter keys, and no money held by the site.** "It should not be a business." A key is created
  by connecting OpenRouter (its PKCE flow, which needs no registration) or pasted, with a very obvious warning
  about setting a spending limit either way. Pasting was the only way until 11 November 2026.
- **Rounds.** Anyone may propose the next question on a project (60 words, one line), and anyone with a key may
  pledge towards one. A round closes a day after its first pledge, the question with the most pledged is
  researched with those pledges, and every other pledge stands for the next round, having cost nothing. An
  ordinary donation still starts at once and works through the editor's list. There is one standing question on
  every project, an audit of the findings. **Nothing closes or locks a project**: freezing a report was left
  out, because one small pledge could have closed someone else's project.
- **Prompts and proposed questions publish without review.** Reports and `/admin` takedowns exist, for both, but
  nothing is filtered in advance.
- **The 250-word limit is the only rule on a prompt.** A flood limit of 20 prompts per account per hour was added
  for launch. `MAX_PROMPTS_PER_HOUR=0` removes it, and the operator has been told about it.
- **Output is text and HTML only**, and every prompt is a hosted git repository that can be cloned.
- **GitHub sign-in is required** to submit or donate. It replaced X on 9 November 2026, because X charges for every sign-in.
  Sharing is still to X, through its free post link, and needs no API. **A prefilled X post must never contain an @handle:**
  these are GitHub handles, and on X the same name may belong to someone else.
- **The name.** The project was renamed from OpenSearch to OpenResearch on 2026-11-09, to match its domain and
  to avoid the OpenSearch trademark.

## Voice and look: these rules are firm

**Interface copy** is flat and natural, like a high-class British secretary, in the passive voice, with British
spelling: "The key was not accepted by OpenRouter." Buttons stay short imperatives. There are no tongue-in-cheek
themes, thematic puns, analogies, AI-sounding phrases or condescension. This applies to every string, including
errors, empty states and prefilled X posts, and it overrides any design guidance that prefers the active voice.

**The look** is academic and nerdy, with a little crypto launchpad. It reached this point through feedback, so
keep to this dose:

- The list layout was called "too reddity", which led to the ruled grid leaderboard.
- That was then "too academic", and "a BIT more crypto launchpad" was asked for, "still overall academic/nerdy".
- It now has: IBM Plex Mono for every figure and @handle, `OR-0001` references, a live activity ticker, segmented
  funding meters towards milestones, a dark graph-paper first place with a funding chart, and green for money and
  live states. "Raised" and "pledged" are the words for amounts, and "donated" is used for what a donor has given.
- A round uses the same words: a question is "proposed", "backed" and "leading", and a pledge "stands", is
  "withdrawn" or "could not be met". "Bid", "auction", "win" and "lose" are not used of a round.
- Source Serif prompts, italic old-style rank figures, and dry lines such as "$0.02 short of second place." and
  "This place is vacant." stayed.
- **@handles must be clearly visible everywhere.** They go through `src/lib/components/Handle.svelte`.

## How the operator expects work to be done

- **QA means looking at what a person sees.** A passing test suite missed "Submita prompt" and about a dozen other
  real bugs. Read rendered text and full-size screenshots rather than contact sheets. Check signed in as well as
  signed out. Use extreme content: the longest handle, one very long word, large sums, other scripts. Walk the
  keyboard order. Use `npm run qa:sweep`, and say a flow was checked at a width only if all of it ran at that width.
- **After rebuilding anything the operator has open, reload their tab** before saying it is updated. Restarting a
  server does not change a page that is already open.
- **Report plainly.** Say what was not tested, and correct wrong statements as soon as they are found.

## Things that will catch you out

- **SvelteKit 3:** `ORIGIN` is fixed at build time, so the startup safety checks run only on a build made for the public
  address. `data-sveltekit-noscroll` is ignored, so use `data-sveltekit-reset="false"`. `animate:` and paired effects
  did nothing in production builds, so `src/lib/flip.ts` measures around navigations. Test motion on a production build.
- **Svelte trims spaces at the edge of a tag.** `Submit<span> a prompt</span>` renders as "Submita prompt". Write
  `Submit{' '}<span>a prompt</span>`. Text directly inside a flex container also loses its spaces.
- **Hostile input runs on the only thread.** Model output and prompts must never meet a regular expression that
  can backtrack: one froze the whole site for over a minute. `parseEdited` in `src/lib/server/research.ts` shows the
  safe approach.
- **OpenRouter:** reasoning counts against `max_tokens`, and Sonnet, Opus, Gemini and Grok always reason. Runs ask for
  low effort and need room for 2,000 tokens. If real reports are cut short, look there first, at `MAX_RESEARCH_TOKENS`
  in `src/lib/budget.ts`. A 402 with `Retry-After` is temporary. The `web` plugin is deprecated but still works, and
  its replacement was in beta on 3 November 2026.
- **Browsers keep 404 and 410 responses** unless told otherwise, so pages send `private, no-cache`.
- **A pledge is not a donation until its round closes.** Pledges are kept in their own table, and `settle` in
  `src/lib/server/rounds.ts` turns the leading question's pledges into queued donations, checking each key first.
  Pledges are fixed from the moment a round closes until it has been settled. The browser tests run rounds of
  fifteen seconds (`ROUND_MINUTES=0.25` in `playwright.config.ts`), and the server refuses less than ten minutes
  on a public address.
- **The worker lives in the server process.** There must be one process, with a persistent disk, and never more than one
  replica. Serverless hosting will not work.
- **Stopping.** At SIGTERM the worker starts nothing new, gives runs in progress up to 100 seconds to finish, closes the
  live streams and exits. Whatever stops the process must wait longer than that: `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=120`
  on Railway, `TimeoutStopSec=120` under systemd, `--stop-timeout 120` with Docker.
- **Long handles and long words:** anything that shows either needs `min-width: 0` and `overflow-wrap: anywhere` inside
  flex and grid rows, or one prompt can widen a whole page.
