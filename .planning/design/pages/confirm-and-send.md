# `/:slug/inquiry` — Confirm and send

## Register & scene

**Register:** product.

**Physical scene:** A person on a 375px phone pauses at a kitchen bench before sending their contact details and exact need to one real business, then needs a calm written record they can revisit while waiting, so the interface uses warm canvas, white surface, ink, slate, and eucalyptus only for the current choice and named action.

## Job & IA position

**One job:** Give the customer one exhaustive, field-by-field review of exactly what AE will send to one named business, lock duplicate sends while the operation resolves, then hand off to a durable record with an honest response expectation, notification choice, and withdrawal path.
<!-- tx-lens -->
The review is the sign-what-you-see boundary: its labelled rows MUST render the canonically serialized field set in canonical field order, with no presentation-only summary substituted for the values admitted at commit. Review rendering and send admission MUST resolve to one canonical payload digest; the digest remains internal.

**Route class:** public discovery (IA-1) for the review route. It is a focused consequential form reached from a public listing or a customer-controlled thread. On successful send, the flow replaces the review URL with `/t/:threadId?k=…#record`, the canonical thread route focused on its key-granted record projection. The access key never enters canonical metadata, page title, analytics, logs, referrers, or sitemap. <!-- stupid-shit: S1 -->

**Entry points:** <!-- journey-system: B1/C1 -->

Every request-start path MUST terminate at the single server operation `BeginSingleBusinessReview`; no page MAY create a parallel review bootstrap.

| Start path | Thread source | Provenance seed |
|---|---|---|
| `/` composer submit, including legacy `?q=` and `/q/:answerId` after explicit submit | Thread created by home submit | `asked` from composer |
| `/t/:threadId` → `Ask this business` | Existing thread; proposal appended in-thread | carried `asked` / `understood` / `assumed` |
| `/:slug` listing CTA after thread-origin arrival | Existing thread resolved from the transition envelope | carried provenance |
| `/:slug` listing CTA after direct/SEO arrival | Thread bootstrapped by `BeginSingleBusinessReview` | `asked` from review form fields |
| `/registry` card CTA | Thread bootstrapped by `BeginSingleBusinessReview`; the card routes through `/:slug/inquiry` | `asked` from review form fields |
| Machine `/api/v1/requests` | API creates the request object; outside this UI contract | agent-surface provenance contract |

`BeginSingleBusinessReview({ businessBindingRevision, originating?: { threadId, journeyContextRevision, proposalId }, draft?: { fields, enteredAt }, idempotencyKey }) → { threadId, journeyContextRevision, proposalId, reviewUrl }` MUST atomically create-or-reuse the thread, append an `asked` event for every no-thread draft field with its original value and entry time, project `JourneyContext@revision`, and create the proposal plus unsigned review. Review edits MUST append events, increment the `JourneyContext`/proposal revision, invalidate the prior readback, and regenerate the exhaustive review; routes MUST NOT dual-write projected context.

Reload of an unsigned review draft MUST restore the same draft revision without inferring consent. Reload during a pending lock MUST reconcile by operation/idempotency key before exposing any action.

<!-- journey-system: A1/C2 -->
Thread-origin continuation MUST use `TransitionEnvelope v1`: `{ origin, objectRefs: { threadId?, journeyContextRevision?, proposalId?, businessBindingRevision? }, returnTo: { routeId, restore: opaqueHandle }, focus?, privacyClass }`. The server MUST hold the short-lived, session-bound continuation and the public URL MUST carry only `?tx={handle}`; raw context, thread IDs, proposal IDs, revisions, private values, and return state MUST NEVER appear in a public URL. An expired handle or foreign-device open MUST degrade to the direct-entry contract: open empty editable review fields and bootstrap through `BeginSingleBusinessReview`. `Don’t send` MUST consume a valid envelope to return with draft/return state preserved; without one it MUST return to the public listing.

**Exits:**

- Named commit: `Send request to {business}`. It authorizes and initiates only the reviewed one-business request.
- `Change` on any field returns that field to editing, invalidates the prior review snapshot, and requires a fresh exhaustive readback.
- `Don’t send` returns to the listing or originating thread with research and draft preserved.
- Successful resolution replaces the route with `/t/:threadId?k=…#record`, focused on the durable record region. <!-- stupid-shit: S1 -->
- Record actions: `Withdraw request` where supported, `Contact business another way`, `Return to your matches`, `Copy private link`, and one notification-channel choice.

**Normative blueprint:** PRINCIPLES.md §10 `/:slug/inquiry`; focused-form skeleton under IA-6/IA-7; LAW-2, LAW-4–6; AX-1–AX-7, especially AX-2 pending lock plus receipt; JOURNEY stages 6–8 and §5 confirmation-depth mapping; CONVERSATION-ITEM-SPEC `proposal → permission_request → receipt`; WEDGE-LADDER R1 only.

## Layout

