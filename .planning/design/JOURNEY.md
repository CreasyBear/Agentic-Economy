# Journey — normative flow specification

**Status:** normative design authority  
**Scope:** customer journey from first ask through business handoff  
**Boundary:** AE is a request-authority service. AE does not book, charge, dispatch, accept a quote, confirm availability, or guarantee a response. The business confirms. **Sent never means confirmed.**

## 1. The decided funnel

The decided funnel is **Shape D — staged hybrid: instant decision aid → bounded shortlist → optional selected-business inquiry**. AE MUST produce a useful, inspectable shortlist and comparison before requesting identity, contact data, or speak-for-me authority. Inquiry is a branch after success, not the price of seeing results.

```text
/ composer
  → /t/:threadId created immediately
  → interpreted need + provisional shortlist
  → bounded comparison + editable portable brief
  → user chooses:
      [call/open/copy] terminal success without AE authority
      [adjust] continue discovery
      [ask selected businesses] proposal
          → exact scope + minimum PII + explicit permission
          → pending lock
          → receipt + per-recipient delivery states
          → private-link return + partial response evaluation
```

The serial full-journey funnel compounds even moderate transition losses; therefore shortlist and comparison form one progressive result, inquiry remains optional, account creation is absent from first visit, and partial responses remain useful. Shape D scored strongest because it combines value-before-authority with a portable structured brief while preserving no-shame exits. The full steelman, alternatives, and scorecard remain archived in [`archive/FUNNEL-CHALLENGE.md`](./archive/FUNNEL-CHALLENGE.md).

### 1.1 Abandonment map and required levers

Severity labels are directional product-risk estimates, not measured conversion rates. Each transition MUST be instrumented before the label is treated as fact.

| Transition | User must grant | Competing default behavior | Estimated dropout | Named design lever | Normative lever contract |
|---|---|---|---|---|---|
| **Arrive → ask** | 5–20 seconds of attention; enough intent to describe a need | Search Google/Maps; call a known business; ask a friend; leave | **High** | **Zero-preamble composer** | Put the composer first, with concrete example asks and a low-commitment `Browse businesses` alternative. Explain the mode inside or adjacent to the field; NEVER place a marketing, sign-in, or contact-details gate before the ask (`LAW-1`, `IA-3`). |
| **Ask → shortlist** | A little patience; permission to interpret the query; possibly one missing constraint | Open Maps immediately; simplify the query; abandon if chat feels slow | **Medium–High** | **Progressive shortlist preview** | Create `/t/:threadId` immediately (`LAW-2`); show interpreted need as editable `asked / understood / assumed` facts (`CH-5`); stream supportable candidates instead of dead air. Ask at most one blocking clarification before provisional value. |
| **Shortlist → comparison** | More attention; willingness to inspect evidence and trade-offs | Open tabs; pick the first result; call directly | **Medium** | **Decision-ready comparison slice** | Default to 3–5 candidates and 3–5 need-relevant dimensions. Separate known facts, unknowns, and `business will quote`; expose sources and limits one level deeper (`LAW-7`, `CH-2`). Criteria remain correctable without restart (`CH-5`). |
| **Comparison → inquiry consent** | Intent to act; PII; narrowly defined authority | Call/email one business; use its form; postpone; do nothing | **Critical** | **Value-before-permission handoff** | Offer inquiry only after the free comparison and portable brief are usable. Name selected recipients, exact fields, recipient cap, expected next step, and non-outcomes (`AX-1`, `AX-3`, `LAW-5`). `Not now` MUST preserve the thread and shortlist (`AX-4`). |
| **Consent → send** | Final consequence-bearing authority | Back out; send one message manually | **High** | **Named-send readback** | Use dedicated review with recipient selection, payload, PII scope, timing, and boundary copy. The CTA names the action and recipients, NEVER `Continue`. Lock while pending, prevent duplicates, and issue durable receipts (`AX-2`, `AX-3`, `AX-5`, `LAW-5`, `LAW-6`). |
| **Send → multi-day wait** | Patience; trust in the return channel | Call immediately; submit elsewhere; forget AE | **High** | **Expected-response contract** | Receipt shows contacted recipients, delivery state per recipient, expectation posture, notification behavior, and withdrawal/recovery where supported. Sent never means read, accepted, available, quoted, or confirmed (`LAW-4`). |
| **Responses → evaluation** | Renewed attention; willingness to compare incomplete replies | Accept first reply; negotiate directly; ignore late replies | **Medium–High** | **Partial-results decision board** | Notify on the first actionable response. Render recipients independently; preserve original replies; normalize only comparable fields; mark unknowns (`LAW-3`, `LAW-4`). |
| **Evaluation → return visit** | Memory of AE; trust in the link/channel | Reply from email/SMS; call; never return | **High** | **One-tap private return** | Notifications deep-link to `/t/:threadId?k=` with the exact reason to return. Open on the new response, preserve comparison and receipt, and present one primary next action (`IA-1`, `LAW-2`, `LAW-6`, `CH-8`, `CH-9`). |

## 2. Stage contracts

