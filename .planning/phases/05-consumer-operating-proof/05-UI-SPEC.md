---
phase: 05
slug: consumer-decision-support
status: draft
shadcn_initialized: false
preset: astryx-neutral
created: 2026-07-23
---

# Phase 05 — Consumer Decision Support UI Design Contract

> Visual and interaction contract for the public **Browse businesses → inspect an Offering → shortlist exact Offering revisions → compare facts → explain trade-offs against stated priorities** loop. Generated for planner and executor verification; the checker upgrades `status` only after implementation-grade review.

---

## Decision Supported

This phase helps a visitor decide which exact Offering deserves further consideration. It does not help them contact, invoke, book, pay, dispatch, or authorize anything.

The experience must feel like a familiar retail or travel comparison surface: browse without an account, open concrete details, add up to four items, compare them side by side, state priorities if desired, and share the resulting URL. Its source-truth contract is stricter than a typical marketplace: the selected revision, business, provenance, observed date, freshness, missing material, comparability, and any newer revision remain visible.

The default result is **Not ranked**. The interface may show an order only after the visitor states priorities and the source-owned comparison result says every decisive fact is current and comparable. The UI never computes, weights, scores, or silently reorders Offerings.

### Non-negotiable boundary

- Public and no-login throughout. Sign-in and saved comparisons are absent from the closure path.
- Maximum four transient selections and maximum three closed priority dimensions. URL state contains public references and closed priority IDs only; never names, facts, free text, auth data, or customer context.
- Allowed actions are: view Offering, add/remove from comparison, compare, change/clear priorities, replace a selected revision deliberately, and share/copy the comparison link.
- No inquiry, quote request, phone action, endpoint invocation/test, Customer Request, booking, payment, or other external effect may be reachable from the Offering-detail or comparison action group. Provider fetch means no automatic fetch, prefetch, probe, or endpoint invocation from any Phase 5 route or control.
- Access paths remain descriptive facts. Deliberate visitor navigation to safe public documentation is allowed. Such a link, when retained, is labelled **View published details**, opens as ordinary navigation, and uses `rel="noopener noreferrer"` plus `referrerPolicy="no-referrer"`. It must never say run, test, call, connect, book, or start.
- No reviews, stars, sponsored positions, trust grade, universal score, synthetic normalization, or unstated ranking.

## Design System

| Property | Value |
|----------|-------|
| Tool | Astryx `@astryxdesign/core` with `@astryxdesign/theme-neutral` |
| Preset | Repository neutral theme plus the semantic bridge in `src/styles/globals.css` |
| Component library | Astryx core; Tailwind 4 for layout glue only |
| Icon library | `lucide-react`, decorative icons `aria-hidden`; text labels remain persistent |
| Font | Astryx body/heading system stack; mono only for compact revision/date evidence |
| shadcn | Not initialized and not applicable. `DESIGN.md` prohibits a competing system. |

Do not create or extend bespoke `Ae*` presentation primitives, route CSS, a route palette, Radix/CVA/shadcn wrappers, retired Daylight assets, or generic AI styling. Reuse Astryx `Layout`, `Card`, `Button`, `Badge`, `Banner`, `Skeleton`, `Selector`, `CheckboxInput`, `Table`, `Text`, `Heading`, `Stack`, `Divider`, and `EmptyState` where their semantics fit. A phase-owned `AeOfferingComparison` is a domain composition, not a new primitive.

## Visual Direction

Calm, dense decision support. The page ground is warm eucalyptus-tinted canvas; facts sit on white surfaces; slate supports hierarchy; eucalyptus marks the primary action and current selection only. Comparison should resemble a well-edited product specification sheet, not an analytics dashboard.

No hero treatment on product routes. No gradients, glass, glowing graphs, decorative scoring rings, oversized metrics, uniform feature-card grids, or animated ranking. The Offering name, business, selected revision, result posture, and material differences lead.

## Spacing Scale

