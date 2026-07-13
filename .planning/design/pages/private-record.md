# `/t/:threadId?k=` record projection | Your record <!-- stupid-shit: S1 -->

## Register & scene

**Register:** product.

**Scene:** A customer opens a private link from an email on a phone in mixed indoor light, needs to identify what changed in seconds, then safely withdraw or review a business reply without exposing the link key.

Use a restrained light product scene: warm canvas, one white reading surface, ink content, slate metadata, and eucalyptus only for the primary current-state action. Functional status tones remain centralized and text-first. The page must feel like a durable record, not chat and not an inbox dashboard.

## Job & IA position

**One job:** let the link holder read the durable state of one customer record, orient to what changed since the last visit, and take the single valid next action.
<!-- tx-lens -->
The record is the customer’s stable transaction receipt in product language: it always identifies the event with a stable `Record ID`, states what the record proves and does not prove, and keeps later replies as separately attributable events rather than rewriting what was sent.

- **Route class:** record-scoped projection of the canonical thread route under IA-1. Possession of the validated bearer key is an access method that grants only the scope encoded by the private-link object; it does not create a separate route or object.
- **Route blueprint:** `JOURNEY.md` §6.3 and `CONVERSATION-ITEM-SPEC.md` §7: validate without revealing another thread; render the thread's `#record` region at the newest meaningful response; show identity, one selected business, sent payload, record IDs/timestamps, delivery state, original business reply, key posture, and exactly one primary action.
- **Entry points:** event-specific email, optional SMS or browser notification, copied `/t/:threadId?k=#record` link from the sent record, or a saved bookmark.
- **Exits:** in-page anchors to permitted decision context, the selected business’s published contact path, a safe redacted summary, close the request, or start a new ask. A reply link targets the exact item in this thread.
- **No authentication interruption:** a valid bearer link opens directly. Account sign-in is not inserted before reading or withdrawal.
- **Access boundary:** `threadId` alone grants nothing beyond an independently established visibility posture. Invalid, expired, revoked, malformed, and unknown keys return one non-enumerating access result.
- **Legacy redirect:** `/i/:threadId?k=` MUST return `301` to `/t/:threadId?k=`, preserving the key and valid fragment under the unchanged key-safety rules. <!-- stupid-shit: S1 -->

## Layout

**Skeleton:** IA-6 focused record region within `/t/:threadId`: header plus `max-w-3xl` single column, `px-4 md:px-6`. In key-granted entry this projection is read-focused and does not expose the general thread composer. The sticky element is at most a compact pending-action bar on desktop; on mobile it stays in normal flow to preserve context.

### Desktop

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AE   YOUR RECORD                                   Private link · valid       │
├──────────────────────────────────────────────────────────────────────────────┤
│                 centered rail, max 768px                                  │
│                 ┌────────────────────────────────────────┐                   │
│                 │ Need summary                           │                   │
│                 │ Business · current status · updated    │                   │
│                 │ Record ID · link validity/retention    │                   │
│                 └────────────────────────────────────────┘                   │
│                 ┌ What changed since your last visit ───┐                   │
│                 │ Business replied at <time>             │                   │
│                 │ [Jump to reply]                        │                   │
│                 └────────────────────────────────────────┘                   │
│                 ┌ Request sent event ─────────────────┐                    │
│                 │ exact submitted summary               │                    │
│                 │ delivery history · boundary           │                    │
│                 └────────────────────────────────────────┘                   │
│                 ┌ NEWEST MEANINGFUL ITEM, expanded ─────┐                    │
│                 │ original business reply               │                    │
│                 │ Organized by AE (separate, if real)    │                    │
│                 │ missing facts · next transition        │                    │
│                 │                           [PRIMARY]     │                    │
│                 └────────────────────────────────────────┘                   │
│                 Earlier record [Expand]                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile, ≤375px

```text
┌───────────────────────────────┐
│ Your record                   │
│ Private link · Valid          │
├───────────────────────────────┤
│ Need summary                  │
│ Business                      │
│ Waiting for business          │
│ Updated <time>                │
│                               │
│ What changed                  │
│ Business replied at <time>    │
│ [Jump to reply, 44px]         │
│                               │
│ Sent · request event          │
│ one-line outcome · <time>     │
│ [View exact details]          │
│                               │
│ Business reply, expanded      │
│ Original message              │
│ Organized by AE (separate)    │
│ boundary / next transition    │
│ [Secondary, 44px]             │
│ [Primary, 44px]               │
│                               │
│ Link and retention details    │
└───────────────────────────────┘
```

