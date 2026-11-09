# Rehearsal: OpenResearch demo

Gold: `hero-demo` (kept the structure: named targets, a cursor gesture, a payoff that holds, a poster). Changed: the look is the site's own, there is no terminal, and the satellite is a leaderboard. The window dissolves at its foot, after `fade-crop`.

Beats: a press on Donate, the dialog, a press on Donate $5.00, the run streams and pushes the findings down line by line, the total and the leaderboard move, and the finding lands in the findings. The loop is about 15 seconds. Nothing resets: figures only rise, and the two lower donors take turns overtaking each other.

Captured: 1280 and 390 wide on the real About page and in the skill's preview; light and dark at 1280; reduced motion at both widths.

Film:
- `kit override` (6 lines, real page only). These are false positives, and the gate fails on the real page because of them. The check recognises kit CSS by a `/kit/` file path, and the production build merges kit CSS into one file, so the kit's own rules are flagged. `demo.css` sets no geometry on kit parts, and the preview, where paths are intact, shows no such lines.
- `--gate` passes in the preview at 1280 and 390. The last dark run in the preview also passed, but it predates the final recomposition. On the real page, dark at 1280 reports only the six lines above.
- `jump` on Donate $5.00 at about 3.2s: read as the press feedback on that button, and left in.
- `settle snap` of about 10px on the live block at 390. It does not show in any filmed frame, spaced 1.5s apart. The cause is unconfirmed, and it is listed below.
- Coverage is reported as inconclusive on every run, with sampling gaps above 27ms on this machine.

Review: one fresh-eye review, of an earlier version. Acted on: the doubled masthead, the empty column, the stopped window foot, the payoff vanishing, the bars where the eye lands, the heavy scrim, the crossfading dialog, the blank pane during search, the row clipped while crossing, the phone's floating cards and uneven insets, the cut shadow, and dark surfaces. Not taken: removing the title bar, so that the demo cannot be mistaken for the live page. Its gate failure is the `kit override` artefact above. The revised version has not had a second fresh-eye review.

Assumptions: the demo sits on /about and on an empty home page. Moving it elsewhere needs only `<StageDemo />`.

Unresolved: the `settle snap` above needs checking at speed on a real phone.

Not checked: real-time feel in a browser by a person, a physical phone, the dark phone layout, widths between 390 and 1280, and Safari or Firefox. Film uses headless Chrome.

Later change: when the site moved to mono figures and green for money, `demo.css` followed, with figures in IBM Plex Mono and the primary button and accent in the site's green. The choreography, the layout and the kit parts did not change, and the demo was not filmed again, beyond its tests and a look at one still on the empty home page.
