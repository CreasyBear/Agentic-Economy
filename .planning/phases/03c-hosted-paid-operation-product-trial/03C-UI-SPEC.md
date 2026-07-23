---
phase: 03C
slug: hosted-paid-operation-product-trial
status: approved_for_planning
design_system: Astryx neutral
shadcn_initialized: false
preset: none
created: 2026-07-20
decision_owner: Founder
governing_adrs:
  - ADR-019
  - ADR-020
---

# Phase 03C — UI Design Contract

> Visual, interaction and semantic contract for the authenticated hosted-sandbox paid-operation trial. This contract extends the accepted Phase 3A projection; it does not redesign the paid-operation lifecycle.

## Decision supported

Phase 3C lets a developer or product evaluator decide whether one hosted paid operation is understandable and safely recoverable after interruption through both a human surface and a structured-agent surface.

The evaluator's job is:

> Start with the recognizable BTC/USD task, inspect the source-bound provider
> and exact consequence, authorize no more than USD $0.01, follow the durable
> payment and result truth, and identify the only safe next action after
> success or any unhappy path.

The forward golden path is:

```text
open protected Sandbox setup
  → select one labelled fixture provider outside the shared card
  → create one invocation with the source-resolved provider
  → inspect provider, data and maximum charge
  → authorize this exact consequence
  → see “Permission recorded. Nothing has been submitted yet.”
  → execute once
  → inspect separately stated payment, settlement and validated result truth
  → reload or cold-restore the same completed invocation without changing meaning
```

Unhappy “goblin paths” branch from named golden transitions. Each path either
rejoins through one explicit safe continuation or stops visibly. Goblin paths
never silently replay a command, change provider, flatten uncertainty into
failure, or manufacture success.

The horizontal capability under evaluation is paid-operation presentation and
safe continuation. BTC/USD is only the operation-owned sandbox fixture. Shared
behavior is query- and provider-agnostic within the paid-operation class. This
does not prove compatibility with booking, inquiry, dispatch, communication,
cancellation or any other non-paid action class.

## Sources and locked direction

This contract pre-populates decisions from `PRODUCT.md`, `DESIGN.md`, Phase 3C `CONTEXT.md`, P3C-R1–R10, ADR-019, ADR-020, the accepted Phase 3A UI contract, Phase 3B closure, and the current paid-operation semantics, application service, card and browser eval.

Do not reopen local-only services, market activation, real providers, real payment, settlement, onboarding, comparison, fallback, broad Activity, standing mandates or Full autonomy.

## Design system

| Property | Contract |
|---|---|
| System | Astryx `@astryxdesign/core` with `@astryxdesign/theme-neutral` |
| Styling | Tailwind 4 for layout only; `src/styles/globals.css` semantic bridge owns visual values |
| Components | Existing Astryx Card, Badge, Banner/Alert, Button, Text, disclosure, form-selection and Skeleton primitives; existing `AePaidOperationCard` remains the lifecycle composition |
| Icons | `lucide-react`, paired with persistent text; icons are never the only state cue |
| Font | Astryx semantic sans and heading stacks; no new font |
| shadcn | Not applicable and must not be initialized; Astryx is the locked project system |
| Registry | No third-party registry or model-generated block |

No route-local palette, raw status colour, bespoke CSS file, retired Daylight asset, shadcn/Radix/CVA wrapper, generic AI styling, crypto styling, graph or payment-rail visual language is permitted.

### Spacing

Use only the existing 4px-based layout scale:

| Token | Value | Use |
|---|---:|---|
| `xs` | 4px | Label/value and icon/text internal gap |
| `sm` | 8px | Compact control and fact spacing |
| `md` | 16px | Default control padding and grouped facts |
| `lg` | 24px | Card sections and page gutters |
| `xl` | 32px | Page header to action content |
| `2xl` | 48px | Wide-screen major separation |
| `3xl` | 64px | Maximum page-level separation; not inside the compact card |

Exceptions: interactive controls and disclosure summaries have a minimum practical target of 44×44px. The protected content column is at most 768px for the operation card and 1024px for page navigation plus content.

### Typography

Use exactly four sizes and two weights:

| Role | Size | Weight | Line height |
|---|---:|---:|---:|
| Supporting label and technical metadata | 14px | 400 | 1.5 |
| Body, facts and controls | 16px | 400 | 1.6 |
| Section/card heading | 20px | 600 | 1.2 |
| Page heading | 28px | 600 | 1.2 |

Do not use all-caps status text, monospace for customer content, or display typography. Long references may use the 14px supporting style with `overflow-wrap:anywhere`.

### Colour