No conversation composer is present by default. It appears only for the bounded C5 turn authorized by an owner `Reply` or `Request clarification`, and it MUST remain scoped to that exact owner item; any scope-changing response exits to a separately reviewed proposal/permission flow.
<!-- sim: G2 -->
### Export payload-preview wireframe

Every export begins here; no file, print dialog, or clipboard write occurs before this visible preview.

```text
┌──────────────────────────────────────────────────────────────┐
│ EXPORT PREVIEW                                               │
│ Sanitized share · On                                         │
│ Record ID  REC-…        Sent  13 Jul 2026 14:08 AEST         │
│ Generated  13 Jul 2026 14:22 AEST                            │
├──────────────────────────────────────────────────────────────┤
│ INCLUDED                                                     │
│ ☑ Need summary       ☑ Business       ☑ Sent message         │
│ ☑ Delivery events    ☑ Business reply                        │
│ SENSITIVE — OFF BY DEFAULT                                   │
│ ☐ Name               ☐ Email          ☐ Phone                │
│ ☐ Exact address      ☐ Acting-for authority statement        │
├──────────────────────────────────────────────────────────────┤
│ PAYLOAD PREVIEW                                              │
│ To: {business} · Sent: <timestamp>                           │
│ Request: {selected sanitized fields, exactly as exported}    │
│ Reply: {original reply or “No reply received”}               │
│                                                              │
│ This record proves what was sent, when, to whom, and the reply recorded. │
│ It does not prove acceptance, availability, booking, confirmation, or    │
│ that the work happened.                                                   │
├──────────────────────────────────────────────────────────────┤
│ [Cancel] [Copy summary] [Print] [Download PDF]               │
└──────────────────────────────────────────────────────────────┘
```

Record IDs and all source/generated timestamps use labelled mono text with tabular numerals. On mobile, field controls, preview payload, proof statement, then actions stack in that DOM order; the exact preview remains visible before the commit action.
<!-- sim: G2 -->
## Controlled export contract

- Every valid `Your record` MUST expose exactly `Download PDF`, `Print`, and `Copy summary`, whether pending, replied, or terminal. An action MUST first open the visible `Export preview`; it MUST NOT directly download, print, or copy.
- `Sanitized share` MUST be on by default. It MUST exclude private-link URLs and access keys, internal-only identifiers/evidence, and all personally identifying information except fields the customer deliberately selects. Sensitive fields MUST be off by default and MUST require individual explicit inclusion; a bulk “include all” control is prohibited.
- The preview MUST show the exact payload in export order, including the selected field labels and values, business reply or `No reply received`, record ID, source timestamps, and generation timestamp. The resulting PDF, print document, or copied summary MUST match the previewed selection and mode; a record revision after preview MUST invalidate commit and require a refreshed preview. Operator/export projections MAY additionally include the canonical content digest; customer-facing preview and artifact copy MUST NOT name it.
- <!-- tx-lens --> The visible record, preview, and artifact MUST use one proof-boundary statement: `This record proves what was sent, when, to whom, and the reply recorded. It does not prove acceptance, availability, booking, confirmation, or that the work happened.` A missing reply MUST render `No reply received`, not imply a reply was proved. Delivery, a reply, and the artifact MUST NEVER be called confirmation.
- Export generation MUST occur only after private-record access validation. The raw access key MUST never enter preview state, artifact bytes, filenames, print headers/footers, clipboard content, logs, analytics, or export URLs. Cancel returns focus to the invoking export action and produces no artifact.
- An acting-for authority statement MAY be selected only as its own sensitive field. Its inclusion MUST preserve the exact named relationship posture and affirmation stored with the authorization record; it MUST NOT pull other subject context into the artifact.
- Astryx `Dialog` or an in-flow disclosure MAY own the preview, but it MUST be a real labelled region with keyboard-reachable field controls, focus containment when modal, visible sanitized-mode state, error recovery, and no hidden default inclusions.

<!-- journey-system: A2/C3 -->
## One-route access projection <!-- stupid-shit: S1 -->

`/t/:threadId` is the sole canonical customer route. This document specifies the record region rendered within that route when the access posture is `key-granted` and focus is the record.

| Access posture | Visible projection | Write ownership |
|---|---|---|
| `key-granted` | Sent record, delivery observations, business replies, update preferences, withdrawal, retention, and only prior context explicitly encoded in the private-link scope | The projection MUST NOT originate, copy, re-derive, or dual-write external state. Only purpose-bound update-preference writes, withdrawal commands, and the C5 bounded-message command are accepted; accepted commands append through the shared thread-event owner. |
| `visibility-granted` | Participant-safe chronological thread content allowed by the visibility object, including the same record and reply items when in scope | Thread events own all customer-side appends; confirm flow uses the same owner. |

