# `/t/:threadId/compare` | Compare business replies

<!-- sim: G1 -->


## Projection model (decision 2026-07-13) <!-- generative-comparison -->

Comparison is **one versioned domain object, two projections, generative interaction through the composer**:

1. **Domain object** — `{ comparisonBasis@revision, responseVersions[], cells }` (kernel K5/K6). Every cell carries provenance (`business-verbatim` | `ae-extracted`) . A basis change produces a **new revision**; prior revisions remain reachable and are never recomputed.
2. **In-thread projection** — the `comparison` conversation item renders a compact slice (3–4 leading criteria, expandable) and is the interaction surface. Refinement is conversational: the customer asks in the composer ("add warranty", "only available this week"); the model edits the basis; a new revision appears as a new item state. The thread stays the decision narrative (CH-7).
3. **This route** — the full-width canonical projection of the same object: the workbench, export target, and citable URL. A renderer, never a second implementation.

**Generative boundary:** the model fills a typed structure; the renderer is deterministic. The model MAY propose criteria and extract values from replies (provenance-marked). The model MUST NEVER author layout/markup, invent cell values, normalize non-commensurable content into fake equivalence, rank, score, or select a winner. Unknown renders as "not addressed in their reply."

## Register & scene

**Register:** product.

**Scene:** A customer has asked businesses one at a time, received at least two attributable replies, and now needs to make the decision without rebuilding the replies in a spreadsheet. The page is a quiet comparison workbench: one white document surface on a warm canvas, dense enough to inspect, restrained enough to trust.

Use the AE product palette and shared status vocabulary. Ink carries reply content, slate carries metadata, and eucalyptus marks only the active correction or primary action. Status and provenance are text-first. This is not a leaderboard, bid podium, recommendation engine, or multi-business send surface.

## Job & IA position

**One job:** place replies from sequential episodes of one thread side by side against the customer’s correctable criteria so the customer can inspect the evidence and decide.

- **Route:** `/t/:threadId/compare`.
- **Route class:** an unlisted thread projection under IA-1. It inherits the parent thread’s access, visibility, expiry, retention, and sharing posture. The route mints no separate access grant and accepts no private-record key in its URL.
- **Canonical source:** the originating thread and its episode-linked `business_response` items. Each reply remains canonically linked to its original `Your record`; this projection neither copies authority nor mutates a record.
- **Entry points:** `Compare replies` from `/t/:threadId` after the evaluation gate opens; an access-valid deep link to a candidate or criterion fragment; return from a linked record in a session that still has thread access.
- **Exits:** return to the decision record, open a source record, ask one business a bounded follow-up, ask another business through a new sequential episode, or export the comparison.
- **R1 boundary:** replies may come from multiple one-business episodes in one thread. The comparison is read-only over those sequentially obtained replies. It MUST NOT send to, authorize, select, rank, or contact multiple businesses at once.
- **Decision boundary:** **AE MUST NOT rank the businesses, name a winner, calculate a score, mark a recommended option, or imply that one reply is better. The customer decides.**

### Evaluation gate

`evaluationMode='multi-response-comparison'` is required before this route renders comparison content.

1. At least two replies MUST be attributable to distinct businesses and linked through their `episodeId`, `receiptItemId`, and source record.
2. The replies MUST share a declared comparison basis from the customer’s understood need. A field is commensurable only when both displayed replies address that same declared dimension without semantic invention.
3. One reply uses `evaluationMode='single-response-review'`; this route does not exist, no disabled `Compare replies` action appears, and no “waiting for more” shell is rendered.
4. Pending, delivery-only, declined, unavailable, withdrawn, no-reply, and unattributable episodes never become candidate columns.
5. Pending businesses MAY appear only as a one-line status list below the completed comparison. They MUST NOT create empty columns, placeholder cells, disabled future controls, or a denominator such as “2 of 3 replies.”
6. If two attributable replies exist but no declared dimension can be compared honestly, projection MUST fail closed to the two single-response reviews and explain on the thread: `These replies do not address the same criteria yet.` It MUST NOT manufacture a comparison table from unrelated prose.
7. Additional attributable replies may join only after their own sequential episode settles and the projection version advances. Existing source reply text and provenance remain immutable.

## Layout