| Share | Semantic value | Use |
|---|---|---|
| Dominant 60% | `background-body` `#F5F7F4` and `background-surface` `#FCFDFC` | Page ground, stable skeleton area, quiet regions |
| Secondary 30% | `background-card` `#FFFFFF`, `background-muted` `#E7EBE5`, semantic border | Action card, provider-selection panel, technical disclosure, navigation |
| Accent 10% | `accent` `#40614F`, strong `#35523F`, muted `#E8EFE9` | Selected provider, primary permitted command, focus/active progress |
| Destructive/critical | Astryx semantic critical/destructive token | Refusal or destructive consequence only; never uncertainty decoration |

Accent is reserved for the selected provider, the single currently permitted primary command, visible focus, active progress and links. Status colours require a text label and icon/shape. “Possibly submitted” and “Settlement unknown” use caution semantics, never destructive red or success green.

## Protected surface and navigation

### Human routes

- `/` remains the canonical product entry and is unchanged by Phase 3C.
- `/actions/paid/new` is a protected evaluator-only “Sandbox setup” adapter.
  It selects a labelled fixture provider and creates the trial invocation. It
  is not canonical product IA, Options, provider comparison, discovery or a
  future universal action entry.
- `/actions/paid/:invocationRef` is the canonical protected action-detail route. Its URL identifies continuity only; the authenticated principal and current expected invocation version come from the source-owned application boundary.
- An unauthenticated visit preserves the intended return path and redirects to `/sign-in`. It must not reveal task, provider, input, amount, invocation existence or refusal detail.
- After authentication, an invocation owned by another principal renders the same non-enumerating “This operation is not available to this account” page as a missing invocation. Machine codes remain distinct in the protected agent response and diagnostics.
- The Sandbox setup adapter is reachable only to the admitted evaluator cohort.
  Do not add it to broad public navigation or create Activity, marketplace,
  wallet, crypto terminal or operator dashboard destinations.

Use the existing compact authenticated side navigation on wide screens. On
small screens it collapses structurally above the page content. The action page
provides a text link “Back to Sandbox setup”; it does not imply a global action
history that Phase 3C does not provide.

### Evaluator-only Sandbox setup and provider binding

Provider selection is trial instrumentation outside `AePaidOperationCard`.
Provider binding happens once, durably, before authority and execution:

- Page label: “Sandbox setup”
- Task: “Get the latest BTC price in USD”
- Supporting copy: “Choose one labelled mock fixture for this evaluator trial.
  No real payment.”
- A labelled radio group shows provider name, “Mock provider,” operation
  revision and the same maximum charge.
- Primary CTA: “Create sandbox operation,” disabled until one provider is
  selected.
- The request accepts one closed `providerKey` selector only. The source owner
  resolves provider material, creates every consequence identity and returns
  protected Action Detail.
- Never show rank, recommendation, “best,” price comparison, speed, reliability,
  reviews, availability or fallback.

From action detail, “Use another provider” is available only when the current operation is safely terminal before external release, or from completed/reconciled history. It is a secondary link followed by a confirmation:

> “Changing provider starts a new operation with new permission and a separate payment boundary. This operation will remain in your record.”

Confirmation CTA: “Start a new operation”. Cancel CTA: “Keep this operation”. It must create a new invocation, authority, payment identifier and effect lineage. It must be absent during uncertainty, settlement-unknown, reconciliation-in-progress or any state where safe termination is not established.

## Human information hierarchy

The action-detail page must follow this order:

1. **Environment boundary** — persistent runtime-supplied badge and adjacent
   provenance text. Local fixtures say “Local labelled sandbox”; only successful
   Plan 07 hosted readback says “Hosted sandbox.” Both state “Uses a labelled
   mock provider. No real payment.”
2. **Task and current state** — operation-owned title “Get the latest BTC price in USD” and an ordinary-language status with icon.
3. **Material consequence** — selected provider, maximum charge “Up to $0.01 USD”, and disclosed fields (“BTC and USD”).
4. **Payment and result truth** — payment submission, settlement evidence and result validation remain separate statements. The result never visually overwrites unresolved payment truth.
5. **Only safe next action** — one dominant continuation or an explicit no-action message.
6. **Operation-owned details/result** — render only closed typed presentation blocks.
7. **Evidence boundary** — visible runtime-supplied evidence class and mock provenance.
8. **Technical details** — progressive disclosure for invocation reference/version, operation revision, provider ID, digests, attempt/effect evidence references and exact claim ceiling.

Text wireframe:

