# Code Quality, Component Purity & Structural Decoupling: Operational Register

**Date:** 20 September 2026  
**Status:** CAMPAIGN CLOSED (Waves 1–5 Complete; commit `147b602a7`). **Historical.** Current 1,000-line / 80-line compliance is the Campaign 2 close (`docs/operations/code-quality-ceiling-register.md`). Campaign 3 façade/helper follow-through: `docs/operations/code-quality-campaign-3-register.md`. **Post-campaign re-audit recorded below is a 20 Sep snapshot — do not treat its “seven files over 1,000” / “24 routes over 80” rows as current.**  
**Operating Protocol:** `docs/operations/code-quality-maturity-protocol.md`  
**Master Architectural Specification:** `docs/designs/2026-09-19-code-quality-iceinvein.md`  
**Core Rules:** `.cursor/rules/leaf-and-component-cleanliness.mdc`, `AGENTS.md`

---

## 1. Progress & Census Scorecard

*Campaign complete — historical close. Operating protocol is the **five-stage** Grok → Composer → Orchestrator lifecycle (`docs/operations/code-quality-maturity-protocol.md`). “4-Phase” below is archival wording only.*

| Wave | Scope | Workflows | Verified | In Review | Pending | Target Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Wave 1: Component Type Quarantine & Contract Extraction** | Extract 80+ trapped types from `.tsx` into domain contracts | `CQ-01` – `CQ-06` | 6 | 0 | 0 | `COMPLETE` |
| **Wave 2: Leaf & Container Decoupling: Critical Surfaces** | Earnings, Chat, Consent, Spending Limits, Command Palette | `CQ-07` – `CQ-12` | 6 | 0 | 0 | `COMPLETE` |
| **Wave 3: Leaf & Container Decoupling: Wizards & Settings** | Danger Zone, Provider Workspace, Onboarding, Price Modal, Playground, Operator Console | `CQ-13` – `CQ-18` | 6 | 0 | 0 | `COMPLETE` |
| **Wave 4: Convex God-Files & CQS Nonce Rectification** | Four façade decompositions + 11 CQS read conversions + RPC contract guards (`CQ-22` dropped; `CQ-25` parked) | `CQ-19` – `CQ-25` | 6 | 0 | 0 | `COMPLETE` |
| **Wave 5: Barrel Cycle Eradication & Dependency Ratchet** | Type relocation out of barrels; `no-circular-via-barrel` 32 $\rightarrow$ 0; module ratchet rebaseline (`CQ-29` collateral; not executed) | `CQ-26` – `CQ-30` | 4 | 0 | 0 | `COMPLETE` |
| **Total** | **All 30 Code Quality Workflows** | **30** | **28** | 0 | 0 | `CLOSED` (`CQ-22` `DROPPED`; `CQ-25` `PARKED`; `CQ-29` collateral) |

### Wave 1 Verification Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| **Gate 1 Lint** | `npm run lint` (oxlint, `--deny-warnings`) | Exit 0, zero warnings. |
| **Gate 2 Typecheck** | `npm run typecheck` (`tsc --noEmit`, `exactOptionalPropertyTypes: true`) | Exit 0, zero errors. |
| **Gate 3 Dependency ratchet** | `npm run deps:check` | Exit 0. `no-circular` 0/0, `no-circular-capability-supply-internal` 0/0, `no-circular-via-barrel` 32/32. |
| **Gate 4 Tests** | `npx vitest run` | 703 of 708 files and **6,649 tests passing**, 25 skipped, 3 todo. The 9 remaining failures are all attributed to non-campaign causes (see the Known Red Baseline section). |

`no-circular-via-barrel` measured **32 both before and after Wave 1**, confirming that routing the quarantined types as deep module imports added zero barrel cycles — the metric that Wave 5 (`CQ-26` to `CQ-30`) exists to drive to zero.

### Wave 2 Verification Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| **Gate 1 Lint** | `npm run lint` (oxlint, `--deny-warnings`) | Exit 0, zero warnings. |
| **Gate 2 Typecheck** | `npm run typecheck` (`tsc --noEmit`, `exactOptionalPropertyTypes: true`) | Exit 0, zero errors. |
| **Gate 3 Dependency ratchet** | `npm run deps:check` | Exit 0. `no-circular` 0/0, `no-circular-capability-supply-internal` 0/0, `no-circular-via-barrel` 32/32. |
| **Gate 4 Tests** | `npx vitest run` | 719 of 723 files and **6,738 tests passing**, 25 skipped, 3 todo. The 8 remaining failures are all attributed to non-campaign causes (see the Known Red Baseline section). |

`no-circular-via-barrel` remained **32 after Wave 2**, confirming compound-folder extractions added zero new barrel cycles.

### Wave 3 Verification Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| **Gate 1 Lint** | `npm run lint` (oxlint, `--deny-warnings`) | Exit 0, zero warnings. |
| **Gate 2 Typecheck** | `npm run typecheck` (`tsc --noEmit`, `exactOptionalPropertyTypes: true`) | Exit 0, zero errors. |
| **Gate 3 Dependency ratchet** | `npm run deps:check` | Exit 0. `no-circular` 0/0, `no-circular-capability-supply-internal` 0/0, `no-circular-via-barrel` 32/32. |
| **Gate 4 Tests** | `npx vitest run` | 737 of 741 files and **6,830 tests passing**, 25 skipped, 3 todo. The 8 remaining failures are all attributed to non-campaign causes (see the Known Red Baseline section). |

`no-circular-via-barrel` remained **32 after Wave 3**, confirming the six new compound folders added zero new barrel cycles.

### Wave 4 Verification Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| **Gate 1 Lint** | `npm run lint` (oxlint, `--deny-warnings`) | Exit 0, zero warnings. |
| **Gate 2 Typecheck** | `npm run typecheck` (`tsc --noEmit`, `exactOptionalPropertyTypes: true`) | Exit 0, zero errors. |
| **Gate 3 Dependency ratchet** | `npm run deps:check` | Exit 0. `no-circular` 0/0, `no-circular-capability-supply-internal` 0/0, `no-circular-via-barrel` 32/32. |
| **Gate 4 Tests** | `npx vitest run` | **743** files and **6,870 tests passing**, 25 skipped, 3 todo. **8 failures in 3 files**, exactly matching the Known Red Baseline (`module-boundaries.test.ts` 3, `module-boundaries-ratchet.test.ts` 2, `native-platform-procure.test.ts` 3). No new failures. |

`no-circular-via-barrel` remained **32 after Wave 4**. Both RPC contract guards (`convex-api-kind-snapshot.test.ts`, `convex-string-reference-ratchet.test.ts`) passed with **unmodified fixtures** after all façade moves.

### Wave 5 Verification Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| **Gate 1 Lint** | `npm run lint` (oxlint, `--deny-warnings`) | Exit 0, zero warnings. |
| **Gate 2 Typecheck** | `npm run typecheck` (`tsc --noEmit`, `exactOptionalPropertyTypes: true`) | Exit 0, zero errors. |
| **Gate 3 Dependency ratchet** | `npm run deps:check` | Exit 0. **`no-circular` 0/0 ok**, **`no-circular-capability-supply-internal` 0/0 ok**, **`no-circular-via-barrel` 0/0 ok** — all three rules green for the first time in the campaign. |
| **Gate 4 Tests** | `npx vitest run` | **6 failures in 2 files**, down from the Wave 1–4 baseline of **8 in 3** (see Known Red Baseline). **`module-boundaries-ratchet.test.ts` now passes** — both ratchet failures from that file are resolved. |

All **32** `no-circular-via-barrel` violations were one repeated pattern across **six** barrels (`money`, `security`, `observability`, `business`, `seo`, `discovery`): `public.ts` **defined** types, the module's own `internal/` imported them back from the barrel, and the barrel re-exported those same internals — an `internal → public.ts → same internal` loop. None were structural cross-module cycles. None were introduced by Waves 1–4; all were pre-existing.

### Wave 5 Campaign Commit

Wave 5 landed on `main` as `147b602a7` — barrel cycle eradication (`CQ-26`–`CQ-28`), dependency and module ratchet close-out (`CQ-30`), and the **first commit** of `src/modules/module-boundaries.ts` (see correction below).

### Wave 5 Cross-Cutting Infrastructure & Register Corrections