**Skeleton:** a focused workbench inside `max-w-7xl`, `px-4 md:px-6`. Header, criteria controls, comparison matrix, verbatim reply sections, pending status, and actions follow one document order. On wide screens, the first criteria column is sticky only within the matrix’s scroll container; the page itself has no right rail. Candidate columns have a readable minimum width and the matrix scroll region is explicitly labelled. At ≤375px, the matrix becomes stacked candidate sections with repeated criterion labels and no horizontal scroll.

### Desktop

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Decision record   COMPARE BUSINESS REPLIES     Private · Updated <time>   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Need: Pest control for three sites                                           │
│ Compare 2 replies · Criteria from your understood need     [Edit criteria]   │
│ Replies stay in business words and source order. You decide.                │
<!-- de-hedge -->
│                                                                              │
│ ┌────────────────┬────────────────────────┬────────────────────────┐          │
│ │ YOUR CRITERIA  │ Acme Pest Control      │ Northside Pest         │          │
│ │                │ Reply received <time>  │ Reply received <time>  │          │
│ │                │ [Open Your record]     │ [Open Your record]     │          │
│ ├────────────────┼────────────────────────┼────────────────────────┤          │
│ │ Price posture  │ “$1,240 + GST...”      │ “$1,390 incl. GST...”  │          │
│ │                │ Business words         │ Business words         │          │
│ ├────────────────┼────────────────────────┼────────────────────────┤          │
│ │ Timing         │ “Can attend 18 Jul”    │ “Week commencing...”   │          │
│ │                │ Business words         │ Business words         │          │
│ ├────────────────┼────────────────────────┼────────────────────────┤          │
│ │ Scope          │ AE extraction          │ AE extraction          │          │
│ │                │ from quoted sentence ↗ │ from quoted sentence ↗ │          │
│ └────────────────┴────────────────────────┴────────────────────────┘          │
│ Unknowns: child-safe documentation — not addressed in their reply (Acme)     │
│                                                                              │
│ Other content, shown in their words                                          │
│ Acme: “...” [Show full original]   Northside: “...” [Show full original]     │
│                                                                              │
│ Pending requests                                                             │
│ Westline Services · Waiting for business · Last checked <time>               │
│                                                                              │
│ [Export comparison]                 [Ask another business]                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

The matrix may horizontally scroll on desktop when more than three replied businesses are selected for the view, but the criteria column, business headers, and row labels remain perceivable. The default comparison opens with all eligible replied businesses in episode order; removing a column changes only this view, never the underlying thread or export source.

### Mobile, ≤375px

```text
┌───────────────────────────────┐
│ ← Record       Compare replies│
├───────────────────────────────┤
│ Pest control for three sites  │
│ 2 business replies            │
│ Updated <time>                │
│                               │
│ Your criteria                 │
│ Price · Timing · Scope        │
│ [Edit criteria, 44px]         │
│                               │
│ Business words, source order.│
│ You decide.                   │
│                               │
│ ACME PEST CONTROL             │
│ Reply received <time>         │
│ [Open Your record]            │
│ Price posture                 │
│ “$1,240 + GST...”             │
│ Business words                │
│ Timing                        │
│ “Can attend 18 Jul”           │
│ Business words                │
│ Scope                         │
│ extracted text...             │
│ AE extraction · View source   │
│ Unknown                       │
│ Documentation — not addressed │
│ in their reply                │
│ Other content, verbatim       │
│ “...”                         │
│ [Ask Acme a follow-up]        │
│                               │
│ NORTHSIDE PEST                │
│ same criterion order repeated │
│ ...                           │
│ [Ask Northside a follow-up]   │
│                               │
│ Pending requests              │
│ Westline · Waiting for reply  │
│                               │
│ [Export comparison]           │
│ [Ask another business]        │
└───────────────────────────────┘
```

At 320px and 375px there is no horizontal comparison table, sticky rail, clipped business name, or hidden provenance. Candidate sections repeat the same criterion order so cross-candidate scanning remains possible. The primary action is last in DOM and visual order within each candidate and in the page action group.

## Section anatomy

