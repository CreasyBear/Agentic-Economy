---
phase: 02
slug: human-inquiry-owner-inbox
status: approved-for-planning
created: 2026-06-27
mode: shape-harden
primary_sources:
  - .planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md
design_authorities:
  - DESIGN.md
  - .planning/FRONTEND-DESIGN-FRAMEWORK.md
  - .planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md
---

# Phase 02 — UI Design Contract

Design appendix for the Phase 2 human inquiry + owner inbox production slice. It narrows the shared AE frontend framework to one conservative customer-to-owner loop: submit inquiry, owner read/reply/close, Resend/Novu delivery readback, and operator reconstruction. Rendered verification remains an implementation requirement, not a claim made by this planning document.

## Design authorities

- `02-SPEC.md`, `02-CONTEXT.md`, and `02-01-human-inquiry-owner-inbox-production-PLAN.md` own the product boundary: one human inquiry loop with source-owned owner access, durable inquiry state, notification outbox/readback, audit, redaction, and no future-surface claims.
- `02-05-PRODUCTION-MATURITY-CONTEXT.md` and `02-05-PRODUCTION-MATURITY-PLAN.md` own the P2-P5 maturity posture: source-owned evidence, no runtime theatre, real provider readbacks, operator recovery, and no overclaim copy.
- `DESIGN.md` owns AE visual tokens: command-ink/cool-field/signal-cobalt palette, Geist typography, 8/12/16px radii, and status-is-text rules.
- `.planning/FRONTEND-DESIGN-FRAMEWORK.md` owns shells, AE component seams, token/class policy, accessibility gates, and future-surface prohibitions.
- `01-UI-SPEC.md` is the structure precedent. Phase 2 inherits its shell/component/copy discipline but adds only inquiry and inbox surfaces.

---

## Scope and mode

| Field | Value |
|---|---|
| Mode | Shape + Harden for future implementation |
| Primary product job | A customer sends one conservative inquiry for an eligible published service; the source-owned owner reads, replies, or closes it; delivery/readback remains visible if Resend/Novu fails. |
| Primary users | Public customer, business owner, source-owned operator/admin. |
| Core objects | Inquiry thread, inquiry message, owner reply, close state, notification dispatch/readback, audit reconstruction. |
| In scope | Public inquiry availability affordance, inquiry form, submitted/error receipt, owner inbox list, inquiry detail, reply/close controls, delivery readback panel, operator reconstruction. |
| Non-goals | No booking, payment, quote acceptance, AI/autonomous replies, protected actions, provider execution, chat/SSE, attachments, marketplace inbox, request market, SDK/API-key platform, or multi-channel notification UI. |

---

## Information architecture and route map

Use the current TanStack Start `src/routes/*` structure when implementation exists. The smallest acceptable UI is one public inquiry entry, one owner inbox, one thread detail, and one operator readback surface.

| Route / surface | Primary user | Job | Surface contract |
|---|---|---|---|
| `/{slug}` inquiry affordance | Public customer | See whether a human inquiry can be sent. | Show `Inquiries available` only when `inquiry_available` is source-proven. Otherwise show a quiet unavailable explanation and no disabled future CTA theatre. |
| `/{slug}/inquiry` | Public customer | Submit one message with contact details. | Form with persistent labels, explicit eligibility, consent/help text, validation, abuse/rate-limit state, preserved input, and submitted receipt. |
| `/owner/inquiries` | Owner | Triage incoming inquiries. | Status-first inbox grouped by `Unread`, `Needs reply`, and `Resolved`; stable ordering; empty/sparse/populated states; no cross-owner existence leakage. |
| `/owner/inquiries/$threadId` | Owner | Read thread, reply, close, and inspect delivery. | Thread detail with customer message projection, reply form, close action, version/stale handling, delivery readback, and source-owned audit metadata. |
| `/admin/inquiries` or existing admin audit route | Operator/admin | Reconstruct inquiry and notification state. | Private reconstruction view with redacted message/provider payloads, correlation ID, source hashes, dispatch status, retry/no-repair posture, and suppression state. |

Navigation: add no broad `Messages`, `Chat`, `Developers`, `Payments`, `Actions`, or `Marketplace` nav. Public nav may expose inquiry only through eligible service pages. Owner nav may add `Inquiries` after P2 ships.

---

## Key flows

### Flow A — Public human inquiry

1. Customer lands on an eligible `/{slug}` service page and sees a human inquiry affordance with explicit unavailable capabilities.
2. Customer opens `/{slug}/inquiry`; form identifies the business/service and says the inquiry goes to the owner, not to an AI, booking, payment, or provider execution system.
3. Customer enters contact and message; inline validation preserves input for recoverable errors.
4. Submit creates one source-owned thread/message/audit operation or returns a typed failure (`ineligible_service`, `suppressed_target`, `invalid_contact`, `invalid_body`, `rate_limited`, duplicate state).
5. Receipt confirms only that the inquiry was submitted and names notification state separately: queued, sent, delayed, failed, or provider/orchestrator missing.

### Flow B — Owner inbox reply/close