**Skeleton:** focused form/private record. Use `max-w-3xl mx-auto px-4 md:px-6` for review and pending states. After authoritative send, hand off to the canonical `private-record.md` anatomy at the same `max-w-3xl`; entry path never changes record composition. Default page-section rhythm is `space-y-12`, block rhythm `space-y-6`, and field rhythm `space-y-4`. There is no sticky rail, fixed mobile CTA, side navigation, or modal send confirmation. The screen itself is the single exhaustive confirmation.

**Desktop review, ≥768px:**

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ AePublicShell / Back to {business}                          max-w-3xl    │
├──────────────────────────────────────────────────────────────────────────┤
│ Confirm what will be sent                                                │
│ Review every detail below. Nothing is sent until you choose the action.  │
│ Status: Ready for your approval · Draft ref DR-… · Updated <time>         │
├──────────────────────────────────────────────────────────────────────────┤
│ TO                                                                        │
│ Business             {Business name}                         [Change]     │
│ Service              {Selected service or “General request”} [Change]    │
│ Purpose              Ask whether the business can help       [Change]    │
├──────────────────────────────────────────────────────────────────────────┤
│ YOUR REQUEST                                                               │
│ Need                 “Repair leaking kitchen tap”            [Change]    │
│                      You said · from “…”                                  │
│ Location/service area “Joondalup, WA”                       [Change]      │
│                      AE understood · from “near Joondalup”                │
│ Timing                “This week”                            [Change]     │
│                      Assumption · MUST confirm or remove                  │
│ Constraints           “Rental; weekday access after 3pm”     [Change]    │
│ Message               Full outbound message, verbatim         [Change]    │
│ Requested response    Availability posture + quote/contact reply [Change]│
├──────────────────────────────────────────────────────────────────────────┤
│ CONTACT DETAILS SHARED                                                     │
│ Name                  Joel                                      [Remove]   │
│ Email                 j•••@example.com  [Sensitive]             [Change]   │
│ Phone                 Not shared                                [Add]      │
│ Reply path            Email + private AE record                 [Change]   │
├──────────────────────────────────────────────────────────────────────────┤
│ LIMITS AND EXPECTATION                                                      │
│ Price                 Callout from $90 · business-published 12 Jul 2026   │
│ Expected response     Within 2 business days                              │
│ Basis                  Business-published response window                  │
│ Send limit             Once, to {Business name} only                       │
│ Expires                {date/time}                                         │
│ Withdrawal             You can withdraw while waiting; completed delivery │
│                        and the written record cannot be erased.            │
├──────────────────────────────────────────────────────────────────────────┤
│ CHANGED OR SENSITIVE  [always visible when non-empty]                       │
│ • Timing was assumed. Confirm “This week” or remove it.                    │
│ • Email will be shared with {Business name}.                               │
├──────────────────────────────────────────────────────────────────────────┤
│ This is exactly what will be sent. It can’t change after you approve it.   │
│ This sends your request once to {Business name}. Price is confirmed by   │
│ {Business name} in their reply.                                           │
<!-- de-hedge -->
│                                                                            │
│ [Don’t send]                              [Send request to {business}]     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Mobile review, ≤375px:**

```text
┌───────────────────────────────┐
│ ‹ Back to {business}          │
│ Confirm what will be sent     │
│ Ready for your approval       │
│ Draft DR-… · <time>           │
├───────────────────────────────┤
│ TO                            │
│ Business                      │
│ {Business name}     [Change]  │
│ Service                       │
│ Tap repair          [Change]  │
│ Purpose                       │
│ Ask if it can help  [Change]  │
├───────────────────────────────┤
│ YOUR REQUEST                  │
│ Need                          │
│ Repair leaking kitchen tap    │
│ You said · “leaking tap…”     │
│                      [Change]  │
│ Location                      │
│ Joondalup, WA                 │
│ AE understood · “near…”       │
│                      [Change]  │
│ Timing [CHANGED]              │
│ This week                     │
│ Assumption · confirm/remove   │
│ [Confirm timing]    [Remove]  │
│ Constraints                   │
│ Rental; weekdays after 3pm    │
│ You said             [Change] │
│ Message                       │
│ “Hi {business}, I need…”      │
│                      [Change]  │
│ Requested response            │
│ Can you help? Please reply    │
│ with timing and a quote.      │
│                      [Change]  │
├───────────────────────────────┤
│ CONTACT DETAILS SHARED        │
│ Name: Joel           [Remove] │
│ Email [SENSITIVE]             │
│ j•••@example.com     [Change] │
│ Phone: Not shared      [Add]  │
│ Reply: Email + record [Change]│
├───────────────────────────────┤
│ LIMITS                        │
│ Price: Callout from $90          │
│ Reply: within 2 business days │
│ Basis: business-published     │
│ Send: once, to {business}     │
│ Expires: <time>               │
│ Withdraw while waiting; a     │
│ completed delivery remains in │
│ the written record.           │
├───────────────────────────────┤
│ BEFORE YOU SEND               │
│ Timing is assumed.            │
│ Email will be shared.         │
│                               │
│ This is exactly what will be  │
│ sent. It can’t change after    │
│ you approve it.                │
│ This sends your request once   │
│ to {business}.                 │
│ Price is confirmed by {business} │
│ in their reply.                  │
<!-- de-hedge -->
│                                │
│ [Don’t send]                   │
│ [Send request to {business}]   │
└───────────────────────────────┘
```

