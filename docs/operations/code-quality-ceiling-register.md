# Code Quality Campaign 2: Hard Ceilings — Operational Register

**Date:** 20 September 2026 (Wave 3 close-out measured 21 Sep 2026)  
**Status:** WAVE 1 VERIFIED (`e140512a0`); WAVE 2 VERIFIED (`0fafd075d`); WAVE 3 VERIFIED (`fea40841a`; typecheck heal `252bed4bb`); **Evaluation** written 21 Sep 2026; **Cold review** recorded 21 Sep 2026; campaign **CLOSED** (Campaign 1 closed at `147b602a7`). Do not reopen Wave 3 or the five newest operator-route controllers.  
**Operating Protocol:** `docs/operations/code-quality-maturity-protocol.md` (same 5-stage Grok → Composer → Orchestrator lifecycle; IDs `CQ2-*`)  
**Design:** `docs/designs/2026-09-20-code-quality-ceilings.md`  
**Predecessor:** `docs/operations/code-quality-maturity-register.md` (Campaign 1; re-audit 20 Sep 2026)  
**Successor:** `docs/operations/code-quality-campaign-3-register.md` (Campaign 3 — façade/helper follow-through; **CLOSED** 21 Sep 2026; programme re-audit same day)  
**Core Rules:** `.cursor/rules/leaf-and-component-cleanliness.mdc` §4 (1,000-line hard ceiling) and §9 (80-line page-route controllers)

**Thesis:** Make the two hard ceilings true — no in-scope file in `src/` or `convex/` exceeds 1,000 lines, and page-route files are controllers under 80 lines.

---

## 1. Progress & Census Scorecard

| Wave | Scope | Workflows | Verified | In Review | Pending | Target Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **Wave 1: 1,000-line hard ceiling** | Split the in-scope gods; one recorded deferral | `CQ2-01` – `CQ2-06` | 6 | 0 | 0 | `VERIFIED` |
| **Wave 2: Fat page routes** | Extract containers from the five worst page routes | `CQ2-07` – `CQ2-11` | 5 | 0 | 0 | `VERIFIED` |
| **Wave 3: Remaining page routes** | Same incision on leftover non-exempt page routes over 80 | `CQ2-12` – `CQ2-24` | 13 | 0 | 0 | `VERIFIED` |
| **Total** | Campaign 2 | **24 named** | **24** | **0** | **0** | `CLOSED` |

**Wave 1 success metric:** `wc -l` on `src/` and `convex/` (exclude `_generated`, `*.test.*`) reports **at most one** file over 1,000 — the recorded deferral `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts`.

**Wave 2 success metric:** the five named page routes are each ≤ 80 lines. `api.*` and `__root.tsx` are exempt. `developers.discovery.tsx` is skipped until discovery dirt lands. **Met** — the five land at 74 / 66 / 33 / 27 / 34 (see Wave 2 close-out).

**Wave 3 success metric:** every non-exempt page route under `src/routes/*.tsx` (excluding `__root.tsx`) is ≤ 80 lines, except the recorded skip `developers.discovery.tsx`. **Met** — seventeen routes thinned across `CQ2-12` – `CQ2-24`; only `developers.discovery.tsx` remains at 197 (see Wave 3 close-out).

### Known Red Baseline (inherited)

Unchanged from Campaign 1 close-out. Not owned by this campaign.

| Test File | Count | Attribution |
| :--- | :---: | :--- |
| `tests/imports/module-boundaries.test.ts` | 3 | Concurrent agent — `tool.procure` / undeclared `procure-engine` / `tool-reranker` |
| `tests/imports/module-boundaries-ratchet.test.ts` | 1 | Concurrent agent — `tool-reranker` module-boundary violations |
| `tests/unit/core-flow/native-platform-procure.test.ts` | 3 | Concurrent agent — `tool.procure` unregistered |

Plan red baseline was **6 failures in 2 files**; after Wave 1 gates it is **7 failures in 3 files** because concurrent work added `tool-reranker` ratchet violations — not campaign-owned drift.

Gates for every workflow: lint 0, typecheck 0 on campaign paths, `deps:check` 0/0/0, tests **7 failures in those 3 files only** (see Wave 1 close-out). RPC guards (`convex-api-kind-snapshot`, `convex-string-reference-ratchet`) must pass **without regenerating fixtures** unless a function actually changes kind.

**Typecheck carve-out retired (Wave 2, 20 Sep 2026).** `npx tsc --noEmit` now exits 0 with **0 errors repo-wide**. The pre-existing `catalogSearcher` error in `tests/unit/core-flow/native-platform-procure.test.ts` that Campaign 1 had to gate around is resolved, so the campaign no longer needs a “no new errors” carve-out for typecheck — the bar is a clean typecheck. The test-run red baseline above is unchanged.

### Do not touch (standing)

- `src/modules/module-boundaries.ts`, `tests/imports/module-boundaries-ratchet.test.ts`, `tools/dev/deps-ratchet.ts`
- Procure / decision-engine / Jev / `convex/chatTools.ts` / `convex/capabilityToolCatalog.ts`
- `src/routeTree.gen.ts` — already dirty. **Do not add or rename routes.**
- `prepareBalance` nonce burn, `reserveAttempt` complexity, React Doctor warning cleanup
- `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` (deferred)
- Discovery internals (skip `developers.discovery.tsx`)

### Layout convention (Convex)

Root `convex/<name>.ts` stays the RPC façade. Logic moves to `convex/lib/<domain>/`. Never `convex/<name>/` — that breaks `api.<name>.<method>`. Campaign 1 established this; do not revisit.

---

# Wave 1: 1,000-line hard ceiling

Scout: `055201df-68b4-4098-ab08-bc41e5c34993` (20 Sep 2026). None of the seven ceiling files are dirty. `cdp-x402-payment-signer.ts` is deferred. Full call-projection redesign stays parked; `CQ2-06` is a re-export-preserving trim only.

Parallel-safe: `CQ2-01` through `CQ2-05` touch disjoint files. Run `CQ2-06` after or with a frozen export-surface checklist — `output-adjudication.ts` is dirty and imports `ContractOutputValidation` from the projection file.

## Wave 1 close-out (Stage 5 provenance)

**Status:** `VERIFIED`  
**Commit:** `e140512a0` — `refactor(quality): Campaign 2 Wave 1 - clear the 1,000-line hard ceiling`  
**Diff stat:** 33 files changed, 5,360 insertions, 4,936 deletions.

### Workflow results

