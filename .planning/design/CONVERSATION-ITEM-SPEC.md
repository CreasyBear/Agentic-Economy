# Shared Conversation Item Specification

**Status:** Decision-ready contract for locked decision D2  
**Applies to:** `/t/:threadId`, `/engine-successor`, `/:slug/inquiry`, customer private inquiry records, and owner inquiry threads  
**Authority:** `PRINCIPLES.md` D2, CH-1–CH-11, AX-1–AX-7, DS-1–DS-15, LAW-2–LAW-9

## 1. Decision

AE conversations are one chronological **document spine**, not alternating chat bubbles. Every visible event is a typed `ConversationItem`; its type controls anatomy, status vocabulary, evidence, actions, collapse policy, and announcements. Sender alignment and bubble colour MUST NOT carry meaning (LAW-9, CH-11). The same durable item identity is projected onto every route; routes may provide domain slots but may not invent a second message primitive (IA-8).

An item records what was true at a point in the thread. A later event creates or updates a linked item according to these rules:

- Streaming may fill an existing item, but MUST settle into the same final semantic anatomy; it must not swap a generic loading bubble for a different component (LAW-9).
- A business reply is a new `business_response` linked to its `receipt`; it never mutates “Sent” into “confirmed” (LAW-4, LAW-6).
- Consequential operations are separate `proposal → permission_request → receipt` items. Selection, review, authorization, execution, and external response remain distinct (AX-6).
- Public work records are sanitized checks, sources, assumptions, and limits. Raw tools, private reasoning, and private run evidence are not conversation items; they belong in authenticated admin evidence (CH-2, CH-3).


<!-- tx-lens -->
Conversation items are projection-only renderings of append-only events and first-class records. Items and item renderers MUST NEVER write lifecycle, delivery, permission, response, or projection state; every consequential change goes through the single registered command/state-transition function and is then re-projected. Given the event history, every item projection MUST be deterministically recomputable.
## 2. Normative data contract

<!-- tape-out: A7 -->
```ts
type Lifecycle =
  | 'draft' | 'submitted' | 'understanding' | 'needs_input' | 'working'
  | 'proposal' | 'answer_ready' | 'awaiting_confirmation' | 'executing'
  | 'settled' | 'failed' | 'stopped'

type DeliveryState =
  | 'delivery_retrying' | 'delivery_failed' | 'business_unavailable'
  | 'user_canceled' | 'status_unknown'

type AuditClass = 'collapsible_noise' | 'never_collapse_evidence'
type Provenance = 'asked' | 'understood' | 'assumed' | 'found' | 'authorized'
type EvaluationMode = 'none' | 'single-response-review' | 'multi-response-comparison'

type ItemBase<TType extends string, TState extends Lifecycle, TBody> = {
  id: string
  threadId: string
  type: TType
  lifecycle: TState
  createdAt: string
  updatedAt?: string
  actor: { kind: 'customer' | 'ae' | 'business' | 'system'; label: string }
  status: { code: string; publicLabel: string; operatorLabel?: string }
  body: TBody
  contentDigest?: string
  evidence?: EvidenceDisclosure
  actions: readonly ConversationItemAction[]
  relations?: {
    replyToItemId?: string
    proposalItemId?: string
    permissionItemId?: string
    receiptItemId?: string
    replacesItemId?: string
  }
  auditClass: AuditClass
  episodeId?: string
  semanticPriority: number
  currentStateContribution: 'primary' | 'supporting' | 'historical'
}

type DeliveryBearing<TType extends string, TState extends Lifecycle, TBody> =
  ItemBase<TType, TState, TBody> & { deliveryState: DeliveryState }

type ConversationItem =
  | ItemBase<'user_text', 'draft' | 'submitted' | 'settled' | 'stopped', UserTextBody>
  | ItemBase<'clarification_prompt', 'needs_input' | 'submitted' | 'settled' | 'stopped', ClarificationBody>
  | ItemBase<'work_record', 'understanding' | 'working' | 'settled' | 'failed' | 'stopped', WorkRecordBody>
  | ItemBase<'shortlist', 'working' | 'answer_ready' | 'settled' | 'failed', ShortlistBody>
  | ItemBase<'comparison', 'working' | 'answer_ready' | 'settled' | 'failed', ComparisonBody>
  | ItemBase<'proposal', 'proposal' | 'settled' | 'stopped' | 'failed', ProposalBody>
  | ItemBase<'permission_request', 'awaiting_confirmation' | 'executing' | 'settled' | 'failed' | 'stopped', PermissionBody>
  | DeliveryBearing<'receipt', 'executing' | 'settled', ReceiptBody>
  | ItemBase<'business_response', 'submitted' | 'needs_input' | 'answer_ready' | 'settled', BusinessResponseBody>
  | ItemBase<'error', 'failed' | 'stopped', NonDeliveryErrorBody>
  | DeliveryBearing<'error', 'failed' | 'stopped', DeliveryErrorBody>
  | ItemBase<'status_note', 'submitted' | 'understanding' | 'working' | 'executing' | 'settled' | 'stopped', StatusNoteBody>
  | DeliveryBearing<'status_note', 'executing' | 'settled' | 'stopped', DeliveryStatusProjectionBody>

type EvidenceDisclosure = {
  summary: { label: string; claims: readonly EvidenceClaim[] }
  detailRef?: string
  detailAudience: 'thread_participant' | 'owner' | 'admin'
}

type ConversationItemAction = {
  id: string
  label: string
  kind: 'link' | 'inline' | 'modal' | 'pending_lock'
  intent: 'primary' | 'secondary' | 'refusal' | 'recovery'
  disabledReason?: string
}
```

