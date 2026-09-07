# Wave 1 market boundary — cold refactor review

Target: HEAD `a51e17b22` (source cutover `3770b43ba`), reviewed against the current
Tool -> Quote -> Call boundary. Read `PRODUCT.md`, `CONTEXT.md`, the current
action/registry/chat/supply source and tests, and the refactor history. The
working tree contains unrelated dirty edits; none were attributed.

## Inspected boundaries

- `src/modules/actions/index.ts`: registered actions, anonymous MCP exposure,
  and deterministic MCP names.
- `src/modules/registry/{tool-action-contracts.ts,tools.actions.ts,tool-choice-contracts.ts}`,
  `src/modules/capability-supply/{tool-source.ts,internal/tool-search.ts,tool-health.ts}`:
  Tool read input, source search, health projection, filtering and pagination.
- `src/routes/api.v1.market-tools.{list,search}.ts`, `src/routes/for-providers.tsx`,
  `src/lib/server/supply-landing.functions.ts`, and the provider/chat UI.
- `tests/unit/capability-supply/supply-landing-authority.test.ts`,
  `tests/unit/actions/registry.test.ts`, `tests/unit/market-terminal/cold-loop.test.ts`,
  `tests/deploy-smoke/chat-browser-staging.spec.ts`, and
  `tests/e2e/authenticated/multi-agent-lifecycle.spec.ts`.

## Confirmed findings

### MKT-1 — Provider landing always reports public inspection actions unavailable

Severity: P2. Confidence: 10/10. Introduced by the Tool vocabulary cutover;
the landing adapter itself was unchanged while its action producers changed.

Motivating code:

- `src/lib/server/supply-landing.functions.ts:9-15` calls
  `listMcpActions()`, keeps read-only credential-free entries, then requires
  `action.id.startsWith('registry.operations.')`.
- `src/modules/actions/index.ts:71-76` registers the four current market reads
  as `registry.tools.list/search/describe/compare`; lines 126-129 expose them
  on the anonymous MCP surface.
- `src/routes/for-providers.tsx:7-30` feeds that server result to
  `AeSupplyLanding`; `src/components/ae/supply/AeSupplyAgentProof.tsx:39-42`
  renders “AE public inspection actions are temporarily unavailable” when the
  filtered array is empty.

Trigger and impact: a normal GET navigation to `/for-providers` runs the
loader. The current MCP actions are all rejected by the retired prefix, so the
public provider page omits the agent inspection proof and displays an outage
message even when the market reads are registered and available.

Evidence: the focused existing test passes while asserting the retired contract:
`tests/unit/capability-supply/supply-landing-authority.test.ts:12-22` mocks
`registry.operations.search`, and lines 31-46 expect that same ID. It therefore
cannot detect the production action-list mismatch.

Correction direction: select the current public Tool market reads from the
registered action set (or the existing market-read predicate), then update the
fixture/assertion to current IDs and add a real current-action assertion.
Counterevidence considered: `registry.operations.*` is intentionally absent
from `listActions()` and the current chat/MCP tests assert
`registry.tools.*`; the old prefix is not a supported compatibility alias.

### MKT-2 — Public healthStatus filters are applied after paging

Severity: P2. Confidence: 10/10. Pre-existing in the earlier Operations
implementation and inherited by the current Tool API; still an active boundary
defect because the current public schema advertises `healthStatus`.

Motivating code:

- `src/modules/registry/tool-choice-contracts.ts:29-37` accepts
  `filters.healthStatus` and lines 202-212 choose the requested statuses (or
  default to `operational`) only in the facade's `visibleTools` post-filter.
- `src/modules/registry/tools.actions.ts:21-39` declares
  `healthStatus` in the input shape but omits it while constructing the
  lower-level `ToolSearchFilters`; lines 44-63 pass the result to
  `readCapabilityToolSearch`.
- `src/modules/capability-supply/internal/tool-search.ts:257-284` ranks and
  slices the source match set before the facade filters it. The source itself
  computes matches/pagination at lines 290-322.
- `src/modules/registry/tool-choice-contracts.ts:220-226` and 230-255 retain
  the source pagination while replacing `count/items`; line 244 always emits
  “No operational Tools matched this search.”

Trigger and impact: POST `/api/v1/market-tools/list` or `/search` with
`filters: { healthStatus: ['degraded'] }` (or with no health filter, where
operational is the facade default) can page over a degraded/unverified first
item and an operational/matching item later. The returned page can be empty or
have a reduced count while `pagination.hasMore` and `nextCursor` describe
the unfiltered page; a degraded-only no-result says “No operational Tools”.
This can hide matching supply and make the next request skip or misreport it.

Correction direction: apply an equivalent health predicate to the complete
candidate set before ranking/slicing, and derive count, cursor, hasMore and
no-result text from that filtered set. Preserve one stable request-time health
projection.

Counterevidence considered: lower-level `ToolSearchFilters` intentionally has
availability posture fields and source matching is otherwise pre-page
(`internal/tool-search.ts:260-269`); that does not make the advertised
healthStatus filter equivalent. Blame/history shows the same omission and
post-filter in `operations.actions.ts` and `operation-choice-contracts.ts`
before `3770b43ba`.

### MKT-3 — Chat release verification still calls retired market action and DOM contracts

Severity: P2. Confidence: 10/10. Missed cutover propagation in release/E2E
verification; production chat now uses current Tool IDs and markup.

Motivating code:

- `tests/deploy-smoke/chat-browser-staging.spec.ts:65` prompts
  `registry.operations.search`; lines 77-83 and 109-115 query
  `data-operation-tool="registry.operations.search"` and
  `data-operation-tool="operation.invoke"`.
- `src/modules/chat/tool-card.ts:29-36` accepts current IDs
  `registry.tools.*`, `tool.quote`, and `tool.call`; lines 648-688 project
  current Tool cards.
- `src/components/ae/chat/ToolCard.tsx:234-238` renders
  `data-tool-card={projection.toolId}`, with no `data-operation-tool`
  attribute. The current MCP name is `ae_registry_tools_search` via
  `src/modules/actions/index.ts:137-149`.
- `tests/e2e/authenticated/multi-agent-lifecycle.spec.ts:407-418` calls
  `ae_registry_operations_search` through the official MCP client; line 168
  invokes this helper in the configured authenticated lifecycle test.

Trigger and impact: the staging browser smoke reaches the current chat but
cannot locate the rendered search card, and the configured authenticated E2E
gets an MCP tool error for the retired name before it can assert public search.
These checks can fail on every current deployment or, worse, leave the release
without coverage of the current Tool chat path.

Correction direction: use the current prompt/action and MCP names, select
`data-tool-card` with the current ID, and retain the assertion that no
side-effecting `tool.call` card is present. Keep the smoke assertions focused
on the current Tool -> Quote -> Call vocabulary.

Counterevidence considered: the stale selectors were already present in the
pre-cutover smoke test, but current `tool-card.ts`, MCP registry tests, and
chat tests consistently establish the new IDs/attribute. The old values are
not external protocol names in these test callers.

## Verification gaps and outside-boundary lead

- Node/npm startup pins were verified as Node `v22.22.0` and npm `11.5.1`.
- The focused supply-landing test was run with the pinned runtime and passed;
  its stale mock is part of MKT-1's masking evidence. No broad test suite,
  compiler, deployment, or live staging environment was run.
- Outside this market review, `src/modules/money/funding-handoff.actions.ts:184-198`
  still declares `safeContinuations: ['operation.invoke']` for the current
  `funding.handoff.status`. This is an unverified money/execution lead for a
  later boundary review, not counted above.

