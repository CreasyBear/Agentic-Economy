> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Arc CSS/composition source polish

**Requested:** Joel, 2 October 2026. **Status:** source sweep complete; rendered acceptance pending. No commit or merge. Acceptance is tied to the reviewed hashes in [coverage](css-composition-coverage.csv), not to later migration edits.

## Completion counters

| Counter | Result |
| --- | --- |
| Reachable families reviewed | **11 / 11** |
| Reachable styles reviewed | **115 / 115** |
| Decisions: fixed / retained with reason | **101 / 14** |
| Deduplicated findings: fixed / open | **25 / 0** |
| Rendered family matrices: pending / measured | **11 / 0** |

The active migration's component percentage is a separate counter. Initial source census was 110 CSS and 507 non-test component/route TSX, with 488 reachable TSX. Final census is 115 CSS, all reachable, and the same 507/488 TSX counts. Five styles entered coverage during coordination: About Features/Story, Developer Reference, Agent JSON and the newly activated Provider catalogue. Their baselines were frozen when first assigned. The CSV includes initial and reviewed hashes, actual CSS importers, gutter owner, concrete decision, finding IDs and visual status for every stylesheet.

[Scoped review/rollback patch](css-composition-polish.patch) records the 101 changed CSS files and the three presentation TSX changes against their frozen pre-polish source (SHA256 `620378f4bf23e9f7b09188408845de3c5a10e30a3eb84e09fe1270e43072fd67`). This deliberate record is useful because most migrated styles are still untracked. It contains no other concurrent migration edits and was validated against the accepted current files; it is not automatically applied. The new long-value test remains in its existing test file.

## Contract, skills and ownership

**Requires:** actual DOM composition, immediate ancestors/callers, current typed props, canonical tokens and existing state engines. **Ensures:** one page width/gutter owner; aligned heading/content/record edges; shrinkable children; readable complete material facts; narrow geometry and visible keyboard position. **Invariant:** exact money/identity, authority/privacy, callbacks, route/search/history state, modal focus, pending guards and loading/empty/error semantics. **On violation:** retain unavailable/refusal/recovery behavior and record domain/controller problems separately. Pure styling introduces no new failure/retry/transaction semantics.

`sluice` selected a deep cross-family review with fast, bounded leaf edits. `gestalt-reviewer` was applied to source grouping, proximity, continuity, similarity, closure and figure/ground: true records retain boundaries; unframed regions inherit page width; headings/actions/records share an axis. `cognitive-load-auditor` traced the facts and decisions in each live family: preserve compact browsing density, present complete money/authority/reference facts, keep actions beside their evidence, and retain progressive disclosure and pending/refusal guards. Those conclusions drove F01–F25 below. Source does not establish measured visual scores.

`token-mapping` classified purpose before value and resolved both themes; its seven-part report follows. `complexity-accountant` decided to keep existing classes/stylesheets and remove redundant containment: benefit is one gutter owner and fewer conflicting utilities; cost is zero new runtime layers/dependencies/tokens. Existing alternatives were parent rails, actual framed panels, reading columns and existing Base UI/Motion engines. Keep real panel/media/concentric bounds; remove unframed secondary page caps and redundant inset. No wrapper, engine or abstraction was introduced.

Authenticated Arc Pro `page-composition`, `refactor-to-arc`, `responsive-optimization`, `accessibility-audit` and `checklist` were read and applied to the actual licensed source in `/tmp/aecon-arc-build-20261001`. Workers verified source hashes cited beside each adapted block. Page containment, ancestor/container queries, portal imports, focus/touch geometry, semantic copy and responsive states were checked from source. AE's explicit visible-focus rule takes precedence over upstream outline suppression. Rendered width/contrast/keyboard/zoom measurements are pending under the source-first instruction.

Every leaf used a fresh cold `gpt-6-luna` worker, `max` reasoning, `fork_turns=none`, with 1–3 explicit files and coordinator prescriptions. Workers checked assignment hashes before writing; the coordinator inspected AST diffs, actual callers/ancestors and preserved state branches before acceptance. The migration retained TSX/protocol/inventory ownership. This task changed only three production TSX presentations (`ChatTranscript`, `AeRecordSheet`, `OptionCard`) and added one long-material-text regression; concurrent migration changes were retained. No staging, commit, reset, restore, stash, push or merge occurred.