The union is closed. Each type owns a lifecycle subset; a producer MUST NOT emit any type/lifecycle pair absent from the union. `deliveryState` exists only on `receipt`, delivery-caused `error`, and `status_note` when it projects a delivery record. It MUST NOT be added to other variants. There is no generic reconnecting state: reconnect is, at most, a recovery action for `status_unknown`. Any state with no named producer and registry edge MUST be deleted rather than rendered speculatively.

`body` is discriminated by `type` (and, for `error`/`status_note`, by whether the delivery-bearing shape is used), never a catch-all markdown string. Domain renderers may add only typed slots listed in §4 and MUST NOT infer authority from display copy. `status.publicLabel` is text-first and user-facing; `operatorLabel` exposes the authoritative/kernel vocabulary beside it when they differ (LAW-3, DS-7). IDs and timestamps use tabular mono presentation (DS-8, DS-15).

### Global invariants

1. Exactly one item owns each action boundary. Universal copy/share/retry toolbars are prohibited (LAW-9).
2. Every state has: text status, known facts, next expected transition, timestamp, and either a primary action or an explicit “No action needed” statement (LAW-3).
3. At most one primary action appears per item. Refusal is visually symmetric with permission approval (AX-4).
4. `executing`, `delivery_retrying`, and other pending states set `aria-busy="true"` and disable duplicate commits (AX-5).
5. No item may claim booked, charged, dispatched, accepted, available, quoted, or confirmed unless business-origin evidence authorizes that exact claim. AE has request-authority only. Sent never means confirmed; AE never books, charges, or confirms; the business confirms.
6. Suggested next moves render after the settled item, then become ordinary `user_text` items if selected (LAW-9).
7. `status_unknown` means readback is unavailable; it MUST NOT be translated to `delivery_failed` (LAW-4).
### Public envelope

<!-- tape-out: A3 -->
Raw `ConversationItem` is an INTERNAL projection and MUST NEVER be exposed or advertised as a machine interface. Machine-readable surfaces expose only a versioned envelope:

```ts
type ConversationEnvelope = {
  protocolVersion: string
  schemaVersion: string
  capabilities: readonly string[]
  items: readonly PublicConversationItem[]
}

type PublicConversationItem = {
  id: string
  type: string
  claimType: string
  assertedBy: { kind: 'customer' | 'ae' | 'business' | 'system'; id?: string }
  sourceRef: string
  observedAt: string
  authorityScope: readonly string[]
  doesNotProve: readonly string[]
  boundaryText: string
  contentDigest?: string
  payload: unknown
}
```

Every item MUST carry all claim/provenance fields above. `boundaryText` MUST use the canonical human boundary appropriate to the claim and MUST preserve these invariants exactly: **Sent never means confirmed. AE never books, charges, or confirms. The business confirms.** A receipt proves AE's recorded handoff only; a business response supplies information only within its asserted scope.

<!-- tx-lens -->
`contentDigest` is optional on public items for verifiability and, when present, MUST identify the canonical content represented by that item rather than presentation JSON. A consumer MUST NOT infer business outcome, acceptance, or authority from the digest. Operator projections MAY expose it; customer renderers MUST translate the proof boundary into ordinary language and MUST NOT name the digest.