| ID | File | Before | After | Siblings created (line counts) | Scout | Composer |
| :--- | :--- | ---: | ---: | :--- | :--- | :--- |
| **CQ2-01** | `src/modules/money/formance.ts` | 1310 | 65 (barrel) | `internal/formance-config.ts` 387, `internal/formance-reads.ts` 719, `internal/formance-writes.ts` 230 | `0c3eca2f-87c3-47f8-8896-d1bbb2259280` | `31dfd78d-fbfa-4c53-8d52-77dd72c96fa8` |
| **CQ2-02** | `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts` | 1302 | 948 | `-mcp-session.ts` 223, `-revoke.ts` 151 | `4d214375-6d57-49fb-9286-68bf2205ea73` | `465c036e-b0d3-456a-aadf-2ab48436f5a3` |
| **CQ2-03** | `convex/capabilitySupplyPublish.ts` | 1135 | 23 (barrel) | `convex/lib/capabilitySupply/`: `publicationValues.ts` 257, `sourceAuthority.ts` 92, `publishPrepared.ts` 395, `readPublication.ts` 84, `publishBootstrap.ts` 342 | `ed8feca1-2e27-4dcc-ba3b-e9048922c24a` | `7d19ec26-1791-400f-8bc2-d173de405c73` |
| **CQ2-04** | `convex/capabilityProviderOffboarding.ts` | 1054 | 162 (façade) | `convex/lib/providerOffboarding/`: `validators.ts` 32, `caseState.ts` 159, `ownerCommands.ts` 331, `runWorkflow.ts` 105, `freezePages.ts` 225, `drainAndSettle.ts` 48, `revokePages.ts` 48, `verifyPages.ts` 123 | `de5c7c85-e5e9-4fc3-8ebf-7e4b1bcc5b77` | `123734b1-6b6d-4497-9ad0-8b4a38ea92ff` |
| **CQ2-05** | `convex/lib/callLifecycle/admission.ts` | 1037 | 42 (barrel) | `admissionTypes.ts` 105, `admissionReserve.ts` 558, `admissionApprovals.ts` 388 | `ff45edfc-52cb-40ce-88f1-7f2f95b123cb` | `e70db575-3537-4ada-8a85-68fc5bb4391f` |
| **CQ2-06** | `convex/capabilityCallProjection.ts` | 1041 | 875 | `convex/lib/callLifecycle/supplyCallsListing.ts` 175 | `56ddd8c2-d41b-4d1f-abc4-faaf78233321` | `0be65a05-3ee5-4b42-befa-9be824d642f8` |

### Post-wave ceiling census

`wc -l` on hand-written files under `src/` and `convex/` (exclude `_generated`, `*.test.*`):

| Outcome | Detail |
| :--- | :--- |
| Over 1,000 (hand-written) | **1** — `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` at **1,038** at C2 close; **1,041** on current unified `main` (A10 deferral) |
| Excluded generated | `src/routeTree.gen.ts` at **2,745** — campaign forbidden to regenerate; not counted as a miss |

**Wave 1 thesis met:** at most one hand-written file over 1,000, and it is the recorded deferral.

Largest remaining hand-written files (context): `convex/capabilityProviderConsequenceJournal.ts` 986, `provider-connection-handoff.ts` 948, `convex/devSeed.ts` 936, `convex/moneyConnect.ts` 935, `src/modules/chat/tool-card.ts` 926.

### Gate evidence (Wave 1)

| Gate | Result |
| :--- | :--- |
| Lint (`oxlint --deny-warnings`) | Clean |
| Typecheck | Zero errors on campaign-touched paths; **8** errors remain in `tools/dev/eval-jev-bazaar.ts` (concurrent Jev work) |
| `deps:check` | `no-circular` 0/0, `no-circular-capability-supply-internal` 0/0, `no-circular-via-barrel` 0/0 |
| RPC kind snapshot (524 triples) | Pass — unmodified fixtures; `git diff --stat tests/fixtures/` empty |
| String-reference ratchet (322 refs) | Pass — unmodified fixtures |
| Full vitest | **7 failed** / 6852 passed / 25 skipped / 3 todo across 745 files |
| React Doctor (pre-commit, staged scope) | 0 errors, **7 warnings** across 4 campaign files (see below) |

React Doctor warnings (pre-existing patterns moved verbatim; no warning-cleanup wave opened): `async-await-in-loop` in `caseState.ts` and `freezePages.ts` (×2), `server-sequential-independent-await` in `ownerCommands.ts` (×3), `js-length-check-first` in `formance-writes.ts`.

### Test failure attribution

All **7** failures are concurrent-agent-owned, not campaign-owned:

| Test file | Failures |
| :--- | ---: |
| `tests/unit/core-flow/native-platform-procure.test.ts` | 3 |
| `tests/imports/module-boundaries.test.ts` | 3 |
| `tests/imports/module-boundaries-ratchet.test.ts` | 1 |

Every reported violation names `procure-engine`, `procure.actions`, `output-adjudication`, or `tool-reranker` — files in the concurrent agent's dirty set at session start. Targeted search: **no campaign path appears in any failure.** CQ2-01's Formance SDK boundary assertion passes.

### Deviations (actual vs target spec)

1. **CQ2-02 re-specified.** The register's original cut (`completeOwnerMcpProviderConnection` + `revokeStoredMcpProviderConnection`) was arithmetically insufficient — those two functions total only 185 lines, leaving ~1,130 — and would have created an import cycle. Scout re-specified the seam as the OAuth session class plus the revoke path. `completeOwnerMcpProviderConnection`, the highest-risk sequencer, was deliberately left in place.
2. **CQ2-04 path corrections.** `convex/lib/providerOffboarding/` did not exist and was created. Existing `convex/lib/providerOffboardingFreeze.ts` was **not** moved — fourteen production files import it; moving it would change its generated module id. The `run` workflow's `manager.define` registration stayed in the root while its ~102-line handler body moved to `runWorkflow.ts`; without that, the 200-line façade target was unreachable.
3. **CQ2-06 premise corrected.** The file is not a pure helper — it owns one public query, `listAgentSupplyCalls`. That registration stayed in the root so `api.capabilityCallProjection.listAgentSupplyCalls` and the production string literal in `supply-management-service.ts` are unchanged.
4. **CQ2-03 economised.** Optional `publishPorts.ts` was not created because `publishPrepared.ts` landed at 395, inside the 400-line guideline.
5. **CQ2-01 self-heal.** One Composer fix pass (of two permitted) removed three unused imports that failed `--deny-warnings`. Barrel export surface unaffected.
6. **Uncommitted campaign edit (open item).** CQ2-01's Formance SDK allow-list widening in `tests/imports/module-boundaries.test.ts` is **left uncommitted**. That file also carries the concurrent agent's `moduleCount 28→29` change, paired with dirty `src/modules/module-boundaries.ts` — a file this campaign is forbidden to commit. The guard hook blocks destructive git operations that would separate the hunks. Reconcile once the concurrent agent lands its work.

