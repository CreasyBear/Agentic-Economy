---
phase: scope-14day-bootstrap-gate
plan: "14D-G1"
status: source-local-implemented-target-dry-run-open
type: execute
wave: 0
blocker: "source-owned-targeted-session-count"
depends_on: ["14D-01-bootstrap-gate-evidence"]
files_modified:
  - .planning/scopes/scope-14day-bootstrap-gate/14D-G1-source-owned-session-ledger-PLAN.md
  - .planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md
  - .planning/scopes/SCOPE-EXECUTION-READINESS.md
  - src/lib/observability/funnel-client.ts
  - src/routes/api.observability.funnel.ts
  - src/modules/observability/funnel.source.ts
  - convex/observability.ts
  - src/modules/observability/internal/targeted-sessions.ts
  - tests/unit/convex/observability-runtime.test.ts
  - tests/unit/observability/record-funnel-event.test.ts
  - tests/unit/observability/targeted-sessions.test.ts
  - .planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md
autonomous: false
requirements:
  - SCOPE-14DAY-INDEX instrumentation map
  - EVIDENCE-14DAY-GATE pre-clock blocker 14D-G1
execution_scope: narrow_pre_clock_instrumentation
production_executable: false
must_haves:
  truths:
    - id: g1-count-contract
      statement: "A targeted session is a unique pseudonymous session in the named 14-day campaign/run with explicit attribution; direct/unattributed traffic does not count."
    - id: g1-source-proof
      statement: "The session count must be reconstructable from source-owned funnel rows or from an explicitly accepted external PostHog export attached to the evidence artifact."
    - id: g1-no-scope-blend
      statement: "This ticket does not implement supplier-maintenance evidence, optional profile/source click-through, owner recruitment tooling, public copy, payments, booking, dispatch, or autonomous action claims."
---

<objective>
Resolve the 14-day gate's G1 pre-clock blocker by making the targeted-session count contract executable and auditable before the clock starts.
</objective>

<context>
@.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md
@.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md
@src/lib/observability/funnel-attribution.ts
@src/lib/observability/funnel-client.ts
@src/routes/api.observability.funnel.ts
@src/modules/observability/funnel.source.ts
@convex/observability.ts
@convex/_generated/ai/guidelines.md
</context>

<current_state>
Client attribution already records `utm_source`, `utm_campaign`, `ref`, document referrer, a pseudonymous session id, and a correlation id.
Client events are sent to PostHog, but `emitFunnelEvent` returns before posting to `/api/observability/funnel` when `businessId` is absent.
The API route, source wrapper, and Convex mutation also return early when `businessId` is absent, so generic targeted sessions are not source-owned Convex evidence.
The pure `recordFunnelEvent` helper already returns a persistence row without `businessId`; the missing piece is carrying that row through the source mutation into `funnelEvents` while keeping owner activation updates business-scoped.
</current_state>

<count_contract>
A session counts toward the 14-day targeted-session setup only when all conditions hold:

1. **Run membership:** the event belongs to the active 14-day run by one persisted campaign key. Counted AE-run links must carry `utm_campaign=<run id>` matching the run id recorded in `EVIDENCE-14DAY-GATE.md` before day 1. `ref` may identify a partner/outreach source through the existing `source` field, but `ref` alone does not prove run membership.
2. **Attribution:** the first counted event has at least one non-empty attribution marker in addition to run membership: `utm_source`, `ref` collapsed into `source`, or an external referrer host. `source: "direct"` without another marker does not count.
3. **Deduplication:** count at most once per `(run id, pseudonymousSessionId)` across the 14-day window. Later events update context/readback only; they do not add sessions.
4. **Allowed event types:** count `visitor_attributed` as the canonical session-start event. `registry_search` and `answer_query_started` may support diagnostics, but they do not substitute for the canonical session-start event unless the run evidence explicitly records why `visitor_attributed` was unavailable.
5. **Evidence link:** each counted session must retain non-secret source-owned evidence: event type, source, `utmCampaign`/run id, optional `utmSource`, optional referrer host only, pseudonymous session id, first correlation id, first seen timestamp, and last seen timestamp or event count if implemented. Do not persist or export raw referrer URLs with query strings for G1 proof.
</count_contract>

