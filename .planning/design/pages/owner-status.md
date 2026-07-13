# /owner/status — Business status

## Register & scene

**Product register, compact density.** A business manager checks publication and request readiness on a laptop in a naturally lit office before opening for the day; the interface resembles a concise inspection sheet on warm canvas, with white working surface, ink facts, slate qualifiers, and eucalyptus only for current navigation and the next corrective action.

## Job & IA position

**One job:** answer what customers and AE can currently see or use, what was checked, and what the owner can fix next.

- **Route class:** authenticated operator in `AeOperatorShell`; `noindex`.
- **Entry points:** owner navigation `Business status`, Requests suppression banner, profile/settings links, claim completion.
- **Exits:** edit profile, request settings, open public business page, requests.
- **Blueprint:** IA-6 operator skeleton, IA-7 standard `6xl` readback, LAW-3 truthful status contract, LAW-7 summary plus evidence disclosure, LAW-8 visibility-aware empty states. The owner-inquiries blueprint supplies the linked request-readiness posture.
- This page reports R0 publication/search evidence and R1 single-request readiness only. It does not advertise future capabilities.

## Layout

`AeOperatorShell`; `max-w-6xl mx-auto px-4 md:px-6`; 12-column desktop grid. A compact identity header spans all columns. The main readback uses 8 columns; a 4-column sticky correction rail begins at `lg`. Rows are bordered sections in one inspection sheet, not an equal-card dashboard.

### Desktop, ≥1024px

```text
┌────────────────────── AeOperatorShell / max-w-6xl ──────────────────────┐
│ side nav │ Business status                         Updated 09:42        │
├──────────┴──────────────────────────────────────────────────────────────┤
│ Bright Spark Electrical                  [Published] [Requests paused] │
│ /bright-spark-electrical                      [Open business page]      │
├──────────────────────────────────────────────┬──────────────────────────┤
│ READBACK (8 cols)                            │ NEXT STEP (4 cols)       │
│ Publication                                 │ Add service area         │
│ Published · checked from current page data  │ Why it matters           │
│ [What was checked ▾]                        │ [Edit profile]           │
├──────────────────────────────────────────────┤                          │
│ Search visibility                           │ Requests are paused      │
│ Eligible to appear for listed category      │ [Change availability]    │
│ Not a promise of rank or exhaustive search  │                          │
│ [Visibility policy ▾]                       │                          │
├──────────────────────────────────────────────┤                          │
│ Request readiness                           │                          │
│ Paused by your business                     │                          │
│ Destination verified 11 Jul · delivery ok   │                          │
│ [Readiness evidence ▾]                      │                          │
└──────────────────────────────────────────────┴──────────────────────────┘
```

### Mobile, ≤375px

```text
┌──────────────── 375 ────────────────┐
│ [Menu] Business status              │ 56
│ Updated 09:42                       │
├─────────────────────────────────────┤
│ Bright Spark Electrical             │
│ Published                           │
│ Requests paused                     │
│ [Open business page]                │ 44
├─────────────────────────────────────┤
│ Publication                         │
│ Published                           │
│ Checked from current page data      │
│ [What was checked]                  │ 44
├─────────────────────────────────────┤
│ Search visibility                   │
│ Eligible for listed category        │
│ Rank and coverage are not promised  │
│ [Visibility policy]                 │ 44
├─────────────────────────────────────┤
│ Request readiness                   │
│ Paused by your business             │
│ Destination verified 11 Jul         │
│ [Readiness evidence]                │ 44
├─────────────────────────────────────┤
│ Next step: Add service area         │
│ [Edit profile]                      │ 44
└─────────────────────────────────────┘
```

The correction rail becomes the final section on mobile; it never covers or precedes the evidence it acts upon.

## Section anatomy