Every shared field is visible in the mobile DOM before the consequence recap. The changed/sensitive recap and boundary copy are immediately adjacent to the named CTA: no disclosure, navigation, help text, evidence drawer, footer, or unrelated content may intervene. The primary action is last in DOM and visual order.

**Pending lock, all widths:**

```text
┌───────────────────────────────────────┐
│ Sending your request                  │
│ To: {Business name}                   │
│ Operation OP-… · started <time>       │
│ Creating a written handoff record.    │
│ Do not close or send again.           │
│                                       │
│ [Sending to {Business}…] (disabled,   │
│  aria-busy=true)                      │
│ [Return to saved thread] if safe      │
└───────────────────────────────────────┘
```

The settled form geometry stays in place behind/above the lock state; the permission item changes from `awaiting_confirmation` to `executing`. No success checkmark, “sent”, or new send action appears before authoritative readback.

**Record view after authoritative receipt:**

On authoritative receipt creation, replace this route with `/t/:threadId?k=…#record` and render the normative anatomy in `private-record.md` as the thread's record projection. That projection is always a focused `max-w-3xl` reading rail with the same identity, submitted scope, delivery evidence, notification preference, retention, and history regardless of entry. It exposes exactly one state-derived primary action. The customer-facing object name is `Your record`; `Sent` and `Request sent to {business}` are status/event labels only. The internal `receipt` item and `ChildReceipt` remain first-class mechanics, and later business responses append linked items rather than mutating them. <!-- stupid-shit: S1 -->

## Section anatomy

### 1. Route header and status

- **Content:** `Back to {business}`; `Confirm what will be sent`; one-sentence no-send-yet explanation; public status `Ready for your approval`; draft reference; last-updated time. When restoring a changed source/context revision, status becomes `Review updates before sending` and names the affected fields.
- **Data source:** route loader resolves business identity, eligible destination/binding revision, proposal revision, `JourneyContext` revision, unsigned review draft, and any pending operation key. Status is projected through the central status mapping.
- **Astryx:** `Heading`, `Text`, centralized `Badge`, shared `Timestamp`, AE router-link composition.

### 2. Recipient, service, and purpose

- **Content:** exact business name; selected service or honest `General request`; purpose in ordinary language; one `Change` control per field. Recipient identity includes the public business page link and binding/source revision one inspection layer deeper. R1 cardinality is exactly one; no recipient count, add-another, compare, or fan-out affordance appears.
- **Data source:** route loader’s versioned recipient binding and proposal item projection.
- **Astryx:** semantic description list, `Heading`, `Text`, `Button`, `Collapsible` for source/version detail.

### 3. Request fields and provenance

<!-- tx-lens -->
- **Content:** field-by-field need, broad location/service area, timing, constraints, full outbound message, and requested response. The rows MUST be generated from the canonical serializer’s declared field set and MUST appear in that serializer’s canonical order. Labels and customer-safe masking MAY aid reading only when they preserve exact verification; a reformatted summary, independently assembled field list, or presentation JSON MUST NOT stand in for the admitted bytes. Each carried fact has a visible customer provenance label:
  - `asked` → `You said`, with source phrase/value;
  - `understood` → `AE understood`, with source phrase and interpreted value;
  - `assumed` → `Assumption`, with reason and explicit `Confirm` or `Remove` before it may be shared.
  `found` business facts are not silently copied into customer-authored request fields. `authorized` appears only on the completed record as `You allowed`, never before the named action.
- **Data source:** one canonical serialization of the exact `JourneyContext` revision and versioned structured brief; the review renderer and commit admission MUST compute the same payload digest from it. Direct listing entry creates explicit editable fields; it does not invent thread provenance.
- **Astryx:** `FormLayout`; `TextField`, `Textarea`, or appropriate Astryx field components in edit mode; `Heading`, `Text`, `Badge`, `Button`; field-local error association.

### 4. Contact details shared

- **Content:** every contact field with exact masked readback where masking still lets the customer verify it; explicit `Not shared` rows; sensitive marking; add/change/remove controls; reply path. Never hide a shared value behind `View details`. Attachments, access instructions, exact address, and other private details appear as individual rows if and only if included.
- **Data source:** permission scope projection’s `disclosedFieldIds/hashes` joined to the review snapshot, never a generic profile/contact object.
- **Astryx:** `FormLayout`, `TextField`, `Checkbox` only for explicit field inclusion where appropriate, `Badge`, `Button`, `Banner` for a server-level failure. No prechecked marketing consent.

### 5. Limits and expected response