Every stage is a semantic state of the durable thread at `/t/:threadId`, not a disposable screen. A stage MAY be skipped when unnecessary, but its authority boundary MUST NOT be hidden or collapsed into a later stage. Every table has the same six required rows. Friendly status labels MUST have an inspectable durable state one level deeper (`LAW-3`, `LAW-7`, `DS-7`).

### Stage 1 — Ask

| Contract row | Contract |
|---|---|
| **User’s mental model** | Imported from Google/Maps: “search a large local index.” Imported from chat AI: “describe anything naturally and it will understand, remember, and act.” |
| **What AE actually does** | Consumes the query at `/`, creates a thread, and interprets it against AE’s published catalog scope. The current registry search is not the whole web and does not prove a quality ranking. |
| **What we present** | **Item:** user request + compact interpretation work record. **Status:** `Understanding your request`. **Primary action:** `Find matching business pages`. **Boundary copy:** “AE searches published business pages. You’ll review any inquiry before it is sent.” Composer-first, with browse as the low-commitment alternative (`LAW-1`, `CH-2`). |
| **Expectation gaps & correction** | Show source scope directly under the composer, not in legal copy. Do not say “best,” “every,” or “nearby” unless the query and indexed place facts support it. Preserve the user’s original wording beside the interpretation (`CH-5`, `LAW-4`). |
| **State on reload/return** | `/t/:threadId` restores the exact ask, interpretation version, created time, and any active work/failure state. A failed understanding turn remains visible with `Edit request` or `Try again` (`LAW-2`, `CH-6`). |
| **Exit ramps** | `Save request`; `Copy private link`; `Browse business pages instead`; notification opt-in only after explaining what update it covers. Leaving never discards the draft. |

### Stage 2 — Clarify

| Contract row | Contract |
|---|---|
| **User’s mental model** | Chat AI should infer obvious details; Maps usually asks through filters. Questions can feel like delay or failure. |
| **What AE actually does** | Needs explicit facts when ambiguity changes search results, data sharing, or consequence. It may carry earlier context, but each fact must retain provenance and be correctable (`CH-4`, `CH-5`). |
| **What we present** | **Item:** clarification with one decision at a time, optional suggested answers, and “Why this matters.” **Status:** `A detail is needed`. **Primary action:** `Use these details`. **Boundary copy:** “We won’t guess details that change who we contact or what we share.” |
| **Expectation gaps & correction** | Ask only high-information questions; visibly mark low-risk defaults as **Assumed** and allow `Use assumption`. Never turn a known catalog limitation into an interrogation. “Skip for now” states the effect on matching (`LAW-8`, `CH-4`). |
| **State on reload/return** | Thread restores answered, skipped, and unresolved questions; the context object shows prior value, provenance, and last edit. Resume at the first unresolved consequential fact (`LAW-2`, `CH-5`). |
| **Exit ramps** | `Skip and search broadly`; `Save request`; `Copy request summary`; `Browse category`; `Notify me when I return` only if a real notification channel is configured. |

### Stage 3 — Shortlist

| Contract row | Contract |
|---|---|
| **User’s mental model** | Maps-style pins/cards imply an exhaustive nearby set, relevance ranking, live opening status, reviews, and enough truth to choose quickly. |
| **What AE actually does** | Returns paginated matches from published business/service catalog data. It can show published location, service area, capability/request mode, hours-or-unknown, trust tier, and other listed facts. It does not currently prove “best,” exhaustive coverage, or live availability. |
| **What we present** | **Item:** shortlist section in the thread with compact candidate rows and inspectable match reasons. **Status:** `Matches found` / `No exact matches`. **Primary action:** `Review shortlist`. **Boundary copy:** “Based on published business pages and your current criteria; availability and quote still need a business reply.” (`LAW-7`, `LAW-8`). |
| **Expectation gaps & correction** | Title it “Matches,” not “Recommendations.” Show why each candidate is present and which criteria are unknown. Zero results name each conflicting constraint and offer individual relax actions; never silently broaden (`LAW-8`). |
| **State on reload/return** | Saved candidate IDs, source facts/version timestamps, active constraints, exclusions, and user selection persist under the thread URL. Changed/stale facts are marked; removed businesses are not silently substituted (`LAW-2`, `LAW-4`). |
| **Exit ramps** | `Save shortlist`; `Copy private shortlist link`; `Open business page`; `Change criteria`; `Browse all published pages`; opt into notifications for **reply/update to this saved request**, not generic marketing. |

### Stage 4 — Compare

| Contract row | Contract |
|---|---|
| **User’s mental model** | Comparison implies a normalized table, reliable apples-to-apples facts, a winner, and perhaps AI judgment that fills gaps. |
| **What AE actually does** | Can compare only traceable published facts and user criteria. Unknowns remain unknown. No inspected matcher contract establishes a universal score, and no current source contract synthesizes authoritative prices. |
| **What we present** | **Item:** comparison matrix with criteria as rows, candidates as columns, provenance on each value, and `Unknown—ask business` cells. **Status:** `Ready to compare`. **Primary action:** `Choose a business to ask`. **Boundary copy:** “This comparison uses listed facts; the business confirms price, timing, and availability.” (`CH-2`, `LAW-7`). |
| **Expectation gaps & correction** | Never manufacture a score to hide missing evidence. If AE gives an ordering, label the exact user-selected sort criterion. Separate fact, inference, and missing data; provide `Correct criterion` inline (`CH-5`, `LAW-4`). |
| **State on reload/return** | Comparison columns, sort/filter choices, pinned candidates, dismissed candidates, and source snapshots persist. Reload highlights facts updated since the last view without rewriting the prior decision trail (`LAW-2`, `LAW-6`). |
| **Exit ramps** | `Save comparison`; `Copy private comparison link`; `Download/copy criteria`; `Ask one business`; `Return to shortlist`; notification option for changes to this saved object where supported. |

