# `/admin/runs`: Runs

## Register & scene

**Register:** product.

**Physical scene:** A network operator uses a wide office monitor in ordinary daylight to scan a compact queue, then opens one anomalous run and follows evidence without losing the object identity or current authoritative state.

The page uses the restrained AE product strategy: warm canvas around the operator shell, white surfaces for evidence, ink for primary text, slate for secondary text, and eucalyptus only for current selection, the primary action, and the active route. Status color is supplementary.

## Job & IA position

**One job:** Find the run that needs inspection and open its evidence workspace.

**Route class:** authenticated operator, rendered inside `AeOperatorShell` (PRINCIPLES IA-1, IA-6).

**Entry points:** operator side navigation, command menu `Navigate → Runs`, scoped `Open record` by run/turn ID, a related-object link from an authorized thread or delivery record, and a canonical shared operator URL with filters.

**Exits:** `/admin/runs/:turnId`, a related authorized object, or another operator route. Authentication failure exits to the existing sign-in/access recovery without disclosing whether private rows exist.

**Blueprint:** PRINCIPLES §10 `/admin/runs/:turnId`, with this list as its object-finding companion. LAW-10 requires every navigation projection to derive from the route/action registry.

## Layout

**Skeleton:** operator. `AeOperatorShell` owns navigation and chrome; page content uses `max-w-7xl`, `px-4 md:px-6`, `gap-6`. The list is one dense table surface rather than a card grid. The filter summary is the primary disclosure level; the full filter panel is the second (LAW-7). No sticky decision rail is needed on the list.

Desktop, 1440px viewport, approximately 240px shell navigation + 1160px content:

```text
┌───────────────┬────────────────────────────────────────────────────────────────────────────┐
│ Operator nav  │ Runs                                                     [Open record ⌘K] │
│ 240           │ Inspect private run evidence.                                          1160│
│               ├────────────────────────────────────────────────────────────────────────────┤
│ > Runs        │ Access: run evidence available · generated 13 Jul 2026 10:42             │
│ Claims        ├────────────────────────────────────────────────────────────────────────────┤
│ Inquiries     │ [Status: failed ×] [Kind: delivery ×] [Date: 13 Jul ×] [All filters]      │
│ Audit events  │ 14 matching runs                                      [Density: Compact]  │
│ Index health  ├──────────────┬────────────┬──────────────┬───────────────┬───────────────┤
│               │ STATE        │ KIND       │ ACTOR        │ START / END   │ RUN / TURN    │
│               ├──────────────┼────────────┼──────────────┼───────────────┼───────────────┤
│               │ Failed  !    │ delivery   │ system       │ 10:31 / 10:32 │ run_… / turn… │
│               │ Status       │ answer     │ agent:…      │ 10:24 / 10:25 │ run_… / turn… │
│               │ unknown  ?   │            │              │               │               │
│               │ Succeeded    │ answer     │ agent:…      │ 10:08 / 10:09 │ run_… / turn… │
│               │ … virtualized/paginated dense rows …                                    │
│               └────────────────────────────────────────────────────────────────────────────┘
│               │ Showing 1–50 of 14                                      [Prev] [Next]     │
└───────────────┴────────────────────────────────────────────────────────────────────────────┘
```

Mobile, ≤375px. `AeOperatorShell` navigation becomes the shell-owned drawer. The table becomes a semantic compact row list, not a horizontally clipped desktop table:

```text
┌─────────────────────────────────────┐
│ [Menu] Runs            [Open record]│ 44
├─────────────────────────────────────┤
│ Run evidence available              │
│ Generated 13 Jul, 10:42             │
├─────────────────────────────────────┤
│ [Failed ×] [Delivery ×]             │
│ [Date ×]              [All filters] │
│ 14 matching runs     [View options] │
├─────────────────────────────────────┤
│ Failed  !                 10:31     │
│ delivery · system                  │
│ turn_01J…                           │
│ run_01J…                 1m 08s     │
├─────────────────────────────────────┤
│ Status unknown  ?        10:24     │
│ answer · agent:answer              │
│ turn_01J…                           │
│ run not recorded         47s       │
├─────────────────────────────────────┤
│ [Previous]                  [Next]  │
└─────────────────────────────────────┘
```

