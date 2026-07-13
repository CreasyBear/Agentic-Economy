# `/t/:threadId` | Need and decision record

## Register & scene

**Register:** product.

**Scene:** A person returns to a long-running task on a laptop in ordinary daytime light, scanning a calm paper-like record for what AE understood, what changed, and the one action that is valid now.

Use the restrained AE product strategy: warm canvas around one white document surface, ink for content, slate for metadata, and eucalyptus only for the current selection, live route state, and primary action. Status meaning is text-first. No decorative color.

## Job & IA position

**One job:** let a person understand and continue one durable need from their original ask through a shortlist, and, only after they elect it, through one-business request handoff and reply. <!-- stupid-shit: S4 -->

- **Route class:** canonical durable thread under IA-1, with object-level visibility and access posture shown in the header. `visibility-granted` renders participant-safe chronological work; `key-granted` via `?k=` renders the record-scoped projection. The key is an access method, not a second route.
- **Route blueprint:** `PRINCIPLES.md` §10, `/t/:threadId`: durable document spine; query as title; named work phases; collapsible participant-safe work record; first-class post-send `Your record` region; next moves after settlement; visible access posture; shared continuation forks; R0 ends at **Your shortlist is ready** with no request-send chrome. <!-- stupid-shit: S4 -->
- **Entry points:** immediate navigation after submitting `/`; a saved thread URL; a deep link to `#item-{itemId}`; `Ask this business` from a settled R0 item; a safe return from a business page or evidence detail; or `/t/:threadId?k=#record` from send completion or a notification.
- **Exits:** open a business page, copy the shortlist, change criteria, close without choosing, jump to the in-thread record region after a send, or return to `/`. All preserve the thread revision. <!-- stupid-shit: S4 -->
- **Durability:** loader resolves canonical `threadId`; historical IDs redirect without losing item fragment. Missing, inaccessible, and expired objects use indistinguishable safe error language where disclosure could reveal existence.
- **Shared continuation:** when the visibility posture is link-shared and the visitor continues, create a fork with a new stable thread URL. Never mutate the shared source record. Key-granted visitors cannot expand beyond the scope encoded by the access object.

## Layout

**Skeleton:** IA-6 conversation skeleton, immersive `h-dvh` shell with pinned footer. The reading rail is `max-w-3xl`, centered, with `px-4 md:px-6`. Header and footer align to the same rail. Item blocks use `gap-6`; anatomy within an item uses `gap-4`. The footer is a composer only while the current legal state permits input. At terminal R0 it becomes a compact next-moves dock, not an empty composer.