### Stage 5 — Propose inquiry

| Contract row | Contract |
|---|---|
| **User’s mental model** | A chat agent may appear ready to contact several businesses autonomously; “get quotes” sounds like guaranteed quote collection. |
| **What AE actually does** | Prepares a first-contact message for a resolved published business/service/capability. Current policy refuses booking, payment, dispatch, quote acceptance, or job-acceptance intent. Each recipient requires its own child action and receipt; a group summary is only a projection. |
| **What we present** | **Item:** proposal card with recipients, services, message draft, fields to share, reasons for selection, unknowns, expected next step, recipient cap, and explicit non-outcomes (`AX-1`). **Status:** `Inquiry draft ready`. **Primary action:** `Review inquiry`. **Boundary copy:** “This asks each selected business to reply. It does not book, accept a quote, or confirm availability.” |
| **Expectation gaps & correction** | Replace “AE will get quotes” with “Ask selected businesses for a quote” only where `quote_request` is published. Recipient selection MUST be explicit; do not imply unbounded broadcast. Keep the brief editable (`AX-6`, `LAW-5`). |
| **State on reload/return** | Recipient/service IDs, recipient-binding revisions, capability kind, exact draft, selected contact fields, originating ask, and proposal revision persist. Catalog or binding drift triggers re-review rather than silent retargeting (`LAW-2`, `LAW-4`). |
| **Exit ramps** | `Save draft`; `Copy message`; `Open business contact option`; `Choose another business`; `Return to comparison`; notification/reminder for the saved draft, never an implied send. |

### Stage 6 — Consent / review

| Contract row | Contract |
|---|---|
| **User’s mental model** | “Continue” may be treated as harmless navigation; chat users may assume the agent already has standing permission. |
| **What AE actually does** | Requires explicit review of the exact recipients, request body, contact fields, and consequence before externally observable sends. Review renders the fields from the same canonical serialization whose digest admission verifies; there is no second presentation payload. This is request authority only (`AX-2`, `AX-3`, `AX-5`). <!-- tx-lens --> |
| **What we present** | **Item/screen:** the single exhaustive pre-send permission readback, repeating recipients, services, body, contact scope, expected reply path, and limits exactly as they will be sent. **Status:** `Ready for your approval`. **Primary action:** `Send inquiry to {N} selected businesses` or `Send inquiry to {business}`. Secondary: `Don’t send`. **Approval copy:** “This is exactly what will be sent — it can’t change after you approve it.” **Boundary copy beside CTA:** “Each business decides whether and how to respond; nothing is booked or confirmed.” (`LAW-5`). <!-- tx-lens --> |
| **Expectation gaps & correction** | Consequence-bearing facts are repeated, not hidden behind “details.” Any changed recipient, body, contact field, or canonical serialized value after review invalidates approval and returns to review. Avoid generic `Confirm`, `Submit`, or prechecked consent (`AX-3`, `AX-4`). <!-- tx-lens --> |
| **State on reload/return** | Unsigned review remains a draft; no send is inferred. The review object restores the exact canonical scope, its digest, and projection revision and shows source changes. Authorization is recorded only after the named commit action (`LAW-2`, `CH-5`). <!-- tx-lens --> |
| **Exit ramps** | `Don’t send`; `Save draft`; `Edit message`; `Remove contact field`; `Copy message to contact directly`; `Choose another business`. All preserve prior research/shortlist. |

### Stage 7 — Send

| Contract row | Contract |
|---|---|
| **User’s mental model** | Pressing send may mean a business received, read, accepted, or started acting. Chat animation can falsely imply success. |
| **What AE actually does** | At commit, atomically re-evaluates `R1TargetAdmitted` and the full authority tuple before it creates or replays the idempotent child inquiry operation. State drift returns the named typed refusal, invalidates the review, and creates no consequential event. An admitted operation has its own recipient binding, first customer message, notification/audit records, access posture, and delivery state; initial notification may be `queued` or `held`, and failures remain possible. <!-- tx-lens --> |
| **What we present** | **Item:** pending-lock replaces the CTA in place only after commit admission. **Status:** `Sending inquiry` only while the admitted operation is unresolved. **Primary action:** disabled named send with `aria-busy`; then route to receipts. **Boundary copy:** “Creating written handoff records; do not close or send again.” A commit-time drift refusal names what changed and returns to a fresh review. (`AX-5`, `LAW-4`). <!-- tx-lens --> |
| **Expectation gaps & correction** | Never animate `sent` before authoritative readback. An uncertain readback is `Status unavailable—check again`, not failure or success. The same operation key and digest returns the original result; the same key with different reviewed content is refused. Replay never creates a duplicate (`LAW-3`, `LAW-4`). <!-- tx-lens --> |
| **State on reload/return** | Because admitted child inquiry objects are created before completion, reload resolves operation keys to existing receipts or recoverable failures. A drift refusal has no child operation and restores a newly generated review; never show a fresh active send button while any outcome is unknown (`LAW-2`, `AX-5`). <!-- tx-lens --> |
| **Exit ramps** | During the lock: `Return to saved thread` only if safe; after timeout: `Check status`, `Copy support ID`, `Save receipt link`. Never offer `send again` until readback proves no operation exists. |

