# /registry - Businesses

## Register & scene

**Register:** product.

**Physical scene:** A person at a kitchen table in clear daytime light is narrowing a practical local need, scanning a bounded set of published business pages, and deciding whether to inspect a business or ask AE to refine the search.

The scene requires the light AE eucalyptus theme on warm canvas with white surfaces, ink text, slate secondary text, and eucalyptus reserved for the current selection and primary action. This is a decision surface, not a promotional marketplace tableau.

## Job & IA position

**One job:** Help a person determine which published business is actionable for their stated need, then continue either to that business page or to a more precise ask.

**Route class:** Public discovery (`PRINCIPLES.md` IA-1). The route is the **Businesses** projection named by `PRODUCT.md` and `DESIGN.md`, not a directory, lead marketplace, or proof that every listed business can receive an AE request.

**Entry points:**

- Public navigation: **Businesses**.
- Home browse rail: **Browse businesses**.
- Search engines and shared canonical URLs with supported search parameters.
- Thread or business-page back links that restore the previous search summary and filters.
- Empty or recovery links from other public discovery surfaces.

**Exits:** <!-- journey-system: A5/C2 -->

- `/:slug?tx={handle}` via **View {business}**. URL search parameters on `/registry` MUST remain the canonical, shareable carrier for query, supported filters, sort, and source-window state. The server-held `TransitionEnvelope v1` MUST carry only continuation return/restore state, including result/card focus and scroll target; the listing URL MUST contain only the opaque `tx` handle, never raw registry context.
- `/:slug/inquiry?tx={handle}` via a supported card **Ask this business** action. This CTA MUST invoke `BeginSingleBusinessReview` on the review route; it is NEVER a bespoke registry flow or a fourth UI flow, and it never sends from the card.
- `/` composer prefilled with the current need and supported constraints via **Ask about businesses like these**. Submitting there creates `/t/:threadId`; the registry itself does not create a thread.
- `/claim` via a quiet footer action, **Claim your business page**, never inside result ranking.
- A demand-capture submission on a true unmet-demand state.

**Normative blueprint:** `PRINCIPLES.md` §10 `/registry`: persistent editable search summary; chips plus full filters; cards answer actionability through capability, service area, evidence posture, and supported next action; zero state names constraints with individual relax controls. The route uses the catalog skeleton required by IA-6 and the `1280` width required by IA-7.

**Registration honesty:** A published page can be discovered and inspected. Only a business whose page shows a supported **Ask this business** action can receive that action through AE. Customer copy must never translate page presence into “ready,” “available,” “onboarded,” or “AE can contact them.”
<!-- sim: G5 -->
**Response posture before selection:** Every result card MUST show an attributable reply-expectation label before any `Ask this business` affordance. The shared vocabulary is: `Typically replies within a day` or `Typically replies within {window}` only from attributable AE response history that meets the published minimum sample rule, followed by `Based on {N} AE requests, {start}–{end}; updated {date}`; `{Business} says it replies within {window} · published {date}` for a business-published commitment; otherwise `No reply history yet`. Delivery time, destination eligibility, availability, and a single anecdote MUST NOT become response posture. Stale evidence keeps its date and MUST NOT be styled as current.

<!-- sim: Lena -->
**Research-action hierarchy:** On cards, `Ask this business`, `Call {phone}`, `Visit website`, `Copy contact details`, and `View {business}` are peer-level research actions. Ask MUST NOT receive dominant treatment before activation. Activating Ask is the explicit selection act; only the resulting selected-business review may visually privilege the eventual send CTA.

## Layout

**Skeleton:** `AePublicShell` around Astryx `Layout`, `LayoutHeader`, and `LayoutContent`; `contentWidth={1280}`; outer gutters `px-4 md:px-6`; page-block rhythm `gap-6`; card internals `gap-4`. Results use Astryx `Grid` with an auto-fit minimum of `320px`, yielding one column on mobile, two on medium widths, and three only when content remains comfortably readable. No sticky side rail. The persistent search summary stays at the top of document flow and may become `sticky top-[public-header]` only after it has entered the viewport, with an opaque white surface and visible boundary, never glass or blur.

