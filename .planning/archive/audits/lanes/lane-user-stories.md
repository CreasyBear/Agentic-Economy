# L7 User Stories Audit — Requirements vs Observable Outcomes

**Scope:** `.planning/REQUIREMENTS.md` P1-R1 through P5-R8 — map each requirement to what a human, owner, builder, or agent can **observe or do**, versus proof artifacts and deployment reality.  
**Evidence base:** Phase VERIFICATION docs (`01`–`04`, `06`), `STATE.md` blockers, `01-DEPLOY-READBACK-EVIDENCE.md`, `01-ALPHA-EVIDENCE.md`, `02-DEPLOY-SMOKE-BLOCKERS.md`, `02-VERIFICATION.md`, `03-VERIFICATION.md`, `04-VERIFICATION.md`  
**Audit date:** 2026-06-30  
**Verdict:** **37 requirements have implementation and local/source proof; 28 lack deployed or real-user proof. Phase 5 has partial module code but no active user surface.**

## ROI tier key

| Tier | Meaning |
|:---:|---|
| **S** | Stop-ship — blocks internal alpha, launch claim, or primary conversion path |
| **A** | High — unlocks a core user story once deployed proof exists |
| **B** | Medium — important but downstream of S/A blockers |
| **C** | Low / engineering-only — no direct end-user story until a later phase |

## Requirements map

