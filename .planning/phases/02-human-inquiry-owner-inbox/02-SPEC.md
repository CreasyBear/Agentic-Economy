# Phase 2: Human Inquiry + Owner Inbox — Specification

**Created:** 2026-06-27
**Ambiguity score:** 0.13 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

A customer can submit one conservative inquiry for a published service, the source-owned owner can read and reply from an inbox, and notification failure is visible without losing the message.

## Background

Current repo state is planning-only and Phase 2 does not yet have a GSD phase directory. ROADMAP.md defines Phase 2 as customer inquiry, owner inbox/reply, one notification adapter, and durable message/audit state, while cutting AI handling, booking, payments, actions, and multi-channel bloat. Phase 1 01-SPEC.md and 01-CONTEXT.md deliberately keep inquiry_available unavailable unless contact/consent evidence and executable handling exist. The backup scout found reusable atoms in durable conversation state, owner inbox projection, owner reply state transitions, notification outbox/readback, contact-proof hashing, and redacted provider payloads; it also found SSE chat, AI suggestions, request-market, wallet, and multi-channel notification topology that must not be copied.

## Requirements

1. **Inquiry availability gate**: Phase 2 exposes inquiry_available only for published, non-suppressed services whose source-owned catalog state proves contact or no-contact policy, consent, and owner handling readiness; otherwise public outputs remain not_available_yet or ae_status_only.
   - Current: Phase 1 allows only truthful first-request disclosure and explicit unavailable states; no inquiry runtime exists.
   - Target: Service capability readbacks and public catalog/discovery outputs expose inquiry availability only after the inquiry module, owner handling, abuse controls, and notification readback are live.
   - Acceptance: A verifier can toggle service eligibility, consent/contact state, inquiry module readiness, and suppression and see public page/API/UCP/llms output switch between available and unavailable states without stale claims.

2. **Inquiry submit command**: A public customer inquiry submission persists one durable inquiry thread and first message with business/service targets, idempotency key, correlation ID, abuse bucket, redacted contact metadata, and typed rejection states for ineligible, suppressed, duplicate, rate-limited, or invalid input.
   - Current: No public inquiry route, inquiry table, message state, or submission command exists.
   - Target: submitInquiry is the only public submit seam; it validates source-owned business/service eligibility and records a durable thread/message plus audit in one logical operation.
   - Acceptance: Tests prove valid submit persists exactly one thread/message/audit event; empty content, invalid target, suppressed business/service, duplicate/replay, rate-limit, and malformed contact paths return typed failures and do not create public projections.

3. **Owner inbox projection**: The owner inbox lists only inquiries for businesses the authenticated owner or manager may access, with stable ordering, unread/needs-reply/resolved buckets, sparse and empty states, and no cross-owner data leakage.
   - Current: Owner status readback is Phase 1-only and does not include inquiry threads.
   - Target: listOwnerInbox and readOwnerInquiry derive access from Convex/Clerk owner membership and expose allowlisted inquiry projections for owner UI.
   - Acceptance: Tests prove owner A cannot see owner B inquiries, revoked/wrong-owner access returns not-found or forbidden, ordering is stable for equal timestamps, and empty/sparse/populated buckets render deterministically.

4. **Owner reply state machine**: Owner replies and thread-close transitions require source-owned owner access, non-terminal inquiry state, non-empty length-capped content, idempotency, audit events, and typed conflict results for stale or duplicate actions.
   - Current: No owner reply command or thread terminal state exists.
   - Target: replyToInquiry, markInquiryRead, and closeInquiry transition inquiry state through explicit literal unions and audit every consequential change.
   - Acceptance: Tests prove valid reply appends one owner message; empty/too-long reply, terminal thread, stale version, duplicate idempotency key with changed body, and wrong-owner reply are rejected with typed results and audit where applicable.

5. **Notification outbox and readback**: A single notification adapter dispatches redacted inquiry/reply notifications through durable outbox rows with queued, sent, retryable, permanent-failure, suppressed, and provider-missing readback states; notification failure never loses the inquiry or reply.
   - Current: Phase 1 has funnel/audit readback but no notification outbox.
   - Target: Inquiry and owner reply create notification outbox attempts with redacted payloads, retry/no-repair posture, and owner/admin readback.
   - Acceptance: Forced provider missing, retryable failure, permanent failure, suppression, and successful send states are queryable; inquiry/message persistence remains intact when notification dispatch fails.

6. **Private content boundary**: Inquiry private content, claimant contact, owner notes, notification payloads, and provider readbacks remain private source state and are excluded from public catalog, registry, API, UCP, llms, sitemap, SEO schema, logs, and marketing copy.
   - Current: Phase 1 public allowlists exist but no inquiry-private fields exist yet.
   - Target: Inquiry storage and projections use allowlists/redaction; public surfaces may expose only non-sensitive availability/status counts if explicitly specified.
   - Acceptance: Public projection, log/audit redaction, SEO/schema, UCP/llms, and API tests prove raw inquiry body, contact, owner notes, provider payloads, and secrets never appear outside private owner/admin readbacks.