Consumers MUST ignore unknown item `type` variants gracefully, preserve known siblings, and render a neutral unsupported-item fallback when a human is viewing the envelope. They MUST NOT reinterpret an unknown variant as the nearest known type. Compatibility is additive-only within a `protocolVersion`: fields may be added as optional, but existing meanings, required fields, claim semantics, and authority scopes MUST NOT change. Breaking changes require a new protocol version, a published migration window, dual-read support for at least two release windows, a named sunset date, and observable usage below the declared retirement threshold before removal.

Third-party surfaces offering a consequential action MUST either render AE's exact, current consequence readback without paraphrase or hand the user off to AE for review and authorization. They MUST NOT synthesize approval from identity, prior consent, model output, or envelope possession.

## 3. Shared one-column anatomy

```text
<article data-item-type data-lifecycle aria-labelledby>
  Header: type marker · actor/identity · text status · Timestamp
  Body:
    Lead / prompt / conclusion
    Facts, fields, candidates, comparison, or response slots
    Boundary / next-transition line
  Evidence level 1: inline claim markers + “How AE checked this” summary
  Evidence level 2: Collapsible participant detail OR link to authorized admin detail
  Action row: zero or one primary + consequence-gated secondary/refusal/recovery actions
</article>
```

- **Column:** single chronological reading order; full available content width within the conversation rail. Do not right-align customer items or cap them to bubble widths. Type is conveyed by heading, marker, border/section rhythm, and explicit actor text—not colour alone (LAW-9, DS-7).
- **Header:** compact `<header>` with a visible type label (“Your request”, “Comparison”, “Inquiry receipt”), actor where material, `AeStatusBadge`-style status text, and `<time dateTime>` through the shared timestamp formatter (DS-8). Icons are decorative supplements only.
- **Body slots:** lead first; structured facts second; boundary and next expected transition last. Long prose uses editorial headings/lists. Candidate and comparison slots remain within the same article rather than nested dashboard cards.
- **Evidence:** level 1 is concise, inline, and participant-safe; level 2 is a labelled disclosure. Participant detail contains sources/checks/assumptions/limits. Raw JSON, tool calls, timing, internal policies, and private evidence are linked to an authorized admin view, never expanded publicly (LAW-7, CH-2).
- **Action row:** appears after facts and boundary copy. Consequence-bearing facts must be immediately above the named commit action (LAW-5, AX-7). Minimum 44px targets; loading/disabled/focus-visible behavior comes from Astryx controls (DS-4, DS-15).

## 4. Item type catalog

<!-- tape-out: A6 -->
“Required” below is additional to the base fields in §2. Proposal and permission are two render modes of one versioned `ConsequenceScope` model. `summary` mode is an editable draft summary containing recipient, purpose, and important unknowns. `review` mode is the single exhaustive consequence readback: it renders every shared field, emphasizes changed and sensitive fields, and owns the decision. No third confirmation summary may repeat or dilute it. At mobile widths, consequence facts MUST be adjacent to the named CTA; intervening navigation, evidence drawers, or unrelated copy are prohibited.

<!-- tape-out: A13 -->
“Never hide or summarize away” means the evidentiary core remains directly reachable and semantically complete; its level-2 disclosure may close. It does not require every evidentiary item to occupy a separate card.

