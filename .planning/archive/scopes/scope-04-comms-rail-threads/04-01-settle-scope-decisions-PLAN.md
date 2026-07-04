---
phase: scope-04-comms-rail-threads
plan: "04-01"
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/adr/ADR-004-comms-rail-threads.md
autonomous: false
requirements: [D1, D3, D4, D5, D6, D7]
user_setup:
  - "Scopes 1/2/3 must be readable for their finalized contracts: scope-2 endpoint capability shape (endpoint URL + verification/signing key + checked state) and scope-3 attributed-agent principal/mandate shape. If a sibling scope INDEX exists under .planning/scopes/, read it; otherwise read ADR-002/ADR-003 and the scope-2/scope-3 tickets before resolving #23/#24."
execution_scope: decision_spike
production_executable: false
must_haves:
  truths:
    - id: s4-tickets-resolved
      statement: "Every scope-4 open ticket (#22..#28) is resolved with a recorded decision, a posted GitHub resolution comment, a closed issue, and one appended line on wayfinder map issue #1 'Decisions so far'."
    - id: s4-no-pre-answer
      statement: "Resolutions are decided in this session from ADR-004 evidence + scope-2/3 contracts, not silently pre-answered inside implementation plans; implementation plans consume the resolution by number."
    - id: s4-token-privacy-bounded
      statement: "The initiator readback mechanism (#22) never grants more than the initiator's own thread + own redacted contact, and revokes on privacy tombstone / owner close."
    - id: s4-ssrf-guard-list
      statement: "The business_endpoint egress guard list (#23) is pinned to the scope-2 registered/checked endpoint only, with no arbitrary-URL dispatch and no proxy/execute."
  artifacts:
    - path: .planning/adr/ADR-004-comms-rail-threads.md
      provides: "Recorded resolutions under '## Open questions → tickets' flipping each open sub-question to a decided answer that implementation plans cite by ticket number."
  key_links:
    - from: open ticket sub-question
      to: implementation plan read_first
      via: "'resolution of #N' — an implementation task consumes the decided answer, never re-litigates it."
    - from: readback mechanism decision (#22)
      to: privacy tombstone / owner close
      via: "token/link is revoked when the thread is closed or a tombstone applies."
---

<objective>
Settle the seven scope-4 pre-implementation questions the ADR flagged as open, so the implementation plans (04-02/03/04) build on decided answers instead of re-opening the grilling. This is a decision/spike plan: each task resolves a ticket, records the decision in ADR-004, posts a GitHub resolution comment, closes the issue, and appends one line to wayfinder map issue #1.

Purpose: convert medium-confidence ADR sub-questions into pinned decisions with an audit trail.
Output: ADR-004 resolutions + closed issues #22..#28 + one wayfinder-map line each. No source/schema is written here.
</objective>

<how_to_execute>
Fresh session: read the scope INDEX (`SCOPE-04-INDEX.md`), load the skills named in `<skill_usage>` first, then execute this plan's tasks in order. These are decision/spike tasks — resolve each from evidence, record it, and close the ticket before the next. Run `<verify>` after each task. On completion, write the SUMMARY.md named in `<output>`.
</how_to_execute>

<context>
@.planning/adr/ADR-004-comms-rail-threads.md
@AGENTS.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/ROADMAP.md
@src/modules/security/source-write-admission.ts
@src/modules/inquiries/internal/schema.ts
@src/modules/notification-outbox/internal/schema.ts
@src/routes/api.business-actions.stripe-webhook.ts
</context>

<standards>
- Prime directive + theatre detector (ENGINEERING-STANDARDS.md §Prime directive, §Theatre detector): a recorded decision must be an invariant / interface / state machine / failure mode / acceptance gate / decision record — not aspiration. No "later" without a phase and non-goal.
- Honesty (ADR honesty rules): decisions must not claim booking/payment/dispatch/autonomous fulfilment as current capability; "verified" only against a named standard; live-money remains behind decision-record gates.
- Boundary posture (ADR §Boundary posture; AGENTS.md:14-28): business_endpoint egress is message delivery only — read+describe boundary of scope 2, never proxy/execute.
- Banned public vocabulary (AGENTS.md:90-92): any human-surface copy the decision implies stays free of source-owned/readback/manifest/capability/gateway/operator/MCP/OpenAPI/callable/autonomous/agent-native/DTO/fixture.
- /ponytail full posture (ENGINEERING-STANDARDS.md Required skills/modes): prefer the lightest viable mechanism (token over new session infra; existing scope over new enum value) and record why anything heavier was rejected.
</standards>

<antipatterns>
- Pre-answering a grilling ticket inside an implementation plan (relapse: "silently shrink scope"). Catch: this plan owns the decisions; 04-02/03/04 tasks only cite `resolution of #N` in `read_first`.
- Choosing a readback mechanism that leaks a business's relationship graph or exposes more than the initiator submitted (ADR Q3/fog). Catch: acceptance criterion asserts own-thread-only + own-redacted-contact-only + tombstone revocation.
- Widening the source-write scope enum "for later" without a bound (bloat detector: one-implementation adapter for later, ROADMAP.md:234). Catch: #24 resolution must justify a new `business_agent_reply` scope against reusing `public_inquiry`/`owner_inquiry`, with operationKey/correlation binding named.
- Baking a services-shaped job field (urgency/jobSuburb) into any decision (standing user veto, five-scopes.md:32). Catch: #26/#27 lifecycle/receipt decisions stay wedge-agnostic; no service/area/urgency vocabulary.
- Treating a 2xx POST as "read by the business" (ADR D7). Catch: #26 resolution separates delivered (endpoint 2xx) from read (explicit ack) and pins truthful copy.
</antipatterns>

<skill_usage>
- Task 1 (#22, #25): `grilling` to stress-test the token-vs-magic-link-vs-attributed tradeoff; `security-best-practices` for entropy/lifetime/storage/revocation; `security-threat-model` for the PII-bearing readback surface; `tanstack-router-best-practices` for the token-bearing route/poll shape.
- Task 2 (#23): `security-threat-model` + `security-best-practices` for the SSRF/egress guard list; `convex-best-practices` for where the dispatch guard executes.
- Task 3 (#24): `grilling` + `convex-security-audit` for the closed-enum blast radius and route-verifies/store-trusts-hash split.
- Task 4 (#26, #27): `grilling` for claimable-set + state-machine honesty; `domain-modeling` for the thread lifecycle envelope (derive vs widen); `product-design` for truthful owner/initiator copy per state.
- Task 5 (#28): `grilling` for the honest-labelling bar (AE-operated demo, no fake liquidity); `domain-modeling` for the minimal reconstructable transcript the verifier must show.
- All tasks: `/ponytail full` (lightest viable decision) and `wayfinder` (post resolution comment, close issue, append to map #1).
</skill_usage>

<preflight_gates>
- Scope-2 endpoint capability contract must be readable (endpoint URL field, verification/signing key field, checked/freshness state) before #23 can pin its guard list; if the scope-2 INDEX is absent, read ADR-002 + scope-2 tickets (#9,#10,#14) instead.
- Scope-3 attributed-agent principal + mandate shape must be readable before #22/#24 can bind the attributed-agent readback and reply admission; if absent, read ADR-003 + scope-3 tickets (#16..#21).
- No deployed env is required; these are decisions/spikes recorded in-repo + on GitHub.
</preflight_gates>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Resolve initiator readback auth + wait transport (#22, #25)</name>
  <files>.planning/adr/ADR-004-comms-rail-threads.md</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (Q3, D3, Q5/D6), src/modules/security/source-write-admission.ts (nonce/expiry pattern), src/modules/inquiries/internal/schema.ts (InquiryPrivacyTombstone*)</read_first>
  <action>Decide the anonymous-human readback mechanism: bearer readback token vs email magic-link vs attributed-only. Pin entropy, lifetime, storage, single-thread scoping, and privacy-tombstone/owner-close revocation. Confirm an anonymous human gets ONLY their own thread + own redacted contact. Then resolve the coupled wait-transport question (#25, blocked_by #22): choose the thinnest durable wait over the persisted thread for BOTH principal types — token-bearing human page (Convex reactivity vs polled route readback) and external attributed agent (poll endpoint vs SSE vs callback), with server-side expire-pending semantics; reject synchronous await-coupling per D6. Record both under ADR-004 '## Open questions → tickets' as 'Resolution:' lines. Post a resolution comment on #22 and #25, close both, and append one line each to wayfinder map issue #1 'Decisions so far'.</action>
  <verify>npm run test:copy && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - ADR-004 records the readback mechanism with entropy/lifetime/storage/scope/revocation and the wait-transport choice per principal type.
    - Decision states the initiator never gets more than own thread + own redacted contact, and the mechanism revokes on tombstone/close.
    - #22 and #25 are closed with resolution comments and appear on map issue #1.
    - Copy/ts-standards scans stay green (no banned vocabulary or type drift introduced into the ADR-adjacent contract language).
  </acceptance_criteria>
  <done>Initiator readback auth and wait transport are decided and consumable as 'resolution of #22'/'resolution of #25'.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Pin business_endpoint SSRF + endpoint-trust envelope (#23)</name>
  <files>.planning/adr/ADR-004-comms-rail-threads.md</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (Q4, D4, Risks a), scope-2 endpoint capability contract (scope-2 INDEX or ADR-002 + #9/#10/#14), src/routes/api.business-actions.stripe-webhook.ts (signature/tolerance pattern)</read_first>
  <action>Read scope-2's finalized endpoint capability shape and pin the concrete egress guard list the business_endpoint adapter must enforce: exact source of the endpoint URL + verification/signing key (which scope-2 field, required checked/freshness state before AE will dispatch); SSRF defenses (URL == registered endpoint, no redirects, block private/link-local/loopback ranges, DNS-rebinding defense, timeout + response-size caps); and the suspend-dispatch rule when a scope-2 endpoint is stale/contradicted/unreachable, plus how that state is surfaced. Confirm the dispatch stays inside scope 2's read+describe boundary (message delivery, never proxy/execute). Record under ADR-004 as a 'Resolution:' guard list. Post a resolution comment on #23, close it, append one line to map issue #1.</action>
  <verify>npm run test:source-mining && npm run test:copy</verify>
  <acceptance_criteria>
    - ADR-004 records a concrete, enumerable guard list bound to a named scope-2 field and checked-state precondition.
    - Guard list forbids arbitrary-URL dispatch, redirects, and private-range targets; names timeout/size caps and DNS-rebinding defense.
    - Suspend-on-stale/contradicted/unreachable behavior and its surfaced state are defined.
    - #23 is closed with a resolution comment and appears on map issue #1.
  </acceptance_criteria>
  <done>The business_endpoint egress envelope is pinned and consumable as 'resolution of #23'.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Decide source-write scope for business-agent reply admission (#24)</name>
  <files>.planning/adr/ADR-004-comms-rail-threads.md</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (Q4/D4, Q5/D5), src/modules/security/source-write-admission.ts:3-33 (closed scope enum), convex/sourceWriteAdmission.ts (Convex validator side)</read_first>
  <action>Decide whether an inbound business_agent reply fits an existing source-write scope (`public_inquiry` / `owner_inquiry`) or truly needs a new `business_agent_reply` scope. If new, state the blast radius of widening BOTH the TS enum (source-write-admission.ts) and the Convex validator (sourceWriteAdmission.ts), and the required operationKey/correlation binding (thread + inbound providerEventId). Define how the route-verified business signature relates to the source-write signature (route-verifies, store-trusts-hash split). Record under ADR-004 as a 'Resolution:'. Post a resolution comment on #24, close it, append one line to map issue #1.</action>
  <verify>npm run test:ts-standards && npm run check:convex-codegen</verify>
  <acceptance_criteria>
    - ADR-004 names the chosen scope (existing or new) with justification against reuse.
    - If new, the dual-enum blast radius and operationKey/correlation binding are enumerated.
    - The route-verify vs store-trust-hash relationship is stated.
    - #24 is closed with a resolution comment and appears on map issue #1.
  </acceptance_criteria>
  <done>The reply-admission source-write scope is decided and consumable as 'resolution of #24'.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Decide read-receipt honesty + thread lifecycle/TTL (#26, #27)</name>
  <files>.planning/adr/ADR-004-comms-rail-threads.md</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (Q6/D7, Q8 lifecycle, D9), src/modules/inquiries/internal/schema.ts:22-57 (InquiryThreadStatus + OwnerInboxBucket), src/modules/notification-outbox/internal/schema.ts:41-60 (attempt/webhook statuses)</read_first>
  <action>Resolve the claimable receipt set (#26): whether a 2xx outbound POST is honestly 'received by the business' absent a read ack; whether to admit an optional inbound received/read ack event kind or truthfully leave business-agent read UNKNOWN and only ever show delivered; and the truthful owner + initiator copy for each state (delivered / not-yet-read / received / unknown). Resolve the lifecycle question (#27): whether to widen the thread status enum (unread|read|replied|closed) or keep it minimal and DERIVE lifecycle from message/delivery state, how that interacts with owner inbox buckets (unread|needs_reply|resolved), whether a thread auto-expires on TTL and the state+copy an expired thread shows both sides, and where 'awaiting business endpoint' vs 'awaiting human owner' lives without leaking internal vocab publicly. Keep both wedge-agnostic (no service/area/urgency). Record both under ADR-004 as 'Resolution:' lines. Post resolution comments on #26 and #27, close both, append one line each to map issue #1.</action>
  <verify>npm run test:copy && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - ADR-004 records the exact claimable receipt set and its per-state copy, keeping delivered and read distinct.
    - Lifecycle decision states derive-vs-widen, TTL/expiry behavior, owner-bucket interaction, and the public-safe awaiting distinction.
    - Both decisions are wedge-agnostic (no local-services job fields).
    - #26 and #27 are closed with resolution comments and appear on map issue #1.
  </acceptance_criteria>
  <done>Receipt honesty and thread lifecycle are decided and consumable as 'resolution of #26'/'resolution of #27'.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Decide seeded demo business-agent endpoint shape (#28)</name>
  <files>.planning/adr/ADR-004-comms-rail-threads.md</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (Done e2e, D4/D5), resolution of #23, resolution of #24, local://five-scopes.md:34 (done-e2e criterion)</read_first>
  <action>Decide the demo responder's shape for the scope-4 e2e (built in 04-04): confirm there is a seeded demo endpoint, honestly labelled an AE-operated demo (NOT a real business) so no fake liquidity is implied; that it verifies AE's outbound signature and returns a signed structured quote through the inbound admission path (per resolution of #23/#24); and the minimal reconstructable transcript the verifier must show end to end (submit → dispatch attempt → signed reply → readback → delivery receipts). Do NOT build it here — this task pins the spec and honest-labelling bar only. Record under ADR-004 as a 'Resolution:'. Post a resolution comment on #28, close it, append one line to map issue #1.</action>
  <verify>npm run test:copy</verify>
  <acceptance_criteria>
    - ADR-004 records the demo endpoint's honest AE-operated-demo labelling requirement and no-fake-liquidity constraint.
    - The signed-quote round-trip and minimal reconstructable transcript are specified for 04-04 to build.
    - #28 is closed with a resolution comment and appears on map issue #1.
  </acceptance_criteria>
  <done>The demo endpoint spec is decided and consumable as 'resolution of #28' by plan 04-04.</done>
</task>

</tasks>

<verification>
- [ ] npm run test:copy
- [ ] npm run test:ts-standards
- [ ] npm run test:source-mining
- [ ] npm run check:convex-codegen
- [ ] All of #22, #23, #24, #25, #26, #27, #28 are closed with resolution comments and appear on wayfinder map issue #1 'Decisions so far'.
- [ ] ADR-004 '## Open questions → tickets' carries a 'Resolution:' line per ticket.
</verification>

<success_criteria>
- All seven scope-4 tickets resolved, recorded in ADR-004, closed on GitHub, and mirrored on map issue #1.
- No implementation plan pre-answers a ticket; each cites 'resolution of #N'.
- Copy/source/type scans stay green; no banned vocabulary or money-rail/services-shaped drift enters the recorded decisions.
- Decisions keep the quote≠transaction boundary and the read+describe (never proxy/execute) egress posture intact.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-04-comms-rail-threads/04-01-SUMMARY.md`.
</output>
