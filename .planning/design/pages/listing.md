# `/:slug` — Business page

## Register & scene

**Register:** product.

**Physical scene:** A person in a bright kitchen uses a phone to check whether one local business fits a time-sensitive need before deciding whether to share any personal details, so the page uses the warm canvas, white surface, ink, slate, and restrained eucalyptus selection/action language of `aeTheme`.

## Job & IA position

**One job:** Help a customer decide whether this business is a credible fit for the need they already described, then let them begin a reviewable, single-business request without implying that contact, a quote, availability, or a booking has already occurred.

**Route class:** public discovery (IA-1). The canonical public URL is `/:slug`; no private values, access keys, thread identifiers, or telemetry parameters enter canonical metadata.

**Entry points:**

- `/registry` candidate row or shortlist result.
- `/t/:threadId` shortlist, comparison, or recommendation, carrying a correctable need-and-constraints projection.
- A canonical public URL from search, direct navigation, save, or share.

**Exits:**

- `Ask this business` opens `/:slug/inquiry`; when the target gate passes it is ALWAYS available to both thread-origin and direct/SEO visitors, selects exactly one business, and starts review without sending.
- `Tell us what you need → /` is a secondary exit for visitors who want comparison first; it MUST NOT replace the direct-entry `Ask this business` action.
- `Change need` returns to the originating thread when present, otherwise `/` with the public need text only.
- `View evidence`, `View service details`, and public contact/link-out destinations preserve a return path.
- `Back to businesses` returns to `/registry` without silently broadening its filters.

**Normative blueprint:** PRINCIPLES.md §10 `/:slug`, plus IA-6 listing/detail, IA-7 width ladder, IA-9 action-rail boundaries, LAW-4 progressive certainty, LAW-7 two disclosure levels, and AX-1/AX-6 proposal-versus-send separation.
<!-- sim: G6 -->
**Cold-arrival trust contract:** On every eligible listing, the first screen MUST show the business name plus its published phone (when the business published it), published hours, and published service area before any `Ask this business` affordance. Unknown facts remain visible as `Hours not published here` or `Service area not published here`; the page MUST NOT infer them. Within the same first-screen reading block, render the 10-second explainer exactly: `AE sends your request in writing and keeps a record — or call directly.` A published call action MUST be visually equal to `Ask this business` on this research surface. Ratings, reviews, and review counts MUST NEVER be fabricated or inferred. When no attributable review signal exists, state the evidence AE does have, for example `AE has business-published contact and service details; no attributable review information is available here.`

<!-- sim: G5 -->
**Response-posture-before-selection contract:** A response-posture label, with the attribution required in §3, MUST appear in the first-screen facts and in the action rail before any ask/send affordance. When a published phone exists, the same pre-action block MUST include `Need someone now? Call {phone}` as a peer-level call action. AE MUST route emergency-intent visitors to direct contact proudly; it MUST NOT present the written request path as an emergency channel.

<!-- sim: Lena -->
**Research-action hierarchy:** Before explicit selection, `Ask this business`, `Call {phone}`, `Visit website`, and `Copy contact details` are peer-level actions with equal visual weight and target size. Eucalyptus/primary dominance is reserved for the selected-business review flow after the person explicitly activates `Ask this business`; merely viewing a listing is not selection.

## Layout

**Skeleton:** listing/detail. Use `max-w-7xl mx-auto px-4 md:px-6`. At `lg`, use a 12-column grid with an 8-column evidence column, a 1-column breathing gutter, and a 3-column action rail. Section gaps are `gap-y-12`; page-block gaps are `gap-6`; content inside bounded surfaces uses `gap-4`. The evidence column is the height authority. The rail starts level with capability facts, is `sticky` only while its own bottom remains within the evidence-column boundary, and stops before terms. It never obscures or extends beyond the evidence that supports its summary.