```text
[compact authenticated navigation]

[Hosted sandbox] Uses a labelled mock provider. No real payment.

Get the latest BTC price in USD                     [Needs checking ⚠]
Latest durable state from this hosted trial

Provider                 Maximum charge             Data shared
Mock provider name       Up to $0.01 USD            BTC and USD

CURRENT TRUTH
The paid request may have been submitted. AE will not try again
until this exact payment is checked.

PAYMENT                    RESULT
Possibly submitted         Not validated
Settlement unknown

SAFE NEXT ACTION
Check the existing payment. Do not start this purchase again.
[Check existing payment]

Operation details / Result
Hosted sandbox evidence · Mock provider

▸ Technical details
```

At 320px and at 400% zoom, all columns become one ordered stack. The current truth and safe next action stay above technical detail. No horizontal scroll is allowed except within a deliberately scrollable raw diagnostic value, and no raw payload is part of this phase.

## Frozen host/card ownership contract

Plan 04 must freeze the following typed host inputs before Plan 05 renders them.
Plan 05 may implement presentation and interaction states but may not invent
business truth, command admission or provider material.

| Concern | Source/host owner | Typed input to shared card | Card responsibility |
|---|---|---|---|
| What leaves AE | paid-operation operation adapter | persistent disclosure summary containing provider display name, material fields/data shared and maximum charge | Render before authority without parsing BTC, provider or rail fields |
| Authorize/refuse | application service plus host command adapter | current expected version and closed authorize/refuse descriptors | Render exact controls and pending/disabled/focus states; never construct authority |
| Pending command | host transport state plus latest durable semantics | `pendingCommandId`, pending kind and durable pre-command semantics | Disable initiating control, set busy state and avoid optimistic truth |
| Ambiguous transport | host rescue adapter | typed `update_not_confirmed`, requestId and inspect relation | Render read-only reload/inspect recovery; never replay |
| Payment/settlement/result | paid-operation semantics | three independent typed truth fields with attributable labels/evidence class | Render separately; never collapse into overall success |
| Safe next action | application-service continuation projection | zero or one dominant current command plus explicit no-action reason | Render only supplied continuation |
| Operation/result blocks | operation adapter | closed paid-operation presentation vocabulary | Render without query/provider branching |
| Evidence | source-owned projection | runtime-supplied environment, provenance and evidence class | Render exact supplied labels; never upgrade local to hosted |
| Technical details | protected host projection | invocation/version, operation revision, provider ID, digest, attempt/effect and evidence references | Progressive disclosure only |

The main reading order is locked:

1. current truth;
2. separate payment, settlement and result truth;
3. safe next action;
4. operation/result blocks;
5. evidence;
6. technical details.

The consequence disclosure summary precedes this sequence while authority is
being considered. `Ready for permission` is reserved for the pre-authority
state. `Payment prepared` is reserved for durable payment authorization after
authority and before submission. Neither label may be reused for the other.

## Shared semantic contract

Human and structured-agent surfaces consume the same source-created `PaidOperationSemantics` object with:

- `schema: "agentic-paid-operation:v1"`
- exact `identity.invocationRef` and `identity.expectedInvocationVersion`
- operation key, selected provider identity/name, operation revision and material inputs
- presentation title, summary and blocks
- maximum authorized charge
- independent query release, payment authorization, payment submission, settlement and result delivery truth
- hosted-sandbox environment, evidence class and claim ceiling
- typed error and closed continuation list

Both projections expose the same canonical `semanticDigest`. Its declared use is exactly `projection_equality_only_not_authority`. The digest proves projection equality only; it must never authorize a command, identify the caller, replace expected-version control, prove settlement, or attest provider fulfilment.

### Closed presentation blocks

Operation-owned adapters may supply only:

| Kind | Human rendering | Structured rendering |
|---|---|---|
| `text` | Persistent label and plain text | `{kind,label,value}` |
| `measurement` | Localized finite number plus unit | `{kind,label,value,unit}` |
| `money` | Localized currency and minor-unit amount | `{kind,label,amountMinor,currency}` |
| `timestamp` | Human UTC date/time; full ISO in accessible/technical detail | `{kind,label,value}` |
| `source` | Provider name and operation revision | `{kind,label,providerId,providerName,operationRevision}` |
| `reference` | Wrapped opaque reference in technical detail | `{kind,label,value}` |
| `status` | Text plus semantic icon/tone | `{kind,label,value,tone}` |

Shared paid-operation code must not parse or branch on BTC, USD, quote fields,
x402, endpoint, payment rail, provider ID, provider raw response or fixture
scenario. This is query- and provider-agnostic behavior within the
paid-operation class, not a generic Action renderer claim. Booking, inquiry,
dispatch, communication, cancellation and other non-paid action classes may
not import these DTOs, semantics or payment panels. There are no HTML, Markdown,
URL-action, script, form, component, tool-call or executable-control blocks.
Model output may populate no component type and may issue no continuation.