## Section anatomy

1. **Shell heading and scoped access readback**
   - Content: `Runs`, one-line purpose, access decision, source/generated timestamp, and no private counts when denied.
   - Data source: route loader `HarnessRunViewerListResult`; authentication and membership resolution precede private row retrieval.
   - Components: `AeOperatorShell`, Astryx `Banner`, `Text`, shared `AeTimestamp`.
2. **Applied-filter summary**
   - Content: removable chips for status, kind, actor, date range, evidence presence, run/turn/thread ID; result count; `All filters` disclosure.
   - Data source: validated route search params. Canonical filter keys are URL state. Unknown keys are rejected or ignored without changing results.
   - Components: Astryx `Badge` for chips, `Button`, `TextInput`, `Select`, `Popover` or `Collapsible` according to the available Astryx filter composition; Tailwind only arranges controls.
3. **Personal display options**
   - Content: density (`compact` default, `comfortable`), visible optional columns, and wrap/truncate preference.
   - Data source: operator-scoped personal preference storage. These options never alter membership, sorting, filtering, URL results, exports, or team defaults. A separate explicit `Set as my default` action is required for persistence.
   - Components: Astryx `Menu` or `Popover`, `Checkbox`, `RadioGroup`, `Button`.
4. **Dense run rows**
   - Content order is fixed: text status first; failure/unknown marker with visible text; run kind; actor; started/ended timestamps; duration; run ID and turn ID. Query preview is optional secondary content, never the row title. Test/simulated structure appears before status.
   - Data source: loader row projection. Sorting keys are validated URL state if they change the shared result order. Stable tie-breaker: started descending, then turn ID.
   - Components: `AeOperatorDataTable`, Astryx compact `Table`, `TableHeader`, `TableRow`, `TableCell`, `AeStatusBadge`, shared `AeTimestamp`, `RouterLink`. Row activation opens the canonical detail URL; the row retains a visible link.
5. **Pagination or source window**
   - Content: shown range, total only when authoritative, previous/next actions, and an explicit bounded-source statement when total coverage is unavailable.
   - Data source: loader pagination cursor and source summary.
   - Components: Astryx `Button`, `Text`.

## States

- **Loading:** retain shell, heading, access-banner rectangle, one filter row, table header, and 8 fixed-height row skeletons. Use Astryx `Skeleton`; do not replace a list with a centered spinner. `aria-busy` belongs on the results region, not the whole page.
- **Empty, no source data:** DS-13 `no source data`. Copy: `No run evidence has been recorded for this source.` Secondary: `The source returned zero authorized run rows.` No invented repair action.
- **Empty, no filter match:** DS-13 `no filter match`. Copy: `No runs match these filters.` List every active constraint with its own `Remove {filter}` action plus `Clear all filters`. Never broaden silently.
- **Empty, access denied:** DS-13 `access denied`. Copy: `Run evidence is restricted to authorized network operators.` Show HTTP/access decision and zero private rows returned; do not reveal counts, IDs, or whether a requested run exists.
- **Error:** keep shell, heading, current filter summary, and a contextual Astryx `Banner`: `Run readback is temporarily unavailable.` Primary recovery `Try readback again`; safe exit `Open operator home`. Do not print raw exception text.
- **Streaming:** none. Rows appear only from an authoritative loader/readback. A refresh may use stale-while-revalidate only if `Last read back {time}` remains visible and the old rows are explicitly marked `Refreshing`.
- **Zero JS / SEO:** authenticated route is noindex and omitted from sitemap. Server-render the access posture, applied filters, and first settled page where authentication permits. Native GET filters and row links work without client JavaScript. Personal display options may fall back to compact defaults.

## Interactions

**Primary action:** open one run detail using the row’s explicit run/turn link. It is a depth-1 link-out review under AX-2, with no confirmation.

**Filter contract:** filter edits are drafts inside the full panel; `Apply filters` performs a GET navigation, updates the URL, resets the page cursor, focuses the results heading, and announces the result count. Removing a chip applies immediately via URL navigation. `Clear all filters` is reversible and needs no modal.

