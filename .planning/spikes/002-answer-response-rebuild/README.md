# 002 — Answer response rebuild spike

## Verdict

Build a decision-first answer planner. Do not add a new chat framework or dynamic UI renderer. Keep `/api/answer/turn`, the thread store, `registry.search`/`registry.detail`, provider cards, the answer gate, and the existing SSE reducer. Cut the retrieval-first branch and budget generated UI by response mode.

## Problem

The current answer path searches first and decides later. A normal `refine_search` turn runs `registry.search` with a broad default limit before the system decides whether the request is specific enough. If that search returns providers, the turn becomes a completed provider-bearing answer. Broad prompts such as `businesses in Perth` therefore dump a catalogue slice instead of asking for the missing service need.

The artifact builder then compounds the problem: any provider-bearing `discovery_full` snapshot can produce provider cards, map/service-area instruments, published-details rails, tradeoff lists, action menus, checklists, and message starters.

## Subagent designs synthesized

- `PlannerInterface`: one deep response-planner seam; orchestrator becomes transport + persistence.
- `ToolPromptPolicy`: deterministic preflight before tools; broad queries clarify; only specific service/place queries search.
- `UiArtifactBudget`: generated UI is response-mode-specific; broad clarify gets no provider cards.
- `StreamPersistence`: plan once, stream from that plan, persist that same plan, replay from persisted plan.
- `EvalDesign`: evals must assert mode, tool policy, provider budget, artifact budget, stream order, and replay parity.
- `CutoverPlan`: smallest rebuild is planner + clarification + artifact budget + stale `/api/chat` demotion/deletion.

## Chosen design

### New response modes

```ts
type AnswerResponseMode =
  | 'clarify'
  | 'direct_search'
  | 'agent_search'
  | 'frozen_filter'
  | 'frozen_compare'
  | 'boundary_explain'
  | 'unsupported'
```

### Planner seam

```ts
planAnswerTurn({
  query,
  searchContext,
  priorTurnCount,
  priorProviders,
  priorAllowedSlugs,
}): AnswerResponsePlan
```

The planner owns:

- broad vs specific query policy
- zero-tool clarification
- direct-search eligibility
- agent-search eligibility for explicit typo/tool recovery
- frozen compare/filter routing
- provider display caps
- response layout profile
- artifact budget

The orchestrator owns:

- access/session/thread ids
- SSE sequencing
- work-step forwarding
- tool execution for planned reads
- persistence before `complete`

## Response policy

### Clarify without tools

Clarify when the request is too broad or missing a key slot:

- place but no service: `businesses in Perth`, `providers near Brunswick`
- generic local request: `services near me`, `local businesses`
- service but no explicit place and no active `near_me` context: `I need a plumber`
- compare/filter ask without enough frozen prior providers

Clarification output is text-only:

```text
What kind of service do you need in Perth?
I can compare listed businesses once I know the service and area that matter.
What to do now: Ask for a service type, for example “emergency plumber in Perth”.
```

No provider cards. No map. No registry search by default.

### Search once when earned

Search when the query contains a service/job signal plus an explicit place or active location context.

- `emergency plumber Parramatta` → direct search
- `emergency plumber` with `near_me` Perth context → direct search scoped to Perth
- misspelled service+place like `paramata emergency plumber` → agent search may choose corrected tool args

Visible providers should be capped; the first viewport should show fit, not a provider wall.

### Frozen evidence for follow-ups

Follow-ups such as `which take inquiries?` and `compare the top two` use the latest frozen provider evidence. They do not run a new registry search unless the user asks a new specific search.

### Boundary turns

Booking/payment/dispatch/autonomy asks use deterministic boundary copy and no tools.

## Artifact budget

Allowed v1 artifacts for new turns:

- `one-line`
- `provider-cards`
- `location-map` when query-specific and location-shaped
- `prose`
- `what-to-do-now`

Default-off or deletion candidates:

- `published-details-rail`
- `provider-tradeoff-list`
- `next-step-menu`
- `confirmation-checklist`
- `message-starter`
- `route-perspective`
- per-turn `agent-json` / `protected-by-ae`

Comparison and richer generated UI can return later behind an explicit response mode and eval coverage. Do not ship them by provider count.

## Stream and replay contract

Ideal follow-up implementation adds an early `response-plan` event and persists `artifactPlan` in `evidenceJson`. Minimum implementation for this rebuild: ensure the snapshot carries an explicit layout profile and `buildArtifactsFromSnapshot` is budgeted by that profile, so live stream and replay agree.

Provider-bearing complete turns must remain fail-closed: no terminal `complete` unless the turn row and matching tool-call evidence are accepted.

## Eval acceptance

New cases must fail the old system:

- `turn-clarify-broad-perth-businesses`: `businesses in Perth` → complete clarification, zero providers, zero registry searches, no provider-card artifacts.
- `turn-clarify-service-missing-place`: `I need a plumber` without active place → clarification, zero tools.
- `thread-clarify-then-direct-perth-plumber`: broad clarify first, specific follow-up searches Perth and returns the expected provider.
- `turn-direct-parramatta-fast-path`: known good direct retrieval still works.
- `turn-paramata-visible-recovery` / replacement: typo recovery remains visible only when a service need exists.
- `turn-unsupported-booking-boundary`: no tools, boundary copy.

Evaluator needs fields for:

- expected response mode
- max provider count
- max source-event provider count
- forbidden artifact kinds
- max tool calls
- model allowed/forbidden
- stream partial order
- replay parity

## Implementation slices

1. Add planner seam and clarification profile.
2. Route broad queries to clarification before registry search.
3. Cap answer search limit/provider display and budget `buildArtifactsFromSnapshot`.
4. Update prompt/tool policy so model guidance is decision-first, not “always search”.
5. Add eval/test cases for broad clarification and artifact budgets.
6. Tighten persistence inserted-tool-call count for provider-bearing complete turns.
7. Delete/demote stale `/api/chat` and dead generated UI branches after tests pass.

## Risks

- The worktree is already heavily modified by parallel user work. Edit only targeted answer/chat files and do not chase unrelated failures.
- Old tests encode retrieval-first behavior; update them with product intent, not by preserving stale assertions.
- Clarification must not become a defensive lecture. Ask one useful question and show the next usable query.
- Do not move ambiguity policy into Convex registry search. Registry stays literal; answer planner decides chat behavior.
