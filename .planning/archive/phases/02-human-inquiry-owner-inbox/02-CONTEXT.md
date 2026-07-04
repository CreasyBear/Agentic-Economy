# Phase 2: Human Inquiry + Owner Inbox - Context

**Gathered:** 2026-06-27
**Status:** Ready for production planning

<domain>
## Phase Boundary

Phase 2 ships the first live customer-to-owner communication loop: a customer submits one inquiry for a published service, the source-owned owner reads and replies from a private inbox, Resend/Novu email dispatches through a source-owned outbox, and operators can reconstruct delivery/readback without losing private message truth. Manager/delegate access is allowed only if the plan adds a source-owned business-access seam and tests.

This is a production feature, not a scaffold. It includes real Resend and Novu env/key setup, durable state, authorization, audit, redaction, UI states, E2E evidence, deploy/readback smoke, and operator recovery for the Phase 2 scope.

Phase 2 does not ship AI replies, booking, quote acceptance, protected actions, payments, request-market behavior, hosted agents, marketplace inboxes, or multi-channel notification topology.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `02-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `02-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Public inquiry availability tied to Phase 1 catalog/service capability state.
- One public inquiry submission route/command for published eligible services.
- Owner inbox list/detail/reply/close readbacks scoped by source-owned owner access.
- Durable inquiry threads/messages, notification outbox/readback, audit, idempotency, abuse buckets, and privacy-safe funnel events.
- One notification adapter boundary with redacted payloads and visible failure state.
- Accessible public inquiry form and owner inbox/reply UI states.
- Tests and copy scans proving no AI, booking, payment, protected-action, or multi-channel overclaim.

**Out of scope (from SPEC.md):**
- Autonomous or AI replies.
- Booking, scheduling, quote acceptance, protected actions, or provider attempts.
- Payments, wallet, billing, Stripe, x402, receipt settlement, or paid priority.
- Multi-channel notification suite, SMS/WhatsApp/Slack/Teams/RCS/voice, attachments, or PWA offline outbox.
- Public exposure of private inquiry content through registry/API/discovery/SEO.
- API keys, MCP/OpenAPI mutation surfaces, SDK/CLI/plugin, hosted agents, request market, experts, or marketplace inboxes.

</spec_lock>

<decisions>
## Implementation Decisions

### Production posture
- **D-01:** Completed Phase 2 means live inquiry behavior with configured notification dependency, not a disabled UI or docs-only promise.
- **D-02:** Evidence replaces theatre: tests, route smoke, notification sandbox/live-provider readback, operator reconstruction, redaction scans, and deployment readback must all exist for the completed scope.
- **D-03:** Phase 2 plans must name exact Resend/Novu env vars, verified sender/domain setup, Novu workflow/environment setup, local/dev/prod behavior, webhook setup, and failure readbacks.

### Inquiry availability
- **D-04:** `inquiry_available` is false until all source-owned conditions are true: published non-suppressed business/service, contact or no-contact policy, consent, owner handling readiness, abuse readiness, inquiry module readiness, and notification readback readiness.
- **D-05:** Public page/API/UCP/llms/sitemap/SEO outputs degrade together to `not_available_yet` or `ae_status_only`; stale optimistic inquiry copy is a blocking production bug.
- **D-06:** Suppression disables new public inquiry entry immediately while preserving private owner/admin reconstruction of existing threads.

### Deep module seams
- **D-07:** Route-facing interface is small: `submitInquiry`, `listOwnerInbox`, `readOwnerInquiry`, `markInquiryRead`, `replyToInquiry`, `closeInquiry`, `readInquiryDeliveryReadback`.
- **D-08:** Implementation owns the complexity: eligibility, authorization, idempotency, abuse, redaction, audit, notification outbox, funnel events, and readback are inside modules, not repeated in routes.
- **D-09:** Do not create a generic messaging platform seam. One inquiry module and one notification outbox are enough until a second real channel/use case exists.

### State and authority
- **D-10:** Convex remains source of truth. Browser input never supplies owner, business-owner, manager/delegate, or admin authority.
- **D-11:** Minimum state machines: `inquiryThreads`, `inquiryMessages`, owner read/reply/close transitions, notification outbox attempts, operation/idempotency records, audit events, funnel events, abuse buckets, private owner/admin readbacks.
- **D-12:** Owner inbox defaults to owner-only. Manager/delegate access requires a source-owned business-access seam and tests. Owner inbox list/detail hides cross-owner existence unless the security design explicitly chooses forbidden over not-found for a case.

### Resend/Novu notification boundary
- **D-13:** The notification stack is Resend + Novu, matching the useful backup direction. Phase 2 ships email-only customer/owner communication; no SMS, WhatsApp, Slack, Teams, RCS, voice, push, or broad multi-channel abstraction.
- **D-14:** Resend is the email delivery provider; Novu is the production notification workflow/orchestration and readback layer. Both run behind the AE source-owned outbox and node/server action path. Required setup includes `RESEND_API_KEY`, `RESEND_FROM`, `NOVU_SECRET_KEY`, Novu application identifier where client Inbox/readbacks require it, verified Resend sender/domain, Novu workflow IDs, webhook endpoints, Resend duplicate handling with `svix-id`, Novu `transactionId`/`Idempotency-Key` handling, and deploy/readback smoke.
- **D-15:** Dispatch contract: redacted payload, AE dispatch ID, Resend message ID where direct delivery applies, Novu transaction/workflow/message IDs where orchestration applies, provider idempotency key, queued/triggered/sent/delivered/bounced/complained/delivery_delayed/failed/suppressed/retryable/permanent-failure/provider-missing/orchestrator-missing states, bounded retry/no-repair posture, owner/admin readback, and no message loss when dispatch fails.
- **D-16:** Notification success/failure is never message truth. Inquiry/message/audit persist before Resend/Novu dispatch and remain reconstructable if Resend or Novu is missing, rate-limited, retries, duplicates, or fails.