**Linear state split:** result-affecting state belongs in the URL: status, kind, actor, date, evidence presence, IDs, sort, direction, cursor/page. Display-only personal options stay out of the URL: density, optional columns, wrapping. A display option cannot mutate shared/team defaults silently (anti-pattern 10).

**Keyboard:** Tab reaches controls and visible row links; table headers use buttons with `aria-sort`; Enter activates a focused link; Escape closes filter/display popovers and returns focus; `/` may focus the scoped filter only when a visible equivalent exists. Command-menu shortcuts are supplementary.

**Focus:** route entry focuses the `h1`; applying filters focuses the results summary; detail back navigation restores the originating row when present. Error retry returns focus to the results heading. No whole-row custom keyboard handler duplicates the link.

## Copy voice

- Headline: `Runs`
- Description: `Inspect run state, evidence coverage, failures, and related records.`
- Key labels: `State`, `Kind`, `Actor`, `Started`, `Ended`, `Duration`, `Run ID`, `Turn ID`, `Failure`, `Open run`, `All filters`, `View options`.
- Status labels name current proof: `Pending`, `Running`, `Succeeded`, `Failed`, `Blocked`, `Timed out`, `Stopped`, `Status unknown`, `Evidence missing`.
- Boundary placement: a persistent line under the source summary states `A run records AE execution evidence. It does not prove a business confirmed price, timing, availability, or an external outcome.` If a delivery-bearing row is shown, its status cell includes `Sent never means confirmed` in the accessible description.
- Checked bans: no customer-facing internal item/receipt/tuple language; operator terms run, evidence, binding, and incident are permitted. No booked, paid, guaranteed, marketplace, wallet, procurement, fan-out, or comparison-of-responses claims.

## Responsive

- At `lg`, shell navigation is persistent and rows use the compact table.
- Below `lg`, lower-priority ID and end-time columns can hide only through the documented responsive projection; all values remain in the row’s labelled detail disclosure.
- At ≤640px, table rows project to semantic stacked links with status first. No horizontal page scroll. IDs break safely; timestamps use short visible text while retaining full ISO in `<time>`.
- Filter chips wrap. Full filters become a single-column disclosure. Display options remain separate.
- Every control and row’s explicit link has a minimum 44px target. Dense visual spacing must not shrink the target box.

## Accessibility

- Landmarks: shell `<nav>`, page `<main>`, `h1`, filter `<form aria-labelledby>`, results `<section aria-labelledby>`, and pagination `<nav aria-label="Runs pages">`.
- The desktop table has a caption or accessible name, scoped column headers, `aria-sort`, and no visual-only row state. Mobile uses a list of articles/links with equivalent labels.
- Status is text plus position/shape; `!` and `?` are decorative unless paired with visible text. Test/simulated marking is a leading text label and structural grouping, not color.
- One polite live region announces `14 runs match` after filter navigation. Refresh timestamp changes and row hover are silent. Loader errors use one `role="alert"` after failure.
- Reduced motion reaches final disclosure/focus states immediately. No animated row insertion.
- At 200% zoom and 320px width, there is no horizontal page overflow; IDs wrap and actions remain reachable.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-2 | Stable turn/run IDs link to canonical detail URLs. |
| LAW-3 | Every row leads with authoritative text state, timestamp, object ID, and state-specific recovery on detail. |
| LAW-4 | Unknown, failed, sent, and confirmed are never conflated. |
| LAW-7 | Chips are the decision layer; full filters are the one deeper layer. |
| LAW-8 | Source-empty, filter-empty, and denied states are distinct and corrective. |
| LAW-10 | Shell navigation, command menu, and open-record actions derive from one registry. |
| IA-1 | Authenticated operator route only. |
| IA-2 | Navigation and command authorization agree. |
| IA-5 | No sitemap or indexing. |
| IA-6 | Uses `AeOperatorShell`. |
| IA-7 | `7xl`, `px-4 md:px-6`, gap 6 blocks and gap 4 internals. |
| IA-8 | Loader/search/auth stay in route; row composition remains reusable. |
| CH-2 | Private run evidence stays authorized and separate from public work records. |
| CH-3 | No hidden-reasoning or thinking labels. |
| AX-2 | Opening detail is link-out review; filters require no confirmation. |
| AX-7 | External-outcome boundary sits under source summary and in delivery status descriptions. |
| DS-1 | Astryx controls and existing AE operator compositions only. |
| DS-2 | Tailwind arranges layout; Astryx owns behavior. |
| DS-3 | Semantic tokens only. |
| DS-4 | Filter, menu, link, and loading states preserve labels, focus, disabled reasons, and keyboard behavior. |
| DS-5 / DS-6 | Astryx motion tiers only; reduced motion is immediate. |
| DS-7 | Text-first centralized state labels; no local status taxonomy. |
| DS-8 | Shared `<time>` and mono/tabular IDs/timestamps. |
| DS-10 / DS-11 | `aeTheme`; no unsupported dark mode claim. |
| DS-13 / DS-14 | Six-meaning taxonomy is applied; skeleton geometry and error context persist. |
| DS-15 | 44px targets, non-color status, truthful labels. |

