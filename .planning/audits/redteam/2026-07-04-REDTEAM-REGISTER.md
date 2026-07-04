# Cross-lens red-team priority register — 2026-07-04

Internal audit register compiled from the six non-CSO red-team lenses: DevEx, Agent Experience, Eng, CEO, CMO, and Monetization. Security/payment readiness is tracked separately in [2026-07-04-PAYMENT-SECURITY-READINESS.md](./2026-07-04-PAYMENT-SECURITY-READINESS.md).

## Operating constraints

- Current AE remains bounded to business-supplied pages, assistant-readable discovery, and qualified inquiry for owner review (`local://ae-orientation.md:3-15`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:3-24`).
- AE does not currently process payments, booking, dispatch, autonomous fulfilment, custody, or broad protected actions (`PRODUCT.md:28-40`; `AGENTS.md:14-28`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:426-448`).
- The active product proof is the 14-day storefront → inquiry → correction gate: 30–50 profiles, 10 recruited providers, 100 attributable sessions, at least 10 qualified inquiries, at least 5 provider corrections/listing requests, and zero boundary overclaim (`.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md:8-33`).
- Anything about future payment or transaction capability below is horizon/speculative and must stay behind the 14-day gate plus ADR-005.

---

## 1. DevEx lens

### DevEx read

AE's internal contracts are stronger than its cold-start developer/integrator experience. The quiet agent door now has the right security shape, but a cold builder still needs repo-internal knowledge for setup, canonical URL behavior, Web Bot Auth signing, per-tool admission, and release-gate interpretation.

### Findings

| Finding | Severity | Evidence path | Fix |
|---|---:|---|---|
| No root getting-started path creates a first-run cliff. | P0 | `package.json:7-53`; `examples/agent-experience/README.md:41-66`; `local://redteam-devex.md` friction #1 | Add root onboarding with prerequisites, exact local bring-up, env classification, first `/llms.txt` curl, first `registry.search` POST, and Convex/env/port troubleshooting. |
| Local canonical URL mismatch makes provenance/audit behavior surprising. | P0 | `package.json:8`; `vite.config.ts:17-23`; `src/lib/server/canonical-url.ts:6-20`; `examples/agent-experience/ae-surface.ts:90-93` | Align local bind/canonical host or emit required `AE_CANONICAL_BASE_URL=http://127.0.0.1:3000`; remove audit-only alias magic as the main recovery path. |
| `403 + Accept-Signature` is safe but not self-teaching enough for third-party implementers. | P1 | `src/routes/api.agent.tools.ts:100-108`; `src/modules/clearance/internal/web-bot-auth.ts:7`; `src/modules/clearance/internal/web-bot-auth.ts:153-155`; `src/modules/clearance/clearance.functions.ts:54-99` | Keep the header; add stable JSON `nextStep` with signing scheme, allowlist, docs URL, example headers, admission requirement, scope, and human-inquiry fallback. |
| `/llms.txt` exposes the door but not the workflow. | P1 | `src/modules/discovery/internal/discovery-files.ts:51-70`; `convex/discovery.ts:761-780` | Add compact machine quickstart: `GET /api/agent/tools`, example POST bodies, schema/examples links, signed-write recovery, and boundary line. |
| Public JSON API errors are inconsistent across surfaces. | P1 | `src/routes/api.agent.tools.ts:235-237`; `src/routes/api.businesses.ts:14-22`; `src/routes/api.businesses.search.ts:19-30`; `src/routes/api.storefront.import-draft.ts:16-41` | Use one shared public API error envelope with `kind`, `code`, `retryable`, `reason`, optional field errors, `nextStep`, and `docsUrl`; convert parse throws to `safeParse`. |
| Local agent-experience PASS versus release-gate FAIL is easy to misunderstand. | P1 | `.planning/audits/agent-experience/probe-2026-07-04T06-08-52-963Z.md:1-20`; `examples/agent-experience/README.md:61-75`; `local://redteam-devex.md` observed gate run | Rename/wrap scripts as local/deployed/gate; gate failure should print the exact deployed-audit command and artifact expectation. |
| Agent-tools schema is typed internally but not versioned as a stable external contract. | P2 | `src/modules/common/action.ts:121-148`; `src/modules/actions/index.ts:23-39`; `src/modules/inquiries/inquiry.actions.ts:112-130`; `src/routes/api.discovery.schema.ts:38-65` | Add `schemaVersion` and examples to `GET /api/agent/tools` or a narrow `/api/agent/tools/schema`; avoid broad SDK/OpenAPI claims before proof. |
| Owner import/claim/publish workflow is hidden behind UI and auth. | P2 | `src/modules/storefront/storefront.actions.ts:85-101`; `src/routes/claim.tsx:195-204`; `src/routes/claim.tsx:421-505`; `src/routes/api.storefront.import-draft.ts:16-21` | Add owner-facing guide/explainer for website import: auth, JSON body, draft-only guarantee, review/confirm/publish steps, and common errors. |
| Literal search behavior surprises cold agents. | P2 | `tests/integration/agent-tools-api.test.ts:379-415`; `src/modules/registry/registry.actions.ts:16-29`; `.planning/audits/agent-experience/probe-2026-07-04T06-08-52-963Z.md:37-47` | Add descriptor guidance: literal search, no typo correction, retry with suburb/category/business terms; include broad and narrowed examples. |
| Dev/test command matrix is rigorous but unranked. | P2 | `package.json:14-53`; `local://ae-orientation.md:130-143` | Publish command taxonomy: first 5 minutes, before PR, deployed proof, provider proof, and agent-experience release gate. |