### Desktop wireframe, 1280px content rail

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ PUBLIC HEADER                         Ask  Businesses  Claim your business page│ <!-- stupid-shit: S3 -->
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│  px-6                                                                                         │
│  BUSINESSES                                                                  max 1280         │
│  Find a business for your need                                                                │
│  Published business pages from AE's current catalog. Coverage is not exhaustive.              │
│                                                                                               │
│  ┌──────────────────────────────── EDITABLE SEARCH SUMMARY ─────────────────────────────────┐ │
│  │ [plumber] [Parramatta] [Can visit this area] [× remove each]             [Edit search]   │ │
│  │ Showing this page of published matches from AE's current catalog.                          │ │
│  │ [Search phrase______________________________________________] [Search businesses]          │ │
│  │ [Category: Plumbing ×] [Area: Parramatta ×] [+ Filters (2)]          Sort: Name [select] │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                               │
│  Published matches                                      8 shown in this source window          │
│  Listed facts may be incomplete.                                                              │
<!-- de-hedge -->
│                                                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐     │
│  │ BUSINESS CARD            │  │ BUSINESS CARD            │  │ BUSINESS CARD            │     │
│  │ actionability anatomy    │  │ actionability anatomy    │  │ actionability anatomy    │     │
│  └──────────────────────────┘  └──────────────────────────┘  └──────────────────────────┘     │
│                                                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐     │
│  │ BUSINESS CARD            │  │ BUSINESS CARD            │  │ BUSINESS CARD            │     │
│  └──────────────────────────┘  └──────────────────────────┘  └──────────────────────────┘     │
│                                                                                               │
│  [Back to start]                                                       [Next source window]    │
│                                                                                               │
│  Need help narrowing this down? [Ask about businesses like these]                            │
│  Own one of these businesses? [Claim your business page]                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Full-filter inspection layer, desktop

The full filter panel expands inline immediately below the exposed chips. It is not a modal and it does not cover results.

