# AE Journey Contract — expectation versus presentation

**Status:** design authority candidate · **Scope:** customer journey from first ask through business handoff · **Grounding:** `IA-BEHAVIORAL-FOUNDATIONS.md` and `DESIGN-STUDY-EXEMPLARS.md`, plus current `src/modules/registry` and `src/modules/inquiries` contracts.

## 1. Governing promise

AE is a **request-authority** service. It may help a person search published business pages, structure a request, and send a written first-contact inquiry to a published business for owner review. It does **not** book, charge, dispatch, accept a quote, confirm availability, or guarantee a response. The business remains the authority for availability, price, timing, acceptance, and fulfilment (`AX-3`, `AX-6`, `AX-7`; `LAW-4`, `LAW-5`).

The journey is one durable document spine at `/t/:threadId`, not a chain of disposable chat screens (`D1`, `D2`, `LAW-2`, `LAW-9`). Each stage below is a semantic state of that object. A stage may be skipped when unnecessary, but its authority boundary may not be collapsed into the next stage (`CH-1`, `AX-6`).

### Current-source honesty baseline

| Capability | What exists now | Presentation consequence |
|---|---|---|
| Registry discovery | Published catalog search over business/service documents. Searchable facts include business/service identity, category, suburb/state, service area, hours-or-unknown, request channel/mode, capability status, trust tier, photos, and optional response-time data. Results are paginated and capped. | Say **“matches from published business pages”**, not “all nearby businesses” or “best businesses.” Show active constraints and source scope (`LAW-4`, `LAW-8`). |
| Matching | No source-owned `src/modules/matcher` module was found in the inspected current module tree. Registry search establishes matches; it does not establish a universal quality ranking or personal recommendation. | Until a matcher contract exists, order is **search result order**, not “AI-ranked best.” Comparison rationales must be traceable to published fields (`CH-2`, `CH-5`). |
| Inquiry | One business + one published service + one published capability per submission. Body and optional contact are recorded; unsafe booking/payment/dispatch/job-acceptance intent is refused. Submission creates a thread, first customer message, owner notification, operation/audit records, receipt access key, and a queued/sent/failed/held delivery state. Duplicate operations replay idempotently. | The commit action is singular: **“Send inquiry to {business}.”** Never imply broadcast, booking, quote acceptance, or autonomous execution (`LAW-5`, `LAW-6`). |
| Reply/readback | Private receipt link requires thread ID **and** access key. Customer record exposes business identity, submitted-message summary, delivery state, timeline, any saved owner reply, closed state, and updated timestamp. | “Sent” describes the written handoff record, not business acceptance. Delivery failure/hold does not erase the saved inquiry (`LAW-3`, `LAW-4`, `LAW-6`). |
| Multi-business response evaluation | No inspected source contract creates a procurement event, broadcasts one inquiry to several businesses, normalizes multiple quotes, or accepts/places an order. | “Compare responses” and “evaluation plan” are journey contracts for future kernel-enabled work, not claims of current automation. In current product, evaluate one saved reply at a time and offer explicit manual comparison/import where available. |

## 2. Stage contracts

Every table has the same six required contract rows. **Status label** is the friendly user label; the durable state remains inspectable one level deeper (`LAW-3`, `LAW-7`, `DS-7`).

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
| **What AE actually does** | Prepares a first-contact message for **one** resolved published business/service/capability. Current policy refuses booking, payment, dispatch, quote acceptance, or job-acceptance intent. It can include optional customer contact fields. |
| **What we present** | **Item:** proposal card with recipient, service, message draft, fields to share, reason for selection, unknowns, expected next step, and explicit non-outcomes (`AX-1`). **Status:** `Inquiry draft ready`. **Primary action:** `Review inquiry to {business}`. **Boundary copy:** “This asks the business to reply. It does not book, accept a quote, or confirm availability.” |
| **Expectation gaps & correction** | Replace “AE will get quotes” with “Ask {business} for a quote” when `quote_request` is published. If multiple candidates remain, require separate proposals/consents; do not imply broadcast capability. Keep draft editable (`AX-6`, `LAW-5`). |
| **State on reload/return** | Recipient/service IDs, capability kind, exact draft, selected contact fields, originating ask, and proposal revision persist. Catalog drift triggers re-review rather than silent retargeting (`LAW-2`, `LAW-4`). |
| **Exit ramps** | `Save draft`; `Copy message`; `Open business contact option`; `Choose another business`; `Return to comparison`; notification/reminder for the saved draft, never an implied send. |

### Stage 6 — Consent / review