### DevEx priority call

Fix onboarding and self-teaching errors before widening any future/speculative action ladder. If an admitted partner cannot learn the path without source-reading, the quiet door is an internal capability rather than a product surface.

---

## 2. Agent Experience lens

### Agent Experience read

The harness is useful as a local diagnostic, but it is not yet a strong positive release gate. Today it mostly proves a deterministic localhost probe can follow the golden path and that the gate correctly blocks absent deployed reports.

### Findings

| Finding | Severity | Evidence path | Fix |
|---|---:|---|---|
| Current stored evidence is not launch proof. | P0 | `.planning/audits/agent-experience/probe-2026-07-04T06-08-52-963Z.md:1-7`; `.planning/adr/ADR-006-agent-experience-audit-gate.md:187-194`; `.planning/scopes/scope-01-production-landing/SCOPE-01-INDEX.md:13-15` | Keep GTM blocked until a fresh non-local deployed report exists; rename local report verdicts so local PASS cannot be read as launch eligibility. |
| Stored-report gate trusts serialized booleans without schema/scenario version enforcement. | P1 | `examples/agent-experience/run-audit.ts:733-790`; `.planning/audits/agent-experience/probe-2026-07-04T06-08-52-963Z.json:2-36`; `.planning/audits/agent-experience/probe-2026-07-04T06-08-52-963Z.json:53-323` | Add `report.schemaVersion`, required scenario IDs, non-skipped required scenarios, and rescore/validate stored reports before pass. |
| Positive signed+admitted inquiry success is optional in the harness. | P1 | `src/routes/api.agent.tools.ts:91-138`; `tests/integration/agent-tools-api.test.ts:296-334`; `examples/agent-experience/run-audit.ts:471-478`; `examples/agent-experience/score.ts:164-169` | Split gates: no-credential profile proves safe refusal/recovery; signed-admitted deployed/staging profile proves actual `inquiry.submit` write before any agent-submitted inquiry claim. |
| Boundary respect is over-prompted instead of observed cold. | P1 | `examples/agent-experience/run-audit.ts:303-315`; `examples/agent-experience/run-audit.ts:594-603`; `.agents/skills/agent-experience/SKILL.md:18-20` | Remove boundary language from scoring-run system prompts; let `/llms.txt`, descriptors, and responses teach the boundary. Keep safety prompts separate from scoring. |
| Hermes/model-backed runs do not exercise release scenarios faithfully. | P1 | `examples/agent-experience/run-audit.ts:522-670`; `examples/agent-experience/run-audit.ts:655-669`; `examples/agent-experience/run-audit.ts:823-831`; `.agents/skills/agent-experience/SKILL.md:201-271` | Either label Hermes as experimental smoke or make it the real runner: parallel agents, no spoonfeeding, prose retention, scenario extraction, and mixed-model gating. |
| Freshness/correction scenario is too shallow. | P2 | `examples/agent-experience/run-audit.ts:320-352`; `.planning/audits/agent-experience/probe-2026-07-04T06-08-52-963Z.json:180-187`; `.planning/audits/agent-experience/probe-2026-07-04T06-08-52-963Z.json:224-230` | Require assistant-readable freshness state, stale/degraded interpretation, and correction/owner-review next step; cap or fail when degraded profiles are treated as fresh. |
| Probe overfits one seeded Parramatta emergency-plumbing path. | P2 | `examples/agent-experience/run-audit.ts:21-24`; `examples/agent-experience/run-audit.ts:354-405` | Add no-match, typo/near-match, non-urgent category, stale/degraded listing, and wedge-agnostic scenarios. |
| Release-gate enforcement is manual/process-bound. | P2 | `package.json:51-53`; `.github/workflows/eval-gate.yml:29-74`; `.planning/scopes/scope-01-production-landing/01-05-agent-experience-audit-gate-PLAN.md:97-106` | Add scheduled/manual deployed gate once origin exists; publish non-secret report artifact; make GTM tooling consume the gate. |