### Stage 8 — Pending / wait

| Contract row | Contract |
|---|---|
| **User’s mental model** | Maps/chat immediacy suggests a quick answer; “sent” can imply acceptance. Silence may be interpreted as AE failure. |
| **What AE actually does** | Maintains durable per-recipient delivery and owner-response states. A saved inquiry may need delivery review even though the message itself is durable. AE never converts delivery posture into business acceptance. |
| **What we present** | **Item:** durable receipt/timeline per recipient plus derived group summary. **Status labels:** `Queued for business delivery`, `Delivery recorded`, `Delivery needs review`, `Held for review`, `Status unknown`, or terminal `No reply received`. **Primary action:** one state-specific action. **Boundary copy:** “Delivery status is not business acceptance. The business confirms any next step.” (`LAW-3`, `LAW-6`). |
| **Expectation gaps & correction** | Separate “AE saved it,” “delivery recorded,” “business replied,” and “closed.” Do not invent response windows; every shown window names its basis. Delivery failure never becomes “business declined.” No-reply creates one terminal item, never recurring sadness/status notes (`LAW-4`). |
| **State on reload/return** | Private receipt URL shows latest delivery label, updated time, submitted summary, recipient timeline, reply if any, and closed time. Thread ID alone grants no access. Waiting clocks and next transition remain inspectable (`LAW-6`). |
| **Exit ramps** | `Copy private receipt link`; `Get notified of a saved reply` where configured; `Contact business another way`; `Return to shortlist`; `Close this request`. Preserve receipt and message even on delivery failure. |

### Stage 9 — Responses arrive

| Contract row | Contract |
|---|---|
| **User’s mental model** | AE may be expected to monitor all channels, parse every reply, and treat a positive message as a confirmed job. |
| **What AE actually does** | Customer readback may expose a business reply saved on the inquiry record. The target state records that reply as an immutable event whose response digest is attested by the authenticated owner session, creating two-party attribution without proving the real-world outcome. It does not prove coverage of off-platform replies, nor convert reply text into booking, price, or acceptance authority. <!-- tx-lens --> |
| **What we present** | **Item:** new linked business-reply conversation item, projected from the attested response event; never mutate the original receipt (`LAW-6`). **Status:** `Business replied`. **Primary action:** `Review reply`. **Boundary copy:** “This is the business’s message. Check price, timing, conditions, and how they want you to proceed.” <!-- tx-lens --> |
| **Expectation gaps & correction** | Distinguish verbatim business content from AE summary. Attestation attributes the recorded reply; it does not prove fulfilment or agreement. Mark missing fields rather than inferring agreement. `Interested` is not `accepted`; `estimate` is not a final quote; a reply is not a booking (`LAW-4`, `CH-2`). <!-- tx-lens --> |
| **State on reload/return** | Receipt timeline projects `Business replied` from the append-only response event and preserves the reply body, timestamp, and attestation reference beside the original request and delivery history. Notification deep-links to this durable item, not a transient toast (`LAW-2`, `LAW-6`). <!-- tx-lens --> |
| **Exit ramps** | `Save/copy reply`; `Open original inquiry`; `Ask business to clarify` through an explicitly supported, newly authorized path; `Return to comparison`; `Close request`; notification preferences remain inspectable. |

### Stage 10 — Evaluate

| Contract row | Contract |
|---|---|
| **User’s mental model** | An AI evaluator should normalize quotes, spot hidden differences, rank options, and recommend the winner. |
| **What AE actually does** | AE may structure user-entered or saved business-provided facts and flag missing information. Authoritative price, scope, timing, and conditions remain business-provided. Comparison activates only when at least two responses are eligible; otherwise this is single-response review. |
| **What we present** | **Item:** evaluation worksheet with mode `single-response-review` or `comparison`. **Status:** `Reply ready to evaluate`, `Responses ready to compare`, or `More information needed`. **Primary action:** `Review against your criteria`. **Boundary copy:** “AE can organize the information; verify each business’s terms before deciding.” (`CH-4`, `LAW-7`). |
| **Expectation gaps & correction** | No synthetic total, fabricated confidence, or universal winner. Each criterion carries provenance; incomparable units/conditions stay visibly incomparable. Recommendation language states the user criterion it optimizes and missing facts (`CH-5`, `LAW-4`). |
| **State on reload/return** | Durable evaluation revision stores criteria, response references, extracted or entered facts, provenance, unknowns, and corrections. If no durable evaluation source exists, persist only replies and user-authored notes—never fake evaluation state (`LAW-2`). |
| **Exit ramps** | `Save evaluation`; `Copy questions for the business`; `Export/copy comparison`; `Pause decision`; `Return to replies`; notify on a new saved reply, not a predicted outcome. |