### Contract preservation

- **CQ2-04:** All 20 offboarding registrations stayed in the root; zero registrations added under `convex/lib/`. Workflow checkpoint `name:` strings preserved so `resumeCase`'s `restart({ from })` still hits its checkpoints. `readAgentStatus` remains a query with `requireSourceRead`.
- **CQ2-05:** `reserveHandler` step order intact — replay before persist, rate consume after spend fences — and `admitHandler` remains the sole nonce consumer.
- **CQ2-02:** OAuth sequencing, revoke mapping, and secret zeroing moved verbatim.

---

### CQ2-01: Split `src/modules/money/formance.ts` (1,310 lines)

- **Surfaces:** `src/modules/money/formance.ts`
- **Incumbent Baseline:** 1,310-line first-party Formance SDK adapter (`"use node"`). Config/validate, ledger reads, and write/bulk/error-map live in one file. Not generated. Last clean commit `ac16182cb`.
- **Code Quality Gap:** Hard 1,000-line ceiling.
- **Target Spec:**
  - Extract config/validate, ledger reads, and write/bulk/error-map into `src/modules/money/internal/formance-*.ts`.
  - Keep `formance.ts` as the public adapter barrel with **identical export names**.
  - Do not invent new money math. Do not change Formance request/response shapes.
  - New leaves stay under `internal/` — do **not** add them as module entry surfaces.
- **Collision:** None on the file.
- **Size:** L
- **Status:** `VERIFIED` (`e140512a0`)

---

### CQ2-02: Split `provider-connection-handoff.ts` (1,302 lines)

- **Surfaces:** `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts`
- **Incumbent Baseline:** 1,302-line MCP/OAuth handoff. Contracts already live in `provider-connection-handoff-contract.ts`. `completeOwnerMcpProviderConnection` and `revokeStoredMcpProviderConnection` dominate the tail.
- **Code Quality Gap:** Hard 1,000-line ceiling.
- **Target Spec:**
  - Move `completeOwnerMcpProviderConnection` and `revokeStoredMcpProviderConnection` into sibling files under the same `supply-funnel/` folder.
  - Leave HTTP/start/preview in the current file.
  - Re-export from the current file if callers import those two names from it today — do not rewrite the call graph beyond the folder.
  - Do not touch `cdp-x402-payment-signer.ts`.
- **Collision:** None on the file.
- **Size:** L
- **Status:** `VERIFIED` (`e140512a0`; seam re-specified — see close-out)

---

### CQ2-03: Split `convex/capabilitySupplyPublish.ts` (1,135 lines) — helper, not a new façade

- **Surfaces:** `convex/capabilitySupplyPublish.ts`, existing `convex/capabilitySupply.ts` (194-line façade that already re-exports these handlers)
- **Incumbent Baseline:** Campaign 1 `CQ-22` dropped this as “already a helper, not an RPC god.” That was right about **kind** and wrong about the **1,000-line rule**. Zero `query`/`mutation`/`action` in this file. `convex/lib/capabilitySupply/` already exists (`currentTool.ts`, `canaryFundingConstants.ts`).
- **Code Quality Gap:** Hard 1,000-line ceiling on a helper that the façade already owns.
- **Target Spec:**
  - **Do not invent a second RPC root.** Do not create `convex/capabilitySupplyPublish/` as a façade folder.
  - Move validators/values, `publishPreparedCapabilityHandler`, `readCapabilityPublicationHandler`, and seed/curated helpers under `convex/lib/capabilitySupply/`.
  - Keep every import path that `capabilitySupply.ts` uses working. Generated `api.capabilitySupply.*` paths stay unchanged.
  - RPC snapshot fixture: **do not edit** unless a registration kind actually changes (it must not).
- **Collision:** None on the file.
- **Size:** M
- **Status:** `VERIFIED` (`e140512a0`)

---

### CQ2-04: Façade-split `convex/capabilityProviderOffboarding.ts` (1,054 lines)

- **Surfaces:** `convex/capabilityProviderOffboarding.ts`
- **Incumbent Baseline:** True RPC root — `run` workflow, `startCase` / `resumeCase` / `cancelCase` mutations, `readStatus` / `readAgentStatus` queries, ~14 `internalMutation` page steps. `readAgentStatus` is already a `query` + `requireSourceRead` (Campaign 1 `CQ-19`). Only sibling today: `convex/lib/providerOffboarding/providerOffboardingFreeze.ts` (29 lines).
- **Code Quality Gap:** Hard 1,000-line ceiling; façade pattern not applied.
- **Target Spec:**
  - Keep `run` + thin RPC stubs and validators in the root. Root target **< 200 lines**.
  - Move page mutations and case-step logic to `convex/lib/providerOffboarding/`.
  - Preserve `api.capabilityProviderOffboarding.*` names and kinds exactly.
  - Do not convert any remaining write to a query. `readAgentStatus` stays a query.
- **Collision:** None on the file.
- **Size:** M
- **Status:** `VERIFIED` (`e140512a0`; path corrections — see close-out)

---

### CQ2-05: Split `convex/lib/callLifecycle/admission.ts` (1,037 lines)

- **Surfaces:** `convex/lib/callLifecycle/admission.ts`
- **Incumbent Baseline:** Already a helper in a 14-file folder. `admitHandler` is tiny (162–170). Bulk is `reserveHandler` plus approval list/decide handlers. Siblings `authorityHandlers.ts` (812) and `dispatch.ts` (786) are over the 400-line **guideline**, not the 1,000 hard ceiling — **do not split them this wave**.
- **Code Quality Gap:** Hard 1,000-line ceiling on a façade submodule (also over the 400-line guideline).
- **Target Spec:**
  - Split by exported handler: reservation (`reserveHandler` + helpers) vs approval (`listPendingCallApprovalsHandler` / `decideCallApprovalHandler`).
  - Leave `admitHandler` where callers already find it, or re-export it from this file.
  - Do not change admission semantics, nonce behaviour, or call-worker imports beyond this folder.
  - Do not rename symbols the worker imports.
- **Collision:** None on the file. Do not edit `capabilityCallProjection.ts` here (`CQ2-06`).
- **Size:** M
- **Status:** `VERIFIED` (`e140512a0`)