### Agent Experience priority call

The gate is meaningful today as a negative blocker. It should not unlock claims until it becomes a current-schema, deployed, unbriefed, signed-path proof.

---

## 3. Engineering lens

### Engineering read

The action contract and tests are real assets, but policy remains duplicated, production admission is not operationally owned, storefront import is a useful prototype rather than production ingestion, and code/planning surface area still exceeds the unproven loop.

### Findings

| Finding | Severity | Evidence path | Fix |
|---|---:|---|---|
| Action registry is not yet the single source for capability policy. | P1 | `src/modules/common/action.ts:5-25`; `src/modules/actions/index.ts:21-29`; `src/modules/harness/tool-contract.ts:25-34`; `src/modules/harness/tool-contract.ts:326-372`; `src/modules/harness/approval-policy.ts:60-64`; `src/routes/api.agent.tools.ts:132-138` | Move exposure, approval mode, source-write scope, and public projection into the action definition or typed adjacent policy; derive surfaces and snapshot one contract. |
| Quiet-door production admission lacks operator-owned provisioning. | P1 | `src/modules/clearance/clearance.functions.ts:54-99`; `src/modules/clearance/clearance.functions.ts:133-137`; `convex/clearance.ts:220-260`; `tests/integration/agent-tools-api.test.ts:296-334` | Add mandate provisioning path with audit rows, expiry, revoke, readback, and deployed smoke that provisions, submits, and revokes one principal. |
| Agent-experience release gate exists but is not enforced as release boundary. | P1 | `package.json:51-53`; `examples/agent-experience/run-audit.ts:733-759`; `.github/workflows/eval-gate.yml:29-74`; `examples/agent-experience/README.md:61-82` | Add `test:release-deployed` or ship script that runs deployed gate and stores report path in active scope index. |
| Storefront import is SSRF/resource-exhaustion risk. | P1 | `src/routes/api.storefront.import-draft.ts:16-41`; `src/modules/storefront/storefront.actions.ts:85-102`; `src/modules/storefront/internal/import-draft.ts:65-74`; `src/modules/storefront/internal/import-draft.ts:236-244`; `src/modules/storefront/internal/import-draft.ts:93` | Harden fetch service: deny private networks, enforce redirect/DNS re-checks, timeout, byte cap, HTML-ish content type, redirect cap, attempt state, and negative tests. |
| `storefront.importDraft` is marked `readOnly: true` despite external network I/O and caller-owned auth. | P2 | `src/modules/storefront/storefront.actions.ts:90-101`; `src/modules/storefront/storefront.functions.ts:11-27`; `src/routes/api.storefront.import-draft.ts:16-39`; `src/modules/harness/tool-contract.ts:343-385` | Split traits: `requiresOwnerAuth`, `externalNetwork`, `mutatesSource`, `agentCallable`, `rateLimitClass`; or keep importer outside generic action registry until expressible. |
| Storefront drafts are not source-owned until claim submission. | P2 | `src/modules/storefront/internal/import-draft.ts:159-175`; `src/modules/storefront/internal/import-draft.ts:178-191`; `src/routes/claim.tsx:215-249`; `src/routes/api.storefront.import-draft.ts:36-41` | Persist import evidence or attach it to claim source rows: URL, content hash, extracted facts, owner confirmation, abandonment outcome. |
| Schema surface is large before the 14-day loop is proven. | P1 | `convex/schema.ts:3-33`; `.planning/codebase/CONCERNS.md:13-18`; `local://redteam-eng.md` count of 71 Convex tables vs 5 actions/3 agent tools | Freeze new tables/future-rung state until the gate passes; split hot files only along durable reducer/codec/DTO/adapter/readback seams. |
| Schema fragments can silently overwrite duplicate table names. | P2 | `convex/schema.ts:18-33`; `src/modules/clearance/internal/schema.ts:21-129`; `src/modules/inquiries/internal/convex-schema.ts`; `src/modules/protected-action/internal/schema.ts` | Add compose helper or static test asserting globally unique table names with ownership map. |
| Critical path uses high-beta framework/dependency posture. | P1 | `package.json:55-102`; `vite.config.ts:50-70`; `.planning/codebase/CONCERNS.md:130-136` | Pin where possible, record upgrade cadence, add SSR/raw-body/webhook route smoke coverage, and define rollback target before launch. |
| Test gates prove demo shape more than operational shape. | P2 | `tests/integration/agent-tools-api.test.ts:296-334`; `package.json:14-24`; `.github/workflows/eval-gate.yml:29-74`; `examples/agent-experience/run-audit.ts:733-759`; `.planning/graphs/GRAPH_REPORT.md:13-16` | Maintain separate PR health and release health; release health includes graph freshness, deployed agent gate, e2e/a11y, provider/deploy smokes. |
| Planning/graph corpus can dominate navigation unless kept fresh. | P2 | `.planning/graphs/GRAPH_REPORT.md:3-16`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:338-369` | Keep active `.planning` to decision blockers; move stale/generated graph blobs out of decision path unless current; record source-of-truth order. |

### Engineering priority call

The platform skeleton is good enough to test the loop, not good enough to widen the platform. Freeze future-rung surface area until the 14-day gate proves the storefront/inquiry spine deserves more code.

---

## 4. CEO lens

### CEO read

AE is company-shaped only if it becomes the narrow supply-side trust/storefront/inquiry/receipt layer and refuses the horizontal router fantasy until the 14-day gate produces real pull. Today it is a disciplined product substrate plus a testable company hypothesis.

### Findings

| Finding | Severity | Evidence path | Fix |
|---|---:|---|---|
| Single-player storefront value is not yet proven. | P0 | `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:134-162`; `src/modules/storefront/storefront.actions.ts:85-102`; `src/routes/api.storefront.import-draft.ts:16-41`; `tests/unit/storefront/import-draft.test.ts:23-125`; `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md:20-33` | Treat storefront as concierge-imported proof object until providers voluntarily correct/maintain/link/share it after seeing inquiry format. |
| Distribution-through-aggregators is a posture, not a plan. | P0 | `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:166-192`; `AGENTS.md:55-65`; `src/routes/api.agent.tools.ts:54-168`; `package.json:51-53`; `examples/agent-experience/run-audit.ts:733-768` | Require channel mix table and named path to sessions: owner embed, partner directory, assistant/tool catalog, paid/local, referral, or provider-owned link. |
| 14-day gate is sufficient as kill-switch but not company validation. | P0 | `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md:8-33`; `.planning/ROADMAP.md:23-45`; `.planning/STATE.md:23-57`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:523-537` | Passing gate admits only a second 30-day loop on owner response, correction recurrence, inquiry quality, and willingness-to-pay; not platform widening. |
| Quiet-door fix increases obligation to own admission policy. | P1 | `src/routes/api.agent.tools.ts:91-138`; `src/modules/common/action.ts:54-71`; `src/modules/clearance/clearance.functions.ts:54-100`; `tests/integration/agent-tools-api.test.ts:195-334` | Keep one action, one scope, one principal type; make mandates scarce, auditable, revocable, and deployed-smoke-proven. |
| Monetization remains future fiction until inquiry quality beats incumbent lead-gen pain. | P1 | `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:218-235`; `PRODUCT.md:28-40`; `AGENTS.md:14-28`; `local://research-demand.md:71-93` | Capture lead quality notes, owner response, provider willingness-to-pay language, and explicit invalid-inquiry policy during gate. |
| Solo-founder scope is still too wide after archive-cut. | P1 | `.planning/archive/INDEX.md:1-19`; `.planning/ROADMAP.md:43-45`; `package.json:14-53`; `local://research-landscape.md:180-204` | Make next 14 days narrow: provider sales, local demand acquisition, owner corrections, inquiry quality; no new broad audits/adapters/rungs. |
| Agent-experience gate can become fake traction if confused with demand. | P2 | `examples/agent-experience/run-audit.ts:674-684`; `examples/agent-experience/run-audit.ts:733-768`; `examples/agent-experience/score.ts:1-77`; `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md:35-47` | Treat deployed B+ as release safety, not demand proof. Demand proof remains sessions/inquiries/provider updates. |
| Urgent local-services wedge may mismatch owner-reviewed inquiry speed. | P2 | `examples/agent-experience/run-audit.ts:21-25`; `AGENTS.md:21-28`; `src/modules/inquiries/inquiry.actions.ts:112-123`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:331-335` | If urgent-trade users need immediate phone/dispatch, adapt wedge or channel; do not creep into booking/dispatch claims. |

### CEO priority call

Bet on agent-readable trust profiles, qualified inquiry receipts, and the 14-day kill-switch. Kill horizontal-router operating narrative, new payment/booking/dispatch/protected-action work, and process expansion until evidence is written.

---

## 5. CMO lens

### CMO read

AE's marketing problem is buyer ambiguity. The strategy says supply-side storefront first, but public/product surfaces still ask consumers, owners, and agent-builders to believe three different products at once.

### Findings

| Finding | Severity | Evidence path | Fix |
|---|---:|---|---|
| Buyer ambiguity will kill first sales motion. | P0 | `.agents/product-marketing.md:17-24`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:9-15`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:134-155`; `src/routes/index.tsx:20-27`; `src/routes/index.tsx:60-65` | Pick business owner/operator first; consumers and assistants are distribution context. Owner promise: claim/correct the page customers' assistants can read and use for qualified first contact. |
| `/llms.txt` and tool descriptors are legibility, not distribution. | P0 | `src/modules/discovery/internal/discovery-files.ts:51-68`; `convex/discovery.ts:761-780`; `.planning/audits/agent-experience/probe-2026-07-04T06-08-52-963Z.md:8-20`; `examples/agent-experience/README.md:61-82`; `local://research-demand.md:45-53` | Stop calling files/channels demand. Channels are owner embeds, GBP/website links, AI-search referral sessions, partners, assistant integrations, and paid/local demand tests. |
| AU local-services wedge is plausible but demand/supply ownership is unproven. | P0 | `local://research-demand.md:23-28`; `local://research-demand.md:71-92`; `local://research-demand.md:143-151`; `local://research-landscape.md:126-140`; `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md:12-33` | Run the gate without marketing overreach; frame AE as low-effort correction to wrong expectations, lead-quality pain, and owner control. |
| Boundary-honesty must become value prop, not apology. | P1 | `PRODUCT.md:28-40`; `PRODUCT.md:65-78`; `AGENTS.md:21-28`; `src/routes/index.tsx:63-65`; `src/routes/$slug.inquiry.tsx:246-248`; `src/routes/about.tsx:36-41`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:34-47` | Lead with fewer wrong-fit messages because assistants see actual services, areas, source links, and first-contact rules before asking. |
| Quiet agent door is product proof, not GTM story. | P1 | `src/routes/api.agent.tools.ts:91-138`; `tests/integration/agent-tools-api.test.ts:195-334`; `src/modules/clearance/clearance.functions.ts:54-100`; `src/modules/clearance/clearance.functions.ts:133-137` | Message as signed partner agents admitted to send qualified first-contact messages when the business publishes that capability; define partner onboarding. |
| Storefront import is strongest owner-acquisition feature and currently undersold. | P1 | `src/modules/storefront/storefront.actions.ts:85-102`; `src/modules/actions/index.ts:21-39`; `src/routes/claim.tsx:421-503`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:136-155` | Position import as “paste your website; AE drafts the assistant-readable version; you approve every fact before it goes live.” |
| Name/category language is too abstract for tradies. | P1 | `src/routes/index.tsx:56-65`; `src/routes/about.tsx:111-119`; `.agents/product-marketing.md:5-15`; `AGENTS.md:88-92`; `local://research-demand.md:55-62` | Company can be Agentic Economy; owner category should be AI-readable service page / assistant-safe business profile / qualified inquiry page. |
| Gate thresholds can false-positive if all traffic is founder-driven. | P1 | `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md:20-56`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:350-363` | Split reporting by source: cold paid/local search, direct provider outreach, assistant/referral, owner-embedded. Founder-only pass is ADAPT, not platform GO. |
| Homepage is too consumer-action-oriented for supply-side bootstrap. | P2 | `src/routes/index.tsx:20-27`; `src/routes/index.tsx:60-75`; `src/routes/registry.tsx:187-196`; `src/routes/owner.status.tsx:66-80` | Route acquisition by audience: owner outreach to claim/owner landing, consumer tests to registry, agent tests to `/llms.txt`/tools. |
| Agent-builder positioning is partner play, not broad developer platform. | P2 | `.planning/ROADMAP.md:112-149`; `.planning/GTM-READINESS.md:181-185`; `AGENTS.md:55-61`; `src/routes/api.agent.tools.ts:91-138`; `tests/integration/agent-tools-api.test.ts:296-334` | Use private/design-partner language; avoid public SDK/API/MCP marketplace rhetoric before deployed agent-experience proof. |

### CMO priority call

The smallest working sentence is owner-first: AE turns an existing website into an AI-readable service page customers and assistants can compare and use for a qualified first-contact inquiry, without pretending to complete the job.

---

## 6. Monetization lens

### Monetization read

The storefront is not the paid product. The monetizable unit is a valid, exclusive, source-receipted qualified inquiry that reaches an owner and creates response/freshness evidence. Stage 1 can exist only if AE is willing to monetize demand without copying hated shared-lead spam.

### Findings

| Finding | Severity | Evidence path | Fix |
|---|---:|---|---|
| “No lead fees” kills Stage 1 if interpreted literally. | P0 | `.planning/scopes/PM-03-launch-wedge-lock.md:30-36`; `.planning/vision/2026-07-04-ROAST.md:109-119`; `local://research-demand.md:75-91` | Internally rewrite as no shared/junk/duplicate/out-of-scope lead fees; charge only for valid exclusive inquiries with receipt/delivery evidence and credits for invalid ones. |
| Storefront is supply-acquisition subsidy, not paid product. | P0 | `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:151-191`; `src/modules/storefront/storefront.actions.ts:85-101`; `src/modules/storefront/internal/import-draft.ts:129-174`; `.agents/product-marketing.md:13-16` | Keep initial storefront free/concierge; price around valid inquiry, response analytics, freshness/correction loop. |
| Qualified inquiry leaks unless AE sells receipt loop, not contact form. | P0 | `PRODUCT.md:28-40`; `AGENTS.md:21-28`; `local://roast-marketplace.md:234-257`; `tests/integration/agent-tools-api.test.ts:296-329`; `local://research-landscape.md:160-164`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:195-214` | Charge for valid exclusive inquiry + receipt + response-state/freshness impact; make response/correction improve future routing. |
| Subscription storefront tools are second-order upsell. | P1 | `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:223-228`; `.agents/product-marketing.md:94-102`; `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md:12-56` | Package subscription around paid inquiry loop: profile, inbox, analytics, freshness, source drift, response evidence, invalid-inquiry credits. |
| Per-action fees are horizon; pricing them now would overclaim. | P1 | `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:223-229`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:426-448`; `local://research-demand.md:107-119`; `local://research-landscape.md:188-204`; `.planning/ROADMAP.md:198-208` | Keep per-action fees future/speculative; day-one sales mention qualified inquiry and profile freshness only. |
| First payer is business owner, but trigger should be valid inquiry/proof, not signup. | P1 | `local://roast-investor.md:130-144`; `AGENTS.md:38-49`; `local://research-demand.md:75-91`; `local://research-demand.md:63-68`; `local://research-demand.md:115-119` | Ask business to pay only after valid inquiry proof or explicit paid concierge pilot; do not sell abstract agent-readiness cold. |
| 14-day gate measures pull but not willingness to pay. | P2 | `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md:20-27`; `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md:73-76` | Add non-public price discovery: A$99/mo with included inquiries, A$29 per valid inquiry capped, A$199/mo concierge, or would-not-pay. |

