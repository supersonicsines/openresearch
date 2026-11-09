# OpenSearch: handoff for the next agent

Read this first. It holds what is not in the code: where the project stands, what the operator has
decided, and how they expect work to be done. `README.md` describes the project, `docs/DEPLOY.md` covers
putting it on a server, and `docs/LAUNCH.md` is the launch checklist and the record of what has been tested.

## Spinning it up

Node 22.17 or later and git are required. Nothing else, and no accounts, keys or money.

```sh
npm install        # node_modules was left out of this folder, because it is specific to one machine
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

If the folder came from a USB drive, it should be copied off the drive first. macOS may add hidden `._` files beside
everything on such a drive. They are ignored by git and the test tools, and `find . -name '._*' -delete` removes them.

## Where it stands

Built and tested for a public launch, but **not yet deployed**.

- The code is a public repository at https://github.com/supersonicsines/opensearch. Every commit is authored and committed as
  `supersonicsines <279517770+supersonicsines@users.noreply.github.com>`, set in the repository's own git config,
  with UTC dates and no trailers. Nothing in the files may point to a person: no real names, personal emails or
  absolute paths. `.env` and `data/` hold keys and must never be committed.
- **It has never run against real OpenRouter inference or real X sign-in.** It has only run against stand-ins, and
  the code has been compared with the live documentation. The first real run is in `docs/LAUNCH.md`, and takes
  about ten minutes and a few cents with the operator's own key. No real key should be used without their say.
- The next steps are all in `docs/LAUNCH.md`: set up the X app **with purchased credit** (the likeliest blocker),
  choose a host, deploy, do the first real run, and fund a few prompts so that the board is not empty.
- Hosting advice given: a fresh, small VPS with Caddy, following `docs/DEPLOY.md`. It should not share a machine
  with anything else that holds keys or money, because this site stores other people's API keys. Railway is
  workable, with one replica and a volume at `/data`, but the `Dockerfile` has never been built.
- Not checked: a physical iPhone and desktop Safari (only the Safari engine), the `Dockerfile`, and a real HTTPS proxy.

## Decisions the operator has made

These were weighed and decided, so they should not be reopened unless the operator raises them.

- **Pasted OpenRouter keys**, not OAuth, with a very obvious warning about setting a spending limit.
- **Prompts publish without review.** Reports and `/admin` takedowns exist, but nothing is filtered in advance.
- **The 250-word limit is the only rule on a prompt.** A flood limit of 20 prompts per account per hour was added
  for launch. `MAX_PROMPTS_PER_HOUR=0` removes it, and the operator has been told about it.
- **Output is text and HTML only**, and every prompt is a hosted git repository that can be cloned.
- **X sign-in is required** to submit or donate.
- The name also belongs to a well-known search engine project. The operator has been told.

## Voice and look: these rules are firm

**Interface copy** is flat and natural, like a high-class British secretary, in the passive voice, with British
spelling: "The key was not accepted by OpenRouter." Buttons stay short imperatives. There are no tongue-in-cheek
themes, thematic puns, analogies, AI-sounding phrases or condescension. This applies to every string, including
errors, empty states and prefilled X posts, and it overrides any design guidance that prefers the active voice.

**The look** is academic and nerdy, with a little crypto launchpad. It reached this point through feedback, so
keep to this dose:

- The list layout was called "too reddity", which led to the ruled grid leaderboard.
- That was then "too academic", and "a BIT more crypto launchpad" was asked for, "still overall academic/nerdy".
- It now has: IBM Plex Mono for every figure and @handle, `OS-0001` references, a live activity ticker, segmented
  funding meters towards milestones, a dark graph-paper first place with a funding chart, and green for money and
  live states. "Raised" and "pledged" are the words for amounts, and "donated" is used for what a donor has given.
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
- **The worker lives in the server process.** There must be one process, with a persistent disk, and never more than one
  replica. Serverless hosting will not work.
- **Long handles and long words:** anything that shows either needs `min-width: 0` and `overflow-wrap: anywhere` inside
  flex and grid rows, or one prompt can widen a whole page.
