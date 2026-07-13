# /owner/inquiries — Requests

## Register & scene

**Product register, compact density.** A business operator clears a morning queue on a laptop at a bright counter between customer calls; a light warm-canvas scene, quiet white working surfaces, ink text, slate structure, and eucalyptus only for focus, selection, and the primary action keeps attention on the next request.

## Job & IA position

**One job:** triage each request into one bounded next state without losing the focused record.

- **Route class:** authenticated operator. It uses the protected owner projection of `AeOperatorShell`; it is never indexed or treated as public merely because the path lacks `/_operator`.
- **Entry points:** owner navigation `Requests`, notification deep links, `/owner/status` delivery-attention link, canonical request URL returning to this queue.
- **Exits:** focused request detail, business status, notification settings, sign out.
- **Blueprint:** `PRINCIPLES.md` §10 `/owner/inquiries`; IA-6 operator skeleton; IA-7 `7xl`; LAW-10/IA-2 route-registry navigation.
- The primary layer is queue plus current request. The deeper layer is origin, delivery history, IDs, and machine status in the detail route (LAW-7).
<!-- sim: G8 -->
### Notification re-entry contract

Owner notification deep links MUST resolve through the `JOURNEY-SYSTEM.md` notification envelope to the canonical request URL and signed item focus. Re-entry MUST use a durable owner-session policy: a long-lived owner session on a trusted device, with device biometric or passkey re-authentication where available when assurance must be refreshed. It MUST NEVER require full credential entry for every notification. Redirect validation and business/request authorization still run on every open; session longevity does not weaken object access checks.

When the owner session has expired, the interstitial MUST preserve the safe canonical redirect and state exactly what will happen: **Your owner session has expired. Re-authenticate to open this request; after verification, you’ll return to the request from this notification.** It MUST name the available method before commit (`Use your passkey`, device biometric, or the configured fallback), MUST NOT expose customer or request details before authentication, and MUST return to the request-top orientation banner if the signed item target has expired.


## Layout

`AeOperatorShell`; page-owned `max-w-7xl mx-auto px-4 md:px-6`; compact 48px toolbar; wide split at `lg` with a fixed `22rem` list column and `minmax(0,1fr)` detail column. The queue and detail are sibling regions, not nested cards. At `<lg`, the queue is the whole route and selection navigates to `/owner/inquiries/$threadId`.

### Desktop, ≥1024px