### Desktop

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ top header, full width                                                      │
│ ← Ask   NEED AND DECISION RECORD   Private · expires 24 Jul   Share/More     │
├──────────────────────────────────────────────────────────────────────────────┤
│                 centered document rail, max 768px                            │
│                 ┌────────────────────────────────────────┐                   │
│                 │ Need title, 1–2 lines                  │                   │
│                 │ Updated <time> · Thread ID             │                   │
│                 └────────────────────────────────────────┘                   │
│                 ┌ Episode: Ask and understanding ────────┐                   │
│                 │ settled summary / Expand               │                   │
│                 └────────────────────────────────────────┘                   │
│                 ┌ Latest expanded item ──────────────────┐                   │
│                 │ status · actor · <time>                │                   │
│                 │ final-shape body slots                 │                   │
│                 │ evidence disclosure                    │                   │
│                 │ boundary / next transition             │                   │
│                 │ [secondary]             [PRIMARY]      │                   │
│                 └────────────────────────────────────────┘                   │
│                 Suggested next moves, only after settlement                  │
│                 [Change criteria] [Open business] [Ask this business]         │
│                               ↓ New update below                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ pinned footer, same 768px rail                                                │
│ [labelled composer................................] [Send]  [Stop while live] │
└──────────────────────────────────────────────────────────────────────────────┘
```

The document, not a dashboard frame, owns the page. Never add a right rail. A 30-item thread remains one chronological column; older low-consequence episodes collapse to labelled summaries while evidentiary items remain fully reachable.

### Mobile, ≤375px

```text
┌───────────────────────────────┐
│ ←  Record        Share · More │  56px header
├───────────────────────────────┤
│ Need title                    │
│ Private · Updated <time>      │
│ Thread ID (details)           │
│                               │
│ Ask and understanding         │
│ Matches found · 10:42         │
│ one-line outcome              │
│ [Expand]                      │
│                               │
│ Latest item, expanded         │
│ Status · <time>               │
│ Heading                       │
│ structured body              │
│ How AE checked this [Expand]  │
│ boundary / next transition    │
│ [Secondary, 44px]             │
│ [Primary, 44px]               │
│                               │
│ Suggested next moves          │
│ [full-width action]           │
├───────────────────────────────┤
│ [Composer.............] [Send]│
│ [Stop, while working]         │
└───────────────────────────────┘
```

At 320px and 375px there is no sticky side rail, no horizontal scroll, and no metadata row wider than two lines. Secondary metadata moves into a labelled disclosure. For a permission review, its compact consequence recap sits directly above the named send action.

## Section anatomy

1. **Thread header**
   - **Content:** need in the customer’s words as `<h1>`; friendly current status; last meaningful update; stable thread ID; visibility, sharing, key-independent expiry or retention posture; share and overflow controls.
   - **Data source:** route loader for thread identity/access projection; latest primary `ConversationItem` for status; thread visibility/retention object state.
   - **Astryx:** `Heading`, `Text`, `Badge` through centralized `AeStatusBadge`, `Button`, `IconButton`, `DropdownMenu`; shared `AeTimestamp` composition. Tailwind owns alignment only.
2. **Return orientation**
   - **Content:** on reload, one sentence naming the latest meaningful change and an in-page `Jump to update` control. On first view, omit this section. Never manufacture “new” from hydration.
   - **Data source:** route loader’s participant-safe last-view cursor compared with item semantic revisions.
   - **Astryx:** `Banner` only when there is a genuine unseen change; `Button` with link behavior. Not a toast.
3. **Chronological document spine**
   - **Content:** `<ol aria-label="Conversation history">`; items grouped visually by `episodeId`, never merged. Each item keeps title, status, actor where material, timestamp, known facts, next expected transition, object ID/deep link, evidence summary, and its own action boundary.
   - **Data source:** item projection, ordered by durable chronology; no route-authored transcript model.
   - **Astryx:** semantic `<article>`; `Card` only for bounded records such as a permission or receipt; `Heading`, `Text`, `Badge`, `Collapsible`, `Button`. Never `ChatMessageBubble` as the shell and never Card-within-Card.
4. **Participant-safe work disclosure**
   - **Content:** one “How AE checked this” disclosure containing named checks, sources, assumptions, limits, and source dates. Raw tools, private reasoning, timings, policy internals, and admin evidence never appear.
   - **Data source:** `item.evidence` with `detailAudience='thread_participant'`; detail link only if participant-authorized.
   - **Astryx:** `Collapsible`, `Text`, AE `RouterLink`.
5. **Suggested next moves**
   - **Content:** two or three context-specific actions only after the immediately preceding item has settled. Selecting one appends an ordinary `user_text` item or navigates to a named destination. At R0 terminal, allowed examples are `Change criteria`, `Open {business} page`, `Copy shortlist`, `Ask this business`, or `Close without choosing`. <!-- stupid-shit: S4 -->
   - **Data source:** transition registry plus current item actions. No model-authored action outside the registry.
   - **Astryx:** `Button` or link-styled `Button`; no suggestion chips masquerading as state.
6. **Your record region (`#record`)** <!-- stupid-shit: S1 -->
   - **Content:** first-class post-send region containing record summary, immutable sent scope, delivery history, latest reply or clarification, notification preference, return posture, retention, controlled export, and the one state-derived action. `private-record.md` is normative for its anatomy, attestation, key safety, export, and bounded reply behavior.
   - **Data source:** the same `receipt`, delivery, `business_response`, notification-preference, access, and retention projections already carried by the thread; no route-specific copy or second record model.
   - **Access:** `visibility-granted` visitors see record items only when their visibility scope permits them. `key-granted` visitors land here and see only the record-scoped projection encoded by the validated access object; the general thread composer and out-of-scope decision history remain absent.
   - **Focus:** send completion targets `/t/:threadId?k=#record`; notifications target a signed `#item-{id}` within this region. Failed or expired item focus degrades to `#record` with orientation, never to another route.