---

### CQ2-06: Re-export trim `convex/capabilityCallProjection.ts` (1,041 lines)

- **Surfaces:** `convex/capabilityCallProjection.ts` (export surface must remain byte-identical for current names)
- **Incumbent Baseline:** Mixed helper barrel + one RPC (`listAgentSupplyCalls`, already a `query` from `CQ-19`). ~15 call-worker files import this module. Campaign 1 `CQ-25` parked a **redesign** of the worker/projection boundary.
- **Code Quality Gap:** Hard 1,000-line ceiling. A redesign still collides with dirty `src/modules/capability-execution/call-worker/output-adjudication.ts` (imports `ContractOutputValidation`).
- **Target Spec:**
  - **Re-export-preserving move only.** Every current export name remains exported from this file.
  - Preferred cut: move the listing block (roughly 855–1041) or non-worker helpers under `convex/lib/callLifecycle/` and re-export.
  - **Do not rename** `ContractOutputValidation`, `OpenDispatch`, `RecoveryRow`, or `canonicalTerminalOutcome`.
  - **Do not** change `listAgentSupplyCalls` kind or admission path.
  - If the file cannot fall under 1,000 without touching worker-imported types, **stop and report** — do not force the redesign.
- **Collision:** Indirect — dirty adjudication consumer. Frozen export surface is the entire mitigation.
- **Size:** M (or abort to parked)
- **Status:** `VERIFIED` (`e140512a0`; `listAgentSupplyCalls` stayed in root — see close-out) / redesign remains `PARKED`

---

### Deferred: `cdp-x402-payment-signer.ts` (1,041 lines on unified `main`)

- **Surfaces:** `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts`
- **Decision (Orchestrator, 20 Sep 2026):** Out of Wave 1. Vendor-shaped custody wrapper. Wave 1 success metric **allows this one remaining file over 1,000**. Revisit after Wave 1 if the other six are green.
- **Current measurement (21 Sep 2026):** **1,041** on unified `main` (historical close text recorded 1,038 at `1d8d07583`). Still **DEFERRED** — Campaign 3 did not extract it (A10).
- **Status:** `DEFERRED`

---

# Wave 2: Fat page routes (verified)

Wave 1 thesis met at `e140512a0`. Wave 2 ran under the same gate bar and is now verified. Wave 3 is verified at `fea40841a`; campaign closed after eval and cold review (21 Sep 2026).

Exempt this campaign: `src/routes/api*`, `src/routes/__root.tsx`. Skip `src/routes/developers.discovery.tsx` until discovery dirt lands. Do not add or rename routes.

Incision for every workflow: keep `createFileRoute`, `validateSearch`, and the loader in the route file; move page markup, local types, and server-fn wiring into `src/components/ae/<domain>/<feature>/` using the Campaign 1 compound shape (container + hook + contracts + skeleton + `components/` leaves). Route target **≤ 80 lines**.

| ID | Route | Lines | Incision (one line) | Size | Status |
| :--- | :--- | ---: | :--- | :---: | :--- |
| **CQ2-07** | `src/routes/_operator/activity.tsx` | 769 | New `src/components/ae/activity/` compound. Move `ActivityPage`, `ActivityLoaderResult`, call-row types. Do not “fix” inline GST while extracting. | L | `VERIFIED` (`0fafd075d`) |
| **CQ2-08** | `src/routes/_operator/agent-access.tsx` | 519 | Extract `AgentAccessHome` into `src/components/ae/agent-access/home/`. Types already in view-models. Leave `validateAgentAccessSearch` + `Route` in the route. | L | `VERIFIED` (`0fafd075d`) |
| **CQ2-09** | `src/routes/_operator/owner.credit.tsx` | 401 | Extract the 15-port wiring harness into `src/components/ae/console/owner-credit/`. `AeOwnerCredit` already exists (~475); do not decompose that card in this workflow. | M | `VERIFIED` (`0fafd075d`) |
| **CQ2-10** | `src/routes/_operator/owner.supply.connections.new.tsx` | 347 | Extract MCP/HTTP handoff UI to `src/components/ae/supply/connection-handoff/`. | M | `VERIFIED` (`0fafd075d`) |
| **CQ2-11** | `src/routes/privacy.remove-business.tsx` | 322 | Move schema/server fn to a module; extract the legal form leaf. | M | `VERIFIED` (`0fafd075d`) |

## Wave 2 close-out (Stage 5 provenance)

**Status:** `VERIFIED`  
**Commit:** `0fafd075d` — `refactor(quality): Campaign 2 Wave 2 - make page routes thin controllers (CQ2-07..CQ2-11)`

### Workflow results

All five routes are under the 80-line ceiling.

| ID | Route | Before | After | Scout | Composer |
| :--- | :--- | ---: | ---: | :--- | :--- |
| **CQ2-07** | `src/routes/_operator/activity.tsx` | 770 | **74** | `cffc42b6-620f-4285-ad52-79978260daf6` | `d9eed60c-be19-4dad-8317-3ead149d2c33` |
| **CQ2-08** | `src/routes/_operator/agent-access.tsx` | 519 | **66** | `4024bf61-c94f-47f6-9e6b-c3d9a8e6e461` | `9cfad68d-ec5a-4d8b-b1eb-e885e0681f79` |
| **CQ2-09** | `src/routes/_operator/owner.credit.tsx` | 401 | **33** | `2e7a9ade-de99-4492-956e-4ffa86bdb90e` | `048f3e4f-d38b-4940-ac8d-53ac20023595` |
| **CQ2-10** | `src/routes/_operator/owner.supply.connections.new.tsx` | 347 | **27** | `35582a26-0875-423a-a6cd-cb2f33df18d3` | `6e90a5ba-a05b-43a7-89b8-3b00da6c1d74` |
| **CQ2-11** | `src/routes/privacy.remove-business.tsx` | 322 | **34** | `42b6acd0-d81b-4ada-8933-30bc78c0467d` | `fc325c27-f56f-4ee2-8948-768c9e9fbb80` |

Provenance confirmed against the subagent transcripts, not from memory.

**Staging deviation (Orchestrator).** All five scouts ran in parallel; all five Composers ran in parallel. File budgets were disjoint, so the Orchestrator overruled the plan's sequential 07/08-then-09/10/11 staging once the scouts confirmed no file overlap.

### Delivered compounds

Every leaf is within the 150-line cap and every container is within 150.