```text
┌──────────────────────── AeOperatorShell / 100vw ─────────────────────────┐
│ side nav 208 │ Requests                         [Search requests] [Help] │ 56
├──────────────┴────────────────────────────────────────────────────────────┤
│ px-6 / max-w-7xl                                                         │
│ ┌──────── queue 352 ────────┬──────── focused detail, remaining ───────┐ │
│ │ Requests             12   │ Bright Spark Electrical       [New]      │ │ 64
│ │ [Open] [Snoozed] [Closed] │ Received 9:42 · Attention: delivered     │ │
│ ├───────────────────────────┼───────────────────────────────────────────┤ │
│ │▶ Jamie · Safety switch    │ Request                                   │ │
│ │  New · 4m · Delivered     │ “Safety switch trips after rain…”         │ │
│ ├───────────────────────────┤ Origin and contact                         │ │
│ │  Priya · Hot water        │                                           │ │
│ │  Waiting · 38m            │ Conversation document spine               │ │
│ ├───────────────────────────┤ [Reply] [Clarification] [Decline] [Snooze]│ │
│ │  Alex · Smoke alarm       │ Each action previews resulting status     │ │
│ │  Snoozed until Tue        │                                           │ │
│ │                           │ Delivery detail / record ID (collapsed)    │ │
│ └───────────────────────────┴───────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

The queue has its own scroll container below the toolbar. The detail region owns document scroll; only one region captures wheel focus at a time. A 1px semantic border separates columns. No colored side stripe marks selection; selected row uses the semantic selected surface plus a leading selection icon and `aria-current`.

### Mobile, ≤375px

```text
┌──────────────── 375 ────────────────┐
│ [Menu] Requests              [Find] │ 56
│ 12 open · visibility: all accepted  │ 40
│ [Open] [Snoozed] [Closed]           │ 44
├─────────────────────────────────────┤
│ ▶ Jamie                              │
│ Safety switch trips after rain      │
│ New · 4m                             │
│ Delivery recorded                   │ 88
├─────────────────────────────────────┤
│ Priya                               │
│ Hot water stopped                   │
│ Waiting for customer · 38m          │ 88
├─────────────────────────────────────┤
│ Alex                                │
│ Smoke alarm                         │
│ Snoozed until Tue 9:00              │ 88
└─────────────────────────────────────┘
```

Rows are at least 44px high and MUST support 10-second triage without opening detail: customer label; suburb or declared service area; service and scope excerpt; an urgency signal only when the customer stated one; contactability posture; current status; age; and delivery-attention text. No hidden detail pane or horizontal split survives on mobile. Missing facts render honestly (`Service area not provided`, `Urgency not stated`, `Contact details not shared`) rather than being inferred.

## Section anatomy

1. **Shell and title bar**
   - Content: `Requests`, visible count, scoped search, keyboard-help trigger.
   - Data: route loader queue summary and visibility policy.
   - Astryx: `Heading`, `TextField`, `IconButton`, `Tooltip`; `AeOperatorShell` and shared owner navigation.
2. **View controls**
   - Content: `Open`, `Snoozed`, `Closed`; filters are URL search parameters and never silently broaden.
   - Data: route loader counts and active filter.
   - Astryx: `Tabs`, `Badge`; Tailwind only arranges the row.
3. **Queue list — 10-second triage standard**
   - Content: durable rows keyed by `threadId`; customer label; suburb or declared service area; service and scope excerpt; urgency signal only when customer-stated; contactability posture (`Phone shared`, `Email shared`, `AE replies only`, or `Contact details not shared`); current friendly status; authoritative status disclosure; shared `AeTimestamp`; unread state; and delivery-attention readback (`Delivery recorded`, `Delivery needs review`, `Status unavailable`). An operator MUST be able to decide open, decline, snooze, or inspect within 10 seconds without opening each row.
   - Data: route loader queue projection from the immutable submitted request, disclosed contact fields, thread, record, response, suppression, and delivery-attempt records. Location, urgency, and contactability MUST preserve customer provenance; absence stays absent. Delivery status never becomes acceptance.
   - Astryx: semantic `<ol>`/`<li>`, `Button`-equivalent press target, `Badge` through centralized `AeStatusBadge`, `Tooltip`, shared `AeTimestamp`. Do not use equal cards.
4. **Focused detail preview at wide widths**
   - Content: the same object workspace specified for `/owner/inquiries/$threadId`, rendered by one reusable composition. No duplicate route-local state model.
   - Data: item projection for focused request; loader may defer detail while preserving pane geometry.
   - Astryx: `Heading`, `Badge`, `Button`, `Collapsible`, `Dialog`, and the shared conversation-item renderer.
5. **Suppression and consent posture**
   - Content: persistent queue footer/banner: `Accepting customer requests` or `Requests are paused`; reason and effective time; `Change request availability` link. A suppressed business receives no new offered R1 sends. Existing records remain readable.
   - Data: route loader business inquiry-destination acceptance/suppression state and contact budget posture.
   - Astryx: `Banner`, `Button` link. This is an operational control, not marketing consent (WEDGE-LADDER A4).

## States

- **Loading:** shell, toolbar, tabs, six fixed-height row skeletons, and wide detail-header/body skeleton preserve settled geometry. Focus is not moved into a skeleton.
- **Empty, no source data:** `No customer requests yet.` Follow with the visibility policy: `This view shows requests sent while your business is accepting customer requests. Requests that AE did not send to this business do not appear here.` Actions: `Check request availability` and `View business status`.
- **Empty, no filter match:** `No snoozed requests.` Name the active view and offer `Show open requests`; do not clear the filter automatically.
- **Empty, access denied:** retain owner shell and say `You do not have access to this business’s requests.` Action: `Switch business` or `Contact an administrator` according to actual authorization.
- **Temporarily unavailable:** retain selected row and pane if cached; `Requests could not be refreshed.` Action `Try again`; stale data is labelled with last-updated time.
- **Error for one detail:** queue remains usable; detail pane shows a 3xl error block with request ID and `Try again`.
- **Streaming:** none for queue text. New persisted requests prepend only if doing so will not steal focus; otherwise a `1 new request` button appears. Delivery updates patch the row and announce once.
- **Zero-JS/SEO:** authenticated, `noindex`; server-render current queue and links. Each row is a real link to `/owner/inquiries/$threadId`. Filters work through URLs/forms. Shortcuts and split-pane enhancement are optional; core triage remains navigable.

## Interactions

### Focus and keyboard grammar

- A focused row is durable in `?focus=<threadId>` on wide screens and session-restored when returning from detail on narrow screens. Focus does not move when data refreshes, disposition counts change, or a new row arrives. If the row leaves the active view, move focus to its nearest surviving neighbor and announce why.
- `J` focuses the next visible row; `K` the previous; `Space` toggles the focused row’s read/unread posture where supported; `Enter` opens/focuses detail. `G` focuses the view controls as the blueprint requires.
- Every shortcut has a visible equivalent and is surfaced in the control’s `Tooltip` and keyboard-help popover: `Next request (J)`, `Previous request (K)`, `Mark read/unread (Space)`, `Open request (Enter)`, `Go to views (G)`. Shortcuts are disabled while an input, textarea, select, dialog, or menu owns focus. No semi-secret shortcuts.
- Row roving focus follows listbox-like arrow-independent semantics without hijacking browser scrolling. Deep links focus the detail heading, not the row.

<!-- journey-system: B2/C5 -->
<!-- journey-system: B6/C5 -->
### Participant messaging and legal turns

The owner detail and customer **Your record** projection MUST render one versioned message identity; neither route may clone or re-key a message. Every customer bounded answer MUST be a linked `user_text` item with `answersItemId` pointing to the exact owner message or clarification question. The original request, owner message, answer, attribution, and timestamps remain independently inspectable.

| Current participant turn | Legal next turn | Resulting state | Scope rule |
|---|---|---|---|
| Owner **Reply** persisted | Customer MAY submit one text-only bounded follow-up linked to that owner message | **Customer follow-up received**; owner queue returns to **Needs attention** | MUST NOT add fields, attachments, recipients, or request scope. A scope change MUST start a fresh proposal and permission cycle. |
| Owner **Request clarification** persisted with non-empty typed question | Customer MAY submit one answer scoped to that question | **Waiting for customer clarification** until the linked answer persists; then **Clarification received** and owner queue returns to **Needs attention** | The composer MUST name the question being answered. The answer resolves only that clarification and MUST NOT mutate the question or original request. |
| Customer bounded answer persisted | Owner MAY Reply, Request clarification, Decline, Snooze, or Close when the transition registry permits it | State follows the disposition table below | No implicit extra owner/customer turn exists. |
| Declined, Closed, No reply received, Suppressed, or Delivery failed | No message composer | Matching distinct terminal/blocked state | Reopening or changed scope requires an explicitly registered new transition; states MUST NEVER collapse into one generic closed state. |

`Request clarification` MUST require typed question text, show the exact customer and question beside `Send clarification request`, use the external-send pending lock, and persist the question before entering **Waiting for customer clarification**. A linked customer answer MUST atomically resolve that waiting state and requeue the owner thread as **Needs attention**.

<!-- tx-lens -->
Every Reply or Request clarification committed through an authenticated owner session MUST append an attestation over the exact response content and its canonical digest. The session identifies the business-side attester; projection copy does not imply that delivery was read or that the customer accepted. The owner sees `Your reply is recorded exactly as sent.` beside the commit/readback.

### Disposition → state → customer visibility

| Disposition | Preconditions and confirmation | Resulting durable state | Customer visibility | Durable effect and next transition |
|---|---|---|---|---|
| **Reply** | Reply composer has non-empty text; exact recipient and message are immediately above `Send reply to {customer}`. Externally observable send uses pending lock, duplicate prevention, durable readback, and the adjacent copy `Your reply is recorded exactly as sent.` | During send: **Sending reply**. Authoritative readback: **Waiting for customer**. Unknown readback: **Reply status unavailable**. | The same owner message identity MUST appear on **Your record** when authoritative, with `Reply received from {business}, {timestamp}`; delivery-only state MUST NOT claim it was read. | Appends a business-origin `business_response`, authenticated-owner-session attestation over the exact response content, and delivery record; never rewrites the customer request. A bounded customer follow-up or delivery update is next. |
| **Request clarification** | Non-empty typed question; exact customer and question shown beside `Send clarification request`. Pending lock applies; `Your reply is recorded exactly as sent.` is adjacent to commit/readback. | **Waiting for customer clarification**; unknown readback: **Clarification status unavailable**. A linked answer transitions to **Clarification received**. | The typed question MUST appear on **Your record** with `Reply received from {business}, {timestamp}` and an answer composer scoped to that question; the persisted answer renders by the same linked item identity on both projections. | Appends a business-origin clarification question, authenticated-owner-session attestation over its exact content, and delivery record. The linked answer resolves the clarification and returns the owner row as **Needs attention**. |
| **Decline** | Modal names the request, retained record, customer-visible consequence, and `Decline this request`; focus returns to trigger on cancel. | **Declined by your business**. | **ALWAYS visible** on **Your record** and ALWAYS emits the purpose-bound customer notification. It MUST remain distinct from Closed, No reply received, Suppressed, and Delivery failed; notification is NEVER policy-conditional. | Appends the terminal owner disposition; the request remains readable and active handling ends. |
| **Snooze** | Owner MUST choose a persisted timezone-aware deadline; preview includes local date, time, and timezone, for example `Snooze until Tue 9:00 AWST`; no modal. | **Snoozed until {deadline} {timezone}**. | No customer status or notification is created merely by snoozing; existing customer-visible state remains unchanged. | Removes the row from Open. The `snooze-expiry` clock MUST requeue it exactly once as **Needs attention** at the deadline. A customer answer MAY requeue early only through an explicit registered transition; the deadline event remains idempotently consumed. |
| **Close** | Modal names the request, retained record, cessation consequence, and `Close this request`. | **Closed**. | **Closed** MUST appear on **Your record** distinctly from Declined, No reply received, Suppressed, and Delivery failed; the closure notification is purpose-bound. | Ends owner attention and triggers notification cessation. Cessation proof MUST exist before the next dispatch claim; a late answer may remain readable but MUST NOT restart notifications. |
<!-- sim: G8 -->
#### Decline reason taxonomy

Decline MUST require exactly one reason class. The selected class is stored on the terminal disposition, shown on **Your record** as the business’s honest reason class, included in the decline notification, and made available as attributable routing evidence. It MUST NOT be rewritten as a customer fault, a suitability score, or an inferred reason. Free text, where allowed, supplements `other` for the business’s private/audited context and MUST NOT be exposed to the customer or used as routing evidence without a separate disclosure contract.

| Stored reason code | Owner label | Customer-visible reason class | Routing-evidence meaning |
|---|---|---|---|
| `out_of_area` | **Out of area** | **Outside this business’s service area** | Negative evidence for this business/service-area binding at the recorded time; never a category-wide exclusion. |
| `too_busy` | **Too busy** | **The business is too busy for this request** | Time-bound capacity evidence; MUST NOT become permanent capability evidence. |
| `not_our_work` | **Not our work** | **This request is not work the business takes on** | Negative capability-fit evidence scoped to the submitted service/scope and business binding. |
| `insufficient_detail` | **Insufficient detail** | **The business did not have enough detail to assess the request** | Brief-quality evidence; MUST NOT imply the customer or business is unsuitable. |
| `other` | **Other** | **The business declined for another reason** | Decline evidence only; no inferred routing exclusion. |

Changing a decline reason requires an explicit audited correction event; it MUST NOT mutate the original disposition. Customer and routing projections MUST consume the same stored reason class.


Actions are state-gated. Closed/declined requests do not show Reply or Request clarification unless reopening is a real registered transition. Buttons expose disabled reasons. Success toasts may acknowledge, but the row status and timeline are durable evidence.

## Copy voice

- Headline: **Requests**
- Queue labels: **Open**, **Snoozed**, **Closed**, **Needs attention**, **Waiting for customer**, **Delivery needs review**.
- Suppression: **Accepting customer requests** / **Requests are paused**; `Pause new requests` is explicit that existing records remain available.
- Boundary beside Reply and Clarification commit: **The customer decides how to respond. Price, timing, availability, and any next step are confirmed between your business and the customer.**
- Reply recording: **Your reply is recorded exactly as sent.**
- Delivery readback: **Delivery recorded. This does not mean the customer has read or accepted your reply. Sent never means confirmed.**
- Banned customer framing is absent from customer-visible messages. Owner navigation may call the surface Requests; internal mechanics such as item, receipt, tuple, mandate, kernel, and lifecycle never lead copy. No fan-out, comparison-of-responses, procurement, payment, wallet, booking, or confirmation-by-AE language.

## Responsive

- `lg+`: split queue/detail; fixed 352px queue, fluid detail; independent scroll and a 1px divider.
- `<lg`: list-only. Selection navigates to full detail. Browser Back restores filter, scroll, and focused row.
- `<640`: search becomes a labelled full-width field under title; tabs remain horizontally scrollable only if all labels cannot fit, with visible overflow affordance.
- Metadata collapses in order: correlation detail, origin secondary line, then full date behind disclosure. Customer, need, status, and delivery attention never disappear.
- All targets are ≥44px; no horizontal page overflow at 320px, 375px, or 200% zoom.

## Accessibility

- Shell uses `<nav aria-label="Owner">`, page `<main>`, queue `<section aria-labelledby>`, and `<ol aria-label="Customer requests">`; focused detail is a labelled `<section>`.
- One `aria-live="polite"` region announces new-request availability, disposition completion, delivery-state changes, and focus relocation. It does not announce timestamps, row movement, or each loader refresh.
- Errors after a disposition use one `role="alert"` and name the recovery. Pending action sets `aria-busy` on the action region and disables duplicates.
- Selected/focused/unread states use text and semantics, not color alone. `aria-current` identifies the selected row; unread has visible `Unread` text for assistive technology.
- Focus rings use Astryx behavior and eucalyptus current-state token. Dialog traps focus and returns it. Reduced motion makes row/status changes immediate; no animated reordering. Shared timestamps use `<time dateTime>` and mono/tabular numerals.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-2, LAW-3, LAW-4 | Stable request URLs and IDs; each row states facts, next state, time, action; delivery is never acceptance or confirmation. |
| LAW-6, LAW-7 | Detail exposes durable submitted record and delivery history; queue summary plus one deeper inspection layer. |
| LAW-8, LAW-10 | Visibility-aware empties; route registry drives nav and surfaced shortcut actions. |
| IA-1, IA-2, IA-6, IA-7, IA-8 | Authenticated operator classification; owner shell; deliberate 7xl split; reusable composition keeps route thin. |
| CH-7, CH-8, CH-11 | One status narrative; durable focus; shared document-spine renderer, not owner-only bubbles. |
| AX-2, AX-3, AX-5, AX-7 | Inline reversible snooze; modal decline; named external sends with pending lock/readback and adjacent boundary copy. |
| DS-1–DS-8 | Astryx behavior, Tailwind layout, semantic tokens, complete state controls, central status, shared time, reduced motion. |
| DS-12–DS-15 | Form errors, six-meaning empties, geometry-preserving loading, 44px targets and truthful states. |
| WEDGE-LADDER A4 / R1 | Visible acceptance/suppression posture and single-business request only; no R2–R4 UI. |

## Anti-slop check

No side-stripe accents, gradient text, glass, hero metrics, identical card grid, nested-card stack, decorative motion, or modal-as-first-thought. The only modal is the irreversible Decline action required by AX-2. The restrained product palette follows the physical scene, not a generic “inbox equals blue productivity app” reflex. Familiar Linear-like queue mechanics serve scanning; they do not import Linear branding.

---

<!-- journey-system: A8 -->
# /owner/inquiries/$threadId — Request detail

## Register & scene

**Product register, compact density.** The same operator pauses on one request at a bright service counter and needs a calm, paper-record-like workspace: warm canvas around a white surface, ink and slate for evidence, eucalyptus only on current focus and the one available primary action.

## Job & IA position

**One job:** understand and act on one request from its complete durable record.

- **Route class:** authenticated operator.
- **Entry points:** queue selection, direct canonical URL, operational notification deep link, delivery-attention link.
- **Exits:** Back to Requests with focus preserved, status, settings.
- **Blueprint:** owner split-triage blueprint plus Stripe-derived object workspace anatomy; IA-6/IA-7 focused object at `7xl`, LAW-9 document spine, CONVERSATION-ITEM-SPEC §7 Owner inquiry thread.
- Primary layer: identity, current status, conversation, permitted action. Deeper layer: origin, submitted scope, delivery history, IDs and authoritative state bridge.

## Layout

At `lg+` when entered through the queue, this is the right pane of the prior split wireframe. At a direct URL or `<lg`, use `AeOperatorShell` with `max-w-7xl px-4 md:px-6`; content is a `minmax(0,1fr) 18rem` object workspace at `lg`, with facts in main and decisions in a sticky rail (IA-9).

### Desktop, direct route

```text
┌──────────────────────── AeOperatorShell ────────────────────────────────┐
│ side nav │ [← Requests]  Request REQ-0184                 [Needs reply]│
├──────────┴──────────────────────────────────────────────────────────────┤
│ px-6 / max-w-7xl                                                       │
│ ┌──────── main, fluid ───────────────────────┬── action rail 288 ────┐ │
│ │ Jamie · Safety switch trips after rain     │ Next action            │ │
│ │ Received 9:42 · Origin: business page      │ [Reply]                 │ │
│ │ Delivery attention: recorded               │ [Request clarification]│ │
│ ├────────────────────────────────────────────┤ [Decline] [Snooze]      │ │
│ │ Conversation history                      │ Result: Waiting for…    │ │
│ │ Customer request                           │ Boundary copy           │ │
│ │ Submitted record                           │                         │ │
│ │ Business/customer messages                 │ [Close request…]        │ │
│ │ Delivery/status events                     │                         │ │
│ ├────────────────────────────────────────────┤                         │ │
│ │ [Origin and submitted details ▾]           │                         │ │
│ │ [Delivery history and record IDs ▾]        │                         │ │
│ └────────────────────────────────────────────┴─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Mobile, ≤375px