<!-- journey-system: B5/C7 -->
### Stage 11 — Decide / handoff

| Contract row | Contract |
|---|---|
| **User’s mental model** | “Choose” may mean AE books, orders, pays, schedules, or guarantees the supplier will proceed. |
| **What AE actually does** | Records at most the user’s selection/context and provides a handoff path. AE does not accept a quote, place an order, book, charge, dispatch, or confirm. The business and user complete any agreement through the business-supported channel. |
| **What we present** | **Item:** decision summary + handoff instructions. **Status:** `Your shortlist is ready`, `Ready to contact business`, or `Request closed`; never `Booked`, `Ordered`, or `Confirmed`. **Primary action:** `Continue with {business}` only when destination/action is named; otherwise `Copy decision summary`. **Boundary copy:** “AE has not accepted, booked, or paid. Confirm final scope, price, timing, and terms with the business.” (`AX-6`, `AX-7`). |
| **Expectation gaps & correction** | Selecting a candidate is context selection, not execution. Any protected action requires a new proposal/readback/authorization contract; prior request consent is not standing authority (`AX-2`, `AX-6`). **Choose another business** MUST create a new episode (`episodeId`) containing a new `RequestGroup`, fresh proposal, and fresh one-use authorization in the SAME thread. It MUST NOT mutate or extend the prior group, reuse its authorization, or render sequential groups as one multi-recipient act. |
| **State on reload/return** | Thread preserves chosen candidate, rationale/criteria, request records, replies, and lifecycle label. Every subsequent-business episode remains independently inspectable under its own `episodeId` and group identity. A closed request remains readable; reopening creates a new turn/fork rather than rewriting history (`LAW-2`, `LAW-6`). |
| **Exit ramps** | `Copy decision summary`; `Open business-provided contact path`; `Save for later`; `Choose another business`; `Close without choosing`; `Share private link`. `Choose another business` starts the C7 new-episode contract above; it NEVER adds a recipient to the prior send. No-shame close retains all permitted work. |

## 3. `JourneyContext`

<!-- tape-out: A1-related -->

`JourneyContext` is a **rebuildable, revisioned projection** from append-only thread events plus versioned source snapshots. It is not canonical memory, an authorization store, or a second write model. Commands MUST append domain events; they MUST NEVER dual-write a canonical context object. Reprojection from the event stream and referenced snapshots MUST reproduce a revision or fail explicitly when a referenced source is unavailable.

The context rail is a compact, editable view of what AE is carrying (`CH-5`). It appears on request and automatically before a consequential proposal. Every proposal and authorization MUST reference the exact `journeyContextRevision` it reviewed; an authorization also records an immutable scope/consent snapshot. A later projection revision MUST NOT mutate or silently revalidate an earlier proposal or authorization.

```ts
type JourneyContext = {
  threadId: string
  revision: number
  throughEventId: string
  sourceSnapshotRefs: string[]
  originalAsk: string
  facts: JourneyFact[]
  activeConstraints: string[]
  selectedBusinessIds: string[]
  excludedBusinessIds: string[]
  openQuestions: string[]
  authorizationRefs: string[]
  updatedAt: number
}

type JourneyFact = {
  key: string
  label: string
  value: string | string[]
  provenance: 'asked' | 'understood' | 'assumed' | 'found' | 'authorized'
  sourceRef?: string
  confidence?: 'exact' | 'interpreted' | 'uncertain'
  consequence: 'search' | 'comparison' | 'shared-with-business' | 'display-only'
  editable: boolean
  lastConfirmedAt?: number
}

type JourneyProposalRef = {
  proposalRevision: number
  journeyContextRevision: number
  throughEventId: string
  sourceSnapshotRefs: string[]
}
```

These are normative design contracts, not claims that the exact runtime types already exist.

### 3.1 Context interaction contract

- Default summary: 3–7 consequence-bearing facts, then `View all context` (`LAW-7`).
- `Correct` appends a correction event and produces a new projection revision. Dependent shortlist, comparison, proposal, and permission items become `Needs refresh` (`CH-5`).
- Before send, every `shared-with-business` fact and contact field MUST be visible even when the context rail was collapsed (`LAW-5`, `AX-5`).
- Unknown is valid. Missing data MUST NOT be converted into assumptions merely to make the UI look complete (`LAW-4`).
- Shared/private context is explicit. A private link exposes only fields permitted by its access contract.

## 4. Provenance vocabulary