<!-- de-hedge --> - **Content:** send once; one named recipient; purpose; expiry; requested response; expected-response window and its basis; withdrawal semantics; and the useful price-posture ladder. If the business published an indicative price, show it with attestation and date (`Callout from $90 · business-published {date}`); if it published none, omit the price row here. If no supported response-window basis exists, show the fact `Response timing: Not listed.` Do not invent a deadline or replace a missing fact with a guarantee hedge.
- **Data source:** route loader’s business-published response basis or versioned category/channel default; permission scope expiry; R1 action policy.
- **Astryx:** `Heading`, `Text`, `Badge`, shared `Timestamp`, `Collapsible` for secondary policy detail only.

### 6. Changed or sensitive recap

- **Content:** exhaustive list of changed fields since the proposal was opened and every sensitive field that will be shared. Each entry links/focuses its source row. An assumed consequential field is blocking until confirmed or removed. Empty only when there are genuinely no changed/sensitive fields; the consequence recap still remains.
- **Data source:** permission item projection’s `changedFieldIds` and `sensitiveFieldIds` against the same `scopeModelVersion` used by the proposal.
- **Astryx:** `Banner` with a neutral/warning semantic state as appropriate, `Text`, `Button`/link controls. Full border or surface tint only, never a colored side stripe.

### 7. Exhaustive consequence and action

<!-- tx-lens -->
<!-- de-hedge --> - **Content:** `This is exactly what will be sent. It can’t change after you approve it.` followed by `This sends your request once to {business}.`; exact shared-field readback; and the single load-bearing price boundary `Price is confirmed by {business} in their reply.` Actions are `Don’t send` and `Send request to {business}`. This is the only authorization decision and the only exhaustive confirmation summary. Do not stack booking, availability, timing, or outcome disclaimers beside it.
- **Data source:** `permission_request` item in `renderMode: 'review'`, same `scopeModelVersion` and canonical payload digest as the editable proposal. The commit request includes the immutable reviewed scope revision and one-use operation key.
- **Astryx:** `Button` for both choices with symmetric visibility; semantic section/article; no `Dialog` for routine send.

### 8. Pending lock

- **Content:** recipient; operation reference; started time; `Creating a written handoff record; do not close or send again.` Disabled named action. After five minutes of unresolved provider readback, the record state becomes `Status unavailable: check again`, not success or failure. Reload reconciliation begins immediately and no new send action appears until absence of an operation is authoritative.
- **Data source:** persisted `permission_request` lifecycle `executing`, child action identity created before completion, operation/idempotency key, pending-lock reconciler.
- **Astryx:** `Card` or semantic `article` for the bounded operation; `Heading`, `Text`, centralized `Badge`, `Button isDisabled`, `Progress` only if it is indeterminate and has a text equivalent. The container and action expose `aria-busy`.

### 9. Canonical in-thread record handoff

- **Content:** redirect/replace to `/t/:threadId?k=…#record`, using the `private-record.md` normative projection anatomy and customer heading `Your record`; preserve record/receipt ID, operation/correlation support reference, recipient, submitted time, current delivery label, exact submitted field snapshot, stable private revisit path, expected-response facts, notification preference, retention, and append-only history. Exactly one primary action is derived from authoritative state. `Sent` is an event/status label, not an object name. <!-- stupid-shit: S1 -->
- **Data source:** first-class `ChildReceipt` projected through the conversation `receipt` item plus immutable consent/submitted snapshot, delivery history, receipt/thread notification preference, and private-link/retention projections.
- **Astryx:** the components and ordering are normative in `private-record.md`; the thread route renders them as its record region and this route defines no second composition.

### 10. Handoff invariants

- The record does not depend on whether entry came from a listing, thread, pending reload, or key-granted link.
- The in-thread record region remains `max-w-3xl` with one state-derived primary action.
- Delivery, response-window, notification, withdrawal, key safety, and retention behavior are owned by `private-record.md`; this spec only guarantees the exact reviewed revision and operation identity are handed off without mutation.

<!-- sim: G4 -->
## Carried-forward episode continuity

When C7 creates a new episode by reusing a prior brief, the review MUST make reuse explicit; silently prefilled fields are prohibited.

- Directly below the route header, render the assertion `Same details as your request to {prior business}, except…` and name the prior episode/record reference and sent timestamp in labelled mono/tabular text. This is a comparability assertion about the brief, never reused permission.
- Render a field-level diff against the exact prior authorized brief revision: `Unchanged`, `Changed from {old value} to {new value}`, `Added`, and `Removed / not shared`. Values MUST remain beside their labels; a summary count cannot replace the diff.
- Every changed, added, or removed field MUST be re-emphasized in its normal review row and in `Changed or sensitive`. Changed sensitive fields remain sensitive and blocking assumptions still require confirmation or removal.
- If the prior revision cannot be loaded or compared exactly, do not claim `Same details`; render `We could not verify which details carried forward. Review every field.` and treat every included field as changed.
- Any edit regenerates the diff against the same prior authorized baseline, increments the new proposal revision, and invalidates the current readback. The new episode always requires `Review what will be sent` and a fresh `Send request to {business}` authorization; prior authority is never carried forward.