```text
┌──────────────────────────────────── ALL FILTERS ───────────────────────────────────────────────┐
│ Category [select]       Service area [text/select]       Supported next action [select]       │
│ Evidence shown [select] Updated [select]                 [Apply filters] [Cancel changes]      │
│ Each field has a persistent label. Apply writes supported URL state and returns focus to      │
│ the summary heading. Cancel restores the last applied values.                                 │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Mobile wireframe, 375px or narrower

```text
┌───────────────────────────────┐
│ PUBLIC HEADER           [Menu]│
├───────────────────────────────┤
│ px-4                          │
│ BUSINESSES                    │
│ Find a business for your need │
│ Published pages from AE's     │
│ current catalog. Coverage is  │
│ not exhaustive.               │
│                               │
│ ┌───────────────────────────┐ │
│ │ YOUR SEARCH               │ │
│ │ plumber in Parramatta     │ │
│ │ [plumber ×]               │ │
│ │ [Parramatta ×]            │ │
│ │ [Can visit this area ×]   │ │
│ │ [Edit search]             │ │
│ │ [Search phrase__________] │ │
│ │ [Search businesses]       │ │
│ │ [Filters (2)] [Sort]      │ │
│ └───────────────────────────┘ │
│                               │
│ Published matches             │
│ 8 shown in this source window │
│                               │
│ ┌───────────────────────────┐ │
│ │ BUSINESS CARD            │ │
│ │ one-column anatomy       │ │
│ └───────────────────────────┘ │
│            gap-4              │
│ ┌───────────────────────────┐ │
│ │ BUSINESS CARD            │ │
│ └───────────────────────────┘ │
│                               │
│ [Next source window]          │
│ [Ask about businesses like   │
│  these]                       │
└───────────────────────────────┘
```

On mobile, opening **Filters (N)** inserts a full-width inline panel between the search summary and result heading. There is no sticky bottom action and no hidden horizontal chip scroller; chips wrap so every active constraint and remove action remains visible.

## Section anatomy

### 1. Page identity and source boundary

- **Content:** Eyebrow **Businesses**; H1 **Find a business for your need**; supporting line **Published business pages from AE's current catalog. Coverage is not exhaustive.**
- **Data source:** Static route copy plus route-loader source-scope metadata when available.
- **Astryx components:** `LayoutHeader`, `Heading`, `Text`.
- **Purpose:** Establish that this is a bounded projection before familiar catalog patterns can imply a whole-web or all-local-business search.

### 2. Persistent editable search summary, primary decision layer <!-- journey-system: A5/C2 -->

- **Content:** The interpreted search phrase in ordinary language; active constraint chips; one remove action per constraint; labelled search input; **Search businesses** action; visible **Filters (N)** disclosure; sort control. If there is no query, the summary reads **Browsing published business pages** and exposes the same labelled search input.
- **Data source:** Route search parameters and the route loader's normalized search readback. Applied filters MUST be URL-backed when the loader supports them; purely client-local filters MUST be labelled **On this page** and MUST NOT alter source-wide result counts.
- **Astryx components:** `Card` only as the bounded search-control surface, `TextInput`, `Button`, `Toolbar`, `Token` or dismissible Astryx token composition, `Selector`, `Collapsible`, `Heading`, `Text`, `FormLayout` where the expanded panel behaves as a form.
- **Persistence contract:** URL search parameters MUST remain the canonical carrier for shareable query, applied loader-supported constraints, sort, and source-window state; pagination MUST preserve them. The `TransitionEnvelope v1` MUST carry return/restore only: origin route, opaque server-held restore state, result/card focus, and scroll target. Registry → listing MUST therefore retain the canonical registry search-param state as the envelope's `returnTo` target AND place only `?tx={handle}` on the listing edge; it MUST NEVER copy raw filters, scroll state, context revisions, or private data into the listing URL. A valid return MUST restore summary, source window, filters, and focus/scroll target. If the handle is expired or opened on a foreign device, return MUST degrade to the registry URL's canonical search-param state without hidden restoration. Editing a search resets the cursor because the result set has changed.
- **Two-level disclosure:** Exposed chips are level 1. **Filters (N)** opens the complete, labelled level-2 panel. No third filter summary or separate “context cards” layer is permitted.

### 3. Full filters, deeper inspection layer

- **Content:** Only filters backed by current source facts: category/capability, service area, supported next action, evidence posture, and freshness if a real source timestamp exists. The panel identifies page-local filters with **Filters this source window only** until source-side support exists.
- **Data source:** Filter definitions from the route/search contract; candidate values from loader metadata, never inferred from only visible cards and then presented as catalog-wide facets.
- **Astryx components:** `Collapsible`, `FormLayout`, `Selector`, `TextInput` where free text is genuinely supported, `Button`, `Banner` for server failure.
- **Actions:** **Apply filters**, **Cancel changes**, and field-level **Clear {filter}**. Applying changes updates the summary and results. Cancel restores the applied snapshot. No modal.

### 4. Result scope line

<!-- de-hedge --> - **Content:** H2 **Published matches**; count phrased as **{N} shown in this source window**, never **{N} businesses near you** unless an exhaustive source contract proves it; source boundary **Based on published pages in AE's current catalog and the criteria above. Listed facts may be incomplete.** Do not add a price/timing/availability hedge above the grid; each card must show its useful source-backed facts instead.
- **Data source:** Route-loader page length, pagination state, and explicit source-scope metadata. Do not use a misleading global total when the backend only loaded a bounded page or streetscape window.
- **Astryx components:** `Heading`, `Text`, `HStack`/`VStack` for layout.

### 5. Business result grid

- **Content:** One card per returned business, ordered only by the selected, explicitly named sort. Default ordering must not imply quality. If relevance ordering exists, label it **Match to your search** and expose its basis one level deeper.
- **Data source:** Route loader item projection. Every displayed fact retains source posture and freshness where available.
- **Astryx components:** `Grid`, `Card`, `Heading`, `Text`, `Token`, `Button`, `Collapsible` only for a compact evidence explanation that cannot fit without harming scanability.
- **No theatre:** No stars, scores, testimonial counts, “top,” “best,” trending labels, decorative verification shields, or availability badges derived from anything weaker than an authoritative business-origin fact.

### Card anatomy diagram

```text
<article aria-labelledby="business-{slug}-name">
┌─────────────────────────────────────────────────────────┐
│ CATEGORY · LISTED LOCATION                              │  small slate context
│ Business name                                           │  h3, ink
│ One need-relevant published service sentence            │
│                                                         │
│ CAN THIS BUSINESS HELP WITH THIS NEED?                   │
│ Capability     {published capability or “Not stated”}   │
│ Service area   {published boundary or “Not stated”}     │
│ Evidence       {source + checked/updated posture}        │
│ Reply posture  {attributed label or “No reply history yet”}│
│ Price          Callout from $90 · business-published {date} │
│                                                         │
│ RESEARCH ACTIONS                                         │
│ [View {business}] [Ask this business]* [Call] [Website]  │
└─────────────────────────────────────────────────────────┘
<!-- de-hedge -->
* Render only when a current, supported one-business ask path exists.
  Otherwise render the truthful direct-contact or detail path, never a disabled future action.