| Contract row | Contract |
|---|---|
| **User’s mental model** | “Continue” may be treated as harmless navigation; chat users may assume the agent already has standing permission. |
| **What AE actually does** | Requires explicit review of the exact recipient, request body, contact fields, and consequence before the externally observable send. This is request authority only (`AX-2`, `AX-3`, `AX-5`). |
| **What we present** | **Item/screen:** dedicated pre-send review repeating recipient, service, body, contact scope, expected reply path, and limits. **Status:** `Ready for your approval`. **Primary action:** `Send inquiry to {business}`. Secondary: `Don’t send`. **Boundary copy beside CTA:** “The business decides whether and how to respond; nothing is booked or confirmed.” (`LAW-5`). |
| **Expectation gaps & correction** | Consequence-bearing facts are repeated, not hidden behind “details.” Any changed recipient/body/contact after review invalidates approval and returns to review. Avoid generic `Confirm`, `Submit`, or prechecked consent (`AX-3`, `AX-4`). |
| **State on reload/return** | Unsigned review remains a draft; no send is inferred. The review object restores exact scope and shows whether source facts changed. Authorization is recorded only after the named commit action (`LAW-2`, `CH-5`). |
| **Exit ramps** | `Don’t send`; `Save draft`; `Edit message`; `Remove contact field`; `Copy message to contact directly`; `Choose another business`. All preserve the prior research/shortlist. |

### Stage 7 — Send

| Contract row | Contract |
|---|---|
| **User’s mental model** | Pressing send may mean the business received, read, accepted, or started acting. Chat animation can falsely imply success. |
| **What AE actually does** | Creates/replays an idempotent inquiry operation: thread, first customer message, owner notification, audit/funnel records, private access key, and delivery state. Initial notification may be `queued` or `held`; failures are possible. |
| **What we present** | **Item:** pending-lock replaces the CTA in place. **Status:** `Sending inquiry` only while operation is unresolved. **Primary action:** disabled named send with `aria-busy`; then route to receipt. **Boundary copy:** “Creating a written handoff record; do not close or send again.” (`AX-5`, `LAW-4`). |
| **Expectation gaps & correction** | Never animate “sent” before authoritative readback. An uncertain readback is `Status unavailable—check again`, not failure or success. Replay returns the same receipt rather than creating a duplicate (`LAW-3`, `LAW-4`). |
| **State on reload/return** | Because the inquiry object is created before completion, reload resolves the operation key to the existing receipt or a recoverable failure. Never show a fresh active send button while outcome is unknown (`LAW-2`, `AX-5`). |
| **Exit ramps** | During the lock: `Return to saved thread` only if safe; after timeout: `Check status`, `Copy support ID`, `Save receipt link`. Never offer “send again” until readback proves no operation exists. |

### Stage 8 — Pending / wait

| Contract row | Contract |
|---|---|
| **User’s mental model** | Maps/chat immediacy suggests a quick answer; “sent” can imply acceptance. Silence may be interpreted as AE failure. |
| **What AE actually does** | Maintains a customer record with delivery `queued`, `sent`, `failed`, or `held`. Owner thread state is separate (`unread`, `read`, `replied`, `closed`). A saved inquiry may need delivery review even though the message itself is durable. |
| **What we present** | **Item:** durable receipt/timeline. **Status labels:** `Queued for business delivery`, `Delivery recorded`, `Delivery needs review`, or `Held for review` (current readback vocabulary). **Primary action:** state-specific `Check for reply`, `Review delivery issue`, or `Choose another contact path`. **Boundary copy:** “Delivery status is not business acceptance. The business confirms any next step.” (`LAW-3`, `LAW-6`). |
| **Expectation gaps & correction** | Separate “AE saved it,” “delivery recorded,” “business replied,” and “closed.” Do not invent an expected response window unless sourced; if shown, label it as an estimate and its basis. Delivery failure never becomes “business declined” (`LAW-4`). |
| **State on reload/return** | Private receipt URL (thread ID + access key) shows latest delivery label, updated time, submitted summary, four-step timeline, reply if any, and closed time. Thread ID alone grants no access (`LAW-6`). |
| **Exit ramps** | `Copy private receipt link`; `Get notified of a saved reply` where configured; `Contact business another way`; `Return to shortlist`; `Close this request`. Preserve receipt and message even on delivery failure. |

### Stage 9 — Responses arrive