| Type | Required body fields | Optional body fields | Allowed status states | Action strip (state/consequence gated) | Collapse behavior | Audit class |
|---|---|---|---|---|---|---|
| `user_text` | text; asked provenance; revision | attachments; reply link; edited time | `draft`, `submitted`, `settled`, `stopped` | Send/resume; edit or copy only when supported. | Older settled items may summarize; revisions remain reachable. | `collapsible_noise` |
| `clarification_prompt` | prompt; field; answer kind; decision-changing reason; next step | choices; constraints; answer link | `needs_input`, `submitted`, `settled`, `stopped` | **Add this answer**; **Correct AE’s understanding**. | Settled answer remains reachable. | `collapsible_noise` |
| `work_record` | phase; summary; steps; fact provenance; next transition | assumptions; source count; limits; progress | `understanding`, `working`, `settled`, `failed`, `stopped` | Stop or one cause-specific recovery. | Settled work may summarize; unresolved failure stays visible. | `collapsible_noise` |
| `shortlist` | criteria; candidates; coverage; next transition | exclusions; selection | `working`, `answer_ready`, `settled`, `failed` | Review, compare, or edit criteria; selection never sends. | Older settled shortlist may summarize. | `collapsible_noise` |
| `comparison` | candidates; dimensions; cells; coverage; price posture; next transition | recommendation; unknowns; influence | `working`, `answer_ready`, `settled`, `failed` | Choose for review or change comparison; never contacts a business. | Older settled comparison may summarize with evidence reachable. | `collapsible_noise` |
| `proposal` | `scopeModelVersion`; `renderMode:'summary'`; recipient; purpose; important unknowns; editable shared fields | evidence/limits; expiry; response window | `proposal`, `settled`, `stopped`, `failed` | **Review sharing scope**; **Change request**. Never authorizes or sends. | Superseded draft may summarize but remains linked. | `collapsible_noise` |
| `permission_request` | same `scopeModelVersion`; `renderMode:'review'`; canonical field set in canonical serialization order; every shared field; changed/sensitive field IDs; exhaustive consequence; decision status | expiry; exposure; revocation rules; proposal link | `awaiting_confirmation`, `executing`, `settled`, `failed`, `stopped` | Symmetric named Allow/Don’t allow; pending lock; recovery. Consequence facts stay adjacent to CTA. | Never hide or summarize away. The body MUST render canonical fields directly, never a reformatted summary that can diverge. | `never_collapse_evidence` |
| `receipt` | `recordId`; operation; recipient; submitted fields; proof-boundary line (`doesNotProve`); next transition; `deliveryState` | correlation; attempts; source links | `executing`, `settled`, with delivery state on variant | Registry-permitted withdraw/retry/refresh/open action. Never confirmation. | Never hide; may group with settled permission episode. | `never_collapse_evidence` |
| `business_response` | business; response; received time; linked receipt; attestation metadata (`attestedBySession`, `receivedAt`); next transition | business-supplied quote/availability; attachments; terms; `contentDigest` | `submitted`, `needs_input`, `answer_ready`, `settled` | Response-specific action; no AE-authored acceptance. | Never hide or summarize away. | `never_collapse_evidence` |
| `error` | operation; cause; remaining truth; recovery; time | retry-after; field errors; support ref | `failed`, `stopped`, with delivery state only when delivery-caused | Exactly one cause-specific recovery. | Unresolved evidence never hidden. | `never_collapse_evidence` |
| `status_note` | scope; label; change; next transition; effective time | reason; actor; linked object | base subset in §2; delivery state only as projection | Usually none; one scoped recovery if required. | Consequential terminal evidence stays reachable. | consequence decides |

### Audit-class and episode rule

Audit class is determined by semantic consequence, never age or length. Permission decisions, receipts, business-origin responses, unresolved failures, cancellations, and consequential terminal status evidence MUST NEVER be hidden or summarized away. A settled `permission_request` and its `receipt` MAY render as one visual episode only when both retain item IDs, states, canonical deep links, and accessibility targets. Grouping uses shared `episodeId`; `semanticPriority` controls scan order; `currentStateContribution` identifies the item supplying current state. Grouping MUST NOT merge records, erase chronology, or make either item unreachable.

## 5. Astryx and current-source mapping