```

**Card field contract:**

1. **Identity:** Business name, category, and listed location. An image is optional and subordinate; absence never produces a mascot or fake storefront.
2. **Capability:** The need-relevant service or capability stated on the published page. Use **Not stated on this page** for absence, not inferred copy.
3. **Service area:** The published service boundary, with **Service area not stated** when unknown. A business address does not prove service coverage.
4. **Evidence posture:** Plain text such as **Business-published details, updated {date}** or **Source date not available**. “Checked” must name what was checked. No badge whose visual prestige exceeds the evidence.
5. **Reply posture:** Before any ask affordance, render the shared evidence-based vocabulary and full source/sample-window/recency attribution defined above, or **No reply history yet**. It MUST NOT imply availability.
6. **Price posture:** If the business published an indicative price, show it exactly with source and date, for example **Callout from $90 · business-published {date}**. If it published none, show the useful reply posture already present or omit the price row. Never render a generic quote placeholder or substitute price hedge on a card. <!-- de-hedge -->
7. **Supported actions:** Render every truthful published path: **Ask this business** only when the current R1 route is supported; **Call {phone}**, **Visit website**, or **Copy contact details** when published; and **View {business}**. If no direct projection is available, use **View details to check contact options**.
8. **Hierarchy:** All card actions are peer-level on this research surface. Activating **Ask this business** is selection and begins proposal/review; it never sends from the card. The send CTA may dominate only on the selected-business review route, which owns the single load-bearing price-confirmation line. Agent JSON is not a customer-card action.

### 6. Pagination or source-window continuation

- **Content:** **Back to start** when not on the first window; **Next source window** when a next cursor exists; otherwise static **End of this source window**. Never render a disabled **Next** control without explanation.
- **Data source:** Route loader cursor and `hasMore` readback.
- **Astryx components:** semantic `<nav aria-label="Business result pages">`, `Button`, `Text`.
- **Behavior:** Preserve query and filters. Move focus to the result heading after navigation and announce the newly shown count once.

### 7. Ask continuation

- **Content:** **Need help narrowing this down?** and primary action **Ask about businesses like these**.
- **Data source:** Current query and supported active constraints serialized into the home composer prefill, not private or unsupported filter state.
- **Astryx components:** `Section`, `Text`, `Button`.
- **Behavior:** Navigate to `/?q={plain-language summary}`. The home composer remains editable; only submitting it creates the durable thread. The action does not contact any business.

### 8. Business claim footer

- **Content:** Quiet secondary copy **Is your business page here?** with **Claim your business page**.
- **Data source:** Static route copy.
- **Astryx components:** `Section`, `Text`, `Button` with secondary or ghost treatment.
- **Placement:** After results and customer continuation so supply acquisition never competes with the customer's decision.

## States

### Loading

- Keep `AePublicShell`, header dimensions, search-summary card, result heading, and settled grid geometry in place.
- Use Astryx `Skeleton`: one title line, one boundary line, a full search-summary shell with chip-shaped skeletons, a result-scope line, and 6 card skeletons matching the exact card anatomy rows. Do not load context cards that disappear in the settled state.
- The results region uses `aria-busy="true"`; skeletons are not individually announced. One polite announcement may say **Loading published business pages**.
- A query or filter navigation retains the settled editable summary while only the count and result grid enter busy state, preventing loss of context.

### Empty taxonomy, all six DS-13 meanings

| DS-13 meaning | Registry case | Required copy | Primary and secondary actions |
|---|---|---|---|
| **No source data** | The catalog source returns no published business pages at all, independent of user criteria. | **No published business pages are available in this catalog yet.** Supporting copy: **This is the catalog state, not a result of your search.** | Primary **Ask AE about your need** to the composer. Secondary **Claim your business page**. Demand capture may follow only if the user has supplied a real need and location; do not pretend relaxing filters can fix absent source data. |
| **No filter match** | Source data exists, but the current query or one or more active constraints exclude every item in the loaded search scope. | **No published pages match all of these criteria.** List every active constraint by name. State **AE has not broadened your search.** | One control per constraint: **Remove {constraint}**, **Search without {constraint}**, or **Change {constraint}**. Also **Clear all filters** and **Edit search**. Do not show demand capture until the user has tried or explicitly kept the named constraints and the system has established true unmet demand. |
| **Resource not found** | A stale deep link or restoration target identifies a result/business that is no longer present. This normally resolves on `/:slug`, but registry restoration can encounter it. | **That business page is no longer published.** Supporting copy: **Your search is still here.** | Primary **View current matches** with the prior summary preserved. Secondary **Edit search**. Do not silently substitute another business. |
| **Access denied** | A result window or saved search cannot be shown because the caller lacks a required access posture. Public catalog browsing itself must not manufacture sign-in gates. | **This saved view is not available with this link.** Supporting copy: **Public business pages are still available.** | Primary **Browse published businesses**. Secondary **Start a new search**. Never reveal whether a private object exists, and never require authentication for ordinary public results. |
| **Temporarily unavailable** | The registry loader or source readback fails or times out. | **Business pages could not be loaded right now.** Supporting copy preserves the visible search summary and says **Your search has not changed.** | Primary **Try again** for the same URL and scope. Secondary **Ask AE about your need**. Raw error messages are never printed. |
| **Unmet demand** | The source is healthy, supported broadening has been exhausted or deliberately declined, and no published page can help with the stated service and area. | **We do not have a published business page for this need and area yet.** Supporting copy: **Tell us what you needed so we can record the gap. This does not contact a business or promise a match.** | Primary demand-capture form: **Record this need**. Secondary **Edit search** and **Ask AE about your need**. After success: **Need recorded. No business has been contacted.** |

### Per-constraint zero-state anatomy

```text
No published pages match all of these criteria.
AE has not broadened your search.