## Source coverage

AST imports/exports/literal dynamic imports and CSS `?url`/`@import` chains were reconciled with current route/entry roots. JSX class expressions, CSS modules, utility classes, Base UI attributes and composed portal classes were treated as source evidence rather than naive orphan counts. PostCSS parsed every stylesheet. Shared frames, rails, headers, Drawer/Sheet/dialog and records were accepted before leaf work. Each family then traced populated and absent/loading/unavailable branches through live callers. Named container queries and same-element `.arc-market` scopes were checked against actual ancestry; F23 fixes the confirmed self-container defect.

| Family | Reviewed | Fixed / retained | Caller and state review | Render |
| --- | --- | --- | --- | --- |
| foundation | 4/4 | 0 / 4 | Import precedence, light/dark aliases, visible focus and reduced motion; scoped globals retained. | Pending |
| shared-frames-navigation | 8/8 | 8 / 0 | App/public/operator/chat rails, header/action axes; loading/recovery and mobile navigation reserve. | Pending |
| shared-feedback-data-overlays | 9/9 | 8 / 1 | Drawer/dialog/confirm, Button labels, empty state, copy/facts; empty/disabled/busy and keyboard branches. | Pending |
| market-search-detail | 10/10 | 9 / 1 | Search/listing, comparison, product media and live Provider/Host catalogue; missing/unverified/empty/recovery branches. | Pending |
| chat | 12/12 | 11 / 1 | Transcript/greeting/composer/history, Tool output/code and decision/options; loading/pending/read-only/unanswered branches. | Pending |
| settings-account-team | 9/9 | 9 / 0 | Sidebar/pane, identity/tax/team/receipts/security; dirty/invalid/read-only/pending/unavailable branches. | Pending |
| money-activity-receipts | 7/7 | 4 / 3 | Funding/credit/spend/activity/Call records; exact totals, uncertainty/refusal/recovery/empty/loading branches. | Pending |
| agents-authority | 14/14 | 13 / 1 | Agent directory/install/connect/key/consent/spending; authority distinctions, permission/pending/refused/unknown branches. | Pending |
| provider-supply | 15/15 | 12 / 3 | Workspace/Tools/connections/source/publication/onboarding/price/earnings; unavailable/empty/loading/validation/recovery branches. | Pending |
| operator-admin | 14/14 | 14 / 0 | Records/scopes/overview/metrics/search/actions/evidence; permission/two-person/pending/refused/unknown/loading branches. | Pending |
| public-support-status-legal | 13/13 | 13 / 0 | About/auth/legal/FAQ/docs/JSON/status/support/correction; blocked/empty/unavailable/retry/preparing branches. | Pending |

No CSS file remains excluded. Nineteen TSX files have no path from the current route/entry graph and are excluded from runtime acceptance; some share a stylesheet that remains live through another caller. They were recorded rather than deleted:

- `src/components/ae/chat/chat-session/ChatSkeleton.tsx`
- `src/components/ae/command-panel/tools-search-page/ToolsSearchPageSkeleton.tsx`
- `src/components/ae/layout/AeRecordHeader.tsx`
- `src/components/ae/market/DirectoryIndexDiscovery.tsx`
- `src/components/ae/market/DirectoryProviderCards.tsx`
- `src/components/ae/market/DirectoryProvidersIndex.tsx`
- `src/components/ae/market/DirectoryToolPlayground.tsx`
- `src/components/ae/offerings/ProviderIdentityForm.tsx`
- `src/components/ae/shared/ToolDetailFacts.tsx`
- `src/components/ae/supply/tool-test-playground/AeToolTestPlayground.tsx`
- `src/components/ae/supply/tool-test-playground/components/JsonPayloadEditor.tsx`
- `src/components/ae/supply/tool-test-playground/components/PlaygroundResponsePane.tsx`
- `src/components/ai-elements/code-block.tsx`
- `src/components/ai-elements/suggestion.tsx`
- `src/components/arc/market/ProviderListing.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/carousel.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/table.tsx`

Tests, generated code, examples and build output are outside runtime source coverage. Static reachability is conservative; new routes, dynamic external imports or later class changes need reconciliation.

