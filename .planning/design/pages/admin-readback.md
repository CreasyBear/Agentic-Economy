# `/admin/claims`, `/admin/inquiries`, `/admin/audit-events`, `/admin/index-health`: Operational readback

## Register & scene

**Register:** product for all four authenticated operator routes.

**Physical scene:** An authorized operator in a bright office follows a correlation ID across source-owned records, checks whether private readback was allowed or denied, and chooses one explicit repair without mistaking an empty projection for a healthy system.

The shared pattern uses warm canvas for the shell, white surface for the readback plane, ink for primary facts, slate for source metadata, and eucalyptus only for current route/selection/primary action. Functional status tones supplement text and shape. The routes share a composition, not a generic dashboard card grid.

## Job & IA position

**Shared job:** Establish what the authoritative source returned, why rows are visible or withheld, and what repair is valid.

Each route has exactly one scoped job:

| Route | Customer-facing operator name | One job | Entry points | Valid exits |
|---|---|---|---|---|
| `/admin/claims` | Claim recovery | Find a claim ownership/contention record that requires review and open the source-valid repair. | Operator navigation, command menu, claim correlation/object deep link. | Claim detail/review, audit event, or operator route. |
| `/admin/inquiries` | Inquiry reconstruction | Reconstruct one R1 request path across thread, customer record, owner action, delivery, audit, funnel, and operation references without exposing private message content in the index. | Operator navigation, command menu, thread/correlation/dispatch deep link. | Authorized inquiry record, delivery/audit record, or operator route. |
| `/admin/audit-events` | Audit events | Find the redacted event that explains an admin, authorization, repair, or recovery transition. | Operator navigation, command menu, object/correlation deep link. | Related authorized object, incident, or operator route. |
| `/admin/index-health` | Index health | Determine whether catalog/projection readbacks are current enough to publish and open the exact regeneration/source repair. | Operator navigation, release-health link, command menu. | Projection/source repair, related audit event, or operator route. |

**Route class:** authenticated operator for every route (IA-1). All use `AeOperatorShell`; none are public, private-link customer records, or owner activation routes.

**Blueprint citation:** PRINCIPLES operator skeleton (IA-6), LAW-6 readback/ID requirements, LAW-8 and DS-13 empty semantics, LAW-10 route/action registry, and the `/admin/runs/:turnId` blueprint’s evidence-first operator posture. `/admin/inquiries` is an operator reconstruction view, not the owner triage blueprint and not a customer inquiry workflow definition.

## Layout

**Skeleton:** shared operator readback. `AeOperatorShell`, `max-w-7xl`, `px-4 md:px-6`, page `gap-6`, section internals `gap-4`. A full-width source/access banner precedes a compact source summary. Applied filters and scoped lookup form the primary decision layer; the sortable row table is the evidence plane. Row detail or raw source readback is one explicit layer deeper. No sticky rail until a row detail owns an actual decision.

Desktop, shared proportions:

```text
┌───────────────┬────────────────────────────────────────────────────────────────────────────┐
│ Operator nav  │ {Route name}                                            [Open record ⌘K] │
│ 240           │ {One-line route purpose}                                           1160   │
│               ├────────────────────────────────────────────────────────────────────────────┤
│ > current     │ READBACK AVAILABLE · source {name} · generated 10:42 · policy admin-only  │
│ Runs          ├────────────────────────────────────────────────────────────────────────────┤
│ Claims        │ Source summary                                                           │
│ Inquiries     │ Source {…} | window {…} | rows 24 | attention 3 | stale 1 | suppressed 0 │
│ Audit events  ├────────────────────────────────────────────────────────────────────────────┤
│ Index health  │ [Object / correlation / dispatch…________________] [State] [Apply filters] │
│               │ [Pending review ×] [Source: claims ×]                     [Clear filters]  │
│               ├─────────────────┬───────────────┬──────────────┬────────────────┬─────────┤
│               │ OBJECT          │ STATE         │ READBACK     │ CORRELATION    │ REPAIR  │
│               ├─────────────────┼───────────────┼──────────────┼────────────────┼─────────┤
│               │ claim:01J…      │ Pending review│ authoritative│ corr_01J…      │ Review  │
│               │ inquiry:01J…    │ Status unknown│ unavailable  │ corr_01J…      │ Inspect │
│               │ … sortable source-owned rows …                                               │
│               └─────────────────┴───────────────┴──────────────┴────────────────┴─────────┘
│               │ Source window statement · last successful readback · [Prev] [Next]          │
└───────────────┴────────────────────────────────────────────────────────────────────────────┘
```

