# Chat market entry

**Status:** maintained contract · **Verified release:** 5 October 2026, PR #359

Chat is a thin natural-language entrance to the same Tool market and controlled
purchase plane. The [original RFC](../archive/2026-10-05/designs/2026-09-23-generative-commerce-chat-rfc.md)
retains broader proposals for bundles and output comparison; those proposals are
not activated by the bounded repair below.

## Discovery, comparison and recovery

**Contract.** Requires bounded messages and validated catalogue outputs. Ensures
failed guest sends keep the exact question and permit an explicit, single-flight
retry; partial answers remain visible and are reported as interrupted. Invariant:
guest discovery cannot obtain a Quote or dispatch a Call, and signed-in uncertain
paid effects remain fenced against replay. On violation, show a recoverable chat
failure and its support reference; preserve the existing transcript.

**Cognitive load.** Four options previously competed through twelve card actions,
a duplicate four-link Sources list and fake filter controls. A buyer had to
remember descriptions from the prose while choosing a differently ordered card.
Keep descriptions, indicative AUD price and readiness together in compact rows.
Each callable Tool has one primary Review inputs action plus optional comparison;
its title retains the detail link. Remove the duplicate Sources list when cards
already contain those links, and remove controls that do not apply real filters.
Describe results also render their Tool card. Search and list retrieval stay within
the four-card display bound so continuation cannot skip unseen results. Selecting
two to four cards compares their reported facts immediately without another model
request. A malformed model response containing control syntax is not a completed
answer: preserve actual Tool evidence, replace the invalid prose and settle the
turn through existing failure recovery when no usable evidence remains.

Use the installed Convex Agent tool loop for initial discovery and follow-ups.
Carry at most four bounded Tool or external listing titles and references as
untrusted lookup hints in the existing guest transcript;
fresh detail reads remain authoritative, and persisted display prose stays clean.
Write one explanation after the cards, including when the model falls back to
catalogue facts. Signed-in history already retains its Tool context. All final
answer instructions must agree that cards own the catalogue and comparison table.
Chat has no pagination. A reply must provide
a supported recommendation, explain that the returned evidence is insufficient,
or ask for a useful refinement. Existing and legacy cursors render no chat action;
empty scoped results do not claim to be matches or a complete market census.
Broader catalogue browsing stays in the Market. Public API pagination and saved
continuation ownership remain compatible; the chat affordance and generated instructions remain absent. Recovery and purchase fences
remain unchanged. This subtracts a browsing decision without adding structure.

**Cost and decision.** Reuse Arc cards, existing projections, Convex Agent and the
current retry fence. No new component framework, storage table or payment path.
Add only a bounded optional summary to the existing card projection. Keep exact
price projection, external-listing distinction, input validation and approval
controls. Verify transport rejection, partial stream, retry concurrency, detail
cards, responsive layout and the hosted guest and signed-in journeys.

## Native loop repair

**Design thesis.** Chat helps a person inspect and use the same market evidence
through one bounded agent loop, with actions that follow the current facts.

**Contract.** Requires validated messages, Tool results and current purchase
authority. Ensures that a selected-card detail request reads its exact reference,
later detail governs current card actions, and every offered action has a handler.
An external listing reference is an untrusted lookup hint; inspection does not
resolve or admit supply. Grounded explanatory follow-ups may answer without a new
read; selected detail and missing current facts require a read. Invariant: guests
cannot Quote or Call, the four-option bound and no-pagination rule remain, and
the existing tool, search, step and single Call-or-Plan budgets still apply.
On violation, preserve completed facts and the transcript, surface the existing
typed refusal or recovery state, and keep uncertain purchases fenced from replay.

**Shape.** Keep `streamDurableChatResponse` and `streamAnonymousChatResponse` as
the existing persistence and transport adapters. Both use `Agent.streamText`,
native `prepareStep`, and the installed tool-output facilities. Remove ordinary
first-turn immediate retrieval and its separate tool-less explanation. The final
narration pass still closes tools. Reuse the existing card projection for bounded
current choices and action eligibility in both model context and rendering.
Carry selected detail identity through the existing text transport using an exact
bounded request convention; validate reference equality when the read executes.
Free-form questions remain the model's responsibility, without a keyword router.
External details use the existing directory query and a chat-private projection;
canonical public describe contracts and purchase resolution remain unchanged.

**Synthesis and cost.** Two alternatives were assessed against evidence/action
correctness, SDK reuse, bounded recovery, interface size and observable test seams.
The native-loop design is the base. The independent review scored it 20/25 and
the deterministic-seed alternative 17/25. A raw-prompt seed spends one of two
searches before semantic interpretation, adds provisional fact state, and needs
separate budget accounting. A model-generated seed loses its latency advantage.
Remove that branch; retain its useful completed-facts fallback. Keep invocation
state local and let selected detail take precedence over broad search evidence.
Add only the exact selection convention, a bounded external read projection, and
a shared pure choice/action projection with real model and UI callers. Reuse
existing context fields; do not add a session controller or another fact store.
The tradeoff is a model planning step before discovery, within existing deadlines.

**Design review.** The agent reviewed this design without a human interview.
Conceptual integrity is strong: each change connects requests, returned evidence
and available actions. Installed SDKs, existing transports and purchase fences
constrain the scope. Remove lexical query heuristics, duplicate first-turn
orchestration and unconditional successful-search prose replacement. The main
risks are model latency, free-form detail selection and completed-fact recovery;
verify these through the actual owner and guest surfaces after local tests.

**Failure strategy.** Model timeout, invalid model output and unavailable reads
are recoverable at the stream/read boundary. Chat provides a basic guarantee:
completed facts can remain, but no unproven completion or automatic purchase
retry is inferred. Cancellation terminates generation and must not save a new
completed answer. Broken internal invariants fail the turn through existing
diagnostics rather than becoming a successful catalogue response. Reference
validation is read-only and changes no market state on failure.

**Reference implementation.** Use the pinned [Convex Agent streaming example](https://github.com/get-convex/agent/blob/v0.7.1/example/convex/chat/streaming.ts)
for prompt identity, scheduled generation and durable deltas, and the official
[AI SDK loop-control guide](https://ai-sdk.dev/docs/agents/loop-control) for bounded
steps and tool selection. Installed signatures take precedence where live guides
differ. No framework replacement or new dependency is required.

**Verification plan.** Committed red tests reproduce unavailable-action narration,
lost guest external identity and stale detail precedence in both readiness
directions. Extend the existing harnesses for the ordinary first-turn loop,
exact selected-reference enforcement, external reads without resolution, prior
grounding, absent callbacks, failure after detail, cancellation and budget
exhaustion. Re-run existing purchase/retry/concurrency guarantees. Hosted model
judgment and the paid chat journey remain unverified until exercised after repair.

## Acceptance boundary

Hosted guest and signed-in search, follow-up detail and immediate card comparison
were verified after PR #359. Current and legacy MCP and the downloadable CLI were
also checked. The [deployment map](../operations/deployments.md) records source
provenance; the separate paid chat journey remains open in [TODOS.md](../../TODOS.md).
