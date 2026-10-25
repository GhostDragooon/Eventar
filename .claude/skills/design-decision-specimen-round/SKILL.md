---
name: design-decision-specimen-round
description: Use when a frontend choice needs Ivan to pick an option.
category: frontend-design
---

# An undecided frontend surface is answered by a specimen round, not by a built screen

Run the locked pipeline in `~/.claude/CLAUDE.md` first, then show every candidate as a labelled option on one dev-only specimen route. Ivan picks. The code does not.

- Route: a dev-only page under `app/dev-preview-uiport/`, gated out of production by the sandbox layout. Specimens use sample data and wire nothing into product screens.
- Each option is a card showing its frames, the skill that argued for it, and what it costs. Put the recommendation first, with one line of reason.
- At least three options per surface. When skills disagree, give each skill's position its own option.
- Write the pick target to `docs/plans/mvp/PICKS.md` as `<surface> (<letter>): <option id>, <date>`. Downstream cards stay unstartable until their pick line exists.
- Verify on the worktree's own :3100 server at desktop width, at 375 px (`document.documentElement.scrollWidth` must equal `innerWidth`), and in dark scheme. Read the console. Reset the tab afterwards per eventar-live-verify-worktree.
- Hand-back STATUS: `DONE (specimens), awaiting pick`. Do not mark the card done until the pick lands.
- Build every specimen from the real primitives in `components/ui` and the product's real classes and tokens. A look-alike re-typed from a product class string is not a specimen: it shows a design the product will not render. Before presenting, confirm each specimen imports the product component it stands for: grep each specimen file for its `components/ui` import. A file with no such import is a look-alike, and the round is not ready to present.
- Read contrast values only after every CSS transition has finished. In the Browser pane the animation clock can sit at 0, so `transition-all` Buttons report first-paint colours from `getComputedStyle`. Finish them first (`document.getAnimations().forEach(a => a instanceof CSSTransition && a.finish())`), then re-read. A probe that still prints "Measuring…" has no reading yet.
- A reviewer's contrast figure is a claim to re-measure, not a fact to put on a specimen. Re-measure in both schemes with transitions finished, cross-check against the token arithmetic in `app/globals.css`, and show the reviewer's figure beside the measured one. If they disagree because of the probe, withdraw the finding and say why.
- Never apply a chosen option before Ivan picks it, and never pick for him.
- A pick can approve the recommendation and carve out an exception. Apply the option with that exception, record the exception on the PICKS.md line, and name it as a deviation. Do not turn it into a new option. Tables use an outer border only, not a full grid (Ivan, 2026-10-22).