<!-- sim: G7 -->
## Principal, subject, and acting authority

`Whose details are these?` MUST be a real authorization section before the person-specific fields, not a toggle or bare self-attestation.

- The customer MUST choose a named relationship posture: `My details`, `Parent or guardian`, `Formal representative`, `Support person with permission`, or `Other — describe relationship`. Generic `another person` is insufficient. Unsupported or internally inconsistent posture blocks send with a field-local reason.
- When acting for another person, the review MUST name the subject using only the selected identifying fields and show the affirmation: `I affirm that I am allowed to share the selected details for this request and to ask {business} to reply about it.` The interface MUST explain that this statement is stored with the authorization record.
- The authorization record MUST persist the acting person identity/contact posture, subject reference, named relationship posture, exact affirmation text/version, affirmed timestamp, and the selected subject fields. Any change to actor, subject, relationship, affirmation version, purpose, or selected subject field invalidates review and requires the affirmation again.
- The completed `Your record` MUST show `Acting for` plus the named relationship posture and affirmation timestamp. Controlled exports MUST offer the exact authority statement as a separately selectable sensitive field, off by default; sanitized share MUST not include it unless deliberately selected.
- Provide `Start a separate request for another person` beside the subject section. Activation MUST create a fresh thread/context and empty proposal with a new subject boundary; it MUST carry no need, contact, site, access, participant, prior-business, or authorization context from the current subject. Only the explicitly selected public business binding MAY remain as navigation context, not request data.
- Returning to the current review after starting separately MUST preserve each subject context under distinct IDs and MUST NEVER merge, suggest, autocomplete, compare, or export fields across those contexts.

## A5 authority tuple mapped to customer-visible review

The tuple is an internal enforcement model. The customer sees concrete fields, recipient, purpose, limits, and one action, never the words tuple, mandate, nonce, hash, or kernel.

| Enforced A5 field | Customer-visible readback | Where shown | Change/invalidation behavior |
|---|---|---|---|
| `principalId` | `You are allowing AE…` plus the signed-in or verified contact identity when identity is required | Consequence section; identity detail one layer deeper | Identity change requires re-verification and a fresh review. |
| `subject/data-subject posture` | `Whose details are these?`; named subject; named relationship posture; exact affirmation; selected person-specific fields | Dedicated authority section before contact details; completed record; selectable sensitive export field | Actor, subject, relationship, affirmation version, purpose, or subject-field change invalidates review and requires a fresh affirmation; `Start a separate request for another person` creates an isolated context. |
| `actionClass` | `Send this request` | Consequence heading and named CTA | Any different action starts a new proposal; this permission cannot book, pay, accept, or confirm. |
| `actionRef` | Visible draft/request reference `DR-…`; operation reference appears during pending | Header; pending lock; record | New action identity produces a new review. Retry resolves the same operation reference first. |
| `briefRevision` | `Request version {n}`; complete field-by-field request body; changed-field markers | Header/detail disclosure and every request row | Editing any request field increments the revision and returns status to `Review updates before sending`. |
| `recipientBindingVersion` | One exact business, service/contact destination, and `Destination details checked <time>` | Recipient section; version/source detail one layer deeper | Business/destination change invalidates approval; no silent retargeting. |
| `disclosedFieldIds/hashes` | Every shared value as a labelled row, with sensitive fields emphasized and `Not shared` rows explicit | Request and contact-details sections; changed/sensitive recap | Add, remove, or edit any field invalidates approval. Hashes remain internal. |
| `purpose` | `Ask whether {business} can help with {need} and request a reply about timing and price` | Recipient/purpose row and consequence recap | Purpose change requires a fresh review. No standing or marketing purpose is inferred. |
| `expiry` | `Send permission expires {date/time}` | Limits section adjacent to send | Expiry disables send and offers `Review again`; it never silently extends. |
| `one-use nonce/idempotency key` | `Send once`; pending operation `OP-…`; `Do not send again` | Limits, pending lock, and record | Duplicate activation returns/reconciles the same operation and record. The secret nonce is never displayed. |

**Additional customer-visible scope facts required by A6/AX-1:** requested response, response-window basis, price posture, service/location boundary, withdrawal effect, and explicit non-outcomes are rendered even though they are not separate labels in the compact tuple string. They bind into the action/brief/purpose policy and cannot be hidden as implementation detail.

## States

### Loading

Render the full review geometry: header/status, recipient rows, request rows, contact rows, limits, changed/sensitive recap footprint, consequence copy, and two-action row. Use line skeletons matched to field-value lengths without fake personal values. When loading an existing pending operation, render the pending-lock geometry immediately; never flash an enabled send button. After handoff, loading follows the canonical `private-record.md` geometry.

### Empty

Each maps to one DS-13 meaning:

- **Resource not found:** `We couldn’t find this business page.` Actions: `Return to businesses` and `Start with your need`.
- **Unmet demand:** `This business does not currently accept this kind of request through AE.` Actions: `Contact the business another way` when source-backed or `Choose another business`. No disabled send.
- **Access denied:** `This review link does not give access to that saved request.` Action: `Return to the business page`; do not reveal whether another thread or record exists.
- **Temporarily unavailable:** `We can’t verify where to send this request right now.` Action: `Try again`; preserve the draft. Never send to a stale or unresolved destination.
- **No source data:** missing optional field rows say `Not provided` or `Not shared`; missing required request/contact information is a field error, not a cheerful empty screen.

### Error

- **Validation:** field-local error with `aria-invalid` and `aria-describedby`; summary `Banner` links to errors; focus first invalid field. Consequential assumptions must be confirmed or removed.
- **Server before operation creation:** keep the exact draft and show `We couldn’t prepare this send. Nothing was sent.` Primary recovery: `Try again`.
- **Unknown after operation may exist:** `Status unavailable: check again.` Preserve operation reference and disable send. Primary recovery: `Check status`; never offer send again.
- **Authoritative delivery failure:** durable record says what remains true and offers exactly one recovery, normally `Choose another contact path`. It is not `business declined`.
- Raw errors never render. Context, business identity, and user-entered fields remain visible.

### Streaming

No token streaming occurs in the permission review. If a message draft is being prepared from thread context, that happens in the proposal stage before this exhaustive review. Pending status changes are discrete authoritative transitions, not simulated progress. Countdown ticks and delivery polling are silent; only semantic state changes announce.

### Zero-JS and SEO posture

Server-render the complete review and support a standard POST with CSRF/admission protection, immutable review revision, and idempotency key. The server revalidates business destination, scope, expiry, and context revision. Without JavaScript, submission returns a pending/record document and duplicate POSTs converge on the same operation. Change controls use standard links/forms and preserve the draft. The review route is `noindex, nofollow`; user values never enter metadata or public caches. Successful send redirects/replaces to the private-link record with `Referrer-Policy: no-referrer` and access-key-safe analytics. Private records are never indexed.

<!-- tx-lens -->
At commit, the server MUST atomically re-evaluate `R1TargetAdmitted` and the complete authority tuple against the reviewed canonical payload before creating any delivery effect. Drift refuses the operation, invalidates the review, creates no partial send or sent record, and names the changed fact in customer language—for example, `This business paused new requests a moment ago.` Recovery is a refreshed exhaustive review, never continuation under the stale approval.

## Interactions

### Primary action: Send request to {business}

- **Default:** enabled only after every shared field is visible, all blocking assumptions are confirmed/removed, destination remains eligible, review revision is current, and expiry has not passed.
- **Hover/focus/active:** Astryx `Button` states; visible focus ring; 44px minimum target; label never shortens to `Send` when the business name can fit. At very long names, the accessible name remains complete while visible copy may wrap.
- **Activation:** atomically re-checks `R1TargetAdmitted`, tuple validity, expiry, revisions, and the canonical payload digest; only if all remain valid does it record one-use authorization for the exact scope and create/resolve the child action identity before external work. It transitions the permission item `awaiting_confirmation → executing`, disables both commit duplication and scope edits, sets `aria-busy`, and preserves the reviewed content. No side-door consequential write is permitted.
- **Drift refusal:** invalidate the approval and return to a fresh exhaustive review with the specific changed fact named, for example `This business paused new requests a moment ago.` Nothing is partially sent, and no sent record is created.
- **Pending:** label `Sending to {business}…`; show operation reference, started time, and `Creating a written handoff record; do not close or send again.` No optimistic `sent`.
- **Success:** authoritative receipt creation redirects/replaces to the private record; focus moves to `Your record`; polite announcement: `Request sent to {business}. The business has not confirmed it.`
- **Failure before action:** return to review with preserved fields and focused error summary.
- **Unknown outcome:** lock remains; show `Status unavailable: check again`; reconcile by the same operation key. Never expose a fresh send control.
- **Duplicate activation/reload:** the same approval retries only the identical canonical request and returns the original action/record. Reuse of its operation key with different reviewed content is refused and requires a fresh review.

### Change controls

Each `Change` opens an inline edit region using `FormLayout`, keeping the changed value next to its prior readback. Save returns focus to the row heading, marks it `Changed`, increments proposal/context revision, and regenerates the exhaustive review. Recipient, destination revision, service, body, any shared field, purpose, expiry, or context revision change invalidates authorization. `Cancel edit` restores the prior value and focus.
- When the review reuses a prior episode, every change recomputes the G4 field-level diff and keeps changed rows emphasized. When actor/subject authority changes, the G7 affirmation becomes incomplete until reviewed again.

### Don’t send

A visible, symmetric refusal action. It records no send authority, preserves the draft/thread/research, and returns to the originating context. No shame copy, warning modal, or loss threat. If navigation would discard a consequential unsaved edit, D5 navigation blocking names the exact unsaved field; otherwise no modal.