1. **Identity and freshness header**
   - Content: business name, canonical slug, shared updated timestamp, publication text, request-availability text, public-page link.
   - Data: route loader business projection and latest check timestamps.
   - Astryx: `Heading`, `Text`, `Badge` through `AeStatusBadge`, `Button`, shared `AeTimestamp`.
2. **Publication readback**
   - Content: `Published`, `Draft`, `Hidden`, or `Needs attention`; known facts, next transition, timestamp, object ID; `What was checked` disclosure enumerates page fields/source snapshots. `Published` means the page is currently loadable under the visibility policy, not verified business quality.
   - Data: route loader publication state and source check projection.
   - Astryx: semantic section, `Badge`, `Collapsible`, `DescriptionList` or `<dl>`.
3. **Search visibility readback**
   - Content: eligibility for current category/location/source-window projection; explicit policy and active exclusions. Copy distinguishes `checked against current published data` from `verified destination`. It never promises rank, exhaustive coverage, nearby status, or live availability.
   - Data: route loader registry/search projection and source-window policy.
   - Astryx: `Badge`, `Collapsible`, `Text`, `Button` links for corrections.
4. **Request readiness readback**
   - Content: acceptance/suppression posture, verified inquiry destination freshness, delivery-attention health, contact-budget/cooldown block if applicable, one-business R1 eligibility. Separate rows state `Business accepts requests`, `Destination verified`, and `Delivery checked`; none collapses into a vague `Ready` claim.
   - Data: route loader business inquiry-destination, suppression, routing eligibility, and delivery health projections.
   - Astryx: `Badge`, `Banner` for attention, `Collapsible`, shared timestamp.
   - **DS-7 authoritative-state bridge:** every readback row’s `AeStatusBadge` links to or controls an inline `Status detail` disclosure in that same row. The disclosure exposes the friendly label, exact authoritative state token and mapping, what that state proves, what it does not prove, last transition time, next expected transition, and the state-derived correction or visible disabled reason. The bridge is rendered from the centralized status presentation plus the source-owned state; it is never a route-local translation or documentation-only legend.
   - **Accessibility:** the badge/disclosure relationship uses `aria-describedby` or a labelled `Collapsible`; both friendly label and authoritative token are spoken, while arrows/icons are decorative.
5. **Correction rail**
   - Content: exactly one highest-priority valid correction plus secondary links. Examples: `Publish business page`, `Add service area`, `Verify request destination`, `Resume customer requests`. It never shows a disabled future capability.
   - Data: derived from current status presentation and registered actions.
   - Astryx: `Button`, `RouterLink`, `Text`; sticky positioning via Tailwind only.

## States

- **Loading:** shell, identity header, three fixed-height status rows, disclosure controls, and correction rail skeleton preserve geometry. No spinner replaces the inspection sheet.
- **Empty, no source data:** `Business details have not been added yet.` Action `Add business details`. Explain that no public/search status can be checked until details exist.
- **Empty, resource not found:** `Business not found.` Safe action `Switch business`; do not expose other owners’ records.
- **Access denied:** `You do not have access to this business status.` Use the authenticated shell and authorized recovery.
- **Temporarily unavailable:** preserve last known readback with `Last checked {time}` and a clear `Current check unavailable` Banner; action `Check again`. Never downgrade unavailable verification to failed publication.
- **Partial check failure:** only affected row becomes `Check unavailable`; other authoritative rows remain. The correction rail does not infer a fix from unknown state.
- **Error:** shell and identity remain; summary Banner names safe recovery without raw server output.
- **Streaming:** none. Refresh is an explicit readback action with one settled update; background freshness changes announce once if meaning changes.
- **Zero-JS/SEO:** authenticated, server-rendered, `noindex`; every disclosure and correction has a semantic link/form fallback. Public-page link remains a real link.

## Interactions

