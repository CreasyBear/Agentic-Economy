# Scope 14Day — Bootstrap go/no-go gate

**Direction:** `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md` §11 and §14 Move 2.  
**Status:** active planning gate; source-local G1/G2/G3 instrumentation exists, target-run evidence not yet captured.  
**Scope:** internal execution scaffold for the first falsifiable demand test. The gate itself changes no public capability or source schema beyond narrow pre-clock instrumentation tickets (14D-G1/G2/G3) that touch existing observability/registry seams only to make counts reconstructable before the clock starts.  
**Posture:** storefront prototype + qualified inquiry only. No booking, payment, dispatch, automatic fulfillment, broad write, live marketplace, or autonomous transaction claim.

## Gate rule

No further platform rungs beyond the storefront prototype and qualified-inquiry path ship publicly before this gate has evidence. Later quote, booking handoff, paid, protected, or autonomous action work stays internal, future-worded, or source/local only until the gate passes and a new decision record admits the next rung.

This gate now sits behind the active execution-readiness map (`.planning/scopes/SCOPE-EXECUTION-READINESS.md`). It cannot be used to widen public platform scope while issue #5 deployed evidence, issue #36 agent-experience deployed gate, PM-01 owner pull, PM-02 assistant distribution, PM-04 owner replay, and PM-05 language adaptation remain open.

The 14-day clock starts only after all three setup counts are real and attributable:

| Setup count | Required evidence | Notes |
|---|---:|---|
| Source-backed profiles | 30–50 | Profiles must name source/freshness/boundary and whether owner facts are confirmed. Category-specific details stay extensions; core schema stays wedge-agnostic. |
| Manually recruited providers | 10 | Providers are recruited by direct outreach and offered free correction/listing for 30 days. No paid promise. |
| Targeted sessions | 100 over 14 days | Counted sessions must carry the active `utm_campaign`/run id plus attribution (`utm_source`, `ref` as source, partner link, local post, outreach link, assistant/referral source, or external referrer host). |

## Pass / adapt / stop rules

| Rule | Threshold | Verdict effect |
|---|---:|---|
| Consumer pass | ≥10 qualified inquiries from the 100 attributable sessions | Required for GO. Count only source-owned `inquiry_submitted`/replayed inquiry receipts with attributable session/correlation data. |
| Supplier pass | ≥5 recruited providers voluntarily correct/maintain a profile or ask to be listed | Required for GO. Count only explicit owner/provider actions or logged operator evidence, not polite interest. |
| Trust pass | Zero public or assistant implication of booking, payment, dispatch, automatic fulfillment, price lock, schedule lock, broad marketplace liquidity, or autonomous transaction | Required for GO. Copy/SEO scans and outside-in agent audit must stay clean. |
| Optional quality signal | Source/profile click-through before inquiry, if instrumented | Supports GO quality only; no pass threshold and no blocking effect if explicitly marked unavailable before the run. |

Verdicts:

- **GO:** consumer pass + supplier pass + trust pass. Continue only on storefront → inquiry → receipt → owner-response → freshness work.
- **ADAPT:** exactly one of consumer or supplier pass fails. Change wedge, channel, onboarding script, profile content, or distribution plan and rerun a time-boxed test.
- **STOP:** both consumer and supplier pass fail, or trust pass fails. Stop public platform widening and revise the product thesis before more rungs are added.

## Instrumentation map

Use existing source-owned funnel, inquiry, correction, and observability seams first. If a metric lacks emitted events before the run starts, create a narrow implementation ticket before starting the 14-day clock; do not count screenshots or manual dashboards as source proof.