| Conversation anatomy / behavior | Required primitive | Current AE source to retain or replace | Decision |
|---|---|---|---|
| Item container / semantic article | Astryx `Card` where a bounded record needs surface/border; otherwise semantic `<article>` + Tailwind layout | `AeSessionContextPanel`, `AeCustomerRequestWorkspace`, `QualifiedInquiryReceipt` use `Card` | Use one item shell composition; do not Card-within-Card every body slot (DS-1, LAW-9). |
| Status marker | Astryx `Badge` through `AeStatusBadge` / centralized status presentation | `src/components/ae/status/AeStatusBadge.tsx` maps tone to `Badge` and adds text description | Extend central status vocabulary for CH-1 + delivery branches; never route-local badges (DS-7). |
| Actor message content | Astryx `ChatMessage` family only as semantic/identity helpers where useful | `AeInquiryMessage` uses `ChatMessage`, `ChatMessageBubble`, `Avatar`; answer chat still uses `components/ai-elements/message` | Do **not** use `ChatMessageBubble` as the shared visual shell. Adapt `ChatMessage` identity/metadata slots into the document item or omit it. Sender side is not structure (LAW-9). |
| Expand/collapse | Astryx `Collapsible` | Current `AeCollapsible` is bespoke; `about/help/terms` already use Astryx `Collapsible`; ai-elements wrap `AeCollapsible` | Converge the conversation item on Astryx `Collapsible` per DS-1. Preserve controlled `isOpen`, keyboard, `aria-expanded`, and reduced-motion semantics. Do not add a third API. |
| Timestamp | Shared AE `Timestamp` composition: `<time>` + `format-time.ts` + `data-numeric` | `AeInquiryMessage` and `AeThreadSidebar` already use `formatTimestamp` / `timestampIso` | Name/extract one `AeTimestamp` if implementation needs reuse; no route-local `Intl.DateTimeFormat` (DS-8). |
| Typography | Astryx `Heading`, `Text` | Customer Request and receipts already use them | Headings reflect document outline, not speaker prominence. One item title; body subheadings descend correctly. |
| Actions | Astryx `Button`, `IconButton` only for icon-labelled secondary controls | Used across chat, request, inquiry | Labels name consequence; use `isDisabled`/loading contract and 44px target. Icon-only status/actions prohibited (AX-3, DS-4). |
| Evidence summary | Astryx `Collapsible` + `Text`; links via AE `RouterLink` | `AeResearchProcess`, `Reasoning`, `Sources` currently wrap bespoke collapse behavior | One “How AE checked this” participant disclosure; admin detail is a link, not nested raw JSON (LAW-7, CH-2). |
| Permission confirmation | Inline item actions, Astryx `Dialog` only for destructive/irreversible consequence | `AeChat` uses `Dialog`; Customer Request uses inline authorization | Consequence chooses depth: link → inline → modal → pending lock + receipt (AX-2). Component type does not choose depth. |
| Live progress | Text label + `aria-busy`; optional restrained shimmer | `AeStreamingLabel`, `AeThinkingRail`, `AeAnswerThinkingTrace` | Stream into named work/body slots. Motion is supplementary and disabled for reduced motion (DS-6). |

**Known migration facts:** `AeThreadTurnQueryHeader` currently renders a right-aligned user message, Customer Request’s `Conversation` renders bubbles, and `AeInquiryMessage` uses `ChatMessageBubble`; all three violate the target document-spine shape and should become projections of this primitive (CH-11, LAW-9). `AeThreadTranscript` currently filters to complete turns; the implementation must project persisted pending/failed/stopped turns rather than dropping them (CH-1, CH-6). Current quiet-history behavior—latest complete turn expanded and older turns collapsed—is retained (CH-8).

## 6. Lifecycle binding

### Normative transition registry

The registry below is the ONE authority for legal state edges. A state token is `lifecycle` alone or `lifecycle/deliveryState` for delivery-bearing variants. Missing edges are forbidden. `settled` is item-local and never means the customer’s service job is complete.

| Item type | Legal edges |
|---|---|
| `user_text` | `draft→submitted`; `draft→stopped`; `submitted→settled`; `submitted→stopped`; `stopped→draft` |
| `clarification_prompt` | `needs_input→submitted`; `needs_input→stopped`; `submitted→settled`; `stopped→needs_input` |
| `work_record` | `understanding→working`; `understanding→failed`; `understanding→stopped`; `working→settled`; `working→failed`; `working→stopped`; `failed→working`; `stopped→working` |
| `shortlist` | `working→answer_ready`; `working→failed`; `failed→working`; `answer_ready→settled` |
| `comparison` | `working→answer_ready`; `working→failed`; `failed→working`; `answer_ready→settled` |
| `proposal` | `proposal→settled`; `proposal→stopped`; `proposal→failed`; `failed→proposal`; `stopped→proposal` |
| `permission_request` | `awaiting_confirmation→executing`; `awaiting_confirmation→stopped`; `executing→settled`; `executing→failed`; `failed→awaiting_confirmation` |
| `receipt` | `executing/delivery_retrying→executing/delivery_retrying`; `executing/delivery_retrying→settled/delivery_failed`; `executing/delivery_retrying→settled/business_unavailable`; `executing/delivery_retrying→settled/user_canceled`; `executing/delivery_retrying→settled/status_unknown`; `settled/status_unknown→executing/delivery_retrying`; `settled/status_unknown→settled/delivery_failed`; terminal delivery facts otherwise append a new item rather than mutating history |
| `business_response` | `submitted→needs_input`; `submitted→answer_ready`; `needs_input→submitted`; `answer_ready→settled` |
| `error` (non-delivery) | `failed→stopped`; recovery appends/replaces with the recovered item; no success mutation |
| `error` (delivery-caused) | `failed/delivery_failed→stopped/delivery_failed`; `failed/business_unavailable→stopped/business_unavailable`; `failed/status_unknown→stopped/status_unknown`; recovery creates a receipt/status projection under its own registry edge |
| `status_note` (base) | `submitted→understanding`; `submitted→settled`; `understanding→working`; `working→executing`; `working→settled`; `executing→settled`; any active state may `→stopped` |
| `status_note` (delivery projection) | `executing/delivery_retrying→settled/delivery_failed`; `executing/delivery_retrying→settled/status_unknown`; `executing/delivery_retrying→stopped/user_canceled`; authoritative `business_unavailable` is emitted directly as `settled/business_unavailable` |