Declared values are the existing Astryx 4px-based scale:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline evidence separators; icon-to-label gap |
| sm | 8px | Cell label/value gap; compact control groups |
| md | 16px | Card padding on narrow screens; row/cell padding |
| lg | 24px | Card padding on wide screens; section gaps |
| xl | 32px | Major route-section separation |
| 2xl | 48px | Page header to first task region |
| 3xl | 64px | Reserved for wide page-level breathing room; never inside the matrix |

Exceptions: interactive targets are at least 44×44px; sticky shortlist padding includes `env(safe-area-inset-bottom)`; one-pixel semantic borders are allowed. No spacing value outside multiples of four is introduced for layout.

## Typography

Use exactly four phase type sizes and two weights. Use Astryx `Text`/`Heading` props instead of route-local font declarations.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Supporting / evidence | 12px | 400 | 1.67 (20px) |
| Body / table cell | 14px | 400 | 1.43 (20px) |
| Section heading / Offering name | 17px | 600 | 1.41 (24px) |
| Page heading | 24px | 600 | 1.33 (32px) |

Use sentence case. Never use all caps for state, ranking, or provenance. Mono is permitted only at 12px for exact revision, observation date, and compact technical access facts; never for ordinary explanations. Numeric values use tabular numerals where available. Do not shrink cells below 14px to force a desktop matrix onto mobile.

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--color-background-body` / `#F5F7F4` | Page canvas and breathing space |
| Secondary (30%) | `--color-background-card` / `#FFFFFF`, `--color-background-surface` / `#FCFDFC`, `--color-background-muted` / `#E7EBE5` | Cards, comparison cells, quiet state panels, shortlist region |
| Accent (10%) | `--color-accent` / `#40614F`; hover `#35523F`; muted `#E8EFE9` | Primary CTA, selected Offering outline/wash, visible focus, current priority marker, links, active progress only |
| Primary ink | `--color-text-primary` / `#20261F` | Names, facts, headings |
| Secondary ink | `--color-text-secondary` / `#5C625A` | Explanations, provenance, dates |
| Error | `--color-error` / neutral-theme `#A50C25` | Load/copy failure and unavailable selection only; always paired with icon and text |
| Warning | `--color-warning` / neutral-theme `#745B00` | Stale, partial, or changed notices only; always paired with icon and text |

Accent is reserved for the primary action, current selection, focus, current priority marker, ordinary links, and active progress. It does not signify “best,” recommended, verified, trusted, or fresh. There are no destructive actions in this phase; the error semantic is not used as a destructive CTA.

Selection, stale, partial, changed, unavailable, and ordered/unranked states must remain distinguishable with text plus border/icon/shape, not colour alone. Do not colour an entire Offering column green or place a trophy/crown on the first item.

## Public Information Architecture

```text
Businesses (/registry)
  └─ Business detail (/$slug)
       └─ Offering detail (/$slug/offerings/$offeringRef)
            ├─ Add/remove exact revision
            └─ Compare (/compare?... public reference state)
                 ├─ Change or clear priorities
                 ├─ Inspect facts/provenance/currentness
                 └─ Copy/share URL
```

`Businesses` remains the public navigation label. Do not add a new global `Compare` destination: comparison is transient task state entered from Offering selection. Chat/search may link to business or Offering detail with filters, but the route hierarchy and semantic facts remain the same.

## Route Contracts

### Businesses — `/registry`

The page header is **Find businesses and Offerings** with body **Browse published details, then compare the Offerings that fit.** Search remains labelled **Business, Offering, or place**. Results remain business-led because business context is the entry point, but each result shows up to two published Offering names and a count such as **3 published Offerings**.

Required actions are **View business** and, where a concrete Offering is displayed, **View Offering**. Do not add `Add to compare` at business level because comparison identity is the Offering. Remove or isolate call buttons, inquiry controls, and the mutating demand-capture empty form from the Phase 5 journey. The inspect-only empty state is specified below.

Do not sort by “Newest” unless the label and implementation mean business/Offering observation date exactly. There is no “Recommended,” “Best match,” or hidden contact-availability order. Default business order must be explicit and neutral, such as **A–Z**, or source-owned search relevance when a query is present.

### Business detail — `/$slug`