- The key is an access method, not a second route. Both postures render shared content by stable item identity from one projection version.
- `#record` and `#item-{id}` are ordinary in-page anchors after access validation. They replace reciprocal-route links; an anchor is rendered only when its target is within the current access scope.
- One footer version marker uses labelled tabular mono text (`data-numeric`). A version mismatch MUST surface stale-state recovery rather than present the projection as current.

<!-- journey-system: B2/C5 -->
## Bounded customer reply

The key-granted record projection MAY expose a text composer only for a turn authorized by the immediately preceding owner message. It MUST NOT behave as an open chat composer. The accepted command appends one versioned `user_text` item to the shared thread; the owner detail and this record region MUST project the same item identity.

| Owner turn | Customer turn legal from this record | Required binding | After submission |
|---|---|---|---|
| `Reply` | At most one bounded text-only follow-up to that owner reply | `answersItemId` MUST identify that exact owner reply | Composer locks for that owner item; a second follow-up is illegal unless the owner replies again. |
| `Request clarification` | One text-only answer to the typed question | `answersItemId` MUST identify the exact `clarification_prompt` containing the displayed question | The answer appends as `user_text`; the prompt moves only through its registered transition. |
| `Decline`, `Snooze`, `Close`, delivery-only update, or no owner turn | No customer reply composer | None | Show the state-derived next action only. |
| Any wish that changes fields, purpose, scope, attachments, or business | No reply on this authorization | Fresh proposal and permission cycle | Exit to the decision record/review flow; NEVER stretch the prior consent. |

- A bounded follow-up MUST contain text only, MUST preserve the sent purpose, recipient, disclosed fields, and scope, and MUST require no new consent precisely because none of those changes. Attachments, structured field additions, recipient changes, and silent scope inference are forbidden.
- The owner MUST see the customer text in the same owner detail thread, labelled as a customer answer or follow-up, linked to the triggering owner item by `answersItemId`, with timestamp and shared item ID. It MUST NOT appear as a new request, mutate the sent record, or reset owner disposition/history.
- A scope-changing wish MUST preserve the current episode as evidence and start a fresh proposal/permission cycle. At R1 it MUST remain a sequential one-business act; no fan-out or multi-recipient affordance may appear.

<!-- journey-system: B4/C4 -->
## Return posture and notification re-entry

At send, the system MUST compute exactly one `returnPosture` and this page MUST project it:

| Posture | Qualification | Required record treatment |
|---|---|---|
| `deliverable-channel` | A qualifying email was already required/shared, or the customer chose SMS or browser updates | Show the purpose-bound channel and the events it covers; NEVER imply guaranteed delivery. |
| `user-held-private-link` | The customer copied the private link or chose no updates | State link validity/retention and that the customer must keep the link. |
| `same-session-only` | Neither a deliverable channel nor a user-held link is established | In the same send session, show the explicit acknowledgment: `If you close this page without saving your link, you may not be able to see the reply.` It MUST be non-blocking, MUST NOT gate send, and MUST NOT be silently dismissed before acknowledgment. |

- A notification entry MUST consume the canonical deep-link envelope: exact event, purpose, cessation reference, and a signed item target bound to the current private-link key version. Only after access and signature validation may the page expand and focus that item.
- An expired target, rotated key-version binding, invalid signature, missing item, or inaccessible item MUST degrade to the record top. The record MUST remain usable and MUST show an orientation banner derived from the key-scoped visit cursor describing what changed since the last visit; it MUST NOT disclose the failed target or guess what is new.

## Section anatomy

1. **Record header**
   - **Content:** `Your record`; need summary; selected business; friendly current state; last meaningful update; child record ID; link validity; sharing posture; retention/expiry state.
   - **Data source:** route loader after key validation; private-link access object; current `receipt`/latest primary item projection; retention object state.
   - **Astryx:** `Heading`, `Text`, centralized `AeStatusBadge`, shared `AeTimestamp`, `Button`, `DropdownMenu`. Never put `k` in displayed IDs.
2. **Return-visit orientation**
   - **Content:** one `What changed since your last visit` summary, exact event label and time, plus `Jump to {reply|delivery update|problem}`. If no participant-safe visit cursor exists, say `Latest update` rather than falsely claiming newness. On first visit: `Latest update since this record was created`.
   - **Data source:** key-scoped, privacy-safe last-view cursor or notification event reference, compared to item semantic revision. It must not require analytics containing the key.
   - **Astryx:** `Banner`, `Button`/AE `RouterLink`. Durable orientation, not a toast.