Delivery meanings remain: `delivery_retrying` is an active idempotent retry; `delivery_failed` is authoritative non-delivery; `business_unavailable` is an authoritative business/channel fact; `user_canceled` is user withdrawal; `status_unknown` is unavailable readback and MUST NOT be translated to failure. “Reconnect” is an action label only, never a state.

Fixtures, property tests, renderer matrices, and accessibility announcement cases MUST be generated from this registry. They MUST NEVER hand-enumerate the Cartesian product of type × lifecycle × delivery state. CI MUST fail when the union and registry disagree, when a producer emits an unregistered tuple, or when a registry state has no named producer.

### Streaming contract

1. Create the durable thread/item identity before work streams (LAW-2).
2. Render the final article anatomy immediately: header, status, named phase, body/evidence/action slots. Streaming fills these slots in place; no generic bubble, spinner card, or skeleton is replaced by a different semantic component.
3. Use named, public work phases—not “Thinking”: **Understanding your request → Searching registered businesses → Checking capabilities and service area → Building the shortlist → Comparing stated facts → Preparing the review → Sending the authorized inquiry → Checking delivery state**. Only phases actually performed may render (CH-3, CH-4).
4. Phase changes update one status label and produce one accessibility announcement. Token/chunk updates are silent.
5. On completion, compact the work record and reveal the resulting shortlist/comparison/proposal/receipt as its own linked item. Do not blend work, conclusion, and permission into one item (CH-2, AX-6).
6. On stop/failure, persist the same item with `stopped`/`failed`; do not remove partial public facts known to be durable, and do not expose partial private reasoning (CH-6).

## 7. Route projection rules

The projection layer selects slots and audience labels; it does not change item semantics, lifecycle, IDs, audit class, or action consequence.

| Surface | Item projection | Domain-specific slots | Actions and boundary constraints |
|---|---|---|---|
| `/t/:threadId` public chat | User turns → `user_text`; interpreted query/checks → `work_record`; candidates → `shortlist`; deeper analysis → `comparison`; recommendation/next step → `proposal`; failures/status → `error`/`status_note` | Search phrase, carried constraints with provenance, provider artifacts, coverage, sources/check summary, visibility/retention state | Review/follow-up actions only until a permission item is introduced. “Ask this business” opens proposal/review; it does not send. Latest expanded; prior quiet history collapsed (CH-8). |
| `/engine-successor` structured Customer Request | Request text/answers → `user_text`; missing decision fact → `clarification_prompt`; working understanding → `work_record`; options → `shortlist`/`comparison`; disclosure review → `proposal` + `permission_request`; outcomes → `receipt`/`error` | Customer Request reference/revision; criteria with `asked/understood/assumed/found/authorized`; option cardinality/coverage; registered price components; disclosure purpose, fields, recipient cap | “Show available options” only starts comparison. Authorization is inline for bounded sharing; refusal symmetric. No purchase or booking claim. Existing Request is unchanged on failed clarification. |
| `/:slug/inquiry` review + receipt | Review fields → `proposal`; consent/send boundary → `permission_request`; submitted state → `receipt`; later reply when revisited → `business_response` | Business/service identity; exact message and contact fields; consent; operation/receipt/thread IDs; notification state; expected response; private revisit link | Named **Send request to {business}**; pending lock; receipt says what AE sent and that the business confirms timing, quote, availability, and acceptance (LAW-5, LAW-6, AX-7). Copy/Open record allowed after submission. |
| Customer private inquiry record (`/t/:threadId?k=…` record projection) | `receipt` followed by linked `business_response`, customer `user_text`, and delivery/status/error items | Private-link access state, sent payload, delivery history, business reply, timestamps | Reply/withdraw only where source supports it. Thread ID alone grants no access. A response is new evidence, never receipt mutation. |
| Owner inquiry thread | Customer message → `user_text` with Customer actor; original submission → linked `receipt`; owner/customer messages → `business_response` or `user_text` by domain actor; delivery/system events → `status_note`/`error` | Business/inquiry identity, unread/read state, origin, version, reply delivery status, correlation/dispatch refs in authorized detail | Fixed dispositions: Reply / Request clarification / Decline / Snooze, each previewing resulting status. Owner reply is business-origin evidence once saved. Close/destructive actions use modal depth; pending sends lock duplicates. |