### Privacy and copy
- **D-17:** Inquiry body, claimant contact, owner notes, provider payloads, notification secrets, and raw readbacks are private state only.
- **D-18:** Public copy may say a human inquiry can be sent only when behavior is live; it must not imply guaranteed response, booking, quote acceptance, payment, provider execution, AI handling, or action execution.

### the agent's Discretion
- The planner may choose exact names and UI composition if they preserve the contracts above and reuse Phase 1 audit/idempotency/redaction/operator patterns.
- The planner must use Resend/Novu for Phase 2 notification delivery/orchestration. No provider bake-off unless one of them is unavailable or unsuitable under current official docs.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Production spine
- `.planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md` — cross-phase production posture, module seams, and evidence standard.

### Phase requirements
- `.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md` — locked Phase 2 requirements, boundaries, acceptance, product states, prohibitions.
- `.planning/ROADMAP.md` — Phase 2 objective and bloat relapse detector.
- `.planning/STATE.md` — current Phase 1 execution state.

### Upstream authority
- `.planning/phases/01-ten-star-spine-foundation/01-SPEC.md` — Phase 1 source-owned catalog/discovery/security substrate that Phase 2 extends.
- `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md` — Phase 1 decisions and explicit inquiry-unavailable posture.
- `.planning/PROJECT.md` — source-owned durable model, public module interfaces, and invariants.
- `.planning/ENGINEERING-STANDARDS.md` — required skills, TypeScript/Convex/test standards.
- `.planning/SECURITY-SPEC.md` — owner/admin authority, CSRF, audit, redaction, abuse, prompt-injection posture.
- `.planning/FRONTEND-DESIGN-FRAMEWORK.md` — AE UI architecture, states, accessibility, and product-design evidence rules.
- `.planning/GTM-READINESS.md` — claims register and launch readiness; prevents inquiry copy outrunning product.
- `.planning/SOURCE-MINING.md` and `.planning/source-mining/phase-1-ledger.md` — backup-mining discipline and banned imports/symbols.

### Resend/Novu source evidence
- `../Agentic-Economy-Backup/convex/claimEmail.ts` — Resend direct API shape, `RESEND_API_KEY`, idempotency header, safe logs, provider message ID handling.
- `../Agentic-Economy-Backup/src/lib/notifications/novuClient.ts` and `../Agentic-Economy-Backup/src/lib/notifications/novu/{workflows,delivery,webhooks}.ts` — Novu workflow IDs, trigger calls, AE-owned outbox caveat, subscriber IDs, webhook verification/reconciliation lessons.
- `https://resend.com/docs/webhooks/introduction`, `https://resend.com/docs/dashboard/emails/idempotency-keys`, `https://docs.novu.co/api-reference/authentication`, `https://docs.novu.co/api-reference/events/trigger-event`, and `https://docs.novu.co/api-reference/idempotency` — official Resend webhook/idempotency semantics and Novu secret-key, trigger, transaction, and idempotency semantics.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- TanStack Start/Router shell exists, but Phase 1 routes/domain modules are not implemented yet.
- Clerk and Convex config exists; authority must still be derived through source-owned Convex/Clerk membership.
- shadcn/Radix/Tailwind primitives exist; use AE tokens and accessible form/inbox states.

### Established Patterns
- Routes are adapters; domain behavior belongs behind module/Convex seams.
- Public projections are allowlisted builders, not DB row spreads.
- Idempotency, audit, redaction, source-mining, copy scans, UI evidence, and deploy/readback smoke are inherited from Phase 1 production proof.

### Integration Points
- Extends service capability `firstRequestMode`/public disclosure from Phase 1.
- Adds private owner/admin readbacks without leaking content into page/registry/API/UCP/llms/sitemap/SEO.
- Adds privacy-safe funnel events for submitted/viewed/replied/notification attempted/sent/failed/suppression-disabled.
- Uses Resend/Novu as the Phase 2 notification stack, with backup-mined idempotency/safe-log/workflow/webhook lessons and official retry/duplicate/idempotency semantics.

</code_context>

<specifics>
## Specific Ideas

The product moment is simple and serious: customer sends one message, owner sees it, owner replies, and Resend/Novu delivery/readback is visible. Anything beyond that is bloat until this loop is live.

</specifics>

<deferred>
## Deferred Ideas

- AI reply suggestions, autonomous handling, booking, quotes, protected actions, provider attempts, payments, request-market behavior, hosted agents, marketplace inboxes, and multi-channel notifications stay out.
- API keys, MCP/OpenAPI mutation, SDK/CLI/plugin, and developer-platform surfaces stay out unless later phases prove demand and authority.

</deferred>

---

*Phase: 02-human-inquiry-owner-inbox*
*Context gathered: 2026-06-27*