Business identity, location, published details, source dates, and Offerings provide context. The Offering section becomes the primary onward decision region. Each Offering summary card shows:

1. Offering name and category.
2. One-sentence summary.
3. Price/timing/area facts with honest fallbacks rather than omitted layout holes.
4. Revision and **Observed [date]**.
5. **View Offering** and **Add to compare** / **Remove from compare**.

Business-level phone/inquiry actions, if the broader page retains them, must sit outside the Offering card and outside the labelled **Phase 5 decision-support task** region. No Offering-detail, shortlist, priority, comparison, revision, or share control may navigate to, invoke, dispatch, or share a callback with those business-level actions. Browser/eval paths assert that the complete Phase 5 control set cannot reach them.

### Offering detail — `/$slug/offerings/$offeringRef`

The page is the source-truthful inspection step, not a checkout/detail upsell. Header order:

- Breadcrumb: **Businesses / [Business] / [Offering]**.
- Category supporting label.
- Offering name (`h1`).
- **Offered by [Business]** with link back to business detail.
- Summary.
- Revision and observation stamp.
- Primary **Add to compare** or **Remove from compare** button.

Body order:

1. **What is included** — scope and category-profile facts.
2. **Price, timing, and area** for professional service, or **Interface, access, price, and update cadence** for machine/data.
3. **Where these details came from** — fact provenance, observed date, and freshness in ordinary language.
4. **Ways this Offering is published** — descriptive access paths and AE support posture. Technical fields use a native disclosure labelled **Show technical details**. Do not show an invoke/test control.
5. **Revision information** — selected/current state and any newer-revision notice.

The detail route must render an explicit value for every registered profile field: a value, **Not supplied**, **Not known**, or **Out of date**. It must not hide missing material.

### Comparison — `/compare`

Header:

- `h1`: **Compare Offerings**.
- Body: **Compare published facts from the exact versions you selected. Nothing here contacts a business or runs an endpoint.** State this effect boundary once here, not on every cell.
- A compact selection count: **3 of 4 selected**.

Task order:

1. Selected Offering controls.
2. Priority controls.
3. Result posture and explanation.
4. Comparison matrix/list.
5. Provenance/currentness detail.
6. Share action.

The first Offering is never visually preselected as winner. URL order is selection order and is not evidence order. If the semantic owner returns an ordered result, render an **Ordered by your priorities** section before the matrix that states the priority sequence and decisive facts. Do not renumber columns as ranks; a text list may say **1. [Offering]** only inside that explicit ordered-result section.

## Component Inventory and Refactor Contract

| Surface | Reuse | Required change |
|---------|-------|-----------------|
| Public shell | `AePublicShell`, Astryx `AppShell`/`TopNav` | No new global nav item. Preserve skip link/focus bridge and mobile structural collapse. |
| Business browse | `registry.tsx`, `AeProviderCard` visual structure | Registry variant currently owns call/copy actions and only summarizes Offering names. Split a read-only business/Offering browse projection; Phase 5 task group exposes view actions only. |
| Offering summaries | `AeOfferingSupplyList`, `offering-presentation.ts` | Split current all-in-one card into reusable summary and detail compositions. Add real Offering link, exact revision/date, honest missing fields, and selection control. Keep access/support meaning source-owned. |
| Offering detail | Astryx `Layout`, `Card`, `Banner`, `Badge`, `Divider`, `Text`, `Button` | New thin route/composition. It receives one exact source semantic object and does not reconstruct facts, support, or currentness. |
| Shortlist | Astryx `Card`, `Button`, `Badge`/`Token` | New `AeShortlistBar` composition; URL-backed only, maximum four, removable items, no persistence/login. |
| Comparison | Astryx `Table` or native semantic table with Astryx tokens; existing `ProviderCompareTable` mechanics as reference | New Offering-based composition. Do not reuse `AnswerSource`, business rows, trust fields, empty-string cells, or contact-availability ordering. |
| Priority editor | Astryx `Selector`, `Button`, `Divider` | Closed dimensions and directions from semantic contract; keyboard move up/down; no drag-only reorder or free text. |
| State feedback | Astryx `Banner`, `Skeleton`, `EmptyState`; one bounded live region | Map ordinary discriminated outcomes to exact public copy below; never show internal status/reason literals. |
| Share | Existing clipboard pattern may inform behavior | Copy the canonical validated compare URL. No saved record, analytics payload containing selections, or share-token service. |