## Structured-agent surface

### Evaluator setup, creation, routes and authentication

Use one authenticated resource family:

- `POST /api/v1/paid-operations` is the evaluator-scoped Sandbox setup/create
  adapter and accepts only `{providerKey}`.
- `GET /api/v1/paid-operations/:invocationRef?expectedInvocationVersion=:version`
- `POST /api/v1/paid-operations/:invocationRef/commands`

All routes bind the authenticated principal/caller and call the existing
source-owned application boundary. Setup `providerKey` is a closed fixture
selector, never provider material or customer comparison. Routes accept no
principal, amount, recipient, semantic object, digest, authority scope, result
truth or reconciliation disposition from the caller.

The GET response returns:

```text
kind
projection.kind = external_agent_paid_operation
projection.semantics
projection.semanticDigest
projection.semanticDigestUse = projection_equality_only_not_authority
expectedInvocationVersion
commands[]  // derived only from current continuations
environment
```

Each command descriptor contains exact `command`, `requiredInput`, `expectedInvocationVersion` and a route relation supplied by the current response. The agent follows only this returned command set; it does not construct later commands or versions.

The command POST body contains only the returned command kind,
`expectedInvocationVersion`, and the required source-owned input for that
command. `authorize` accepts the principal's exact yes/no authority decision;
`execute` accepts no business fields; `inspect` is read-only; public
`reconcile` carries intent and expected version only. Exact attributable
reconciliation evidence is injected through the trusted server/operator
boundary and never appears in caller `requiredInput`. The caller cannot assert
“not settled”, “settled”, “valid result” or “safe to retry.”

### Command availability

| Durable truth | Human control | Agent command |
|---|---|---|
| Awaiting exact authority | “Authorize up to $0.01” and “Do not authorize” | `authorize` with exact version and decision |
| Authorized, not released | “Continue operation” | `execute` |
| Inspectable/terminal | “Review details” or no mutating button | `inspect` |
| Possible submission/unknown settlement/invalid result after release | “Check existing payment” | `reconcile` with command, commandId and expected version only; trusted evidence remains server/operator-side |
| Reconciled not settled | “Start a new operation” outside the old invocation | `inspect`; any new invocation uses the separate creation contract |
| Completed | No replay control; optional new-operation link | `inspect` |

`retry` is never exposed by the Phase 3C hosted adapters. No adverse state triggers another provider. A stale version returns current inspection/navigation only if doing so does not disclose another principal's operation; it never silently reapplies the command.

### Typed transport outcomes

- `401 unauthenticated`: stable machine code and authentication relation; no operation facts.
- `404 invocation_not_found`: same public shape for missing and cross-principal human lookup.
- `403 cross_principal_refused`: agent code is permitted only after authenticated non-enumerating policy review; contains no semantic object.
- `409 stale_invocation_version`: code, supplied version, current expected version and safe `inspect` relation; no command performed.
- `409 continuation_not_allowed`: code, current expected version and current allowed command descriptors; no command performed.
- `422 invalid_command_input`: field-level typed issues; no lifecycle mutation.
- `503 hosted_read_unavailable`: retry the read with bounded backoff; never infer operation failure or issue an effect command.

Transport failure after sending a command is rendered as “Update not confirmed. Reload this operation before doing anything else.” The client performs an inspect/read, not an automatic command replay.

## Golden-path contract

| Step | Human truth | Human action | Agent relation | Exit condition |
|---|---|---|---|---|
| Sandbox setup | Evaluator sees BTC/USD task, labelled fixture choices and persistent sandbox boundary outside the shared card | “Create sandbox operation” | evaluator-scoped create with closed `providerKey` | One invocation exists with provider already bound |
| Review consequence | Provider, up to $0.01 USD and BTC/USD data sharing are visible | “Authorize up to $0.01” or “Do not authorize” | `authorize` descriptor at exact version | Exact authority decision is durable |
| Permission recorded | “Permission recorded. Nothing has been submitted yet.” | “Continue operation” | `execute` descriptor at exact version | Prepared/submission-started custody precedes release |
| Execute once | “AE is continuing this exact operation.” | No second mutating control | inspect only while pending | One attributable result or named goblin truth is durable |
| Result | Payment request, settlement evidence and result validation are stated separately | Review details; optional fresh operation | `inspect` | Validated result is visible without overstating settlement |
| Restore | Same truth, version and continuation after reload/cold process | Current safe action only | GET latest invocation | Zero new signature, send or effect generation |