## Anti-slop check

No side-stripe accents, gradient text, glassmorphism, hero-metric template, identical card grid, or modal-first interaction is present. The summary is a compact evidence strip, not decorative metrics. The design uses familiar operator density without the category reflex of a dark observability dashboard; the daylight scene and existing warm canvas/white surface system determine the light product treatment. Cards do not wrap each row, and no card nests inside another.

# `/admin/runs/:turnId`: Run evidence

## Register & scene

**Register:** product.

**Physical scene:** An operator investigating one failed or uncertain operation on a wide daylight monitor needs the current state, its consequence evidence, and its object lineage to remain visible while machine detail is progressively disclosed.

The scene uses the same restrained token strategy as the list. Evidence hierarchy, not decoration, gives the workspace its character.

## Job & IA position

**One job:** Decide what this run proves, what needs attention, and which authorized recovery is valid.

**Route class:** authenticated operator. The route lives in `AeOperatorShell` and is never indexable.

**Entry points:** selected list row, command menu `Open record`, authorized deep link from thread/proposal/record/delivery attempt/incident, or canonical URL.

**Exits:** back to `/admin/runs` with prior URL filters intact, open a related authorized object, open an incident, or perform the one state-valid recovery.

**Blueprint citation:** PRINCIPLES §10 `/admin/runs/:turnId`: object workspace with identity header, audience-label to authoritative-state bridge, state-gated actions, related graph, collapsed machine noise, always-reachable consequence evidence, raw JSON one layer deeper, and structural test/simulated marking.

## Layout

**Skeleton:** operator object workspace. `AeOperatorShell`; `max-w-7xl`; `px-4 md:px-6`; `gap-6`. At `lg`, a `minmax(0,1fr) 20rem` grid gives facts/evidence the main column and a sticky decision rail. The rail owns only current action and correction path (IA-9). Tabs are the second disclosure layer; raw JSON is nested one layer below its evidence section, not a competing top-level summary.

Desktop:

```text
┌───────────────┬────────────────────────────────────────────────────────────────────────────┐
│ Operator nav  │ Runs / turn_01J…                                      [Copy record link] │
│               ├────────────────────────────────────────────────────────────────────────────┤
│               │ TEST RECORD: route=test · data=simulated · capability=answer_only          │
│               │ Run turn_01J…                     [Operator: Needs readback] [Kernel: …]    │
│               │ run_01J… · actor agent:answer · started 10:31 · updated 10:32              │
│               ├────────────────────────────────────────────────────────┬───────────────────┤
│               │ Status bridge                                          │ Current action    │
│               │ label ↔ authoritative state ↔ proof ↔ next transition │ Check status      │
│               │                                                        │ Disabled reason…  │
│               ├────────────────────────────────────────────────────────┤ Incident          │
│               │ [Overview] [Evidence] [Related] [Public diff] [Machine]│ Report incident   │
│               │                                                        │                   │
│               │ Consequence evidence (never collapsed)                 │ Boundary          │
│               │ approval decision · exact scope · record · delivery    │ Sent never means  │
│               │ failure/status unknown · correlation IDs               │ confirmed.        │
│               │                                                        │                   │
│               │ Related object graph                                   │                   │
│               │ thread → proposal → record → attempts → run            │                   │
│               │                                                        │                   │
│               │ Machine detail [collapsed] → Raw JSON [collapsed]      │                   │
│               └────────────────────────────────────────────────────────┴───────────────────┘
└───────────────┴────────────────────────────────────────────────────────────────────────────┘
```