1. **Comparison header**
   - **Content:** need in the customer’s words as `<h1>`; `Compare business replies`; count of attributable displayed replies; last meaningful projection update; thread access posture; `Return to decision record`.
   - **Data source:** thread identity/access projection, current projection version, eligible response set.
   - **Astryx:** `Heading`, `Text`, centralized `AeStatusBadge`, shared `AeTimestamp`, `Button`/AE `RouterLink`. IDs and secondary retention details move into a disclosure.
2. **Criteria editor**
   - **Content:** ordered declared dimensions taken from the thread’s understood need, each with `asked`, `understood`, or `assumed` provenance. The customer may correct labels, remove an irrelevant dimension, or restore a removed dimension. Corrections change the comparison view only; they MUST NOT rewrite prior requests or business replies.
   - **Data source:** latest settled understood-need revision plus comparison-view preferences. No model-generated criterion is silently added.
   - **Astryx:** semantic definition list for read mode; `FormLayout`, text inputs/select controls, `Button` for `Save criteria`, and `Cancel` for edit mode. Save failure preserves the last settled criteria and focuses one error Banner.
3. **Decision statement**
   - **Content:** `Replies stay in business words and source order. You decide.` Place it once immediately before the comparison matrix. This positive fact replaces an ambient ranking disclaimer; exports carry their own proof boundary at export commit. <!-- de-hedge -->
   - **Data source:** comparison projection ordering and provenance contract.
   - **Astryx:** `Text`; never a warning-colour card. <!-- de-hedge -->
4. **Business headers**
   - **Content:** published business name; reply received time; episode label only if needed for disambiguation; current source-record link; reply provenance status. No rank number, ordinal merit, star, score, “best value,” “closest match,” or highlighted winner treatment.
   - **Data source:** business identity, episode, correlated `business_response`, and validated reciprocal record access.
   - **Astryx:** `Heading`, `Text`, shared `AeTimestamp`, `Button`/AE `RouterLink`. Equal visual weight for every business.
5. **Commensurable comparison rows**
   - **Content:** declared criterion, one truthful cell per displayed business, cell-level provenance, and source jump. Common row families are price posture, timing, and scope statements. Price uses the ladder: show the exact business reply where it states price; otherwise a dated business-attested indicative price may appear only as a separately labelled adjacent fact (`Callout from $90 · business-published {date}`), never as a comparable reply value; if neither exists, omit price from shared comparison and show `not addressed in their reply` where relevant. A row renders only where every displayed reply addresses the same dimension. It MUST preserve qualifications such as `estimate`, `from`, `range`, `plus GST`, `subject to inspection`, and date basis. <!-- de-hedge -->
   - **Data source:** business verbatim spans or a durable AE extraction tied to exact source spans and extraction revision. No arithmetic, unit conversion, inferred totals, or semantic normalization without an explicit, inspectable source-backed rule.
   - **Astryx:** semantic `<table>` at wide widths with `<caption>`, `<th scope="row">`, and `<th scope="col">`; stacked `<section>`/definition lists at ≤375px. `Collapsible` may reveal source context but never hide the provenance label.
6. **Unknowns by business**
   - **Content:** customer criteria a business did not address, labelled exactly `not addressed in their reply`. Unknowns are shown under the affected business, not as misleading cells in a row that implies equivalence.
   - **Data source:** declared criteria minus attributable addressed dimensions. Absence is not a negative fact and MUST NOT be scored.
   - **Astryx:** `Heading`, `Text`, semantic list. No red failure badge unless an authoritative failure exists.
7. **Non-commensurable reply content**
   - **Content:** all decision-relevant content that cannot be compared safely, grouped by business and shown verbatim. Original ordering, qualifications, exclusions, and conditions remain intact. `Show full original reply` opens or navigates to the source record.
   - **Data source:** original `business_response.response`; no normalized worksheet value.
   - **Astryx:** semantic `<section>` and block quotation where appropriate; `Collapsible` only for long content; no nested candidate cards.
8. **Pending episode status**
   - **Content:** one line per pending business below the table: business, truthful current status, last observed time, and source-record link if current access permits. Examples: `Waiting for business`, `Delivery status unavailable`, or `Delivery problem`.
   - **Data source:** episode-linked `receipt`, delivery projection, and status item.
   - **Astryx:** `<ul aria-label="Pending requests">`, centralized status badge, shared timestamp, RouterLink. Pending rows do not alter evaluation mode or candidate count.
