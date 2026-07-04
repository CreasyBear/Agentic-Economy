# Dead Code & Dedup Audit — Agentic Economy

Audit-only. READ-ONLY. Grounded in current `src/` + `convex/` + `package.json` at commit `1d4ce46` (graph built from `ecba2feb`). Cross-checked against `.planning/react-doctor/deslop--unused-file.txt` and independently verified each hit (react-doctor has false positives around Convex framework-loaded files and cross-boundary imports — those are excluded below and called out).

Format: `[P0-P3] · category · path:line · evidence · why · fix-direction · blast-radius`

---

## ORPHANS — files/exports imported by nothing

**[P2] · orphan · src/modules/answer/openui/ae-library.tsx + ae-openui-lazy.tsx (whole folder) ·** `AeOpenUIRendererLazy`, `aeOpenUiLibrary`, `aeOpenUiLibraryPromise`, `aeOpenUiSystemPromptPreamble` are defined and exported but imported by NOTHING outside the folder (grep across repo = self-references only). `.ui-craft/decisions.md:79` defers this to "Phase 2C" (lazy OpenUI renderer) which never shipped. · ~25 KB of floating Gen-UI code pulling in an extra dep. · Delete the folder; drop `@openuidev/react-lang` (see DEPS). Re-add when Phase 2C is actually wired. · blast: none (zero importers).

**[P2] · orphan · src/modules/lifecycle/ (public.ts + internal/validators.ts + internal/reference-vertical.ts) ·** `@/modules/lifecycle/public` is imported ONLY by `lifecycle/internal/reference-vertical.ts` and `lifecycle/internal/validators.ts` — pure internal cycle, no external consumer in `src/`, `convex/`, `tests/`, or `eval/`. · Entire module floats. · Delete the module. · blast: none.

**[P3] · orphan · src/modules/answer/artifacts.ts ·** exports unreferenced; the live projection is `src/modules/answer/projection.ts` (imported by `answer-thread/internal/public-projection.ts` and `convex/answerThreads.ts`). `artifacts.ts` is a dead sibling. · Delete. · blast: none.

**[P3] · orphan · src/modules/protected-action/internal/{policy,attempt-readback,reconstruction}.ts ·** `protected-action/public.ts` re-exports exclusively from `./internal/contact-follow-up`, which is a self-contained 1798-line file importing only `@/modules/common/*` and `observability/public` — it does NOT touch policy/attempt-readback/reconstruction. No `src/`, `convex/`, or `tests/` file imports those three (grep exit 1). They appear only in the Phase 4 PLAN docs (`.planning/phases/04-...`). · Dead scaffolding from a plan that collapsed into `contact-follow-up.ts`. · Delete, or if Phase-4-intent is live, wire them. · blast: none.

**[P3] · orphan · src/modules/seo/internal/validators.ts ·** `seo/public.ts` imports only `./internal/public-business-seo` and `./internal/json-ld`; sibling internals don't import validators. · Dead. · Delete. · blast: none.

**[P3] · orphan · src/components/ae/chat/AeSearchContextBar.tsx ·** Defined and exported, rendered nowhere. `tests/ui-contract/public-layout-contract.test.ts:103` actively asserts `expect(chat).not.toMatch(/<AeSearchContextBar\b/)` — the component is an *intentionally-suppressed* orphan guarded by a contract test. · Either delete (the test already forbids it) or wire it if near-me search returns. · blast: low (update the guarding assertion if deleted).

**[P3] · orphan · src/components/ae/layout/AeProseBlock.tsx ·** `AeProseBlock` defined, zero importers. · Delete. · blast: none.

**[P3] · orphan · src/components/ae/operator/AdminAnalyticsPanel.tsx ·** `AdminAnalyticsPanel` defined, zero importers. · Delete. · blast: none.

**[P3] · orphan · src/components/ui/{hover-card,native-select,toggle,toggle-group}.tsx ·** shadcn scaffolding with zero importers (these themselves import the live `radix-ui` meta-package, so the dep stays; only the components are dead). · Delete the four files. · blast: none.

---

## DUPLICATES / HALF-INTEGRATED

**[P1] · duplicate+half-integrated · src/routes/owner.billing.{tsx,activate.tsx,cancel.$operationId.tsx,redirecting.tsx,return.$operationId.tsx} ↔ src/future-phases/05-paid-activation-money-rails/routes/owner.billing.* ·** Both trees define the `/owner/billing*` route family. The 5 ACTIVE routes import `OwnerBillingStatePanel` + `summarizeOwnerBillingRoute` + `readOwnerBillingRouteReadback` directly from `@/future-phases/05-paid-activation-money-rails/owner-billing.{panels,readback}`. The contract scanner (`src/lib/ui/contract-scans.ts:170-256`) has to special-case-allow this leak. Already flagged in `.planning/codebase/CONCERNS.md:19-23`. · Parking boundary is defeated: shipped routes depend on "future" code, so money-rail code ships in the active bundle and import scans need an exception to pass. · Move the shipped panels/readback into `src/modules/billing` (or `src/components/ae/billing`); leave `src/future-phases` holding only genuinely-parked route modules that no active route imports. · blast: medium — 5 routes + their tests + the scanner allow-list + `CONCERNS.md`.