Mobile, ≤375px. The sticky rail disappears; its current action becomes an in-flow section after status and consequence evidence:

```text
┌─────────────────────────────────────┐
│ [Back] Run evidence          [More] │
├─────────────────────────────────────┤
│ TEST RECORD                         │
│ route test · simulated data         │
│ capability answer only              │
├─────────────────────────────────────┤
│ turn_01J…                           │
│ Needs readback                      │
│ Kernel: settled/status_unknown      │
│ Updated 13 Jul, 10:32               │
├─────────────────────────────────────┤
│ Status bridge                       │
│ Proof: provider readback unavailable│
│ Next: reconciler checks same attempt│
├─────────────────────────────────────┤
│ Consequence evidence                │
│ Approval · scope · record · attempts│
│ [Open record]                       │
├─────────────────────────────────────┤
│ Current action                      │
│ [Check status]                      │
│ Sent never means confirmed.         │
├─────────────────────────────────────┤
│ [Overview] [Evidence] [More tabs…]  │
│ Related objects                     │
│ Thread                              │
│   ↓ Proposal                        │
│   ↓ Record                          │
│   ↓ Delivery attempts               │
│   ↓ This run                        │
│ [Machine detail, collapsed]         │
│   [Raw JSON, collapsed]             │
└─────────────────────────────────────┘
```

## Section anatomy

1. **Structural environment marker**
   - Content: test/simulated status before the identity heading, with route, data, and capability posture as separate text fields. Production records omit the region entirely.
   - Data source: loader-provided environment provenance, never inferred from ID shape or display copy.
   - Components: semantic `<aside aria-label="Record environment">`, Astryx `Banner` or `Badge` plus `Text`. It uses text, full-width placement, and a labelled boundary; color is optional.
2. **Identity header**
   - Content: turn ID as the page identity, run ID, kind, actor, started/updated timestamps, source, and public-diff posture. IDs are copyable but not editable.
   - Data source: run/turn projection.
   - Components: `AePageHeader` composition within `AeOperatorShell`, `Badge`, `Button`, `AeTimestamp`, `Text`.
3. **In-product status bridge**
   - Content: operator label, authoritative state token, what the state proves, what it does not prove, next expected transition, timestamp, current owner, and recovery/disabled reason. This bridge is visible on Overview and linked from every compact `AeStatusBadge`; it is not documentation elsewhere.
   - Data source: centralized `status-presentation.ts` plus authoritative run/delivery state.
   - Components: `AeStatusBadge`, Astryx `DescriptionList` if available, otherwise semantic `<dl>` with `Text`; no route-local status badge.

   Example bridge:

   | Operator label | Authoritative state | What is proven | Next expected transition | Action / disabled reason |
   |---|---|---|---|---|
   | Running | `executing` | The approved operation started under this run identity. | A terminal run event or provider readback. | `Stop run` only if the producer supports cancellation; otherwise `No operator cancellation is registered.` |
   | Delivery retrying | `executing/delivery_retrying` | The same child operation is inside its declared retry budget. No new send is authorized. | Retry attempt outcome. | `View retry budget`; duplicate send disabled because the operation already exists. |
   | Needs readback | `settled/status_unknown` | The receipt exists, but authoritative provider readback is unavailable. Failure and success are both unproven. | Reconciler reads the same provider submission. | `Check status`; never `Send again`. |
   | Delivery failed | `settled/delivery_failed` | Authoritative non-delivery evidence was recorded. | Operator chooses the permitted alternate contact or closes the incident. | `Open delivery evidence`; retry only if policy and unchanged payload permit it. |
   | Succeeded | `settled` | AE’s registered run completed its own declared operation and evidence checks. | No automatic transition. | `No action needed`; does not prove business acceptance or physical-world success. |

