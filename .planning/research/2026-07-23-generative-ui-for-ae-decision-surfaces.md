# Generative UI for AE decision surfaces

**Owner:** Founder
**Status:** Active
**Maturity:** Target research
**Question:** Should Agentic Economy use generative UI for the Phase 5 public Offering browse/detail/shortlist/compare loop and future execution surfaces, and if so, what may be generated without moving truth, authority, accessibility, or human/agent parity into model output?
**Decision affected:** Phase 5 D-17 and Plans 05-05 through 05-08
**Evidence cutoff:** 2026-07-23
**Review by:** 2026-08-23
**Supersedes:** None
**Superseded by:** None

**Founder disposition — 2026-07-23:** Adopt the bounded hybrid direction. Make
the human surface answer-first, preserve deterministic semantic truth and full
evidence, and allow only strict registered presentation choices above that
truth. This disposition informs the active Phase 5 UI and execution plans; this
research record remains evidence rather than implementation authority.

## Executive finding

**INFERRED — high confidence:** AE should not make Phase 5 comparison truth
model-generated. Phase 5 already has the right product boundary: one
server-resolved, deterministic `offering-comparison:v1` semantic object; one
canonical URL; native accessible renderers; and equivalent structured-agent
output. A model in that required loop would add latency, cost, injection surface,
non-determinism, and a second explanation owner without adding missing product
truth.

**INFERRED — medium confidence:** The product direction is a hybrid:
deterministic semantic objects and action-state machines remain authoritative,
while GenUI is the primary customer presentation and adapts registered
compositions to the question, category, and device. It may foreground only
already-valid detail and draft explanation bound to source-owned semantic IDs.
Invalid, unavailable, slow, or absent model output must fall back to the
complete deterministic renderer.

The founder has accepted a bounded answer-first composition seam inside Phase
5. That acceptance is not implementation, hosted capability, accessibility
result, customer-value result, or evidence that model composition improves a
decision.

## The decision supported

The founder is deciding whether “generative UI” is:

1. a new truth-and-interaction architecture for AE; or
2. a reversible presentation capability over AE’s existing semantic and
   authority contracts.

**INFERRED:** Only the second interpretation fits AE. The differentiating
customer value is choosing and completing work with real businesses. UI novelty
does not justify letting a model determine which Offering revision exists,
whether facts are comparable, what authority is current, what external effect
may have occurred, or what recovery is safe.

## Current AE baseline

- **OBSERVED:** Phase 5 plans one versioned `offering-comparison:v1` result whose
  exact selections, facts, provenance, currentness, priorities, trade-offs,
  refusals, and ordering are resolved server-side. Human and structured-agent
  surfaces consume that same meaning rather than recomputing it
  ([05-05 plan](../phases/05-consumer-operating-proof/05-05-PLAN.md),
  [05-07 plan](../phases/05-consumer-operating-proof/05-07-PLAN.md)).
- **OBSERVED:** Ordering is deliberately deterministic and lexicographic over
  stated priorities. Missing, stale, or non-comparable decisive facts block a
  total order; no LLM ranker, universal score, or hidden tie-break is permitted
  ([05-05 plan](../phases/05-consumer-operating-proof/05-05-PLAN.md)).
- **OBSERVED:** The public UI is planned as a render-only Astryx composition:
  native table semantics on desktop, equivalent `<dl>` semantics on mobile,
  canonical URL input, server re-resolution, keyboard/focus recovery, 320 CSS
  px and 400% zoom checks, and zero-effect controls
  ([05-06 plan](../phases/05-consumer-operating-proof/05-06-PLAN.md),
  [05 UI specification](../phases/05-consumer-operating-proof/05-UI-SPEC.md)).
- **OBSERVED:** The repository uses React 19, TanStack Start/Router, Vite, Convex,
  Astryx, Zod, Playwright, and Vitest. It is not a Next.js React Server
  Components application ([package manifest](../../package.json)).
- **OBSERVED:** Phase 5 has no implementation or hosted evidence yet and remains
  blocked on exact Offering predecessor custody
  ([project state](../STATE.md)).