| Provenance | Exact meaning | UI treatment | Correction / lifecycle rule |
|---|---|---|---|
| **Asked** | The person explicitly supplied this value. | Label `You said`; retain original text/value and time. | Edit appends a new revision and marks dependent results stale. |
| **Understood** | AE interpreted meaning from the person’s words. | Label `AE understood`; show source phrase and interpretation together. | One-action `Correct`; consequential interpretations require confirmation before send. |
| **Assumed** | AE filled a missing value to keep progress moving; it is not user- or source-confirmed. | Label `Assumption`; show why it was used. | NEVER silently share a consequential assumption. Confirm, remove, or convert to `Asked`. |
| **Found** | Read from a named published business/catalog source. | Label `Listed by {source}` with source ref and freshness where available. | User correction may affect their comparison, but the source value remains attributed and is never overwritten. |
| **Authorized** | The person explicitly allowed one named action and disclosed data scope. It is permission, not factual truth or standing authority. | Label `You allowed`; expose principal, recipient/action, fields, purpose, time, receipt reference, and posture: `active`, `completed`, `expired`, or `revoked`. | Scope or projection changes invalidate it. **Authorized is one-use and never reusable.** Completion consumes it; expiry/revocation forbids execution. Completed actions remain historical receipts. |

<!-- tape-out: A12-related -->

Provenance transitions are append-only: `assumed → asked` after explicit confirmation; `understood → asked` after correction/confirmation; `found` never silently becomes `asked`; `authorized` never substitutes for factual provenance. Authorization posture MUST be read from its authority record, not inferred from the projected fact. History remains reconstructable (`LAW-6`).

## 5. Confirmation-depth mapping

Confirmation follows consequence, not screen or component (`AX-2`). The four depths may coexist in one thread.

| Depth | Applies at journey stages | Required presentation | Not sufficient for |
|---|---|---|---|
| **1. Link-out review** | Ask, shortlist, compare; opening a public business/evidence source; decide/handoff when merely navigating. | Named destination, preserved thread state, return path. Example: `View {business} page`. | Sharing private data, sending an inquiry, accepting terms, destructive actions. |
| **2. Inline confirmation** | Clarify when adopting a consequential assumption; proposal when choosing shared fields; evaluation when saving user-entered criteria. | Scope adjacent to symmetric action/refusal. Example: `Share email with {business}` / `Don’t share`. | Externally observable send; destructive/irreversible actions. |
| **3. Modal confirmation** | Irrecoverably discarding a consequential draft; destructive close/withdraw; replacing a recipient when prepared work cannot be recovered. | Object, consequence, retained/deleted data, named destructive action, focus return. | Routine navigation, reversible edits, or inquiry send. Do not add modal friction where autosave recovers (`D5`). |
| **4. Pending lock + receipt** | Send and any future externally observable request, vendor submission, or protected action. | Exact recipient/scope → named commit → disabled `aria-busy` pending state → authoritative child receipt with ID, timestamp, state, recovery, and private revisit path (`AX-5`, `LAW-6`). | Business acceptance, booking, payment, quote acceptance, dispatch, or confirmation. Receipt proves only AE’s recorded handoff. |

### 5.1 Confirmation invalidation rules

1. Changing recipient, recipient-binding revision, service, capability, body, shared fields, purpose, expiry, or referenced `JourneyContext` revision after review invalidates authorization.
2. Retrying an unknown send outcome MUST first read back by operation/idempotency key; it MUST NOT create a second inquiry.
3. A business reply creates information, not authority. Every new consequential action starts a new proposal and confirmation cycle (`AX-6`).
4. Consent is object- and consequence-specific. `Help me find a plumber` is not authorization to contact one; `send this inquiry` is not authorization to book, charge, dispatch, accept, or confirm.
5. Completed, expired, or revoked authorization MUST NOT be reused. A retry uses the original child operation identity only when policy declares it the same operation and its retry budget remains eligible.
6. At commit, `R1TargetAdmitted` and the full authority tuple MUST be re-evaluated atomically. Any drift (including suppression, recipient-binding revision, claim/owner routability, readiness, expiry, or canonical payload digest) returns the applicable named typed refusal, invalidates the review, and requires a fresh review before any later attempt. <!-- tx-lens -->

## 6. Temporal Operations Contract

<!-- tape-out: A11 -->

Every waiting state MUST have one named clock owner, an inspectable deadline/budget, an idempotency key, and a terminal owner. Clock transitions append events and update projections; they MUST NOT rewrite receipts or silently reset elapsed time. `sent` never means confirmed. AE never books, charges, dispatches, accepts a quote, or confirms; the business confirms.

<!-- journey-system: B6/C5 -->
### 6.1 Clock registry