### Monetization priority call

AE should test a future paid unit only after proof: a valid exclusive qualified inquiry, inside published service/geography/contact boundaries, non-duplicate, non-spam, delivered with receipt and response-state tracking. Add willingness-to-pay to the 14-day evidence artifact before interpreting GO as monetization proof.

---

## CONVERGENCE

### Shared verdict

Do **not** build a money rung, booking rung, dispatch rung, or broader protected-action ladder until the 14-day gate proves the storefront → inquiry → correction loop. Across DevEx, Agent Experience, Eng, CEO, CMO, and Monetization, the same conclusion repeats: AE has a better substrate than before, but the substrate is only justified if real providers maintain source-backed storefronts because qualified inquiries arrive and are better than commodity lead-gen.

### Shared priorities

| Priority | Cross-lens agreement | Required next move |
|---:|---|---|
| 1 | Storefront is supply subsidy, not product proof by itself. | Treat import/profile as owner-acquisition utility; measure provider correction/maintenance/link/share behavior. |
| 2 | Qualified inquiry is the first real action and the only near-term monetizable unit. | Keep `inquiry.submit` narrow, signed/admitted, owner-reviewed, receipt-backed, and explicitly not booking/payment/dispatch. |
| 3 | Money remains future/speculative. | Security/payment path must follow [payment readiness audit](./2026-07-04-PAYMENT-SECURITY-READINESS.md): no custody, PSP-hosted SAQ-A, ADR-005 D6, SSRF/dependency/secret/admission/webhook/PII controls. |
| 4 | Agent/discovery files are legibility, not distribution. | Gate must capture source-attributed sessions by channel, including owner embeds, partner/referral/assistant sessions, and paid/local demand tests. |
| 5 | Local proof is not launch proof. | Deployed agent-experience gate must use current schema, required scenarios, unbriefed runs, and signed-admitted path before public agent-facing claims. |
| 6 | The 14-day gate lacks willingness-to-pay. | Add provider price-choice/WTP prompt after showing inquiry format; keep it internal and source-owned. |
| 7 | Founder scope is still too wide. | Freeze new tables/rungs/adapters/process until evidence exists; release-health can be broad, but product work must stay narrow. |
| 8 | Boundary honesty should sell control and quality, not weakness. | Reframe as fewer wrong-fit inquiries and source-backed first-contact rules, while preserving all no booking/payment/dispatch constraints. |