9. **Candidate actions**
   - **Content:** `Ask {business} a follow-up` only where that business’s immediately preceding owner reply authorizes the bounded C5 turn. The action opens the exact source record and binds the composer to that reply through `answersItemId`. If no bounded turn is legal, omit the action rather than disable it speculatively.
   - **Data source:** transition registry, source record access, owner reply disposition, and C5 authorization.
   - **Astryx:** link-styled `Button`. It never edits the comparison, changes scope, or authorizes a new send.
10. **Page actions**
    - **Content:** `Export comparison`; `Ask another business`; `Return to decision record`. `Ask another business` creates a new sequential episode in the same thread and returns to the ordinary proposal → `Review what will be sent` → `Send request to {business}` path.
    - **Data source:** thread access, episode transition authority, comparison export contract.
    - **Astryx:** `Button`, AE `RouterLink`, `Dialog` only for the export preview. There is no bulk select, multi-send, award, accept, reject, or mark-winner control.

## Commensurability rules

| Content | Comparable row? | Required treatment | Forbidden treatment |
|---|---:|---|---|
| Price posture where every reply states a price, range, rate, or explicit quote basis for the same declared scope | Yes | Preserve currency, GST posture, range/from/estimate language, inclusions, conditions, and source words. Label extraction separately. | Calculating a total, stripping qualifiers, converting hourly to fixed price, or calling the lowest number “best”. |
| Timing where every reply addresses the same event, such as first attendance or start date | Yes | Name the event and preserve exact/approximate/conditional wording and timezone/date basis. | Comparing `reply time` with `attendance time`, turning “next week” into a date, or implying availability is confirmed. |
| Scope statement where every reply addresses the same requested work or exclusion | Yes | Quote the matching scope statement or show a source-linked extraction that retains exclusions and conditions. | Treating silence as included, merging unlike packages, or converting prose into a checked inclusion without evidence. |
| Warranty, validity, terms, documentation, or credentials addressed by every displayed reply under the same meaning | Yes, only when the declared dimension is identical | Keep issuer, duration, condition, standard, and source context visible. | Treating unlike warranties or self-asserted credentials as equivalent verification. |
| A criterion addressed by some, but not all, displayed replies | No shared row | Show it under each affected business; missing value reads `not addressed in their reply`. | Empty cells, dashes, zero, “N/A,” negative scoring, or “waiting for answer” unless a follow-up was actually sent. |
| Free-form qualifications, exclusions, caveats, alternate proposals, or questions that do not share a dimension | No | Show verbatim in that business’s non-commensurable section, in original order, with source link. | Forced labels, paraphrased equivalence, hidden caveats, or omission because another reply lacks the same content. |
| AE extraction without an exact source span and extraction revision | No | Fall back to business verbatim or omit the extracted cell. | Presenting model output as business words or as a normalized fact. |
| Customer-authored criterion not present when the requests were sent | Not by default | Mark it as a later customer criterion; compare only source text that genuinely addresses it. | Implying businesses were asked the later question or penalizing them for silence. |
| Amounts or dates derived by arithmetic, conversion, aggregation, or inference | No unless a separately specified deterministic rule is visible and source-backed | Keep original values and explain the rule before the result; absent such a rule, show verbatim only. | Hidden calculation, estimated tax, inferred annual cost, or fabricated common units. |

### Cell provenance contract

Every displayed value MUST carry one of these visible labels adjacent to the value:

- **`Business words`** — exact verbatim text asserted by the named business. It links to the precise original reply context.
- **`AE extraction`** — a durable extraction from named business words. It shows the extraction revision and exposes the exact quoted source span through `View source`.
- **`Customer criterion`** — the criterion wording from the understood need, with asked/understood/assumed provenance and revision.

The page MUST NOT use unlabeled summaries. AE extraction is not business confirmation, evaluation, recommendation, or fact normalization. If the source changes or extraction provenance cannot resolve, the cell becomes unavailable and the original reply remains reachable.

## Export comparison

<!-- sim: G2 -->

Every settled comparison MUST expose `Download PDF`, `Print`, and `Copy summary` through one `Export comparison` action.