| Clock / waiting state | Named clock owner | SLA / trigger | Idempotency key | Required transition and recovery | Terminal owner |
|---|---|---|---|---|---|
| **Dispatch sweep** (`queued` / eligible `held`) | Notification-outbox dispatch sweeper | Sweep at least once per minute; each due record is claimed with a bounded lease. An implementation MAY use a tighter SLA but MUST publish it. | `dispatch:{childActionId}:{deliveryAttemptSequence}` | Deliver or append an attempt outcome. A lost lease becomes retry-eligible; duplicate workers MUST converge on the same attempt record. | Delivery operations owner owns `sent`, `delivery_failed`, or policy `held`. |
| **Provider readback timeout** (`sending`, provider outcome unresolved) | Delivery readback reconciler | 5 minutes after provider submission begins, unless provider-specific contract declares a shorter bound. | `readback:{childActionId}:{providerSubmissionId}` | Read provider state. If authoritative state remains unavailable, transition to `status_unknown`, preserve receipt, expose exactly one `Check status` recovery. NEVER infer failure or success. | Delivery operations owner owns `status_unknown` resolution. |
| **Retry eligibility / backoff / budget** (`delivery_retrying`) | Delivery retry scheduler | Exponential backoff with jitter: 1m, 5m, 30m; maximum 3 automated attempts within 24h per child action. Non-retryable/provider-policy failures terminate immediately. | `retry:{childActionId}:{attemptNumber}` | Retry the same child operation and immutable payload only. Exhaustion transitions to `delivery_failed` with one recovery: `Choose another contact path` (or an explicitly safe manual retry). | Delivery operations owner owns exhausted and non-retryable failures. |
| **No-reply window** (`awaiting_reply`) | Inquiry response-window scheduler | Use a business-supplied response window when present; otherwise the published category/channel default. The basis and deadline MUST be shown. No hidden reset after delivery/retry. | `no-reply:{childReceiptId}:{windowVersion}` | At deadline, append exactly ONE terminal `No reply received` item with “AE cannot guarantee a reply” and one recovery action selected for state: `Contact business another way`, `Choose alternatives`, or `Close request`. NEVER emit recurring no-reply status notes. | Inquiry lifecycle owner owns terminal no-reply posture. |
| **Stale pending-lock reconciliation** (`pending` UI lock without authoritative resolution) | Inquiry operation reconciler | Reconcile on reload immediately and by sweep within 2 minutes of lock lease expiry. | `pending-lock:{operationKey}:{lockEpoch}` | Resolve to the existing child receipt, recoverable failure, or `status_unknown`. NEVER expose a new send action until absence of an operation is authoritative. | Inquiry kernel owner owns lock release and duplicate prevention. |
| **Snooze expiry** (`snoozed`) | Owner-request requeue scheduler | At the persisted timezone-aware owner deadline. Deadline and IANA timezone MUST be inspectable; timezone-rule changes MUST preserve the recorded instant. | `snooze-expiry:{threadId}:{snoozeRevision}:{deadline}` | At deadline, append exactly one expiry event and requeue the owner thread as `needs_attention`. If a registered customer-answer transition requeues it earlier, the clock MUST be idempotently consumed and MUST NOT requeue twice. | Owner inbox lifecycle owner owns requeue, early-consumption proof, and terminal `needs_attention`. |
| **Notification cessation on close** (`closed`, `withdrawn`, completed terminal request) | Notification preference/dispatch policy owner | Effective and durably verified **before the next dispatch claim**, and no later than 1 minute after close is recorded. A dispatcher MUST NOT claim the next notification for that purpose until cessation posture has been checked. | `notification-cease:{threadId}:{closeRevision}` | Cancel unsent operational notifications not legally/operationally required; append cessation proof; reject future reply/status campaigns for the closed purpose. The dispatch claim path MUST verify that proof or current cessation state before claiming. A late business reply may remain in the durable record but MUST NOT restart notifications without new purpose-bound consent. | Notification policy owner owns cessation proof; dispatch authority owns enforcement before every subsequent claim. |
| **Retention expiry** (access key, operational payload, PII, evidence metadata) | Privacy retention scheduler | Each object MUST carry `retentionClass`, `expiresAt`, and legal-hold posture at creation. Sweep daily; access-key expiry/revocation takes effect immediately. | `retention:{objectId}:{retentionPolicyVersion}:{expiresAt}` | Revoke/expire bearer access; erase eligible PII/payload while preserving only permitted evidence hashes/metadata; append auditable expiry outcome. Legal hold MUST be explicit and separately authorized. | Privacy/data owner owns deletion evidence and exceptions. |

Clock values above are the default normative SLAs. A category/provider-specific override MUST be versioned, more explicit, visible at the waiting item, and MUST NOT weaken idempotency, terminal ownership, or boundary honesty.

### 6.2 Notification-channel contract
<!-- journey-system: A3/A6/C4 -->

The notification deep-link envelope is normative for **both customer and owner audiences**:

`{ target: '/t/:threadId?k=' | '/owner/inquiries/$threadId', event: <exact event type>, focus: <signed item target bound to key-version>, purpose: <purpose-bound notification scope>, cessationRef: <cessation posture/proof reference> }`

- Every notification payload MUST carry the redirect-safe canonical `target` URL; providers MUST NOT construct, rewrite, or infer route destinations.
- `event`, `purpose`, `focus`, and `cessationRef` MUST be carried end to end. `focus` MUST be signed, audience-bound, and expire with customer key rotation or the corresponding owner authorization context.
- A valid focus opens and focuses the exact linked item. Invalid, expired, or rotated focus MUST degrade to the canonical record top with an orientation banner derived from the audience-scoped visit cursor; it MUST NOT reveal whether a foreign item exists.
- Customer targets MUST resolve to `/t/:threadId?k=`. Owner targets MUST resolve to `/owner/inquiries/$threadId`, pass through sign-in using an allowlisted redirect-safe canonical URL when authentication is needed, then restore `event`, `purpose`, and signed `focus`.
- Owner notifications MUST resolve to the owner’s configured purpose-bound channel or channels. Exactly one AE notification-outbox dispatch authority MUST claim and dispatch each channel attempt; multiple delivery providers MUST NEVER race, duplicate, or independently decide channel policy.