---

## ABANDONED / SCRATCH

**[P3] · abandoned · .tmp-answer-eval-inspect.ts (repo root) ·** Tracked in git (`git ls-files` confirms), not in `.gitignore`. A throwaway eval-debugging script that `import`s from `eval/answer/lib/*` and logs two hand-picked case ids. · Committed scratch at repo root. · Delete the file and add `.tmp*` / `.tmp-*` to `.gitignore`. · blast: none.

**[P3] · abandoned · src/future-phases/04-owner-pending-protected-actions/ (owner-actions.panels.tsx, owner-actions.readback.ts, routes/owner.actions.tsx) ·** Consumed only by its own parked route + `.planning` docs; not wired to any active Phase-4 surface. The live Phase-4 internals collapsed into `protected-action/internal/contact-follow-up.ts`, so this parked UI scaffold has drifted from the implementation path. · Keep parked and clearly labelled, or reconcile with the live `contact-follow-up` readback. · blast: none (explicitly parked; scanner allows it).

---

## DEAD DEPENDENCIES

**[P2] · dead-dep · package.json:90 `"atmn": "^1.1.10"` (devDependency) ·** Zero usage in `src/`, `vite.config.ts`, or any config. · Unused dev toolchain package. · Remove from devDependencies. · blast: none.

**[P2] · dead-dep · package.json:55 `"@openuidev/react-lang": "^0.2.8"` ·** Sole consumer is the dead openui/ folder (ORPHANS #1). Not in `package-lock` peer chain that anything else needs; `@modelcontextprotocol/sdk` is neither in `package.json` nor imported anywhere. · Remove together with the openui folder. · blast: none.

---

## NON-FINDINGS — verified ALIVE (do NOT delete)

React-doctor's `deslop--unused-file.txt` flags several files that are **false positives** — they are framework entry points or cross-boundary imports its graph can't see:

- `convex/{answerThreads,billing,billingStore,businessActions,businessActionStore,protectedActions,protectedActionStore}.ts` — Convex API/store modules, loaded by the Convex framework via convention + `_generated/api`, not by TS imports.
- `convex/crons.ts` — Convex cron registry, auto-loaded by the Convex server runtime.
- `convex/devSeed.ts` — invoked by `npm run seed:dev` → `convex run devSeed:seedDevCatalog` (package.json:13).
- `src/modules/answer-thread/projection.ts` — imported by `convex/answerThreads.ts:12` (`buildPublicThreadProjection`); react-doctor misses the cross-boundary `../src/...` import.
- `src/modules/dev/` — consumed by `convex/devSeed.ts` via `../src/modules/dev/...` (dev-seed fixture path).
- `radix-ui` (package.json:71) — **heavily used**: 20+ `src/components/ui/*.tsx` import primitives via `from "radix-ui"` (alert-dialog, tabs, popover, sheet, scroll-area, tooltip, dialog, dropdown-menu, select, checkbox, …). Not a duplicate of granular `@radix-ui/*`; it IS the import surface. Keep.
- `billing` / `protected-action` / `business-action` modules absent from `src/modules/actions/index.ts` — **by design**, not a gap. The action registry is the agent-tool door (`/api/agent/tools`); these are owner/server-side function modules consumed by routes, not agent-exposed actions. Only `inquiries` + `registry` are agent tools intentionally.

---

## Digest

- 1× P1: active `/owner/billing*` routes depend on `src/future-phases/05-...` (boundary leak + duplicate route defs) — `.planning/codebase/CONCERNS.md` already tracks it.
- 6× P2: dead `answer/openui/` folder (+ its `@openuidev/react-lang` dep), dead `lifecycle/` module, unused `atmn` devDep.
- 7× P3: dead `answer/artifacts.ts`, 3 dead `protected-action/internal/*`, dead `seo/internal/validators.ts`, dead `AeSearchContextBar`/`AeProseBlock`/`AdminAnalyticsPanel`, 4 dead shadcn ui primitives, tracked `.tmp-` scratch file, parked 04 owner-actions scaffold.
- Explicitly cleared: all `convex/*.ts` API/store/cron/seed files, `answer-thread/projection.ts`, `dev/` module, `radix-ui` dep, and the non-registered phase modules (by design).
- `react-doctor/deslop--unused-file.txt` is ~50% false-positive for this repo (Convex framework loading + cross-boundary imports); remediator must verify before deleting.