Denied state retains the same page geometry but returns no private table or counts:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ ACCESS DENIED · HTTP 403 · source-owned admin membership was not resolved │
├────────────────────────────────────────────────────────────────────────────┤
│ Surface: Claims queue      Decision: membership required                  │
│ Private rows returned: 0   [Open access guidance]                         │
└────────────────────────────────────────────────────────────────────────────┘
```

Mobile, ≤375px. Table rows become labelled stacked records:

```text
┌─────────────────────────────────────┐
│ [Menu] Claim recovery  [Open record]│
├─────────────────────────────────────┤
│ Readback available                  │
│ Source claims · generated 10:42     │
│ Policy admin only                   │
├─────────────────────────────────────┤
│ 24 rows · 3 need attention          │
│ 1 stale · 0 suppressed              │
├─────────────────────────────────────┤
│ [Object or correlation…___________] │
│ [State ▾]            [Apply filters]│
│ [Pending review ×] [Clear]          │
├─────────────────────────────────────┤
│ claim:01J…                         │
│ Pending review                     │
│ Readback: authoritative            │
│ Correlation: corr_01J…             │
│ Repair: Review claim               │
│ [Open claim]                       │
├─────────────────────────────────────┤
│ [Previous]                  [Next]  │
└─────────────────────────────────────┘
```

## Section anatomy

1. **Shell identity**
   - Content: route-specific name and one-line job from the route matrix. Breadcrumbs and current-route highlight derive from the operator route registry.
   - Data source: route metadata registry, not route-local duplicate labels.
   - Components: `AeOperatorShell`, `Text`, `RouterLink`.
2. **Allowed/denied access readback**
   - Content when allowed: `Readback available`, source surface, actor reference, HTTP posture, policy/visibility statement, generated timestamp.
   - Content when denied: `Access denied`, public reason, HTTP posture, visibility policy, and `Private rows returned: 0`. It never renders private summaries, identifiers, or source-existence clues.
   - Data source: loader `AdminShellReadback` discriminated union after source-owned membership resolution.
   - Components: Astryx `Banner`, shared `AeTimestamp`, semantic fact list. The banner is durable page evidence, not a toast.
3. **Source summary**
   - Content: authoritative source name/owner, readback window or cursor, freshness, row count only when authoritative, queued/attention/stale/suppressed counts where the source supports them, last successful readback, visibility policy, and bounded coverage statement.
   - Data source: loader summary and source metadata. Missing summary facts say `Not reported by source`; they are not converted to zero.
   - Components: `AeOperatorFactGrid` or semantic `<dl>`, Astryx `Badge` for freshness state, `Text`. This is one compact strip, not hero metrics or equal cards.
4. **Scoped lookup and URL filters**
   - Content: route-valid identifier lookup, state/source/date filters, applied chips, exact match/partial-match explanation, `Apply filters`, and individual relax actions.
   - Data source: validated route search params. Result-affecting filters and sorting live in the URL. Personal density/visible-column preferences do not.
   - Components: existing `AeOperatorFilterCard`, Astryx `TextInput`, `Select`, `DateInput` when available, `Badge`, `Button`, `Collapsible` for full filters.
5. **Sortable source rows**
   - Shared columns, in scan order: Object, State, Readback, Correlation, Repair. Route-specific columns may appear between Object and Readback only when the source owns them. State is text-first. Correlation IDs are mono/tabular and copyable. Repair is a verb phrase, not an unlabeled icon.
   - Every row carries an explicit `authoritativeState` field. Its friendly `AeStatusBadge` links to a reachable `Status detail` disclosure in the same row showing: operator label; exact authoritative state token and centralized mapping; what the state proves and does not prove; last transition time; next expected transition; and current repair or visible disabled reason. This is the compact-table counterpart of `admin-runs.md`’s in-product status bridge; every badge has the bridge, including unknown and unavailable states.
   - Data source: `AdminReadbackRow[]` or route-specific source-path projection plus centralized `status-presentation.ts`. Client sorting is allowed only inside an explicitly bounded loaded window; server/global sorting updates validated URL params. The UI labels which applies.
   - Components: `AeOperatorDataTable`, Astryx compact `Table`, `AeStatusBadge`, `Badge`, `Collapsible` or semantic `<dl>` for status detail, `Button`/`RouterLink`, shared `AeTimestamp`. Badge/disclosure linkage is programmatic; the label and authoritative token are both spoken.
6. **Explicit empty region**
   - Content: one DS-13 meaning, source/visibility statement, and the smallest valid action. Empty is rendered inside the results geometry with the table heading preserved.
   - Data source: allowed readback kind plus rows/filter/source posture.
   - Components: existing `AeEmptyState` or bordered semantic section with `AeStatusBadge`, `Text`, `Button`.
7. **Pagination and source scope**
   - Content: displayed range, authoritative total when available, cursor controls, loaded-window sorting label, and source coverage. Example: `Showing 1–50 from the authorized claims source. Sorting applies to this loaded window.`
   - Data source: loader pagination/source summary.
   - Components: Astryx `Button`, `Text`.

### Route-specific row anatomy

| Route | Required object label | Additional source-owned fields | Repair labels | Correlation posture |
|---|---|---|---|---|
| `/admin/claims` | claim ID + business identity when authorized | contention/owner posture, submitted/updated time, review state | `Review claim`, `Inspect ownership evidence`, `No repair available` | Show claim correlation ID; missing is `Not recorded`, never blank. |
| `/admin/inquiries` | thread ID + child record ID where authorized | customer record state, owner action state, delivery/readback state, audit/funnel/operation reference presence; no private message preview in index | `Open source path`, `Inspect delivery`, `Inspect audit`, `Check status`, `No repair available` | Accept thread, correlation, or dispatch ID in scoped URL filters and display each with its type. At R1 there is one business/child path. |
| `/admin/audit-events` | event ID + redacted object reference | event kind, actor kind, effective timestamp, redaction posture | `Inspect audit`, `Open related object`, `No repair available` | Correlation ID plus causation ID when source supplies both; values are redacted according to policy. |
| `/admin/index-health` | index/projection name | source revision, projection revision, last success, freshness, stale/degraded/suppressed reason | `Regenerate projection`, `Inspect source`, `Source auth required`, `No repair available` | Regeneration/health correlation ID; never synthesize one client-side. |

Repair labels must map to registered actions and authorization. A label may be disabled only with a visible reason. It must not appear if no operation exists.

## States

- **Loading:** preserve shell, route heading, access-banner rectangle, six source-summary cells, filter row, table header, and 6–8 row skeletons. Use Astryx `Skeleton`; `aria-busy` labels the results section.
- **Allowed with rows:** show source summary, filters, sortable rows, and source-window statement. `Readback available` means access/readback succeeded, not that every row is healthy.
- **Empty, no source data:** DS-13 `no source data`. Copy: `No source-owned operational rows exist for this surface.` Add source/visibility policy and last successful readback. For index health, do not interpret zero checks as healthy.
- **Empty, no filter match:** DS-13 `no filter match`. Copy: `No rows match these filters.` Name every active constraint with an individual remove action; never broaden silently.
- **Empty, resource not found:** DS-13 `resource not found`, only after an exact authorized object lookup. Copy: `No authorized record matches {typed identifier}.` Do not reveal cross-tenant existence. Action `Clear object filter`.
- **Access denied:** DS-13 `access denied`. Copy: `This readback requires source-owned admin membership.` Show the decision and zero private rows. Do not render stale cached private data.
- **Temporarily unavailable:** DS-13 `temporarily unavailable`. Copy: `{Source name} readback is temporarily unavailable.` Preserve shell and applied filters. Primary `Try readback again`; secondary safe route. Do not relabel it denied, empty, or failed-row state.
- **Unmet demand:** not applicable to these operator readbacks; never use it as a generic empty.
- **Row readback unknown:** keep the row and label `Status unknown` / `Readback unavailable`; it is not `Failed`. Repair is `Check status` only when a real reconciler exists.
- **Error:** retain source-safe context and filters. Astryx error `Banner` states the operation and one recovery. Never print raw exceptions or protected payloads.
- **Streaming:** none. These are source readbacks. Refresh may retain prior rows only with explicit `Refreshing` and `Last successful readback` labels. State changes update existing rows; no decorative insertion animation.
- **Zero JS / SEO:** all routes are noindex and absent from sitemap. Server-render access posture and allowed rows. Native GET filters, sort links/buttons, pagination, and object links work without JS. Display preferences fall back to compact defaults.

### Empty copy by route

| Route | No-source copy | No-filter-match correction |
|---|---|---|
| `/admin/claims` | `No claim recovery rows were returned by the authorized claims source.` | `Remove {claim state}` / `Clear business or claim ID`. |
| `/admin/inquiries` | `No R1 inquiry source paths were returned for this authorized window.` | `Clear thread ID`, `Clear correlation ID`, or `Clear dispatch ID` individually. |
| `/admin/audit-events` | `No redacted audit events were returned for this authorized window.` | Remove event kind/date/object constraints individually. |
| `/admin/index-health` | `No index-health rows were returned. This does not prove the index is healthy.` | Remove projection/freshness constraints individually. |

## Interactions

**Primary action:** open the selected row’s registered repair or related-record link. The label names both action and object, for example `Review claim claim_01J…`, `Inspect delivery record rec_01J…`, `Inspect audit event evt_01J…`, or `Regenerate registry projection`.

**State contract:** action registry supplies visibility, authorization, disabled reason, confirmation depth, pending label, idempotency posture, durable result, and recovery. Every control has default, hover, focus-visible, active, disabled, loading, success/readback, and error behavior. Server revalidation prevents stale-state actions.

**Confirmation depth:**
- Opening/detail inspection: AX-2 depth 1 link-out review.
- Bounded readback refresh: no confirmation; maintain existing evidence and show `aria-busy`.
- Regenerating a projection when reversible and source-bounded: depth 2 inline readback naming projection, source revision, and effect.
- Destructive suppression/revocation, if a route’s real action registry supports it: depth 3 `AlertDialog`, naming retained evidence and consequence. It must not be invented merely because an operator screen exists.
- Externally observable inquiry retry: depth 4 only for the same unchanged child operation, valid authority, and idempotency key. Otherwise absent; it requires a new customer proposal/review.

**URL state versus personal options:** search IDs, row state, date, source, sort, direction, and cursor/page are URL state because they change the shared result. Density, wrapped IDs, and optional visible columns are personal display options and stay out of the URL. Persist them only through explicit `Set as my default`; never mutate team/public defaults.

**Sorting:** sortable headers are buttons with text and `aria-sort`. First activation uses the source-meaningful direction; second reverses it. A stable ID is the final tie-breaker. Sorting never discards applied filters or silently changes from loaded-window to global semantics.

**Correlation IDs:** clicking the visible copy action copies only that ID. `Open correlated records` performs a URL-filtered navigation within the operator scope. A brief toast may acknowledge copy, but the ID and resulting rows are durable evidence.

**Keyboard/focus:** Tab visits controls and explicit row actions; Enter activates links/buttons; Space toggles checkboxes/disclosures; Escape closes popovers and restores focus; table headers expose sorting through normal buttons. Applying filters focuses the results summary. Opening and returning restores the originating row. Denied/error focuses the banner heading once on route completion, not repeatedly.

## Copy voice

Shared labels: `Source summary`, `Readback`, `Visibility`, `Generated`, `Last successful readback`, `Object`, `State`, `Correlation`, `Repair`, `Apply filters`, `Clear filters`, `Open record`, `Not recorded`, `No repair available`.

Route headlines: `Claim recovery`, `Inquiry reconstruction`, `Audit events`, `Index health`.

Allowed copy: `Readback available`. Denied copy: `Access denied`. These labels describe the read operation, not the health or validity of underlying objects.

Boundary copy placement:
- `/admin/inquiries`, immediately below source summary and beside any delivery repair: **Sent never means confirmed.** `The business confirms its quote, timing, availability, and whether it can help.`
- `/admin/index-health`, beside release/regeneration action: `A current projection proves the source readback completed; it does not prove a business is routeable without an admitted, conformant capability binding.`
- `/admin/claims`, beside repair: `Claim review changes ownership posture only through the registered source action; page presence is not ownership proof.`
- `/admin/audit-events`, above rows: `Events are redacted operational evidence. They do not validate a physical-world outcome.`

Operator/builder words `request`, `run`, `evidence`, `binding`, `incident`, `correlation`, and `repair` are allowed. `Inquiry` appears because these are named protected legacy/source objects, not the product definition. No public promise or customer-facing copy leads with it.

Banned framing checked: no household assistant, lead marketplace, generic API registry, booking, payment, wallet, procurement, multi-business fan-out, quote comparison, autonomous outcome, hidden reasoning, or unimplemented repair claim.

## Responsive

- `lg` and above: persistent shell navigation; compact sortable table. Source summary may use 4–6 columns according to content, not equal decorative cards.
- Below `lg`: shell navigation collapses structurally; optional source columns hide only when their values move into a labelled row disclosure.
- At ≤640px: rows become stacked semantic records with Object and State first, then Readback, Correlation, and Repair. No horizontal page scroll. Repair remains a full-width 44px target.
- Filters become a single-column form; applied chips wrap. Source summary becomes a `<dl>` with paired labels/values.
- IDs wrap safely or use an internal labelled scroller. Full values remain copyable and accessible.
- At 320px and 200% zoom, no information required for state or repair is clipped, and display-only options never displace the primary repair.

## Accessibility

- Landmarks: shell `<nav>`, `<main>`, `h1`, access/source `<section aria-labelledby>`, filter `<form>`, results `<section aria-labelledby>`, and pagination `<nav>`.
- Allowed and denied use one durable `Banner`; denial uses no hidden table. Status has text plus badge/position. Icons and tones are supplementary.
- Desktop tables have accessible names, scoped headers, and `aria-sort`. Mobile row lists use `<article>` headings and labelled facts. Both projections expose the same state, IDs, readback, and repair.
- Shared timestamp uses `<time dateTime>` and the central formatter. IDs use mono/tabular text with visible type labels.
- One polite live region announces filter/readback completion, for example `3 audit events match`. Row state refresh announces only distinct authoritative transitions. Access/readback errors use one `role="alert"` with recovery. Copy success can use a short toast and is not lifecycle evidence.
- Disabled repair actions expose a visible reason and accessible description. No action is icon-only.
- Reduced motion makes disclosure, sorting focus, and row-state updates immediate. Refresh indicators do not pulse indefinitely.
- At 200% zoom, heading order, reading order, focus order, and row action adjacency remain intact.

## Rule compliance

| Rule | How all four routes satisfy it |
|---|---|
| LAW-2 | Every row exposes stable object and correlation identity with canonical authorized links. |
| LAW-3 | State rows include text label, known readback, next valid repair/none, timestamp where supplied, and object ID. |
| LAW-4 | Unknown, denied, empty, failed, stale, delivery, and business confirmation remain distinct claims. |
| LAW-5 | Scope/effect is repeated before regeneration, destructive action, or valid delivery repair. |
| LAW-6 | Correlation IDs, audit/readback history, related links, and durable result replace toast-only evidence. |
| LAW-7 | Applied filter/source summary is the first layer; full filters/row detail are the second. No third summary. |
| LAW-8 | Every zero state identifies source, filters, visibility, or availability and the smallest correction. |
| LAW-10 | Routes, navigation, open-record, and repairs derive from registries and authorization. |
| IA-1 | Every route is authenticated operator. |
| IA-2 | Side nav, breadcrumbs, command menu, and actions share route/action authority. |
| IA-5 | No route enters sitemap or search indexing. |
| IA-6 | `AeOperatorShell` owns chrome. |
| IA-7 | `7xl`, named gutters, gap 6 blocks, gap 4 internals. |
| IA-8 | Routes own auth/search/loading; shared readback composition owns rendering. |
| IA-9 | No action rail duplicates evidence; row repairs stay adjacent to their source facts. |
| CH-2 | Private source evidence stays protected; public projections never receive correlation/raw rows. |
| CH-3 | Redacted evidence is not described as hidden reasoning. |
| CH-9 | Known failure classes have one cause-specific recovery. |
| AX-2 | Inspection, regeneration, destructive changes, and external retries use consequence-appropriate depth. |
| AX-3 | Repair labels name action and object; no bare Confirm/Submit. |
| AX-5 | Consequential actions lock duplicates and produce correlation/readback. |
| AX-6 | Inquiry proposal, approval, record, delivery, and business assertions remain separate source facts. |
| AX-7 | Business-confirmation boundary sits beside inquiry delivery actions/readback. |
| DS-1 | Astryx and existing AE operator/readback compositions only. |
| DS-2 | Tailwind layout, Astryx behavior. |
| DS-3 | Semantic token names only. |
| DS-4 | Complete focus, keyboard, disabled, loading, and error contracts. |
| DS-5 / DS-6 | Astryx motion tiers only; reduced-motion branch is immediate. |
| DS-7 | Central `AeStatusBadge` mapping; text-first state and operator/authoritative bridge when labels differ. |
| DS-8 | Shared timestamps and mono/tabular identifiers. |
| DS-10 / DS-11 | Honest `aeTheme`; no dark-mode claim. |
| DS-12 | Filter/action forms use shared error and pending behavior. |
| DS-13 | No-source, no-match, not-found, denied, unavailable, and unmet-demand meanings remain explicit. |
| DS-14 | Skeleton geometry and error context persist. |
| DS-15 | 44px targets, non-color state, no fake source/evidence claims. |
| WEDGE R1 | Inquiry reconstruction is one business/one child path; no fan-out, response comparison, procurement, payment, or wallet UI. |

### Route-specific compliance notes

- `/admin/claims`: LAW-4 prevents page presence from becoming ownership proof; repair follows source-owned membership and action authority.
- `/admin/inquiries`: LAW-4, AX-6, and AX-7 keep recorded, delivered, replied, and business-confirmed facts separate; R1 cardinality remains one.
- `/admin/audit-events`: CH-2 and CH-3 enforce redaction and prohibit private-reasoning theatre; an event is evidence of a recorded transition only.
- `/admin/index-health`: LAW-4 prevents a current projection from becoming a routeability or business-quality claim; source and binding health remain distinct.

## Anti-slop check

No side-stripe accents, gradient text, glassmorphism, hero-metric block, identical-card grid, or modal-first behavior. Summary facts form one compact `<dl>`, not KPI theatre. Rows use a familiar table/list readback pattern rather than cards for every record. The category-reflex check passes: this is not a dark blue admin/observability dashboard. The daylight scene and established warm canvas, white surface, ink, slate, and restrained eucalyptus system determine the theme. Status, repair, and access posture provide the visual hierarchy; no ornamental charts, fake activity, or decorative lifecycle graphics are present.