Required ownership split: source comparison semantics decide cells, comparability, reasons, priority order, and newer-revision state. Route loaders resolve URL references. Components render. Components must not parse category facts, compare values, infer freshness, or sort.

## Shortlist Interaction Contract

- Every Offering summary/detail uses a text-labelled toggle button: **Add to compare** → **Remove from compare**. `aria-pressed` reflects selection, and the accessible name includes the Offering name when repeated in a list.
- Adding updates validated URL state without a login or mutation. Focus remains on the invoking button. One `aria-live="polite"` message says **[Offering] added. 2 of 4 selected.** Removing says **[Offering] removed. 1 selected.** Do not announce every affected cell.
- At one selection the shortlist says **Add one more Offering to compare.** The **Compare 1 Offering** button is disabled and linked helper text explains why.
- At two to four selections, primary CTA is **Compare 2 Offerings** (count varies).
- At four, other add buttons are disabled with persistent adjacent copy **Comparison list full — remove one to add another.** Never discard the oldest item automatically.
- The shortlist is a labelled region **Selected for comparison**. On desktop it may be sticky at the lower viewport edge. At 320px/400% it is in normal flow or a compact sticky summary that never covers focused content; expanding it reveals all names and remove buttons.
- Selection items display Offering name, business, and **Revision N**. Remove buttons are individually named **Remove [Offering] from comparison**.
- Duplicate selection is idempotent. Malformed, duplicate, or fifth URL items never create duplicate UI and are handled by the refused-state contract.

## Priority Interaction Contract

- Default result panel: **Not ranked** with **Choose priorities if you want an evidence-based order. Otherwise, compare the differences side by side.**
- Control heading: **Your priorities**. Supporting copy: **Priority order matters. AE uses the first comparable difference and does not fill in missing facts.**
- **Add a priority** opens/activates a persistent-labelled dimension Selector and direction Selector. Only dimensions shared by the selected registered profiles are offered.
- Each priority row shows an ordinal, dimension, direction, **Move up**, **Move down**, and **Remove priority**. All are keyboard controls with 44px targets. Disable impossible moves; do not hide them.
- Maximum three. At three, disable **Add a priority** and show **Maximum 3 priorities.**
- Primary action is **Apply priorities**. Secondary is **Clear priorities**. Loading label is **Updating comparison**; controls are disabled only while the new source result resolves.
- Applying priorities writes closed IDs to validated URL state and requests the canonical source result. No optimistic ranking and no client sort.
- If decisive data is missing, stale, or not comparable, retain the full matrix and show **Not ranked — [dimension] cannot be compared for every Offering.** Link **Review affected facts** moves focus to the first blocking row.
- A tie says **Not ranked — these Offerings are tied on your stated priorities.** Never manufacture a tie-breaker.
- A unique source-owned order says **Ordered by your priorities**, lists the exact rule in customer language, and uses **Why this order** disclosure for decisive facts. Avoid the word “winner” unless the source contract explicitly uses it; no score appears.

## Comparison Reading Contract

### Wide layout

At `md` and wider, use a native table (or Astryx `Table` that emits native table semantics):

- Caption: **Published facts for the exact Offering versions selected.**
- First column contains fact row headers (`<th scope="row">`).
- Offering names are column headers (`<th scope="col">`) with business and revision inside the header.
- Common envelope rows appear first: business, category, revision, observed, currentness, access-path posture, AE action support.
- Category-profile rows follow under a visually and semantically labelled row group. Grouped headers use `scope="rowgroup"` only when valid.
- Cells wrap; nothing essential truncates. Sticky first column is allowed. The scroll wrapper is keyboard focusable and labelled **Scroll comparison table horizontally** only when overflow exists.
- A selected older revision remains the column identity. A notice in that header says **Newer revision available** with actions described below.

### 320px and 400% zoom