### Post-send actions

Notification choice, withdrawal, and every other post-send action follow `private-record.md`. This confirmation route neither duplicates their contracts nor selects actions by entry path. The canonical record derives exactly one primary action from authoritative state.

### Keyboard and focus

DOM order matches the field-by-field readback. `Change` controls follow their values. Review-entry focus moves to the confirmation heading/scope summary, never directly to send. Error summary receives focus after server failure; field errors focus first invalid field. Pending resolution focuses the record heading; unknown outcome focuses the status summary. Disclosure and dialog keyboard behavior comes from Astryx; dialog cancellation returns focus to `Withdraw request`. Back/forward restores the last field anchor without re-enabling a locked send.

## Copy voice

**Headline:** `Confirm what will be sent`

<!-- de-hedge --> **Key labels:** `To`, `Your request`, `Contact details shared`, `Limits and expectation`, `Changed or sensitive`, `Before you send`, `Callout from {amount}`, `Price is confirmed by {business} in their reply`, `Ready for your approval`, `Send request to {business}`, `Don’t send`, `Sending your request`, `Your record`.

**Episode continuity:** `Same details as your request to {prior business}, except…`; fallback `We could not verify which details carried forward. Review every field.`

**Authority labels/actions:** `Whose details are these?`, `Acting for`, `I affirm that I am allowed to share the selected details for this request and to ask {business} to reply about it.`, `Start a separate request for another person`.

**Required adjacent boundary copy:**

- `This sends your request once to {business}.`
- `This is exactly what will be sent. It can’t change after you approve it.`
- `AE will share: {field list/readback}.`
- `Price is confirmed by {business} in their reply.`

<!-- de-hedge --> This is the sole load-bearing boundary line on the send decision view; do not append ambient booking, timing, availability, or outcome disclaimers. The resulting record owns its own state-specific proof boundary.

**Provenance labels:** `You said`, `AE understood`, `Assumption`, and on the completed record `You allowed`. `Found` appears only as `Listed by {source}` for attributed business facts. Internal mechanics names remain in the spec/data source only.

**Banned-word check:** customer-facing copy does not say item, receipt, tuple, mandate, clearance, nonce, hash, lifecycle, kernel, protocol, lead, posting, provider, procurement, vendor, campaign, fan-out, wallet, checkout, payment, booked, accepted, confirmed by AE, guaranteed response, or `Submit`/`Continue`/bare `Confirm`. The URL segment remains an implementation route; visible customer language uses request and record. `Inquiry` may appear only in legacy/support references where a stable ID requires it, not as the product category.

## Responsive

- Review stays one column at all widths. At `md`, label/value/action may form a 3-column row; below `md`, each field stacks label, value/provenance, then change action.
- At ≤375px, all shared fields remain expanded and field-by-field. Secondary source/version metadata may collapse, but no shared value, changed/sensitive marker, price posture, recipient, purpose, limit, expected next step, or boundary may collapse.
- The changed/sensitive recap and consequence paragraph directly precede the action group. Primary action is last in DOM/visual order and full width. No sticky CTA or footer intervenes.
- At 320px and 200% zoom, long business names, email addresses, IDs, and message text wrap; no horizontal scrolling; 44px targets; actions stack.
- After send, responsive behavior is owned by the canonical `private-record.md` `max-w-3xl` composition; no wider or entry-specific record layout exists.
- Virtualization is prohibited for the confirmation field list because it would hide scope from screen-reader and browser-find review.

## Accessibility

- Landmarks: `AePublicShell`; one `main`; review is `article aria-labelledby`; sections use headings; action group is labelled `Send decision`. The private record uses `article` plus a labelled history list.
- Every row has a persistent label. Sensitive/changed states use visible text and semantic descriptions, not color/icon alone. `Changed` and `Sensitive` are included in accessible names.
- `FormLayout` owns error summary, field-local descriptions, `aria-invalid`, and focus-first-invalid behavior.
- Live policy:
  - Review load is silent; the heading receives focus after user-invoked navigation.
  - Pending transition announces once: `Sending request to {business}.`
  - Receipt creation uses one polite status: `Request sent to {business}. The business has not confirmed it.`
  - `status_unknown`, `delivery_failed`, `user_canceled`, and notification-save failure announce once per semantic revision; errors use `role="alert"` after the operation returns.
  - Poll ticks, countdowns, hydration, and copied-link rerenders are silent. Dedupe by `(item.id, lifecycle, deliveryState, semanticRevision)`.