- **CQ2-07 — `src/components/ae/activity/`:** `AeActivity.tsx` 121, `useAeActivity.ts` 352, `activity.contracts.ts` 111, `AeActivitySkeleton.tsx` 29; leaves `ActivityCallQueue` 133, `ActivityFilterBar` 137, `ActivityMonthlySummary` 52, `ActivityPaginationControl` 30, `ActivityUnavailableState` 33.
- **CQ2-08 — `src/components/ae/agent-access/home/`:** `AeAgentAccessHome.tsx` 131, `useAeAgentAccessHome.ts` 412, `agent-access-home.contracts.ts` 118, skeleton 19, six leaves 20 / 29 / 24 / 28 / 35 / 32.
- **CQ2-09 — `src/components/ae/console/owner-credit/`:** `AeOwnerCreditPage.tsx` 22, `useOwnerCredit.ts` 361. `AeOwnerCredit.tsx` was never opened — the workflow used a type-only import of its props, as specified.
- **CQ2-10 — `src/components/ae/supply/connection-handoff/`:** `AeConnectionHandoff.tsx` 77, `useConnectionHandoff.ts` 256, contracts 95, skeleton 26; leaves `HandoffStatusPanel` 16, `HttpCredentialForm` 58, `McpOAuthStartPanel` 35, `ReturnToAddTool` 18.
- **CQ2-11 — `src/components/ae/privacy/remove-business/`:** `AeRemoveBusinessPage.tsx` 16, `useRemoveBusinessPage.ts` 161, contracts 68, skeleton 5; leaves `CorrectionPathCards` 22, `RemovalRequestForm` 142. `removalSchema` and `openRemovalServer` were relocated onto the already-declared entry surface `src/modules/security/removal-dispute.functions.ts` (now 156 lines).

### Gate evidence (Wave 2)

Orchestrator ran these on Node 22 after all five workflows landed.

| Gate | Result |
| :--- | :--- |
| Lint (`npm run lint`, oxlint `--deny-warnings`) | Exit 0, clean |
| Typecheck (`npx tsc --noEmit`) | Exit 0 — **0 errors repo-wide** |
| `deps:check` | `no-circular` 0/0, `no-circular-capability-supply-internal` 0/0, `no-circular-via-barrel` 0/0 — all ok |
| RPC guards (`convex-api-kind-snapshot`, `convex-string-reference-ratchet`) | 2 files, 4 tests, all pass — **no fixture regeneration**; Wave 2 touched no Convex code |
| Full vitest | 742 passed / **3 failed** files; 6866 passed / **7 failed** tests / 25 skipped / 3 todo |

**Typecheck is a material improvement.** Repo-wide zero errors means the `catalogSearcher` error in `tests/unit/core-flow/native-platform-procure.test.ts` that Campaign 1 gated around is resolved, and the campaign no longer needs a “no new errors” carve-out for typecheck.

### React Doctor (Wave 2)

The pre-commit hook reported **0 errors and 3 warnings** across the 43 files it scanned in the Wave 2 commit. Orchestrator checked each warning against the pre-Wave-2 tree at `e140512a0` rather than assuming provenance: **all three are pre-existing patterns carried over verbatim, not new drift.**

1. `only-export-components` — `src/routes/_operator/agent-access.tsx:13` (`validateAgentAccessSearch`). The function was already exported from the route at line 56 before Wave 2, and `tests/unit/routes/agent-access-caller-continuation.test.tsx` imports it directly at line 104. Removing the export to satisfy the rule would break the very test CQ2-08 deliberately left unedited as its behaviour-preservation proof, and the scout's spec explicitly said to leave `validateAgentAccessSearch` in the route. **Export stays.**
2. and 3. `prefer-module-scope-pure-function` — `statusChipLabel` and `dateChipLabel` in `src/components/ae/activity/useAeActivity.ts`. Both were nested arrow functions inside the component in the original route (lines 340 and 347 at `e140512a0`) and were moved verbatim.

**Disposition: not fixed, deliberately.** “React Doctor warning cleanup” is on this register's standing *Do not touch* list, so hoisting the two chip-label helpers is out of Campaign 2's scope even though it would be a safe change. Recorded as a candidate for a later campaign.

**Wave 2 introduced zero new React Doctor findings.**

### Test failure attribution

The 7 failures are exactly the inherited Known Red Baseline already documented above — `module-boundaries.test.ts` (3), `module-boundaries-ratchet.test.ts` (1), `native-platform-procure.test.ts` (3). None are campaign-owned.

Orchestrator verified the attribution rather than assuming it:

- Every module-boundary violation message names only `procure-engine`, `procure.actions`, or `tool-reranker`.
- A targeted grep across the full test output for Wave 2 surfaces — `connection-handoff`, `remove-business`, `owner-credit`, `agent-access/home`, `components/ae/activity` — returned **zero** matches.
- The `module-boundaries-ratchet` failure is `expected 1 to be less than or equal to 0`, caused by the single `testOnlyWhiteBoxExceptions` entry `market-directory-reranker-tests` for `x402-directory-reranker.ts` — concurrent agent work.

### Module-boundary manifest untouched

**Wave 2 required no `src/modules/module-boundaries.ts` change at all.** Every new file lives under `src/components/ae/`, which are consumers rather than module entry surfaces, and `removal-dispute.functions.ts` was already a declared `security` entry surface. The two dirty edits in that manifest — adding `decision-engine` to `market`'s `allowedDependencies`, and the white-box exception — are both concurrent reranker work, not campaign-owned.

### Deviations (actual vs target spec)

1. **Five hooks exceed the 300-line soft guideline.** `.cursor/rules/leaf-and-component-cleanliness.mdc` §4 sets 300 as a warning threshold: `useAeAgentAccessHome` 412, `useOwnerCredit` 361, `useAeActivity` 352, `useConnectionHandoff` 256 (vs a ~160 estimate), `useRemoveBusinessPage` 161 (vs a ~120 estimate). **Orchestrator accepted all five.** The campaign's enforced bar is the 1,000-line hard ceiling and the 80-line route ceiling; 300 is a warning threshold, not a gate. The CQ2-07 scout specifically warned that separating filters from queues from pagination would desynchronise chip counts, tables, and CSV export. Splitting further to satisfy a soft number would risk correctness for cosmetics. Logged as **accepted debt**, revisitable by a later campaign.
2. **CQ2-10 idempotency-key seeding.** The React refs lint rule forbids `??=` during render, so idempotency keys are seeded by `useRef` initializers from the first-mount `loaded` value, with `??=` retained in the handlers. Orchestrator independently read the hook and confirmed the resulting keys are stable per attempt for HTTP (`provider-http:${attemptRef}`) and MCP (`provider-mcp-oauth:${attemptRef}`), while cancel still mints a fresh `cancel:${crypto.randomUUID()}` per invocation — identical semantics to the monolith.
3. **CQ2-08 test file untouched.** `tests/unit/routes/agent-access-caller-continuation.test.tsx` was left completely unedited, which is the strongest available evidence that the extraction leaked no behaviour.