### Concrete gate amendment

Add one non-public monetization section to the 14-day gate evidence artifact:

1. After each recruited provider sees the draft storefront and sample qualified inquiry, ask a price-choice question.
2. Capture one of: A$99/month with included valid inquiries; A$29 per valid exclusive inquiry capped at A$250/month; A$199/month concierge profile + inquiry inbox; would not pay.
3. Capture free-text objection and current incumbent spend if volunteered.
4. Do not publish this as revenue proof.
5. Treat a 14-day GO without WTP data as product-signal only, not pricing signal.

### No-go rules reinforced by every lens

1. No future PSP-hosted payment rung until the security readiness audit's P1 blockers close and ADR-005 D6 exists.
2. No booking, dispatch, autonomous fulfilment, broad protected-action, wallet, settlement, or custody work before the gate proves the loop.
3. No public “platform” widening if sessions/inquiries come only from founder-mediated traffic.
4. No agent-facing GTM claim from localhost agent-experience PASS.
5. No monetization claim from free corrections alone.
6. No charging for abstract agent-readiness before inquiry quality is shown.
7. No treating `/llms.txt`, schemas, or feeds as demand channels without attributable sessions.
8. No new broad developer-platform/SDK/MCP rhetoric before partner/deployed proof.

### Evidence required before any broadened rung