7. **Pinned footer**
   - **Content:** labelled follow-up composer when input is legal; exact interpreted context in a small disclosure; Send; and visible Stop while `understanding` or `working`. During streaming, show the current named phase in the final work-record anatomy. At R0 terminal, remove composer and show settled next moves. During permission execution, replace footer actions with the pending lock and safe return path. In key-granted record projection, omit this general composer; only the C5 item-bound composer may render inside `#record`.
   - **Data source:** current actionable item and transition-registry action projection.
   - **Astryx:** `FormLayout`, Astryx text input/textarea, `Button`, `Collapsible`; `aria-busy` on the owning item, not the whole page.
<!-- sim: G2 -->
### Settled decision-aid export

- Every settled decision aid MUST expose `Download PDF`, `Print`, and `Copy summary` as document utilities. Each action MUST first open a visible `Export preview`; no download, print dialog, or clipboard write may begin directly.
- The preview MUST show the exact ordered payload and individually selectable fields. `Sanitized share` MUST be on by default; private-link URLs/access keys, internal-only identifiers/evidence, and all PII MUST be excluded unless the customer deliberately selects that field. Sensitive fields MUST be off by default, with no bulk include control.
- The artifact MUST include the stable decision-record/thread ID plus source and generated timestamps in labelled mono text with tabular numerals. If a settled aid includes linked sent records or attributable business replies, each included record ID, recipient, sent/reply timestamp, and selected reply content MUST remain attributable; sequentially obtained replies MAY be compared when at least two are present, but export MUST NOT introduce fan-out or imply a multi-business send.
- Preview and artifact MUST state: `This artifact proves what was sent, when, to whom, and their reply. It does not prove acceptance, availability, booking, or confirmation.` For a pre-send decision aid, unavailable clauses MUST render explicitly as `Not sent` / `No business reply` rather than being omitted or converted into proof.
- The exported PDF, print document, or copied summary MUST match the previewed field selection and sanitized mode. Any semantic revision after preview MUST invalidate export and require a refreshed preview. Cancel produces no artifact and returns focus to the invoking action.

<!-- journey-system: A2/C3 -->
### One route and access projections <!-- stupid-shit: S1 -->

| Access posture | Visible content | Write ownership | Entry emphasis |
|---|---|---|---|
| `visibility-granted` | Participant-safe chronological decision history plus any record/reply items in that visibility scope | Thread events own all customer-side appends; confirm-and-send and accepted bounded-answer commands append through the same owner. | Requested item or chronological thread position |
| `key-granted` | Record-scoped content defined by `private-record.md`: sent record, delivery, reply, preferences, retention, and only encoded prior context | Purpose-bound preference writes, withdrawal, and C5 bounded-message admission only; accepted commands append through the thread-event owner. | `#record` or a signed `#item-{id}` inside it |

- `/t/:threadId` is canonical before and after send. Query `k` establishes key-granted access; it never changes route identity.
- In-page anchors replace reciprocal-route machinery. Shared items render by stable identity from one projection version and never by copied summaries presented as authority.
- Legacy `/i/:threadId?k=` permanently redirects to `/t/:threadId?k=` while preserving key and valid fragment under the key-safety contract. <!-- stupid-shit: S1 -->

<!-- journey-system: B5/C7 -->
### Sequential business episodes

`Choose another business` after a reply, decline, or no-reply is a new episode in the SAME thread. It MUST atomically create a new `RequestGroup`, fresh `proposal`, and fresh one-use authorization; every created item MUST carry the new `episodeId`.

