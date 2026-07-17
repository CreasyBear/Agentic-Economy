# ADR-010 inverse premortem: what had to be true for the experience to feel magical?

**Owner:** Product and Engineering
**Status:** Active
**Maturity:** Target research
**Question:** If AE's conversational, generative human experience succeeded without fragmenting the agent platform, what conditions made that possible?
**Decision affected:** Proposed ADR-010
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

## Executive finding

Assume the product succeeded.

A person described an outcome in ordinary language. AE gathered useful
information without interrogating them, generated the right comparison or
decision surface, paused at consequential choices, preserved the work after the
session ended, and allowed an external agent to reach the same truthful result.
The experience felt anticipatory without becoming presumptuous.

That success did not come from a more persuasive chatbot. It came from six
conditions:

1. the embedded AE agent and external agents used the same registered actions;
2. conversation and generated UI projected authoritative AE work rather than
   owning competing state;
3. the agent asked only for information that materially changed suitability,
   authority, cost, privacy or recovery;
4. generated interfaces were bounded by supported action and decision
   semantics;
5. consequential actions required explicit, scoped authority;
6. parity was measured by outcome and meaning rather than identical pixels.

This supports a narrow ADR. It does not justify a new work schema, arbitrary
interface generation, background autonomy or a universal cross-channel handoff
protocol.

## The successful future, viewed backwards

### The human felt understood rather than processed

The person could begin with a complete outcome, one immediate task or work
already completed elsewhere. The agent translated ordinary language into
constraints, gathered readily available information and showed its current
understanding in a stable workspace.

It did not force the person through every possible question. It interrupted
only when the answer could change the choice, disclosure, commitment or
recovery. Corrections updated authoritative work state rather than merely
changing the model's conversational memory.

What had to be true:

- the current objective and constraints remained visible;
- known, inferred, stale and missing information were distinguishable;
- every generated view explained what AE relied upon;
- the person could correct the work without restarting;
- the interface showed what required attention, not everything the agent did.

### The interface changed shape without changing truth

Search became a candidate comparison. Missing information became a small,
specific clarification. A consequential step became an approval view. Active
work became progress and ownership. Failure became a recovery choice.

The model did not invent arbitrary controls. It selected and populated bounded
views whose actions, consequences and valid continuations came from registered
AE contracts. A host unable to render the rich view received the same semantic
content and available decisions.

What had to be true:

- UI-local state, conversational context and authoritative work state were
  explicitly separated;
- every control mapped to a supported action or source-owned state transition;
- stale views could not submit authority against changed work;
- accessibility, mobile, voice and prose fallbacks retained the same meaning;
- a refresh reconstructed the view from authoritative records.

### The agent was proactive but did not seize the project

AE searched, checked, compared, simulated and prepared within the person's
stated objective and existing authority. It proposed useful next work and could
show how several tasks composed into a larger route.

It did not silently expand the objective, relax constraints, select optional
work or infer permission for a later action. The route remained a non-binding
possibility until each consequential decision was approved.

What had to be true:

- gathering and preparation were separated from external effects;
- suggestions were traceable to a stated constraint, current business
  information, a real dependency or a discovered problem;
- approval bound one exact action, inputs, target, consequence and freshness
  window;
- approval for one task did not authorize later tasks or fallback branches;
- uncertain external effects reconciled before retry.

### Human and external-agent experiences stayed coherent

The first-party AE agent had richer conversation and generated UI, while an
external agent used structured calls. Both saw the same business facts,
available actions, missing-information requirements, authority boundaries,
attempts, evidence, uncertainty and safe next steps.

They did not require the same presentation. They did require the same outcome
semantics. A task supported only in the first-party host was described as such
rather than falsely advertised as cross-surface parity.

What had to be true:

- action meaning lived outside the conversation host;
- host adapters did not duplicate eligibility, recommendation, authority or
  recovery rules;
- rich UI had a complete semantic fallback;
- parity evals covered interruption, approval, error, retry and resume, not just
  happy-path search;
- host limitations were explicit.

### Work survived the session without creating another platform