```text
┌──────────────── 375 ────────────────┐
│ [←] Request                         │ 56
│ REQ-0184                [Needs reply]│ 40
├─────────────────────────────────────┤
│ Jamie                               │
│ Safety switch trips after rain      │
│ Received 9:42                       │
│ Delivery recorded                   │
├─────────────────────────────────────┤
│ Conversation history                │
│ Customer request                    │
│ Submitted record                    │
│ Latest message                      │
│ Earlier history [Expand]            │
├─────────────────────────────────────┤
│ Origin and details [Show]           │ 44
│ Delivery history [Show]             │ 44
├─────────────────────────────────────┤
│ Result after action: Waiting…       │
│ [Reply]                             │ 44
│ [Request clarification]             │ 44
│ [Snooze]                            │ 44
│ [Decline]                           │ 44
│ [Close request…]                    │ 44
│ Business/customer boundary copy     │
└─────────────────────────────────────┘
```

No sticky rail at ≤375px. Consequence text remains immediately above each commit action.

## Section anatomy

1. **Identity header**
   - Content: request ID, customer-provided identity label, need summary, business, received/updated times, audience status plus inspectable authoritative status mapping, unread posture.
   - Data: route loader object header projection.
   - Astryx: `Heading`, `Text`, `Badge` through `AeStatusBadge`, shared `AeTimestamp`, `Button` back link.