3. **Original sent record**
   - **Content:** one selected business; exact submitted summary and disclosed contact fields; purpose; child record ID; sent timestamp; immutable submitted scope reference; current delivery history; expected response-window basis; boundary copy. When the authorization records acting for another person, show `Acting for`, the named relationship posture, the exact affirmation, and affirmed timestamp as a visibly separate sensitive block.
   - **Data source:** first-class child receipt and referenced delivery observations projected as `receipt` plus delivery `status_note`/`error`.
   - **Astryx:** `Card` for the bounded record, `Heading`, `Text`, `Badge`, `Collapsible` for exact fields/history. No nested cards.
4. **Current update**
   - **Content:** newest meaningful delivery status, failure, withdrawal, or business reply. A reply begins with the customer-facing attestation line `Reply received from {business}, {timestamp}`, then shows the original business message and source/channel, followed by an independently labelled `Organized by AE` section only when a durable normalization exists. Missing quote, timing, availability, or conditions read `Not provided`.
   - **Data source:** linked `business_response`, status, or error item; response attestation metadata from the authenticated owner session; normalization revision with provenance. Never synthesize an evaluation.
   - **Astryx:** semantic `<article>`; `Card` only for business-origin response as a bounded evidence record; `Heading`, `Text`, `Badge`, `Collapsible`, `Button`.

<!-- tx-lens -->
Every valid record header MUST expose its stable `Record ID`, and the original sent-record section MUST carry the same proof-boundary line used by exports. Business replies are separately attested events: customer projections render `Reply received from {business}, {timestamp}`; authorized operator/export projections MAY expose the attesting session reference and response content digest.
5. **Pending action**
   - **Content:** while awaiting a business reply, expected window and its basis, the next transition, and exactly one primary action. If withdrawal is supported and still effective: `Withdraw this request`. Secondary safe path: `Contact {business} another way` or `Return to decision record`, chosen by state, not both as competing primaries.
   - **Data source:** receipt action registry, delivery state, temporal clock, withdrawal capability and cutoff.
   - **Astryx:** `Button`; destructive/irreversible withdrawal uses Astryx `Dialog` after inline explanation; pending mutation uses `aria-busy` and disables duplicates.
6. **Earlier record**
   - **Content:** chronological, read-focused list of earlier participant-visible items. Episode grouping keeps permission decision and record together while preserving IDs, states, links, and chronology. Latest meaningful item is expanded; settled low-consequence material is collapsed.
   - **Data source:** key-scope-filtered item projection. No admin/private run evidence.
   - **Astryx:** `<ol>`, semantic `<article>`, `Collapsible`, `Heading`, `Text`, `Badge`.
7. **Notification preference**
   - **Content:** selected channel; the named event and purpose it covers (for example, `Email — business replies and delivery problems for this request`); saved-at time; explicit `Stop updates` control. Saving failure preserves the prior choice and shows `We couldn’t save your update choice. Your previous choice is still active.` Browser permission is requested only after the person chooses that channel; unavailable channels are absent or truthfully disabled with a reason. Notification choice never gates access to the record.
   - **Data source:** receipt/thread notification-preference projection and already-authorized channel availability, as required by `JOURNEY.md` §6.2 and WEDGE-LADDER A4. Preferences are purpose-bound to this record; no marketing consent or inferred channel is added.
   - **Astryx:** `RadioGroup` when channels are exclusive, `Checkbox` only when independently selectable, `FormLayout`, shared `AeTimestamp`, `Button` for `Save update choice` and `Stop updates`, and `Banner` with `role="alert"` for save failure.
8. **Link and retention details**
   - **Content:** possession grants access; do not forward unless intended; validity end; revoked/rotated posture; retention class in customer language; payload/reply expiry where applicable; safe loss/recovery route; what durable evidence may remain after content expiry, without exposing internal hashes.
   - **Data source:** private-link and retention objects, legal-hold posture only when participant-visible and applicable.
   - **Astryx:** `Collapsible`, `Text`, `Badge`, `Button` for safe link rotation/recovery only if source supports it.

### Item type to section mapping