The golden path fails if Sandbox setup is presented as canonical product IA,
provider comparison enters the shared card, authorization and execution
collapse into one action, overall success hides
unresolved payment truth, or reload changes the operation.

## Goblin-path contract

The page must derive every state from durable semantics, never from route memory, optimistic component state or transcript.

Each goblin path names its branch point, durable truth, sole safe continuation
and permitted rejoin. “Stop” means the path remains visibly terminal or blocked;
it is not silently coerced back to success.

| Goblin family | Branches after | Examples | Safe rejoin or stop |
|---|---|---|---|
| Access goblins | Sandbox setup or inspect | unauthenticated, cross-principal, admission exhausted | Authenticate, return to setup, or stop without revealing operation facts |
| Pre-release goblins | Consequence review or authority | authority refused, invalid input, source refusal | Correct/review only when semantics permits, otherwise safely terminal |
| Control goblins | Any command admission | stale version, duplicate delivery, disallowed continuation | Inspect latest durable truth; never replay automatically |
| Release goblins | Prepared/submission-started/execute | transport ambiguity, possibly submitted, settlement unknown | Reload/inspect, then reconcile the existing attempt only |
| Result goblins | Result validation | invalid result, settled with unusable result | Reconcile or inspect evidence; never imply a free retry |
| Record goblins | Any read/restore | aggregate incomplete, read outage, reload, cold process | Read-only recovery; rejoin at the exact durable state or stop unavailable |
| Setup goblins | Creation or safe terminal history | invalid selector, provider switch | Reject invalid selector; valid switch creates wholly new consequence lineage |

| Branch point / state | Status label | Exact customer truth | Permitted continuation / rejoin |
|---|---|---|---|
| Initial loading | “Loading operation” | Stable skeleton preserves title, three consequence facts, truth panel and action area. | None while loading |
| Setup / no invocation | “Sandbox setup” | “Choose one labelled mock fixture for this evaluator trial.” | Create sandbox operation; rejoin at consequence review |
| Prepared / awaiting authority | “Ready for permission” | “Nothing has been sent or paid. Review the mock provider, shared data and maximum charge.” | “Authorize up to $0.01” or “Do not authorize” |
| Authority refused before release | “Not sent” | “You did not authorize this operation. Nothing was sent to the provider and no payment request was submitted.” | Inspect; start a new operation if desired |
| Source refusal before release | “Not sent” | “The operation stopped before anything was sent or paid.” Add one ordinary-language reason. | Inspect/correct only if semantics permits |
| Query released, no payment authorization | “Request shared” | “BTC and USD were shared with [provider]. No payment permission was created.” | Inspect or source-permitted correction |
| Payment prepared | “Payment prepared” | “Permission for up to $0.01 is prepared. No payment request has been submitted.” | Continue the same operation |
| Executing | “Sending request” | “AE is continuing this exact operation.” | Controls disabled; inspect follows completion |
| Payment observed, result pending | “Waiting for result” | “The mock provider received the payment request. AE is waiting for attributable payment and result evidence.” | Inspect only; never resend |
| Possibly submitted | “Needs checking” | “The paid request may have been submitted. AE will not try again until this exact payment is checked.” | “Check existing payment” |
| Settlement unknown | “Settlement unknown” | “Payment may have occurred. AE is checking attributable evidence. Do not start this purchase again.” | “Check existing payment” |
| Invalid result after possible submission | “Result not validated” | “Payment may have occurred, but the returned result could not be validated.” | Reconcile only |
| Reconciliation in progress | “Checking existing payment” | “AE is checking the existing payment and request. No new request will be sent.” | None; inspect/poll only |
| Reconciled not settled | “Checked — not paid” | “Evidence shows the earlier payment was not settled. A new result requires a new operation and permission.” | Inspect; “Start a new operation” |
| Reconciled settled, no valid result | “Paid — result unusable” | “Recorded evidence supports a payment of [amount], but the returned result was not validated.” | Inspect evidence; no implied free retry |
| Completed, settlement not independently established | “Result received” | “The result was received and validated. No independent payment settlement is recorded.” | Inspect; optional fresh operation |
| Completed with sandbox settlement evidence | “Result received” | “The result was received and validated. The mock provider's recorded evidence reports [amount] settled.” | Inspect; optional fresh operation |
| Duplicate command/delivery | “Already recorded” | “This update was already recorded. No second payment request or operation was created.” | Current semantics continuation only |
| Stale version | “Operation changed” | “This operation changed since the page was loaded. The latest durable state is shown; your previous action was not applied again.” | Current semantics continuation only |
| Cross-principal/missing | “Operation unavailable” | “This operation is not available to this account.” | Return to Sandbox setup |
| Read/load error | “Operation not loaded” | “AE could not load the durable operation record. Reload before taking another action.” | “Reload operation” (read only) |
| Command error before confirmed mutation | “Update not confirmed” | “AE could not confirm the update. Reload this operation before doing anything else.” | “Reload operation” (read only) |
| Reload | No special success state | Render the latest semantic truth and version; “Updated from the durable record” may be announced once. | Current semantics continuation |
| Cold restore | “Restored operation” announced once | “This operation was restored from its durable hosted record. No new request or payment was created.” | Current semantics continuation |