- The new group MUST contain exactly one `RecipientBinding` at R1. It MUST NEVER add a recipient to, reopen, extend, or mutate the prior group, and the UI MUST NEVER render sequential groups as one multi-recipient act.
- Prior permission, sent record, delivery evidence, reply/decline/no-reply state, and item links MUST remain immutable and reachable under their original `episodeId`.
- The new proposal MUST start from explicitly carried-forward customer context, mark edits as a new decision, and require a complete new `Review what will be sent` plus `Send request to {business}` authorization. Prior authorization MUST NOT be reused.
- Exposure counters MUST be cumulative across all episodes in the thread, not reset per group. The action MUST show the applicable cumulative exposure boundary before the new authorization; counter updates occur only through the authoritative episode/group event.

### Item type to section mapping

| Item type | Customer-facing section/anatomy | R0 | R1 | Collapse and action rule |
|---|---|---:|---:|---|
| `user_text` | **Your request** or **Your update**; original wording and revision | Yes | Yes | Older settled text may summarize; selecting a next move creates this type. |
| `clarification_prompt` | **One detail needed**; question, why it matters, answer control | Yes | Yes | Active stays expanded; settled answer remains reachable. |
| `work_record` | **How AE is working**; named phase, interpreted facts, checks, assumptions, limits | Yes | Yes | Streams in final shape; settled work may summarize; Stop persists `stopped`. |
| `shortlist` | **Matches**; 3–5 candidate rows, match reasons, unknowns, coverage | Yes | Optional context | Selection changes context only; older settled shortlist may summarize. |
| `comparison` | **Compare listed facts**; criteria rows, provenance, unknowns, price posture | Yes | Only pre-send context | Candidate comparison is allowed at R0; never render response-comparison chrome at R1. |
| `proposal` | **Request summary**; one business, purpose, important unknowns, editable shared fields | No, until elected | Yes | Starts only after `Ask this business`; review does not send. Superseded drafts stay linked. |
| `permission_request` | **Review what will be sent**; exhaustive one-business readback and symmetric refusal | No | Yes | Never collapse; consequence recap touches named CTA. |
| `receipt` | **Your record**; receipt ID, one business, sent fields, delivery history, boundary | No | Yes | Never hide; may visually group with permission using `episodeId`, preserving both IDs/deep links. |
| `business_response` | **Business reply**; original message, business-supplied facts, linked record | No | Yes | New linked item, never receipt mutation; never hide or summarize away. |
| `error` | **What did not complete**; remaining truth and one cause-specific recovery | Yes | Yes | Unresolved failure stays expanded; no raw error text. |
| `status_note` | **Progress update**; scoped change and next expected transition | Yes | Yes | Consequential terminal notes remain reachable; routine settled noise may group. |

### Transition-registry states rendered

This route renders only tuples in `CONVERSATION-ITEM-SPEC.md` §6. It does not invent `reconnecting` or a generic pending state.

| Item | Rendered legal states and edges |
|---|---|
| `user_text` | `draft→submitted`, `draft→stopped`, `submitted→settled`, `submitted→stopped`, `stopped→draft` |
| `clarification_prompt` | `needs_input→submitted`, `needs_input→stopped`, `submitted→settled`, `stopped→needs_input` |
| `work_record` | `understanding→working`, either active state to `failed` or `stopped`, `working→settled`, and recovery `failed→working` or `stopped→working` |
| `shortlist` | `working→answer_ready→settled`; `working→failed→working` |
| `comparison` | `working→answer_ready→settled`; `working→failed→working` |
| `proposal` | `proposal→settled|stopped|failed`; recovery `failed|stopped→proposal` |
| `permission_request` | `awaiting_confirmation→executing→settled|failed`; refusal `awaiting_confirmation→stopped`; recovery `failed→awaiting_confirmation` |
| `receipt` | `executing/delivery_retrying` may remain active or reach `settled/delivery_failed|business_unavailable|user_canceled|status_unknown`; `settled/status_unknown` may recover to retrying or resolve to delivery failed. Other terminal facts append a new item. |
| `business_response` | `submitted→needs_input|answer_ready`; `needs_input→submitted`; `answer_ready→settled` |
| `error`, non-delivery | `failed→stopped`; recovery appends or replaces with its recovered item, never mutates failure into success. |
| `error`, delivery-caused | `failed/delivery_failed|business_unavailable|status_unknown→stopped` with the same delivery fact; recovery creates a receipt/status projection. |
| `status_note`, base | `submitted→understanding|settled`; `understanding→working`; `working→executing|settled`; `executing→settled`; any active state may become `stopped`. |
| `status_note`, delivery | retrying may resolve to `delivery_failed` or `status_unknown`, or withdrawal to `stopped/user_canceled`; authoritative `business_unavailable` is emitted directly as settled. |

