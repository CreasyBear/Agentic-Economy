---
phase: scope-04-comms-rail-threads
plan: "04-03"
type: execute
wave: 2
depends_on: ["04-01", "04-02"]
files_modified:
  - src/modules/notification-outbox/internal/schema.ts
  - src/modules/notification-outbox/internal/commands.ts
  - src/modules/notification-outbox/public.ts
  - src/modules/security/source-write-admission.ts
  - src/lib/server/source-write-admission.ts
  - convex/sourceWriteAdmission.ts
  - convex/notificationOutbox.ts
  - convex/inquiries.ts
  - src/routes/api.inquiry.endpoint-webhook.ts
  - src/modules/inquiries/internal/commands.ts
  - tests/unit/notification-outbox/business-endpoint-adapter.test.ts
  - tests/unit/inquiries/business-agent-reply-admission.test.ts
  - tests/integration/inquiry-endpoint-webhook.test.ts
  - tests/imports/ts-standards.test.ts
autonomous: true
requirements: [D4, D5, D6, D9]
user_setup:
  - "Local Convex dev must accept schema/validator changes: `npx convex dev --once --typecheck=disable --codegen=disable` then `npm run check:convex-codegen`. AE→external egress and inbound webhook are exercised against a LOCAL fixture endpoint only; no deployed env, no real business URL."
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s4-business-endpoint-family
      statement: "A distinct outbox provider family `business_endpoint` reuses the existing dispatch/attempt/webhook record shapes (retry/backoff, providerIdempotencyKey, dead-letter) but enforces the #23 SSRF/egress guard list and dispatches only to the scope-2 registered/checked endpoint — never an arbitrary URL, never proxy/execute."
    - id: s4-outbound-signed
      statement: "AE signs outbound POSTs with `Ae-Signature: v1,t=<ts>,sig=<hmac>` over `${ts}.${bodyHash}` using AE's per-business secret; delivery is 'delivered' on 2xx and retried with backoff on 4xx/5xx/timeout, dead-lettering to retry_exhausted/no_repair."
    - id: s4-inbound-admitted
      statement: "Inbound business replies at POST /api/inquiry/endpoint-webhook are route-verified (business signature), deduped by providerEventId, admitted via the #24-decided source-write scope, validated + redacted, and written as `business_agent` messages; AE NEVER auto-generates a business reply."
    - id: s4-rate-caps
      statement: "Per-identity caps reuse rateLimitClaim + inquiryAbuseBuckets with keys thread_message:{threadId}, initiator_thread:{principal}, and a per-endpoint burst cap; a flooding endpoint is held/no_repair."
  artifacts:
    - path: src/modules/notification-outbox/internal/commands.ts
      provides: "business_endpoint adapter: signed outbound dispatch, SSRF guard, retry/backoff/dead-letter over existing records."
    - path: src/routes/api.inquiry.endpoint-webhook.ts
      provides: "Inbound webhook route: verify business signature, dedupe providerEventId, admit via source-write, write business_agent message."
    - path: src/modules/security/source-write-admission.ts
      provides: "The reply-admission scope decided in #24 (existing reuse or new business_agent_reply) with operationKey/correlation binding."
  key_links:
    - from: scope-2 registered/checked endpoint (resolution of #23)
      to: business_endpoint outbound adapter
      via: "dispatch target equals the registered endpoint only; stale/contradicted/unreachable suspends dispatch."
    - from: inbound business signature (route-verified)
      to: source-write admission (store-trusts-hash)
      via: "route verifies the business signature; the reply is admitted under the #24 scope with thread+providerEventId binding."
    - from: outbox attempt row
      to: delivery receipt
      via: "2xx => delivered; 4xx/5xx/timeout => failed + retry/backoff; exhaustion => dead-letter."
---

<objective>
Turn the one-way notification outbox into a two-way, cross-org message rail without loosening its trust radius. Add a `business_endpoint` provider family that reuses the proven dispatch/attempt/webhook machinery but enforces the #23 SSRF/egress guard list; AE signs outbound POSTs to the scope-2 registered endpoint; inbound business replies arrive at a signed webhook, are admitted through the #24-decided source-write scope, and are written as `business_agent` messages. Per-identity rate caps bound both sides.

Purpose: durable, receipted, signed transport between the two parties — the omp-IRC "wake/receipt/inbox" grammar mapped onto Convex + webhooks (D6), with ephemerality/implicit-trust/reply-on-behalf explicitly rejected.
Output: outbox family + adapter, inbound webhook route, source-write scope, rate caps, unit + integration proofs.
</objective>

<how_to_execute>
Fresh session: read the scope INDEX (`SCOPE-04-INDEX.md`), load the skills named in `<skill_usage>` first, then execute this plan's tasks in order; TDD where marked. Run `<verify>` after each task. On completion, write the SUMMARY.md named in `<output>`.
</how_to_execute>

<context>
@.planning/adr/ADR-004-comms-rail-threads.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/codebase/ARCHITECTURE.md
@src/modules/notification-outbox/internal/schema.ts
@src/modules/notification-outbox/public.ts
@src/modules/security/source-write-admission.ts
@src/lib/server/source-write-admission.ts
@convex/sourceWriteAdmission.ts
@src/routes/api.notification.resend-webhook.ts
@src/routes/api.business-actions.stripe-webhook.ts
@src/modules/security/public.ts
@convex/inquiries.ts
</context>

<standards>
- Side-effect/outbox standard (ENGINEERING-STANDARDS.md §Side-effect/outbox): no best-effort external write without durable attempt state; every attempt stores attemptId/logicalKey/sourceHash/status/retryCount/retryAfter/lastErrorCode/lastErrorRedacted/startedAt/finishedAt; every failed/stale readback needs a repair action or explicit no-repair.
- Admission/security standard (§Admin/security; §Import/source-mining): source-write scope is a closed enum gated in BOTH TS and the Convex validator; route-verifies-then-store-trusts-hash split (mirror api.business-actions.stripe-webhook.ts HMAC-SHA256 over `${ts}.${body}`, 300s tolerance, constant-time compare); owner/business-authored text is untrusted data.
- Audit standard (§Audit): consequential dispatch/admission writes emit typed audit events with idempotency key, before/after where state changes, redacted payload + hash, correlation ID always present.
- TypeScript hard spec (§TS hard spec): no `any`/`v.any()`/double-cast/non-null; provider family + statuses are const tuple unions; discriminated result unions for expected failures; the added ts-standards fixture proves the new scope/family are covered.
- Route boundary (CONVENTIONS.md Routes): the webhook route is a thin adapter — parses, verifies signature, calls a `sourceMutation` (mirror resend-webhook), maps failures to JSON; no Convex schema/internal imports, no provider SDK.
- Convex standards (§Convex): validators on every function; retryable mutations carry a durable idempotency key; indexes for every query path; auth/authority derived inside the boundary.
- /ponytail full: reuse the existing dispatch/attempt/webhook records and rateLimitClaim/inquiryAbuseBuckets; do NOT build a new transport or a new rate-limit system.
</standards>

<antipatterns>
- Dispatching to an arbitrary URL / following redirects / hitting private ranges (ADR Risk a; #23). Catch: `tests/unit/notification-outbox/business-endpoint-adapter.test.ts` asserts refusal for non-registered URL, redirect, private/loopback/link-local target, oversized/slow response; adapter proves URL==registered scope-2 endpoint.
- Sharing the resend/novu email adapter's trust assumptions (ADR alt rejected). Catch: `business_endpoint` is a DISTINCT family with its own adapter; unit test asserts the email adapter is not reused for external URLs.
- Best-effort POST with no durable attempt row (bloat detector; ROADMAP.md:238). Catch: adapter writes attempt rows with retry/backoff and dead-letters; `npm run test:ts-standards` + unit test on retry_exhausted/no_repair.
- Widening the source-write enum without operationKey/correlation binding (§Admin/security). Catch: `npm run test:ts-standards` fixture covers the new scope; unit test binds admission to thread + providerEventId.
- AE fabricating a business reply / auto-reply-on-behalf (ADR D5/D6 rejected outright). Catch: there is NO code path that generates a business_agent message without an inbound verified POST; integration test proves silence stays silence (timeout + delivery state), and a unit test asserts no synthetic reply generator exists.
- Money-rail fields entering the thread/message/dispatch schema (money quarantine, ROADMAP.md:201). Catch: `npm run test:source-mining`.
- Payment/provider identifier or Stripe/x402/wallet in the new family (§Import/source-mining). Catch: `npm run test:source-mining` + `npm run test:copy`.
</antipatterns>

<skill_usage>
- Task 1: `security-best-practices` + `security-threat-model` (SSRF/egress guard list from resolution of #23) + `convex-best-practices` (where the guard + dispatch run; idempotent attempt writes) + `codebase-design` (adapter as a deep module behind outbox public.ts) + `tdd`.
- Task 2: `convex-security-audit` (closed source-write enum blast radius from resolution of #24) + `security-best-practices` (route-verify vs store-trust-hash split; constant-time compare; replay window) + `clerk-tanstack-patterns` not needed — business identity is signature-based; `tanstack-router-best-practices` (thin webhook route) + `tdd`.
- Task 3: `convex-performance-audit` (bounded rate-limit reads / index on abuse buckets) + `convex-best-practices` (reuse rateLimitClaim + inquiryAbuseBuckets) + `tdd`.
- All tasks: `/ponytail full`, `code-review` on the dual-enum + new-family diff, and `grilling` if the #23/#24 resolutions leave any egress/scope ambiguity (bounce back to 04-01, do not guess).
</skill_usage>

<preflight_gates>
- resolution of #23 (SSRF/egress guard list) MUST be recorded before Task 1; the adapter enforces that exact list. If absent or ambiguous, STOP and escalate to the 04-01 owner — do not invent an egress policy.
- resolution of #24 (reply-admission source-write scope) MUST be recorded before Task 2; if it chose a new `business_agent_reply` scope, widen BOTH source-write-admission.ts and convex/sourceWriteAdmission.ts together with the ts-standards fixture.
- Scope-2 endpoint capability contract must expose the endpoint URL + verification/signing key + checked/freshness state fields the adapter reads; if scope-2 has not shipped these, this plan is BLOCKED on scope 2 (note in SUMMARY, do not stub).
- Exercised against a LOCAL fixture endpoint only — no deployed env, no real business URL. Deployed provider proof is out of scope-4 (belongs to scope 1).
</preflight_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: business_endpoint provider family + SSRF-guarded outbound adapter</name>
  <files>src/modules/notification-outbox/internal/schema.ts, src/modules/notification-outbox/internal/commands.ts, src/modules/notification-outbox/public.ts, convex/notificationOutbox.ts, tests/unit/notification-outbox/business-endpoint-adapter.test.ts</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (D4, D6 transfer table, Risk a), src/modules/notification-outbox/internal/schema.ts:16-119, src/modules/notification-outbox/public.ts, src/routes/api.business-actions.stripe-webhook.ts:116-144 (HMAC pattern), resolution of #23</read_first>
  <action>Add `business_endpoint` to `NotificationProviderFamilyValues` (and its Convex validator) and implement a distinct outbound adapter that reuses the existing NotificationDispatchRecord/AttemptRecord/WebhookEventRecord shapes: POST the serialized message to the scope-2 registered/checked endpoint ONLY, signing `Ae-Signature: v1,t=<ts>,sig=<hmac>` over `${ts}.${bodyHash}` with AE's per-business secret; idempotency via existing providerIdempotencyKey; 2xx => delivered, 4xx/5xx/timeout => failed + retry/backoff via existing retryCount/retryAfter, exhaustion => retry_exhausted/no_repair dead-letter. Enforce the resolution-of-#23 guard list (URL == registered endpoint, no redirects, block private/loopback/link-local, DNS-rebinding defense, timeout + response-size caps) and suspend dispatch when the scope-2 endpoint is stale/contradicted/unreachable. Do NOT reuse the resend/novu email adapter. Unit-test signature format, idempotency, retry/backoff/dead-letter, and every SSRF refusal.</action>
  <verify>npx vitest run tests/unit/notification-outbox/business-endpoint-adapter.test.ts && npm run test:ts-standards && npm run test:source-mining && npm run check:convex-codegen</verify>
  <acceptance_criteria>
    - business_endpoint is a distinct family reusing dispatch/attempt/webhook records with durable attempt state.
    - Outbound POSTs are signed correctly and dispatch only to the registered scope-2 endpoint.
    - Every #23 SSRF/egress refusal (non-registered URL, redirect, private range, oversized/slow) is enforced and tested.
    - Retry/backoff and dead-letter (retry_exhausted/no_repair) work; no email-adapter reuse.
  </acceptance_criteria>
  <done>AE can durably, safely deliver a signed message to a business's registered endpoint.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: inbound endpoint-webhook route + business_agent reply admission</name>
  <files>src/routes/api.inquiry.endpoint-webhook.ts, src/modules/security/source-write-admission.ts, src/lib/server/source-write-admission.ts, convex/sourceWriteAdmission.ts, convex/inquiries.ts, src/modules/inquiries/internal/commands.ts, tests/unit/inquiries/business-agent-reply-admission.test.ts, tests/imports/ts-standards.test.ts</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (D5, D6), src/routes/api.notification.resend-webhook.ts (route mirror), src/routes/api.business-actions.stripe-webhook.ts:107-144 (verify pattern), src/modules/security/source-write-admission.ts:3-33, resolution of #24</read_first>
  <action>Add the reply-admission source-write scope decided in #24 (reuse `public_inquiry`/`owner_inquiry` OR add `business_agent_reply`) to BOTH `SourceWriteAdmissionScopeValues` and the Convex validator, updating the ts-standards fixture to cover it. Add `src/routes/api.inquiry.endpoint-webhook.ts` (new), mirroring the resend-webhook route: verify the business signature (route-verifies), dedupe by providerEventId (reuse NotificationWebhookEventRecord), then admit the reply through source-write admission bound to thread + providerEventId (store-trusts-hash), validate + redact, and write an `InquiryMessageRecord` with `sender: 'business_agent'` and `operatedBy` provenance. There is NO auto-reply/synthetic-reply path. Unit-test signature rejection, replay/dedupe, admission scope binding, redaction, and business_agent message write; assert no synthetic-reply generator exists.</action>
  <verify>npx vitest run tests/unit/inquiries/business-agent-reply-admission.test.ts tests/imports/ts-standards.test.ts && npm run test:ts-standards && npm run test:imports && npm run check:convex-codegen</verify>
  <acceptance_criteria>
    - The #24 scope is present in both TS and Convex validators and covered by the ts-standards fixture.
    - Inbound replies are signature-verified, deduped by providerEventId, admitted under the bound scope, redacted, and stored as business_agent messages.
    - No code path fabricates a business reply; silence stays silence.
    - The webhook route imports only module seams (route-boundary scan green).
  </acceptance_criteria>
  <done>Business agents can reply into the thread over a signed, admitted webhook without AE ever speaking for them.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: per-identity rate caps (thread + initiator + endpoint)</name>
  <files>src/modules/inquiries/internal/commands.ts, convex/inquiries.ts, tests/integration/inquiry-endpoint-webhook.test.ts</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (D9, Q8), src/modules/security/public.ts:300-320 (rateLimitClaim), convex/inquiries.ts:559-610 (inquiryAbuseBuckets cleanup + bucket keys)</read_first>
  <action>Reuse `rateLimitClaim` + `inquiryAbuseBuckets` with new per-identity bucket keys: `thread_message:{threadId}` (per-thread message cap), `initiator_thread:{principal}` (new-thread cap per window), and a per-endpoint burst cap for inbound business_agent replies (flooding endpoint => held/no_repair). Wire the caps into the message-write and inbound-admission paths from Tasks 1-2. Write an integration test driving submit → outbound dispatch → inbound reply that proves: an over-cap thread message is rate-limited with a typed reason; a flooding endpoint's replies are held/no_repair; and the whole round-trip (submit → signed dispatch attempt → signed reply → business_agent message) is reconstructable from persisted rows.</action>
  <verify>npx vitest run tests/integration/inquiry-endpoint-webhook.test.ts && npm run test:integration && npm run typecheck</verify>
  <acceptance_criteria>
    - thread_message, initiator_thread, and per-endpoint burst caps enforce with typed rate-limit reasons.
    - A flooding endpoint is held/no_repair rather than flooding the thread.
    - The full round-trip is reconstructable from persisted dispatch/attempt/message rows.
    - Rate limiting reuses rateLimitClaim + inquiryAbuseBuckets (no new rate system).
  </acceptance_criteria>
  <done>Both sides of the rail are rate-bounded and the round-trip is durably reconstructable.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/notification-outbox/business-endpoint-adapter.test.ts tests/unit/inquiries/business-agent-reply-admission.test.ts tests/integration/inquiry-endpoint-webhook.test.ts tests/imports/ts-standards.test.ts
- [ ] npm run test:ts-standards
- [ ] npm run test:imports
- [ ] npm run test:source-mining
- [ ] npm run test:integration
- [ ] npm run check:convex-codegen
- [ ] npm run typecheck
</verification>

<success_criteria>
- business_endpoint delivers signed messages only to the registered scope-2 endpoint under the #23 guard list, with durable retry/backoff/dead-letter.
- Inbound replies are route-verified, deduped, admitted under the #24 scope, redacted, and stored as business_agent messages; AE never fabricates a reply.
- Per-identity caps bound thread/initiator/endpoint traffic; a flooding endpoint is held.
- All scans + integration + codegen are green (source/local proof against a local fixture endpoint; deployed provider proof is scope 1, not scope 4).
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-04-comms-rail-threads/04-03-SUMMARY.md`.
</output>