Active criteria
  Plumbing                         [Remove Plumbing]
  Parramatta                       [Search without Parramatta]
  Can receive an AE request        [Include direct-contact pages]

[Edit search] [Clear all filters]
```

Each relax action changes exactly one named constraint, updates URL-backed state, resets pagination, and then reruns the search. It never combines multiple relaxations or applies before activation.

### True-zero demand capture

Demand capture is not the first response to an overconstrained page. It appears only when the route can distinguish a healthy source with no suitable published page from a page-local filter miss. The form uses Astryx `FormLayout`, `TextInput` for **Service needed** and **Suburb or area**, optional `TextArea` for **Anything important?**, field-local errors, server-failure `Banner`, and `Button` **Record this need**. It states immediately above the action: **This records a gap in the published catalog. It does not contact a business or promise a match.** Submission uses disabled plus loading state and moves focus to the result banner. Duplicate submissions remain idempotent where the server contract supports it.

### Error

- Preserve public shell, page title, and editable search summary.
- Use an Astryx `Banner` with `role="alert"` only after an attempted load fails: **Business pages could not be loaded right now.**
- Primary recovery **Try again** repeats the same URL-backed scope. Secondary **Ask AE about your need** preserves a plain-language summary.
- Never render `error.message`, stack data, internal source names, or false “no results” copy.

### Streaming

Not used. Registry search returns a route-loader readback. Do not simulate progressive ranking, searching phases, or live-business activity. Pagination may replace only the result region after an explicit navigation; it is loading, not streaming.

### Zero-JS and SEO posture

- Search uses a labelled GET form targeting `/registry`; query, source-supported filters, and limit are serializable as search parameters.
- Business links and pagination are real anchors. **Ask about businesses like these** is a real URL to the composer with an editable prefill.
- Full filters degrade to an always-visible fieldset or native disclosure when client behavior is unavailable. Applying them submits the GET form.
- Server-render the heading, source-boundary copy, result count posture, cards, and empty meaning. Do not rely on client filtering for indexable claims.
- Canonical metadata strips cursor, client-only sort, and telemetry. Search-result URLs should not be indexed as distinct canonical inventory pages unless SEO policy explicitly allows them; published `/:slug` pages own business identity.
- Structured data must include only source-backed business facts. No aggregate rating, review, live opening, price, or availability schema without authoritative data.

## Interactions

### Primary action

The page-level primary action is **Search businesses**. It applies the current search phrase and the last explicitly applied full-filter values, updates the canonical URL, resets the cursor, and refreshes the result scope.

**Full state contract:**

- **Default:** Eucalyptus primary button; persistent label and input label.
- **Hover:** Astryx primary hover treatment only.
- **Focus:** Astryx visible `:focus-visible` ring; Enter from the search input submits.
- **Active:** Astryx pressed treatment.
- **Disabled:** Only while the same search submission is pending or when an implementation-level invalid state has a visible field reason. Empty query remains valid for browsing.
- **Loading:** Label stays **Search businesses** with Astryx loading indicator, `isLoading`, `isDisabled`, and form/results `aria-busy`; duplicate submission is blocked.
- **Error:** Keep the entered query and applied filters; announce the error banner once; focus the banner for server failures only after submission returns.
- **Success:** Update URL and summary, focus H2 **Published matches** or the empty-state heading, and announce **{N} published matches shown** or the selected empty meaning once.

### Card actions and confirmation depth

- **View {business}:** AX-2 depth 1 link-out review. It MUST route to `/:slug?tx={handle}` with URL-backed registry result state retained as the canonical return target and the envelope carrying only restoration/focus state. No confirmation dialog.
- **Ask this business:** Only when currently supported. It MUST route through `/:slug/inquiry?tx={handle}`, where `BeginSingleBusinessReview` bootstraps the thread, `asked` provenance, proposal, and unsigned review. It is NEVER a registry-owned or bespoke fourth flow, does not send, and requires no dialog on the registry. The later send must use depth 4, exact scope, pending lock, and durable record on its owning route.
<!-- de-hedge --> - **Contact business directly:** A named destination link that opens the published contact path outside AE.
- **Ask about businesses like these:** Link-out to the editable composer. It does not create a thread until the composer is submitted.
- **Remove/relax filter:** Reversible inline action. No confirmation.
- **Record this need:** Bounded form submission, not an external business action. No modal. Inline readback states what is recorded and what does not happen.

### Keyboard and focus

- DOM order: H1, search summary, chips in summary order, full-filter disclosure, sort, result-scope heading, cards row-major, pagination, ask continuation, claim footer.
- Dismissible chips are buttons with names such as **Remove suburb Parramatta**, not icon-only controls.
- `Escape` closes the full-filter disclosure only when focus is inside it, then returns focus to **Filters (N)**. It must not clear edits silently; unsaved changes remain until explicit **Cancel changes** or application.
- Applying filters returns focus to the results heading after navigation. Pagination does the same. Returning from a business page restores focus to that business card heading where possible.
- Every action is visibly reachable; no keyboard-only shortcut is required.

## Copy voice

### Headline and key labels

- Eyebrow/navigation: **Businesses**
- H1: **Find a business for your need**
- Source boundary: **Published business pages from AE's current catalog. Coverage is not exhaustive.**
- Search label: **Business, service, or place**
- Search action: **Search businesses**
- Summary label: **Your search**
- Filter disclosure: **Filters ({N})**
- Results heading: **Published matches**
- Count: **{N} shown in this source window**
- Result boundary: **Based on published pages in AE's current catalog and the criteria above. Listed facts may be incomplete.**
- Price posture: **Callout from {amount} · business-published {date}** when present; otherwise reply posture or no price row. <!-- de-hedge -->
- Detail action: **View {business}**
- Route-capable action: **Ask this business**
- Direct action: **Contact business directly**
- Composer continuation: **Ask about businesses like these**
- Claim action: **Claim your business page**

### Discoverable versus actionable, in customer voice

Use this compact explanation once at the result scope, with card-specific next actions carrying the distinction thereafter:

> Every result has a published business page. If a page offers **Ask this business**, AE can help you prepare a request for that business. Otherwise, use the contact option shown on its page.

Do not use the customer-facing terms registration, binding, admitted, conformant, routeable supply, provider, tuple, receipt, lifecycle, or capability graph. **Capability** may appear only as a card specification label if needed internally; customer copy should prefer **Can help with** or the actual service name.

### Boundary placement

- Source-window honesty sits immediately below the page heading and again beside the result count.
- Cards show source-backed price and reply facts, not ambient send boundaries. The selected-business review owns `Price is confirmed by {business} in their reply` beside the send action. <!-- de-hedge -->
- **You will review what is shared before anything is sent** sits beside **Ask this business** when rendered.
- Demand capture states its non-outcome immediately above **Record this need** and repeats **No business has been contacted** after success.

### Banned words checked

Customer-visible copy contains none of: household, inquiry as the product category, lead, posting, sorted as a value claim, domestic economy, provider, routeable, binding, receipt, tuple, lifecycle, mandate, clearance, kernel, protocol, procurement, vendor, wallet, payment, checkout, booked, confirmed by AE, best, top-rated, exhaustive, all nearby businesses, live availability, instant quote, marketplace liquidity. The route may say **request** only in concrete explanatory copy such as **prepare a request for that business**; default labels remain need, business, option, details, price, timing, and confirmation.

## Responsive

- **Base to 639px:** One-column grid; `px-4`; search and action stack; chips wrap; full filters inline; card actions stack full width; no sticky summary if it would consume more than 40% of viewport height.
- **640px to 1023px:** Two-column result grid when each card remains at least 320px; search input and action may share a row; chip row wraps; filter panel uses two columns.
- **1024px and above:** Up to three auto-fit columns; summary search row uses flexible input plus fixed action; filter panel uses three columns; summary may stick beneath public header.
- **At 200% zoom:** Collapse to one structural column as space requires; no clipped tokens, horizontal page scroll, fixed-height card body, or overlaid action.
- Card heights need not be identical. Content integrity beats uniform tile rhythm.
- All touch targets are at least 44px. Adjacent chip remove actions retain adequate spacing.

## Accessibility

- Landmarks: `header` supplied by `AePublicShell`; one `main`; labelled search `<form role="search">`; results `<section aria-labelledby="published-matches">`; result grid `<ul>` with each card in `<li><article>`; pagination `<nav aria-label="Business result pages">`; claim content in footer/section after the task.
- One H1. Full-filter panel uses a fieldset/legend or correctly associated persistent labels. Card names are H3 beneath the H2 result heading.
- Search input, selectors, and demand-capture fields have persistent labels. Errors use `aria-invalid` and `aria-describedby`; the first invalid field receives focus.
- Result cards expose all four actionability facts in semantic text or a `<dl>`. Color and badges never carry the only meaning. Unknown values are spoken as **Not stated**, not represented by a dash alone.
- **Live regions:**
  - Initial server render is silent.
  - Search/filter completion uses one `aria-live="polite"` result announcement.
  - Loading token/skeleton changes are silent.
  - Temporary loader failure uses one `role="alert"` after the failed attempt.
  - Demand-capture success uses one `role="status"`: **Need recorded. No business has been contacted.**
  - Removing a constraint announces **Removed {constraint}. Results updating** once.
  - Do not create separate live regions for count, grid, chips, and pagination.
- Focus never moves for merely opening/closing a card evidence disclosure. Route-level result changes move focus to the result or empty heading after navigation.
- Reduced motion reaches final semantic state immediately. Sticky-summary elevation and disclosure transitions use Astryx motion tiers only; no lift, count animation, shimmer dependency, or orchestrated entrance is required.
- Images use meaningful alt text only when they add source-backed information. Decorative or fallback images use empty alt text. Broken images collapse without changing card reading order.

## Rule compliance

| Rule | How `/registry` satisfies it |
|---|---|
| PRODUCT rule 1 | Routing mechanics remain backstage; cards expose useful actionability consequences only. |
| PRODUCT rule 5 | Evidence posture is attributed and limited; no rating or verdict is manufactured. |
| PRODUCT rule 7 | Published page presence and supported **Ask this business** action are visibly distinct in customer language. |
| PRODUCT rule 8 | The route leads with need, business, details, price, timing, and next action, not protocol vocabulary. |
| LAW-1 | Registry remains the low-commitment browse alternative; it does not displace the composer as the front door. |
| LAW-3 | Loading, source availability, filter mismatch, actionability posture, and error each have explicit labels, facts, next transition, recovery, and stable scope. |
| LAW-4 | No card borrows live availability, price, confirmation, responsiveness, or action support from a later state. The business confirms. |
| LAW-7 | Level 1 is the editable summary with exposed chips; level 2 is one complete inline filter panel. There is no third summary. |
| LAW-8 | Every mismatch names its cause; each active constraint has an individual relax action; no silent broadening occurs. |
| LAW-10 | Public navigation names **Businesses** from the shared route map; route search remains catalog-scoped rather than becoming global navigation search. |
| IA-1 | Classified only as public discovery. Private restoration failures do not convert the route into an authenticated surface. |
| IA-2 | Header, sitemap, breadcrumbs where present, and command menu derive **Businesses** from the canonical route registry. |
| IA-3 | **Ask about businesses like these** returns to the one composer front door; the registry does not create a competing ask workflow. |
| IA-4 | Agent JSON is removed from customer cards and remains in the machine sibling architecture or business detail disclosure. |
| IA-5 | Only canonical, public catalog and published business URLs are indexable; cursor and client-only state do not create sitemap entries. |
| IA-6 | Uses Astryx `Layout` plus auto-fit `Grid`, the catalog skeleton. |
| IA-7 | Uses the named `1280` catalog width, `px-4 md:px-6` gutters, and 6/4 rhythm. |
| IA-8 | Route owns URL state, loader, SEO, and error/loading projection; reusable search summary, filter panel, card, and empty-state compositions own deep UI. |
| IA-9 | No action rail duplicates facts. Actions sit with the result or continuation they affect. |
| AX-2 | Business/detail and composer exits use link-out review; filter changes are reversible inline actions; no modal is used by reflex. |
| AX-6 | Selecting or viewing a business does not send. **Ask this business** begins review only. |
| AX-7 | Business-confirmation boundary sits beside every supported ask action and above the grid. |
| DS-1 | Astryx primitives are used first; no new behavioral primitive is specified. |
| DS-2 | Tailwind handles grid, width, gutters, and rhythm; Astryx owns inputs, buttons, disclosure, loading, focus, and disabled behavior. |
| DS-3 | Only ink, warm canvas, white surface, slate, eucalyptus, and existing semantic state tokens are used. No route-local values. |
| DS-4 | Wrappers preserve labels, disabled/loading state, keyboard use, and focus-visible behavior. |
| DS-5 | Any disclosure or state transition uses Astryx fast/medium/slow tiers, never literal durations. |
| DS-6 | Reduced motion removes nonessential transitions and reaches final state immediately. |
| DS-7 | Evidence and actionability are written as text; no color-only status or prestige badge. |
| DS-8 | Any freshness timestamp uses shared `<time dateTime>` formatting, never route-local formatting. |
| DS-9 | Card, control, and page radii follow the existing monotonic ladder. |
| DS-10 | The page uses the honest `aeTheme` identity. |
| DS-11 | The spec makes no dark-mode claim. |
| DS-12 | Search and demand capture use `FormLayout`, field-local errors, first-invalid focus, disabled-plus-loading submit, and server-failure `Banner`. |
| DS-13 | All six meanings are mapped above; no-filter-match supplies per-constraint relax actions; true unmet demand has honest capture. |
| DS-14 | Loading preserves settled geometry; errors retain shell and search context and never expose raw messages. |
| DS-15 | Targets are at least 44px; illustrative/fallback imagery never implies live facts; no fake example data is used. |
| WEDGE R0 | Cards may support shortlist and direct inspection without consent or external action. |
| WEDGE R1 | **Ask this business** appears only for one business with a real supported destination; it begins review and never sends from the card. |
| WEDGE anti-scope | No fan-out, response comparison, procurement, payment, wallet, order, or future-rung controls appear. |

## Anti-slop check

- **No side-stripe borders:** Cards, banners, and empties use full boundaries, semantic surfaces, or typography.
- **No gradient text:** All text uses semantic solid ink, slate, or action color.
- **No glassmorphism:** Sticky treatment, if used, is an opaque white surface with a standard boundary.
- **No hero-metric template:** The page begins with task identity and search, not a large count or supporting vanity metrics.
- **No identical feature-card grid:** The only grid is the actual business result collection. Explanatory “context cards” are removed.
- **No modal as first thought:** Full filters expand inline; all routine changes are inline or navigational.
- **No badge theatre:** Evidence posture is plain, attributed text. A badge is allowed only for a concrete, source-backed state and is never the sole meaning.
- **No fake ratings or ranking:** No stars, review counts, universal scores, or unlabeled quality order.
- **No category reflex:** The physical scene produces a restrained daylight decision tool using the existing AE semantic palette, not a map clone, yellow-pages motif, marketplace photography wall, or “local services” pin aesthetic.
- **No uniform-height pressure:** Cards may vary with evidence and actionability content; scan order and labelled anatomy create coherence.
- **No future-surface cosplay:** Only R0 discovery and a supported single-business R1 review entry are visible. There is no fan-out, quote comparison, procurement, payment, wallet, booking, or disabled coming-soon control.
- **No em-dash copy:** Customer labels and prose use commas, colons, semicolons, or sentences.