| Evidence class | Minimum acceptable artifact | Lenses demanding it |
|---|---|---|
| Deployed agent usability | Fresh non-local report with current schema, required scenarios, unbriefed boundary behavior, and signed-admitted inquiry proof where credentials/admission are available. | Agent Experience, DevEx, Eng, CMO |
| Source-attributed demand | 100 targeted sessions split by channel, not a blended vanity total. | CEO, CMO, Monetization |
| Provider maintenance | At least 5 recruited providers voluntarily correct, maintain, link/share, or ask to be listed after seeing the draft and inquiry format. | CEO, CMO, Monetization, Eng |
| Inquiry quality | At least 10 qualified inquiries with invalid/spam/out-of-scope accounting and owner response notes. | CEO, CMO, Monetization |
| Willingness-to-pay | Non-public provider price-choice responses plus objections after the inquiry format is shown. | Monetization, CEO, CMO |
| Security/payment readiness | Closed P1s in the linked payment audit, ADR-005 D6, deployed test-mode provider smokes, and copy scans. | CSO, Eng, CEO |
| Operational ownership | Named owner for admissions, provider smokes, release gates, and support/rollback paths. | Eng, DevEx, Agent Experience |
| Scope discipline | Explicit no-go if proof is founder-mediated only or if a future rung would require unsupported booking/payment/dispatch claims. | All lenses |