2. **Delivery-attention readback**
   - Content: current outbound/inbound delivery fact, last attempt, next expected transition, one recovery. Text distinguishes saved, queued, delivered/readback, status unavailable, and business/customer response.
   - Data: item projection from receipt and delivery-attempt records.
   - Astryx: `Banner`, `Badge`, `Button`, `Collapsible` for full attempts.
<!-- journey-system: B2/C5 -->
3. **Conversation history**
   - Content: chronological document spine. Customer message is `user_text`; original submitted handoff is linked `receipt`; business/customer messages are attributable linked items; system transitions are `status_note`/`error`. Owner and customer projections MUST share each message identity. Customer bounded answers MUST render as linked items with `answersItemId`; clarification questions and their resolving answers remain paired and independently inspectable. Permission, records, business-origin responses, failures, and terminal evidence never disappear.
   - Data: one versioned conversation-item projection shared with the customer record, not route-authored or owner-only message objects.
   - Astryx: semantic ordered list/articles; `Card` only where a bounded immutable record needs it, `Heading`, `Text`, `Badge`, `Collapsible`, `Button`, shared `AeTimestamp`. Never chat bubbles.
4. **Origin context**
   - Content: originating business page, service/capability, customer need and constraints, submitted fields, source version/freshness, visibility and retention posture. Internal mechanics stay in spec/data labels, not customer-facing copy.
   - Data: route loader and linked receipt/item projection.
   - Astryx: `DescriptionList` if available, otherwise semantic `<dl>` with Tailwind; `Collapsible`, `RouterLink`.