| Item type | Private-record section/anatomy | Render condition | Collapse and action rule |
|---|---|---|---|
| `user_text` | **Your submitted details** or later customer-authored update | Only fields/items allowed by bearer scope | Settled history may summarize; original submitted content remains reachable. |
| `clarification_prompt` | **A detail was requested** | Only when part of the externally observable record and access scope | When active, render the typed question and the bounded answer composer with `answersItemId` fixed to this prompt; settled answer remains linked and reachable. |
| `work_record` | **How AE prepared this** | Rare, only participant-safe checks relevant to sent scope | Settled summary one disclosure away; no raw tools or reasoning. |
| `shortlist` | **Earlier options** | Only if private-link scope explicitly includes pre-send decision context | Collapsed by default; not required for record validity. |
| `comparison` | **Earlier comparison** | Only saved published-fact comparison in scope | Never convert one business reply into comparison mode. |
| `proposal` | **Request summary before review** | If retained and in access scope | Superseded summary may collapse; never substitutes for permission evidence. |
| `permission_request` | **What you allowed** | Always when its send is represented | Never hide; may episode-group with record while preserving ID/state/deep link. |
| `receipt` | **Your record** | Always for a valid R1 private record | Never hide; one business; `Sent` is only a status/event label and customer copy never calls the object a receipt. |
| `business_response` | **Business reply** | When a correlated response exists | New linked evidence, original message inspectable, never hide or summarize away. |
| `error` | **Delivery problem** or **Status unavailable** | When authoritative failure/unknown is current or historically consequential | Unresolved item expanded with exactly one recovery. |
| `status_note` | **Progress update** | Delivery, waiting, withdrawal, no-reply, or closure event in scope | Consequential terminal evidence remains reachable; routine notes may group. |

### Transition-registry states rendered

The private record is a projection, not a new lifecycle. It renders these legal registry tuples when present and key-authorized:

| Item | Rendered legal states and edges |
|---|---|
| `user_text` | persisted `submitted→settled|stopped`; draft is omitted unless the access contract explicitly exposes a recoverable draft. |
| `clarification_prompt` | `needs_input→submitted→settled`, stop/resume edges only when a source-supported continuation action exists. |
| `work_record` | `understanding→working→settled`, active to `failed|stopped`, and registered recovery to working. Usually historical/read-only here. |
| `shortlist` | `working→answer_ready→settled` and failure/recovery, only if the link includes decision context. |
| `comparison` | `working→answer_ready→settled` and failure/recovery, only for published-fact decision context. Response evaluation remains gated separately. |
| `proposal` | `proposal→settled|stopped|failed` and registered recovery, if retained in scope. |
| `permission_request` | `awaiting_confirmation→executing→settled|failed`, refusal to `stopped`, and `failed→awaiting_confirmation`. This surface normally reads the settled decision; it never silently re-authorizes. |
| `receipt` | `executing/delivery_retrying` may remain or resolve to `settled/delivery_failed|business_unavailable|user_canceled|status_unknown`; unknown may return to retrying or resolve to delivery failed. Other terminal facts append items. |
| `business_response` | `submitted→needs_input|answer_ready`; `needs_input→submitted`; `answer_ready→settled`. |
| `error`, non-delivery | `failed→stopped`; recovery creates/returns to the proper recovered item, never mutates error into success. |
| `error`, delivery-caused | delivery failure, business unavailable, or status unknown may transition from `failed` to `stopped` with the fact preserved; recovery creates receipt/status projection. |
| `status_note`, base | submitted, understanding, working, executing, settled, and stopped edges exactly as the registry permits. |
| `status_note`, delivery | retrying to delivery failed/status unknown; retrying to stopped/user canceled; business unavailable emitted directly as settled. |

Customer-facing derived waiting labels such as `Waiting for the business`, `No reply received`, or `Withdrawn` must bridge to the authoritative item state in the same section. `settled` does not mean the real-world service is complete. `confirmed` requires a business-origin assertion.

## States

### Loading

Render a geometry-preserving skeleton for the header, orientation banner, sent-record block, one expanded current update, one collapsed history row, and link details. Do not put the key, business name, reply shape, or success claim into speculative skeleton copy. The server validates access before returning participant content.

### Empty

Select exactly one DS-13 meaning:

- **Resource not found / access denied / expired or revoked link:** one non-enumerating state, “This record is not available from this link.” Actions: `Request a new link` only when a safe recovery channel is already proven, otherwise `Start a new ask`. Never distinguish wrong thread from wrong key.
- **Temporarily unavailable:** “Your record could not be loaded right now. This does not change the last recorded status.” Actions: `Try again` and `Return later`.
- **No business reply yet:** this is not empty. Render the sent record, current delivery state, expected response window and basis, boundary, and one pending action.

### Error