1. Opening an export action MUST first show a visible **`Export preview`** containing the exact payload. Export MUST NOT begin directly.
2. **`Sanitized share`** is the default mode. It excludes private-link URLs/access keys, internal-only identifiers/evidence, and all personally identifying information except fields the customer deliberately selects.
3. The preview lists selectable fields and excludes sensitive fields by default. The customer explicitly includes each sensitive field. Candidate omission from an export MUST be explicit in the preview and MUST NOT alter the on-screen comparison.
4. The preview includes: understood need and criterion revision; displayed businesses; every visible commensurable cell with provenance; unknowns; non-commensurable verbatim content selected by the customer; source record IDs safe for export; source timestamps; comparison projection revision; and generated timestamp.
5. The preview MUST state: `This artifact proves what was sent, when, to whom, and their reply. It does not prove acceptance, availability, booking, or confirmation.`
6. Artifact metadata MUST include record IDs and generated/source timestamps in labelled mono/tabular numerals. It states `Replies remain attributed to each business. You decide.` once; do not stack a ranking disclaimer onto the proof boundary. <!-- de-hedge -->
7. Preview commit labels are exactly `Download PDF`, `Print`, and `Copy summary`; cancellation is `Cancel`.
8. The exported artifact MUST match the previewed field selection and mode byte-for-semantics. A stale source payload, criteria revision, response revision, or comparison projection requires a refreshed preview before export.
9. Export is a read action. It MUST NOT change source records, evaluation mode, business status, episode state, or notification preferences.

## States

### Loading

Render geometry-preserving skeletons for the header, criteria summary, boundary line, two eligible business headers, three comparison rows, one verbatim section, and action group. Skeletons MUST NOT invent business names, price shapes, reply state, rank, or success. Access and evaluation mode are validated server-side before participant content is returned.

### Gate closed

- **Zero or one attributable reply:** do not render this route as a comparison. Return safely to `/t/:threadId`, focus the current single-response review or pending record summary, and expose no disabled comparison chrome.
- **At least two replies but no honest shared dimension:** do not emit `multi-response-comparison`; return to the thread with `These replies do not address the same criteria yet.` and source-record actions. Never create a blank matrix.
- **Unattributable or cross-thread responses:** exclude them and record a participant-safe projection problem; if fewer than two eligible replies remain, close the gate.

### Empty and inaccessible

Use exactly one DS-13 meaning:

- **Thread unavailable / access denied / expired:** `This comparison is not available.` Action: `Return to Ask`. Use non-enumerating language when existence is sensitive.
- **Temporarily unavailable:** `This comparison could not be loaded right now. Your records have not been changed.` Actions: `Try again` and `Return to decision record` when access is already proven.
- A pending business is never an empty column or empty state.

### Error

Keep the last-authoritative comparison visible. Place one Astryx `Banner` beside the failed scope:

- criteria save failure: `Your criteria changes were not saved. The previous comparison is still shown.` Action: `Review changes`;
- extraction/source failure: show the original business words and `AE could not organize this part.` Action: `Open Your record`;
- export preview stale: `The comparison changed before export.` Action: `Refresh export preview`;
- temporary load failure: `Try again`.

Never print raw errors or silently retain a stale extraction as current.

### New reply while open

A newly settled attributable reply does not silently insert a column while the customer is reading. Show `A new business reply is ready` with `Refresh comparison`. Activating it rebuilds the projection from a named revision, preserves focused criterion where possible, and announces once. Background updates never steal focus or horizontally reposition the matrix.

### Pending, declined, and no reply

Pending episodes render only in the one-line status list below the matrix. Declined, unavailable, withdrawn, and no-reply episodes remain reachable in the thread/record history but do not become candidate columns. Their status MUST NOT be interpreted as a business score or decision outcome.

### Zero-JS and SEO posture

Settled eligible replies, criteria, provenance, boundary, unknowns, verbatim content, pending rows, and safe links server-render after access validation. Criteria edits, export preview, and new-episode actions use normal POSTs with CSRF/admission and idempotency protection. Without script, the wide semantic table remains readable and export preview is a full page step. `/t/:threadId/compare` is `noindex, nofollow`, absent from sitemap and public navigation, and canonicalized without fragments or analytics parameters.

## Interactions