- **Wrong fix in the Wave 5 plan (reusable lesson):** The register advised `import type` as the cheap decoupling move. **It does not work.** `.dependency-cruiser.cjs` sets `tsPreCompilationDeps: true`, so type-only edges still count as cycles; most of the 32 violations already used `import type`. The only effective fix is **relocating the type out of the barrel entirely** into an `internal/` leaf that internals import directly; `public.ts` re-exports for external consumers only.
- **Wrong module census in the Wave 5 plan (reusable lesson):** The register named four modules (`money`, `security`, `observability`, `discovery`). There were **six**. It missed **`business`** and **`seo`**, and undersold **`discovery`** and **`security`** (discovery's 11 cycles were transitive through other barrels; security had six cycles, not a single-file anecdote).
- **`CQ-29` never ran:** Discovery's 11 cycles resolved as **collateral** of `CQ-26` through `CQ-28`, because discovery's loops ran through those barrels. Verified by measurement — `depcruise` reports zero violations and no discovery `internal/` file imports its own barrel — not assumed.
- **`module-boundaries.ts` history correction:** Waves 1–3 recorded registering **25** entry surfaces in `src/modules/module-boundaries.ts`. That file was **never committed** by the campaign until `147b602a7`; its git history stopped at pre-campaign `ac16182cb`, and the surfaces existed only as **uncommitted working-tree changes**. That is the real reason the module ratchet was red from Wave 1 onward — not the rationale previously recorded under Accepted Debt.
- **Ratchet rebaseline (`CQ-30`):** `tests/imports/module-boundaries-ratchet.test.ts` rebaselined from **28 modules / 198 surfaces** to measured **29 / 224**, derived from the manifest rather than estimated. The rise reflects type quarantine moving domain types out of `.tsx` into declared surfaces — the intended outcome, not module sprawl. **One module and one surface** of 29/224 (`decision-engine` entries kept; `registry/tool-reranker.ts` **omitted**) belong to concurrent in-flight work and should be re-attributed when that agent lands, at which point the omitted surface is re-added. Declaring `tool-reranker.ts` now would trip `module-unknown-entry` on a clean checkout because the file is untracked in their branch.
- **Barrel invariants preserved:** Every `public.ts` kept its exported surface identical — no external consumer changed. No file under any `internal/` imports its own barrel (cleanliness rule §5). New type leaves are deliberately **not** declared as entry surfaces.

### Campaign Closing Summary

The code-quality campaign ran five waves across **28 verified workflows** (`CQ-22` dropped, `CQ-25` parked, `CQ-29` resolved without execution):

1. **Wave 1 — Type quarantine:** Extracted 80+ domain and view-model types from `.tsx` into module contracts and view-models; consolidated Rule-4 diagnostics; enabled deep module imports without widening barrel cycles.
2. **Wave 2 — Critical surface decomposition:** Earnings, chat, consent, spending limits, and command palette became compound folders with hooks, pure leaves, and colocated tests; enabled `src/**/*.test.ts` discovery in Vitest.
3. **Wave 3 — Wizards and settings:** Danger zone, provider workspace, onboarding, price modal, playground, and operator console received the same container or hook plus leaf pattern.
4. **Wave 4 — Convex façades and CQS:** Four god RPC files split under `convex/lib/<domain>/` with unchanged generated paths; eleven nonce-burning reads converted to queries with read-only admit siblings; RPC kind snapshot and string-reference ratchets added.
5. **Wave 5 — Barrel cycle eradication:** Relocated shared types out of six god-barrels into internal leaves; lowered `no-circular-via-barrel` to **0**; committed `module-boundaries.ts` and rebaselined the module manifest ratchet to measured truth.

### Outstanding Work (Post-Campaign)

**Hard 1,000-line files and ultra-thin page routes are claimed by Campaign 2** (`docs/operations/code-quality-ceiling-register.md`). Everything else below stays here so it is not lost:

Nothing below was in scope for Wave 5 close-out; carry forward explicitly so recorded debt is not lost:

| Item | Notes |
| :--- | :--- |
| **`CQ-25`** | `capabilityCallProjection.ts` façade decomposition — parked behind concurrent call-worker ADR. |
| **`oxlint.config.ts` complexity ratchets (`CQ-24`)** | Per-file ceilings in `convex/lib/providerConnections/`; **`reserveAttempt.ts` at 59** is the standout simplification target. |
| **React Doctor advisories (Wave 4)** | `server-sequential-independent-await` / `async-await-in-loop` in verbatim-moved Convex submodules — see Accepted Debt. |
| **`args as never` (`CQ-21`)** | `convex/lib/money/agentFundingHandoff.ts` read-admit path — security-relevant; needs deliberate fix. |
| **`no-chain-state-updates`** | `src/components/ae/offerings/provider-workspace/useProviderWorkspaceSheets.ts` — surfaced at Wave 3 commit hook. |
| **`CQ-16` GST display** | Price modal bypasses `displayPriceFromPricingConfig` for four-decimal leg preview — see Accepted Debt. |
| **`directory-presentation.ts`** | Re-export shim left from `CQ-05`; structural cleanup candidate. |
| **`registry/tool-reranker.ts`** | Re-attribute the omitted manifest surface when concurrent agent work lands at `HEAD`. |
| **Known red tests (concurrent agent)** | Six failures in `module-boundaries.test.ts` (3) and `native-platform-procure.test.ts` (3) — ADR 0002 `tool.procure` removal; not campaign-owned. |
| **Hard 1,000-line files (re-audit)** | Seven files still over the hard ceiling — see Post-Campaign Re-Audit census. Includes dropped `CQ-22` (`capabilitySupplyPublish.ts` 1135) and `admission.ts` 1037. |
| **Ultra-thin routes (re-audit)** | 24 route files over 80 lines. Campaign never scoped this invariant. Worst: `activity.tsx` 769. |
| **`registry/internal` own-barrel import (re-audit)** | `registry-action-contracts.ts` imports `@/modules/registry/public`. Only remaining same-module barrel hit; `deps:check` still 0 because the rule matches `public.ts` cycles, not this edge alone. |
| **React Doctor errors (re-audit)** | 4 errors on full scan: carousel effect cleanup, `status.tsx` route property order, two `secret-in-fallback` hits in `tools/dev/`. Not campaign regressions. |

### Post-Campaign Re-Audit (20 September 2026)

Re-measured the original ten cleanliness invariants and the Stage-4 gates against **current source**, not the register's close-out claims. Scout: `81ea5cb5-f04b-49bb-9d9f-f7fbdb8f7492`. Gates and React Doctor were re-run independently (same day, after `97e944b3c`).

**Verdict:** The campaign closed the work it scheduled. It did **not** make the ten invariants true of the current tree. Waves 1–5 extracted the named 80 types, decomposed the named top-12 surfaces, split four Convex gods, converted eleven nonce-burning reads, and drove `no-circular-via-barrel` to 0. File-size, route-thickness, remaining Convex gods, leftover money math in standalone `.tsx`, and one own-barrel import were never in those 30 workflows and are still red.

#### Gate re-run

| Gate | Command | Result |
| :--- | :--- | :--- |
| **Gate 1 Lint** | `npm run lint` (`oxlint --deny-warnings`) | Exit 0. |
| **Gate 2 Typecheck** | `npm run typecheck` (`tsc --noEmit`) | Exit 0. |
| **Gate 3 Dependency ratchet** | `npm run deps:check` | Exit 0. **`no-circular` 0/0 ok**, **`no-circular-capability-supply-internal` 0/0 ok**, **`no-circular-via-barrel` 0/0 ok**. |
| **Gate 4 Tests** | `npx vitest run` | **6 failed / 6,836 passed / 25 skipped / 3 todo** (6,870). **2 files** fail: `module-boundaries.test.ts` (3), `native-platform-procure.test.ts` (3). Matches Known Red Baseline. |
| **TS standards** | `npm run test:ts-standards` | **1/1 passed**. |
| **UI contract** | `npm run test:ui-contract` | **2/2 passed**. |
| **RPC guards** | `convex-api-kind-snapshot` + `convex-string-reference-ratchet` + `module-boundaries-ratchet` | All **pass**. Module ratchet remains at measured **29 / 224**. |

#### React Doctor (`npm run doctor -- --yes --scope full`)

`react-doctor` **0.7.7**, full-repo, `--blocking none`. **4 errors, 412 warnings, 220 files, 416 diagnostics.** Categories: Performance 205, Maintainability 148, Bugs 55, Security 6, Accessibility 2. Score API skipped (`--no-telemetry`).

**Errors (4):**

| Rule | File | Notes |
| :--- | :--- | :--- |
| `effect-needs-cleanup` | `src/components/ui/carousel.tsx:96` | Subscription in `useEffect` without cleanup. Vendored/Tier-1 primitive; not campaign-owned. |
| `tanstack-start-route-property-order` | `src/routes/status.tsx:27` | `loader` after `head` breaks type inference. |
| `secret-in-fallback` | `tools/dev/experiment-chained-jev-router.ts:42` | Hardcoded secret fallback for an env var. Dev experiment; not product runtime. |
| `secret-in-fallback` | `tools/dev/try-jev-aecon.ts:76` | Same class. |

**Security warnings (4 more):** `build-pipeline-secret-boundary` on `.github/workflows/kernel-release-gate.yml`; `agent-tool-capability-risk` on `convex/chatTools.ts`; `local-rpc-native-bridge-risk` on `tools/dev/local-source-write-secret.ts`; `mcp-tool-capability-risk` on the package-5 reference provider. Treat as review items, not campaign regressions.

**Top warning rules:** `async-await-in-loop` (96), `unused-export` (73), `js-set-map-lookups` (49), `server-sequential-independent-await` (31), `js-combine-iterations` (28), `unused-file` (20). These are advisory; CI is `blocking: none`.

**Campaign-adjacent React Doctor hits that confirm recorded debt:**

- `no-chain-state-updates` still fires in `useProviderWorkspaceSheets.ts` (lines 128, 131) plus `AeKeyRevealDialog.tsx`, `AeConnectReturnPoller.tsx`, and `src/components/ui/data-state.ts`.
- `no-giant-component` names `AeKeyRevealDialog`, `AeOwnerCredit`, and the three fattest routes (`activity.tsx`, `agent-access.tsx`, `owner.credit.tsx`) — same files the size census flags.
- `server-sequential-independent-await` / `async-await-in-loop` remain widespread in Convex, including the Wave-4 moved files.

#### Ten-invariant scorecard

Measured against `.cursor/rules/leaf-and-component-cleanliness.mdc` and the protocol's Canonical Quality Invariants. Line counts are `wc -l`.

| # | Invariant | Status | What held | What is still red |
| :---: | :--- | :---: | :--- | :--- |
| 1 | Component Type Quarantine | **PARTIAL** | Named Wave-1 80 types live in view-models/contracts. Canonical `Rule4Diagnostic` is unique (`src/lib/ui/diagnostic.ts`). | **2** domain re-exports still leave `.tsx` (`AeOwnerOfferings.tsx` → `OwnerOfferingSummary`; `AePayoutPolicyForm.tsx` → `PayoutScheduleType`). Domain-ish locals remain in standalone cards/routes (`AvailableAccountHistory`, `SavedToolsContextValue`, `ActivityLoaderResult`, …). Strict “exactly one `<Name>Props`” is not true of 82 of 315 scanned `.tsx` files. |
| 2 | Pure Leaf Invariant | **PARTIAL** | All **12** campaign compound `components/` leaves + `SpendingLimitInputs.tsx` have **zero** I/O and **zero** inline GST/ABN/BigInt. | Standalone money surfaces still compute in `.tsx`: `AeInvoiceHistoryTable.tsx` (`calculateAudGstSplit`), `TaxProfileForm.tsx` (`isValidAbn`), BigInt cards (`AeMonthlySpendCeilingCard`, `AeAutoRechargeCard`, `AePayoutPolicyForm`, `AeAccountHistoryTable`). `AeAgentJsonAffordance.tsx` still `fetch`es. |
| 3 | File size ceilings | **FAIL** | Named Wave-2/3 compounds are under 300 (except recorded deviations). Four named Convex façades are under 1,000. | **7 files > 1,000** (hard fail). **19** UI components > 300. **24** Convex roots ≥ 500. See census below. |
| 4 | CQS — reads do not burn write nonces | **PARTIAL** | All **11** CQ-19 handlers remain `query` / `queryGeneric` + `requireSourceRead`. No `query` calls `requireSourceWrite`. RPC kind snapshot still green. | `agentMoneyReads.balance` (action) still `runMutation`s `prepareBalance` → `requireSourceWrite` (deliberate Wave-4 non-conversion). `moneyLedger.readAgentProviderEarnings` is still a `mutation` accepting `sourceWriteArgs` (stub; burns no nonce). |
| 5 | Internal never imports own barrel | **PARTIAL** | Money, security, observability, discovery, business, seo internals are clean. `deps:check` barrel rule **0/0**. | **1** same-module hit: `src/modules/registry/internal/registry-action-contracts.ts:18` imports `@/modules/registry/public`. |
| 6 | Compound folder encapsulation | **PARTIAL** | **12/12** Wave 2–3 compounds have container + hook + contracts + skeleton + `components/`. No leftover flats at the old `AeSupplyEarningsCard.tsx` paths. | `src/components/ae/market/tool-detail/` is a 13-file pile with no hook/contracts/skeleton/leaves (`AeToolContractSections.tsx` **447**). Three I/O panels remain flat under `offerings/`. |
| 7 | Three-tier hierarchy | **PARTIAL** | `src/components/ui/` → **0** `@/modules/*`. `src/components/ae/shared/` → **0** `@/modules/*`. | Law examples (`AeCopyReference`, `AeGstBreakdown`) do not live in `shared/`. Extra non-tier directories (`ae/data/`, `ae/feedback/`, `ae/forms/`, `ae/status/`) predate the campaign. |
| 8 | Convex façade pattern | **PARTIAL** | `interactiveAuthority.ts` **102**, `capabilityQuotes.ts` **75**, `capabilityProviderConnectionAttempts.ts` **100**; logic under `convex/lib/<domain>/`. RPC paths unchanged. | `moneyAccountFunding.ts` **222** over the **200**-line façade ceiling. `capabilityCallProjection.ts` **1041** (CQ-25 parked). `capabilitySupplyPublish.ts` **1135** (CQ-22 dropped — still a 1,000-line file). **16** `convex/lib/` files > 400, including `admission.ts` **1037**. |
| 9 | Ultra-thin route controllers | **FAIL** | Campaign-touched `owner.operations.tsx` stayed under 80. | **24** of ~42 `src/routes/**/*.tsx` exceed **80**. Worst: `activity.tsx` **769**, `agent-access.tsx` **519**, `owner.credit.tsx` **401**. Campaign never scoped this invariant. |
| 10 | Colocated skeletons & tests | **PARTIAL** | All 12 compounds have a colocated `*Skeleton.tsx`. `vitest.config.ts` includes `src/**/*.test.ts(x)`. | `tool-test-playground` has **no** hook test and **no** leaf tests. Connect-wizard, spending-limits, price-modal, onboarding are hook-only. |

#### Hard 1,000-line census (current `wc -l`)

| Lines | File | Notes |
| ---: | :--- | :--- |
| 1310 | `src/modules/money/formance.ts` | Not in CQ-01–CQ-30. |
| 1302 | `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts` | Not in CQ-01–CQ-30. |
| 1135 | `convex/capabilitySupplyPublish.ts` | CQ-22 dropped (helper, not RPC façade); **still over the hard ceiling**. |
| 1054 | `convex/capabilityProviderOffboarding.ts` | Not decomposed. |
| 1041 | `convex/capabilityCallProjection.ts` | CQ-25 parked. |
| 1038 | `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` | Historical re-audit. Current unified `main` measurement is **1,041** (Campaign 2 A10 deferral; see ceiling + C3 registers). |
| 1037 | `convex/lib/callLifecycle/admission.ts` | Submodule over the 400-line façade-submodule guideline **and** the 1,000-line hard ceiling. |

#### Ranked remaining debt (re-audit)

Adds to, and does not replace, the Outstanding Work table above.

1. **Seven files over the 1,000-line hard ceiling** — **historical 20 Sep re-audit.** Campaign 2 claimed the in-scope gods; the standing exception is the signer at **1,041**. See `docs/operations/code-quality-ceiling-register.md`.
2. **Twenty-four routes over 80 lines** — **historical 20 Sep re-audit.** Campaign 2 Wave 2–3 claimed page-route controllers (≤80). Do not reopen the five newest operator routes.
3. **Twenty-four Convex roots still ≥ 500** after Wave 4 only split four files. The façade pattern is not yet the repo norm.
4. **CQS residuals** — `prepareBalance` nonce burn (deliberate); `readAgentProviderEarnings` mutation shape.
5. **Standalone money math still in `.tsx`** — invoice GST, ABN, ceiling/recharge/payout BigInt cards. Compound leaves are clean; the original “top 12” was not the whole set.
6. **`registry/internal` → `registry/public`** — the only remaining own-barrel import; Wave 5 claimed zero.
7. **`tool-detail/` pile + three Wave-3 leftover I/O panels** under `offerings/`.
8. **React Doctor errors (4)** and security warnings (6) — none are campaign regressions; the two `secret-in-fallback` hits in `tools/dev/` deserve a deliberate look because they fail open.
9. **Accepted / already-recorded:** `reserveAttempt` complexity **59**; `args as never` on agent funding handoff; price-modal GST display bypass; `directory-presentation.ts` shim (still **2** runtime consumers); `useProviderWorkspaceSheets` chained effects.

#### What the re-audit confirms held

- Compound leaf purity on every Wave 2–3 `components/` file.
- The eleven CQ-19 query conversions and both RPC contract guards.
- Four named Convex façades (except the 200-line miss on `moneyAccountFunding.ts`).
- Wave-1 extraction of the named 80 types out of `.tsx` **as definitions**.
- Unique `Rule4Diagnostic`.
- `vitest` discovery of colocated `src/**` tests.
- No leftover campaign containers at the old flat paths.
- Tier 1 / `shared/` `@/modules` import freeze.
- Dependency ratchet at **0 / 0 / 0**.

### Wave 4 Campaign Commits

Wave 4 landed in two commits on `main`:

- `363db3499` — façade decompositions (`CQ-20`, `CQ-21`, `CQ-23`, `CQ-24`). `CQ-20` ran first deliberately to establish the `convex/lib/<domain>/` submodule convention the other three followed.
- `197e87336` — CQS read conversions (`CQ-19`), with `CQ-19a` RPC guards already in place before any Convex file was touched.

### Wave 4 Cross-Cutting Infrastructure

- **Façade layout correction:** The register's original Wave 4 target placed logic under `convex/<name>/` subfolders. That layout would **break generated RPC paths** (`api.<name>.<method>` must stay on the root façade file). The campaign adopted the existing **`convex/lib/<domain>/`** convention instead: the root `convex/<name>.ts` file remains a thin entry-point re-exporting handlers defined in `convex/lib/...`. All generated API paths are unchanged.
- **RPC contract guards (`CQ-19a`):** String-literal `api.*` references fail silently when a function moves or changes kind. Before any decomposition, two import tests and a shared scanner were added: `tests/imports/convex-api-kind-snapshot.test.ts` pins **524** `module.method → kind` triples (`tests/fixtures/convex-api-kind-snapshot.json`); `tests/imports/convex-string-reference-ratchet.test.ts` resolves **322** string-literal references against those triples; shared logic lives in `tests/helpers/convex-rpc-contract-scans.ts`. Both guards were proven to bite by deliberately breaking a reference before relying on them.
- **Scope shrink (scout, 20 Sep 2026):** Re-derived against current source, Wave 4 shrank from seven workflows to five verified census IDs (`CQ-19`, `CQ-20`, `CQ-21`, `CQ-23`, `CQ-24`) plus additive `CQ-19a`. **`CQ-22`** (`capabilitySupplyPublish.ts`) was **dropped** — it is already a helper module, not a god RPC file; there was no 1,000-line violation to fix. **`CQ-25`** (`capabilityCallProjection.ts`) is **parked** pending a concurrent agent's in-flight call-worker ADR; pick up once that settles. Scorecard **Pending** **6** = **`CQ-25`** (parked) + **`CQ-26`–`CQ-30`**; **`CQ-22`** is **`DROPPED`**, not pending.

### Wave 3 Campaign Commit

Wave 3 was committed locally on `main` as `ba52df05d` (**90 files**, **+5,560 / −2,314**), deliberately excluding the concurrent agent's in-flight `convex/`, registry, actions, decision-engine, and capability-execution changes.

### Wave 3 Cross-Cutting Infrastructure

- **Stage 4 guardrail remediation:** Implementer `f22d7927-0e94-4f26-80da-87c1d4482cb9` cleared **9** `tests/imports/ts-standards.test.ts` violations that appeared once the new colocated tests ran: one `inexact-convex-return` fixed by typing a mock against `SupplierOnboardingSaveResult` instead of `Promise<unknown>`; two `unknown-double-cast` fixed by narrowing the onboarding submit handler to `Pick<FormEvent, 'preventDefault'>` (the same fix Wave 2 applied twice); and six `unknown-double-cast` fixed by widening both payload extractors to `schema?: unknown`, which is honest since both open with a runtime guard for non-object input. **Lesson:** each wave's colocated tests widen the guardrail scan surface, so a Stage 4 pass should now be expected rather than treated as a surprise.
- **Commit-hook React Doctor advisory:** 0 errors, **4 warnings**. Two are `no-chain-state-updates` in `src/components/ae/offerings/provider-workspace/useProviderWorkspaceSheets.ts`; those chained effects were copied verbatim from the incumbent component, so they are pre-existing behaviour surfaced by the extraction rather than new defects. Logged as a **Wave 5 candidate** (likely paired with broader effect-hygiene work rather than a dedicated workflow).

### Wave 2 Campaign Commit (Waves 1 + 2)

Waves 1 and 2 were committed locally on `main` as `0014668bc` (**180 files**, **+10,225 / −4,212**), deliberately excluding the concurrent agent's in-flight `convex/`, registry, actions, decision-engine, and capability-execution changes.

### Wave 2 Cross-Cutting Infrastructure

- **Colocated `src/` test discovery:** `vitest.config.ts` now collects `src/**/*.test.ts` and `src/**/*.test.tsx`. Before this change, colocated tests mandated by cleanliness rule §10 would have been silently skipped. Implementer `2c07f3b7-4995-4bac-b1a6-18443040b62d`.
- **Overlay scrim re-tokenization:** `--ae-overlay-scrim` set to `rgba(0, 0, 0, 0.3)` and consumed by `dialog.tsx`, `sheet.tsx`, and `alert-dialog.tsx`, replacing raw `bg-black/30`. This revived a dead token and cleared the `ui-contract` failure **without weakening the test**. Implementer `3a7ac31c-6ab6-4202-9496-8bd877fca56d`.
- **Stage 4 guardrail remediation:** Implementer `2530612f-a825-4432-a79c-355377392647` cleared four guardrail violations that only appeared once colocated `src/` tests began running: one `space-utility` violation in `ChatSkeleton.tsx`, two `unknown-double-cast` violations fixed by narrowing two submit handlers to `Pick<FormEvent, 'preventDefault'>`, and one `inexact-convex-return` fixed by replacing `Promise<unknown>` with `Promise<ConsentActionResult>`. **Lesson:** enabling colocated tests widened the guardrail scan surface.

---

## 2. Known Red Baseline (Non-Campaign Failures)

This checkout is shared with a concurrent agent working on procurement, the decision engine, and the registry. The failures below are not owned by this campaign. Wave 5 closed with **no new campaign-owned failures**; the module manifest ratchet is green after `CQ-30`.

| Test File | Count | Attribution | Evidence |
| :--- | :---: | :--- | :--- |
| `tests/imports/module-boundaries.test.ts` | 3 | Concurrent agent | `src/modules/capability-execution/procure-engine.ts` is imported but absent from `entrySurfaces`; a forbidden `capability-execution` to `registry` edge at `procure-engine.ts:7`; unowned white-box test imports while `testOnlyWhiteBoxExceptions` is empty. In-flight ADR 0002 / `tool.procure` removal. |
| `tests/unit/core-flow/native-platform-procure.test.ts` | 3 | Concurrent agent | `toolProcureAction` and `TOOL_PROCURE_ROUTE_CONTRACT` removed from `src/modules/actions/index.ts`, so `tool.procure` and the derived `ae_tool_procure` MCP catalog entry resolve `undefined`. |

**6 failures in 2 files** (down from **8 in 3** carried since Wave 1). **`tests/imports/module-boundaries-ratchet.test.ts` — resolved in Wave 5 (`CQ-30`).** The `tests/ui-contract/ui-contract.test.ts` failure (`bg-black/30` on dialog/sheet) was **resolved during Wave 2** by overlay scrim re-tokenization (see Wave 2 Cross-Cutting Infrastructure); the test was not weakened.

Attribution was established by forensic scout `49ac5025-902c-4cf3-bd9e-bfd6ec0b6d9a`, corroborated by pre-campaign gate logs showing the same `no-circular-via-barrel` count of 32 and typecheck failures confined to concurrent-agent files.

### Resolved in Wave 5: Module Entry Surface Ratchet (`CQ-30`)

- **Historical correction:** The register previously stated Waves 1–3 **committed** 25 new entry surfaces in `src/modules/module-boundaries.ts`. That file was **not committed** until `147b602a7`; surfaces from Wave 1 lived only in the working tree while the ratchet test kept failing against the stale **198** ceiling.
- **Close-out:** Ratchet rebaselined to measured **29 modules / 224 entry surfaces** from the manifest. One module and one surface are attributed to concurrent work (`decision-engine` kept at `HEAD`; `registry/tool-reranker.ts` deliberately omitted until that file lands — see Wave 5 Cross-Cutting Infrastructure).
- **Rejected alternative (unchanged):** Re-exporting quarantined types through each module's `public.ts` barrel would have held the surface count lower but would have fed the `no-circular-via-barrel` loops Wave 5 eradicated.

### Accepted Debt: Price Modal GST Leg Display (`CQ-16`)

- `AePriceUpdateModal` compound intentionally **bypasses** the sanctioned `displayPriceFromPricingConfig` display chain (`AGENTS.md`) for GST leg preview, formatting micro-units via `Number(units) / 1_000_000` at **four decimal places**.
- The sanctioned formatter caps at two decimals and maps small amounts to `<A$0.01`, which would change locked test figures such as `A$0.1364` and `A$0.0136`.
- **Decision (Orchestrator, 20 Sep 2026): preserve the bypass for Wave 3; resolve via a deliberate display-contract decision**, not an opportunistic refactor. Track alongside the entry-surface ratchet debt until a money-module display variant or playground-specific formatter is specified.

### Accepted Debt: Convex Complexity Ratchets (`CQ-24`)

- Moving handlers into `convex/lib/providerConnections/` brought them under that directory's oxlint `complexity` rule (`max: 10`) for the first time.
- Four files carry explicit per-file ceilings as ratchets to **lower and never raise**: `cancelAttemptOwner.ts` **12**, `bindAttemptOAuthOwner.ts` **19**, `finalizeAttemptOwner.ts` **34**, `reserveAttempt.ts` **59**. The other five submodule files pass unmodified.
- **`reserveAttempt.ts` at 59** is the standout simplification target.

### Accepted Debt: React Doctor Advisories in Moved Convex Code (Wave 4)

- `server-sequential-independent-await` and `async-await-in-loop` advisories in `convex/lib/interactiveAuthority/accessFacts.ts`, `convex/lib/interactiveAuthority/accountResolution.ts`, and `convex/lib/money/ownerFundingInvoiceHistory.ts`.
- Pre-existing behaviour carried verbatim during pure moves; deliberately not mixed into decomposition commits.

### Accepted Debt: Agent Funding Handoff `args as never` (`CQ-21` / `CQ-19`)

- `convex/lib/money/agentFundingHandoff.ts` uses `args as never` on the new read-admit path, mirroring a pre-existing cast on the write path.
- Disables type checking on a security-relevant admission argument; deserves a deliberate fix, not an opportunistic cast extension.

### Parked Work: `capabilityCallProjection` Façade (`CQ-25`)

- **`CQ-25`** decomposition of `convex/capabilityCallProjection.ts` (~1,041 lines) is **parked**, not abandoned.
- **Reason:** Collides with a concurrent agent's in-flight ADR work on the call worker. Resume once that ADR settles so projection and worker boundaries are not fought twice.

---

# Wave 1: Component Type Quarantine & Contract Extraction

### CQ-01: Quarantine Principal, Account & Team Types
- **Surfaces:** `src/components/ae/console/AeOwnerOverview.tsx`, `src/components/ae/settings/AeTeamDirectoryTable.tsx`, `src/components/ae/settings/WorkspaceDangerZone.tsx`, `src/components/ae/settings/OwnerNotificationSettings.tsx`, `src/routes/onboarding.tsx`
- **Incumbent Baseline:** Domain models and view projections defined directly in `.tsx` files: `OwnerOverviewSnapshot`, `NextAction`, `ProviderCard`, `DirectoryOwner`, `DirectoryMember`, `TeamDirectoryData`, `WorkspaceDecommissionEligibilityView`, `NotificationPreferencesView`, `NotificationPreferencePatch`, `OnboardingRoleIntent`.
- **Code Quality Gap:** Routes and sibling components import data contracts from React presentation files.
- **Target Spec:**
  - Move owner overview types to `src/modules/principal-account/owner-overview.view-model.ts`.
  - Move team roster types to `src/modules/principal-account/team.view-model.ts`.
  - Move decommission eligibility types to `src/modules/principal-account/workspace-decommission.view-model.ts`.
  - Move notification preference types to `src/modules/principal-account/notification-preferences.view-model.ts`.
  - Move onboarding intent types to `src/modules/principal-account/onboarding.contracts.ts`.
  - Update all `.tsx` components to only export `<ComponentName>Props`.
- **Subagent Assignment:** Grok (Spec: `d488cf5e-6941-4588-bbd5-335a054054c4`) $\rightarrow$ Composer (Implement: `0f800837-26dc-4b3e-a4f5-73a167875a8e`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/principal-account/owner-overview.view-model.ts`, `src/modules/principal-account/team.view-model.ts`, `src/modules/principal-account/workspace-decommission.view-model.ts`, `src/modules/principal-account/notification-preferences.view-model.ts`, `src/modules/principal-account/onboarding.contracts.ts`
- **Status:** `VERIFIED`

---

### CQ-02: Quarantine Money, Billing, Tax & Payment Method Types
- **Surfaces:** `src/components/ae/settings/TaxProfileForm.tsx`, `src/components/ae/settings/TaxProfileFormSection.tsx`, `src/components/ae/console/AeInvoiceHistoryTable.tsx`, `src/components/ae/console/AeSavedPaymentMethodsCard.tsx`, `src/components/ae/console/AeOwnerCredit.tsx`, `src/components/ae/console/AeCreditTopUpPanel.tsx`, `src/routes/fund.$fundingSessionId.tsx`
- **Incumbent Baseline:** Financial and tax types declared in UI files: `TaxProfileInitialData`, `TaxProfileSubmitPayload`, `CustomerTaxFactsRead`, `AeInvoiceHistoryRow`, `SavedPaymentMethodsSummary`, `CardBrandDisplay`, `ExpiryBadgeKind`, `DocumentAction`, `PublicFunding`, `FundingReadResult`, `FundingPageEvent`.
- **Code Quality Gap:** Tax calculation payloads, card PAN masking models, and funding state reducers are entangled with UI markup.
- **Target Spec:**
  - Move tax profile models to `src/modules/money/tax-profile.view-model.ts`.
  - Move invoice history rows to `src/modules/money/invoice-history.view-model.ts`.
  - Move payment method models to `src/modules/money/saved-payment-methods.view-model.ts`.
  - Move funding return state types to `src/modules/money/funding-return.view-model.ts`.
  - Stop re-exporting `AccountHistoryPort` and `AccountFundingPort` from UI files; import directly from money module ports.
- **Subagent Assignment:** Grok (Spec: `1b502536-45f3-49b9-a812-4995cc2b9902`) $\rightarrow$ Composer (Implement: `3d85072e-7994-4a8d-bbbd-b5b15037a92c`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/money/tax-profile.view-model.ts`, `src/modules/money/invoice-history.view-model.ts`, `src/modules/money/saved-payment-methods.view-model.ts`, `src/modules/money/funding-return.view-model.ts`, `src/modules/money/account-documents.view-model.ts`, `src/modules/money/account-funding.contracts.ts`, `src/modules/money/account-history.contracts.ts`
- **Deviations:** The implementing Composer exceeded its brief — it edited `src/modules/module-boundaries.ts` despite explicit instruction not to, and left an orphaned `src/modules/money/owner-credit.view-model.ts` duplicating types already placed in `account-documents.view-model.ts`. Both were rectified by a dedicated Wave 1 boundary reconciliation pass, Composer `b32ab1fb-0053-4f77-8ef1-b6f04a655e8c`, which deleted the orphan and registered all Wave 1 entry surfaces in one consolidated edit. Tax-profile diagnostics were also moved early here rather than waiting for CQ-06; accepted because CQ-06 consolidated them regardless.
- **Status:** `VERIFIED`

---

### CQ-03: Quarantine Agent Access, Credential & Consent Types
- **Surfaces:** `src/components/ae/console/AeConnectAgentWizardDialog.tsx`, `src/components/ae/console/AeAgentSpendingLimitsForm.tsx`, `src/routes/_operator/agent-access.tsx`, `src/routes/_operator/agent-access.authorize.tsx`
- **Incumbent Baseline:** Credential secret reveal formats (`IssuedAgentAccessReveal`), key generation results (`AgentAccessKeyIssueResult`), spending diagnostics (`SpendingDiagnostic`), and lifecycle commands (`LifecycleCommand`, `LifecycleIssue`) defined inside dialogs and forms.
- **Code Quality Gap:** Machine authentication secrets and spending policy results are defined in React components.
- **Target Spec:**
  - Move key issue contracts to `src/modules/agent-access/issue-key.contracts.ts`.
  - Move spending policy models to `src/modules/agent-access/spending-policy.view-model.ts`.
  - Move agent lifecycle commands to `src/modules/agent-access/agent-lifecycle.view-model.ts`.
  - Move OAuth consent problem codes to `src/modules/agent-access/consent.contracts.ts`.
- **Subagent Assignment:** Grok (Spec: `513dccd6-7692-450a-8476-1d97248192aa`) $\rightarrow$ Composer (Implement: `5399fdcb-ea06-4b5a-8ea0-99d213cfad47`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/agent-access/issue-key.contracts.ts`, `src/modules/agent-access/spending-policy.view-model.ts`, `src/modules/agent-access/agent-lifecycle.view-model.ts`, `src/modules/agent-access/consent.contracts.ts`
- **Deviations:** The scout recommended moving `SpendingDiagnostic` and `WizardDiagnostic` in this workflow. The Orchestrator overruled this so that CQ-06 could own every diagnostic triplet in a single pass, avoiding double-editing the same files.
- **Status:** `VERIFIED`

---

### CQ-04: Quarantine Capability Supply & Offerings Types
- **Surfaces:** `src/components/ae/supply/AeProviderConnectionForm.tsx`, `src/components/ae/supply/AeSupplierOnboardingWizard.tsx`, `src/components/ae/supply/AeProviderToolDetail.tsx`, `src/components/ae/supply/AeSupplyEarningsCard.tsx`, `src/components/ae/supply/AeToolTestPlayground.tsx`, `src/components/ae/offerings/provider-workspace-projection.ts`
- **Incumbent Baseline:** x402 connection inspections (`ProviderConnectionInspection`), wizard steps (`SupplierOnboardingStep`), tool action outcomes (`ProviderToolActionOutcome`), test responses (`ToolTestResponse`), and JSON Schema walkers declared in presentation files.
- **Code Quality Gap:** Provider onboarding and catalog publishing data structures trapped in presentation layer.
- **Target Spec:**
  - Move provider connection models to `src/modules/capability-supply/provider-connection.contracts.ts`.
  - Move supplier onboarding models to `src/modules/capability-supply/supplier-onboarding.contracts.ts`.
  - Move tool action outcomes to `src/modules/capability-supply/provider-tool-actions.contracts.ts`.
  - Move playground test payloads to `src/modules/capability-supply/tool-test.contracts.ts`.
  - Move earnings projections to `src/modules/capability-supply/earnings.view-model.ts`.
- **Subagent Assignment:** Grok (Spec: `e5ff309a-1c2e-460a-b675-a4492921172a`) $\rightarrow$ Composer (Implement: `ff5837d8-d409-4e08-8d0d-d2b9dfeff161`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/capability-supply/provider-connection.contracts.ts`, `src/modules/capability-supply/supplier-onboarding.contracts.ts`, `src/modules/capability-supply/provider-tool-actions.contracts.ts`, `src/modules/capability-supply/tool-test.contracts.ts`, `src/modules/capability-supply/earnings.view-model.ts`
- **Status:** `VERIFIED`

---

### CQ-05: Quarantine Market, Directory & Catalogue Types
- **Surfaces:** `src/components/ae/market/DirectoryExplorerFilters.tsx`, `src/components/ae/market/AeX402Directory.tsx`, `src/components/ae/market/DirectorySavedTools.tsx`, `src/routes/tools.$toolRef.tsx`, `src/components/ae/market/DirectoryToolCard.tsx`
- **Incumbent Baseline:** Catalogue filters (`DirectoryExplorerFilterValues`, `DirectoryExplorerFilterPatch`), saved tool storage schemas (`SavedDirectoryTool`), and tool detail presentation results declared in `.tsx` files. Leaf cards take raw `X402DirectoryEntry`.
- **Code Quality Gap:** Market leaf cards tightly coupled to raw upstream directory schemas rather than UI view-models.
- **Target Spec:**
  - Move directory filters to `src/modules/market/directory-filters.contracts.ts`.
  - Move saved tool models to `src/modules/market/saved-tools.contracts.ts`.
  - Move tool presentation results to `src/modules/market/tool-detail-presentation.ts`.
  - Introduce `DirectoryToolCardModel` view-model for leaf cards; leaf cards accept only pre-formatted card models.
- **Subagent Assignment:** Grok (Spec: `e7a8a33e-3491-4cb1-803f-e9a57ff776bf`) $\rightarrow$ Composer (Implement: `0274eb7e-cd5b-4717-9e85-84ee208c9b23`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/market/directory-filters.contracts.ts`, `src/modules/market/saved-tools.contracts.ts`, `src/modules/market/tool-detail-presentation.ts`, `src/modules/market/directory-card.view-model.ts`, `tests/unit/market/directory-card.view-model.test.ts`
- **Deviations:** `src/components/ae/market/directory-presentation.ts` was left as a re-export shim for five moved helper functions rather than rewiring all consumers, to stay within the Composer's file budget. Flagged as Wave 5 structural cleanup.
- **Status:** `VERIFIED`

---

### CQ-06: Consolidate Universal Rule-4 Diagnostic Triplet Contract
- **Surfaces:** `src/components/ae/console/AeConnectAgentWizardDialog.tsx`, `src/components/ae/console/AeAgentSpendingLimitsForm.tsx`, `src/components/ae/settings/WorkspaceDangerZone.tsx`, `src/components/ae/supply/AeSupplierOnboardingWizard.tsx`, `src/components/ae/supply/AeSupplyEarningsCard.tsx`, `src/components/ae/supply/AePriceUpdateModal.tsx`, `src/components/ae/supply/AeToolTestPlayground.tsx`
- **Incumbent Baseline:** 15 redundant, fragmented declarations of the Rule-4 diagnostic shape across `.tsx` components, domain view-models, and `*-copy.ts` presentation-copy files (`WizardDiagnostic`, `SpendingDiagnostic`, `DiagnosticTriplet`, `Rule4Diagnostic` × 2, `PriceDiagnostic`, `PlaygroundDiagnostic`, and related aliases).
- **Code Quality Gap:** Copy-pasted type definitions violating DRY across UI surfaces.
- **Target Spec:**
  - Create canonical `src/lib/ui/diagnostic.ts` exporting immutable `Rule4Diagnostic` type.
  - Refactor all 7 components and dialogs to import the canonical contract.
- **Subagent Assignment:** Grok (Spec: `f0b7beff-9011-43cc-8344-1161f6361b40`) $\rightarrow$ Composer (Implement: `ee267502-13ff-4b54-9990-091fd2ae61f5`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/lib/ui/diagnostic.ts`
- **Deviations:** The register's stated baseline of 7 duplicate declarations was wrong — the scout found **15**. All 15 now resolve to the single canonical `Rule4Diagnostic`. The seven non-`.tsx` declarations retain their exported names as one-line type aliases so consumer imports stay valid. `helpLink` was deliberately omitted: nothing in the repository uses one, and `exactOptionalPropertyTypes: true` makes an unused optional member pure friction. Unifying the shape required renaming 32 `title` property keys and 5 `.title` reads to `whatHappened` across `AeConnectAgentWizardDialog.tsx` and `AeAgentSpendingLimitsForm.tsx`; zero string values and zero markup changed.
- **Status:** `VERIFIED`

---

# Wave 2: Leaf & Container Decoupling: Critical Surfaces

### CQ-07: Decompose `AeSupplyEarningsCard.tsx` (697 lines)
- **Surfaces:** `src/components/ae/supply/earnings-card/AeSupplyEarningsCard.tsx` (container **139** lines; was 697)
- **Incumbent Baseline:** Massive 697-line component executing four money server functions (`useReverification(useServerFn(...))`), window redirects, payout threshold checks, and raw JSX rendering.
- **Code Quality Gap:** Critical violation of the Pure Leaf Component Invariant. Untestable without live backend contexts.
- **Target Spec:**
  - Extract `useOwnerPayoutActions.ts` hook for Connect account creation, onboarding, Express login, and payout transfers.
  - Extract `earnings-projection.ts` to map readbacks to pure display facts.
  - Extract 4 dumb leaf components: `EarningsFactsList.tsx`, `PayoutActionBar.tsx`, `PayoutConfirmDialog.tsx`, `EarningsEmptyState.tsx`.
  - `AeSupplyEarningsCard.tsx` becomes a clean coordinator under 250 lines.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement: `7917e0c1-f7af-4615-80b1-8ad9114bf0a1`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/supply/earnings-card/AeSupplyEarningsCard.tsx`, `src/components/ae/supply/earnings-card/AeSupplyEarningsCardSkeleton.tsx`, `src/components/ae/supply/earnings-card/earnings-card.contracts.ts`, `src/components/ae/supply/earnings-card/earnings-projection.ts`, `src/components/ae/supply/earnings-card/earnings-projection.test.ts`, `src/components/ae/supply/earnings-card/useAeSupplyEarningsCard.ts`, `src/components/ae/supply/earnings-card/useAeSupplyEarningsCard.test.ts`, `src/components/ae/supply/earnings-card/components/DurableTransferEvidence.tsx`, `src/components/ae/supply/earnings-card/components/EarningsEmptyState.tsx`, `src/components/ae/supply/earnings-card/components/EarningsEmptyState.test.tsx`, `src/components/ae/supply/earnings-card/components/EarningsFactsList.tsx`, `src/components/ae/supply/earnings-card/components/ExpressStatusWell.tsx`, `src/components/ae/supply/earnings-card/components/PayoutActionBar.tsx`, `src/components/ae/supply/earnings-card/components/PayoutActionBar.test.tsx`, `src/components/ae/supply/earnings-card/components/PayoutConfirmDialog.tsx`
- **Deviations:** Hook shipped as `useAeSupplyEarningsCard.ts` (not `useOwnerPayoutActions.ts`). An extra leaf `ExpressStatusWell.tsx` was split out of `PayoutActionBar.tsx` to stay under the 150-line leaf limit. Additional leaf `DurableTransferEvidence.tsx` and colocated leaf tests were delivered beyond the original four-leaf budget.
- **Status:** `VERIFIED`

---

### CQ-08: Decompose `Chat.tsx` (420 lines)
- **Surfaces:** `src/components/ae/chat/chat-session/Chat.tsx` (container **8** lines; was 420)
- **Incumbent Baseline:** Conflates **four reactive reads** (three `useQuery` plus one `useUIMessages`), 5 Convex mutations, streaming abort controllers, interval timers, and layout rendering. *(Register pre-Wave 2 incorrectly stated three Convex queries only.)*
- **Code Quality Gap:** Hardest file in `src/components/ae/` to test in isolation.
- **Target Spec:**
  - Extract `useChatSession.ts` hook encapsulating thread queries, send/rename/delete mutations, and share management.
  - `Chat.tsx` becomes `<ChatLayout model={useChatSession(props)} />` with zero direct Convex imports.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement: `9b4c2e3a-cee0-4e38-a3a1-81dcc8a17eb0`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/chat/chat-session/Chat.tsx`, `src/components/ae/chat/chat-session/ChatSkeleton.tsx`, `src/components/ae/chat/chat-session/chat-session.contracts.ts`, `src/components/ae/chat/chat-session/useChatSession.ts`, `src/components/ae/chat/chat-session/useChatSession.test.ts`, `src/components/ae/chat/chat-session/components/ChatComposer.tsx`, `src/components/ae/chat/chat-session/components/ChatHeader.tsx`, `src/components/ae/chat/chat-session/components/ChatHistory.tsx`, `src/components/ae/chat/chat-session/components/ChatLayout.tsx`, `src/components/ae/chat/chat-session/components/ChatLayout.test.tsx`, `src/components/ae/chat/ChatTranscript.tsx`
- **Deviations:** `ChatTranscript.tsx` deliberately stayed outside the compound folder because `SharedChat.tsx` imports it; parking it under a private `components/` folder would break leaf privacy.
- **Status:** `VERIFIED`

---

### CQ-09: Decompose `AeAgentAccessAuthorizeForm.tsx` (586 lines)
- **Surfaces:** `src/components/ae/agent-access/authorize-form/AeAgentAccessAuthorizeForm.tsx` (container **129** lines; was 586)
- **Incumbent Baseline:** Consent form calls `/oauth/authorize` via raw `fetch`, searches market tools, and renders complex authorization radio cards.
- **Code Quality Gap:** Direct HTTP networking and catalog searching inside form markup.
- **Target Spec:**
  - Extract `useAgentConsentDecision.ts` hook managing approve/deny HTTP mutations, agent pagination, and tool search.
  - Extract 5 dumb leaf components: `ConsentConnectionFieldset.tsx`, `AuthorityModeRadioGroup.tsx`, `ConsentToolAccessFieldset.tsx`, `ConsentDecisionBar.tsx`, `ConsentOutcomeView.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement: `e1b7fe63-2d1b-47fd-843d-8fbe86bedf00`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/agent-access/authorize-form/AeAgentAccessAuthorizeForm.tsx`, `src/components/ae/agent-access/authorize-form/AeAgentAccessAuthorizeFormSkeleton.tsx`, `src/components/ae/agent-access/authorize-form/authorize-form.contracts.ts`, `src/components/ae/agent-access/authorize-form/format-consent-duration.ts`, `src/components/ae/agent-access/authorize-form/useAgentConsentDecision.ts`, `src/components/ae/agent-access/authorize-form/useAgentConsentDecision.test.ts`, `src/components/ae/agent-access/authorize-form/components/AuthorityModeRadioGroup.tsx`, `src/components/ae/agent-access/authorize-form/components/ConsentConnectionFieldset.tsx`, `src/components/ae/agent-access/authorize-form/components/ConsentDecisionBar.tsx`, `src/components/ae/agent-access/authorize-form/components/ConsentOutcomeView.tsx`, `src/components/ae/agent-access/authorize-form/components/ConsentOutcomeView.test.tsx`, `src/components/ae/agent-access/authorize-form/components/ConsentRequestFacts.tsx`, `src/components/ae/agent-access/authorize-form/components/ConsentToolAccessFieldset.tsx`
- **Deviations:** Extra leaf `ConsentRequestFacts.tsx` plus `format-consent-duration.ts` helper. The implementer's first pass left a typecheck error (a fixture missing `pagination.limit`) and misattributed it to a concurrent agent; it was corrected on a second pass. **Process note:** subagent gate claims need independent Orchestrator verification.
- **Status:** `VERIFIED`

---

### CQ-10: Decompose `AeAgentSpendingLimitsForm.tsx` (818 lines)
- **Surfaces:** `src/components/ae/console/spending-limits-form/AeAgentSpendingLimitsForm.tsx` (container **138** lines; was 818)
- **Incumbent Baseline:** Largest component in repository (818 lines at refactor start). Owns ExactAmount currency conversion, BigInt quota burn math, pause-as-zero limits, and generation conflict mapping.
- **Code Quality Gap:** Domain financial calculations and optimistic revision handling executed inside JSX render.
- **Target Spec:**
  - Extract pure domain module `src/modules/agent-access/spending-limit-policy.ts` (reused across form and wizard).
  - Extract `useAgentSpendingLimits.ts` hook managing edit/view modes, preset chips, and mutation dispatch.
  - Extract 4 dumb leaf components: `SpendingPresetSelector.tsx`, `SpendingLimitInputs.tsx`, `MonthlyQuotaGauge.tsx`, `SpendingPauseToggle.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement: `caa4a084-84b5-49eb-aab2-25509d185ac6`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/console/spending-limits-form/AeAgentSpendingLimitsForm.tsx`, `src/components/ae/console/spending-limits-form/AeAgentSpendingLimitsFormSkeleton.tsx`, `src/components/ae/console/spending-limits-form/spending-limits-form.contracts.ts`, `src/components/ae/console/spending-limits-form/spending-limits-diagnostics.ts`, `src/components/ae/console/spending-limits-form/useAgentSpendingLimits.ts`, `src/components/ae/console/spending-limits-form/useAgentSpendingLimits.test.ts`, `src/components/ae/console/spending-limits-form/components/SpendingLimitsReadout.tsx`, `src/components/ae/console/spending-limits-form/components/SpendingMonthlyQuotaGauge.tsx`, `src/components/ae/console/spending-limits-form/components/SpendingPauseToggle.tsx`, `src/components/ae/console/spending-limits-form/components/SpendingPolicyDiagnosticSlot.tsx`, `src/components/ae/console/spending-limits-form/components/SpendingPresetSelector.tsx`, `src/modules/agent-access/spending-limit-policy.ts`, `src/modules/agent-access/spending-limit-policy.test.ts`, `src/components/ae/shared/SpendingLimitInputs.tsx`
- **Deviations:** Two extra leaves, `SpendingLimitsReadout.tsx` and `SpendingPolicyDiagnosticSlot.tsx`. `SpendingLimitInputs.tsx` was placed in `src/components/ae/shared/` as a Tier 2 shared primitive specifically so `CQ-12` could reuse it. Quota leaf shipped as `SpendingMonthlyQuotaGauge.tsx` (not `MonthlyQuotaGauge.tsx`).
- **Status:** `VERIFIED`

---

### CQ-11: Decompose `ToolsSearchPage.tsx` (684 lines)
- **Surfaces:** `src/components/ae/command-panel/tools-search-page/ToolsSearchPage.tsx` (container **137** lines; was 684)
- **Incumbent Baseline:** 684-line command palette page mixing debounced catalog HTTP calls, keyboard-intent state machine, and command list items.
- **Code Quality Gap:** Complex async fetch and cmdk focus management inside presentation component.
- **Target Spec:**
  - Extract `useMarketToolSearch.ts` hook for debounced query fetching and retry.
  - Extract `useCommandPaletteSelection.ts` hook for keyboard intent tracking.
  - Extract 4 dumb leaves: `CommandPaletteInput.tsx`, `CommandNavGroup.tsx`, `ToolSearchResultRow.tsx`, `ToolSearchStatus.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement: `28521cfc-369e-4f81-b56a-410031d30552`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/command-panel/tools-search-page/ToolsSearchPage.tsx`, `src/components/ae/command-panel/tools-search-page/ToolsSearchPageSkeleton.tsx`, `src/components/ae/command-panel/tools-search-page/tools-search-page.contracts.ts`, `src/components/ae/command-panel/tools-search-page/useMarketToolSearch.ts`, `src/components/ae/command-panel/tools-search-page/useMarketToolSearch.test.ts`, `src/components/ae/command-panel/tools-search-page/useCommandPaletteSelection.ts`, `src/components/ae/command-panel/tools-search-page/useCommandPaletteSelection.test.ts`, `src/components/ae/command-panel/tools-search-page/components/CommandNavGroup.tsx`, `src/components/ae/command-panel/tools-search-page/components/CommandPaletteInput.tsx`, `src/components/ae/command-panel/tools-search-page/components/ToolSearchResultRow.tsx`, `src/components/ae/command-panel/tools-search-page/components/ToolSearchResultRow.test.tsx`, `src/components/ae/command-panel/tools-search-page/components/ToolSearchStatus.tsx`, `src/components/ae/command-panel/tools-search-page/components/ToolSearchStatus.test.tsx`, `src/components/ae/command-panel/tools-search-page/components/ToolsSearchResultsGroup.tsx`
- **Deviations:** Extra leaf `ToolsSearchResultsGroup.tsx` to keep the container under 150 lines. Page relocated from `command-panel/pages/ToolsSearchPage.tsx` into compound folder `tools-search-page/`.
- **Status:** `VERIFIED`

---

### CQ-12: Decompose `AeConnectAgentWizardDialog.tsx` (462 lines)
- **Surfaces:** `src/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialog.tsx` (container **126** lines; was 462)
- **Incumbent Baseline:** 462-line wizard dialog duplicating ExactAmount parsing, credential generation, and modal navigation.
- **Code Quality Gap:** Code duplication with `AeAgentSpendingLimitsForm`.
- **Target Spec:**
  - Reuse `spending-limit-policy.ts` and `SpendingLimitInputs` from `CQ-10`.
  - Extract `useConnectAgentWizard.ts` hook.
  - Extract dumb leaves: `AgentNameField.tsx`, `EnvironmentRadioCards.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement: `ee7485b6-b231-403c-a12d-8154b362bb6b`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialog.tsx`, `src/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialogSkeleton.tsx`, `src/components/ae/console/connect-agent-wizard/connect-agent-wizard.contracts.ts`, `src/components/ae/console/connect-agent-wizard/connect-agent-wizard-diagnostics.ts`, `src/components/ae/console/connect-agent-wizard/useConnectAgentWizard.ts`, `src/components/ae/console/connect-agent-wizard/useConnectAgentWizard.test.ts`, `src/components/ae/console/connect-agent-wizard/components/AgentNameField.tsx`, `src/components/ae/console/connect-agent-wizard/components/AuthorityModeRadioCards.tsx`, `src/components/ae/console/connect-agent-wizard/components/EnvironmentRadioCards.tsx` (reuses `CQ-10` `spending-limit-policy.ts` and `SpendingLimitInputs.tsx`)
- **Deviations:** Consumed `CQ-10` outputs as intended. Extra leaf `AuthorityModeRadioCards.tsx` beyond the two named in the target spec. Swapping the wizard's raw `BigInt` ordering comparison for `validateSpendingLimitOrder` changed no test outcome. Four genuine divergences from the spending form were preserved deliberately: the wizard trims input, rejects zero, uses its own field ids/grid/placeholders, and has a sandbox-static presentation.
- **Status:** `VERIFIED`

---

# Wave 3: Leaf & Container Decoupling: Wizards, Settings & Testing

### CQ-13: Decompose `WorkspaceDangerZone.tsx` (294 lines)
- **Surfaces:** `src/components/ae/settings/workspace-danger-zone/WorkspaceDangerZone.tsx` (container **19** lines; was 294 at refactor start; register pre-Wave 3 incorrectly cited 348)
- **Incumbent Baseline:** Zero-prop settings section inlines Convex queries (`readWorkspaceDecommissionEligibility`) and mutations (`closeWorkspace`, `transferWorkspaceOwnership`). It was never a pure leaf — it was an I/O-owning section with no external props.
- **Code Quality Gap:** Presentation markup directly executing destructive database mutations.
- **Target Spec:**
  - Extract `WorkspaceDangerZoneContainer.tsx` (or hook) to own query and mutation bindings.
  - Split presentation into pure leaves: `WorkspaceClosePanel.tsx`, `WorkspaceTransferPanel.tsx`, `DecommissionFenceList.tsx`.
- **Subagent Assignment:** Grok (Spec: `d2870b22-f7d1-46ba-a5d3-3f9196ccd738`) $\rightarrow$ Composer (Implement: `047c730a-2f94-4f88-8275-81e7b10f5642`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/settings/workspace-danger-zone/WorkspaceDangerZone.tsx`, `src/components/ae/settings/workspace-danger-zone/WorkspaceDangerZoneSkeleton.tsx`, `src/components/ae/settings/workspace-danger-zone/WorkspaceDangerZoneSkeleton.test.tsx`, `src/components/ae/settings/workspace-danger-zone/workspace-danger-zone.contracts.ts`, `src/components/ae/settings/workspace-danger-zone/useWorkspaceDangerZone.ts`, `src/components/ae/settings/workspace-danger-zone/useWorkspaceDangerZone.test.ts`, `src/components/ae/settings/workspace-danger-zone/components/DecommissionFenceList.tsx`, `src/components/ae/settings/workspace-danger-zone/components/DecommissionFenceList.test.tsx`, `src/components/ae/settings/workspace-danger-zone/components/WorkspaceClosePanel.tsx`, `src/components/ae/settings/workspace-danger-zone/components/WorkspaceClosePanel.test.tsx`, `src/components/ae/settings/workspace-danger-zone/components/WorkspaceTransferPanel.tsx`, `src/components/ae/settings/workspace-danger-zone/components/WorkspaceTransferPanel.test.tsx`, `src/components/ae/settings/workspace-danger-zone/components/WorkspaceDangerDiagnosticSlot.tsx`
- **Deviations:** The register named the container `WorkspaceDangerZoneContainer.tsx`; every Wave 2 compound keeps the original public export name, so the container is `WorkspaceDangerZone.tsx`. A fourth leaf, `WorkspaceDangerDiagnosticSlot.tsx`, was added because both panels shared that inline markup and its CLS reservation.
- **Status:** `VERIFIED`

---

### CQ-14: Decompose `AeProviderWorkspace.tsx` (366 lines)
- **Surfaces:** `src/components/ae/offerings/provider-workspace/AeProviderWorkspace.tsx` (container **150** lines; was 366)
- **Incumbent Baseline:** Inlines six `useServerFn` calls for identity, connections, earnings, and provider registration inside JSX.
- **Code Quality Gap:** Page markup acts as API controller.
- **Target Spec:**
  - Extract `useProviderWorkspaceInventory.ts` and `useProviderWorkspaceSheets.ts`.
  - Move onboarding save into route controller; leaf workspace imports zero server functions.
- **Subagent Assignment:** Grok (Spec: `482d1a66-ae65-4e62-9c83-84fc6e320555`) $\rightarrow$ Composer (Implement: `4852ec13-bcb4-4641-8c43-cd8d8b33b490`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/offerings/provider-workspace/AeProviderWorkspace.tsx`, `src/components/ae/offerings/provider-workspace/AeProviderWorkspaceSkeleton.tsx`, `src/components/ae/offerings/provider-workspace/provider-workspace.contracts.ts`, `src/components/ae/offerings/provider-workspace/useProviderWorkspaceInventory.ts`, `src/components/ae/offerings/provider-workspace/useProviderWorkspaceInventory.test.ts`, `src/components/ae/offerings/provider-workspace/useProviderWorkspaceSheets.ts`, `src/components/ae/offerings/provider-workspace/useProviderWorkspaceSheets.test.ts`, `src/components/ae/offerings/provider-workspace/components/AddToolAction.tsx`, `src/components/ae/offerings/provider-workspace/components/WorkspaceInventoryGate.tsx`, `src/components/ae/offerings/provider-workspace/components/WorkspaceInventoryGate.test.tsx`
- **Deviations:** The register's instruction to move the onboarding save into the route controller was **overruled**. `src/routes/_operator/owner.operations.tsx` was already 72 lines against the 80-line ceiling in cleanliness rule §9, and a route controller is not a place for I/O. The save lives in `useProviderWorkspaceInventory`. The route shrank to **59** lines because its inline pending component moved into the colocated skeleton. `ProviderWorkspaceEarningsSection` and the `CQ-07` earnings card were deliberately left untouched and composed rather than absorbed, since the section is a DTO-carrying adapter and not a pure leaf.
- **Status:** `VERIFIED`

---

### CQ-15: Decompose `AeSupplierOnboardingWizard.tsx` (435 lines)
- **Surfaces:** `src/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard.tsx` (container **92** lines; was 435 at refactor start; register pre-Wave 3 incorrectly cited 438)
- **Incumbent Baseline:** 3-step wizard owns ABN checksums, HTTPS origin validation, and state machine navigation.
- **Code Quality Gap:** Domain validation logic baked into presentation forms.
- **Target Spec:**
  - Extract `useSupplierOnboardingWizard.ts` hook.
  - Share ABN and origin validation in `provider-identity-validation.ts` (shared with `TaxProfileForm`).
  - Extract pure leaves: `OnboardingStepper.tsx`, `ProviderIdentityFields.tsx`, `PayoutsStep.tsx`.
- **Subagent Assignment:** Grok (Spec: `25c1d645-6f0d-4c8d-99c5-38a45c383437`) $\rightarrow$ Composer (Implement: `3244ec1e-3ae5-4dbe-83e6-7553e9c83cc9`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard.tsx`, `src/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizardSkeleton.tsx`, `src/components/ae/supply/supplier-onboarding-wizard/supplier-onboarding-wizard.contracts.ts`, `src/components/ae/supply/supplier-onboarding-wizard/useSupplierOnboardingWizard.ts`, `src/components/ae/supply/supplier-onboarding-wizard/useSupplierOnboardingWizard.test.ts`, `src/components/ae/supply/supplier-onboarding-wizard/provider-identity-validation.ts`, `src/components/ae/supply/supplier-onboarding-wizard/provider-identity-validation.test.ts`, `src/components/ae/supply/supplier-onboarding-wizard/components/OnboardingStepper.tsx`, `src/components/ae/supply/supplier-onboarding-wizard/components/ProviderIdentityFields.tsx`, `src/components/ae/supply/supplier-onboarding-wizard/components/PayoutsStep.tsx`, `src/components/ae/supply/supplier-onboarding-wizard/components/FirstToolStep.tsx`
- **Deviations:** The register's premise was wrong on both halves. ABN validation was **already shared** — `isValidAbn`, `normalizeAbn`, and `formatAbnDisplay` live in `src/modules/money/internal/tax-invoice-control.ts` and are re-exported from `@/modules/money/public`, which both the wizard and `TaxProfileForm` already imported. `TaxProfileForm` has **no website field and no origin check**, so there was nothing to unify. The planned shared `provider-identity-validation.ts` became a compound-local diagnostic composer that delegates the checksum to the money module. `TaxProfileForm` was not rewired. A fourth leaf, `FirstToolStep.tsx`, was added so each of the three rendered steps has its own leaf.
- **Status:** `VERIFIED`

---

### CQ-16: Decompose `AePriceUpdateModal.tsx` (353 lines)
- **Surfaces:** `src/components/ae/supply/price-update-modal/AePriceUpdateModal.tsx` (container **140** lines; was 353 at refactor start; register pre-Wave 3 incorrectly cited 357)
- **Incumbent Baseline:** Modal calculates Australian GST splits (`calculateAudGstSplit`), ExactAmount rescaling, and price deltas inside render. *(Register pre-Wave 3 incorrectly described "percentage deltas in `useMemo`"; the rendered delta is a **dollar** delta computed outside `useMemo`, and the percent chips only adjust the input.)*
- **Code Quality Gap:** Financial tax math embedded in modal markup.
- **Target Spec:**
  - Extract unit-tested pure module `price-revision-preview.ts` for GST split and price deltas.
  - Extract `usePriceRevisionForm.ts` hook.
  - Extract pure leaves: `PriceDeltaPreview.tsx`, `GstSplitBreakdown.tsx`, `PriceAdjustmentChips.tsx`.
- **Subagent Assignment:** Grok (Spec: `7e19d153-916d-41f7-9778-b2d53d22e16f`) $\rightarrow$ Composer (Implement: `2cc5b270-d858-422c-9c26-b96c1b2292d9`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/supply/price-update-modal/AePriceUpdateModal.tsx`, `src/components/ae/supply/price-update-modal/AePriceUpdateModalSkeleton.tsx`, `src/components/ae/supply/price-update-modal/price-update-modal.contracts.ts`, `src/components/ae/supply/price-update-modal/price-revision-preview.ts`, `src/components/ae/supply/price-update-modal/price-revision-preview.test.ts`, `src/components/ae/supply/price-update-modal/usePriceRevisionForm.ts`, `src/components/ae/supply/price-update-modal/usePriceRevisionForm.test.ts`, `src/components/ae/supply/price-update-modal/components/PriceDeltaPreview.tsx`, `src/components/ae/supply/price-update-modal/components/GstSplitBreakdown.tsx`, `src/components/ae/supply/price-update-modal/components/PriceAdjustmentChips.tsx`, `src/components/ae/supply/price-update-modal/components/PriceRevisionAmountField.tsx`, `src/components/ae/supply/price-update-modal/components/PriceRevisionDiagnosticSlot.tsx`
- **Deviations:** Extra leaves `PriceRevisionAmountField.tsx` and `PriceRevisionDiagnosticSlot.tsx` beyond the three named in the target spec. The modal **bypasses** the sanctioned `displayPriceFromPricingConfig` display chain for GST leg preview (four-decimal micro-unit formatting). Preserved deliberately; recorded as **Accepted Debt: Price Modal GST Leg Display (`CQ-16`)** above.
- **Status:** `VERIFIED`

---

### CQ-17: Decompose `AeToolTestPlayground.tsx` (352 lines)
- **Surfaces:** `src/components/ae/supply/tool-test-playground/AeToolTestPlayground.tsx` (container **97** lines; was 352 at refactor start; register pre-Wave 3 incorrectly cited 370)
- **Incumbent Baseline:** Test playground owns JSON Schema default extraction and response display. *(Register pre-Wave 3 incorrectly claimed the playground owns latency timing; it only displays `latencyMs` from its injected port, and the only clock is a `Date.now` stub in the parent.)*
- **Code Quality Gap:** Schema parsing algorithms embedded in UI component.
- **Target Spec:**
  - Extract `tool-test-payload.ts` for schema default extraction.
  - Extract `useToolTestPlayground.ts` hook for execution timing and response handling.
  - Extract pure leaves: `JsonPayloadEditor.tsx`, `PlaygroundResponsePane.tsx`.
- **Subagent Assignment:** Grok (Spec: `1a5b384e-1c4c-4de8-830e-beb77e32f754`) $\rightarrow$ Composer (Implement: `6b24650c-e422-494b-9630-27fa92622abf`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/supply/tool-test-playground/AeToolTestPlayground.tsx`, `src/components/ae/supply/tool-test-playground/AeToolTestPlaygroundSkeleton.tsx`, `src/components/ae/supply/tool-test-playground/tool-test-playground.contracts.ts`, `src/components/ae/supply/tool-test-playground/tool-test-payload.ts`, `src/components/ae/supply/tool-test-playground/tool-test-payload.test.ts`, `src/components/ae/supply/tool-test-playground/useToolTestPlayground.ts`, `src/components/ae/supply/tool-test-playground/components/JsonPayloadEditor.tsx`, `src/components/ae/supply/tool-test-playground/components/PlaygroundResponsePane.tsx`
- **Deviations:** The register described one recursive walker; there are **two extractors with deliberately different semantics** in `tool-test-payload.ts`: `extractDefaultPayload` is shallow and omits objects, arrays, and untyped properties; `extractExamplePayload` recurses and yields `{}`, `[]`, and `null` for those same cases, and disagrees on boolean (`false` versus `true`) and on numbers without a minimum (`0` versus `1`). They were not unified. No execution clock was added to the compound. **Observation (not a defect):** neither extractor has a depth bound or cycle guard and neither dereferences `$ref`; adding a bound would have been a behaviour change.
- **Status:** `VERIFIED`

---

### CQ-18: Decompose `AeAgentOperatorConsole.tsx` (455 lines)
- **Surfaces:** `src/components/ae/console/agent-operator-console/AeAgentOperatorConsole.tsx` (container **164** lines; was 455 at refactor start; register pre-Wave 3 incorrectly cited 456)
- **Incumbent Baseline:** Mixes route selection, revoke/drain lifecycle dialogs, and toast handling.
- **Code Quality Gap:** Conflation of sheet navigation, modal states, and table rendering.
- **Target Spec:**
  - Extract `useAgentLifecycleDialog.ts` and `useAgentSelection.ts`.
  - Extract pure leaves: `AgentRecordSheet.tsx`, `AgentLifecycleConfirmDialog.tsx`.
- **Subagent Assignment:** Grok (Spec: `b62253b7-daea-4d12-bfd3-4815579d976c`) $\rightarrow$ Composer (Implement: `cd4e7994-145e-4b95-9e96-32f4367c20cd`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/components/ae/console/agent-operator-console/AeAgentOperatorConsole.tsx`, `src/components/ae/console/agent-operator-console/AeAgentOperatorConsoleSkeleton.tsx`, `src/components/ae/console/agent-operator-console/agent-operator-console.contracts.ts`, `src/components/ae/console/agent-operator-console/agent-lifecycle-copy.ts`, `src/components/ae/console/agent-operator-console/agent-lifecycle-copy.test.ts`, `src/components/ae/console/agent-operator-console/build-agent-record-sheet-props.tsx`, `src/components/ae/console/agent-operator-console/useAgentLifecycleDialog.ts`, `src/components/ae/console/agent-operator-console/useAgentLifecycleDialog.test.ts`, `src/components/ae/console/agent-operator-console/useAgentSelection.ts`, `src/components/ae/console/agent-operator-console/useAgentSelection.test.ts`, `src/components/ae/console/agent-operator-console/components/AgentFactsDisclosure.tsx`, `src/components/ae/console/agent-operator-console/components/AgentLifecycleConfirmDialog.tsx`, `src/components/ae/console/agent-operator-console/components/AgentLifecycleConfirmDialog.test.tsx`, `src/components/ae/console/agent-operator-console/components/AgentRecordSheet.tsx`, `src/components/ae/console/agent-operator-console/components/AgentRecordSheet.test.tsx`
- **Deviations:** Container is **164** lines, fourteen over the 150-line compound-container guideline; thirty of those are the `AeAgentOperatorConsoleProps` block, which cleanliness rule §1 requires to stay in the `.tsx`. Accepted as a deviation. The register implied the console was parent to both Wave 2 console compounds; it is parent to `spending-limits-form` only, while `connect-agent-wizard` is owned by the route. Two files beyond the sketch were added: `agent-lifecycle-copy.ts` and `AgentFactsDisclosure.tsx`. **Preserved invariant:** drain versus freeze is label-only — `revocationMode` reaches only the confirm button verb, never a mutation, and no server function has a mode field. There is **no typed-to-confirm** and **no client idempotency key** on this surface, contrary to what the register implied.
- **Status:** `VERIFIED`

---

# Wave 4: Convex God-Files & CQS Nonce Rectification

### CQ-19: Rectify Nonce-Burning Agent Reads to Pure Queries (11 Handlers)
- **Surfaces:** `convex/capabilityProviderOffboarding.ts`, `convex/capabilityCallProjection.ts`, `convex/capabilityProviderTools.ts`, `convex/capabilityProviderConnectionAgents.ts`, `convex/marketDemandSignals.ts`, `convex/capabilitySupplyOwnerFunnel.ts`, `convex/moneyAccountFunding.ts`, `convex/agentMoneyReads.ts` (commit `197e87336`)
- **Incumbent Baseline:** Eleven agent read operations were registered as Convex `mutation` purely to consume a one-time `sourceWriteNonces` record. The register originally scoped nine handlers including `moneyLedger.readAgentProviderEarnings`; scout corrected the live set before implementation.
- **Code Quality Gap:** Major CQS violation. A refresh or retry reusing a still-valid signed admission failed with `source_write_nonce_replayed`; reads could not be cached or safely retried.
- **Target Spec:**
  - Convert eligible handlers to `query` using `requireSourceRead`.
  - `requireSourceRead` retains HMAC signature, 5-minute freshness, scope, `operationKey`, `correlationId`, command digest, and request binding; only the single-use nonce insert is dropped.
  - Update callers and test mocks to invoke queries without write nonces.
- **Converted handlers:** `capabilityProviderOffboarding.readAgentStatus`; `capabilityCallProjection.listAgentSupplyCalls`; `capabilityProviderTools.listAgent` and `.readAgent`; `capabilityProviderConnectionAgents.list` and `.read`; `marketDemandSignals.list` and `.read`; `capabilitySupplyOwnerFunnel.readAgentOwnerSupplyFunnel`; `moneyAccountFunding.readAgentHandoff`; `agentMoneyReads.activity`.
- **Central hazard (reusable lesson):** Four admit helpers were shared between these reads and real commands. Converting a shared helper in place would have stripped replay protection from `reserveAgentHandoff`, `bindAgentHandoff`, `marketDemandSignals.record`, and four connection commands — with lint, typecheck, and both RPC guards all staying green. The safe incision was a read-only sibling beside an untouched write path: `agentActor` / `agentActorForRead`, `admitForWrite` / `admitForRead`, `admitAgentHandoff` / `admitAgentHandoffForRead`, `admitAgentMoneyReadForWrite` / `admitAgentMoneyReadForRead`.
- **Deliberate non-conversions:**
  - **`agentMoneyReads.prepareBalance`** stays `internalMutation`. It gates the `balance` action, which calls Formance (external ledger). Converting it would make a signed admission replayable against a third party for five minutes; replay protection was judged worth more than CQS symmetry.
  - **`moneyLedger.readAgentProviderEarnings`** dropped from scope. Stub returning `source_unavailable`; burns no nonce. Revisit when earnings are implemented.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement: `197e87336`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates + RPC guards)
- **Status:** `VERIFIED`

---

### CQ-19a: Pin Convex RPC Kind Snapshot & String-Reference Ratchet
- **Surfaces:** `tests/imports/convex-api-kind-snapshot.test.ts`, `tests/imports/convex-string-reference-ratchet.test.ts`, `tests/helpers/convex-rpc-contract-scans.ts`, `tests/fixtures/convex-api-kind-snapshot.json`
- **Incumbent Baseline:** No automated guard when a Convex handler moves between files or changes kind (`query` / `mutation` / `action`). String-literal `api.module.method` references fail silently at runtime.
- **Code Quality Gap:** Façade decompositions and CQS kind changes are high-risk without a contract ratchet; lint and typecheck stay green when a reference points at the wrong kind.
- **Target Spec:**
  - Snapshot **524** `module.method → kind` triples in a committed fixture.
  - Ratchet **322** string-literal references in the repo against that snapshot.
  - Centralise scan logic in `tests/helpers/convex-rpc-contract-scans.ts`.
  - Prove both tests fail on a deliberate broken reference before relying on them in Wave 4 commits.
- **Delivered Surfaces:** `tests/imports/convex-api-kind-snapshot.test.ts`, `tests/imports/convex-string-reference-ratchet.test.ts`, `tests/helpers/convex-rpc-contract-scans.ts`, `tests/fixtures/convex-api-kind-snapshot.json`
- **Deviations:** Additive workflow inserted after `CQ-19` was specced; not one of the original `CQ-01`–`CQ-30` census IDs, but counted in the Wave 4 **Verified** column (six delivered entries).
- **Status:** `VERIFIED`

---

### CQ-20: Decompose `convex/interactiveAuthority.ts` (1,172 $\rightarrow$ 102 lines)
- **Surfaces:** `convex/interactiveAuthority.ts`, **14** submodules under `convex/lib/interactiveAuthority/` (commit `363db3499`; ran first in Wave 4 to establish the `convex/lib/<domain>/` façade pattern)
- **Incumbent Baseline:** 1,172 lines jamming error codes, Clerk organization locator, identity provisioning, credential rotation, fact reads, and scheduled reconcile.
- **Code Quality Gap:** 1,000-line rule violation; multiple disparate responsibilities.
- **Target Spec:**
  - Move logic to `convex/lib/interactiveAuthority/*`; keep root `convex/interactiveAuthority.ts` as thin RPC façade (**not** `convex/interactiveAuthority/` — that would break generated `api.interactiveAuthority.*` paths).
  - Reduce root file to <200 lines.
- **Delivered:** Root façade **102** lines; **14** files under `convex/lib/interactiveAuthority/`. All generated API paths unchanged; both RPC guards passed with unmodified fixtures.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement: `363db3499`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates + RPC guards)
- **Deviations:** React Doctor `server-sequential-independent-await` / `async-await-in-loop` advisories in `accessFacts.ts` and `accountResolution.ts` — pre-existing behaviour, logged as Accepted Debt.
- **Status:** `VERIFIED`

---

### CQ-21: Decompose `convex/moneyAccountFunding.ts` (1,172 $\rightarrow$ 222 lines)
- **Surfaces:** `convex/moneyAccountFunding.ts`, **11** submodules under `convex/lib/money/` (commit `363db3499`)
- **Incumbent Baseline:** 1,172 lines mixing owner top-up commands, agent handoff reserves, webhook reads, and invoice history projection.
- **Code Quality Gap:** 1,000-line rule violation.
- **Target Spec:**
  - Move logic to `convex/lib/money/*`; reduce root façade to <250 lines.
- **Delivered:** Root façade **222** lines; **11** files under `convex/lib/money/`. All generated API paths unchanged; both RPC guards passed with unmodified fixtures.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement: `363db3499`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates + RPC guards)
- **Deviations:** React Doctor advisories in `ownerFundingInvoiceHistory.ts` (pre-existing). `args as never` on read-admit path in `agentFundingHandoff.ts` — Accepted Debt.
- **Status:** `VERIFIED`

---

### CQ-22: Decompose `convex/capabilitySupplyPublish.ts` — DROPPED
- **Surfaces:** `convex/capabilitySupplyPublish.ts`
- **Incumbent Baseline (register, pre-scout):** Assumed a 1,135-line god RPC file mixing source-authority verification, prepared publishing, admission cases, bootstrap decoding, and curated capability management.
- **Scout finding (20 Sep 2026):** `capabilitySupplyPublish.ts` is **already a helper module**, not a root Convex RPC façade. There is no 1,000-line rule violation and no decomposition problem to solve.
- **Decision (Orchestrator, 20 Sep 2026):** **Drop `CQ-22` from Wave 4.** Do not force a façade split that would confuse ownership with real RPC entry points.
- **Status:** `DROPPED`

---

### CQ-23: Decompose `convex/capabilityQuotes.ts` (1,116 $\rightarrow$ 75 lines)
- **Surfaces:** `convex/capabilityQuotes.ts`, **9** submodules under `convex/lib/capabilityQuotes/` (commit `363db3499`)
- **Incumbent Baseline:** 1,116 lines mixing financial subject preparation, quote hashing, Formance sync action, rate lookup, and call admission.
- **Code Quality Gap:** 1,000-line rule violation.
- **Target Spec:**
  - Move logic to `convex/lib/capabilityQuotes/*`; reduce root façade to <250 lines.
- **Delivered:** Root façade **75** lines; **9** files under `convex/lib/capabilityQuotes/`. All generated API paths unchanged; both RPC guards passed with unmodified fixtures.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement: `363db3499`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates + RPC guards)
- **Status:** `VERIFIED`

---

### CQ-24: Decompose `convex/capabilityProviderConnectionAttempts.ts` (1,105 $\rightarrow$ 100 lines)
- **Surfaces:** `convex/capabilityProviderConnectionAttempts.ts`, **9** submodules under `convex/lib/providerConnections/` (commit `363db3499`)
- **Incumbent Baseline:** 1,105 lines mixing attempt reserves, secret preparation, OAuth callback bindings, and atomic finalization.
- **Code Quality Gap:** 1,000-line rule violation.
- **Target Spec:**
  - Move logic to `convex/lib/providerConnections/*`; reduce root façade to <200 lines.
- **Delivered:** Root façade **100** lines; **9** files under `convex/lib/providerConnections/`. All generated API paths unchanged; both RPC guards passed with unmodified fixtures.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement: `363db3499`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates + RPC guards)
- **Deviations:** Submodule files triggered `oxlint.config.ts` per-directory complexity ceiling (`max: 10`). Four per-file ratchets added — see **Accepted Debt: Convex Complexity Ratchets (`CQ-24`)**.
- **Status:** `VERIFIED`

---

### CQ-25: Decompose `convex/capabilityCallProjection.ts` (1,041 lines) — PARKED
- **Surfaces:** `convex/capabilityCallProjection.ts`
- **Incumbent Baseline:** 1,041 lines mixing worker dispatch mapping, canary projection, recovery calculation, and provider supply call listings.
- **Code Quality Gap:** 1,000-line rule violation remains.
- **Target Spec (unchanged intent):**
  - Move logic to `convex/lib/callLifecycle/*` (or equivalent under `convex/lib/`); keep root façade for RPC paths.
  - Reduce root file to <200 lines.
- **Parked reason:** Concurrent agent in-flight ADR on the call worker. Decomposing projection now risks fighting the same boundaries twice. **`listAgentSupplyCalls` was converted to a query in `CQ-19`**; the file is smaller in risk surface but still over the 1,000-line rule.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ *(resume after call-worker ADR)*
- **Status:** `PARKED`

---

# Wave 5: Barrel Cycle Eradication & Strict Dependency Ratchet

### CQ-26: Eradicate Money Module Internal Barrel Cycles
- **Surfaces:** `src/modules/money/public.ts`, `src/modules/money/internal/*`
- **Incumbent Baseline:** `public.ts` is a 680-line god-barrel. Internal modules imported shared money types from `public.ts` while `public.ts` re-exported those same internals — classic `internal → public.ts → same internal` loops (**11** `no-circular-via-barrel` violations).
- **Code Quality Gap:** Circular barrel cycles; `import type` alone does not satisfy dependency-cruiser with `tsPreCompilationDeps: true` (see Wave 5 Cross-Cutting Infrastructure).
- **Target Spec:**
  - Move shared types to `src/modules/money/internal/money-types.ts`.
  - Internal modules import from sibling types. `public.ts` re-exports only.
- **Delivered Surfaces:** `src/modules/money/internal/money-types.ts`, `src/modules/money/internal/money-query-views.ts`
- **Cycles removed:** **11**
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement: `147b602a7`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Status:** `VERIFIED`

---

### CQ-27: Eradicate Security Module Internal Barrel Cycles
- **Surfaces:** `src/modules/security/public.ts`, `src/modules/security/internal/*`
- **Incumbent Baseline:** Multiple security internals imported authority and membership types from `security/public.ts` (**6** violations — more than the single-file anecdote in the pre-Wave 5 register).
- **Code Quality Gap:** Circular barrel cycles.
- **Target Spec (register plan):** Move admin authority types to `internal/admin-authority-types.ts`.
- **Delivered Surfaces:** `src/modules/security/internal/security-types.ts` (consolidated leaf; plan filename superseded)
- **Cycles removed:** **6**
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement: `147b602a7`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Status:** `VERIFIED`

---

### CQ-28: Eradicate Observability, Business & SEO Internal Barrel Cycles
- **Surfaces:** `src/modules/observability/public.ts`, `src/modules/business/public.ts`, `src/modules/seo/public.ts`, and each module's `internal/*`
- **Incumbent Baseline:** The pre-Wave 5 register scoped only observability and named `internal/literals.ts`. **`business` and `seo` were omitted** from the plan despite sharing the same barrel-definition loop pattern.
- **Code Quality Gap:** Circular barrel cycles across three modules (**4** violations in this workflow's direct edits; remaining discovery cycles cleared collaterally — see `CQ-29`).
- **Target Spec (register plan):** Move observability types to `internal/literals.ts`; internals import local types; barrel re-exports only.
- **Delivered Surfaces:** `src/modules/observability/internal/contracts.ts`, `src/modules/business/internal/business-record.ts`, `src/modules/seo/internal/seo-types.ts`
- **Cycles removed:** **4** (direct)
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement: `147b602a7`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Status:** `VERIFIED`

---

### CQ-29: Eradicate Discovery Module Internal Barrel Cycles — NOT EXECUTED (COLLATERAL)
- **Surfaces:** `src/modules/discovery/public.ts`, `src/modules/discovery/internal/*`
- **Incumbent Baseline:** Discovery internals imported options types from `discovery/public.ts` (**11** violations at campaign start, all via transitive loops through `money`, `security`, `observability`, `business`, and `seo` barrels).
- **Code Quality Gap:** Circular barrel cycles.
- **Target Spec (unchanged intent):** Move discovery options to an internal leaf; internals import sibling types; barrel re-exports only.
- **Outcome:** **Workflow never ran.** All 11 discovery cycles dropped to zero as collateral when `CQ-26`–`CQ-28` broke the upstream barrels discovery's internals imported through. Confirmed: `npm run deps:check` reports zero `no-circular-via-barrel` violations; no file under `discovery/internal/` imports `discovery/public.ts`.
- **Subagent Assignment:** *(not assigned — superseded by measurement)*
- **Status:** `RESOLVED (COLLATERAL)` — counts toward zero violations, not toward Wave 5 **Verified** (4 executed workflows).

---

### CQ-30: Lower Dependency-Cruiser Ratchet Ceilings to Zero & Rebaseline Module Manifest
- **Surfaces:** `tools/dev/deps-ratchet.ts`, `.dependency-cruiser.cjs`, `tests/imports/module-boundaries-ratchet.test.ts`, `src/modules/module-boundaries.ts` (first campaign commit)
- **Incumbent Baseline:** `no-circular-via-barrel` ceiling **32**; module ratchet **28 / 198** with manifest surfaces uncommitted since Wave 1.
- **Code Quality Gap:** Permissive dependency ceiling; stale module ratchet masking true manifest size.
- **Target Spec:**
  - Verify all 32 cycles are resolved.
  - Lower `no-circular-via-barrel` ceiling from 32 to **0**.
  - Run `npm run deps:check` to prove zero violations on all three circular rules.
  - Rebaseline module boundary ratchet to measured post-campaign counts.
- **Delivered:** `no-circular-via-barrel` **0/0 ok**; `no-circular` and `no-circular-capability-supply-internal` **0/0 ok**; module ratchet **29 modules / 224 entry surfaces**; `module-boundaries.ts` committed for the first time in `147b602a7`.
- **Subagent Assignment:** Orchestrator (Verify Gate: `147b602a7`)
- **Status:** `VERIFIED`