### Projection prohibitions

- Routes MUST NOT rename `receipt` as “confirmation,” flatten `permission_request` into a button inside `proposal`, or render `business_response` as AE’s own answer.
- Public projections MUST NOT expose admin correlation/raw evidence unless explicitly classified for that audience.
- Owner labels may be friendlier (“Waiting for your reply”), but the authoritative state must be inspectable in the same item; no undocumented duplicate vocabulary (LAW-3).
- The shared renderer MUST accept typed slot renderers or data, not route-authored arbitrary wrappers that recreate bubble/layout behavior.
- <!-- tx-lens --> Projection-only rendering is absolute: a route, item renderer, collapse control, deep-link focus handler, or envelope consumer MUST NEVER write state. It may issue a registered command through the owning action boundary; only appended events and first-class records feed the next projection.

## 8. Collapse and quiet-history algorithm

<!-- tape-out: A13 -->
Apply in order:

1. Items with `never_collapse_evidence` MUST NEVER be hidden or summarized away. A settled permission+receipt pair may use the episode grouping contract in §4.
2. Current actionable items (`needs_input`, `proposal`, `awaiting_confirmation`, `executing`, active delivery branch, unresolved `failed`) stay expanded.
3. The latest remaining item stays expanded.
4. Older `collapsible_noise` in settled/superseded state may use a labelled summary with full content one disclosure away.
5. User override persists for the thread view; a deep link expands and focuses its exact item, including within an episode.

`evaluationMode` is required at thread projection: `none`, `single-response-review`, or `multi-response-comparison`. `multi-response-comparison` is legal only with at least two commensurable responses sharing the declared comparison dimensions. A 1-of-1 response MUST use `single-response-review`. Render no empty comparison columns, disabled future controls, or placeholder comparison chrome.

R0 threads MUST terminate visibly with the exact terminal label **Your shortlist is ready**. They render ZERO inquiry chrome—no composer, send control, consent preview, waiting state, response slot, or delivery language—until the user invokes **Ask this business**. That action begins the R1 proposal flow; it does not send.

### Mobile acceptance contract

At viewport widths ≤375px: there is no sticky rail; item headers occupy at most two lines; secondary metadata moves behind labelled disclosures; actions stack vertically with the primary action last in DOM and visual order; and a compact consequence recap remains immediately adjacent to a permission CTA. The implementation MUST pass keyboard, screen-reader-order, horizontal-overflow, deep-link, and focus checks at 320px and 375px, at 200% browser zoom, with a 30-item mixed-state thread, and with exactly 1-of-1 business response. In the 1-of-1 scenario it MUST render review mode, never a comparison shell.

A quiet-history summary MUST include type, text status, one-line outcome, timestamp, and an “Expand” control with `aria-expanded`. Presentation never changes search, copy, audit, IDs, or canonical history.

## 9. Accessibility contract

### Semantics and naming

- Thread container is an ordered list (`<ol aria-label="Conversation history">`); each item is an `<li>` containing `<article aria-labelledby="item-{id}-title" aria-describedby="item-{id}-status">`.
- Each visible status is text-first. Colour, icon, position, shimmer, or animation may reinforce but never replace the label (DS-7).
- Timestamps use `<time dateTime="…">`; receipt/correlation IDs use readable labels plus tabular mono text (DS-8).
- Collapsible controls expose `aria-expanded` and `aria-controls`; collapsed content is not keyboard-focusable or announced. Never auto-collapse the item holding focus.
- Actions follow DOM/reading order after consequence facts. Disabled actions expose a visible reason and are not represented only by reduced opacity.

### Live-region policy