Below `md`, render a semantically equivalent fact-by-fact list, not miniature cards that lose relationships:

- One section per comparison dimension with the dimension as heading.
- A `<dl>` inside contains one entry per Offering; `<dt>` is **[Offering], [Business], revision N** and `<dd>` is the value plus state/provenance.
- Offering order matches the table/URL order. The ordered-result summary remains separate.
- Keep all identity beside every fact. Never require a user to remember a colour or column position.
- CSS chooses table versus list; only the visible projection remains in the accessibility tree. Do not use a JavaScript viewport fork that causes SSR mismatch.

### Cell vocabulary

| Semantic state | Visible label | Detail |
|----------------|---------------|--------|
| current known fact | The formatted value | **Published by the business**, **Found in public information**, or named AE support, plus **Observed [date]** on disclosure |
| unknown | **Not known** | Explain who still needs to establish it if supplied by source |
| not supplied | **Not supplied** | **This detail was not included in the selected Offering version.** |
| stale | **Out of date** | Show last known value only when the semantic result allows it, followed by **Last checked [date]** |
| not comparable | **Not comparable** | **These Offering types do not define this fact in the same way.** |
| partial projection | **Some details are still updating** | Keep safe facts; mark affected cells individually |
| unavailable selection | **No longer available to compare** | Remove facts from display; offer explicit removal or current public version if source supplies one |

Never render empty strings, em dashes, zero, “free,” “instant,” “N/A,” or omission as a missing-state substitute.

## Exact Revision and Currentness Contract

- Every selected item displays **Revision N · Observed 23 Jul 2026** (localized date; machine-readable `<time>`).
- If the selected revision is still eligible and a newer revision exists, retain the exact selected facts and show a warning Banner: **A newer version is available** / **You are comparing revision N. The current version is revision M. Review it before replacing your selection.** Actions: **View selected version**, **Review current version**, and **Replace with current version**. Replacement is explicit and updates the URL; it never happens on refresh.
- If the exact revision was never public, is withdrawn, suppressed, or mismatched to the business, do not reveal its facts. Show **This Offering version is not available to compare.** Actions: **Remove it** and, only when source-provided, **View current Offering**.
- A changed notice is not a stale notice. “Changed” means the exact selected history remains while a newer revision exists; “Out of date” describes a fact whose validity/currentness has expired.
- Refresh and shared-link load re-resolve every item server-side. Browser state never asserts public eligibility, currentness, provenance, or support.

## Copywriting Contract

| Element | Exact copy |
|---------|------------|
| Primary browse CTA | **View Offering** |
| Primary detail CTA | **Add to compare** |
| Primary shortlist CTA | **Compare N Offerings** |
| Primary priority CTA | **Apply priorities** |
| Share CTA | **Copy comparison link** (use **Share comparison** only when the native share sheet is actually available) |
| Share success | **Comparison link copied.** |
| Share error | **The comparison link could not be copied. Copy it from the address bar.** |
| Registry empty heading | **No published Offerings match this search** |
| Registry empty body | **Try a broader service, business, or place.** |
| Registry empty action | **Clear search** |
| Compare empty heading | **Choose Offerings to compare** |
| Compare empty body | **Open a business, then add 2 to 4 Offerings. No account is needed.** |
| Compare empty action | **Browse businesses** |
| One selected | **Add one more Offering to compare.** |
| Default result | **Not ranked** / **Choose priorities if you want an evidence-based order. Otherwise, compare the differences side by side.** |
| Load error | **Comparison could not load** / **Try again. If it still fails, return to Businesses and rebuild the comparison.** |
| Refused selections | **Some Offerings could not be opened** / **They may have changed, been withdrawn, or no longer be public. The remaining selections are shown below.** |
| Partial | **Some details are still updating** / **Use the available facts, and check affected details before deciding.** |
| Demo label | **Demonstration Offering** and page note **This comparison uses labelled demonstration data.** |
| Destructive confirmation | None. Remove/replace actions are reversible URL edits and use no confirmation dialog. |

