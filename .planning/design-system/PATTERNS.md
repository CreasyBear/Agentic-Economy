# Interaction Patterns

**Analysis Date:** 2026-09-01

<!-- refreshed: 2026-09-01 -->

These patterns describe the current dirty working tree. The governing product language is in `DESIGN.md` and `.planning/BRAND.md`: an exact Operation should move from discovery to decision, inspection, one bounded call, observed evidence, and honest recovery. Patterns below preserve that continuity without presenting catalogue claims as execution proof.

## Operation inspect and call

The exact Operation is the primary unit of decision. `src/components/ae/market/operation-detail/AeOperationInspector.tsx` has two intentional representations:

- `variant="full"` is used by `src/routes/operations.$operationRef.tsx`. It opens in workspace mode with identity and a route-level back-to-catalog action, then presents research and continuation surfaces.
- `variant="compact"` is used inside the command panel and other constrained entry points. It keeps the decision and valid continuation in the first viewport, with actions and contract detail progressively disclosed.

The full inspector's desktop order is a research panel plus a narrower continuation panel. Research has Overview and Contract tabs. Overview places identity, decision, observed track record, and provider/access facts in that order. Contract places Parameters, Example input, Price and terms, and Readiness and reliability in that order. A Schemas Sheet exposes the technical transport, provenance, payment, data-use, effects, and JSON Schema facts without changing the primary decision order.

### Five-step decision sequence

| Step | Pattern | Current implementation |
| --- | --- | --- |
| 1 | Establish the exact identity and supplier before asking the user to act. | `AeOperationIdentity` shows the offering, business/capability context, and mono `operationRef`; the full route also has a workspace `AePageHeader`. |
| 2 | Put maximum authorization, price model, readiness, access, and payment terms together. | `AeOperationDecision`, `AeOperationEconomics`, `AeOperationFacts`, readiness `Badge`, and `AeOperationContinuation`. |
| 3 | Separate decision evidence from catalogue publication. | `AeOperationTrackRecord` labels its window `30 days · AE-observed`; `src/modules/market/listing-evidence.ts` emits `Unrated`, `No completed calls yet`, `Pending`, or insufficient-sample states rather than zero-quality claims. |
| 4 | Let the user inspect the exact contract and effects. | `AeOperationContractSections` groups parameters, examples, terms, readiness/reliability, output evidence pointers, data use, and effects. The technical Sheet includes the exact operation ref, capability/version, publisher/source, transport, timeout, payment, price digest, source, and evidence references. |
| 5 | Offer one valid next action, not a menu of speculative actions. | `AeOperationContinuation` presents an authorize/connect/inspect continuation or a copyable command. `AeOperationCompactDecision` mirrors this as `What you can do next`. |

The continuation panel states that authorization covers one bounded result and that completion/quality appear only when AE observes evidence. This is the important call boundary: a ready catalogue row is not a completed call.

### Readiness and refusal posture

`src/components/ae/market/operation-detail/AeOperationContinuation.tsx` changes its title and action according to readiness and credentials. A credential-ready operation can offer an authorize-one-result action; a setup-required operation directs the user toward connecting an agent; an unavailable operation does not manufacture a call action. `src/components/ae/market/operation-detail/AeOperationCompactDecision.tsx` uses the same posture in compact form.

`src/routes/operations.$operationRef.tsx` refuses to render the inspect/call surface for an invalid reference, missing operation, unavailable source, or unavailable operation. It uses an explicit `AePageState` instead. This prevents a malformed or stale lookup from leaving behind facts or a button that appears actionable.

## Evidence and provenance

Evidence is rendered as a fact with a source posture, not as decorative confidence. The operation detail implementation has distinct evidence locations:

- `AeOperationTrackRecord` presents AE-observed completed calls, ratings, median latency, and P95 latency over a stated window. It shows `Unrated` and `Pending` while samples are insufficient.
- `AeOperationEconomics` presents pricing model, output evidence count, settlement, price observed time, and quote validity when those fields are actually present.
- `AeOperationContractSections` says when no output evidence pointers are declared and otherwise lists each named evidence id/output pointer.
- `src/modules/market/listing-evidence.ts` projects rating (`rated`/`unrated`), popularity (`observed`/`no_activity`), and latency (`measured`/`insufficient_sample`) with definitions and a minimum latency sample requirement.
- `src/lib/ui/trust-projection.ts` keeps published facts separate from not-published facts and uses explicit reply postures; it does not turn missing data into a positive status.
- `src/lib/ui/status-presentation.ts` centralizes public/operator labels, tone, audience, publicness, and next-action metadata. Its public status vocabulary is not a license for every screen to show every status.

The locked authority calls for Unknown, stale, supplier-claimed, AE-observed, buyer-reported, and AE-derived information to remain visually distinguishable. The current implementation is strongest for AE-observed and unknown/insufficient states, through explicit labels and source/evidence facts. A pattern consumer must not collapse a supplier-published or buyer-reported fact into the same visual treatment as a completed AE observation.

## Market browse, search, and compare

`src/components/ae/market/AeMarketPage.tsx` owns the catalogue composition. It first resolves a drilled category/search/catalog state, then renders a shared page header, toolbar, rows/table, and optional comparison tray. The default actions are Publish an Operation and Agent setup; empty and unavailable states use explicit recovery rather than silently displaying an empty healthy catalogue.

### Browse and filtering

`src/components/ae/market/AeMarketToolbar.tsx` keeps search and availability controls in a structural toolbar with a `border-y` and compact vertical rhythm. Search is a form with a real label (visually hidden where appropriate), and availability choices are All, Ready now, Setup required, and Unavailable. Query and availability chips are touch-sized and can be cleared without losing the rest of the catalogue context.

`AeCapabilityTile` is a grouping/listing tile, but it is intentionally an `Item` with a structural top border rather than a raised card. `AeOperationCard` is also a compact row with a bottom hairline, exact supplier/summary/readiness, price, and a responsive fact list. Its whole link is labeled Use/Inspect according to readiness, so the scan row and the accessible action describe the same destination.

`src/components/ae/market/AeOperationTable.tsx` reuses `src/components/ae/operator/AeOperatorDataTable.tsx`/`AeRecordTable` for a denser comparison surface. Columns include Name/supplier, mono price, readiness, Call, Rating, Calls, Latency, and Access; a ghost row action opens the exact operation. Numeric cells stay aligned and missing evidence remains text such as `Not reported`, rather than zero.

### Compare

Selecting rows caps the compare set at four. `src/components/ae/market/AeCompareTray.tsx` is a fixed bottom card with selected operation badges, remove/clear controls, and a disabled Compare action until at least two Operations are selected. Its wrapper is pointer-transparent outside the tray card, and its motion is an enter/exit state transition rather than ambient decoration.

`src/components/ae/market/AeMarketComparisonView.tsx` turns a selected set into one self-contained comparison task. A raised `Card` is appropriate here because the user is reviewing a bounded comparison, not scanning the whole catalogue. The table compares exact selected Operations on Price, Readiness, Data use, and Effects. Missing fields render `Not reported`; unavailable comparison has Retry, Edit, and Back actions.

The list/table/card split is therefore semantic:

- structural rows for scanning many Operations;
- a table when aligned attributes improve comparison;
- one raised comparison surface when the user has explicitly selected a bounded set.

## Chat and answer surface

`src/components/ae/layout/AeChatPage.tsx` supplies a full-height conversation frame. On authenticated routes the large-screen layout has a `16rem` history rail beside the transcript; below `lg` history is a Sheet. The main column is flex/min-height-safe and keeps the composer docked at the bottom. `src/components/ae/operation-chat/OperationChat.tsx` composes the header, `ChatTranscript`, `OperationHistory`, and `OperationComposer` while enforcing anonymous message/size limits.

### Transcript states

`src/components/ae/operation-chat/ChatTranscript.tsx` uses a role-log message viewport with polite live updates. It has explicit:

- pending skeleton plus a screen-reader status;
- empty state with a concise explanation and suggestion buttons;
- user outline bubbles and assistant ghost bubbles;
- tool groups containing operation cards;
- a handoff marker for transitions between assistant work and user action.

`src/components/ae/operation-chat/OperationCard.tsx` is the tool-result disclosure pattern. It distinguishes complete, working, pending, attention, refused, and error statuses through a status `Badge`; a working kind uses a skeleton. Execution outcomes use explicit titles such as Result ready, Call pending, Approval required, Reconciliation required, and Call refused. Returned output is bounded/truncated, and refs/evidence/next action are shown when available.

### Composer and history

`src/components/ae/operation-chat/OperationComposer.tsx` uses an InputGroup textarea with touch-sized send control. Enter submits unless Shift, composition, or another text-entry condition applies. It exposes anonymous character/message counters, a polite status region, and an assertive field error with support reference/copy and optional Browse market recovery.

`src/components/ae/operation-chat/OperationHistory.tsx` provides New chat, search, first-load skeleton, empty state, active-thread treatment, rename, and delete confirmation. The active item uses `aria-current`; edit/delete controls become visible on hover/focus without making them unavailable on small screens.

`src/components/ae/operation-chat/OperationChatHeader.tsx` keeps identity, new-chat, sign-in, share, and revoke controls in a compact header. Share state includes a field and status region instead of relying on an icon-only confirmation.

### Thinking disclosure gap

No separate thinking-thread disclosure or `AeAnswerJourney` implementation is present in the current `src/components/ae`, `src/lib/ui`, or `src/routes` tree. The current answer disclosure is the transcript, tool `OperationCard`, status marker, and handoff marker. A consumer must not document a dedicated natural-language thinking thread as an existing pattern or imply that tool cards are hidden behind one.

## Command panel

`src/components/ae/command-panel/CommandPanelProvider.tsx` owns the open state and page stack; `src/components/ae/command-panel/AeCommandPanel.tsx` owns the modal deck. The operator shell provides the open affordance, while the provider preserves an inspected Operation as the user moves between search and detail.

The interaction contract is keyboard-first:

- `Cmd/Ctrl-K` toggles the panel.
- `/` focuses search when the current target is not a text-entry control and no modifier is held.
- Escape pops a nested inspect page, clears search, or closes the deck in that order.
- Enter inspects the highlighted result.
- The footer states the available Escape/Enter actions.

`src/components/ae/command-panel/OperationsSearchPage.tsx` debounces server-backed search by 200ms and sets `shouldFilter={false}` on the command list. It does not locally filter or invent results. Idle shows recent inspected references; loading, failed, no-results, retry, clear, and browse states are explicit and touch-sized. `OperationInspectPage` is a second compact inspector layer; it preserves focus on the heading and provides a browse-market path when the exact reference is unavailable.

The stack is an overlay, not a second route hierarchy: completing navigation resets pages and closes the panel, while quick close/open can preserve an inspect context until completion.

## Console, credit, and account work

Operator patterns keep money and access actions explicit, read back authoritative state, and distinguish pending from success.

`src/components/ae/console/AeCreditTopUpPanel.tsx` follows this sequence:

1. show exact amount and canonical target preview;
2. create/show the payment element when configured;
3. show pending/checking states without claiming balance change;
4. read back the canonical ledger result;
5. show succeeded only after that readback, or show outcome unknown with a reconcile/reload path.

Setup-unavailable and no-payment states are not hidden behind a disabled mystery button. Payment errors expose a recovery locator. An outcome-unknown state says `Payment still being verified` and does not invite a second payment automatically. Session recovery is keyed to the principal/idempotency context.

`src/components/ae/console/AeOwnerCredit.tsx` uses an `AeSection` for Balance, an `AeFactList` for available credit/assignment, an explicit top-up panel, and a staged Recent charges table. It has first-load skeleton, cached table, empty, and unavailable states. Selecting a charge opens `AeRecordSheet` with receipt/insufficient continuation rather than navigating to a visually unrelated surface.