### De-duplicated fix sequence

1. Close the security/engineering blockers that are already dangerous without future money: SSRF, vulnerable prod deps, broad source-write secret, and duplicated action policy.
2. Harden the quiet-door operating model: provisioning, expiry, revoke, readback, nonce, and deployed signed-admitted smoke.
3. Repair cold integrator experience: root bring-up, local canonical host clarity, self-teaching `403`, `/llms.txt` workflow examples, and shared error envelopes.
4. Upgrade agent-experience from localhost diagnostic to deployed release proof: current schema, required scenarios, no spoonfed boundary, and mixed-model/prose review when model-backed.
5. Run the 14-day owner-first storefront/inquiry gate with source-attributed channels and WTP capture.
6. If mixed, adapt wedge/channel/message; if fail, stop public platform widening; if pass, deepen only storefront → inquiry → receipt → owner response → freshness.
7. Only after that, evaluate a future PSP-hosted payment service through ADR-005 D6 and the payment security readiness controls.

### Cross-lens contradictions resolved

- **Owner value versus consumer homepage:** resolved in favor of owner-first acquisition; consumer search remains a test surface until inventory and demand are real.
- **No lead fees versus monetization:** resolved as no shared/junk/duplicate/out-of-scope lead fees; valid exclusive receipted inquiries remain the possible future paid unit.
- **Local PASS versus launch proof:** resolved as local iteration only; deployed current-schema report is required for public agent-facing claims.
- **Boundary honesty versus marketing:** resolved by selling fewer wrong-fit inquiries and clearer first-contact rules, not by loosening booking/payment/dispatch limits.
- **Router ambition versus bootstrap:** resolved by treating domestic-router language as horizon only; the operating product is the owner-maintained storefront/inquiry loop.
- **Receipts as moat versus receipts as logs:** resolved by naming receipts an audit trail until volume proves they improve routing or owner response behavior.
- **Payment architecture versus payment product:** resolved by keeping PSP-hosted/no-custody architecture as future readiness, not as a reason to build the money rung now.

