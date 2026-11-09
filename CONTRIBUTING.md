# Contributing to OpenResearch

Contributions are welcome. These notes describe how a change is proposed, checked and merged.

## Before starting

- `README.md` describes the project, and `CLAUDE.md` records the decisions that have been made and the rules for
  the interface's voice and look. A change that reopens one of those decisions should be raised as an issue first.
- For anything larger than a fix, an issue should be opened first, so that the approach can be agreed before time is spent on it.
- Security problems are reported privately, never in a public issue or pull request. See [SECURITY.md](SECURITY.md).

## Setting up

Node 22.17 or later and git are required. No accounts, keys or money are needed.

```sh
npm install
npm run demo       # the whole site at http://localhost:3000, with sample data
npm test           # unit tests
npm run test:e2e   # browser tests, using the installed copy of Chrome
npm run check      # types
```

The browser tests use stand-ins for OpenRouter and GitHub, and spend nothing. A real OpenRouter key or GitHub OAuth app is never
needed to work on the site, and none should appear in a pull request.

## Making a change

1. A branch is made from `main`, or from a fork.
2. The change is kept to one thing, and matches the code around it.
3. Tests are added or updated for the change. `npm test`, `npm run check` and, for anything a person sees,
   `npm run test:e2e` should pass.
4. Interface text follows the rules in `CLAUDE.md`: flat, natural, passive and in British spelling.
5. For anything visible, screenshots are attached at a desktop width and at 390 px wide.
6. If the change alters what the README or the docs say, they are changed in the same pull request.

## How a change is merged

`main` is protected. Every change reaches it through a pull request, and a pull request can be merged only when:

- the checks have passed (types, unit tests and a build on Node 22 and 24, and the browser tests);
- it has been approved by a maintainer other than its author, after its latest commit;
- every review comment has been resolved.

Pull requests are squash-merged, so each one becomes a single commit on `main`. For a first-time contributor, the
checks start once a maintainer has approved them to run.

## Licence

Contributions are released under the [MIT licence](LICENSE), as the rest of the code is.