<non_goals>
- Do not create a new broad analytics platform.
- Do not add supplier-maintenance evidence; that is G3.
- Do not add `service_registry_result_clicked`; optional click-through is G2.
- Do not alter inquiry qualification, provider schema, public copy, agent-tool actions, billing, protected actions, or business-action receipts.
- Do not count screenshots, manual dashboards, or raw PostHog presence as source-owned proof unless the evidence artifact explicitly accepts an attached export as external observability proof.
</non_goals>

<tasks>

<task type="implementation" tdd="true" status="source-local-implemented">
  <name>Task 1: Persist unattributed-owner session-start events</name>
  <files>src/lib/observability/funnel-client.ts; src/routes/api.observability.funnel.ts; src/modules/observability/funnel.source.ts; convex/observability.ts</files>
  <action>Allow valid `visitor_attributed` events without `businessId` to reach the source mutation and persist to the existing `funnelEvents` table. Keep owner activation state updates conditional on `businessId` so generic sessions do not pollute owner activation readbacks.</action>
  <acceptance_criteria>
    - A valid `visitor_attributed` payload without `businessId` returns `{ ok: true }` from `/api/observability/funnel`.
    - Convex persists one redacted `funnelEvents` row for that payload using the existing table.
    - Referrer evidence is normalized to a host-only or otherwise redacted value before it is persisted/exported for G1; raw referrer query strings are not accepted as proof.
    - No `ownerActivationState` row is created when `businessId` is absent.
    - Invalid JSON/content-type behavior remains unchanged.
  </acceptance_criteria>
</task>

<task type="implementation" tdd="true" status="source-local-implemented">
  <name>Task 2: Keep targeted count reconstructable</name>
  <files>src/modules/observability/internal/targeted-sessions.ts; tests/unit/observability/targeted-sessions.test.ts</files>
  <action>Add a pure helper over supplied `funnelEvents` rows/export rows that reconstructs unique targeted sessions by run/campaign, source, and pseudonymous session id. Do not add a Convex query or schema index in this ticket; if live querying by campaign/window is required, open a separate indexed-query ticket that includes `src/modules/observability/internal/schema.ts` and the source-state index guard.</action>
  <acceptance_criteria>
    - Two `visitor_attributed` rows with the same run id and `pseudonymousSessionId` count once.
    - Rows with `source: "direct"` and no attribution marker do not count.
    - Rows outside the run window or campaign id do not count.
    - Rows without the active persisted `utmCampaign`/run id do not count, even when `ref` or referrer attribution exists.
    - A `ref`-sourced session with the active `utmCampaign`/run id can count through the existing `source` field; a `ref`-only session cannot.
    - Redacted payloads do not include private customer/business message text.
    - No new Convex query, table, or index is added by this ticket.
  </acceptance_criteria>
</task>

<task type="implementation" tdd="true" status="target-dry-run-open">
  <name>Task 3: Record dry-run evidence before the clock</name>
  <files>.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md</files>
  <action>Run one target-environment dry-run attributed session and record only non-secret evidence refs/counts in the G1 blocker row before day 1.</action>
  <acceptance_criteria>
    - `14D-G1` blocker row names the run id/campaign id, source-owned event ref or accepted external export ref, and dedupe policy.
    - The 14-day clock remains not started until this row is PASS or explicitly accepted as external proof.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- [x] Unit/integration test proving no-businessId `visitor_attributed` persists to `funnelEvents` without owner activation state.
- [x] Unit test proving targeted-session dedupe, campaign/window filtering, direct/unattributed exclusion, and no Convex index/query dependency.
- [x] `npm run typecheck`
- [x] Focused observability tests changed by this ticket.
- [x] `npm run test:copy` if any public/assistant-visible copy changes; expected none.
- [x] `npm run test:seo` after planning-status edits.
</verification>

<success_criteria>
- The 14-day gate can count targeted sessions once per attributable pseudonymous session/run before the clock starts.
- The evidence artifact can reconstruct the count from source-owned rows or explicitly attached accepted external export proof.
- No supplier metric, click-through metric, public claim, assistant action surface, or schema-widening work is bundled into this ticket.
</success_criteria>

<output>
Source-local execution is complete, but `14D-G1` remains target-dry-run-open. Before day 1, run one target-environment attributed session and update `EVIDENCE-14DAY-GATE.md` row `14D-G1` with PASS/BLOCKED, the run id, the evidence pointer, and the dedupe policy. Do not start the 14-day clock until G1, G3, and the trust/deployed audit gates are resolved or explicitly accepted by the relevant plan.
</output>