5. **Action rail/action section**
   - Content: only state-legal dispositions, each with resulting-status preview from the table above; suppression posture if replies cannot be sent; adjacent boundary copy. Reply and clarification commits also show `Your reply is recorded exactly as sent.`
   - Data: transition registry, business acceptance/suppression policy, authenticated owner session, canonical response digest, and appended response-attestation event.
   - Astryx: `Button`, `Tooltip`, `TextArea`/`FormLayout` for reply, `Select` for snooze, `Dialog` for decline/close.
6. **Close request**
   - Content: `Close request…` opens a modal stating current request, what remains readable, that unsent operational notifications cease, that a late reply may remain in the record without restarting notifications, and named action `Close this request`.
   - Data: route action and A11 notification-cessation projection.
   - Astryx: `Dialog`, `Button`. This modal is consequence-driven, not the first thought.

## States

- **Loading:** identity, status, four item articles, two disclosures, and action rail skeletons retain exact geometry.
- **Empty, resource not found:** `Request not found.` Do not reveal cross-business existence. Action `Back to Requests`.
- **Access denied:** same non-enumerating posture, but authenticated users with a safe route receive `You do not have access to this request.`
- **No conversation beyond submission:** `No reply yet.` Explain `The original request is recorded below. The customer has not replied in AE.` Show one legal primary action or `No action needed`.
- **Suppressed delivery:** `Replies are paused for this business.` Explain the policy, preserve the record, and link `Change request availability`; do not present a commit that policy will reject.
- **Error:** shell and known identity remain. Failed item persists with cause-specific recovery. Raw server messages never render.
- **Streaming:** reply text is not streamed from model output. Persisted inbound events append as items; announce one meaningful insertion. During owner send, pending lock fills the final record anatomy in place.
- **Zero-JS/SEO:** authenticated `noindex`; server-render object and chronological links. Disclosures use semantic details fallback where compatible. Reply and close actions submit forms with server validation; JS enhances pending lock and focus only.