An overall success treatment is forbidden while query release, payment, settlement or result truth is unresolved. “Settled” is permitted only when the semantic settlement state is `settled` with its named recorded evidence; public copy must still qualify it as sandbox/provider-recorded rather than independent settlement.

## Interaction behavior

- Only one primary command is visually dominant at a time. Secondary refusal/cancel actions remain explicit where authority is being requested.
- Every stateful control has hover, visible focus, active, disabled, loading and error behavior.
- Disable the initiating control immediately while a command is pending, set the operation region `aria-busy="true"`, and preserve its label with an adjacent spinner. Do not optimistic-render payment or result state.
- Background refresh may poll only the inspect/read boundary with bounded frequency. It never replays a command.
- After a user-triggered command resolves, move focus to the concise status region or the new current-truth heading. On passive polling, do not move focus.
- Reload and cold restoration must not reopen technical disclosure, reset the selected provider, create a new invocation, increment an effect generation, sign or submit again.
- Technical disclosure uses a native/Astryx disclosure with a 44px summary target and persistent “Technical details” label.
- Confirmation is required for rejecting pending exact authority and for starting a different provider invocation if the current record is safely terminal. There is no destructive removal action; historical records are never deleted from this surface.
- Motion is limited to 120–250ms state explanation and removed under `prefers-reduced-motion`. No looping progress animation is required.

## Loading, empty and error copy

| Element | Exact copy |
|---|---|
| Setup page title | “Sandbox setup” |
| Setup task title | “Get the latest BTC price in USD” |
| Page boundary | “Hosted sandbox · Uses labelled mock providers · No real payment” |
| Setup CTA | “Create sandbox operation” |
| Authority CTA | “Authorize up to $0.01” |
| Refuse CTA | “Do not authorize” |
| Execute CTA | “Continue operation” |
| Reconciliation CTA | “Check existing payment” |
| Read recovery CTA | “Reload operation” |
| New consequence CTA | “Start a new operation” |
| Permission boundary | “Permission recorded. Nothing has been submitted yet.” |
| Setup selector legend | “Choose a labelled mock fixture” |
| Load error | “AE could not load the durable operation record. Reload before taking another action.” |
| Command ambiguity | “AE could not confirm the update. Reload this operation before doing anything else.” |

Avoid “transaction successful,” “payment confirmed,” “verified provider,” “fulfilled,” “best provider,” “live price,” or “production ready.”

## Public and technical vocabulary

The protected human page uses: task, operation, mock provider, maximum charge, data shared, permission, payment request, payment evidence, result, checked, problem, progress and safe next action.

The progressive technical disclosure and structured-agent response may use: Action Invocation, expected invocation version, operation revision, principal/caller reference, attempt, effect generation, provider ID, semantic digest, evidence reference, reconciliation and claim ceiling.

Do not show x402, challenge, payee, payment rail, custody reference, raw provider payload, DTO, gateway, MCP, OpenAPI, `KNOWN`, `UNKNOWN`, `UNAVAILABLE`, `NEXT_STEP` or fixture identifiers in ordinary human hierarchy. If x402-specific diagnostics are operationally necessary, they remain inside operation-owned protected diagnostics and are not fields or branches in the shared card.

## Accessibility contract

Target WCAG 2.2 AA:

- One `h1` page title and one `h2` action-card title; sections use ordered `h3` headings.
- Use semantic `dl/dt/dd` for facts and native/Astryx Button and disclosure
  behavior. Evaluator-only Sandbox setup provider selection uses
  `fieldset/legend` outside the card.