4. **Consequence evidence, never collapsed**
   - Content: permission decision, exact authorized scope, principal/actor distinction, immutable digest or payload hash, recipient binding, purpose, expiry, idempotency/correlation IDs, record, delivery attempt outcomes, unresolved failure, cancellation, and incident links. Values may be redacted according to policy, but the existence, decision, state, lineage, and redaction reason remain visible.
   - Data source: permission, record, delivery, and audit projections. `auditClass='never_collapse_evidence'` governs inclusion.
   - Components: semantic sections, `AeOperatorFactGrid`, `AeStatusBadge`, Astryx `Table`, `Banner`, `RouterLink`. No nested cards.
5. **State-gated action rail**
   - Content: exactly one primary action for current state, visible disabled reason when unavailable, one correction path, incident action, and boundary statement. It does not duplicate evidence.
   - Data source: centralized action registry keyed by authoritative state and operator authorization.
   - Components: Astryx `Button`, `AlertDialog` only for destructive/irreversible cancellation, `Banner`, `Text`.
6. **Evidence workspace tabs**
   - Content: `Overview`, `Evidence`, `Related objects`, `Public diff`, `Machine detail`. Tab selection is display-only personal state and may use a URL hash for deep-link focus, but does not alter the object readback.
   - Data source: detail loader projection.
   - Components: Astryx `TabList`, `Tab` with a single labelled tabpanel.
7. **Related-object graph**
   - Content: typed, directional links with state and IDs. Missing nodes are explicit (`No proposal recorded`), never silently skipped. At R1 the path has one business and one child record.
   - Data source: relation references from thread, proposal, permission decision, first-class record, delivery attempts, run, and incident projections.
   - Components: semantic ordered list/tree on mobile; Astryx `List`, `Item`, `Badge`, `RouterLink`; Tailwind arranges the desktop graph. Lines are secondary, labels carry structure.

   ```mermaid
   flowchart LR
     T[Thread\nthreadId] --> P[Proposal\nproposal revision]
     P --> A[Approval decision\nexact scope]
     A --> R[Record\nreceipt and correlation IDs]
     R --> D1[Delivery attempt 1\nqueued to failed]
     R --> D2[Delivery attempt 2\nsame child operation]
     D1 --> RUN[Root Run\nrunId and turnId]
     D2 --> RUN
     RUN --> I[Incident\nwhen reported]
   ```

   The UI label is `Record`, while the mechanics remain a first-class receipt projection. R1 cardinality is exactly one selected business. No group comparison or fan-out controls render.
8. **Machine detail and raw JSON**
   - Content: tool/phase timings, provider diagnostics, hashes, machine events, and raw payload projections. Machine noise is collapsed by default. A `Raw JSON` disclosure sits inside Machine detail, one layer deeper. Secrets, private-link keys, protected payload fields, and hidden reasoning are omitted or redacted, not merely visually hidden.
   - Data source: authorized private run evidence.
   - Components: Astryx `Collapsible`, `Code`, `Button` for copy. Raw JSON never occupies a top-level tab.
9. **Public diff**
   - Content: explicit allowlist comparison between private evidence and public thread projection; leak marker count; excluded private markers; sanitized public projection; last check time. Success means configured private markers are absent, not that the public answer is substantively correct.
   - Data source: public projection builder plus private-marker contract.
   - Components: `Banner`, `AeOperatorFactGrid`, Astryx `Table`, nested `Collapsible` for sanitized JSON.

## States