## Interactions

- Primary action is the first state-legal disposition, usually **Reply**. Full Reply / Request clarification / Decline / Snooze contracts and resulting statuses are normative from the table in `/owner/inquiries` above.
- Reply and clarification use a compact inline composer, not a modal. `FormLayout` shows field-local error, server-failure Banner, first-invalid focus, disabled/loading submit, exact customer and message readback, and named send CTA.
- Decline and Close use modal confirmation. Close is distinct from Decline: close ends owner attention and notification purpose without asserting the business declined. Modal states retained data and notification cessation.
- Keyboard: `J/K` do not switch records on a direct detail URL. In split context they move queue focus only when detail controls do not own focus. `Enter` opens focused detail; `Space` toggles read posture. Tooltips show all available shortcuts. `Escape` closes menu/dialog, never discards typed text.
- Deep link to an item expands and focuses its heading without auto-collapsing the prior focused item. Browser Back restores queue focus and scroll.

## Copy voice

- Headline: **Request** plus stable ID.
- Section labels: **Conversation history**, **Original request**, **Origin and submitted details**, **Delivery history**, **Next action**.
- Close copy: `Closing stops future updates for this request. The record remains available. A late customer reply may still appear here, but notifications will not restart unless you choose a new notification purpose.`
- Boundary beside reply/clarification: **The customer decides how to respond. Your business confirms price, timing, availability, and any next step directly with the customer.**
- Delivery statement: **Delivery recorded does not mean read or accepted. Sent never means confirmed.**
- Reply recording: **Your reply is recorded exactly as sent.**
- Owner-facing copy may use request and delivery. It does not expose receipt/item/tuple/lifecycle as leading labels; `Submitted record` is the human label. No R2–R4, payment, wallet, booking, procurement, or AE confirmation language.