- Every input has a persistent visible label. Placeholder text is never a label.
- Status has text plus icon; colour never carries meaning alone.
- Visible focus has at least a 2px semantic outline with offset and survives high contrast.
- All controls and disclosure summaries are keyboard reachable in reading order and have minimum 44×44px practical targets.
- One concise `role="status" aria-live="polite" aria-atomic="true"` region announces user-triggered lifecycle changes. Do not reread the whole card. Critical blocking errors may use `role="alert"` only once.
- Announce “Possibly submitted. Check existing payment before another operation.” rather than raw codes.
- Do not announce polling ticks, skeleton changes or unchanged restored state.
- At 320 CSS pixels and 400% zoom, reflow to one column without loss, overlap or page-level horizontal scrolling.
- Respect reduced motion; focus and state changes remain understandable with all transitions disabled.
- Currency is visually “$0.01 USD” and accessibly “one cent, United States dollars.” UTC timestamps expose both human text and an ISO machine value.
- Technical digests and references wrap; copying them must not be required for the customer continuation.
- Automated accessibility checks are not a real screen-reader session. Hosted acceptance records that evidence ceiling explicitly.

## Semantic parity and security constraints

For every inspect or command response:

1. The server creates one `agentic-paid-operation:v1` semantic object from durable state.
2. The human projection and structured projection are derived from that same in-memory object.
3. Both return the same canonical semantic digest.
4. The browser-rendered `data` proof, if present, contains only the digest and non-secret version—not credentials, signatures, payment payloads, raw provider responses or reconciliation evidence.
5. The agent route serializes only the closed schema and current command descriptors.
6. Authentication and expected-version enforcement happen before semantics are returned or a command is admitted.

A UI-contract test must render a non-BTC conformant paid-operation fixture through the same card to prove no BTC/query/provider branch. This is horizontal renderer evidence only, not a new hosted operation or provider claim.

## Focused eval contract

### Source/UI contract evals

- Assert shared components contain no BTC, USD quote, crypto, x402 or provider-ID branches.
- Assert only the seven closed presentation block kinds are accepted and executable/HTML/Markdown blocks fail closed.
- Assert both surfaces use `agentic-paid-operation:v1`, the same semantic object/digest and `projection_equality_only_not_authority`.
- Assert uncertain payment or settlement yields exactly reconciliation and never retry, execute, fallback or alternate-provider commands.
- Assert provider switch creates a distinct invocation, authority, payment identifier and effect lineage.
- Assert unauthenticated, missing, cross-principal, stale and disallowed-command outcomes are typed and non-mutating.

### Browser evals

Run the existing focused UI-contract command and a Phase 3C Playwright spec against the protected hosted-sandbox surface:

- authentication redirect/return and non-enumerating unavailable state;
- evaluator-only `/actions/paid/new` Sandbox setup provider selection by
  keyboard, outside `AePaidOperationCard`, with no comparison/ranking copy;
- bound provider, charge and shared data visible before authority on Action
  Detail;
- the permission-recorded/not-submitted boundary before execute;
- prepared, refusal, possible submission, settlement unknown, invalid result, reconciliation, duplicate, stale, completion, read failure, reload and cold-restore states;
- only the durable continuation is actionable in each state;
- one atomic live region, focus movement only after user action, computed visible focus and 44px targets;
- no horizontal overflow at 320px and declared 400% zoom check;
- reduced-motion computation has no functional dependency on animation;
- semantic digest equality and exact expected version after every transition;
- page reload and separate-process cold restore create zero duplicate signatures, sends or effect generations.

### Golden/goblin comprehension eval

Run the forward golden path first, then a counterbalanced set of named goblin
paths: authority refusal, possibly submitted, invalid result,
reconciled-not-settled, stale/duplicate, read outage and completed restore. An
evaluator who does not open technical details must correctly answer:

1. What task is being done?
2. Which mock provider was selected?
3. What is the maximum charge?
4. What data was or may have been shared?
5. Was a payment request not submitted, possibly submitted or observed?
6. Is settlement absent, unknown, not settled or supported by recorded sandbox evidence?
7. Was the result validated?
8. What is the only safe next action?
9. Would changing provider reuse this permission or payment? Correct answer: no, it starts a new operation and consequence boundary.
10. Is this a real provider/payment/settlement result? Correct answer: no, it is a hosted sandbox using labelled mock providers.
11. Is provider selection part of canonical product IA? Correct answer: no,
    this is protected evaluator-only Sandbox setup; the source resolves and
    binds the selected fixture before permission.
12. If this path cannot safely continue, did AE stop visibly rather than force
    it back onto the golden path?

Pass threshold: every participant completes the golden path and answers
questions 3, 5, 7, 8, 9, 10, 11 and 12 correctly; at least 90% accuracy across
all answers. Any participant choosing retry or provider change during
uncertainty is a hard fail. Automated copy matching may steer development but
does not substitute for the declared human comprehension session.