| Metric | Existing measurement surface | Current clock status | Repo paths to inspect |
|---|---|---|---|
| Attributable targeted sessions | Client attribution reads `utm_source`, `utm_campaign`, `ref`, document referrer, and a pseudonymous session; client events now post valid no-`businessId` `visitor_attributed` rows through `/api/observability/funnel` into source-owned `funnelEvents`, while owner activation state remains business-scoped. A pure reconstruction helper dedupes by `utmCampaign`/run id + pseudonymous session and rejects direct/unknown/unattributed rows. | **Source-local implemented; target dry-run required.** Do not start the clock until one target-environment attributed session proves source-owned or explicitly accepted external event/export evidence with host-only/redacted referrer data. | `src/lib/observability/funnel-attribution.ts`; `src/lib/observability/funnel-client.ts`; `src/routes/api.observability.funnel.ts`; `src/modules/observability/funnel.source.ts`; `src/modules/observability/internal/record-funnel-event.ts`; `src/modules/observability/internal/targeted-sessions.ts`; `convex/observability.ts`; `tests/unit/observability/targeted-sessions.test.ts`; `tests/unit/convex/observability-runtime.test.ts` |
| Registry/answer demand | Registry visits emit `registry_search`; answer journeys emit `answer_query_started`, `answer_registry_searched`, `answer_provider_selected`, and `inquiry_attempted`. | **Partial.** Useful context only; not a pass metric without a source-owned session/click ledger. | `src/components/ae/layout/AeRegistryFunnelBoot.tsx`; `src/components/ae/chat/chat-funnel.ts`; `src/modules/observability/internal/literals.ts`; `tests/unit/chat-funnel.test.ts`; `tests/unit/observability/funnel.test.ts` |
| Qualified inquiries | The inquiry reducer emits `inquiry_submitted` funnel records and source-owned audit/operation rows; `inquiry.submit` is the action-backed qualified write. | **Ready for target-environment dry-run.** Count only receipts with attributable session/correlation/business refs. | `src/modules/inquiries/internal/commands.ts`; `src/modules/inquiries/inquiry.actions.ts`; `src/modules/inquiries/inquiry.functions.ts`; `convex/inquiries.ts`; `tests/unit/inquiries/inquiry-flow.test.ts`; `tests/unit/convex/inquiries-runtime.test.ts` |
| Provider corrections / listing requests | `/privacy/remove-business` creates a security dispute/audit receipt and remains excluded. A pure source-local reconstruction helper now counts business-scoped `authenticated`/`published` claim/listing rows and future business-scoped `owner_interest_submitted` rows only when matched to direct recruitment or explicit accepted non-dispute operator evidence for the same provider/listing. | **Source-local implemented; target dry-run required.** Do not start the clock until one target-environment dry-run attaches non-secret claim/business refs, recruitment or operator-evidence refs, run window, count output, dedupe policy, and evidence that privacy/removal dispute rows were not counted. | `src/modules/observability/internal/supplier-actions.ts`; `tests/unit/observability/supplier-actions.test.ts`; `src/modules/observability/internal/literals.ts`; `src/modules/observability/internal/funnel.ts`; `src/routes/owner.status.tsx` |
| Optional source/profile click-through | Registry "View details" now emits `service_registry_result_clicked` through the source-owned funnel client and `/api/observability/funnel`; public registry DTO/readback carries `businessId`; payload captures slug, query length, and result position while attribution/session/correlation come from the shared funnel client. | **Source-local implemented; target dry-run required.** Do not start the clock until one target-environment attributable registry click proves source-owned or explicitly accepted external event/export evidence with run id, businessId, session/correlation, payload, and dedupe/count policy. | `src/lib/observability/registry-click.ts`; `src/routes/registry.tsx`; `src/modules/registry/internal/search.ts`; `convex/registry.ts`; `tests/unit/observability/funnel-client.test.ts`; `tests/unit/convex/registry-runtime.test.ts` |
| Trust pass | Producer-side scans plus deployed outside-in agent audit. Planning evidence is not public proof; local audit runs are iteration only. | **Partial.** Copy scans can run locally; deployed outside-in agent audit remains blocked by issue #36/#5 before assistant-facing claims. | `tests/copy/claims-register.test.ts`; `tests/copy/phase1-banned-copy.test.ts`; `examples/agent-experience/`; `.planning/scopes/scope-01-production-landing/01-05-agent-experience-audit-gate-PLAN.md` |