7. **Inquiry and inbox UI states**: Public inquiry and owner inbox UI cover reachable loading, empty, invalid input, abuse blocked, submitted, delivery failed, unread, reply pending, reply failed, resolved, suppressed, mobile, keyboard, focus, and accessible-name states.
   - Current: No inquiry form, inbox route, or owner reply UI exists.
   - Target: Public page exposes the inquiry action only when eligible; owner inbox and thread panel use accessible, responsive components and preserve user input through recoverable failures.
   - Acceptance: E2E/a11y tests cover 375px mobile, keyboard-only submit/reply, focus after validation errors, loading/empty/error states, long customer text, and suppressed/ineligible service states.

8. **Phase 2 closeout proof**: Phase 2 closeout proves customer inquiry to owner reply end to end with durable audit, notification readback, privacy-safe funnel events, and no AI reply, booking, payment, protected-action, or multi-channel runtime surface.
   - Current: No Phase 2 runtime or phase directory exists.
   - Target: A cold clone can run a narrow command suite proving submit to owner inbox to owner reply to notification readback to audit/reconstruction.
   - Acceptance: The closeout evidence includes one seeded published service, one customer inquiry, one owner reply, notification success/failure readback, funnel events, audit reconstruction, copy scans, and source-mining/import scans proving excluded future surfaces remain absent.

## Boundaries

**In scope:**
- Public inquiry availability gate tied to Phase 1 catalog/service capability state.
- One public inquiry submission route/command for published eligible services.
- Owner inbox list/detail/reply/close readbacks scoped by source-owned owner access.
- Durable inquiry threads/messages, notification outbox/readback, audit, idempotency, abuse buckets, and privacy-safe funnel events.
- One notification adapter boundary with redacted payloads and visible failure state.
- Accessible public inquiry form and owner inbox/reply UI states.
- Tests and copy scans proving no AI, booking, payment, protected-action, or multi-channel overclaim.

**Out of scope:**
- Autonomous or AI replies — Phase 2 is human-only owner response.
- Booking, scheduling, quote acceptance, protected actions, or provider attempts — later authority phases.
- Payments, wallet, billing, Stripe, x402, receipt settlement, or paid priority — Phase 5 only.
- Multi-channel notification suite, SMS/WhatsApp/Slack/Teams/RCS/voice, attachments, or PWA offline outbox — bloat until a single channel proves insufficient.
- Public exposure of private inquiry content through registry/API/discovery/SEO — violates Phase 1 public-truth boundary.
- API keys, MCP/OpenAPI mutation surfaces, SDK/CLI/plugin, hosted agents, request market, experts, or marketplace inboxes — not needed for the conservative owner flow.

## Constraints

- Convex remains source of truth; browser input never supplies owner/admin authority.
- Public submit may be anonymous but must be abuse-limited, idempotent, and redacted.
- Owner access derives from Clerk/Convex owner membership; unauthorized inquiry reads should not leak existence across owners.
- Notification adapter identity is a discuss-phase implementation choice; the SPEC locks the durable outbox/readback contract, not the provider.
- Inquiry content is private user data; audit/log/readback stores redacted payloads or hashes unless a private vault is explicitly designed.
- Suppression/operator controls must disable new public inquiry entry and preserve private owner/admin reconstruction of already-submitted messages.
- Phase 2 must reuse Phase 1 audit, idempotency, redaction, and copy-scan standards rather than creating parallel systems.

## Acceptance Criteria

- [ ] inquiry_available appears only when published service eligibility, contact/consent policy, inquiry module readiness, owner handling, and notification readback gates are true.
- [ ] submitInquiry persists exactly one thread/message/audit event for valid input and returns typed failures for ineligible, suppressed, duplicate, rate-limited, invalid, or malformed input.
- [ ] Owner inbox list/detail exposes only owner-authorized inquiries with stable ordering, buckets, empty/sparse states, and no cross-owner leakage.
- [ ] Owner reply/read/close transitions are idempotent, audited, length-capped, version-safe, and reject wrong-owner, terminal, stale, duplicate-different-body, empty, and too-long paths.
- [ ] Notification outbox records queued/sent/retryable/permanent/suppressed/provider-missing states; provider failure does not lose inquiry or reply state.
- [ ] Inquiry body, claimant contact, owner notes, provider payloads, and notification secrets are absent from page, registry, API, UCP, llms, sitemap, SEO schema, logs, and marketing copy.
- [ ] Public inquiry and owner inbox/reply UI pass mobile 375px, keyboard, focus, labels, loading, empty, invalid, abuse-blocked, submitted, failed, unresolved, resolved, and suppressed-state checks.
- [ ] Privacy-safe funnel events record inquiry submitted, owner viewed, owner replied, notification attempted, notification failed/sent, and suppression-disabled states without raw private payloads.
- [ ] Copy/source-mining scans prove no AI reply, booking, payment, protected action, request market, hosted agent, voice, expert, or multi-channel notification runtime ships.
- [ ] Closeout evidence reconstructs customer inquiry to owner read to owner reply to notification readback to audit from source state.