`settled` is item-local. It never means the real-world job is complete. `confirmed` is shown only as a business-origin fact, never as a delivery lifecycle.

## States

### Loading

The route renders geometry-preserving skeletons: fixed header, two-line need title, one collapsed episode row, one expanded final-shape article with header/body/evidence/action slots, and the pinned footer. Skeletons do not imply item type, business identity, reply, or success. If an existing shell is already visible during pagination, keep it and skeleton only the prepended history rows while preserving scroll anchor.

### Empty

Use exactly one DS-13 meaning:

- **Resource not found:** “This record is not available.” Action: `Start a new ask`. Do not reveal whether an inaccessible thread exists.
- **Access denied:** use the same public sentence when disclosure would reveal existence; if authenticated context safely proves ownership, “You don’t have access to this record.” Action: `Return to Ask`.
- **Temporarily unavailable:** “Your record could not be loaded right now. Your saved work has not been replaced.” Actions: `Try again` and safe `Return to Ask`.

A newly created valid thread is not an empty state: it immediately contains the durable submitted `user_text` and final-shape `work_record`.

### Error

Keep the shell, need title if already known, and all last-authoritative items. Place an Astryx `Banner` beside the failed scope, with one operation-specific recovery: network `Reconnect and resume`, invalid input `Correct request`, no matches `Change criteria`, permission recording `Review what will be sent`, unknown send `Check status`. Never print raw errors. Failed and stopped items persist in chronology.

### Streaming

- Create item identity before work begins.
- Render header, status, named phase, body, evidence, and action slots immediately. Fill them in place.
- Allowed public phases are only those actually performed: **Understanding your request**, **Searching registered businesses**, **Checking capabilities and service area**, **Building the shortlist**, **Comparing stated facts**, **Preparing the review**, **Sending the authorized request**, **Checking delivery state**.
- Phase boundary changes announce once; token/chunk updates are silent.
- Stop is visible for active work. It transitions the same item to `stopped`, retains durable public facts, and offers `Resume` only where the registry permits.
- If the reader moves away from the live edge, scrolling yields immediately. Streaming continues without forced scroll and a `New update below` control appears. Activating it scrolls and focuses the updated heading.

### R0 terminal

The latest result settles with exact status **Your shortlist is ready**. It contains the interpreted need, evidence-bearing shortlist or named mismatch, decision-relevant comparison, portable brief, and exits. It renders zero request-send chrome until `Ask this business` is selected: no consent preview, send control, waiting state, response slot, or delivery language. <!-- stupid-shit: S4 -->

### R1 pending and reply

R1 is one business only. Proposal and review precede send. During send, the named CTA becomes disabled and busy; duplicates remain locked through uncertain readback. A durable record then shows sending, delivery observed, waiting, delivery failure, withdrawal, business unavailable, or status unknown without borrowing certainty. A business reply appends a linked item. The business confirms its quote, timing, availability, and whether it can help.

### Zero-JS and SEO posture

The server renders all settled items, current status, boundaries, and safe links. Forms use normal POST actions and idempotency keys; collapse controls default to readable expanded content when script is unavailable, except participant-safe details whose native disclosure remains operable. Streaming falls back to reload/status refresh. `/t/:threadId` uses `noindex, nofollow`; it is absent from sitemap and search navigation despite its IA route class. Canonical metadata excludes item fragments and all access/analytics parameters.

## Interactions