| Channel | Role | Default rule | Message contract |
|---|---|---|---|
| **Email** | Primary asynchronous return channel | Default only when email was already required/shared for the inquiry | Sender identity, thread purpose, exact new event, business name, count status where plural, safe private deep link, and boundary-honest next step. No reply claim when only delivery changed. |
| **SMS** | Optional high-urgency alert | Offer only when phone is already needed and the user separately chooses SMS; NEVER bundle with marketing consent | Extremely short event + private link. Avoid sensitive brief content in message previews. |
| **Browser notification** | Optional convenience | Ask only after value or send, never on landing | Event-specific alert; click opens relevant item. Denial MUST NOT impair inquiry. |
| **Private link copy** | User-controlled fallback | Always available on receipt | Copy/share `/t/:threadId?k=`; explain possession grants access and the link must remain private. Key MUST NOT enter public analytics, sitemap, canonical metadata, or page title (`IA-1`). |

Operational notifications MUST name channel, event, purpose, and opt-out. Marketing consent is separate and absent. Closing the request activates the cessation clock above.

### 6.3 Private-link return contract

`/t/:threadId?k=` is the canonical private record for externally observable inquiry state (`IA-1`). On return it MUST:

1. validate the key without revealing whether another thread exists;
2. open at the newest meaningful response, not the top of a long transcript (`CH-8`);
3. show inquiry identity, selected businesses, sent payload, child receipt IDs/timestamps, and current per-recipient states (`LAW-6`);
4. distinguish business reply from AE normalization; original reply remains inspectable (`CH-2`);
5. show key validity/sharing posture and a safe loss/recovery path;
6. present exactly one primary next action for the current state (`CH-9`).

### 6.4 Partial-results contract

The experience MUST NOT wait for every business. Each recipient renders independently:

| Field | Requirement |
|---|---|
| **Recipient identity** | Business name and exact selected destination/channel posture. |
| **Current state** | `preparing` · `sending` · `sent` · `delivery_retrying` · `delivery_failed` · `awaiting_reply` · `clarification_requested` · `responded` · `declined` · `business_unavailable` · `withdrawn` · `status_unknown` · `no_reply`. Text-first, never color alone (`DS-7`). |
| **Last observed at** | Timestamp with honest source/readback boundary. |
| **Known result** | Quote/timing/availability only when supplied by the business; otherwise `Not provided`. |
| **Original response** | Inspectable verbatim payload with source/channel and timestamp. |
| **AE normalization** | Separate derived fields visibly marked `Organized by AE`; no invented totals or commitments. |
| **Next transition** | Expected event, responsible party, and applicable deadline. |
| **Primary recovery** | Exactly one state-specific action (`CH-9`). |

A late response appends a linked response and refreshes the derived comparison; it NEVER rewrites the send receipt (`LAW-6`). The first actionable response creates return value. `Wait for all` MAY be user-selected but MUST NOT be the default gate.

## 7. R0 value covenant

<!-- tape-out: A9 -->

Before PII, sign-in, notification permission, payment, or external-send consent, R0 MUST deliver the minimum free-value floor:

1. editable interpreted-need readback with explicit assumptions;
2. a useful candidate set when evidence supports one, otherwise a named mismatch and relax action;
3. a decision-relevant comparison with source, date, unknown, and `business will quote` posture;
4. a portable editable brief the user can copy without authorizing AE;
5. clear exits to call/open, adjust, save/copy, close, or ask selected businesses.

This floor MUST NOT be paywalled, identity-gated, degraded, delayed, or reordered by undisclosed payment or commercial influence. Paid placement, sponsorship, affiliate economics, or other commercial influence MUST be structurally separate from evidence ranking: independent fields, independent projections, and no commercial input to evidence score/order. Any influenced placement MUST carry durable disclosure in both the human surface and machine-readable output, including influence type and sponsor/source reference.

R0 ends visibly at **`Your shortlist is ready`** with zero inquiry chrome unless the cohort is eligible and the user elects the inquiry branch. Calling, opening a business page, copying a brief, making a supported decision, or closing after receiving the decision aid are terminal successes—not dropout or churn. AE MUST NOT trigger lifecycle marketing, resurrection prompts, or generic re-engagement from archived/closed R0 threads. Only a user-requested, purpose-bound operational notification may occur, and it ceases when that purpose terminates.

## 8. Cross-stage durability and exits

Every journey item carries stable ID/URL, friendly status, authoritative state one level deeper, created/updated timestamp, known facts, next expected transition, primary action, recovery action, and visibility/retention posture (`LAW-2`, `LAW-3`). Every stage exposes at least one work-preserving exit:

- **Save** persists the current revision; it never implies send.
- **Copy private link** shares only what the access contract permits.
- **Copy summary/message** provides a portable handoff without claiming AE tracks what happens next.
- **Choose another path** preserves prior work.
- **Get notified** is offered only for an observable named event and purpose; it never promises a reply.
- **Close without choosing** is a valid terminal success. The permitted durable record remains readable, and notification cessation begins immediately.

A toast MAY acknowledge save/copy, but lifecycle evidence MUST live in the thread/receipt (`LAW-6`).