- Primary action is the current highest-priority correction and must name the result: `Publish business page`, `Add service area`, `Verify request destination`, or `Resume customer requests`. No generic `Fix` or `Continue`.
- `Check again` sets `aria-busy`, preserves current facts, and prevents duplicate refreshes. Completion updates the durable row and timestamp; a toast may acknowledge but is not evidence.
- Disclosures open inline; no modal is used for status explanation. Destructive unpublish or pause actions belong in their owning form/settings route with AX-2 confirmation, not on this readback.
- `Open business page` is link-out review. It opens the actual public projection and preserves return path.
- Keyboard follows normal tab order; disclosure and button behavior comes from Astryx. No page-only shortcuts are introduced.

## Copy voice

- Headline: **Business status**
- Labels: **Publication**, **Search visibility**, **Request readiness**, **What was checked**, **Visibility policy**, **Readiness evidence**, **Next step**.
- Truthful distinctions:
  - `Published` means `Your business page is currently available at this address.`
  - `Checked` means `AE checked the current published fields against this rule at {time}.` It is not independent verification.
  - `Verified destination` means `AE verified that this request destination passed the stated destination check at {time}.` It does not verify business quality, customer outcome, live availability, or willingness to accept every request.
  - `Eligible to appear` means `This page can appear for its listed category under the current source-window policy.` It does not promise placement or exhaustive search.
- Request boundary: **Your business confirms price, timing, availability, and whether it can help. Delivery status does not confirm an outcome.**
- No “all systems operational,” score, fake metric, marketplace, lead, booking, payment, wallet, procurement, fan-out, or future-readiness copy.

## Responsive

- `lg+`: 8/4 grid with sticky correction rail; status sheet stays one ordered column.
- `<lg`: rail becomes final normal-flow section. Header actions wrap below identity.
- `≤375px`: status metadata moves under each label; disclosure controls span width; business name wraps to two lines; timestamps remain legible and tabular.
- At 200% zoom and 320px, no horizontal overflow. Every target is ≥44px. Status text, shape/position, and accessible name remain available without color.

## Accessibility

- `<main>` has one `h1`; each status section has an `h2`; disclosures expose `aria-expanded`/`aria-controls`; status summary uses a labelled `<dl>`.
- One polite live region announces only a meaningful status change after refresh, for example `Request readiness changed to Requests paused`. It does not announce each check row or timestamp.
- Refresh errors use one alert; partial row failures are associated with the row heading and recovery.
- Status never depends on color. `Checked`, `Verified destination`, and `Current check unavailable` have distinct text and centralized badge presentation.
- Reduced motion makes disclosure/status updates immediate. Focus remains on `Check again` after refresh unless a blocking error summary requires focus. Shared times use `<time dateTime>`.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-3, LAW-4 | Every row states label, facts, transition, action, time, ID; checked/verified/published claims never borrow certainty. |
| LAW-7, LAW-8 | Summary plus evidence disclosure; no-source and unavailable states explain visibility and correction. |
| LAW-10, IA-1, IA-2 | Authenticated owner nav and actions derive from route registry. |
| IA-6–IA-9 | Operator shell, named 6xl width, thin route, correction rail contains decisions only. |
| AX-2, AX-7 | Link-out/inline readback here; destructive controls remain in owning routes; request boundary is visible. |
| DS-1–DS-8 | Astryx behavior, Tailwind layout, semantic tokens, central status and shared timestamps. |
| DS-13–DS-15 | Meaningful empties, geometry-preserving loading/contextual errors, accessible targets and truthful UI. |
| WEDGE-LADDER R0/R1 | Publication/search and one-business request readiness only; suppression and verified destination are explicit. |

## Anti-slop check

No side stripes, gradient text, glass, hero metrics, identical status-card grid, decorative gauges, readiness score, nested cards, or modal-first behavior. The page is a single inspection sheet with varied row anatomy. Eucalyptus marks current state/action rather than decorating every healthy row. The bright-office scene, not the generic “status dashboard equals dark telemetry” reflex, determines the restrained light presentation.