- **Primary action:** derived from the current actionable item, never page-global. Examples: `Add this answer`, `Review shortlist`, `Ask this business`, `Send request to {business}`, `Check status`, or `Review reply`. At most one primary action per item. `Download PDF`, `Print`, and `Copy summary` are settled-document utilities governed by the G2 preview contract, not competing primary transitions.
- **R0 Ask this business:** link-out/review depth. It appends or opens a `proposal`; it never contacts the business.
- **Bounded field choice:** inline confirmation with symmetric allow/refuse.
- **R1 send:** AX-2 depth 4. The permission item repeats one recipient, exact message/purpose, every shared field, expected next step, expiry/limits, and boundary. Named CTA: `Send request to {business}`. Secondary refusal: `Don’t send`. Commit changes to disabled `aria-busy`, then focuses the receipt heading or failure summary.
- **Destructive close/withdraw where irreversible:** Astryx `Dialog` only after inline options are exhausted. It names retained history, stopped notifications, and what cannot be erased; focus returns to invoker.
- **Stop:** visible beside live work, keyboard reachable, 44px. Label changes to disabled `Stopping…` while the registered stop command resolves. Success preserves the stopped item and offers state-valid recovery.
- **Episode grouping:** `Expand`/`Collapse` uses Astryx `Collapsible`. User overrides persist per thread. Never auto-collapse focused content. Deep links expand and focus the exact item.
- **Keyboard:** chronological Tab order; Enter submits single-line composer, Shift+Enter inserts newline in multiline input; Escape never silently stops or discards; `Home/End` retain browser semantics. No keyboard-only actions.
- **Focus:** submission retains composer focus unless clarification or permission review requires attention; background updates never steal focus. Prepending history preserves focused element and visual anchor.

## Copy voice

- **Headline:** the need in the person’s own words, not “Thread” or “Conversation”.
- **Key labels:** `Your request`, `AE understood`, `Assumption`, `Matches`, `Compare listed facts`, `How AE checked this`, `Request summary`, `Review what will be sent`, `Your record`, `Business reply`, `Your shortlist is ready`, `Progress`, `Problem`. <!-- stupid-shit: S4 -->
- **Named actions:** `Change criteria`, `Ask this business`, `Send request to {business}`, `Don’t send`, `Stop`, `Check status`, `Review reply`, `Download PDF`, `Print`, `Copy summary`, `Close without choosing`.
- **Boundary beside R0 comparison:** “This comparison uses listed facts. The business confirms price, timing, and availability.”
- **Boundary beside send:** “This sends your request once to {business}. AE will share: {field list}. The business confirms its quote, timing, availability, and whether it can help.”
- **Boundary in record:** “Sent never means confirmed. This record shows AE’s handoff. The business confirms any next step.”
- **Banned words checked:** customer-facing copy uses `request`, never the internal inquiry object name; it also avoids receipt, item, tuple, lifecycle, provider, kernel, clearance, mandate, protocol, lead, posting, procurement, vendor, campaign, wallet, payment, booking, checkout, or multi-business send language. No claim of “best”, live availability, guaranteed reply, booking, charge, acceptance, or confirmation by AE.

## Responsive

- **Breakpoints:** base through `md` uses full-width rail with `px-4`; `md+` uses `px-6`; content never exceeds `max-w-3xl`.
- Header labels shorten structurally on mobile; visibility and timestamp remain visible, while ID and secondary metadata move to disclosure.
- Actions stack vertically at ≤375px. Primary is last in DOM and visual order. Every target is at least 44px.
- Footer respects safe-area inset and does not obscure the final action or item fragment target.
- Comparison of published candidate facts transforms from columns into candidate sections with repeated criterion labels. No horizontal table at 320px.
- At 200% zoom, the pinned footer may become in-flow if it would leave less than half the viewport for reading.
- Validate with 30 mixed-state items, expanded never-collapse evidence, one active stream, one deep link, and one 1-of-1 business response. In 1-of-1, `evaluationMode='single-response-review'`; no response-comparison shell appears.

## Accessibility