| Req | Observable user outcome | Proof artifact(s) | Code | Local/source proof | Deployed / real-user proof | Gap class | ROI |
|---|---|---|:---:|:---:|:---:|---|:---:|
| **P1-R1** | CI/maintainer: banned imports and future surfaces fail the build before ship | `01-VERIFICATION.md` R1; `npm run test:imports`, `test:source-mining` | Yes | PASS | N/A (non-user) | None | **C** |
| **P1-R2** | System persists durable business/catalog/registry state with typed contracts | `01-VERIFICATION.md` R2; Convex codegen; `test:types`, `test:ts-standards` | Yes | PASS | Convex deploy `loyal-peacock-107` codegen only | No end-user story | **C** |
| **P1-R3** | **Owner** claims a business and publishes without ABN; invalid paths fail safely | `01-VERIFICATION.md` R3; claim integration + local E2E; deploy smoke `/claim` | Yes | PASS (Clerk bypass local) | Deploy smoke PASS on `/claim`; **no row in 5-owner alpha inventory** | Code + deploy smoke; **no real owner attempt** | **S** |
| **P1-R4** | **Customer** sees truthful public service page; **owner** sees separate status/readback | `01-VERIFICATION.md` R4; local E2E; deploy smoke `/{slug}` | Yes | PASS | Deploy smoke PASS (`agentic-economy-r10-smoke` slug) | Smoke slug ≠ friendly-owner activation | **A** |
| **P1-R5** | **Customer/agent** browses registry, search, public API without private fields | `01-VERIFICATION.md` R5; API/registry tests; deploy smoke | Yes | PASS | Deploy smoke PASS (`/registry`, `/api/businesses*`) | None for spine slice | **A** |
| **P1-R6** | **Operator** sees projection failures, retries repair, stale index health | `01-VERIFICATION.md` R6; admin index-health tests; deploy smoke admin routes | Yes | PASS | Deploy smoke PASS (admin storage-state) | Operator-only; no customer story | **B** |
| **P1-R7** | **Agent/builder** reads AE-hosted UCP, llms, sitemap, robots from eligible catalog | `01-VERIFICATION.md` R7; SEO/discovery tests; deploy smoke | Yes | PASS | Deploy smoke PASS | None for Phase 1 discovery | **A** |
| **P1-R8** | **Operator** suppresses listing; non-admin denied; actions audited | `01-VERIFICATION.md` R8; admin/security tests; deploy smoke | Yes | PASS | Deploy smoke PASS | Operator-only | **B** |
| **P1-R9** | **Public** sees no booking/payment/settlement execution — descriptor-only lifecycle | `01-VERIFICATION.md` R9; lifecycle/copy/import gates | Yes | PASS | Copy scans on deploy paths not re-run per owner | Negative guarantee; no user action | **C** |
| **P1-R10** | **Five friendly owners** complete claim→publish→status→share; GTM/alpha readiness | `01-VERIFICATION.md` R10; `01-CLOSEOUT.md`, `01-DEPLOY-READBACK-EVIDENCE.md`, `01-MATT-REVIEW.md` | Yes | Technical PASS | **`01-ALPHA-EVIDENCE.md`: 0/5 owner rows**; internal-alpha NOT ready | **Code + deploy; no user proof** | **S** |
| **P2-R1** | **Customer** sees inquiry form only when service is published, support-ready, and eligible | `02-VERIFICATION.md` P2-R1; unit/support-record tests | Yes | PASS (local) | Deploy: `/plumbing-demo/inquiry` → **Inquiry unavailable / not public** | **Code + local; deployed story fails** | **S** |
| **P2-R2** | **Customer** submits inquiry; gets receipt; abuse/duplicate paths fail safely | `02-VERIFICATION.md` P2-R2; Convex runtime + E2E | Yes | PASS | No deployed submit proof (form unreachable) | **Code + local; no deployed submit** | **S** |
| **P2-R3** | **Owner** lists and opens inbox threads without cross-owner leakage | `02-VERIFICATION.md` P2-R3; owner E2E + Convex tests | Yes | PASS (local) | Routes live (`/owner/inquiries` 200) but **no inquiry-created deployed thread** | **Code + local; no live inbox data** | **A** |
| **P2-R4** | **Owner** marks read, replies, closes; stale/wrong-owner rejected | `02-VERIFICATION.md` P2-R4; owner E2E + CSRF tests | Yes | PASS (local) | No deployed owner action proof | **Code + local; no deployed reply** | **A** |
| **P2-R5** | **Owner** receives notification; failure/readback visible; message truth preserved | `02-VERIFICATION.md` P2-R5; outbox unit tests | Yes | PASS (local) | `test:provider-smoke:resend/novu` **fail-fast**; missing outbox secret + dispatch IDs | **Code + local; no provider delivery** | **S** |
| **P2-R6** | **Public/agent** never sees inquiry body, contact, or provider secrets | `02-VERIFICATION.md` P2-R6; redaction E2E | Yes | PASS (local) | Deploy redaction not re-proven end-to-end | Local-only privacy proof | **B** |
| **P2-R7** | **Customer/owner** usable inquiry/inbox UI on mobile, keyboard, empty/error states | `02-VERIFICATION.md` P2-R7; E2E 24 + a11y 6; Playwright PNGs | Yes | PASS (local) | No deployed UI walkthrough with real data | **Code + local screenshots** | **A** |
| **P2-R8** | **End-to-end:** customer inquiry → owner read → reply → notification → audit reconstruct | `02-VERIFICATION.md` P2-R8 — **FAILED** | Yes | Local reconstruction PASS | **No** `02-DEPLOY-SMOKE-EVIDENCE.md`, `02-SUMMARY.md`, `02-UAT.md`; smokes blocked per `02-DEPLOY-SMOKE-BLOCKERS.md` | **Primary conversion story unproven in prod** | **S** |
| **P3-R1** | **Builder** sees discovery support matrix with honest shipped/unavailable/deferred states | `03-VERIFICATION.md` P3-R1; support matrix unit tests | Yes | PASS | No deployed matrix artifact | **Code + local** | **B** |
| **P3-R2** | **Builder** downloads schema/examples/fixtures matching live public API DTOs | `03-VERIFICATION.md` P3-R2; route-parity integration tests | Yes | PASS | Deploy routes return 200 (`/api/discovery/*`) but **no parity capture artifact** | **Code + local; no deployed parity doc** | **A** |
| **P3-R3** | **Builder** reads route health, schema version, cache freshness, blockers on `/developers/discovery` | `03-VERIFICATION.md` P3-R3; executed readback tests | Yes | PASS | Page live (200) but **no deployed readback evidence file** | **Code + local** | **A** |
| **P3-R4** | **Agent** sees AE-hosted UCP only; no false merchant-origin claims | `03-VERIFICATION.md` P3-R4; copy/SEO tests | Yes | PASS | Deploy discovery routes exist; overclaim not re-scanned on prod | Local honesty proof only | **B** |
| **P3-R5** | **Builder** optional MCP/OpenAPI projections are read-only if shipped | `03-VERIFICATION.md` P3-R5; projection gate tests | Yes | PASS (withheld) | N/A — projections not shipped | Intentional deferral | **C** |
| **P3-R6** | **Builder** told API keys unavailable unless separate gate passes | `03-VERIFICATION.md` P3-R6 | Yes | PASS | N/A — keys unavailable by design | None | **C** |
| **P3-R7** | **Operator** telemetry captures route/status without private payloads | `03-VERIFICATION.md` P3-R7; telemetry unit tests | Yes | PASS | No deployed telemetry capture | Engineering story | **C** |
| **P3-R8** | **Builder/agent smoke** proves current public facts and no platform bloat | `03-VERIFICATION.md` P3-R8 — local closeout SATISFIED | Yes | PASS (E2E/API smoke local) | **`03-VERIFICATION.md` residual risk: no deployed Phase 3 artifact** | **Code + local; no deployed builder proof** | **A** |
| **P4-R1** | **Product** offers one owner-pending action (`contact-follow-up`), not a catalog | `04-VERIFICATION.md` P4-R1; `04-ACTION-SELECTION.md` | Yes | PASS | No deployed action selection proof | Local-only | **B** |
| **P4-R2** | **Owner/system** creates durable proposal with audit and idempotency | `04-VERIFICATION.md` P4-R2; Convex runtime tests | Yes | PASS | No deployed proposal ID smoke | **Code + local** | **A** |
| **P4-R3** | **Policy** returns review/refused/expired/proof_gap without provider side effects | `04-VERIFICATION.md` P4-R3 | Yes | PASS | N/A until deployed proposal | Local-only | **B** |
| **P4-R4** | **Owner** approves/rejects with visible consequence in UI | `04-VERIFICATION.md` P4-R4; owner E2E/a11y | Yes | PASS (local fixture) | Routes live (`/owner/actions` 200) but **no deployed decision proof** | **Code + local** | **A** |
| **P4-R5** | **Owner-approved** attempt produces receipt or proof-gap readback | `04-VERIFICATION.md` P4-R5; Convex runtime | Yes | PASS (local) | No deployed attempt/receipt | **Code + local** | **A** |
| **P4-R6** | **Owner/operator** reconstructs full action chain from source | `04-VERIFICATION.md` P4-R6; route + admin tests | Yes | PASS | No deployed reconstruction capture | **Code + local** | **B** |
| **P4-R7** | **Public/discovery** says owner-pending only; no autonomous/payment claims | `04-VERIFICATION.md` P4-R7; copy/source-mining | Yes | PASS | No deployed public claim scan | Local-only | **B** |
| **P4-R8** | **Closeout** covers stale, concurrent, wrong-owner, proof-gap, success paths | `04-VERIFICATION.md` P4-R8 — local SATISFIED | Yes | PASS | **`04-VERIFICATION.md`: deployed_proof not_claimed** | **Code + local; no deployed closeout** | **A** |
| **P5-R1** | **Owner/operator** knows selected rail (Autumn Cloud + Stripe PSP) and boundaries | `05-MONEY-RAIL-DECISION.md`; plan `05-01` | Decision doc only | N/A | No user-facing surface | Spec only | **B** |
| **P5-R2** | **Public** catalog/registry/discovery free of unapproved money fields | Source-mining quarantine (Phase 1 gates) | Yes | PASS (Phase 1) | Not re-verified post-billing module WIP | Module exists; routes parked | **C** |
| **P5-R3** | **Owner** starts billing from server-created checkout, not client authority | Plan `05-01`; `src/modules/billing/` | Partial | Unit/integration planned in plan | **Billing routes not in `routeTree.gen.ts`** | **Code partial; no user path** | **S** |
| **P5-R4** | **System** ingests signed Autumn/Stripe webhooks without granting entitlement directly | Parked `api.billing.*-webhook.ts`; `billing-provider.ts` WIP | Partial | Local tests in plan, **no `05-VERIFICATION.md`** | Routes parked; `test:provider-smoke:autumn-stripe` fail-loud | **No deployed ingest proof** | **S** |
| **P5-R5** | **Owner** sees append-only billing state and receipts | Parked `owner.billing*` routes | Partial | Projections tests if run | Routes not mounted | **No user surface** | **A** |
| **P5-R6** | **Owner** sees refund/reversal/dispute next actions | Plan + module projections | Partial | Local only | Not shippable | **No user proof** | **B** |
| **P5-R7** | **Operator** reconciles stale/missing billing records | Parked `admin.monetization*` | Partial | Local only | Not shippable | **No operator proof** | **B** |
| **P5-R8** | **Public/GTM** paid claims pass only after provider readback + smoke | `test:provider-smoke:autumn-stripe`; plan closeout | Harness only | Expected fail-loud | **No verification doc; smoke not green** | **Entire paid story unproven** | **S** |