## Responsive

- Split context follows queue/detail rules above. Direct route uses main + 288px sticky action rail at `lg`; below `lg`, rail becomes a normal section after facts.
- At ≤375px, item header is at most two lines; secondary metadata moves into labelled disclosures; actions stack with the primary final in DOM/visual order for consequence recap adjacency.
- Long IDs wrap/copy safely; message bodies use `overflow-wrap:anywhere`; no horizontal scroll at 320px, 375px, or 200% zoom.
- Targets are ≥44px. The latest actionable item stays expanded; older collapsible noise can summarize, never evidence items.

## Accessibility

- `<main>` contains one `h1`; conversation is `<ol aria-label="Conversation history">`; items follow CONVERSATION-ITEM-SPEC article labelling and descriptions.
- Status mapping and delivery attention are textual. Timestamps use `<time>`. Customer/business actors are explicitly named; alignment and color carry no meaning.
- One polite live region announces persisted inbound response, send result, and status transition. Sending failure is one alert with recovery. Chunk/timestamp changes are silent.
- Modal has labelled title/description, focus trap, cancel path, and trigger focus return. Pending action sets `aria-busy`; disabled controls show a visible reason.
- Reduced motion resolves disclosures and status changes immediately. No auto-scroll when the owner has moved away from the latest item; offer `New reply` jump control.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-2–LAW-7 | Stable object identity, explicit state contract, honest delivery, adjacent consequence, durable record, two disclosure levels. |
| LAW-9 | One chronological document spine; never-collapse evidence and quiet history follow shared item spec. |
| IA-1, IA-6–IA-9 | Authenticated operator route; deliberate 7xl object workspace; thin route; action rail contains decisions only. |
| CH-1, CH-6–CH-9, CH-11 | Registry-valid items, persisted failure, one narrative, quiet history, specific recovery, shared renderer. |
| AX-2, AX-3, AX-5–AX-7 | Inline sends, destructive modal, named effects, pending lock/readback, no proposal/execution collapse, boundary beside action. |
| DS-1–DS-8, DS-12–DS-15 | Astryx behavior, semantic status/time, complete form/error/loading/accessibility contracts. |
| JOURNEY A11 | Close activates notification cessation; late reply does not silently restart consent. |
| WEDGE-LADDER R1 | One business and one request record; suppression is authoritative; no fan-out/comparison/payment UI. |

## Anti-slop check

No side stripe, gradient text, glass, hero metric, identical cards, nested cards, decorative motion, or generic dashboard art. Inline progressive actions precede modal use; only destructive Decline/Close use `Dialog`. The Stripe influence is object anatomy and state-gated action discipline, not copied branding. The scene selects a restrained light workspace from real ambient use, not a category-reflex dark operations theme.