## Edge Coverage

**Coverage:** 15/15 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | R1 | ⛔ dismissed | Gate requirement has no data-operation edge by itself; concrete eligibility toggles are covered by acceptance criteria for published, suppressed, consent, readiness, and stale public outputs. |
| boundary, empty, encoding, precision | R2 | ✅ covered | Acceptance covers target eligibility, empty/invalid input, redacted encoded contact/text, exact typed failures, duplicate/replay, and rate-limit behavior. |
| adjacency, empty, ordering | R3 | ✅ covered | Acceptance covers adjacent owner scopes, empty/sparse buckets, and stable ordering for equal timestamps. |
| empty, encoding | R4 | ✅ covered | Acceptance covers empty/too-long owner replies, safe content handling, stale versions, and duplicate-different-body idempotency. |
| unclassified | R5 | ⛔ dismissed | Outbox lifecycle is a state-machine requirement; acceptance explicitly covers every notification state and the failure-does-not-lose-message invariant. |
| concurrency | R6 | ✅ covered | Acceptance requires private/public projection tests under notification, suppression, logging, and public-generation races. |
| empty, encoding | R7 | ✅ covered | Acceptance covers empty/loading/error UI and long/invalid text, labels, focus, and accessible-name handling. |
| unclassified | R8 | ⛔ dismissed | Closeout proof is a verification bundle; excluded future surfaces are enforced by prohibitions and source-mining scans. |

## Prohibitions (must-NOT)

**Coverage:** 6/6 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT generate or send autonomous, AI-drafted, or agent-authored replies as the owner. | R4, R8 | resolved | test + judgment: copy/runtime scans and owner-reply E2E require human owner action. |
| MUST NOT expose private inquiry content, contact data, owner notes, or notification payloads in public catalog, registry, API, UCP, llms, sitemap, SEO/schema, logs, or marketing copy. | R2, R6, R8 | resolved | test: projection allowlist, redaction, log, discovery, SEO, and copy tests. |
| MUST NOT imply booking, payment, provider execution, protected actions, guaranteed response, or marketplace liquidity from an inquiry being available. | R1, R7, R8 | resolved | test + judgment: copy scans and product review. |
| MUST NOT add multi-channel notification topology before one adapter has source-owned readback and failure handling. | R5, R8 | resolved | test: source-mining/import scans reject SMS/WhatsApp/Slack/Teams/RCS/voice/provider sprawl unless intentionally selected later. |
| MUST NOT allow browser-supplied owner IDs, business owner IDs, admin IDs, or route-local membership checks to authorize inbox reads or replies. | R3, R4 | resolved | test: wrong-owner, revoked-owner, and cross-owner leakage cases. |
| MUST NOT let notification success or failure become the source of truth for inquiry/message persistence. | R2, R5, R8 | resolved | test: provider failure/readback never deletes or creates inquiry messages. |

Canon security/compliance items such as CSRF, injection, SSRF, generic OWASP controls, cookie/session handling, provider-secret hygiene, and privacy law baselines remain owned by SECURITY-SPEC.md, secure-phase/code review, and implementation tests. This section records only phase-specific product and architecture prohibitions.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes |
|--------------------|-------|------|--------|-------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | One customer inquiry to owner reply outcome is specific. |
| Boundary Clarity   | 0.92  | 0.70 | ✓      | AI, booking, payments, actions, and multi-channel surfaces are explicit cuts. |
| Constraint Clarity | 0.78  | 0.65 | ✓      | Provider identity is deferred to discuss-phase; durable outbox/readback is locked. |
| Acceptance Criteria| 0.86  | 0.70 | ✓      | Criteria cover public submit, owner reply, privacy, notification, UI, and closeout. |
| **Ambiguity**      | 0.13  | ≤0.20| ✓      | Gate passed from roadmap, Phase 1 context, and phase-specific source-mining scouts. |

Status: ✓ = met minimum, ⚠ = below minimum.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 0 | Researcher | Current state scout | Only Phase 1 has a directory/spec; runtime tree is absent; Phase 2 exists in roadmap as future source-owned capability. |
| 1 | Researcher / Simplifier | What is the irreducible Phase 2? | One human inquiry path: public submit, owner inbox, owner reply, one notification adapter, durable audit/readback. |
| 1 | Boundary Keeper | What stays out? | No AI replies, booking, payments, protected actions, request market, or multi-channel topology. |
| 2 | Edge Probe | Resolve 15 applicable edge probes | Boundary/empty/encoding/ordering/precision/concurrency cases are specified; unclassified gate/closeout rows are dismissed with reasons. |
| 3 | Prohibition Probe | Resolve Phase 2 must-NOTs | Six product-specific prohibitions are resolved into tests or judgment review. |

---

*Phase: 02-human-inquiry-owner-inbox*
*Spec created: 2026-06-27*
*Next step: /gsd:discuss-phase 2 — implementation decisions (how to build what is specified above)*
