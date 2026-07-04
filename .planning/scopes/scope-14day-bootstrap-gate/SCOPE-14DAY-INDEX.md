# Scope 14Day — Bootstrap go/no-go gate

**Direction:** `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md` §11 and §14 Move 2.  
**Status:** active planning gate, evidence not yet captured.  
**Scope:** internal execution scaffold for the first falsifiable demand test. It changes no public capability, source schema, `src/`, or `convex/` surface.  
**Posture:** storefront prototype + qualified inquiry only. No booking, payment, dispatch, automatic fulfillment, broad write, live marketplace, or autonomous transaction claim.

## Gate rule

No further platform rungs beyond the storefront prototype and qualified-inquiry path ship publicly before this gate has evidence. Later quote, booking handoff, paid, protected, or autonomous action work stays internal, future-worded, or source/local only until the gate passes and a new decision record admits the next rung.

This gate now sits behind the active execution-readiness map (`.planning/scopes/SCOPE-EXECUTION-READINESS.md`). It cannot be used to widen public platform scope while issue #5 deployed evidence, issue #36 agent-experience deployed gate, PM-01 owner pull, PM-02 assistant distribution, PM-04 owner replay, and PM-05 language adaptation remain open.

The 14-day clock starts only after all three setup counts are real and attributable:

| Setup count | Required evidence | Notes |
|---|---:|---|
| Source-backed profiles | 30–50 | Profiles must name source/freshness/boundary and whether owner facts are confirmed. Category-specific details stay extensions; core schema stays wedge-agnostic. |
| Manually recruited providers | 10 | Providers are recruited by direct outreach and offered free correction/listing for 30 days. No paid promise. |
| Targeted sessions | 100 over 14 days | Sessions must carry attribution (`utm_*`, `ref`, partner link, local post, outreach link, or assistant/referral source). |

## Pass / adapt / stop rules

| Rule | Threshold | Verdict effect |
|---|---:|---|
| Consumer pass | ≥10 qualified inquiries from the 100 attributable sessions | Required for GO. Count only source-owned `inquiry_submitted`/replayed inquiry receipts with attributable session/correlation data. |
| Supplier pass | ≥5 recruited providers voluntarily correct/maintain a profile or ask to be listed | Required for GO. Count only explicit owner/provider actions or logged operator evidence, not polite interest. |
| Trust pass | Zero public or assistant implication of booking, payment, dispatch, automatic fulfillment, price lock, schedule lock, broad marketplace liquidity, or autonomous transaction | Required for GO. Copy/SEO scans and outside-in agent audit must stay clean. |
| Optional quality signal | ≥30% source/profile click-through before inquiry | Supports GO quality; failure does not by itself block if the three required rules pass. |

Verdicts:

- **GO:** consumer pass + supplier pass + trust pass. Continue only on storefront → inquiry → receipt → owner-response → freshness work.
- **ADAPT:** exactly one of consumer or supplier pass fails. Change wedge, channel, onboarding script, profile content, or distribution plan and rerun a time-boxed test.
- **STOP:** both consumer and supplier pass fail, or trust pass fails. Stop public platform widening and revise the product thesis before more rungs are added.

## Instrumentation map

Use existing source-owned funnel, inquiry, correction, and observability seams first. If a metric lacks emitted events before the run starts, create a narrow implementation ticket before starting the 14-day clock; do not count screenshots or manual dashboards as source proof.

| Metric | Existing measurement surface | Repo paths to inspect |
|---|---|---|
| Attributable targeted sessions | Client attribution reads `utm_source`, `utm_campaign`, `ref`, document referrer, and a pseudonymous session; client events flow through PostHog and `/api/observability/funnel`; server persistence stores business-scoped funnel events. | `src/lib/observability/funnel-attribution.ts`; `src/lib/observability/funnel-client.ts`; `src/lib/observability/funnel-event-props.ts`; `src/routes/api.observability.funnel.ts`; `src/modules/observability/funnel.source.ts`; `src/modules/observability/funnel.functions.ts` |
| Registry/answer demand | Registry visits emit `registry_search`; answer journeys emit `answer_query_started`, `answer_registry_searched`, `answer_provider_selected`, and `inquiry_attempted`. | `src/components/ae/layout/AeRegistryFunnelBoot.tsx`; `src/components/ae/chat/chat-funnel.ts`; `src/modules/observability/internal/literals.ts`; `tests/unit/chat-funnel.test.ts`; `tests/unit/observability/funnel.test.ts` |
| Qualified inquiries | The inquiry reducer emits `inquiry_submitted` funnel records and source-owned audit/operation rows; Convex persists funnel rows with business, session, and correlation refs; `inquiry.submit` is the action-backed qualified write. | `src/modules/inquiries/internal/commands.ts`; `src/modules/inquiries/inquiry.actions.ts`; `src/modules/inquiries/inquiry.functions.ts`; `convex/inquiries.ts`; `tests/unit/inquiries/inquiry-flow.test.ts`; `tests/unit/convex/inquiries-runtime.test.ts` |
| Provider corrections / listing requests | Existing owner intent and correction paths include claim/interest/correction/removal disputes. Count a supplier pass only when the provider explicitly asks to correct, maintain, claim, or be listed. | `src/routes/privacy.remove-business.tsx`; `src/modules/security/removal-dispute.functions.ts`; `src/modules/observability/internal/literals.ts`; `src/modules/observability/internal/funnel.ts`; `src/components/ae/forms/AeCopyPublicUrlButton.tsx`; `src/routes/owner.status.tsx` |
| Optional source/profile click-through | Event vocabulary already includes `service_registry_result_clicked`; PostHog/funnel properties carry source, session, business, and campaign fields. Before the clock starts, verify emitted profile/source clicks or add one narrow instrumentation task. | `src/modules/observability/internal/literals.ts`; `src/lib/observability/funnel-event-props.ts`; `src/lib/observability/posthog.client.ts`; `src/lib/observability/funnel-client.ts` |
| Trust pass | Producer-side scans plus deployed outside-in agent audit. Planning evidence is not public proof; local audit runs are iteration only. | `tests/copy/claims-register.test.ts`; `tests/copy/phase1-banned-copy.test.ts`; `examples/agent-experience/`; `.planning/scopes/scope-01-production-landing/01-05-agent-experience-audit-gate-PLAN.md` |

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