`src/components/ae/console/AeAgentOperatorConsole.tsx` groups waiting approvals, agents, and recovery. Approval rows offer approve/decline; agent detail uses a Sheet with credential history and revoke/disconnect confirmation. Recovery copy includes outcome uncertainty and reconcile-before-retry. These are operator-only actions and should not leak into public Operation cards.

## Forms and guarded editing

`src/components/ui/field.tsx` is the form primitive. Inputs use a Field label, description, and FieldError; invalid groups set `data-invalid`, `aria-invalid`, and `aria-describedby`. Field errors are `role="alert"` and descriptions are not replaced by the error, so the user keeps both instruction and correction.

`src/components/ui/inline-edit-field.tsx` is the compact record-edit pattern. Display mode shows the value and a pencil affordance; the affordance is always available on small screens rather than hover-only. Edit mode has an Input, Save, and Cancel. Blank/unchanged values cancel, Escape cancels, busy disables the relevant controls, and a rejected save restores the draft plus an error. Transport remains delegated to the caller.

`src/components/ae/layout/AeNavigationSafetyBoundary.tsx` guards dirty navigation and `beforeunload`. It presents `AeConfirmDialog`, waits for an in-flight save when possible, proceeds only after a saved result, and restores focus. This guard belongs around an editor, not around read-only market or detail pages.

Concrete owner/supplier forms in `src/components/ae/offerings/AeOwnerOfferings.tsx` and `src/components/ae/supply/AeSupplyEndpointConfigStep.tsx` use shared Field/FieldGroup primitives, touch-sized controls, descriptions, errors, and inline saving/saved/draft/outcome-unknown states. `src/components/ae/settings/AeWorkspaceGeneral.tsx` follows the same label/description/error pattern. `src/components/ae/forms/AeCopyPublicUrlButton.tsx` is the copy pattern: a status confirmation is shown on success and a readonly input fallback is available when clipboard access fails.

## Data presentation

### Facts, numbers, and identifiers

`src/components/ae/data/AeFactList.tsx` renders semantic `dl`/`dt`/`dd` facts. Compact density reduces the vertical gap for cards/rows; default density uses a responsive label/value grid. Facts can opt into mono values and muted missing values. Values are tabular-nums by default, and `src/styles/base.css` also supports the `[data-numeric]` contract.

Prices, ids, timestamps, code, and aligned metric values use `font-mono` in the operation/market surfaces. Interface labels and prose remain sans. The implementation should not use the display font for a table, command panel, form, or operational status.

### Rows and tables

`src/components/ae/operator/AeOperatorDataTable.tsx` provides the `AeRecordTable` behavior used by market and operator surfaces: sticky header, optional filter/view bar, first-load-only skeleton, explicit empty row, sorting controls, selected/focused row states, and touch-sized row actions. Keyboard row actions use a Radix roving focus group. The compact-content slot allows a smaller-width reading mode without duplicating the data authority.

### Status and trust

`src/components/ae/feedback/AeInlineState.tsx` maps the canonical state in `src/lib/ui/ui-state.ts` to a badge, description, semantic role, and live behavior. `src/lib/ui/status-presentation.ts` maps broader domain statuses to neutral/info/success/warning/danger tones with audience/publicness and next action. `Badge` is the current status-pill primitive in operation cards, detail continuation, tables, and comparison; the color communicates state, not branding. Blue is reserved for links/info, while success/warning/danger carry state/evidence meaning.

Missing and not-yet-measured data is rendered as explicit copy: `Unknown`, `Not measured`, `Not reported`, `No ratings yet`, `No completed calls yet`, `Pending`, or `Not published`, depending on the source contract. No presentation pattern should turn absence into `0`, `healthy`, `verified`, or a completed result.

## Loading, empty, error, and recovery

The state vocabulary is centralized in `src/lib/ui/ui-state.ts`: loading, empty, draft, saving, saved, pending, succeeded, refused, stale, unavailable, and outcome_unknown. Each state has a label/title/description, tone, semantic role, live behavior, and bounded recovery actions.