**Desktop, ≥1024px:**

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AePublicShell / breadcrumb: Businesses › {business}                1280 max │
├──────────────────────────────────────────────────────────────────────────────┤
│ IDENTITY + FIRST-SCREEN TRUST FACTS                                  │ S │
│ {Business name}  [evidence posture]               [Save] [Share]        │ T │
│ Phone · hours · service area (published/unknown stated plainly)         │ I │
│ AE sends your request in writing and keeps a record — or call directly. │ C │
│ Reply posture [source · observed window · recency]                      │ K │
│ [Call {phone}] [Website] [Copy details] [Ask this business]             │ Y │
├───────────────────────────────────────────────────────┬──────────────────┤   │
│ CAPABILITY FACTS (8 cols)                              │ PROPOSAL SNAPSHOT│ R │
│ Can help with · request mode · service area · unknowns │ Your need        │ A │
│                                                       │ Constraints      │ I │
│ EVIDENCE + RESPONSE POSTURE                            │ Price            │ R │
│ sources/freshness · accepts requests · response basis │ Callout from $90 │ A │
│                                                       │ Business-published│ I │
│ HIGHLIGHTS                                             │ · 12 Jul 2026    │ L │
│ need-relevant facts, varied rows, not equal cards      │                  │   │
│                                                       │                  │   │
│ DETAIL                                                 │                  │   │
<!-- de-hedge -->
│                                                       │                  │   │
│ PROOF                                                   │ [Ask this        │   │
│ attributed evidence, limits, freshness                 │  business]       │   │
│                                                       │ [Change need]    │   │
│ SERVICE BOUNDARY                                       └──────────────────┘   │
│ included areas · excluded/unknown areas · exact/private details gated        │
│                                                                              │
│ TERMS  cancellation/response/contact terms published by business             │
└──────────────────────────────────────────────────────────────────────────────┘
```

The rail is not present beside the identity header because the first screen owns identity, the cold-arrival trust facts, response posture, and peer research actions. Its sticky range begins only after the main column has rendered the corresponding capability and response evidence. The rail MUST repeat the response posture before its ask affordance. If evidence is insufficient for an R1 destination, the rail substitutes truthful public contact/link-out actions, states `This business hasn’t joined AE yet`, and contains no request CTA. It MUST NOT describe that state with routing, destination, admission, or readiness language.

**Mobile, ≤375px:**

```text
┌───────────────────────────────┐
│ Businesses › {business}       │
│                               │
│ {Business name}               │
│ [evidence posture]            │
│ Phone (published or absent)   │
│ Hours (published or unknown)  │
│ Service area                  │
│ Reply posture · attribution   │
│ AE sends your request in      │
│ writing and keeps a record —  │
│ or call directly.             │
│ [Call] [Website] [Copy] [Ask] │
├───────────────────────────────┤
│ Can this business help?       │
│ capability facts + unknowns   │
├───────────────────────────────┤
│ Evidence and response         │
│ posture + freshness + limits  │
├───────────────────────────────┤
│ Highlights                    │
│ varied fact rows              │
├───────────────────────────────┤
│ Service details               │
├───────────────────────────────┤
│ Proof                         │
├───────────────────────────────┤
│ Service boundary              │
├───────────────────────────────┤
│ Your request                  │
│ Need · constraints            │
│ Price: Callout from $90 · business-published 12 Jul 2026 │
│ [Call] [Website] [Copy] [Ask] │
│ [Change need]                 │
├───────────────────────────────┤
│ Terms                         │
└───────────────────────────────┘
```

There is no sticky or fixed mobile action rail. First-screen trust facts, response posture, explainer, and peer research actions precede capability detail. The proposal snapshot becomes an in-flow section after proof and service boundary; it MUST repeat the posture and peer actions, so Ask cannot outrun or visually dominate the evidence. Terms remain linked immediately above the explicit selection action when they materially affect review.

## Section anatomy

### 1. Identity, first-screen trust facts, save, and share <!-- sim: G6 -->

- **Content:** business name; published category; phone when published by the business; published hours; published service area; centrally mapped evidence/status label; the exact explainer `AE sends your request in writing and keeps a record — or call directly.`; optional public logo/image only when source-backed; `Save` and `Share business page`. Phone, hours, service area, explainer, response posture, and peer actions MUST appear above the fold before `Ask this business`. Unknown hours/service area MUST be stated, not omitted. Do not show a rating, review count, “verified” claim, live/open claim, or response promise unless its attributable evidence contract supports the exact statement. If no attributable review evidence exists, say what AE does have and that review information is unavailable here.
- **Data source:** route loader for canonical business identity, business-published contact/hours/service-area snapshot, public evidence posture, and canonical URL. Thread-origin context is not identity data.
- **Astryx:** `Heading`, `Text`, semantic definition list, `Badge` through the centralized AE status composition, peer-level `Button`/link actions, and `Tooltip` only where a visible label is retained on narrow screens. Save feedback may use a toast as acknowledgement, never as evidence.

### 2. Capability facts

- **Content:** “Can help with”; supported request mode; broad service boundary; prerequisites; known exclusions; and explicit `Unknown` values. Facts are ordered by relevance to the carried need when present, otherwise by the business’s published capability order.
- **Data source:** route loader projection from published business/service/capability records and source revision. A listing may be discoverable without being eligible for the R1 send path.
- **Astryx:** semantic definition list, `Heading`, `Text`, `Badge`, `Divider`. Avoid a grid of identical cards.

### 3. Evidence and response posture <!-- sim: G5 -->

- **Content:** Before any ask/send affordance, show exactly one of the response labels defined below, its evidence source, observed sample window, and recency; then show whether the business has a currently eligible request destination. Delivery eligibility is not availability. `Accepts requests through AE` is shown only after the R1 routability gate.
- **Vocabulary and attribution:** `Typically replies within a day` is permitted only when attributable AE response history meets the product's published minimum sample rule; append `Based on {N} AE requests, {start}–{end}; updated {date}`. Other evidence-backed windows use `Typically replies within {window}` with the same attribution. If the minimum is not met, render `No reply history yet`. A business-published response commitment MUST read `{Business} says it replies within {window} · published {date}` and MUST NOT be relabelled as observed history. Stale evidence MUST retain its date and MUST NOT be presented as current. Never combine delivery time, acceptance, or availability into reply posture.
<!-- de-hedge --> - **Urgency triage:** When a published phone exists, render `Need someone now? Call {phone}` immediately after the posture and before every ask/send affordance. The call action is peer-level on this research surface and opens the device call flow.
- **Data source:** route loader projection of admitted destination posture, suppression/acceptance state, attributable response-history aggregate or business-published commitment, evidence references, sample window, and version timestamps.
- **Astryx:** `Heading`, `Text`, centralized `Badge`, shared `Timestamp`, peer-level `Button`/link, `Collapsible` for `How this was measured`. Participant-safe evidence is inline; private operations evidence is never exposed here.

### 4. Highlights

- **Content:** 2–5 need-relevant facts with their limits, such as a matching service, published service area, contact method, or stated prerequisite. Use varied rows or a short editorial list rather than same-sized feature cards. No fabricated superlatives or generic benefits.
- **Data source:** route loader plus, when entered from `/t/:threadId`, a non-authoritative item projection matching published facts to the current need. The match explanation retains `found` provenance and does not become a business claim.
- **Astryx:** `Heading`, `Text`, `Badge`, `Divider`.

### 5. Detail

- **Content:** service descriptions, process or preparation information published by the business, broad location/contact details, and relevant public policies. Body prose is capped at 65–75ch.
- **Data source:** route loader’s published profile and service records.
- **Astryx:** `Heading`, `Text`, `Collapsible` for long secondary detail, `Link`/AE router-link composition.

### 6. Proof

- **Content:** attributable source/evidence statements, freshness, limitations, and what each fact does not prove. Never expose private run evidence, hidden reasoning, raw tools, or internal scoring. No fake testimonials, reviews, awards, or trust seals.
- **Data source:** route loader’s participant-safe evidence projection.
- **Astryx:** `Heading`, `Text`, `Collapsible`, centralized `Badge`, shared `Timestamp`.

### 7. Service boundary

- **Content:** broad serviced locations or conditions; exclusions; travel/remote posture; `Exact address shared after you review` or equivalent only when an actual consent contract gates it. Private phone/email, exact job location, access instructions, attachments, and contact preferences are never rendered from thread context on this public route.
- **Data source:** route loader for public service boundary; no private item projection.
- **Astryx:** `Heading`, `Text`, `Badge`, `Banner` only for a meaningful boundary or unmet condition.

### 8. Proposal snapshot and action <!-- journey-system: B1/C1 -->

<!-- de-hedge --> - **Content:** When thread context exists, show the current need in the customer’s words; 3–7 consequence-bearing constraints; and useful price posture from the ladder: if the business published an indicative price, show it exactly with attestation and date (`Callout from $90 · business-published {date}`); if it published none, show reply posture when useful or omit the price row. Missing or assumed consequential facts remain marked for correction; actions are `Ask this business` and `Change need`. Do not render a business-confirmation hedge in this research rail. On direct/SEO entry, the target-gated action MUST still be `Ask this business`; activating it opens review with empty editable fields and MUST bootstrap the thread, `asked` provenance, proposal, and unsigned review through `BeginSingleBusinessReview`. `Tell us what you need → /` MUST remain a secondary comparison-first exit, never the primary or a replacement branch. The snapshot is deliberately not the exhaustive send review.
- **Data source:** item projection from an originating thread when present, plus route-loader business identity, binding revision, and target eligibility. Direct visits MUST contain no inferred private context and MUST NOT fabricate values for the empty review.
- **Astryx:** `Card` as one bounded decision surface, `Heading`, `Text`, `Badge` for provenance/status, `Button`, `Collapsible` only for non-consequence secondary context. The main facts remain visible.

### 9. Terms

- **Content:** business-published response/contact terms, cancellation or quotation conditions where relevant, source attribution, and freshness. AE terms are linked separately and never presented as the business’s terms.
- **Data source:** route loader’s published terms snapshot.
- **Astryx:** `Heading`, `Text`, `Collapsible`, `Link`.

## States

### Loading

Render an `AePublicShell` geometry-preserving skeleton with the final identity height, capability/evidence rows, main-column section rhythms, and desktop rail footprint. At mobile, render the in-flow proposal footprint rather than a phantom sticky rail. Skeletons do not contain fake names, metrics, ratings, response times, or status labels.

### Empty

Each empty maps to exactly one DS-13 meaning:

- **Resource not found:** `We couldn’t find this business page.` Actions: `Browse businesses` and `Start with your need`. Preserve no claim that a hidden/private listing exists.
- **No source data (section-level):** `This business has not published service details here.` Action: `View available contact options` only when a source-backed option exists. Do not remove the identity or other known sections.
- **Unmet demand:** when the business does not support the carried need, `This page does not list support for {need/constraint}.` Actions: `Change need` and `Return to matches`. Never silently reinterpret the need.
- **Access denied:** exact/private details remain absent, with `Private details are shared only after you review what will be sent.` Do not expose whether a particular private field exists.

### Error

Keep `AePublicShell`, canonical identity when already loaded, and carried need locally intact. Use a summary `Banner`: `We couldn’t load the latest business details.` Primary recovery: `Try again`; safe alternate: `Return to businesses`. Never print raw errors or replace a known business with a generic 404.

### Streaming

Not used for route-loader business facts. If thread-origin match reasoning is still being prepared, render the settled listing immediately and a stable, labelled `Checking this business against your need` work slot with `aria-busy`; do not stream invented facts into the business profile. Phase completion updates that slot once.

### Zero-JS and SEO posture

Server-render identity, capability facts, evidence posture, highlights, public detail, service boundary, and terms. The canonical page remains useful without JavaScript. Save is unavailable without JS but share remains a canonical link. `Ask this business` is a normal link to `/:slug/inquiry` only when a server-valid public route can begin review; private thread context is revalidated server-side and never serialized into public metadata. Index only canonical, public, loadable pages. Private values never appear in title, description, structured data, sitemap, analytics URLs, or cache keys shared across users.

## Interactions

### Research actions and explicit selection <!-- journey-system: A1/C2 --> <!-- sim: Lena -->

- **Default hierarchy:** On the listing, `Ask this business`, `Call {phone}`, `Visit website`, and `Copy contact details` MUST use peer-level styling. The ask action MUST NOT dominate before explicit selection. Published direct actions remain present even when AE can prepare a request.
- **Selection activation:** Activating `Ask this business` is the explicit selection act. It navigates to `/:slug/inquiry?tx={handle}` using `TransitionEnvelope v1`; only the selected-business review route may make the eventual named send CTA dominant. Opening review does not send.
- **Eligibility:** Ask is enabled for thread-origin and direct/SEO visitors whenever the real R1 target gate passes; a direct visitor opens empty editable review fields under the bootstrap contract.
- **Continuation safety:** The continuation MUST be server-held, short-lived, session-bound, and single-audience; the public URL carries only opaque `tx` and NEVER raw thread context, proposal data, revisions, private values, or return state. An expired/foreign-device handle degrades to direct-entry review and MUST NOT reconstruct lost context.
- **Non-participating state:** Replace the ask control with `This business hasn’t joined AE yet`. If a published phone or website exists, keep it as a peer direct action. Do not use routing, destination, readiness, or `not accepting requests through AE` language.
- **Loading/error:** Repeated activation is suppressed while navigation is busy. On error, retain the listing and focus a contextual summary with `Try again` plus any published direct action.

### Secondary interactions

- **Save:** toggles a durable or local save posture according to current account support; visible label changes to `Saved`. A toast may acknowledge, but the control state is authoritative.
- **Share:** invokes the platform share sheet when available or copies the canonical public URL. It excludes thread/private parameters. Focus returns to the invoking control.
- **Change need / correct constraint:** returns to the thread context editor or `/`; never mutates a shared/public default silently.
- **Exact/private detail request:** never reveals content inline. It moves into the confirmation flow where field, recipient, and purpose are explicit.

### Confirmation depth, keyboard, and focus

Opening the review is AX-2 link-out depth: destination and preserved return path are named. No inline, modal, or pending confirmation occurs on the listing. Tab order follows document order; save/share precede content disclosures; the in-flow mobile action follows evidence. On route arrival, focus the `h1` only after user-initiated navigation. Back navigation restores the originating candidate/action focus. All controls support Enter/Space as appropriate and have 44px minimum targets.

## Copy voice

**Headline:** `{Business name}`

<!-- de-hedge --> **Key labels:** `Can this business help?`, `Evidence and response`, `Highlights`, `Service details`, `Proof`, `Service boundary`, `Your request`, `Your need`, `Constraints`, `Price`, `Callout from {amount}`, `Ask this business`, `Change need`, `Terms`.

**Boundary placement:** The listing carries no ambient send boundary. The selected-business review owns the single load-bearing line `Price is confirmed by {business} in their reply` beside the send action. If a send-ineligible page shows a direct path, show the source-backed contact fact without implying AE will create a record.

**Precision rules:**

- Say `business`, `need`, `details`, `price`, `timing`, `request`, and `record`.
- Never say AE has contacted, booked, charged, confirmed, dispatched, secured availability, or obtained a quote on this page.
- Never call published directory presence proof of routeability.
- Customer copy does not use item, receipt, tuple, lifecycle, provider, capability binding, mandate, kernel, protocol, lead, posting, procurement, vendor, wallet, payment, or marketplace framing.
- `Ask this business` means begin review. Only the later named send action performs the external request.

## Responsive

- `lg` and above: 8/1/3 column detail/space/rail grid; rail sticky within the evidence-column boundary and never beyond service boundary.
- Below `lg`: one column; proposal snapshot moves after proof/service boundary and before terms. No fixed bottom CTA and no sticky rail.
- At ≤375px: identity metadata wraps to two compact rows; save/share remain full text or accessible labels; definition-list values stack below labels; actions are full-width and 44px minimum; no horizontal scroll at 320px or 200% zoom.
- Long business names wrap without truncating the `h1`; evidence labels remain text-first; addresses and URLs wrap safely.
- Collapsible secondary detail defaults closed only when its visible summary retains source, limit, and decision-relevant meaning.

## Accessibility

- Landmarks: `AePublicShell` provides `header`, `nav`, `main`, and `footer`; the page has one `h1`; major sections use `section aria-labelledby`; the desktop rail is `aside aria-label="Your request"` and remains in logical DOM order after supporting evidence.
- Status uses text plus shape/position through the centralized presentation; never color alone.
- Save changes and copied-link acknowledgement may use one polite announcement. Route facts are not a live region. If thread-match work changes state, announce one phase completion keyed to its semantic revision.
- Shared `Timestamp` renders `<time dateTime>` with tabular mono numerals.
- Disclosure controls expose `aria-expanded`/`aria-controls`; closed content is not focusable.
- Reduced motion reaches final save/disclosure/navigation state immediately; no shimmer or smooth auto-scroll.
- At 200% zoom, the desktop rail collapses structurally before overlap. Source labels, long names, and service boundaries reflow without clipping.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-2 | Thread-origin context retains a stable thread/context revision; the listing never impersonates the durable record. |
| LAW-3 | Evidence/request eligibility states show label, known facts, next step, timestamp, object identity where applicable, and one recovery. |
| LAW-4 | Published facts, delivery eligibility, response, quote, availability, and confirmation remain separate; sent never means confirmed. |
| LAW-5 | Need, constraints, recipient context, price posture, and boundary are repeated directly before `Ask this business`, while send authority remains absent. |
| LAW-7 | Core facts are visible; evidence/service/terms detail supplies one deeper inspection layer. |
| LAW-8 | Not-found, no-source, access-gated, and unmet-demand states name the mismatch and smallest correction. |
| IA-1 | Classified public discovery; no private-link content or keys leak into the route. |
| IA-2 | Breadcrumb, navigation, sitemap, and canonical URL derive from the route registry. |
| IA-5 | Only public loadable listing URLs are indexed. |
| IA-6 | Uses the `7xl` listing/detail skeleton with a desktop sticky action rail. |
| IA-7 | Uses `max-w-7xl`, `px-4 md:px-6`, and 12/6/4 rhythm. |
| IA-8 | Route loader/SEO stay in the route; section composition belongs in reusable page components. |
| IA-9 | Main column owns facts/evidence; rail owns the current decision and correction, and cannot outrun evidence. |
| CH-2 | Participant-safe evidence is distinct from private run evidence. |
| CH-5 | Carried constraints remain provenance-marked and correctable. |
| AX-1 | Proposal snapshot includes need, recipient context, unknowns, the useful price-posture ladder, and an explicit review action; it is not exhaustive permission and carries no ambient send hedge. | <!-- de-hedge -->
| AX-2 | Listing uses link-out review depth only. |
| AX-6 | Selecting/opening review does not send; business response/confirmation remain external. |
| AX-7 | Business-confirmation boundary sits beside the action. |
| DS-1 / DS-2 | Astryx owns behavior; Tailwind owns grid, width, gap, and responsive movement. |
| DS-3 / DS-10 / DS-11 | Uses `aeTheme` semantic token roles only; no route palette or dark-mode claim. |
| DS-4 / DS-5 / DS-6 | Controls preserve all states; motion uses Astryx tiers and reduced-motion immediacy. |
| DS-7 / DS-8 | Central status mapping and shared semantic timestamp are mandatory. |
| DS-12 | Any correction field follows shared form/error behavior; no route-local form contract. |
| DS-13 / DS-14 | Meaning-specific empties, geometry-preserving loading, and contextual errors are specified. |
| DS-15 | 44px targets, responsive text, truthful illustrative posture, and non-color status apply. |

## Anti-slop check

- No side-stripe accent borders.
- No gradient text, glassmorphism, hero-metric template, identical card grid, or modal-as-first-thought.
- No nested card stack; the single proposal `Card` earns its boundary as the decision surface.
- No AI glow, blob, centered-everything layout, fake review, fake price, fake provider, ornamental graph, or dashboard art.
- Color strategy is restrained: warm canvas and white surface establish reading layers; ink/slate carry content; eucalyptus is reserved for current selection and the primary action.
- Category-reflex check passed: this is not a generic marketplace tile/detail template. The evidence-led document order and bounded proposal rail derive from a person verifying one real business before sharing data, not from “marketplace” visual tropes.
- The rail contains no R2–R4 recipient counts, comparison responses, procurement, quote collection, ordering, payment, wallet, or future controls.