### Decision owner prompts

Before the next widening decision, the owner should be able to answer:

1. Which channel produced each of the 100 sessions?
2. Which providers corrected or maintained the storefront without being hand-held?
3. Which inquiries were invalid, duplicate, out-of-area, spam, or unsupported?
4. What did providers say they would pay for after seeing the inquiry format?
5. Which agent/partner, if any, discovered and used AE without repo-internal prompting?
6. Which deployed report proves the current assistant workflow and boundary behavior?
7. Which security blockers remain open in the payment audit?
8. Which code or planning surface would be deleted/frozen if the gate fails?

### Final convergence sentence

The smallest organism that can breathe is **owner-reviewed storefront → qualified inquiry → receipt/readback → owner response/correction → fresher profile**. If that loop breathes with real sessions, real provider corrections, and willingness-to-pay signal, AE can deepen it; if it does not, the correct response is to stop platform widening, not to add payments, booking, dispatch, or more protocol surface.

---

## 2026-07-04 payment-security RESOLUTION addendum

This addendum appends to the original cross-lens register. It does not rewrite the findings above.
Authoritative fix-wave evidence: `local://ae-wave-results.md`. Path-forward synthesis:
`.planning/audits/redteam/2026-07-04-PAYMENT-SECURITY-PATH-FORWARD.md`.

### SSRF in `storefront.importDraft` — RESOLVED

Resolution: importer network access was hardened with manual redirect handling, DNS/literal-IP
private-range rejection, metadata/localhost blocks, timeout, 2 MiB streamed byte cap, HTML
content-type enforcement, boundary-honest errors, and hermetic tests.

Connect-time-bound resolution: the actual connection resolves-and-validates atomically via a
guarded undici Agent `connect.lookup` using the same private-range classifier as the pre-flight
guard, so the validated resolution is the connection's resolution; the DNS-rebinding TOCTOU
(public answer to the pre-check, private answer to the connect) is closed. `undici` is an explicit
pinned dependency (`7.28.0`), rather than a transitive dependency, because it backs the SSRF
security boundary.

Evidence pointer: `tests/unit/storefront/import-draft.test.ts` now includes guarded-lookup and
rebinding-scenario coverage, with 24 importer tests. Orchestrator gate re-run green: `test:unit`
754 pass across 134 files, `test:integration` 101 pass, `tsc --noEmit` 0, `npm audit --omit=dev`
0, and `npm ci --dry-run` reproducible.

### Production dependency vulnerabilities — RESOLVED

Resolution: vulnerable production dependency paths through Sentry/OpenTelemetry/protobufjs were
remediated; `promptfoo` was also updated for the full audit path.

Evidence pointer: `local://ae-wave-results.md` records `npm audit --omit=dev` 9 → 0 vulnerabilities,
full `npm audit` 10 → 0 vulnerabilities, and reproducible `npm ci --dry-run`.

### Single broad `AE_SOURCE_WRITE_SECRET` — RESOLVED

Resolution: source-write admission now uses scoped key families with `keyId` and rotation; production
requires explicit per-family `AE_SOURCE_WRITE_KEY_*`; provider secrets are guarded from doubling as
source-write keys.

Evidence pointer: `local://ae-wave-results.md` records the secret-split implementation and green
typecheck/codegen/unit/integration gates.

### Quiet-door / WBA replay and binding debt — RESOLVED

Resolution: write admissions now bind the request body digest, consume durable Convex nonces, require
expanded WBA covered components including method/authority/path/signature-agent and content digest for
bodied requests, and remove operation/correlation self-attestation fallback.

Evidence pointer: `local://ae-wave-results.md` records the quiet-door/WBA hardening with
`test:integration` 101 pass across 27 files, `test:unit` 741 pass across 133 files, and
typecheck/codegen green.

### Live-money controls — OPEN / HORIZON

The future payment/live-money P1 remains explicitly **OPEN**. The FIX-NOW wave landed a foundation;
it did not implement refunds, disputes, chargebacks, reconciliation, support owner, kill switch,
alerts, rollback, or deployed test-mode payment smokes. The governing defer decision is ADR-005
(`.planning/adr/ADR-005-transactions-receipts.md`) and the backing checklist is
`.planning/scopes/scope-14day-bootstrap-gate/06-LIVE-MONEY-EVIDENCE-DECISION.md`. A reversal requires
the 14-day bootstrap gate to pass and the live-money checklist to be completed with owner/date.