1. Authenticated owner opens `/owner/inquiries`; access comes from source-owned owner authority, never browser-supplied IDs.
2. Owner selects an unread/needs-reply thread and reads the allowlisted private projection.
3. Owner writes a human reply or closes the thread with consequence copy.
4. UI handles reply pending, stale version, terminal thread, duplicate conflict, wrong-owner/not-found, and recoverable validation without losing draft text.
5. Thread state moves to replied/resolved only through source-owned reply/close commands and audit events.

### Flow C — Resend/Novu delivery readback

1. Inquiry submit and owner reply persist message truth before notification dispatch.
2. Delivery panel shows AE dispatch ID, redacted status, retry count, retry-after, provider/orchestrator missing, bounced/complained/delayed/failed, and last safe error.
3. Retry/no-repair controls appear only for `owner_admin` or explicit source-owned operator permission with consequence copy; normal owners get read-only delivery readback and disabled-reason copy.
4. Notification success or failure never creates, deletes, or downgrades the underlying inquiry/message truth.

### Flow D — Suppression and operator reconstruction

1. Suppression disables new public inquiry entry immediately while existing private threads remain reconstructable.
2. Operator view shows source hash, correlation ID, redacted payload summary, state transitions, dispatch attempts, and next repair action.
3. Public surfaces expose no private inquiry body, claimant contact, owner notes, provider payload, notification IDs, or raw readbacks.

---

## Reachable UI states

| Surface | Required states |
|---|---|
| Public inquiry affordance | unavailable/not ready, eligible, suppressed, loading capability, stale capability, long service/business name, compact 375px. |
| Inquiry form | empty, partially filled, invalid contact, invalid body, too long body, submitting, submitted, duplicate replay, duplicate conflict, rate-limited/abuse blocked, ineligible, suppressed after entry, provider/orchestrator missing after submit, preserved input. |
| Owner inbox | unauthenticated redirect/denied, empty, sparse, populated, unread, needs reply, resolved, stable equal-timestamp ordering, loading, fetch failed, long names/snippets, compact stacked layout. |
| Thread detail | loading, not found/wrong owner, read, unread, reply draft, reply pending, reply failed, stale version, terminal/closed, close pending, suppressed target, long customer text, redacted metadata. |
| Delivery readback | queued, triggered, sent, delivered, delayed, bounced, complained, retryable failure, permanent failure, suppressed, provider missing, orchestrator missing, retry pending, retry exhausted, no repair. |
| Operator reconstruction | empty result, populated timeline, redacted payload, invalid/missing dispatch, duplicate webhook/readback, correlation filter empty/populated, no-repair terminal. |

All state labels must be plain language plus safe technical metadata where useful. Do not collapse delivery into a generic `sent` or inquiry into a generic `chat` state.

---

## Copy table

| Element | Copy |
|---|---|
| Public eligible CTA | Send a human inquiry |
| Public unavailable label | Human inquiries are not available for this service yet. |
| Public unavailable help | This page can show service facts, but owner inquiry handling is not live for this service. |
| Inquiry form heading | Send a human inquiry to the owner |
| Inquiry form subcopy | Share what you need and how the owner can reach you. This does not book a job, take payment, or trigger an automated action. |
| Contact label | Contact details for the owner reply |
| Message label | What do you need help with? |
| Submit label | Submit inquiry |
| Submitted heading | Inquiry submitted |
| Submitted body | Your message was saved. Delivery status is tracked separately so the inquiry is not lost if email delivery fails. |
| Rate-limit error | Too many inquiry attempts. Try again later. Your latest message was not submitted. |
| Suppressed state | This service is not accepting new inquiries right now. Existing owner records remain private. |
| Owner inbox heading | Owner inquiries |
| Inbox empty | No inquiries need your response. |
| Needs reply bucket | Needs reply |
| Resolved bucket | Resolved |
| Reply label | Write a human owner reply |
| Reply submit | Send reply |
| Close action | Close inquiry |
| Close consequence | Closing marks this inquiry resolved. It does not delete the audit or delivery readback. |
| Delivery panel title | Delivery readback |
| Provider missing | Notification provider is not configured. The inquiry remains saved. |
| Operator reconstruction title | Inquiry reconstruction |

Copy rules:
- Say `human inquiry`, `owner reply`, `delivery readback`, `message saved`, `bookings not live`, `payments not live`, and `automated actions not live`.
- Do not say `chat`, `AI reply`, `agent handled`, `guaranteed response`, `book now`, `quote accepted`, `pay`, `provider dispatched`, `protected action`, `SMS`, `WhatsApp`, `Slack`, `voice`, or `multi-channel` in Phase 2 public/owner copy.
- Provider names `Resend` and `Novu` may appear in owner/operator readback only when useful; public customer copy should describe delivery state without provider jargon.

---

## Component contract

Compose from AE shells and shadcn primitives before adding any route-local UI.

