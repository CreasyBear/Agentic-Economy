## Standing orders
1. Write only inside your brief's SCOPE. Scripts a rerun needs go in .design-system/scripts/, committed; the check never reads .design-system/. Your scratch and one-off probes live only in .design-system/tmp/<your worker id>/, deleted at close. Never read, apply or delete another worker's scratch.
2. The token source belongs to the one writer coordinator-path.md names. Generated files, the barrel, registries, indexes, the migration map and the check's config, allowlist and drift list belong to the coordinator. Report allowlist shrink candidates; never edit the allowlist.
3. Use only the colors, fonts, shadows, gradients, motion, logos and product names the app already has, or that the design source the Frame follows draws. A new visual direction lands only when the person chose it through the design-source question.
4. Baselines, fixtures and checks stay as written. Fix the code instead.
5. Examples use inert data. No requests on mount.
6. Report with the REPORT block, status `done`, `partial`, `blocked` or `failed` first, commands and exit codes pasted, not summarized. Every claim that something is fixed, passes or works names the command that proved it this session and what that command covers. An audit that does not measure the reported defect is not evidence for it.
7. Return your report as your final message, as text. Write no report file, and never write into a coordinator file.
8. Browser commands use absolute paths and your own browser session name, spelled out on every line.
9. Commit only to the branch your brief names, locally. Never merge, deploy, publish, force-push, stash, reset or clean. No push or PR unless the person asked for one. Leave uncommitted changes and branches you did not create as they are.
10. Swap a raw literal for a token of exactly the same value on any route once pixdiff at tolerance 0 shows 0% on every width and theme capture of that route, or matching animation lists for a motion value. Decided gate defaults land wherever they reach. Other changes outside the pilot land only on cleared surfaces. Each is one surface per commit, with before and after captures in .design-system/review/ (images gitignored, traces.tsv and reports committed) and a traces.tsv row.
11. What the team needs after the run (scripts, config, specs, generated docs) goes in the repo, never only in .design-system/ or a skill folder. On a minimal footprint nothing is vendored. An unexplained diff stays out of the commit and becomes a gate.
12. The person's bans, quoted below, hold in code, copy, docs, examples and the showcase, except on a Don't: line.
13. The dev server and browser follow coordinator-path.md (Dev server and retries). In a shared checkout, start none, and return `blocked: server down` when the brief's port does not answer.
14. Put questions in your report, or your own run record, as gates with a default, never as a mid-run ask, then finish the work.
15. In a checkout other workers share, make small exact edits that fail when the file changed since you read it. Never rewrite a file whole, and never revert or tidy a change you did not make. A script that applies drafts takes an explicit list of your own files.
16. Start no agents unless your brief names you a coordinator, apart from the two fresh agents a two-agent test needs. A coordinator blocks on each worker and never returns while one runs.
17. Never change a repo-wide gate (lint flags, CI thresholds, warning limits, project instructions) to make your output pass.
18. The brief's "Person's calls" are values the person set, each with its file. Never normalize one to a pattern.
19. Before relaunching a step that looks missing, list the live agents. Hand a file to write only to an agent that can write files.

## Migrate audit additions

- Target is the active aecon source contract: `DESIGN.md`, `src/styles/globals.css`, `components.json` and `src/components/ui/`, all pinned to current source commit `e1f2b3f59ee785deb114dc195f33c2bda54593e7`.
- Audit output belongs only in `.migration/2026-09-30-aecon-audit/**`. Do not edit `src/**`, `convex/**`, `components.json`, `scripts/**`, `.design-system/**`, package files or project instructions. Do not add a production lint rule.
- Treat `DESIGN.md` as the active visual authority. Do not infer component replacement from matching names or native element names; preserve anchors, controls and site-specific compositions unless behavior parity is established.
- The remote `@bklit` registry is not pinned and does not define this audit target. Do not fetch it or run shadcn generators.
- This run ends after Inventory and Parity with `plan.md`. Do not take baselines, write application code, or claim runtime/visual verification.

## Project instructions carried into the audit

- `PRODUCT.md` defines product behavior; current source/tests define implementation. Preserve the Agentic Economy commercial roles and system's existing behavior.
- `DESIGN.md` is the active product design contract: public discovery is the visual reference; operator pages use the same tokens at compact density; the aecon palette, type, radius, shadow and motion rules apply; no invented design tokens.
- `AGENTS.md` directs new product language to `CONTEXT.md` and says the current implementation boundary is narrower than the full principal-reseller target.
- This is a shared checkout. Preserve all unrelated or untracked work; no stash/reset/clean/checkout operations.