## Code without deployed or real-user proof

Requirements where **implementation exists** (or partial for P5) but **no production or real-user evidence** supports the user story:

| Phase | Requirements | What users cannot do in prod today |
|---|---|---|
| **P1** | P1-R3, P1-R4, P1-R10 | Real friendly owners have not completed activation; smoke slug ≠ alpha cohort |
| **P2** | P2-R1 – P2-R7, P2-R8 | Customer cannot send inquiry on deployed eligible slug; owner cannot receive real Resend/Novu notification; closeout chain unproven |
| **P3** | P3-R1 – P3-R4, P3-R8 | Builder cannot cite deployed route-parity/readback artifact; local-only honesty |
| **P4** | P4-R2 – P4-R6, P4-R8 | Owner cannot complete approve→attempt→receipt on deployed deployment |
| **P5** | P5-R3 – P5-R8 | Owner cannot activate paid plan; operator cannot reconcile live billing; public paid claims blocked |

**Engineering-only (code + local proof, no user story expected yet):** P1-R1, P1-R2, P1-R9, P3-R5, P3-R6, P3-R7, P5-R1, P5-R2.

## STATE.md blockers (user-story lens)

| Blocker | User story impact |
|---|---|
| Phase 1: **0/5 owner activation rows** | No evidence that real owners complete claim→publish→share; blocks internal alpha and launch narrative |
| Phase 2: deployed support smoke + Resend/Novu smokes | Primary marketplace conversion (qualified inquiry) broken on deployed slugs |
| Phase 3: no deployed readback artifact | Builder/agent trust in live parity unverified |
| Phase 5: `test:provider-smoke:autumn-stripe` + parked billing routes | Paid activation story not reachable |
| Phase 6 (out of P1–P5 scope): Stripe business-action smoke | Separate receipt story; also source/local only |