- **Correct criteria:** `Edit criteria` enters inline edit mode. `Save criteria` updates only the view revision. It never edits a sent request, source reply, or business assertion. Changed criteria are visibly marked until save; `Cancel` restores the last settled view.
- **Inspect provenance:** `View source` expands the exact quote context or navigates to the stable item fragment in the source record. The browser back action returns focus to the invoking cell.
- **Column visibility:** a customer may hide/show eligible replied businesses for inspection. This is view state, not ranking or rejection. Exports preview the exact displayed/selected set.
- **Ask {business} a follow-up:** available only for a C5-authorized bounded response. It navigates to that business’s record, focuses the authorizing reply, and fixes `answersItemId`. No comparison composer is introduced.
- **Ask another business:** begins a fresh C7 sequential episode in the same thread with exactly one recipient, a fresh proposal, a complete `Review what will be sent`, and a fresh `Send request to {business}` authorization. It never fans out or reuses prior consent.
- **Export:** always opens `Export preview`; direct browser print before preview MUST use the same sanitized default payload or route into the preview contract.
- **Keyboard:** natural header → criteria → matrix → verbatim sections → pending list → actions order. Matrix cells are not individually tabbable unless they contain an action. Arrow-key grid behavior is prohibited unless implemented as a complete ARIA grid; the default is a semantic table with ordinary browser reading.
- **Focus:** source return restores the invoking control; criteria save focuses the updated criteria heading; export cancellation returns to `Export comparison`; new-reply refresh focuses the comparison heading, not an arbitrary cell. Background state never steals focus.

## Copy voice

- **Headline:** `Compare business replies`.
- **Key labels:** `Your criteria`, `Business reply`, `Price posture`, `Timing`, `Scope`, `Business words`, `AE extraction`, `Customer criterion`, `View source`, `not addressed in their reply`, `Other content, shown in their words`, `Pending requests`, `Export comparison`, `Export preview`, `Sanitized share`.
- **Decision statement:** `Replies stay in business words and source order. You decide.`
- **Source fact:** `AE extraction organizes the business’s words. Open Your record to read the original reply.` <!-- de-hedge -->
- **Actions:** `Ask {business} a follow-up`, `Ask another business`, `Return to decision record`, `Download PDF`, `Print`, `Copy summary`, `Cancel`.
- **Customer voice:** use `request`, `Your record`, and `Send request to {business}`. Never render the mechanics terms inquiry, receipt, item, tuple, lifecycle, episode, evaluation mode, or comparison gate as customer copy.
- **Banned claims:** no `best`, `winner`, `recommended`, `top`, `cheapest`, `fastest`, score, rank, preferred option, award, accepted, available, booked, confirmed, guaranteed reply, or multi-business send language. `Lowest stated amount` is also prohibited because it implies evaluative normalization; show the original amounts without judgment.

## Responsive

- `max-w-7xl`, `px-4 md:px-6`; ordinary page flow, no dashboard sidebar or floating action rail.
- At wide widths, criteria and business headers remain perceivable in the labelled matrix scroll region. Sticky behavior MUST not obscure focus, headings, or 200% zoom content.
- At ≤375px, columns become stacked candidate sections in episode order. Every section repeats the criterion labels, provenance, unknowns, source link, and bounded follow-up action. There is no horizontal table.
- Actions stack vertically with primary last in DOM and visual order; all targets are at least 44px. Long business names, source quotations, currency strings, dates, and record IDs wrap without clipping.
- At 200% zoom, all sticky behavior becomes in-flow if it would cover content. Export preview uses one column and keeps each sensitive-field control adjacent to its field.
- Validate at 320px and 375px with two and five replied businesses, three long criteria, one missing criterion per business, long verbatim exclusions, one pending episode, one stale extraction, and one new reply arriving while open.

## Accessibility