| Pattern | Required component / behavior |
|---|---|
| Page shells | `AePublicShell`, `AeOwnerShell`, and `AeAdminShell`; no custom nav chrome. |
| Inquiry availability | Shared status/capability presenter using `AeStatusBadge` + explanation; no route-local color mapping. |
| Inquiry form | `AeFormSection`/`FieldGroup`/`Field`/`FieldLabel`/`FieldDescription`/`FieldError`; textarea uses character count with tabular numbers. |
| Submitted/error receipt | `AeAlert` or status `Card`; state text names saved-message truth separately from notification delivery. |
| Inbox list | `AeQueueList`/row pattern grouped by owner task state; use `Table` only if density materially improves comparison. |
| Thread detail | `Card` composition for message/reply/close sections; preserve drafts during recoverable errors. |
| Delivery readback | Status card/list with AE dispatch ID, provider-safe ID fragments only if allowed, operator/admin-only retry/no-repair actions, normal-owner disabled reasons, and redacted error text. |
| Destructive/terminal close | Inline consequence first; `AlertDialog` only if implementation makes close irreversible or high-impact. |
| Loading/empty/error | Shared `AeLoadingState`, `AeEmptyState`, `AeErrorState`; no custom centered spinner or empty div. |

Do not create a generic chat, messaging, notification-platform, or multi-channel component. Phase 2 earns only inquiry-specific components or shared AE status/form/list primitives.

---

## Accessibility and responsive contract

- 375px width is a release gate for public inquiry, owner inbox, thread detail, and delivery readback.
- Public form fields use persistent labels, help text, `aria-invalid`, connected errors, and input preservation after recoverable validation failures.
- Keyboard-only path covers opening inquiry, filling fields, submitting, moving focus to errors/receipt, selecting an inbox item, replying, closing, and reaching authorized retry/no-repair controls only when the role is `owner_admin` or explicit operator; normal-owner readback has disabled reasons.
- Focus remains visible and not color-only; all primary hit targets are at least 44px tall where practical and never below 40px.
- Thread messages render in source order with semantic headings/regions; long inquiry text wraps without horizontal page scroll.
- Delivery status uses text plus tone; color never carries state alone.
- Owner/operator pages expose correlation IDs and hashes in mono/tabular styles without making them the primary copy.
- Reduced-motion disables non-essential transitions; loading labels remain stable while pending.
- Critical inquiry availability and submitted/error copy must not depend on JS-only decoration.

---

## Rendered verification matrix

Required during implementation closeout for every changed surface.

| Surface | Compact proof | Wide proof | State proof | Interaction proof | Copy/prohibition proof |
|---|---|---|---|---|---|
| `/{slug}` inquiry affordance | 375px service page with eligible/unavailable state | Desktop service page with status and negative capabilities | eligible, unavailable, suppressed, stale | CTA/link focus and unavailable non-action | No booking/payment/action/AI/guaranteed-response claim |
| `/{slug}/inquiry` | 375px full form and receipt | Desktop form with long business/service name | empty, invalid, rate-limited, duplicate, submitted, provider missing | Keyboard submit, focus to first error, preserved input | Public copy says human inquiry only |
| `/owner/inquiries` | 375px grouped inbox | Desktop grouped list/table | empty, sparse, populated, unread, needs reply, resolved, denied | Keyboard list navigation and row activation | No cross-owner/private leakage in labels/snippets |
| `/owner/inquiries/$threadId` | 375px thread/reply/close stack | Desktop detail with readback side panel if space allows | reply pending/failed, stale, terminal, long text | Keyboard reply/close, focus after success/error | Reply is human owner action, not AI |
| Delivery readback | 375px status list | Desktop readback with metadata | queued/sent/delayed/bounced/failed/provider missing/retry/no-repair | Admin/operator retry/no-repair focus and normal-owner disabled reason | Notification failure does not imply message loss |
| Operator reconstruction | 375px readable timeline | Desktop filter/timeline | empty, populated, duplicate, redacted, no-repair | Filter focus and safe action controls | Redacted private/provider payloads only |

---

## Bloat and prohibition clauses

- No AI reply suggestions, generated owner replies, autonomous handling, chat/SSE, attachments, booking, quote acceptance, protected action, provider dispatch, request market, payment, wallet, paid priority, or marketplace inbox.
- No SMS/WhatsApp/Slack/Teams/RCS/voice/push or broad multi-channel notification UI. Resend/Novu email/workflow readback is the only Phase 2 delivery surface.
- No public exposure of inquiry body, claimant contact, owner notes, notification payloads, provider IDs/readbacks, or raw errors through catalog, registry, API, UCP, llms, sitemap, SEO, logs, or marketing copy.
- No browser-supplied owner/admin/business IDs in UI contracts, hidden fields, route params, or copy implying client authority.
- No disabled future nav items, placeholder dashboards, provider-success-as-truth wording, or route-local design system exceptions.

---

## Implementation handoff

Execution planners must include this UI-SPEC alongside the Phase 2 SPEC/CONTEXT/PLAN, `DESIGN.md`, and `.planning/FRONTEND-DESIGN-FRAMEWORK.md`. Build only the surfaces needed for the customer inquiry -> owner reply/close -> Resend/Novu readback -> operator reconstruction loop, then prove them with rendered compact/wide evidence during implementation.