- **Loading:** preserve identity-header, environment-marker slot, status bridge, tab bar, main evidence area, and rail geometry. IDs render as skeleton widths rather than fake values. The results region is `aria-busy`.
- **Empty, resource not found:** DS-13 `resource not found`. Copy: `Run evidence not found.` Supporting copy: `No private rows were returned for this run ID.` Do not reveal whether another tenant/operator can access it. Action `Back to runs`.
- **Empty, no source data:** a known turn with no run evidence uses `No run evidence recorded for this turn`, shows the turn identity and source posture, and offers only a source-valid repair (`Inspect audit trail` or `Back to runs`). It is not rendered as success.
- **Access denied:** DS-13 `access denied`. `Run evidence is restricted to authorized network operators.` Private node counts, IDs, JSON, and public-diff markers remain absent.
- **Temporarily unavailable:** shell, requested turn ID, access-safe context, and retry remain. `Run readback is temporarily unavailable.` No raw error.
- **Machine-section empty:** `No tool evidence was recorded for this run.` This does not erase consequence evidence or imply no operation happened.
- **Related-node missing:** each expected relation has a text state such as `No approval decision recorded` or `Record reference unavailable`, with the smallest valid repair label.
- **Streaming:** none for historical evidence. During an active run, authoritative event refresh updates the existing status and timeline. Announce phase/state boundaries only, never tool tokens or counters. A visible `Live readback`/`Last read back` label distinguishes freshness.
- **Zero JS / SEO:** noindex, absent from sitemap. Server-render identity, status bridge, consequence evidence, and related links. Native links and `<details>` fallback keep inspection usable; state-changing actions require JS only where the existing protected action contract requires it, and remain clearly unavailable otherwise.

## Interactions

**Primary action:** determined solely by authoritative state and authorization. Examples: `Check status` for `status_unknown`; `Open delivery evidence` for `delivery_failed`; `No action needed` for terminal success. No generic retry.

**Full state contract:** every action has default, hover, focus-visible, active, disabled with visible reason, loading with unchanged label plus `aria-busy`, success as durable updated state, and error preserving prior evidence. The server revalidates state and authorization at commit time. Stale actions fail closed and refresh the bridge.

**Confirmation depth:** inspection links are AX-2 depth 1. Bounded non-consequential display changes need none. A source-supported reversible repair uses inline depth 2 with exact scope. Cancellation or destructive incident closure uses depth 3 `AlertDialog` naming retained evidence and external consequences. Any externally observable retry uses depth 4 only when it is the same idempotent child operation with unchanged payload and valid authority; otherwise the action is absent and a new proposal/review is required.

**Tabs/disclosures:** Arrow keys move tabs per ARIA tabs pattern. Enter/Space toggles `Collapsible`. Deep links select and focus the related tab/node without auto-collapsing focused content. User collapse preferences never hide consequence evidence.

**Copy actions:** `Copy run ID`, `Copy correlation ID`, and `Copy operator link` can toast acknowledgement, but the value remains visible as the durable record. Copy never includes private-link secrets.

**Focus:** route entry focuses `h1`; status transition focuses nothing automatically and announces once; a completed action focuses the updated status heading; dialog dismissal returns to its invoker; not-found focuses its heading; deep links focus the exact graph/evidence node.

## Copy voice

- Headline: `Run evidence`
- Identity label: `Turn {turnId}` with `Run {runId}` as a labelled field.
- Key labels: `Operator status`, `Authoritative state`, `What this proves`, `Does not prove`, `Next transition`, `Current owner`, `Consequence evidence`, `Related objects`, `Public diff`, `Machine detail`, `Raw JSON`, `Report incident`.
- Structural environment copy: `Test record`, `Route: test`, `Data: simulated`, `Capability: answer only`. Never use color or a tiny badge alone.
- Boundary placement: status bridge, consequence evidence, and action rail each preserve the relevant boundary. Canonical delivery copy is verbatim: **Sent never means confirmed.** For an R1 record: `The business confirms its quote, timing, availability, and whether it can help.`
- `Succeeded` is always qualified as run-operation success. It never means booked, accepted, paid, delivered in the physical world, or business-confirmed.
- Banned framing checked: no wallet/payment/procurement/fan-out/comparison-of-responses UI; no hidden-chain-of-thought claim; no fake provider or outcome.

## Responsive

- At `lg`, the 20rem rail is sticky below shell chrome. Main evidence stays primary.
- Below `lg`, rail content enters document order after the status bridge and never before consequence evidence.
- Tabs may horizontally scroll within their own labelled region, but the page must not overflow. A `More tabs` menu is permitted only if selected state remains exposed and keyboard semantics remain intact.
- Desktop graph uses horizontal progression. At ≤640px it becomes a vertical ordered lineage with visible relation verbs.
- IDs and hashes wrap or use an internal copyable code scroller; no page-level overflow. Full values remain accessible.
- Every action/disclosure/link has a 44px target. At 200% zoom, action and boundary copy remain adjacent.