Retain all last-authoritative record content. Put an Astryx `Banner` within the affected section. Known failures receive one recovery: `Check status`, `Contact {business} another way`, `Request a new link`, or an in-page return to decision context when visible. `status_unknown` says “Current delivery status is unavailable” and never becomes delivery failure. No raw errors.

### Return visit

- Validate the key, then identify the newest meaningful key-visible semantic revision.
- If a notification supplied a signed item target, expand and focus it after validation.
- Otherwise compare against a key-scoped last-view cursor stored without the raw key. If unavailable, use `Latest update`, not “New”.
- Scroll directly to the newest meaningful response/update, not the top. Preserve a visible `Back to record summary` link.
- Mark only genuinely unseen semantic changes. Hydration, time ticks, retry counters, and formatting changes are not new.

### Pending and withdrawal

While delivery or reply is pending, render the record, authoritative status, last observed time, response-window basis/deadline, expected responsible party, and one valid action. If withdrawal is supported:

1. `Withdraw this request` opens consequence review explaining whether delivery already occurred, what notifications cease, and that completed external action/evidence cannot be erased.
2. Named commit: `Withdraw request from {business}`. Secondary: `Keep request open`.
3. Disable with `aria-busy` while the idempotent command resolves.
4. Success appends `stopped/user_canceled` status evidence, sets customer label `Withdrawn`, begins notification cessation, and preserves the sent record.
5. If the business already replied or withdrawal can no longer affect the external path, disable or remove the action with a visible reason. Never imply recall or deletion of an already delivered message.
<!-- sim: G10 -->
### Customer-declared out-of-band closure

- While a record is pending or awaiting a reply, the customer MUST have the terminal action `I handled this another way`. It MUST remain distinct from `Withdraw this request`, business decline, delivery failure, business no-reply, and owner close.
- Before commitment, inline consequence copy MUST say that AE will stop notifications and follow-up for this record, preserve the sent record and any reply already received, and record the customer’s stated reason. Named commit: `Close record — handled another way`; secondary: `Keep record open`.
- Commitment MUST append a customer-authored terminal event with reason code `handled_another_way`, optional bounded reason text, actor, and timestamp; set the customer label `Handled another way`; and start the notification-cessation clock. It MUST NOT rewrite delivery or reply evidence and MUST NOT imply the business declined, failed to reply, accepted, or confirmed anything.
- After cessation is authoritative, no further notification for this episode may be claimed or dispatched. A late externally observed reply remains append-only evidence but MUST NOT reopen the episode or resume notifications.
- Reopening is prohibited. Continuing the need MUST create a new episode under C7 with a fresh proposal and fresh one-use authorization; the original closure and stated reason remain reachable.

### Business reply and evaluationMode

- A 1-of-1 R1 response sets `evaluationMode='single-response-review'`. Render original reply, business-supplied facts, missing fields, and user criteria. No comparison columns or “waiting for more responses”.
- `evaluationMode='multi-response-comparison'` is unreachable in R1 because the request contains one business. If historical/internal data claims otherwise, fail the projection safely rather than exposing R2/R3 UI.
- No durable evaluation source means show the reply only. Never invent a normalized worksheet.

### Visibility and retention as object state

Visibility is not a banner preference. The loader projects `linkStatus` (`valid`, `expired`, `revoked`, `rotated`), validity times, sharing posture, access scope, `retentionClass`, payload/reply `expiresAt`, and legal-hold exception where participant-visible. Expiry immediately revokes access. Redaction/erasure replaces eligible content with a truthful tombstone while preserving only permitted record lineage. The UI never promises full deletion when required evidence remains.

### Zero-JS and SEO posture

All participant-visible settled content server-renders after access validation. Withdrawal and notification-preference changes use normal POSTs with CSRF/admission and idempotency protection; native disclosure remains usable. `/t/:threadId` is `noindex, nofollow`, absent from sitemap, and canonical metadata excludes `k`. Key-granted responses are never prefetched by unrelated public pages. Referrer policy is `no-referrer`; outbound links receive safe referrer handling. The page title is generic: `Your record | Agentic Economy`.

## Interactions