Public copy uses Offering, business, option, price, timing, details, published, observed, last checked, not known, and not supplied. Do not expose `source-owned`, `DTO`, `projection`, `manifest`, `gateway`, `routeable`, `capability`, `agentJson`, `KNOWN`, `UNKNOWN`, `UNAVAILABLE`, `NEXT_STEP`, reason codes, source hashes, or profile IDs.

## Complete State Contract

| State | Required projection and recovery |
|-------|----------------------------------|
| Loading browse/detail | Stable skeletons matching final card/header geometry; wrapper `aria-busy="true"`; no cycling marketing copy. |
| Loading compare | Keep selected headers and priority controls stable when known; skeleton fact rows; one **Loading comparison** label. |
| Empty browse | Use the exact registry empty copy above. No demand-capture form or other mutation in this phase loop. |
| Empty compare | Use exact compare empty copy and **Browse businesses**. |
| One selected | Show the item and exact helper; compare CTA disabled. |
| Refused URL item | Preserve valid items, summarize once in an error/neutral Banner, list unavailable identities only when safe, and provide remove/current actions. Never crash the loader. |
| Partial source | Banner plus per-cell state; safe facts remain readable. |
| Stale fact | **Out of date**, last checked date, optional safe last-known value; blocks priority ordering when decisive. |
| Unknown | **Not known**; blocks priority ordering when decisive. |
| Not supplied | **Not supplied**; blocks priority ordering when decisive. |
| Not comparable | **Not comparable** with plain-language reason; cross-category comparison remains useful for common rows. |
| Changed revision | Keep exact selected revision, announce once, offer deliberate review/replace. |
| Suppressed/withdrawn | Reveal no historical facts; remove or navigate to current public Offering when supplied. |
| No priority | **Not ranked** and full matrix. |
| Priority blocked | **Not ranked — [dimension] cannot be compared for every Offering.** Full matrix and blocking facts remain. |
| Tie | **Not ranked — these Offerings are tied on your stated priorities.** |
| Ordered | **Ordered by your priorities**, exact priority sequence and decisive evidence; no score or celebratory visual. |
| Share copied | One polite status; button may temporarily read **Link copied** without losing accessible name context. |
| Share failed | Inline alert with address-bar recovery; selected state remains. |
| Route error | Exact load-error copy, **Try again**, then **Browse businesses**. |

Status announcements use one bounded `aria-live="polite"` region for selection, priority, changed-revision, and copy results. Load/refusal failures use `role="alert"` once. Never give every cell a live region.

## Accessibility Contract

- WCAG AA contrast under the repository semantic tokens. Visible focus uses the Astryx accent ring with a 4px offset; do not remove Astryx focus treatment.
- All controls are reachable and operable by keyboard in DOM order. No pointer-only tooltip, hover-only fact, drag-only priority reorder, or horizontal scroll trap.
- Persistent text labels remain visible. Icon-only controls are avoided except compact move/remove controls where adjacent item context is visible and the accessible name is exact.
- Minimum interactive target 44×44px at all breakpoints. Adjacent remove/move controls retain 8px separation.
- Page has one `h1`; headings descend without skips. Breadcrumb is a labelled nav. Shortlist, priority editor, result posture, and share controls are labelled regions.
- Table/list relationships follow the comparison reading contract. The mobile list and desktop table carry the same values, states, provenance, and order.
- At 320 CSS pixels there is no page-level horizontal overflow. Only the explicitly labelled wide table may scroll at wider narrow layouts; mobile uses the list.
- At 400% zoom, controls reflow into one column, sticky regions do not cover content/focus, text does not clip, and the ordered-result reason remains before the fact projection.
- Reduced motion removes lift, scale, and animated movement. State changes may use immediate replacement or opacity only. Normal motion is functional, 120–200ms; never exceed 250ms for phase interactions.
- External-link context is visible in copy. Technical URLs wrap safely and are never placed in a title/tooltip as the only readable form.

## Responsive Contract