## Accessibility

- Landmarks: shell nav, main, identity header, labelled evidence sections, complementary action region at desktop, and one tablist/tabpanel pair.
- The environment marker is announced before the title and referenced by the main article’s `aria-describedby` when present.
- Status bridge uses a semantic `<dl>` or table with headers. Operator label and authoritative state are both spoken; arrows/icons are decorative.
- Related graph has a text-equivalent ordered list preserving direction, node type, ID, state, and link. Visual connector lines carry no unique meaning.
- One page-owned polite live region announces authoritative state transitions: `Run status changed to Needs readback. Authoritative state settled status unknown.` Tool/phase increments are silent. Action failures use one alert including recovery.
- Consequence evidence cannot be collapsed or made inert. Collapsed machine content is removed from focus order and accessibility tree according to Astryx `Collapsible` semantics.
- Reduced motion makes tab/disclosure/state transitions immediate. No pulsing “live” ornament.
- Raw JSON has an accessible label, line wrapping option, and copy control; syntax color is supplementary.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-2 | Stable turn/run and related-object URLs survive state changes. |
| LAW-3 | Bridge supplies label, authoritative state, facts, next transition, action/recovery, timestamp, owner, and ID. |
| LAW-4 | Success, failure, unknown, delivery, and business confirmation remain separate. |
| LAW-5 | Exact scope/evidence sits before any consequence-bearing recovery. |
| LAW-6 | Record, correlation, delivery attempts, resend/retry lineage, and revisit paths remain durable. |
| LAW-7 | Evidence workspace is primary; machine detail and nested raw JSON are deliberate deeper layers. |
| LAW-9 | Consequence evidence classes remain visible; machine noise alone may collapse. |
| LAW-10 | Related links/actions and command entries derive from registries and authorization. |
| IA-1 | Authenticated operator route. |
| IA-2 | Shell, breadcrumbs, commands, and links share route/action authority. |
| IA-5 | No indexing or sitemap entry. |
| IA-6 / IA-7 | Operator shell, `7xl`, named gutters/rhythm. |
| IA-8 | Route owns auth/loading/params; workspace composition is reusable. |
| IA-9 | Rail contains current decision and correction, never duplicate evidence. |
| CH-1 | Run and delivery tuples come from the transition registry. |
| CH-2 | Public work record, private run evidence, and public diff remain separate. |
| CH-3 | No private reasoning is shown or implied. |
| CH-6 / CH-9 | Failures persist with exactly one cause-specific recovery. |
| AX-2 | Confirmation depth follows actual consequence. |
| AX-3 / AX-5 | Any commit names object/consequence, locks duplicates, and produces durable readback. |
| AX-6 | Proposal, approval, execution, record, delivery, and business assertion remain distinct nodes. |
| AX-7 | Business-confirmation boundary is beside actions and records. |
| DS-1 / DS-2 | Astryx behavior, AE compositions, Tailwind layout only. |
| DS-3 | Semantic tokens only. |
| DS-4 | Complete interaction state contract and focus behavior. |
| DS-5 / DS-6 | Astryx tiers and immediate reduced-motion branch. |
| DS-7 | Central mapping plus visible in-product label/state bridge. |
| DS-8 | Shared `<time>` and mono/tabular IDs. |
| DS-12 | Any state-changing form uses the shared error/submission contract. |
| DS-13 / DS-14 | Not-found, denied, no-evidence, unavailable, loading, and error meanings remain distinct. |
| DS-15 | Structural simulated marking, non-color state, 44px targets, no illustrative authority. |
| WEDGE R1 | One selected business, one child record; no R2–R4 controls or claims. |

## Anti-slop check

No side-stripe, gradient text, glass, hero metrics, equal-card grid, or modal-first behavior. The object workspace is a fact/evidence document with one action rail, not a generic dashboard mosaic. The category-reflex check passes: it is not a dark neon observability screen. The daylight scene and AE warm canvas/white surface vocabulary govern the theme. Raw JSON does not become visual theatre, graph lines are functional, and no hidden reasoning is presented as evidence.