- Landmarks: `<header>`, `<main>`, criteria `<section aria-labelledby>`, comparison `<section aria-labelledby>`, pending `<section aria-labelledby>`, and export preview as an Astryx `Dialog` only when script is available.
- Desktop comparison uses a semantic `<table>` with a descriptive `<caption>`, business names as column headers, criteria as row headers, and no layout-only table cells. Stacked mobile sections preserve equivalent heading hierarchy and reading order.
- Provenance is visible text adjacent to every value. Screen readers hear business, criterion, value, provenance, and source action in that order. Colour, typography, quotation marks, or column position never carry provenance alone.
- Unknowns are announced as `not addressed in their reply`, not blank cells. Pending status is outside the table and labelled independently.
- One page-level polite live region announces deduplicated semantic changes keyed by `(threadId, comparisonRevision, responseSetRevision)`. It announces new eligible replies, saved criteria, and refreshed projection once. Timestamp ticks, hydration, column scroll, and disclosure state are silent.
- Criteria errors and export failures use one `role="alert"`. The no-ranking boundary is ordinary readable text, not repeatedly announced.
- Source fragments use `tabIndex=-1`, expand, and focus their heading after validated navigation. Collapsed source context is not focusable or announced.
- Timestamps use `<time dateTime>` and the shared formatter. Record IDs and revision metadata use labelled tabular mono text and remain selectable.
- Reduced motion reaches final disclosure, refresh, focus-scroll, and stacked/column state immediately. No shimmer, smooth auto-scroll, height tween, column slide, winner pulse, or decorative entrance animation.

## Rule compliance

| Rule / contract | How satisfied |
|---|---|
| SIM G1 | Sequentially obtained replies become one evidence-preserving comparison workbench rather than isolated records or spreadsheet re-entry. |
| SIM G2 | Export uses an exact payload preview, sanitized default, deliberate sensitive-field inclusion, fixed boundary, and stale-preview protection. |
| README two-layer voice | Customer copy says request, Your record, and Send request to {business}; mechanics remain internal to this spec. |
| CONVERSATION-ITEM §8 | `multi-response-comparison` requires at least two attributable, honestly commensurable replies; 1-of-1 remains single-response review with no future shell. |
| Journey System C3 | `/t` remains canonical for the customer’s decision and reasons; source records remain canonical for what happened. Shared identities are linked, not copied into new authority. |
| Journey System C5 | Follow-up is bounded to the authorizing business reply and source record through `answersItemId`; scope changes require fresh review. |
| Journey System C7 | Every additional business is a new sequential one-recipient episode with fresh proposal and authorization; fan-out remains forbidden. |
| LAW-2, LAW-6 | Stable thread, episode, response, and record identities preserve chronology and immutable evidence. |
| LAW-3, LAW-4 | Known facts, unknowns, source times, and business confirmation boundaries remain explicit; sent and reply states are not conflated. |
| LAW-7, CH-2–CH-5 | Business verbatim, AE extraction, criteria provenance, source spans, assumptions, and limits remain separate and inspectable. |
| LAW-8, DS-13 | Closed gate, inaccessible thread, no shared dimension, temporary failure, stale export, and source failure have one truthful meaning and recovery. |
| LAW-9, CH-7, CH-11 | This is a document workbench using the shared item/source identities, not chat bubbles or a second transcript model. |
| IA-1, IA-5, IA-8 | Route class/access are explicit, the page is unlisted/noindex, and route logic projects typed source objects rather than authoring a parallel model. |
| AX-2–AX-5 | Read comparison has no confirmation theatre; bounded follow-up navigates to its authority; new sends use the full named one-business confirmation and pending lock. |
| DS-1–DS-8, DS-12, DS-14, DS-15 | Astryx controls, semantic tokens, centralized statuses/timestamps, full state contracts, geometry-preserving loading, 44px targets, and truthful labels are specified. |
| Wedge R1 / R1 §5 | Read-only comparison across sequential one-business episodes is legal at two attributable responses; no bulk authorization, multi-recipient group, or fan-out action exists. |

## Anti-slop check

- No rank, winner, score, recommendation badge, medal, podium, highlighted “best” column, progress denominator, or colour-coded business merit.
- No spreadsheet cosplay with tiny inputs, frozen chrome everywhere, unexplained abbreviations, or hidden source caveats. Density serves comparison; every value remains readable and attributable.
- No side-stripe accents, gradient text, glass, hero metrics, identical card grid, nested cards, AI glow, blobs, ornamental charts, or decorative motion.
- No fake price, inferred total, normalized equivalence, generated testimonial, fake activity, or placeholder pending column.
- Candidate columns and mobile sections receive equal visual treatment. Eucalyptus marks active controls and focus, never the preferred business.
- Familiar table, definition-list, disclosure, export-preview, and source-link patterns disappear into the job. The distinctive quality is boundary honesty: original words remain intact, unknowns stay unknown, and the customer decides.