| Contract row | Contract |
|---|---|
| **User’s mental model** | AE may be expected to monitor all channels, parse every reply, and treat a positive message as a confirmed job. |
| **What AE actually does** | Current customer readback can expose an owner reply saved on the inquiry record, with body and timestamp. It does not prove coverage of off-platform phone/email replies, nor convert reply text into booking/price/acceptance authority. |
| **What we present** | **Item:** new linked business-reply conversation item; never mutate the original receipt (`LAW-6`). **Status:** `Business replied`. **Primary action:** `Review reply`. **Boundary copy:** “This is the business’s message. Check price, timing, conditions, and how they want you to proceed.” |
| **Expectation gaps & correction** | Distinguish verbatim business content from AE summary. Mark missing fields rather than inferring agreement. “Interested” is not “accepted”; “estimate” is not a final quote; a reply is not a booking (`LAW-4`, `CH-2`). |
| **State on reload/return** | Receipt timeline marks `Business replied` complete and preserves the reply body/timestamp alongside original request and delivery history. Notification deep-links to this durable item, not a transient toast (`LAW-2`, `LAW-6`). |
| **Exit ramps** | `Save/copy reply`; `Open original inquiry`; `Ask business to clarify` through an explicitly supported reply path; `Return to comparison`; `Close request`; notification preferences remain inspectable. |

### Stage 10 — Evaluate

| Contract row | Contract |
|---|---|
| **User’s mental model** | An AI evaluator should normalize quotes, spot hidden differences, rank options, and recommend the winner. |
| **What AE actually does** | Current inspected inquiry source provides a saved reply, not a multi-response normalization/evaluation engine. AE may structure user-entered or saved facts and flag missing information, but authoritative price, scope, timing, and conditions remain business-provided. |
| **What we present** | **Item:** evaluation worksheet, explicitly `Preview/manual comparison` until backed by a durable evaluation source. **Status:** `Reply ready to evaluate` or `More information needed`. **Primary action:** `Review against your criteria`. **Boundary copy:** “AE can organize the information; verify the business’s terms before deciding.” (`CH-4`, `LAW-7`). |
| **Expectation gaps & correction** | No synthetic total, fabricated confidence, or universal winner. Each criterion carries provenance; incomparable units/conditions stay visibly incomparable. Recommendation language must state the user criterion it optimizes and the missing facts (`CH-5`, `LAW-4`). |
| **State on reload/return** | Durable evaluation object/version stores criteria, candidate/reply references, extracted or entered facts, provenance, unknowns, and user corrections. Until that object exists in source, persist only the thread’s reply and user-authored notes—never fake an evaluation state (`LAW-2`). |
| **Exit ramps** | `Save evaluation`; `Copy questions for the business`; `Export/copy comparison`; `Pause decision`; `Return to replies`; notify on a new saved reply, not on a predicted outcome. |

### Stage 11 — Decide / handoff

| Contract row | Contract |
|---|---|
| **User’s mental model** | “Choose” may mean AE books, orders, pays, schedules, or guarantees the supplier will proceed. |
| **What AE actually does** | Records at most the user’s selection/context and provides a handoff path. The current inquiry authority does not accept a quote, place an order, book, charge, dispatch, or confirm. The business and user complete the next agreement through the business-supported channel. |
| **What we present** | **Item:** decision summary + handoff instructions. **Status:** `Ready to contact business` / `Request closed`; never `Booked`, `Ordered`, or `Confirmed`. **Primary action:** `Continue with {business}` only when the destination/action is named; otherwise `Copy decision summary`. **Boundary copy:** “AE has not accepted, booked, or paid. Confirm the final scope, price, timing, and terms with the business.” (`AX-6`, `AX-7`). |
| **Expectation gaps & correction** | Selecting a candidate is context selection, not execution. Any future protected action requires a new proposal/readback/authorization contract; prior inquiry consent is not standing authority (`AX-2`, `AX-6`). |
| **State on reload/return** | Thread preserves the chosen candidate, decision rationale/criteria, original inquiry, receipt, reply, and explicit lifecycle label. A closed request remains readable; reopening creates a new turn/fork rather than rewriting history (`LAW-2`, `LAW-6`). |
| **Exit ramps** | `Copy decision summary`; `Open business-provided contact path`; `Save for later`; `Choose another business`; `Close without choosing`; `Share private link`. No-shame close retains all work. |

## 3. Inspectable cross-stage context object

### 3.1 `JourneyContext` contract

The context rail is a compact, editable view of what AE is carrying—not a generic “memory” banner (`CH-5`). It is visible on request, appears automatically before consequential proposals, and is snapshot into every proposal/authorization receipt.

```ts
type JourneyContext = {
  threadId: string
  revision: number
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
```

This is a design projection, not a claim that these exact runtime types already exist.

### 3.2 Provenance vocabulary