## Recruitment sketch

1. Pick one metro and 2–3 high-intent local-service categories for the test copy and outreach. Keep all schema/planning language wedge-agnostic outside fixtures and recruiting notes.
2. Build a candidate list of 30–50 source-backed public profiles from public business pages and review/source links. Label each fact by source and freshness; do not imply quality certification.
3. Manually recruit 10 providers from that set or adjacent targets. Offer free listing/correction for 30 days and show the exact qualified-inquiry format.
4. Ask each provider one concrete maintenance question: “What on this profile should be corrected before a customer's assistant uses it to send a qualified message?”
5. Drive 100 attributable targeted sessions from narrow paid search, local posts, direct outreach, partner links, or assistant/referral prompts. Each link must carry source/campaign attribution.
6. Review evidence at day 7 for safety only. Do not lower thresholds mid-run. Fix only broken instrumentation or overclaiming copy.
7. At day 14, write an evidence summary with counts, source pointers, trust findings, and GO/ADAPT/STOP verdict.

## Plan sequence

| Plan | Depends on | Output |
|---|---|---|
| [14D-01](14D-01-bootstrap-gate-evidence-PLAN.md) — run the falsifiable bootstrap gate | Scope 1 deployed env for public proof; Move 1 for signed/admitted quiet-door write if assistant submission is part of the run | Evidence summary with setup counts, pass/fail metrics, trust scan results, and next decision |
| [14D-G1](14D-G1-source-owned-session-ledger-PLAN.md) — source-owned targeted-session count | 14D-01 scaffold; before the 14-day clock | Narrow session-start persistence plus pure count contract for attributable sessions. Does not cover supplier maintenance or optional click-through. |
| [14D-G2](14D-G2-source-click-evidence-PLAN.md) — source/profile click-through | 14D-01 scaffold; before the 14-day clock if using the optional quality signal | Source-local registry click event with businessId/session/correlation/run attribution. Target dry-run remains open. |
| [14D-G3](14D-G3-supplier-action-evidence-PLAN.md) — source-owned supplier-action count | 14D-01 scaffold; before the 14-day clock | Source-local supplier action reconstruction for recruited claim/listing or accepted operator evidence rows. Target dry-run remains open. |

## End conditions

Local/source planning done:

- This index and plan define the 14-day gate, pass rules, instrumentation paths, recruitment plan, and no-rung-widening rule.
- `.planning/ROADMAP.md` names the gate as active before public platform widening.
- `.planning/STATE.md` names the gate as the current active go/no-go state.
- `npm run typecheck`, `npm run test:copy`, and `npm run test:seo` pass, or failures are reported as pre-existing/unrelated.

Gate done later, only after evidence exists:

- A dated evidence artifact records 30–50 profiles, 10 recruited providers, 100 attributable sessions over 14 days, qualified inquiry count, provider correction/listing count, trust pass result, optional source/profile click-through, and GO/ADAPT/STOP verdict.
- Any future monetization or action-rung language remains future-worded and blocked unless a later decision record admits it from this evidence.

## What good looks like

1. The gate can fail without code churn: if demand or supplier maintenance does not show up, the product thesis changes before more platform surface ships.
2. All metrics are reconstructable from source-owned events, attribution, inquiry receipts, correction/listing evidence, or explicitly logged operator evidence.
3. Public and assistant-visible language remains inside read/compare/summarize/route/qualified-inquiry boundaries.
4. The optional click-through metric measures verification behavior; it does not become a vanity traffic substitute for the required inquiry and supplier passes.

5. The result points to one next move only: continue storefront/inquiry/freshness if GO, adapt the wedge/channel if mixed, or stop public platform widening if failed.

This gate does not authorize Scope 5 demo-kit work, public action-proposal exposure, live money, endpoint dispatch, or new agent-facing verbs. Those remain governed by the relevant scope indexes and wayfinder issues.