---

# Wave 3: Remaining page routes (verified)

Wave 2 met at `0fafd075d`. Wave 3 applied the same incision on the seventeen staffed routes that were over 80 lines at the 20 Sep census. **`developers.discovery.tsx` remains skipped** (discovery dirt). Exempt: `src/routes/api*`, `src/routes/__root.tsx`. Do not add or rename routes.

| ID | Route(s) | Pre-wave lines (max) | Status |
| :--- | :--- | ---: | :---: |
| **CQ2-12** | `terms.tsx`, `privacy.tsx`, `support.tsx` | 159 | `VERIFIED` (`176385637`) |
| **CQ2-13** | `sign-in.$.tsx` | 87 | `VERIFIED` (`176385637`) |
| **CQ2-14** | `sign-up.$.tsx` | 126 | `VERIFIED` (`176385637`) |
| **CQ2-15** | `onboarding.tsx`, `status.tsx` | 275 | `VERIFIED` (`176385637`) |
| **CQ2-16** | `market.tsx` | 85 | `VERIFIED` (`176385637`) |
| **CQ2-17** | `tools.$toolRef.tsx`, `tools.$providerHost.$slug.tsx` | 176 | `VERIFIED` (`aa0cbba72`) |
| **CQ2-18** | `$slug.tsx` | 183 | `VERIFIED` (`b25e89e80`) |
| **CQ2-19** | `fund.$fundingSessionId.tsx` | 94 | `VERIFIED` (`52df868b0`) |
| **CQ2-20** | `owner.supply.connections.oauth.callback.tsx` | 99 | `VERIFIED` (`fea40841a`) |
| **CQ2-21** | `owner.operations.new.tsx` | 132 | `VERIFIED` (`fea40841a`) |
| **CQ2-22** | `owner.operations.$toolRef.tsx` | 204 | `VERIFIED` (`fea40841a`) |
| **CQ2-23** | `agent-access.authorize.tsx` | 188 | `VERIFIED` (`fea40841a`) |
| **CQ2-24** | `admin.index-health.tsx` | 235 | `VERIFIED` (`fea40841a`) |

## Wave 3 close-out (Stage 5 provenance)

**Status:** `VERIFIED`  
**Commits (oldest → newest):**

| Batch | Commit | Message |
| :--- | :--- | :--- |
| Wave 3 Batch A | `176385637` | `refactor(quality): Campaign 2 Wave 3 batch A - thin eight more page routes (CQ2-12..CQ2-16)` |
| Wave 3 Batch B | `aa0cbba72` | `refactor(quality): Campaign 2 Wave 3 batch B - thin the coupled tool detail routes (CQ2-17)` |
| CQ2-18 | `b25e89e80` | `refactor(quality): Campaign 2 Wave 3 - thin the public business route ($slug) (CQ2-18)` |
| CQ2-19 | `52df868b0` | `refactor(quality): Campaign 2 Wave 3 - thin the funding return route (CQ2-19)` |
| Wave 3 last five | `fea40841a` | `refactor(quality): Campaign 2 Wave 3 - thin the last five operator routes (CQ2-20..CQ2-24)` |

**Aggregate diff (`0fafd075d`..`fea40841a`):** 78 files changed, 2,896 insertions, 1,869 deletions.

### Workflow results

All seventeen staffed routes are at or under the 80-line ceiling (measured 21 Sep 2026).

| ID | Route | Before | After | Scout | Composer |
| :--- | :--- | ---: | ---: | :--- | :--- |
| **CQ2-12** | `src/routes/terms.tsx` | 130 | **33** | UUID not recovered | `5f256202-f08a-45ac-aa60-55480664ffb9` |
| **CQ2-12** | `src/routes/privacy.tsx` | 159 | **39** | UUID not recovered | `5f256202-f08a-45ac-aa60-55480664ffb9` |
| **CQ2-12** | `src/routes/support.tsx` | 118 | **35** | UUID not recovered | `5f256202-f08a-45ac-aa60-55480664ffb9` |
| **CQ2-13** | `src/routes/sign-in.$.tsx` | 87 | **30** | UUID not recovered | UUID not recovered |
| **CQ2-14** | `src/routes/sign-up.$.tsx` | 126 | **30** | UUID not recovered | UUID not recovered |
| **CQ2-15** | `src/routes/onboarding.tsx` | 275 | **28** | UUID not recovered | UUID not recovered |
| **CQ2-15** | `src/routes/status.tsx` | 168 | **26** | UUID not recovered | UUID not recovered |
| **CQ2-16** | `src/routes/market.tsx` | 85 | **79** | UUID not recovered | UUID not recovered |
| **CQ2-17** | `src/routes/tools.$toolRef.tsx` | 176 | **67** | `f837cb05-80f9-41a6-b7e1-63e07994c599` | `86a308c9-e8b6-4e02-924d-076877b73746` |
| **CQ2-17** | `src/routes/tools.$providerHost.$slug.tsx` | 97 | **46** | `f837cb05-80f9-41a6-b7e1-63e07994c599` | `86a308c9-e8b6-4e02-924d-076877b73746` |
| **CQ2-18** | `src/routes/$slug.tsx` | 183 | **66** | `3c5ec557-4e80-45f2-b049-23bfef71790b` | `6b5f375d-b229-46f3-addf-a2f79400e3d2` |
| **CQ2-19** | `src/routes/fund.$fundingSessionId.tsx` | 94 | **21** | `4beffe5e-c802-40ee-bcea-51a35460b819` | `7d0db7ba-7748-4ae3-8a97-6c85d492235f` |
| **CQ2-20** | `src/routes/_operator/owner.supply.connections.oauth.callback.tsx` | 99 | **60** | `c3f25525-7d2b-4614-9722-ded189c0a7a5` | `bf744b08-96d7-4c5d-b4d0-3de4b8202b85` |
| **CQ2-21** | `src/routes/_operator/owner.operations.new.tsx` | 132 | **75** | `384006ab-d9e7-4ead-b850-b938a506aed2` | `aa4dad09-7b13-4be8-b15b-c8a1d5ee9f98` |
| **CQ2-22** | `src/routes/_operator/owner.operations.$toolRef.tsx` | 204 | **53** | `1156a703-0daa-47a4-9e94-c0554450c45c` | `cf9151ed-5f75-4e5d-912f-0737fe488f95` |
| **CQ2-23** | `src/routes/agent-access.authorize.tsx` | 188 | **38** | `3cc8cc11-08d2-4337-a92b-9475e68aaa81` | `4b485754-971a-4e5c-9f2b-b700f784304a` |
| **CQ2-24** | `src/routes/_operator/admin.index-health.tsx` | 235 | **60** | `519269c4-acd1-445e-9503-916b35389eae` | `43faa2e7-1980-45b3-bc62-c2679c2b930c` |