| Width / condition | Contract |
|-------------------|----------|
| 1280px+ | Content max width 1280px; comparison can show four Offering columns plus sticky fact column. Avoid excessive whitespace around the matrix. |
| 768–1279px | Two-column business cards may reflow; comparison table scrolls inside its labelled wrapper; priority controls wrap without changing order. |
| Under 768px | One-column routes; compare uses fact-by-fact list; action groups stack full width; shortlist expands in flow. |
| 320px | 16px page gutters, 16px card padding, no clipped names/URLs, all buttons at least 44px, no fixed bottom overlay over content. |
| 400% zoom | Treat as narrow layout regardless of physical viewport. No content loss, overlap, or reliance on sticky columns. |

## Interaction and Focus Recovery

- Route navigation moves focus to `main`/`h1` through the existing shell bridge and preserves a visible heading.
- Add/remove keeps focus on the same toggle. If removing from the shortlist itself, focus moves to the next remove control, otherwise the previous one, otherwise the shortlist heading.
- Applying priorities focuses the result-posture heading after resolution, not the first Offering.
- **Review affected facts** focuses the blocking dimension heading/row with temporary `tabindex="-1"`.
- Explicit revision replacement returns focus to the changed Offering header and announces the new revision.
- Retry keeps the page shell and selected URL intact. Back/forward navigation restores the exact URL-owned selection and priority controls.

## Demonstration and Claim Boundary

Label demo data at both page and Offering level. **Demonstration Offering** is a neutral Badge; the page note is visible near the heading. Do not use fictional review counts, ratings, availability, customer activity, or “verified” marks.

The interface may claim only that the exact hosted revision can publicly display and compare labelled professional-service and machine/data Offerings, including missing/stale/changed states, without causing an external effect. It does not claim supplier quality, useful real-world recommendations, demand, fulfilment, endpoint correctness, willingness to pay, retention, revenue, production safety, screen-reader usability in practice, or human comprehension.

## Evaluation Contract

The implementation is not visually complete until both loops pass from the same source semantic owner.

**Vertical loop:** public visitor browses, opens a professional-service Offering, adds two exact revisions, sees an unranked comparison, states **earliest current timing** or **lowest current comparable price**, receives an inspectable order or honest refusal, copies the URL, refreshes, and sees the same exact versions plus any newer-revision notice. Include unknown and stale decisive facts and prove zero inquiry/endpoint/action mutation.

**Horizontal loop:** the same route, shortlist, priority editor, result posture, table/list, and state vocabulary compare two machine/data Offerings. Only profile rows/labels differ. A cross-category pair shows common rows and explicit **Not comparable** profile rows without a new workflow or host branch.

Browser checks cover desktop, 320px, declared 400% zoom, keyboard-only operation, focus visibility/recovery, accessibility tree/table/list relationships, reduced motion, loading, empty, refused, partial, stale, unknown, not supplied, not comparable, tie, ordered, changed-revision, share success/failure, and zero external effect. Automated checks are local/hosted evidence as labelled; they are not a real screen-reader or comprehension study.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| Astryx official installed package | Existing repository components only | Existing locked dependency and repository semantic bridge; no new registry intake |
| shadcn official | None | Not applicable; competing design system prohibited |
| Third-party registries | None | No third-party block declared; vetting gate not triggered |

## Planner Handoff

The planner must preserve these implementation seams:

1. Integrate/freeze the inherited Offering source lane before UI dispatch.
2. Establish exact historical-public revision eligibility and the single comparison semantic result before rendering work.
3. Reconcile human/agent Offering v2 parity before claiming surface parity.
4. Refactor Offering summary/detail/selection compositions without importing business inquiry or execution controls.
5. Build the public URL shortlist and pure comparison projection, then verify responsive/accessibility and hosted exact-revision behavior.

The visual blast radius is limited to public registry/business Offering projections, new Offering-detail/compare routes, phase-owned comparison compositions, semantic copy/SEO, and focused UI/e2e evidence. Protected operations, Customer Request, Action Invocation, payments, inquiry, provider transport, and business-account UI remain outside this contract.

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

## UI-SPEC COMPLETE

Phase 05 human visual and interaction projection is fully specified for checker review. No unresolved design question blocks planning; source Gate 0 and hosted evidence remain execution gates, not UI-contract ambiguity.