- Pending container and commit action expose `aria-busy`; disabled state includes a visible reason.
- Shared `Timestamp` renders `<time dateTime>`; IDs/times use tabular mono numerals and include spoken labels.
- Reduced motion reaches pending/record/dialog/collapse final semantic state immediately; no shimmer, smooth auto-scroll, typewriter, success confetti, or page choreography.
- Dialog traps focus and returns it correctly. No send confirmation dialog exists; the page is the confirmation.
- Private-link copy explains that possession grants access without announcing or copying the key into a live region.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-2 | Review/draft identity persists; child action exists before completion; success has a stable private record URL and IDs. |
| LAW-3 | Review, pending, unknown, delivered, waiting, failed, withdrawn, and no-reply states each define label, facts, next transition, action/recovery, timestamp, and ID. |
| LAW-4 | No optimistic sent state; unknown is not failure; delivery is not acceptance; business alone confirms. |
| LAW-5 | Recipient, payload, fields, purpose, expected step, limits, price posture, and boundary immediately precede the named CTA, including mobile. |
| LAW-6 | The durable record carries searchable ID, time, recipient, submitted snapshot, current state, history, and revisit path; replies append rather than mutate. |
| LAW-7 | Exhaustive decision facts remain visible; destination evidence and delivery attempts form one deeper inspection layer. No third summary. |
| LAW-8 | Ineligible destination, access, source, and availability failures name the mismatch and smallest valid recovery. |
| LAW-9 / CH-11 | Proposal, permission, receipt, response, error, and status project through the shared document item primitive rather than a form-only parallel lifecycle. |
| IA-1 | Review is public discovery; success moves to a separately classified private-link record. |
| IA-5 | Neither review drafts nor private records enter sitemap/indexing. |
| IA-6 / IA-7 | Uses focused `3xl` review and bounded `5xl` record widths with named gutters/rhythm. |
| IA-8 | Route owns loader, pending reconciliation, SEO, and redirects; reusable composition owns field/readback rendering. |
| CH-1 | Only legal permission/receipt lifecycle tuples and registered transitions render. |
| CH-2 | Public submitted readback is separate from authorized delivery evidence; raw operations remain private/operator-only. |
| CH-5 | Thread-prefilled facts retain asked/understood/assumed provenance and field-level correction. |
| CH-6 / CH-9 | Failed/unknown states persist and offer exactly one cause-specific recovery. |
| AX-1 | Proposal and permission share one versioned scope; review is exhaustive and emphasizes changed/sensitive fields. |
| AX-2 | Externally observable send uses exhaustive review → named commit → pending lock → receipt/record; withdrawal alone uses modal depth. |
| AX-3 | CTA names action and business; no bare Continue, Submit, Confirm, Yes, or OK. |
| AX-4 | `Don’t send` is visible and symmetric; no prechecked or shame-framed consent. |
| AX-5 | Exact scope, duplicate lock, `aria-busy`, durable ID/history, expected response, withdrawal, and recovery are all specified. |
| AX-6 | Selection, edit/review, authorization, execution, record, and business response remain distinct. |
| AX-7 | Canonical business-confirmation boundary is beside send and repeated in the record. |
| DS-1 / DS-2 | Astryx owns forms, controls, dialogs, disclosure, status, and behavior; Tailwind owns layout only. |
| DS-3 / DS-10 / DS-11 | Semantic `aeTheme` roles only; no route palette and no unsupported dark-mode claim. |
| DS-4 / DS-5 / DS-6 | Full control states, Astryx motion tiers, and reduced-motion immediacy apply. |
| DS-7 / DS-8 | Central status presentation and shared semantic timestamp are mandatory. |
| DS-12 | One `FormLayout` error/submission contract; pending submission disables edits and duplicate commit. |
| DS-13 / DS-14 | Every empty has one meaning; skeleton preserves field/record geometry; errors retain context. |
| DS-15 | 44px targets, non-color meaning, mono IDs/times, responsive 320/375/200% behavior, and no illustrative authority. |
| WEDGE R1 | Exactly one business, one use, one child action, one record; no R2–R4 controls or claims. |
| A5 | Every enforced tuple field has an explicit customer-visible projection and invalidation behavior in the mapping table. |
| A6 | All shared fields render field-by-field; changed/sensitive fields are emphasized; mobile consequence facts remain adjacent to the named CTA. |

## Anti-slop check

- No side-stripe borders, gradient text, glass, hero metrics, identical card grids, or decorative modal use.
- The send confirmation is the page, not a dialog. The only dialog is earned by destructive withdrawal semantics.
- No nested cards; semantic sections and definition lists carry the exhaustive readback. A bounded card is permitted only for the pending operation/record when it clarifies state.
- No AI glow, fake progress, confetti, optimistic checkmark, fake quote, fake response deadline, fake provider, or protocol theatre.
- Color strategy is restrained: ink/slate convey hierarchy, warm canvas/white surface convey layers, and eucalyptus identifies the selected notification choice and primary named action only.
- Category-reflex check passed: this is not a generic checkout, marketplace lead form, or chat confirmation bubble. Its visual structure follows a legal-like field readback and written handoff record because a person is granting narrow data-sharing authority on a phone.
- R1 guardrail passed: no recipient selector, multi-business send, response comparison, quote table, procurement/vendor language, order, booking, payment, wallet, settlement, or future disabled control.