- **Primary action:** exactly one for current state. Pending may use `Withdraw this request` if effective; reply uses `Review business reply`; delivery failure uses `Contact {business} another way`; status unknown uses `Check status`; terminal record uses an in-page return to permitted decision context. `I handled this another way` is a separate customer terminal action while eligible; export actions are document utilities and never compete as the state-derived primary.
- **Withdrawal depth:** AX-2 modal only because it changes externally observable pending state and notification purpose. Inline copy precedes it; dialog is not the first explanation. It names object, business, already-completed facts, retained record, and cessation effect.
- **Read interactions:** disclosures for exact sent fields, delivery history, earlier episodes, original reply, and link/retention details. Deep links expand and focus exact items.
- **Bounded reply composer:** absent unless the current owner item authorizes the C5 turn. Owner `Reply` permits one text-only follow-up bound by `answersItemId`; `Request clarification` permits one text-only answer to the displayed question bound by `answersItemId`. Any scope-changing wish starts a fresh proposal/permission cycle; `Ask business to clarify` is never inferred from the prior authorization.
- **Notification preference:** changing or stopping updates affects only the named event/purpose for this record. Save locks duplicates, preserves the prior saved preference on failure, and focuses the failure Banner or updated preference summary. `Stop updates` is always explicit when an active optional preference exists.
- **Export:** `Download PDF`, `Print`, and `Copy summary` always open the G2 payload preview. `Copy private link` is separate, clearly says possession grants access, and uses the current valid URL only.
- **Keyboard/focus:** natural document order; actions follow facts; dialog traps and returns focus through Astryx; successful withdrawal focuses appended status heading; failed withdrawal focuses alert/recovery. No keyboard-only controls.
- **Scroll:** return orientation may scroll once on initial validated navigation. Background changes never force-scroll; `New update below` appears if the reader moved away.

### Key-safety rules

1. The raw `k` value is never written to analytics, event properties, logs, traces, error reports, support refs, DOM data attributes, local/session storage, service-worker caches, page title, headings, canonical/alternate metadata, Open Graph tags, clipboard summaries, or referrer-bearing outbound URLs.
2. Analytics receive only a nonreversible access-event classification and server-issued record/event IDs already safe for that purpose. Strip query before client analytics initializes. Prefer no client page-view event on this route unless the sanitized path contract is proven.
3. Server stores only key hashes. Validation uses constant-time comparison where applicable. Rotation and revocation invalidate prior keys immediately.
4. Page title remains generic. The business name and need do not enter document title or notification preview unless the channel’s privacy contract explicitly permits it.
5. History replacement removes `?k=` from the visible URL only after server validation and establishment of an equivalent secure session-bound access context. Never remove it merely for aesthetics and then lose reload access.
6. Outbound navigation uses `Referrer-Policy: no-referrer`; no third-party embeds, pixels, fonts, previews, or resources receive the URL.
7. Invalid-key responses are non-enumerating and cache-safe. Private responses use no-store/private cache controls appropriate to the runtime.

## Copy voice

- **Headline:** `Your record`.
- **Orientation:** `What changed since your last visit` only when proven; otherwise `Latest update`.
- **Key labels:** `Need`, `Business`, `Sent`, `Current status`, `Business reply`, `Original message`, `Organized by AE`, `Not provided`, `Delivery history`, `What you allowed`, `Updates`, `Channel`, `Events`, `Purpose`, `Stop updates`, `Link and retention details`, `Record ID`.
- **Pending boundary:** “Delivery status is not business acceptance. The business confirms any next step.”
- **Record boundary:** “Sent never means confirmed. The business confirms its quote, timing, availability, and whether it can help.”
- **Proof boundary:** `This record proves what was sent, when, to whom, and the reply recorded. It does not prove acceptance, availability, booking, confirmation, or that the work happened.`
- **Reply attestation:** `Reply received from {business}, {timestamp}`.
- **Withdrawal copy:** “Withdrawing stops AE’s pending follow-up and notifications where possible. It cannot erase a message already delivered or the record of what happened.”
- **Out-of-band closure:** `I handled this another way`; committed state `Handled another way`.
- **Export labels:** `Export preview`, `Sanitized share`, `Download PDF`, `Print`, `Copy summary`, `Cancel`.
- **Link safety:** “Anyone with this link can read the information it allows. Keep it private.”
- **Banned words checked:** customer copy does not expose bearer, key, token, item, receipt, tuple, lifecycle, provider, kernel, mandate, protocol, procurement, vendor, campaign, payment, wallet, booking, or multi-business response comparison. Technical “bearer key” appears only in this implementation spec, never the UI. No claims of guaranteed delivery, reply, acceptance, booking, quote, price, timing, availability, or confirmation by AE.

## Responsive