**Skipped (not staffed):** `src/routes/developers.discovery.tsx` — still **197** lines; discovery dirt.

Provenance for `CQ2-17` – `CQ2-24` confirmed against subagent transcripts supplied at close-out; Batch A scout/composer UUIDs recovered only for `CQ2-12` Composer.

### Post-wave page-route census (21 Sep 2026)

`find src/routes -name '*.tsx' ! -name '__root.tsx'` — every non-exempt page route is ≤ 80 lines **except** the recorded skip:

| Outcome | Detail |
| :--- | :--- |
| Over 80 (page route) | **1** — `src/routes/developers.discovery.tsx` at **197** (skipped until discovery dirt) |
| At ceiling (staffed) | **17** routes thinned in Wave 3; largest landed route is `market.tsx` at **79** |
| Exempt | `src/routes/api*` and `src/routes/__root.tsx` unchanged |

**Wave 3 thesis met:** the staffed backlog from the 20 Sep census is cleared; only the pre-declared discovery skip remains over 80.

### Gate evidence (Wave 3)

Same bar as Wave 2. Orchestrator re-checked on Node 22 after `fea40841a` landed.

| Gate | Result |
| :--- | :--- |
| Lint (`npm run lint`, oxlint `--deny-warnings`) | Exit 0, clean |
| Typecheck (`npx tsc --noEmit`) | Exit 0 — **0 errors repo-wide** (healed `252bed4bb`: omit-spread `review` at the `admin.index-health.tsx` route call site; `fea40841a` had left one `exactOptionalPropertyTypes` mismatch from `CQ2-24`) |
| `deps:check` | Expected pass at 0/0/0 — Wave 3 touched no forbidden manifests |
| RPC guards | Not required — **no Convex RPC registrations changed** in Wave 3 |
| Full vitest | **Inherited Known Red Baseline unchanged** — still **7 failures in 3 files** (see §1); no Wave 3 surface appears in failure output |