**INFERRED:** The present baseline is not an obstacle to generative UI. It is the
semantic foundation a safe generative layer would require.

## Primary-source observations

### Vercel AI SDK: streamed components and constrained tool rendering

- **OBSERVED:** AI SDK RSC `streamUI` allows a model to select a tool whose
  trusted server-side `generate` function yields React components. It does not
  require executing model-authored JavaScript
  ([Vercel streaming React components](https://ai-sdk.dev/docs/ai-sdk-rsc/streaming-react-components)).
- **OBSERVED:** AI SDK RSC is experimental, and Vercel recommends AI SDK UI for
  production
  ([AI SDK RSC overview](https://ai-sdk.dev/docs/ai-sdk-rsc/overview)).
- **OBSERVED:** RSC UI state is not directly serializable; restoration uses
  persisted AI state as a proxy to reconstruct components
  ([saving and restoring RSC state](https://ai-sdk.dev/docs/ai-sdk-rsc/saving-and-restoring-states)).
- **OBSERVED:** AI SDK UI defines generative UI as mapping structured tool
  results to application-owned React components. Its serializable `UIMessage`
  format can be persisted and validated before processing
  ([generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces),
  [message persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)).
- **OBSERVED:** AI SDK UI streams typed message parts over SSE and exposes
  explicit error/finalization paths; resumable streams require application-owned
  persistence and have an abort/resume trade-off
  ([stream protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol),
  [resuming streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)).

**INFERRED:** The production-suitable Vercel pattern is not “the model writes the
page.” It is “the model selects a constrained tool, structured data is returned,
and trusted application code renders it.” RSC-specific streaming would add a
framework migration and a non-serializable UI-state problem to AE without a
Phase 5 need.

### OpenAI Apps SDK and MCP Apps: structured data plus predeclared views

- **OBSERVED:** OpenAI Apps SDK components receive structured MCP tool results
  inside a sandboxed iframe and re-render from `structuredContent`
  ([building ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)).
- **OBSERVED:** OpenAI recommends separating reusable data tools from render
  tools and keeping render handlers focused on presentation rather than business
  logic
  ([building ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)).
- **OBSERVED:** OpenAI explicitly assigns authoritative business data to the MCP
  server/backend, ephemeral view state to the widget, and cross-session state to
  backend storage. It advises against using `localStorage` for core state
  ([Apps SDK state management](https://developers.openai.com/apps-sdk/build/state-management)).
- **OBSERVED:** Apps SDK widgets run in sandboxed iframes with strict CSP; tool
  inputs still require server-side validation, scopes must be enforced on every
  tool call, and prompt-injection testing is part of the security guidance
  ([Apps SDK security and privacy](https://developers.openai.com/apps-sdk/guides/security-privacy)).
- **OBSERVED:** OpenAI’s UI guidance requires WCAG AA contrast, image
  alternatives, and text resizing without broken layouts
  ([Apps SDK UI guidance](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)).
- **OBSERVED:** The MCP Apps stable specification binds a tool to a predeclared
  `ui://` resource. Hosts fetch and render that resource in a sandboxed iframe,
  validate auditable JSON-RPC messages, restrict tool visibility, and retain a
  standard non-UI tool fallback when a host does not support Apps
  ([MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx),
  [official SDK repository](https://github.com/modelcontextprotocol/ext-apps)).

**INFERRED:** Apps SDK/MCP Apps is a strong future distribution model for an AE
comparison or action-detail view inside external agent hosts. It is not a reason
to move the canonical AE web page into an iframe or to let a model author the
view. The portable asset is the semantic tool result; the host view is a
predeclared, inspectable adapter.

### Google A2UI: server-driven declarative UI

- **OBSERVED:** A2UI is a declarative, non-executable JSON format. An agent may
  describe a component tree and data model, but the client maps only trusted,
  pre-approved catalog components to native widgets
  ([A2UI official repository](https://github.com/a2ui-project/a2ui)).
- **OBSERVED:** A2UI represents components as a flat ID-addressed structure that
  can be incrementally updated, separates structure from framework-specific
  rendering, and supports custom registry mappings
  ([A2UI official repository](https://github.com/a2ui-project/a2ui)).
- **OBSERVED:** At the evidence cutoff A2UI remains an early public preview:
  v0.9.1 is the production release family and v1.0 is a release candidate; the
  specification and renderer set are still evolving
  ([A2UI official repository](https://github.com/a2ui-project/a2ui)).

**INFERRED:** A2UI has the best trust shape among genuinely model-composed UI
approaches because component types are data, not executable code. Adopting its
general schema for Phase 5 would still duplicate AE’s already-specific
comparison contract, introduce a second state/update protocol, and make
accessibility depend on every catalog mapping. Its ideas are useful; its runtime
is premature for AE’s canonical public loop.

### AG-UI and CopilotKit: transport and shared state, not truth

- **OBSERVED:** AG-UI is a bidirectional event protocol, not itself a generative
  UI schema. It transports lifecycle, text, tool-call, state, activity, raw, and
  custom events and can carry A2UI or other UI formats
  ([AG-UI generative UI relationship](https://docs.ag-ui.com/concepts/generative-ui-specs),
  [AG-UI events](https://docs.ag-ui.com/concepts/events)).
- **OBSERVED:** AG-UI state synchronization uses complete snapshots and ordered
  RFC 6902 JSON Patch deltas. Its own guidance calls for conflict handling,
  resynchronization, and avoiding sensitive data in shared state
  ([AG-UI state](https://docs.ag-ui.com/concepts/state)).
- **OBSERVED:** AG-UI tool calls expose named lifecycle events and schema-defined
  arguments, providing useful run and tool observability
  ([AG-UI tools](https://docs.ag-ui.com/concepts/tools)).
- **OBSERVED:** CopilotKit distinguishes static tool-based generative UI,
  declarative A2UI, and open-ended MCP Apps/Open JSON approaches
  ([CopilotKit official repository](https://github.com/CopilotKit/CopilotKit)).

**INFERRED:** AG-UI could later standardize streaming activity between an AE
agent runtime and UI, but it does not answer which record owns truth or
authority. Importing it for a read-only Phase 5 page would add a second event and
state layer before AE has a corresponding multi-turn runtime need.

### Artifact or code generation

- **OBSERVED:** CopilotKit’s first-party OpenGenerativeUI example has an agent
  produce live HTML/SVG/JavaScript artifacts and runs them inside sandboxed
  iframes
  ([OpenGenerativeUI repository](https://github.com/CopilotKit/OpenGenerativeUI)).
- **OBSERVED:** The MCP Apps threat model still treats sandboxed interactive
  content as potentially malicious: it calls out harmful HTML, sandbox escape,
  unauthorized tool execution, exfiltration, phishing, resource use, CSP, and
  host-side validation
  ([MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)).

**INFERRED:** Code generation is suitable for disposable visual artifacts where
the artifact is the product and failure is contained. It is unsuitable for AE’s
canonical comparison, authority, execution, cancellation, or recovery controls.
Sandboxing reduces execution privilege; it does not make generated claims,
labels, focus order, controls, or persuasion trustworthy.

### Accessibility is a renderer obligation

- **OBSERVED:** WCAG 2.2 requires script-generated controls to expose
  programmatically determinable names, roles, states, and values; status changes
  must be exposed without moving focus
  ([WCAG 2.2](https://www.w3.org/TR/WCAG22/),
  [name, role, value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value)).
- **OBSERVED:** WCAG reflow requires content to remain usable at 320 CSS px,
  corresponding to 400% zoom from 1280 CSS px, subject to narrow exceptions such
  as truly two-dimensional data tables
  ([WAI reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)).
- **OBSERVED:** WAI encourages native HTML tables where possible; ARIA grids add
  a composite-widget keyboard model and focus-management obligations
  ([WAI table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/),
  [WAI grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)).

**INFERRED:** A schema-valid component tree is not an accessibility result.
Accessibility lives in the registered component implementation, the composition
constraints, the complete rendered state, and browser/assistive-technology
evaluation. Model-authored ARIA, focus behavior, or arbitrary nesting should not
be accepted as trusted output.

## Architecture comparison

| Model | Truth, security, and state | Streaming and persistence | Accessibility, observability, and parity | AE fit and blast radius |
|---|---|---|---|---|
| Model-selected streamed React/server components (`streamUI`) | **OBSERVED:** trusted tool code returns components; model selects the tool. **RISK:** RSC UI state is not directly serializable and the API is experimental. | Excellent component streaming; restoration requires reconstructing UI from persisted AI state. | Registry components can be tested, but model-selected sequences still require end-to-end evals. Agent parity must be measured at tool-result level, not React output. | **Not recommended for AE.** Requires Next/RSC architecture beside TanStack Start, new AI/UI state, model runtime, persistence, and eval ownership. Risk: framework fork and non-reconstructable UI claims. |
| Constrained component/tool calls (AI SDK UI, Apps SDK, static CopilotKit tool rendering) | **OBSERVED:** schema-validated tool arguments/results map to application-owned components; server can remain truth owner. **RISK:** tool descriptions and provider content remain injection inputs; tool selection is probabilistic. | Strong typed streaming and serializable message/tool-result persistence; UI state remains explicitly separate. | Prebuilt components can own semantics and WCAG behavior. Tool/run IDs support evaluation. Human/agent parity can compare the shared semantic result. | **Good later adapter.** Add model/tool router, renderer registry, logs, cost controls, and fallback; no canonical data change. Risk: duplicate entry path and model-selected omission. |
| Server-driven declarative UI schema (A2UI) | **OBSERVED:** non-executable JSON references a trusted component catalog. **RISK:** catalog wrappers and action/data bindings become a new security boundary; protocol is still evolving. | Designed for incremental ID-addressed updates and cross-framework rendering. Durable share requires storing/versioning schema plus source data or regenerating it. | Catalog implementations are testable, but arbitrary compositions can still break reading order, headings, focus, or status announcements. Semantic parity requires a separate canonical data object. | **Watch, do not adopt in Phase 5.** New schema, renderer, catalog, streaming reducer, persistence/versioning, and hostile-input suite. Risk: second UI protocol over a settled comparison contract. |
| Generated artifact/code in sandbox (HTML/SVG/JS) | **OBSERVED:** arbitrary output can be isolated in an iframe/CSP boundary. **RISK:** phishing, misleading claims, inaccessible controls, resource abuse, and unauthorized message/tool attempts remain. | Artifact can be saved verbatim and streamed as code, but version, provenance, dependency, and migration ownership become product concerns. | Pixel/browser evals are possible but component-level guarantees are weak; human/agent parity is poor because the artifact itself becomes a new interpretation. | **Reject for canonical decision/execution UI.** New sandbox host, CSP, message bridge, artifact store, scanner, resource limits, and deep a11y/security evals. Risk: largest attack and governance surface. |
| Hybrid deterministic semantic object plus constrained generative composition | **INFERRED:** catalog, registry, comparator, mandate, attempts, and recovery remain deterministic; model output is a strict presentation plan containing only registered IDs. | Stream deterministic progress first; apply a composition only after complete validation. Persist/share the semantic selection and renderer version; deterministic renderer always reconstructs the page. | Native registered components own WCAG behavior. Log the source digest, model/prompt, raw and accepted plan, fallback, and outcome. Agent parity stays on semantic objects; visual parity is neither required nor claimed. | **Accepted Phase 5 direction.** Adds one bounded composition seam, strict plan schema, small renderer registry, telemetry, fallback, and evals. Risk: bounded latency/cost, omission, persuasion, and explanation drift. |

## Recommendation: what may be generated

**INFERRED:** The Phase 5 GenUI adapter may generate only presentation choices that cannot
change the underlying decision:

- choose one `layoutId` from a small, product-owned registry;
- select up to a bounded number of existing `rowId` values to foreground;
- choose one registered visualization for facts that are already comparable;
- draft a short explanation whose claims reference explicit result reason/fact
  IDs and whose visible label identifies it as generated explanation;
- ask a clarifying question when the semantic result itself says a stated
  priority is missing.

The server must replace every model-supplied string or identifier with canonical
copy/data from `offering-comparison:v1`. The model must not supply HTML, JSX,
JavaScript, CSS, URLs, tool names, action IDs, ARIA attributes, control labels,
business facts, ranks, safety states, or executable handlers.

## What must remain deterministic

**INFERRED:** These are product truth or consequence boundaries and must never be
generated:

- business/Offering identity, exact revision, public eligibility, suppression,
  provenance, currentness, and safe links;
- shortlist bounds, canonical URL parsing, refresh/share reconstruction, and
  current-revision replacement;
- fact normalization, comparability, missing/stale/not-supplied states,
  priority interpretation, order, tie, refusal, and decisive reasons;
- whether an action exists, is reachable, or is read-only, communicative, or
  consequential;
- identity, current mandate, remaining spend/count/concurrency limits,
  reservations, recipients, shared data, purpose, and expiry;
- approval or step-up need, idempotency meaning, attempt/effect generation,
  uncertainty, reconciliation, retry eligibility, cancellation, and receipts;
- component implementation, public labels, tab/focus order, live-region
  behavior, responsive semantics, reduced motion, and deterministic error,
  loading, empty, refusal, and recovery states;
- structured-agent results and the semantic event/audit record.

For future execution surfaces, the model may select a registered view of the
current deterministic action state. It may not select, invent, hide, relabel, or
execute the consequence control itself.

## Bounded v1 architecture

This is the accepted bounded Phase 5 presentation architecture. The
deterministic comparison remains independently complete; model-backed
composition is fail-open to that deterministic renderer and is not a closure
dependency.

```text
catalog / registry / comparison / action owners
                    |
                    v
       versioned safe semantic object
                    |
          +---------+----------+
          |                    |
          v                    v
deterministic renderer   optional composition service
  (always complete)       (read-only, no tools/effects)
          |                    |
          |          strict CompositionPlan:v1
          |          IDs/enums only, cap + validate
          |                    |
          +---------+----------+
                    v
       registered Astryx compositions
                    |
                    v
       browser + semantic/a11y telemetry
```

### Proposed `CompositionPlan:v1`

```ts
type CompositionPlanV1 = {
  version: "ae-composition-plan:v1";
  layoutId: "comparison_table" | "priority_brief" | "tradeoff_sections";
  initiallyExpandedSectionIds: string[]; // max 3; must exist in result
  emphasizedRowIds: string[]; // max 3; must exist and remain in canonical order
  visualizationId?: "none" | "comparable_fact_bars";
  explanationClaims?: Array<{
    reasonId: string; // must exist in deterministic result
    sentence: string; // bounded, escaped text; no new facts or instructions
  }>;
};
```

**INFERRED controls:**

1. Build `offering-comparison:v1` without a model.
2. Hash the safe semantic input and keep provider-authored prose out of model
   instructions unless strictly delimited as untrusted data.
3. Invoke a read-only composition model with no tools, no network, no browser,
   no authority, and a strict output schema.
4. Buffer until the complete plan validates. Never apply partial model JSON to
   the DOM or move focus as tokens arrive.
5. Validate schema, caps, enum membership, ID existence, canonical row order,
   claim-to-reason references, and forbidden strings/fields.
6. Render only registry-owned Astryx components. Components fetch props from the
   semantic object by ID; model text never becomes a component prop other than
   the bounded explanation field.
7. On timeout, schema error, injection finding, unavailable model, accessibility
   guard failure, or unsupported result state, render the deterministic page.
8. Keep the shared URL semantic and model-independent. A shared page must
   reconstruct correctly even if the composition is not persisted or the model
   has changed.
9. Record model/prompt/schema versions, semantic digest, raw plan (access
   controlled), accepted plan, validation/fallback reason, latency, token/cost,
   rendered registry IDs, and user outcome.
10. Never feed browser/widget state back as business truth or authority.

**INFERRED blast radius:** one new optional application service, one strict
composition-plan codec, two or three registered presentation compositions, one
feature flag, one cache/telemetry record, and focused eval/browser fixtures.
Catalog, registry, comparison, action, authority, attempt, payment, and provider
effect owners remain unchanged.

## Security and injection posture

- **OBSERVED:** Structured output constrains shape, but the official ecosystems
  still require server validation, sandboxing/CSP where executable views exist,
  and explicit tool visibility
  ([Apps SDK security](https://developers.openai.com/apps-sdk/guides/security-privacy/),
  [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx),
  [A2UI repository](https://github.com/a2ui-project/a2ui)).
- **INFERRED:** Treat Offering names, descriptions, provenance labels, URLs,
  model output, UI schemas, tool results, and state deltas as untrusted inputs.
- **INFERRED:** Do not place provider prose beside operative composition
  instructions. Prefer typed fact IDs and canonical enum values.
- **INFERRED:** The model may reference only existing public semantic IDs; the
  server performs the lookup. This prevents a generated plan from introducing
  private fields, new links, effect controls, or synthetic facts.
- **INFERRED:** A composition must not reduce disclosure. Identity, provenance,
  unknown/stale states, decisive blockers, and safety/recovery notices remain
  mandatory regions in every registry layout.
- **INFERRED:** Generated explanations require claim-evidence tests. If a
  sentence cannot be reduced to cited semantic reason IDs, omit it.

## State, persistence, and shareability

**INFERRED:** AE should preserve three layers:

| Layer | Owner | Persistence rule |
|---|---|---|
| Business and execution truth | Catalog, registry, comparison, action and business modules | Durable according to source contract; never reconstructed from UI or transcript |
| Shareable decision input | Canonical exact selection/priorities URL plus server re-resolution | Share the references, not facts or generated layout; safe truth is refreshed on each load |
| View state/composition | Browser for ephemeral disclosure state; optional server cache for a validated plan | May disappear without losing meaning; never authority; version and digest-bound if cached |

This follows OpenAI’s documented separation between server-owned business truth,
widget-owned ephemeral UI state, and backend-owned durable cross-session state
([Apps SDK state management](https://developers.openai.com/apps-sdk/build/state-management)).

## Human and agent parity

**INFERRED:** Parity is semantic, not visual:

- humans receive a registered rendering of `offering-comparison:v1`;
- structured agents receive `offering-comparison:v1` directly;
- both re-resolve the same exact public Offering revisions;
- neither renderer nor model may recompute facts, ordering, authority, or safe
  continuation;
- optional `CompositionPlan:v1` is presentation metadata and need not be exposed
  as agent truth;
- a model-generated explanation is not parity evidence unless the underlying
  reason IDs are also present in the structured result.

MCP Apps reinforces this separation by retaining ordinary tool results when the
host does not support the UI extension
([MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)).

## Observability and eval loop

### Loop 1 — semantic invariance

For each canonical Phase 5 state, run the same semantic object through every
registered layout and hostile composition plan.

**Pass:** exact identities, cells, order/refusal, reasons, safe links, and
available controls deep-agree; only layout/disclosure metadata differs.

**Stop:** any composition omits or changes a material fact/state, changes
canonical order, invents a link/control, or makes a blocked result look ordered.

### Loop 2 — injection and containment

Mutate Offering text with instruction-like content, HTML, URL schemes, tool
names, private-field names, fake ARIA, oversize arrays, duplicate IDs, and
cross-business references.

**Pass:** model input is safely separated; output can reference only existing
public IDs; the validator refuses all extra/unknown values; no network, tool, or
effect path is reachable; deterministic fallback remains complete.

**Stop:** any provider text changes component registry choice in a way unrelated
to typed facts, appears as executable markup, or causes a hidden disclosure.

### Loop 3 — accessibility and interaction

Run component tests, Playwright, axe where already used, keyboard/focus checks,
320 CSS px, 400% zoom, reduced motion, and bounded VoiceOver observation over
every permitted layout and canonical state.

**Pass:** headings/regions remain coherent; table/list facts agree; controls
retain accessible names and targets; streaming/fallback status is announced
once without focus theft.

**Stop:** any layout needs model-authored ARIA, breaks reading order, hides
content at zoom, duplicates live announcements, loses focus, or creates a
keyboard trap.

### Loop 4 — product value

Compare the deterministic Phase 5 renderer with the optional composition layer
for a bounded set of real decision tasks.

Measure task completion, correct identification of decisive trade-offs and
unknowns, time/interaction count, unsupported-claim rate, fallback rate,
latency, cost, preference, and confidence calibration.

**Stop:** do not ship if composition fails to improve decision comprehension or
effort, increases unsupported beliefs, hides unknowns, or creates a material
latency/accessibility regression.

### Loop 5 — future execution safety

For each action state, compare every generated composition to the deterministic
action-state projection and attempt/authority record.

**Pass:** consequence, recipient, amount, shared data, mandate limit, current
attempt/generation, uncertainty, cancellation, and safe next action remain
identical and complete.

**Stop:** any composition suppresses a consequence, asks again for already
granted authority, widens authority, makes uncertainty look failed/succeeded,
offers retry before reconciliation, or claims cancellation without evidence.

## Hypotheses and falsifiers

| ID | Hypothesis | Baseline and population | Measurement | Falsifier | Owner | Review by |
|---|---|---|---|---|---|---|
| H-GUI-01 | **HYPOTHESIS:** A constrained composition improves comprehension of Offering trade-offs without semantic drift. | Deterministic Phase 5 comparison; people completing bounded professional-service and machine-data comparison tasks | Correct decisive-fact/unknown identification, completion, interactions, unsupported belief, preference | No material comprehension/effort improvement, or any increase in unsupported belief/material omission | Product | 2026-08-23 |
| H-GUI-02 | **HYPOTHESIS:** A strict ID-only composition plan contains prompt injection and always falls back safely. | Deterministic renderer; hostile Offering/provider corpus plus malformed model plans | Refusal/fallback rate, forbidden field/control/network reachability, semantic deep equality | Any injected instruction changes truth/action output, reaches an effect/network path, or leaves no complete fallback | Engineering | 2026-08-23 |
| H-GUI-03 | **HYPOTHESIS:** Registered compositions retain the deterministic renderer’s accessibility contract. | Phase 5 native table/`dl` renderer; every allowed generated layout and canonical state | Keyboard/focus, headings/regions, status announcements, 320 px, 400% zoom, reduced motion, bounded VoiceOver observation | Any P0/P1 accessibility regression or need for model-authored semantics/ARIA | Design | 2026-08-23 |
| H-GUI-04 | **HYPOTHESIS:** Optional composition can meet an acceptable latency/cost envelope without becoming a page dependency. | Deterministic server-rendered response; cold/warm composition calls | First meaningful deterministic paint, accepted-plan latency, fallback rate, tokens and cost per decision | Deterministic content waits on the model, or operational envelope is not founder-accepted before adoption | Engineering | 2026-08-23 |
| H-GUI-05 | **HYPOTHESIS:** The same semantic result supports an AE web renderer and a predeclared MCP Apps view without semantic drift. | Existing human loader and `POST /api/compare`; future MCP Apps adapter | Deep semantic equality, exact revision readback, non-UI fallback, accessibility observation in each host | Host requires a second comparator, private data, browser authority, or host-specific action semantics | Product | 2026-08-23 |

## Unknowns

- **UNKNOWN:** Whether real users understand or complete the Phase 5 decision
  faster with generative composition than with the designed deterministic
  table/fact view.
- **UNKNOWN:** Whether the Astryx component set can support two or three
  materially useful compositions without introducing new primitives or
  duplicated responsive semantics.
- **UNKNOWN:** The acceptable model latency, cost, cache lifetime, and fallback
  rate for a public anonymous decision surface.
- **UNKNOWN:** Whether generated explanations improve calibrated confidence or
  merely increase persuasive fluency.
- **UNKNOWN:** Which external agent hosts AE will actually support and whether
  their MCP Apps implementations provide consistent accessibility, persistence,
  CSP, and display-mode behavior.
- **UNKNOWN:** Whether A2UI v1 stabilizes at a point where interoperability value
  exceeds the cost of a second UI protocol for AE.
- **UNKNOWN:** The privacy/data-residency posture for sending Offering facts and
  customer priorities to a composition model.
- **UNKNOWN:** Whether a future execution surface needs dynamic composition at
  all; registered action-specific deterministic views may remain clearer and
  safer.

## Decision impact

### Phase 5

**FOUNDER DECISION:** Amend only the comparison contract, UI, eval and release
plans needed for an answer-first decision surface. Do not add A2UI/AG-UI, an
iframe host, arbitrary component generation, or model ownership of comparison
meaning.

Phase 5 must prove the public browse → detail → shortlist → answer-first compare
→ refresh/share loop, exact revision truth, native accessibility, zero-effect
behavior and human/agent semantic parity. GenUI is the primary human experience:
it adapts registered presentation to the question, category, and device over a
source-owned brief, decisive differences, and mandatory caveats. The full native
comparison remains one user-operated disclosure away. Invalid or unavailable
composition falls back without degrading the page.

Implementation requires:

1. a small `ComparisonPresentationV1` contract and registry;
2. semantic-invariance, injection, accessibility, value, latency/cost, and
   fallback evals;
3. a complete deterministic fallback renderer;
4. an ADR only if implementation changes the canonical persisted model,
   interoperability contract or dependency direction beyond this local
   presentation seam.

## Current-versus-target check

- **Current evidenced behavior:** No Phase 5 source/browser/hosted evidence and
  no generative composition capability. Existing source has other AI-assisted
  surfaces, but they do not prove this architecture.
- **Target behavior informed by this research:** First, a deterministic,
  exact-revision, accessible Offering decision loop. Later, optionally, a
  reversible and observable composition layer that can only select registered
  views of that semantic result.
- **Claims this research does not authorize:** generative UI adoption, improved
  customer decisions, accessible generated compositions, secure prompt
  containment, hosted MCP Apps/A2UI/AG-UI interoperability, production cost or
  latency, recommendation quality, execution safety, or customer value.

## Sources

All external sources below are primary specifications, official documentation,
or first-party source repositories.

- [Vercel AI SDK: Generative User Interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)
- [Vercel AI SDK: Streaming React Components](https://ai-sdk.dev/docs/ai-sdk-rsc/streaming-react-components)
- [Vercel AI SDK: Saving and Restoring RSC State](https://ai-sdk.dev/docs/ai-sdk-rsc/saving-and-restoring-states)
- [Vercel AI SDK: UI Message Persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)
- [Vercel AI SDK: Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [OpenAI Apps SDK: Build your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)
- [OpenAI Apps SDK: Managing State](https://developers.openai.com/apps-sdk/build/state-management)
- [OpenAI Apps SDK: Security and Privacy](https://developers.openai.com/apps-sdk/guides/security-privacy/)
- [OpenAI Apps SDK: UI Guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines)
- [OpenAI Apps SDK official examples](https://github.com/openai/openai-apps-sdk-examples)
- [MCP Apps stable specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [MCP Apps official SDK repository](https://github.com/modelcontextprotocol/ext-apps)
- [Google A2UI official repository](https://github.com/a2ui-project/a2ui)
- [AG-UI Events](https://docs.ag-ui.com/concepts/events)
- [AG-UI State](https://docs.ag-ui.com/concepts/state)
- [AG-UI Tools](https://docs.ag-ui.com/concepts/tools)
- [AG-UI and Generative UI Specifications](https://docs.ag-ui.com/concepts/generative-ui-specs)
- [CopilotKit official repository](https://github.com/CopilotKit/CopilotKit)
- [CopilotKit OpenGenerativeUI official repository](https://github.com/CopilotKit/OpenGenerativeUI)
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI: Understanding Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [WAI: Table Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/)
- [WAI: Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)