| Provenance | Exact meaning | UI treatment | Correction rule |
|---|---|---|---|
| **Asked** | The person explicitly supplied this value. | Label `You said`; retain original text/value and time. | User may edit; edit creates a new revision and marks downstream results stale where relevant. |
| **Understood** | AE interpreted meaning from the person’s words (for example, “tonight” → a date/time window). | Label `AE understood`; show source phrase and interpreted value together. | One-action `Correct`; consequential interpretations require confirmation before send. |
| **Assumed** | AE filled a missing value to keep progress moving. It is not user- or source-confirmed. | Label `Assumption`; visually distinct from facts, with why it was used. | Never silently share a consequential assumption. Confirm, remove, or convert to `Asked`/`Authorized`. |
| **Found** | Read from a named published business/catalog source. | Label `Listed by {source}` with source link/ref and freshness where available. | User can flag/correct for their own comparison, but the source value remains attributable rather than overwritten. |
| **Authorized** | The person explicitly allowed a named action or data scope. It is permission, not factual truth or standing authority. | Label `You allowed`; show recipient, fields/action, time, and receipt reference. | Scope changes invalidate it. Revocation is shown where supported; completed sends remain historical receipts. |

**Provenance transitions are append-only:** `assumed → asked` after explicit user confirmation; `understood → asked` after correction/confirmation; `found` never silently becomes `asked`; `authorized` never substitutes for any factual provenance. History remains reconstructable (`LAW-6`).

### 3.3 Context interaction contract

- Default summary: 3–7 consequence-bearing facts, then `View all context` (`LAW-7`).
- Each fact supports a single `Correct` action; changing one fact does not force a restart, but marks dependent shortlist/comparison/proposal items **Needs refresh** (`CH-5`).
- Before send, show every `shared-with-business` fact and contact field even if the context rail was collapsed (`LAW-5`, `AX-5`).
- Unknown is a valid value. Do not convert missing data into assumptions merely to make the UI look complete (`LAW-4`).
- Shared/private context is explicit. A private link does not expose contact fields unless the receipt access contract allows it.

## 4. Confirmation-depth map

Confirmation follows consequence, not screen or component (`AX-2`). The four depths may coexist within one thread.

| Depth | Applies at journey stages | Required presentation | Not sufficient for |
|---|---|---|---|
| **1. Link-out review** | Ask, shortlist, compare; opening a public business page or evidence source; decide/handoff when merely navigating to a business-supported channel. | Named destination, preserve thread state, return path. Example: `View {business} page`. | Sharing private data, sending an inquiry, accepting terms, destructive actions. |
| **2. Inline confirmation** | Clarify when adopting a consequential assumption; propose inquiry when choosing which fields may be shared; evaluation when saving user-entered criteria. | Scope adjacent to symmetric action/refusal. Example: `Share email with {business}` / `Don’t share`. | The actual externally observable send; destructive/irreversible actions. |
| **3. Modal confirmation** | Removing/discarding a consequential draft without recovery; closing/withdrawing where the action is destructive or irreversible; replacing a selected recipient after prepared work when loss cannot be autosaved. | Object + consequence + what is retained/deleted; destructive action named; focus return. | Routine navigation, reversible edits, or the inquiry send itself. Do not add modal friction where autosave provides recovery (`D5`). |
| **4. Pending lock + receipt** | Send. Any future externally observable request, vendor submission, or protected action. | Repeat exact recipient/scope → named commit → pending disabled state/`aria-busy` → authoritative receipt with ID, timestamp, state, recovery, private revisit path (`AX-5`, `LAW-6`). | Business acceptance, booking, payment, quote acceptance, dispatch, or confirmation. The receipt proves AE’s recorded handoff only. |

### Confirmation invalidation rules

1. Changing recipient, service, capability, body, or shared contact scope after review invalidates send authorization.
2. Retrying an unknown send outcome first performs readback using the operation key; it must not create a second inquiry.
3. A business reply creates information, not authority. Any new consequential action starts a new proposal/confirmation cycle (`AX-6`).
4. Consent is object- and consequence-specific. “Help me find a plumber” is not authorization to contact one; “send this inquiry” is not authorization to book or pay.

## 5. Cross-stage durability and exit contract

Every journey item carries: stable ID/URL, friendly status, authoritative state one level deeper, created/updated timestamp, known facts, next expected transition, primary action, recovery action, and visibility/retention posture (`LAW-2`, `LAW-3`).

Every stage exposes at least one exit that preserves work. The shared vocabulary is:

- **Save** — persists the current object/revision; never implies send.
- **Copy private link** — shares only what that link’s access contract permits.
- **Copy summary/message** — gives the user a portable handoff without claiming AE tracked what happens next.
- **Choose another path** — browse, contact directly, change business, or close; prior work remains in history.
- **Get notified** — only offered for an event AE can actually observe (for example, a reply saved on the receipt). It names channel, event, and opt-out; it never promises a response.
- **Close without choosing** — a valid terminal state, not failure. The durable record remains readable.

A toast may acknowledge a save/copy, but lifecycle evidence always lives in the thread/receipt (`LAW-6`).