## Confirmed findings — all fixed

References below point to current source; baseline hashes in the coverage CSV identify the pre-polish state. “Blocking” describes a source-proven concealed fact or mis-scoped rule. Other entries are composition corrections; none claims measured pixel acceptance.

| ID | Severity | Source and real caller | Cause and smallest patch | Evidence |
| --- | --- | --- | --- | --- |
| F01 | Should fix | [src/components/ae/layout/AppFrameComposition.css:5](../../../../../src/components/ae/layout/AppFrameComposition.css#L5); AeAppShell / AeOperatorPage / AePageHeader | Shared frame/title children imposed intrinsic width. Propagate min-width:0 and minmax(0,1fr); wrap title/description/action groups. | Shared layout and focus suites; source frame/heading tracks. |
| F02 | Should fix | [src/components/ae/operator/RecordTable.css:85](../../../../../src/components/ae/operator/RecordTable.css#L85); AeOperatorDataTable → sort button / cell | Sortable headings and record cells used different inset owners. Heading gives horizontal inset to its sort button; preserve numeric and selected-column rules and narrow overrides. | Record presence suite; desktop/narrow declaration order. |
| F03 | Should fix | [src/components/ae/operator/RecordTable.css:6](../../../../../src/components/ae/operator/RecordTable.css#L6); AeOperatorDataTable | Record-wrapper declaration duplication and an unused scroller selector obscured scroll ownership. Consolidate wrapper rules; remove unused selector. Wrapper owns horizontal overflow; optional maxHeight parent still bounds vertical overflow. | Record presence suite; actual DOM and two-axis trace. |
| F04 | Should fix | [src/components/ae/layout/RouteLoadingComposition.css:17](../../../../../src/components/ae/layout/RouteLoadingComposition.css#L17); Route pending/recovery; admin object/overview panels | Shared recovery/loading/operator panel corners drifted from the declared role. Use panel/surface tokens for actual boundaries; retain skeleton, badge and concentric geometry. | Shared/admin suites; role-based source review. |
| F05 | Should fix | [src/components/arc/drawer/Drawer.module.css:115](../../../../../src/components/arc/drawer/Drawer.module.css#L115); DrawerContent header → title/description/close | Drawer title region lacked an intrinsic shrink and long-copy wrap rule. Shrink the title column and wrap copy while preserving the close control and portal/focus engine. | Shared sheet/dialog suites; header flex trace. |
| F06 | Should fix | [src/components/ae/layout/AeRecordSheet.tsx:39](../../../../../src/components/ae/layout/AeRecordSheet.tsx#L39); AeRecordSheet → DrawerContent body | Record-sheet footer added another horizontal/bottom inset inside Drawer body. Replace p-4 with pt-4; base body retains exterior gutter and safe area. | Agent record-sheet suites; actual nested DOM. |
| F07 | Should fix | [src/components/arc/button/button.module.css:39](../../../../../src/components/arc/button/button.module.css#L39); Arc Button → labelSlot/labelContent/labelPhase | Long animated Button labels could resist shrinking in narrow containers. Bound and shrink all label descendants; wrap full copy; preserve Motion measurement, busy and disabled engines. | Action/sheet suites; shared label descendant trace. |
| F08 | Should fix | [src/components/ae/feedback/EmptyStateComposition.css:10](../../../../../src/components/ae/feedback/EmptyStateComposition.css#L10); AeEmptyState / AeTableEmptyState | Long empty-state titles/descriptions lacked complete wrap/shrink constraints. Shrink copy and action group; wrap title/description; keep illustrative stage and real empty controls. | Empty-state and route suites; compact/full branches. |
| F09 | Should fix | [src/components/ae/settings/settings-shell/SettingsComposition.css:128](../../../../../src/components/ae/settings/settings-shell/SettingsComposition.css#L128); SettingsShell inside caller rail | Settings pane repeated the exterior right gutter supplied by its rail. Remove pane right inset; retain 32px sidebar/content separation and the 719px collapse. | Settings shell suite; heading/sidebar/content axis trace. |
| F10 | Should fix | [src/components/arc/chat/ChatComposition.css:4](../../../../../src/components/arc/chat/ChatComposition.css#L4); ChatTranscript / greeting / ChatComposer | Transcript used a 1200px/12-column utility composition while composer used a 768px column. Share 768px transcript/empty column with 24px inset and 16px through 559px; remove conflicting transcript grid utilities. | Chat history/composer/header suites; unchanged scrolling and controllers. |
| F11 | Blocking | [src/components/ae/chat/generative/OptionCard.tsx:31](../../../../../src/components/ae/chat/generative/OptionCard.tsx#L31); OptionsGrid → OptionCard | Market chat explicitly truncated material host/path, network and Provider-listed price strings. Render complete supplied strings; existing wrapper CSS wraps them; preserve exact href, formatter, attribution and read-only actions. | New long-value observable regression at generative.test.tsx:144; existing 25-case suite passes. |
| F12 | Should fix | [src/components/arc/market/ComparisonTable.module.css:105](../../../../../src/components/arc/market/ComparisonTable.module.css#L105); DirectoryComparison / chat ComparisonTable | Comparison header gap displaced the same grid tracks used by its body. Remove header gap; retain full comparison facts, horizontal/narrow layouts and four-Tool contract. | Comparison/decision suite; shared header/body track definitions. |
| F13 | Blocking | [src/components/ae/market/MarketComposition.css:30](../../../../../src/components/ae/market/MarketComposition.css#L30); AeMarketPage → search/link controls | A market link rule was scoped to all Arc surfaces. Scope the rule to .arc-market-page; retain intended 44px market actions. | Market/listing suites; selector ancestry review. |
| F14 | Should fix | [src/components/arc/market/ProductDetail.css:17](../../../../../src/components/arc/market/ProductDetail.css#L17); PublicToolDetail inside AeAppShell | Sticky product media ignored the fixed app-header offset. Use inherited header-height plus 24px; preserve container-query collapse and authored media frame. | Product-detail suite; header token/ancestor trace. |
| F15 | Should fix | [src/components/ae/console/FundingComposition.css:183](../../../../../src/components/ae/console/FundingComposition.css#L183); AeCreditTopUpPanel / AddCreditSheet / funding return | Funding values assumed a single line in a narrow summary. Allow complete amount/label values to wrap with bounded width; keep right alignment, exact totals and pending/recovery guards. | Funding and credit suites; source money-formatting boundaries unchanged. |
| F16 | Should fix | [src/components/ae/console/KeyRevealComposition.css:27](../../../../../src/components/ae/console/KeyRevealComposition.css#L27); AeKeyRevealDialog / AeConnectAgentWizardDialog | Specialized key/connect drawers could override the shared body safe-area reserve. Retain max(base inset, safe-area) in specialized bodies/actions; align narrow 16px gutters. Earnings leaves base body ownership intact. | Connect/Agent sheet suites; Drawer body + specialized cascade trace. |
| F17 | Should fix | [src/components/ae/supply/ProviderConnectionsComposition.css:21](https://github.com/CreasyBear/Agentic-Economy/blob/485ac3b4d65cdb7c759ef12fca53f6fd20e2bb12/src/components/ae/supply/ProviderConnectionsComposition.css#L21); All selected reachable styles; full property mapping CSV | Purpose-compatible spacing/text sizes and bounded corner roles mixed raw values with existing tokens. Use exact existing scale aliases; apply prescribed role corrections only to real control/panel/surface corners. Retain custom type/graphics/dimensions. | 1142 mapped properties; 50 light/dark scalar assertions; AST diffs reviewed per batch. |
| F18 | Should fix | [src/components/ae/agent-access/home/AgentHomeComposition.css:5](../../../../../src/components/ae/agent-access/home/AgentHomeComposition.css#L5); AeAgentAccessHome inside operator rail | Unframed Agent home added a secondary 1040px page cap. Fill the parent-supplied rail; retain individual installation/recovery panels. | Owner-console/Agent suites; parent/child width trace. |
| F19 | Should fix | [src/components/ae/website/UtilityDocumentComposition.css:6](../../../../../src/components/ae/website/UtilityDocumentComposition.css#L6); AeAgentDoorPage / auth stage / utility document / About sections | Standalone narrow Agent/auth/document/About sections used 12px while shared rails used 16px. Use existing 16px narrow gutter; preserve authored desktop rails and genuine internal panel inset. | Public/auth/legal/Agent suites; standalone ancestor trace. |
| F20 | Should fix | [src/components/arc/market/MarketHero.css:50](https://github.com/CreasyBear/Agentic-Economy/blob/8961395f359c152bd8f6fafdb8a7832b260f45af/src/components/arc/market/MarketHero.css#L50); DirectoryHero inside .ae-rail | Hero deck added another narrow gutter inside its rail. Remove deck padding through 560px; retain mesh, typography, starter cards and composer geometry. | Market/listing suites; container/rail ownership trace. |
| F21 | Should fix | [src/components/ae/agent-access/authorize-form/ConsentComposition.css:43](../../../../../src/components/ae/agent-access/authorize-form/ConsentComposition.css#L43); AeAgentAccessAuthorizeForm → review head/body/decision | Consent head/body and decision bar changed inset at different narrow breakpoints. Align review head/body to 16px through 639px; keep choice/search grid collapse at 559px. | Consent 28-case batch; decision-bar ancestor trace. |
| F22 | Should fix | [src/components/ae/developers/DeveloperReferenceComposition.css:8](../../../../../src/components/ae/developers/DeveloperReferenceComposition.css#L8); DevelopersApiPage / AeDeveloperDiscoveryPage | Developer body used a 1160px rail beneath a 1408px shared heading. Share 1408px exterior rail and 16/26px gutters; retain 65ch reading column, 208px outline and 40px separation. | Public-reference suite; heading/body/reading-column trace. |
| F23 | Should fix | [src/components/ae/shared/ProviderCatalogueComposition.css:40](../../../../../src/components/ae/shared/ProviderCatalogueComposition.css#L40); AeProviderListingPage / AePublicBusiness / ProviderPortfolio | Provider catalogue root attempted to style itself through its own named container. Move only root gap rule to 592px viewport (560px content + 2×16px gutter); retain descendant 560/700/900 container queries. | Provider-catalogue suite; container ancestry review. |
| F24 | Should fix | [src/components/ae/shared/ProviderCatalogueComposition.css:27](../../../../../src/components/ae/shared/ProviderCatalogueComposition.css#L27); Provider catalogue aside inside AeAppShell | Provider aside stuck 24px below viewport, beneath the 64px app header. Use header-height fallback 4rem plus 24px; retain static aside through 900px container width. | Provider-catalogue suite; header/aside cascade trace. |
| F25 | Should fix | [src/components/ae/privacy/remove-business/CorrectionComposition.css:14](../../../../../src/components/ae/privacy/remove-business/CorrectionComposition.css#L14); AeRemoveBusinessPage → header/form/preparing | Public correction page lacked a gutter and recentered its form on a second axis. Use shared 1408px rail and 16/26px gutter; retain left-aligned 720px form/preparing reading bound. | Privacy-route suite; header/form/preparing ancestry trace. |

## Deliberate geometry retained

The page rail remains 1408px, with 16px narrow and 26px from 768px; app navigation retains its 1440px rail. A genuine component can own an internal panel inset without becoming a second page gutter. Settings keeps its 1120px composition and 216px sidebar; metrics keeps its actual 1120px panel/28px inset, 40px KPI type and full day-table scroller. Developer prose remains 65ch beside a 208px outline. Correction forms retain 720px reading width on the shared left axis. Onboarding/handoff/identity retain 42rem/36rem/640px reading/panel bounds. Chat transcript, empty greeting and composer use 768px; the hero composer remains a distinct 800px block.

Fixed icon/checkbox dimensions, 44px interaction targets, source/code/media frames, chart/tooltip coordinates, skeleton silhouettes, authored 2/5/6/10/14/18px micro rhythm, custom 20/24/32/40px type, fluid functions and concentric inner radii retain their purpose. They were not approximately rounded into the nearest token. Material values wrap or use an intentional data/code scroller. The live earnings Drawer remains full-height/right; its caller does not request phone-bottom behavior, and the shared body owns mobile inset/safe area. Motion, table sorting/filtering, modal/form state and controller recovery stay with existing engines.

## Verification

Runtime: Node 22/npm 11.5.1 through NVM. Aggregate checks ran after integrated batches. Commands below are prefixed with `NODE_VERSION=22 "$HOME/.nvm/nvm-exec"`.

| Check | Result and guarantee |
| --- | --- |
| `npm run check` — baseline and each integrated batch | Lint passes; unchanged `no-circular` count2 exceeds ceiling 0. Capability-supply internal and barrel cycles remain 0. Aggregate stops there, so later stages are not implied. |
| `npm run typecheck:release` | Pass, including final clean run; current source/contracts compile. |
| `npm run test:imports` | Final 25 suites/74 tests pass, including module/route/private/security/Convex/size boundaries. |
| `npm run build` | Final CLI package and client/server public build pass with Node 22 deployment runtime. Existing asset/externalization/deprecation warnings remain; build proves bundling, not rendered layout. |
| Direct Vitest affected-file batches | Shared 23/125; chat/market 8/86; long-material 1/25; consent 2/28; admin/public 7/29; public/receipt/Agent 9/69; geometry/admin/catalogue 6/21; Provider 9/63 all pass. These are 65 suite executions / 446 case executions, with overlap, not unique coverage. |
| PostCSS/source diagnostics |115/115 parse; no trailing whitespace or invalid nested root-scope diagnostics. All 46 named/unnamed container-query groups enumerated; live ancestry adjudicated. |
| Token resolution |25 scalar tokens × 2 modes = 50 assertions pass at 16px root. |
| Owned TSX/test `git diff --check` | Pass. Exact aliases AST-normalize to identical numerical values; every non-alias geometry change was reviewed against its prescription. |
| Standalone TypeScript standards | Fails on 3 unchanged starting-snapshot violations below. |

The last Provider batch used the existing runner directly to avoid interrupting concurrent browser sessions:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node node_modules/vitest/vitest.mjs run \
  tests/unit/ui/provider-workspace.test.tsx \
  tests/unit/ui/provider-tool-detail.test.tsx \
  tests/unit/ui/owner-provider-connections.test.tsx \
  tests/unit/ui/arc-connection-handoff.test.tsx \
  tests/unit/ui/arc-provider-offboarding.test.tsx \
  tests/unit/ui/supply-source-native-start.test.tsx \
  tests/unit/ui/supply-funnel-earnings.test.tsx \
  tests/unit/components/ae-supplier-onboarding-wizard.test.tsx \
  tests/unit/components/ae-price-update-modal.test.tsx
```

The added regression verifies complete host/path, network and Provider-listed price text, exact href and absent write controls in read-only results. Other suites protect inputs/outputs, action callbacks, focus/recovery contracts, invalid/pending/read-only and unavailable/unknown branches. CSS spacing needs no declaration-mirroring tests. Delivery/payment/authority/domain mutations, retries and concurrency were not changed; source-preserved guards and existing cases establish those existing boundaries only.

Separate repository blockers, verified byte-identical to the CSS starting snapshot:

- `src/components/ae/admin/metrics/MetricsDashboard.tsx:57`: non-null assertion, SHA256 `dd6a245844b967bee1af64d786dd612434affc1699e09dcfadcd2f564771926b`.
- `src/components/ae/chat/generative/ComparisonTable.tsx:13`: non-null assertions, SHA256 `1e944a50a0ac04064d47fa0c9d6934a25761a0080b0856c7bce1a12cac8d665b`.
- `src/lib/server/clerk-webhook-core.ts:19`: `Promise<unknown>` verifier flagged by standards, SHA256 `472cd365d9e259cb08b3e7fc165e9efe258273c6cd982c9c9cb1b77715f8854d`.

Standalone command: `AE_CLI_PREBUILT=1 AE_SCAN_MODE=clean NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node node_modules/vitest/vitest.mjs run tests/imports/ts-standards.test.ts`. These and the inherited cycles are repository checks, not open CSS findings. No `gate` was run because no merge/release is being performed; it remains required before either.

## Pending visual checks

All 11 family matrices remain pending: 320/390/768/1024/1440 widths, light/dark, populated/empty/loading/refused/unknown, long values, overlays, keyboard and 200% zoom. Measure heading/record edges, overflow and scroll ownership, sticky/safe-area geometry, target size, focus visibility and contrast. Source declarations and passing tests do not establish rendered acceptance. No browser/CUA was invoked.

## Token report — Summary

**Status:** complete for selected mappings. **Commit:** none. Existing tokens only. Scope is standalone scale positions in grouping spacing, direct text-scale sizes and explicitly adjudicated control/panel/surface corner corrections in all reachable non-foundation styles. The unchanged foundation is the source system, not another mapping target. The full property report has **1142 rows: 1103 Exact, 6 Semantic, 33 Gap, 0 Ambiguous**, with separate light/dark classifications. Gap is a tolerance classification of the original corner, not an unresolved finding; every such role correction was explicitly prescribed/applied. Raw graphics, dimensions and purposeful off-scale values are outside mapping scope.

## Token report — Mapping

[Full property mapping CSV](css-composition-token-mapping.csv) records file/baseline line, selector/at-rule, property, original value, selected standalone positions, category/job, token(s), both theme classifications, delta/reason and actual applied value. A mixed shorthand may contain authored positions outside the selected subset. Deleted declarations are identified as prescribed composition removals, not presented as numeric aliases.

| Role | Tokens and normalized values in both modes |
| --- | --- |
| Spacing | `--space-1/2/3/4/5/6/8/10/12/16/20/24` → 4/8/12/16/20/24/32/40/48/64/80/96px |
| Corner role | `--radius-control/panel/surface` → 18/26/34px; pill 9999px |
| Authored text size | `--text-xs/sm/base/lg/xl/2xl/3xl/4xl/5xl` → 12/14/16/18/22/28/36/52/72px |

Exact positions preserve values. Semantic corner mappings are 20→18px, 16→18px and four 24→26px positions (within 2px); the report identifies each exact selector. Category/purpose was checked before considering tolerance.

## Token report — Do not use

Do not substitute spacing tokens for 44px target height or 18px icon size solely because numbers match. Do not use text-2xl for 28px panel padding, or panel radius for a concentric inner media/source/code frame. Preserve authored custom type/fluid expressions rather than approximate 20/24/32/40px to the text scale. Preserve semantic text/status/surface colors; a palette match alone cannot establish their job. No color conversion or new palette assignment was performed. Nine token-with-alpha properties and nine decorative gradient/mask/mesh properties were classified separately; 167 raw spacing/type/radius properties remain outside selected mapping scope for purposeful custom geometry/functions (see coverage decisions).

## Token report — Ambiguous

Zero selected mappings remain ambiguous. Existing role/style/caller evidence resolves them. No source conflict was inferred from intentional bridge/theme overrides.

## Token report — Gaps

33 original corner properties fall outside the 2px radius tolerance. Their jobs are genuine bounded controls/panels/surfaces, so the coordinator applied declared role corrections instead of pretending they were exact matches. They are 2.9% of mapped property rows, not a system-wide token gap. No token creation, broad radius replacement or approximation was needed. Complete selected positions and reasons remain in the CSV.

## Token report — For a person to decide

No source mapping decision remains open. The 11 pending rendered matrices need measured review; any new correction must respect the documented authored geometry and behavior contract. The active migration owns later source integration and any pre-merge gate.

## Token report — Source

Read from current local files using filesystem reads + PostCSS under Node 22 at **2026-10-02T10:36:39.716Z**. Scalar resolution used the 16px root from `src/styles/base.css:20` and both scoped light/dark rules. Globals imports the brand bridge, which imports foundation; bridge AE semantic aliases and later dark overrides intentionally take precedence. Project AGENTS/PRODUCT/DESIGN and the Arc migration protocol govern purpose; there is no `docs/system/decisions.md` source in this checkout. No candidate system or source fallback was needed.

| Source | SHA256 at final verification |
| --- | --- |
| `src/components/arc/foundation.css` | `b9af1fa5b7d3d5c259ae6d62caf094c8f2e672e8a8da0f5045839fce1458d6d3` |
| `src/styles/arc-market.css` | `d12efcfc7c9306fe2d4ddb0545f60cb63ce57a19d493be2e62f06fee8d1b3847` |
| `src/styles/globals.css` | `2cc084aa4f5107dcc74911de2790dbd5647ad2037f4eeebe0836dcbc28ca8a6d` |

Coverage: 11/11 reachable families; 115/115 reachable styles; 1142 selected property mappings; 50 light/dark scalar assertions; 25 findings fixed / 0 open; 11 rendered matrices pending / 0 measured.