## Top 5 gaps (by user-story ROI)

| Rank | Gap | Req | ROI | Why it matters | Next proof artifact |
|:---:|---|---|:---:|---|---|
| **1** | **Deployed inquiry unavailable** — customer hits `Inquiry unavailable` / service not public | P2-R1, P2-R2, P2-R8 | **S** | Blocks the first owned conversion (qualified inquiry) on the live host | Published eligible slug + complete `human_inquiry_owner_inbox` support row; green `npm run test:phase2-support-smoke`; `02-DEPLOY-SMOKE-EVIDENCE.md` |
| **2** | **Zero real owner activations (0/5)** | P1-R10 (also P1-R3) | **S** | No proof real ICP owners complete the spine; blocks internal alpha and GTM | Five rows in `01-ALPHA-EVIDENCE.md` with activation readback, share/interest, friction notes |
| **3** | **No live owner notification delivery** | P2-R5, P2-R8 | **S** | Owner never receives inquiry in prod; breaks trust in the product promise | Configure outbox secret + provider env; inquiry-created dispatch IDs; green Resend + Novu provider smokes |
| **4** | **Builder/agent deployed discovery parity unclaimed** | P3-R2, P3-R3, P3-R8 | **A** | Agents cannot rely on deployed schema/route health matching code | Captured deployed smoke artifact for `/developers/discovery` + `/api/discovery/*` parity |
| **5** | **Paid activation unreachable** — billing routes parked, provider smoke fail-loud | P5-R3 – P5-R8 | **S** | Owner paid-activation story does not exist on active route tree | Mount billing routes; execute `05-01` plan; green `npm run test:provider-smoke:autumn-stripe`; `05-VERIFICATION.md` |

## Summary counts

| Metric | Count |
|---|---:|
| Requirements mapped (P1-R1 – P5-R8) | 42 |
| Marked complete in REQUIREMENTS.md | 9 (P1-R1 – P1-R9) |
| Open in REQUIREMENTS.md | 33 |
| Have code (full or partial) | 42 |
| Local/source proof PASS | 37 |
| Deployed or real-user proof PASS | 9 (P1-R5 – P1-R8 deploy smoke subset; P1-R3/R4 partial) |
| **Code + local proof but no deployed/user proof** | **28** |
| Verification docs missing | Phase 5 (`05-VERIFICATION.md`) |

## Recommended sequencing (user outcomes first)

1. Fix deployed Convex source state so one slug is **published + inquiry-eligible** → unlock P2 user story.
2. Run Phase 2 provider smokes with real inquiry-created dispatches → unlock owner notification story.
3. Record five friendly-owner activation rows → unlock P1-R10 / internal alpha.
4. Capture deployed Phase 3 builder readback artifact → unlock agent/builder trust.
5. Execute Phase 5 plan with active billing routes and Autumn/Stripe provider smoke → unlock paid activation story.

---

_Audit-only. No product code changed._