- `max-w-3xl`, `px-4 md:px-6`; no side navigation or right rail. Record composition and the one state-derived primary action never vary by entry path.
- At ≤375px, status and business identity remain above the fold. Record ID, delivery attempts, and retention details move into disclosures.
- Actions stack; primary last in DOM and visual order; targets at least 44px.
- Exact sent fields use definition lists, not horizontal tables. Long IDs wrap safely; business reply preserves words without horizontal overflow.
- At 200% zoom, no sticky action covers content. Pending action bar becomes in-flow.
- A 30-item history uses episode summaries but does not virtualize away focused/deep-linked evidence. Permission, record, replies, unresolved errors, withdrawal, and consequential terminal notes stay directly reachable.
- Test 320px, 375px, long business/need names, expired content tombstones, and 1-of-1 reply. Multi-response columns must never appear.

## Accessibility

- Page landmarks: `<header>`, `<main>`, record summary `<section aria-labelledby>`, history `<ol aria-label="Private record history">`, and `<footer>` only for privacy/retention links.
- Each item uses the shared article naming contract. Status text has centralized tone plus non-color shape/position.
- One polite live region announces validated semantic transitions once, deduplicated by `(item.id, lifecycle, deliveryState, semanticRevision)`. Withdrawal failure uses one alert. No countdown or timestamp announcements.
- On return, focus the newest meaningful target heading with `tabIndex=-1` after server content is ready. Respect the user’s scroll if they interact before the focus step.
- `Jump to update`, `Back to record summary`, disclosures, copy, and withdrawal are keyboard accessible. Collapsed content is not focusable.
- Timestamps use `<time dateTime>` and the shared formatter. IDs use labelled tabular mono text and remain selectable.
- Reduced motion makes focus scroll, expansion, insertion, and status changes immediate. No shimmer, smooth auto-scroll, typewriter, height animation, or decorative transitions.
- Business original message and AE organization have explicit headings and source labels so screen-reader users can distinguish provenance.

## Rule compliance

| Rule | How satisfied |
|---|---|
| LAW-2 | Stable record, item, and receipt identities survive return visits and state changes. |
| LAW-3, DS-7 | Friendly state and authoritative item state are bridged with facts, next transition, action, time, and ID. |
| LAW-4 | Delivery, reply, and business confirmation are separate; unknown is not failure; sent never means confirmed. |
| LAW-5, AX-3, AX-7 | Withdrawal and any new send name object/consequence; business confirmation boundary sits beside actions and record. |
| LAW-6 | The sent record remains reachable; replies and withdrawal append evidence rather than rewriting it. |
| LAW-7 | Read summary plus exact-detail disclosure; no third competing summary. |
| LAW-8, DS-13 | Invalid/expired/access-denied links are safely non-enumerating; temporary failure offers a valid recovery. |
| LAW-9, CH-7, CH-8 | Read-focused document spine, latest meaningful update expanded, quiet history, deep-link and scroll yield. |
| IA-1, IA-5 | Explicit key-granted access posture on the thread route; no sitemap/indexing/canonical key leakage. |
| IA-6, IA-7, IA-8 | Focused `max-w-3xl` record region within the canonical route; named gutters; route owns validation/loading/SEO only. |
| CH-1, CH-6, CH-9, CH-10 | Registry-only tuples, persistent failures, exactly one primary recovery, no reconnecting state. |
| CH-2, CH-3 | Original business content is separate from AE organization; no private run evidence or reasoning theatre. |
| AX-2, AX-5, AX-6 | Pending withdrawal uses consequence-appropriate review and lock; reply does not grant new authority. |
| DS-1–DS-6 | Astryx behavior, Tailwind layout, semantic tokens, full control states, Astryx motion tiers, reduced-motion immediacy. |
| DS-8, DS-14, DS-15 | Shared timestamps, geometry-preserving loading, honest labels, 44px targets. |
| Journey §6.3 | Validates privately, opens at newest meaningful event, shows sent scope/state/reply/key posture, one action. |
| Wedge R1 | Exactly one business and one child record; withdrawal is honest; no R2–R4 controls or comparison-of-responses. |
| Retention gate | Key hash, validity/rotation/revocation, telemetry stripping, payload/evidence separation, and expiry states are visible contracts. |

## Anti-slop check

- No side-stripe accents, gradient text, glass, hero metric, identical card grid, nested cards, modal-first explanation, AI glow, or decorative animation.
- The page is a reading record, not a generic inbox, chat transcript, CRM, or dashboard.
- Restrained color follows a hurried mobile return scene; eucalyptus marks only the current action/state. It does not default to dark “secure portal” styling.
- No category-reflex lock icon wallpaper, shield illustration, oversized privacy hero, or repeated defensive disclaimer. Privacy is expressed through object state, generic metadata, safe routing, and precise actions.
- Familiar headings, disclosures, status, timestamps, and buttons disappear into the task; provenance separation is the distinctive product quality.