- Header uses `<header>`; main is `<main>`; history is `<ol aria-label="Conversation history">`; footer composer is `<form aria-label="Continue this need">`.
- Each `<li>` contains `<article aria-labelledby="item-{id}-title" aria-describedby="item-{id}-status">`.
- One page-level polite live region receives deduplicated state announcements keyed by `(item.id, lifecycle, deliveryState, semanticRevision)`. Errors use one `role="alert"`. Never create per-item competing live regions.
- New persisted clarification, shortlist, comparison, proposal, permission, or reply announces once. Work chunks are silent; phase boundaries announce. Receipt event: “Request sent to {business}. The business has not confirmed it.”
- Status is text plus shape/position; color is supplementary. Timestamps use `<time dateTime>` and shared formatting. IDs use labelled tabular mono text.
- Deep-link targets receive `tabIndex=-1`, expand, and focus at heading. `New update below` is a real button and moves focus deliberately.
- Reduced motion reaches final collapse, reveal, status, and scroll state immediately. No shimmer, typewriter, smooth auto-scroll, height tween, bounce, or decorative entrance sequence.
- Collapsed content is not focusable or announced. Never collapse the focused item.

## Rule compliance

| Rule | How satisfied |
|---|---|
| LAW-2 | Stable thread and item identities exist before work streams; reload and redirects preserve history. |
| LAW-3, DS-7 | Every state shows status, known facts, next transition, action/recovery, timestamp, and ID through centralized presentation. |
| LAW-4 | Searching, sending, delivery, reply, and business confirmation remain separate. Sent never means confirmed. |
| LAW-5, AX-1–AX-7 | Proposal, exhaustive one-business permission, pending lock, record, refusal, and boundary placement are distinct. |
| LAW-6 | Records remain reachable; replies append and never rewrite the sent record. |
| LAW-7 | Answer plus participant-safe work disclosure, with no third competing summary. |
| LAW-8, DS-13 | Known mismatch and access/availability empties name the specific safe correction. |
| LAW-9, CH-7, CH-8, CH-11 | One document spine; episode grouping preserves evidence; latest expanded; scroll yields; all domains use one item primitive. |
| IA-1, IA-2, IA-5 | Route class is explicit; navigation derives from registry; unlisted durable thread is noindex and absent from sitemap. |
| IA-6, IA-7, IA-8 | Immersive `h-dvh`, pinned footer, `max-w-3xl`, named gutters; route only loads and projects. |
| CH-1, CH-6, CH-9, CH-10 | Only registry tuples render; failures persist; one cause-specific recovery; no `reconnecting` state. |
| CH-2, CH-3, CH-4, CH-5 | Conclusion, public work record, and private evidence remain separate; provenance is inspectable and correctable. |
| AX-2, AX-4, AX-5 | Consequence chooses confirmation depth; refusal is symmetric; send locks duplicates and yields durable readback. |
| DS-1–DS-6 | Astryx behavior, Tailwind layout, semantic tokens, full state contracts, Astryx motion tiers, reduced-motion immediacy. |
| DS-8, DS-12, DS-14, DS-15 | Shared timestamps; one form/error contract; geometry-preserving loading; 44px targets and truthful UI. |
| R0 covenant | Free decision aid precedes PII or send authority and ends exactly at `Your shortlist is ready`. | <!-- stupid-shit: S4 -->
| R1 ladder | Exactly one selected business, one review, one send, one child record; no R2–R4 UI or claims. |

## Anti-slop check

- No side-stripe accents, gradient text, glass surfaces, hero metrics, identical card grid, nested cards, or modal-first interaction.
- No centered-everything composition, AI glow, blobs, ornamental graph, fake business, fake activity, fake price, or decorative motion.
- Cards are reserved for bounded evidence objects; ordinary chronology is semantic document structure.
- Restrained color strategy follows the physical scene; eucalyptus marks current/action state only. This is not a category-reflex “chat equals bubbles” or “AI equals dark gradient” treatment.
- Product familiarity is deliberate: document outline, disclosures, stable status, ordinary buttons, and native scrolling disappear into the task.