| State | Presentation rule | Current surface |
| --- | --- | --- |
| Loading | Preserve shell and orientation; use a shape-matched skeleton and polite status. | `AePublicRouteStates`, `AeOperatorRouteStates`, `AePageSkeleton`, chat pending, command-panel loading, table first load. |
| Empty | Explain what is absent and give a relevant next action; do not make an empty list look like an outage. | `AeEmptyState` in market filters, chat transcript, history, and owner tables. |
| Refused | Use an assertive/danger state, explain that no action occurred, and offer only confirmed retry/escalation paths. | `ui-state.ts` projection and `OperationCard` refused execution state. |
| Stale | Warn that the read is old and offer reload/read-again; do not reuse it as fresh readiness. | `ui-state.ts` stale presentation and operation freshness/evidence facts. |
| Unavailable | Say the source/service is unavailable, preserve a retry/status/support path, and avoid fabricated facts. | `AePublicPageState`, `AeOperatorRouteStates`, market unavailable, operation source-unavailable route. |
| Outcome unknown | Do not offer a duplicate side effect. Reconcile/reload the canonical record first. | `AeCreditTopUpPanel`, `OperationCard` reconciliation-required state, owner console recovery copy. |
| Succeeded | Claim success only after the authoritative readback/evidence boundary. | Credit top-up success after ledger readback; operation result card when returned output and evidence support it. |

`src/components/ae/layout/AePublicRouteStates.tsx` and `AeOperatorRouteStates.tsx` use shared route framing so error/retry states do not discard navigation. Operator child failures remain inside the shell; forbidden and not-found cases alter only the relevant content/navigation posture. `src/components/ae/operation-chat/presentation.ts` projects chat failures while preserving typed code/reference information.

Recovery actions are intentionally bounded: Try again, Reload status, Clear filters, Browse market, Reconcile, Escalate/support, or Back. A recovery control must not imply a dispatch when the prior state is refused or outcome unknown.

## Motion and transition patterns

Motion is used to acknowledge interaction and state, not to decorate an idle page. `src/styles/globals.css` defines the shared durations (fast/base/slow) and standard/emphasized easing. `src/styles/base.css` sets the reduced-motion contract: smooth scrolling is disabled and animation/transition durations are reduced to a minimal interval.

Observed uses include:

- public header shadow elevation after the scroll sentinel changes;
- `AeRouteProgressBar` delayed route feedback with opacity/scale transitions;
- `AeOperationCard` hover/focus transitions using the base duration/easing;
- `AeCompareTray` enter/exit presence animation using base duration/emphasized easing;
- Dialog/Sheet open-close transitions from shared primitives;
- `Spinner`/skeleton motion only while work is pending;
- active button feedback from the shared base button rule.

The implementation does not use page-load choreography, perpetual orbiting, shimmer as a visual identity, or decorative loops. Skeleton pulse and a pending spinner are state feedback, not a replacement for actual content. New motion should consume the shared duration/ease tokens and have a reduced-motion result.

## Pattern invariants

1. Keep one canonical Operation identity and one authoritative next action across public, market, command-panel, and chat representations.
2. Use a row/table for scanning and a raised card only for a bounded self-contained task such as comparison, receipt, dialog, or continuation.
3. Keep status, evidence class, freshness, and audience legible; never imply proof from publication or absence of errors.
4. Preserve shell and focus through loading, route errors, overlays, and back navigation.
5. Never offer duplicate side-effect actions while payment, invocation, or reconciliation is pending.
6. Keep every interactive target touch-sized where the shared primitive specifies it, and make keyboard/focus behavior explicit.
7. Use shared semantic tokens and primitives instead of feature-local palettes, radii, shadows, or type systems.

**Source verification:** Current working-tree source and the governing `DESIGN.md` / `.planning/BRAND.md` were inspected on 2026-09-01.

<!-- refreshed: 2026-09-01 -->