Typecheck on this table reflects the post-`252bed4bb` heal (see deviation #6). Orchestrator eval census and gate re-check: **Evaluation** section below. **Cold review** recorded in the section after Evaluation.

### React Doctor (Wave 3)

Pre-commit on `fea40841a` (`CQ2-20` – `CQ2-24` scope): **0 errors, 2 warnings** — both pre-existing patterns, **not fixed** (standing *Do not touch* list).

1. `zod-v4-prefer-top-level-string-formats` — admin index-health search schema.
2. `tanstack-start-loader-parallel-fetch` — OAuth callback loader; sequential read-then-complete is required.

Earlier Wave 3 commits may have carried additional warnings (e.g. `market.tsx` — see deviations). **Wave 3 did not open a warning-cleanup wave.**

### Test failure attribution

Unchanged from Wave 2 — concurrent-agent-owned procure / `tool-reranker` baseline only. Wave 3 routes and new `src/components/ae/` compounds are not named in any failure.

### Module-boundary manifest

Wave 3 did not require a campaign-owned edit to `src/modules/module-boundaries.ts`. SEO head helpers landed on an existing `seo` entry surface (`CQ2-18`).

### Deviations (actual vs target spec)

1. **CQ2-16 `market.tsx`.** `MarketPending` / `MarketError` stayed in the route (~5 lines). Scout refused a full compound for that residue; two `no-multi-comp` warnings accepted.
2. **CQ2-18 `$slug.tsx`.** `head` moved to `buildPublicBusinessPageHead` on `src/modules/seo/public-route.ts` because a 43-line inline SEO block made an ≤80 route unreachable. Did **not** reuse `buildPublicPageHead` — that would change robots from `index` / `noindex` to `index,follow` and alter title/description. `degrade` fallback keeps `retryable` literal `true` via trailing `as const`.
3. **CQ2-17 tool detail pair.** Route re-exports `PublicToolDetail` because `tool-detail-route.test.tsx` named-imports it. Slug loader still does not await admission. `DirectoryToolCanonicalLoaderData.admission` typed `Promise<T> | undefined` for `exactOptionalPropertyTypes`.
4. **CQ2-19 funding return.** One-file cut to `AeFundingReturnPage`; `check_not_found` still wipes confirmed funding (behaviour preserved).
5. **CQ2-21 `owner.operations.new.tsx`.** Asserts page search type because parent layout adds operator search keys under `exactOptionalPropertyTypes`.
6. **CQ2-24 `admin.index-health.tsx`.** Kept `createServerFn` on the route; did not rename `operationRef` to `toolRef`. `fea40841a` left one `exactOptionalPropertyTypes` mismatch on the optional `review` prop; **healed** in `252bed4bb` by omit-spreading `review` at the route call site so `npx tsc --noEmit` is again 0 errors repo-wide.
7. **CQ2-23 `agent-access.authorize.tsx`.** `ssr: false` preserved; problem-code reader stays private; 5xx still throws even when the body contains `expired_token`.
8. **CQ2-15 `status.tsx`.** Pre-wave React Doctor `loader`-after-`head` ordering issue was resolved as part of the thin-controller extract (property reorder in the same file), not as a separate fix wave.

---

# Evaluation (Stage 5 — Orchestrator, 21 Sep 2026)

**Campaign status at eval write-up:** eval complete; cold review was still outstanding (now recorded below).

All measurements below used Node 22 unless noted.

### Post-campaign census (21 Sep 2026)

**1,000-line census** — `find` on `src` and `convex`, exclude `_generated` and `*.test.*`:

| Outcome | Detail |
| :--- | :--- |
| Over 1,000 (hand-written) | **1** — `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` at **1,038** at C2 close; **1,041** on current unified `main` (A10 deferral) |
| Generated excluded | `src/routeTree.gen.ts` at **2,745** — not counted |

**80-line page-route census** — `src/routes/*.tsx`, exclude `__root.tsx` and `api*`:

| Outcome | Detail |
| :--- | :--- |
| Over 80 | **1** — `src/routes/developers.discovery.tsx` at **197** (recorded skip; discovery dirt) |

**Convex `*.test.*` over 1,000** (open scope question — see verdict below):

| File | Lines |
| :--- | ---: |
| `convex/agentAccessOAuth.test.ts` | 2,383 |
| `convex/agentAccessPrincipals.test.ts` | 1,435 |
| `convex/securityAccountHistory.test.ts` | 1,233 |

### Gate evidence (eval re-check, after `252bed4bb`)

Orchestrator re-ran implementation gates on Node 22 after the `CQ2-24` typecheck heal landed.

| Gate | Result |
| :--- | :--- |
| Lint (`npm run lint`, oxlint `--deny-warnings`) | Exit 0, clean |
| Typecheck (`npx tsc --noEmit`) | Exit 0 — **0 errors repo-wide** |
| `deps:check` | `no-circular` 0/0, `no-circular-capability-supply-internal` 0/0, `no-circular-via-barrel` 0/0 — all ok |
| RPC guards (`convex-api-kind-snapshot`, `convex-string-reference-ratchet`) | 2 files, 4 tests, all pass |

**Vitest** was not re-baselined for this eval pass. The inherited Known Red Baseline in §1 remains authoritative: **7 failures in 3 files** (concurrent procure / `tool-reranker` work), unchanged from Wave 2 and Wave 3 close-out.

### React Doctor (eval disposition)

On the commits through `252bed4bb`, React Doctor reported **0 errors**. Warnings observed are **pre-existing**, not campaign-opened hygiene:

1. `zod-v4-prefer-top-level-string-formats` — admin index-health search schema.
2. Sequential OAuth loader awaits in the supply OAuth callback route — **required** ordering (read-then-complete), not an independent parallel-fetch candidate.

“React Doctor warning cleanup” remains on the standing *Do not touch* list. **Not fixed** as part of Campaign 2.

### Thesis verdict (Orchestrator)

| Ceiling | Campaign metric | Verdict |
| :--- | :--- | :--- |
| Hard 1,000-line ceiling (`src/` + `convex/`, hand-written) | Wave 1 — at most one file over 1,000, and it is the recorded deferral | **MET** |
| 80-line page-route controllers | Wave 3 — every non-exempt page route ≤ 80 except the recorded skip | **MET** |

This eval does **not** assess product behaviour, Jev journeys, or commercial outcomes. It records structure and gate evidence for the ceiling campaign only.

### Open scope question (do not resolve here)

Campaign 2 Wave 1 explicitly excluded `*.test.*` from the 1,000-line success metric. `.cursor/rules/leaf-and-component-cleanliness.mdc` §4 states the hard ceiling applies to “no file in `src/` or `convex/`” without carving out tests. Three Convex test files exceed 1,000 lines (census above). **The reader must decide** whether that is a violation of §4 or out of Campaign 2 scope. If the rule is read as covering tests, recommend a **later campaign** to split or ratchet them — do not fold that work into this close-out.

---

# Cold review (Stage 5 — Grok, 21 Sep 2026)

**Reviewer:** Grok `b909c121-00ca-457b-a4c4-fff39f48da31`  
**Access:** none to this register, the maturity register, the protocol, the ceilings design, or any plan file. The reviewer independently re-measured both ceilings against the tree as it stood on 21 Sep 2026.

### What the reviewer scored

**(a) 1,000-line production — FAIL** — one citation only: `src/modules/capability-supply/internal/cdp-x402-payment-signer.ts` at **1,038**. Current unified `main` measurement is **1,041**; still the recorded A10 deferral.

**(b) 80-line page routes — FAIL** — one citation only: `src/routes/developers.discovery.tsx` at **197**.

The reviewer correctly treated `routeTree.gen.ts`, `__root.tsx`, and `api*` as non-fails. It separately listed the three Convex test files over 1,000 (`convex/agentAccessOAuth.test.ts`, `convex/agentAccessPrincipals.test.ts`, `convex/securityAccountHistory.test.ts`) — same set as the Evaluation census.

### Orchestrator verdict

The cold review **agrees with the Evaluation census**. The two FAILs are exactly the two recorded exceptions (Wave 1 deferral; Wave 3 skip). Under Campaign 2's success metrics both ceilings are **MET**. The reviewer did not have those exceptions, so a literal FAIL on each ceiling is the correct cold result and is not a surprise miss.

| Ceiling | Cold literal result | Campaign metric | Orchestrator |
| :--- | :---: | :--- | :---: |
| Hard 1,000-line ceiling (hand-written production) | FAIL (1 file) | Wave 1 — at most one over 1,000, and it is the deferral | **MET** |
| 80-line page-route controllers | FAIL (1 route) | Wave 3 — every non-exempt route ≤ 80 except the skip | **MET** |

Wave 1–3 remain **VERIFIED**. Wave 3 is not reopened. No Campaign 3 is opened here.

### Sampled regressions (accepted leftover-cut deviations)

The reviewer spot-checked extracted surfaces. None of the following are new campaign breaks — they are documented one-file or pre-existing residue from scout cuts:

1. **`AeOwnerMcpOAuthCallback.tsx`** — the refused-code union lives in the props type. CQ2-20 scout chose a one-file leftover; no separate contracts file.
2. **`AeFundingReturnPage.tsx`** — houses `publicFundingSchema` plus fetch. CQ2-19 scout chose a one-file leftover; types already live in `funding-return.view-model.ts`; container fetch is allowed.
3. **`AeFundingReturnState.tsx`** — formats `formatDisplayAmount` in render. **Pre-existing leaf**, not moved by Campaign 2; out of scope.
4. **`PublicToolDetail.tsx`** — re-exports `PublicToolDetailProps` so the route can re-export `PublicToolDetail` for `tool-detail-route.test.tsx` (CQ2-17 deviation #3).

### Spot-check confirmations

- Sampled public, OAuth, and funding routes still keep loaders, `head`, and `Route.use*` on the route file.
- No sampled leaf called `useQuery`, `useMutation`, or `useServerFn`.
- Convex façades `capabilityQuotes.ts` and `moneyAccountFunding.ts` still export their public RPC names.

### Campaign close

**Status:** **CLOSED** — Evaluation written 21 Sep 2026; cold review recorded 21 Sep 2026. Both ceiling success metrics **MET** with the two standing exceptions unchanged.

---

## Out of campaign (from re-audit leftover list)

See the design's Cuts table. Standing reminder: Campaign 2 does not inherit Campaign 1's outstanding-work pile. Those items stay on the predecessor register unless a later campaign claims them.