### Hosted readback eval

From a clean exact revision, bind evidence to:

- named deployment and revision;
- authenticated human and agent identities;
- fixture provenance and selected provider;
- initial semantic digest and expected version;
- each durable transition;
- reload and a fresh-process/cold reconstruction;
- matching human/agent digest and only safe continuation after restoration;
- zero duplicate effect release;
- environment and claim-ceiling labels in both projections.

Hosted readback proves only the named protected hosted-sandbox deployment and inputs. It does not upgrade mock provider assertions to independent provider or settlement evidence.

## Closure and promotion posture

At Phase 3C closure every introduced artifact is classified:

- `paid-operation-owned` — reusable only inside the paid-operation class;
- `trial-only` — Sandbox setup routes, labelled mocks, evaluator fixtures,
  trial auth/admission and proof tooling intended for retirement;
- `candidate-shared-after-second-use` — behavior that remains local to this
  phase until a second non-BTC paid operation proves the same need without
  branching.

Removal/import-boundary acceptance must show that trial-only routes, mocks and
operation-owned persistence can be removed without damaging neutral Action
Invocation. Non-paid action classes cannot import paid-operation DTOs,
semantics or payment panels.

Closure records the sandbox account/record retention or expiry policy,
kill-switch owner, residual records left after the trial and the objective
retirement trigger. This UI-SPEC then becomes Phase 3C provenance. Only
second-use validated paid-operation behavior may later be promoted into
`DESIGN.md` or shared contracts through a separate accepted decision.

## Claim ceiling

Passing Phase 3C may establish:

- protected authenticated hosted-sandbox reachability at one named exact revision;
- durable reconstruction of the paid-operation truth and safe continuation;
- shared human/structured-agent semantic and digest parity;
- focused automated accessibility behavior;
- the declared evaluator comprehension result.

It does not establish provider onboarding, real credentials, real payment, independent settlement, independently operated provider fulfilment, production safety, public availability, demand, customer value, comparison quality, automatic fallback, broader workflows or general autonomy.

Environment, provenance, evidence class and claim ceiling are supplied by the
runtime/source projection, never hard-coded by the card or fixture.

- Plan 05 local/UI/browser fixtures carry environment `Local labelled
  sandbox`, provenance `Labelled mock provider`, evidence class
  `local_labelled_sandbox_fixture`, and a local-only claim ceiling.
- Only a successful separately authorized Plan 07 exact-revision readback may
  emit environment `Hosted sandbox` and evidence class
  `authenticated_exact_revision_hosted_sandbox`.
- Both may use the same mock provenance, but local fixture success never
  pre-claims hosted reachability.

## Forbidden implementation outcomes

The phase fails the UI contract if it introduces any of the following:

- BTC/USD, crypto, x402, quote or provider-specific fields/branches in shared semantics, lifecycle UI, route orchestration or command handling;
- provider ranking, comparison cards, recommendations, cheapest/fastest labels, fallback or switching during uncertainty;
- provider material outside the closed evaluator setup selector, or any
  caller-selected authority scope, price, recipient, continuation,
  reconciliation result or semantic digest accepted as source truth;
- model-generated React, HTML, component schemas, executable blocks, controls or commands;
- optimistic payment/result truth, automatic command replay, retry during uncertainty or success that hides unresolved payment;
- a second host lifecycle, transcript-owned state, component-memory reconstruction or digest used as authority;
- secrets, signatures, payment payloads or raw provider evidence in browser state, logs, snapshots or agent JSON;
- public anonymous access, broad Activity, wallet, crypto terminal, workflow builder, standing-mandate selector or Full autonomy UI;
- fake provider quality, reviews, activity, fulfilment or “verified” claims;
- any claim above the hosted-sandbox ceiling.

## Checker sign-off

- [x] Information hierarchy and copy expose task, consequence, truth and safe continuation without protocol theatre.
- [x] Human and agent projections share exact semantics, digest and expected-version behavior.
- [x] All lifecycle, adverse, reload and cold-restore states are specified and non-retryable where uncertain.
- [x] Astryx neutral, semantic colour, four-size/two-weight typography and 4px spacing scale are preserved.
- [x] Keyboard, focus, live-region, 44px target, 320px, 400% zoom and reduced-motion contracts are executable.
- [x] Provider choice is pre-authority and non-comparative; switching starts a new consequence.
- [x] Registry safety is not applicable; shadcn and third-party registries are absent.
- [x] Hosted evidence and comprehension evals preserve the exact claim ceiling.

**Approval:** gsd-ui-checker passed all six dimensions on 2026-07-20.
Founder acceptance remains required before implementation.