Closing a tab did not erase the objective, evidence, attempts or unresolved
state. A later session could reconstruct what happened from AE records rather
than replaying the transcript.

For a broader outcome, Customer Request remained canonical. A bounded task used
its truthful action and result lineage without a synthetic Request. Transfers
and phone continuity could be added later under scoped access, but ADR-010 did
not require a speculative universal handoff object.

What had to be true:

- the transcript was an interaction record, not the sole product database;
- every durable state change came through a source-owned transition;
- a cold caller could identify the current result and allowed continuation;
- stale facts and expired authority were refreshed before use;
- unsupported continuation returned control honestly.

### Providers and operators did not absorb the hidden cost

The experience felt effortless to the person because AE gathered structured
information and formed better requests—not because businesses or AE operators
performed invisible manual coordination at equal or greater cost.

What had to be true:

- onboarded businesses could understand and maintain the information and
  actions they exposed;
- requests arrived with the inputs businesses actually needed;
- refusal, timeout and human handling were first-class outcomes;
- backstage operator work was measured;
- the product narrowed when provider participation did not support the promised
  experience.

## Inverse findings by review lens

| Lens | Success condition | What would have looked successful but was not |
|---|---|---|
| CEO | A bounded task created value, and progressive composition increased repeat use without demanding full-project adoption | An impressive agent demo with no provider participation, customer saving or operating leverage |
| Product | The person understood the outcome, current state, material decisions and next owner | A conversational project manager that made the person supervise every tool call |
| Design | The interface generated the right stable work product for the moment and survived refresh, mobile and accessibility needs | Arbitrary model-generated UI, a transcript full of cards, or a fixed dashboard pretending every task was the same |
| Engineering | One action and trust implementation served first-party and external hosts; Customer Request composed rather than duplicated it | Separate human and machine state machines joined by reconciliation code |
| Agent | A cold caller could gather missing information, invoke the action and continue safely from structured state | Tool parity on the happy path but missing approval, interruption or recovery parity |
| Security | Read, preparation and consequential effects had distinct authority; stale or uncertain effects failed safely | A persuasive confirmation message standing in for scoped authority |
| Schema | Authoritative state had clear ownership and projections remained disposable | A universal task object accumulating optional fields for every generated view |
| Provider | Better-formed work reduced clarification and preserved business control | Customer convenience created an AE-operated concierge or another provider inbox |

## Acceptance evidence for ADR-010

ADR-010 should remain proposed until evals show:

- the same registered action produces semantically equivalent results through
  the embedded AE agent and one external-agent surface;
- a task-shaped view can be reconstructed from authoritative state without the
  transcript;
- prose-only or voice fallback communicates the same options, consequences and
  continuation;
- missing information is gathered without asking immaterial questions;
- approval is bound to the exact consequential action and cannot be replayed
  after material change;
- interruption, refusal, timeout, uncertain effect and recovery retain parity;
- a cold agent can resume without hidden first-party context;
- the human experience reduces effort without increasing errors or operator
  burden.

## Decision impact

Write ADR-010 narrowly around one action plane, authoritative work state,
bounded task-shaped projections and semantic outcome parity. Keep cross-channel
handoff, background continuation, arbitrary generative UI and shared schema
design outside the decision until evals make them necessary.

## Current-versus-target check

- **Current evidenced behavior:** AE currently shares registered public search,
  detail and qualified-inquiry actions across supported human and machine
  surfaces, and exposes the exact authenticated Customer Request states proven
  through its agent API.
- **Target behavior informed by this review:** AE's embedded agent and external
  agents use the same supported actions and authoritative records while the
  first-party experience adds conversational clarification and bounded,
  task-shaped projections.
- **Claims this review does not authorize:** AE does not currently provide the
  described generative workspace, cross-surface outcome parity, booking,
  payment, dispatch, fulfilment or universal session transfer.

## Sources

- [Conversational agentic workspace patterns](./2026-07-17-conversational-agentic-workspace-patterns.md)
- [ADR-009 partial-entry premortem](./2026-07-17-partial-entry-premortem.md)
- [Business capabilities to composable work](./2026-07-17-capability-to-composable-work-crosswalk.md)