| Type/state change | Live behavior |
|---|---|
| `user_text` draft/chunks | No live announcement |
| New persisted `user_text`, `clarification_prompt`, `shortlist`, `comparison`, `proposal`, `business_response` | One concise `aria-live="polite"` announcement when inserted, e.g. “AE needs one more detail” or “Response received from {business}” |
| `work_record` token/step updates | Silent; phase boundary only is announced politely |
| `permission_request` becomes actionable | Polite announcement; focus policy below makes the scope review discoverable |
| `receipt` created or delivery state changes | `role="status"` / polite once: “Inquiry sent to {business}. The business has not confirmed it.” Never repeat on timestamp refresh |
| `error`, `delivery_failed`, or failed permission recording | `role="alert"` once after the operation returns, including the primary recovery label; field validation remains field-local |
| `delivery_retrying`, `status_unknown`, `user_canceled`, `business_unavailable` | Polite once per distinct authoritative state transition; no countdown/attempt spam |
| Collapse/expand, copy success | Control state/name is sufficient; copy may use a brief toast but never as lifecycle evidence (LAW-6 anti-pattern 3) |

Implement announcement deduplication by `(item.id, lifecycle, deliveryState, semanticRevision)`. Content chunks, elapsed-time ticks, retry counters, hydration, and re-rendering MUST NOT change this key. This enforces one state, one concise announcement (exemplar anti-pattern 12).

### Focus behavior

1. Submitting a composer keeps focus in the composer unless the next item requires user input or explicit consequence review.
2. A new `clarification_prompt` moves focus to its answer field **only after user-initiated submission**; background updates never steal focus.
3. A new `permission_request` moves focus to the item heading/scope summary after user chooses to review sharing. The approval button is not auto-focused.
4. After a modal decision, return focus to the invoking action. After an inline pending lock resolves, focus the receipt heading; if it fails, focus the error summary/first invalid field.
5. Deep links focus the target item heading with `tabIndex={-1}` and expand it. Loading older history preserves the current focused element and visual anchor.
6. User-controlled scroll yield is mandatory: do not force-scroll when the reader moved away from the live edge; expose a “New update below” control that moves focus/scroll on activation (CH-8).

### Reduced motion

- With `prefers-reduced-motion: reduce`, collapse/expand, streamed reveal, status transitions, and scroll-to-item reach final state immediately; no shimmer, height tween, zoom, typewriter, or smooth autoscroll (DS-6).
- Motion-safe transitions may clarify insertion or state change but MUST NOT delay content, action availability, live announcements, or focus.
- Streaming remains understandable through phase text and `aria-busy`, never through animation alone.

## 10. Acceptance checklist for implementation

- [ ] All 11 item types use the closed discriminated union and one chronological document spine.
- [ ] Every producer tuple and legal edge exists in the transition registry; generated fixtures cover the registry without Cartesian hand-enumeration.
- [ ] `deliveryState` exists only on receipt, delivery-caused error, and delivery-projection status variants; no orphaned or reconnecting-style state remains.
- [ ] Machine output uses `ConversationEnvelope`, carries every claim/provenance field and canonical boundary text, and ignores unknown variants gracefully.
- [ ] Proposal is the editable summary; permission is the single exhaustive readback from the same scope version, with changed/sensitive emphasis and adjacent consequence/CTA.
- [ ] `permission_request` renders the canonical field set in canonical serialization order, and review/admission bind the same canonical content; no reformatted summary can diverge.
- [ ] `receipt` carries `recordId` plus the customer-safe proof boundary; receipt creation and business outcome remain separate facts.
- [ ] `business_response` carries `attestedBySession`, `receivedAt`, and response attestation metadata; customer rendering names the business and timestamp without internal vocabulary.
- [ ] Public envelope items support optional `contentDigest` for canonical-content verification without changing claim or authority semantics.
- [ ] Item and route rendering is projection-only: no renderer writes state, and deterministic replay reproduces every projection from appended events.
- [ ] Permission, receipt, business-response, and consequential terminal evidence are never hidden or summarized away; episode grouping preserves both records and deep links.
- [ ] Comparison mode appears only for at least two commensurable responses; 1-of-1 uses single-response review with no empty future UI.
- [ ] R0 visibly ends at **Your shortlist is ready** with zero inquiry chrome until **Ask this business**.
- [ ] Mobile scenarios pass at 320/375px, 200% zoom, 30 items, and 1-of-1 response under §8.
- [ ] Evidence, Astryx primitives, streaming, announcements, keyboard focus, scroll yield, and reduced motion satisfy §§3–9.
- [ ] Sent never means confirmed; AE never books, charges, or confirms; the business confirms.
