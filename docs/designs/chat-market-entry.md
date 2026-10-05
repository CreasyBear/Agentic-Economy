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

Restrict the guest search shortcut to the initial discovery turn. Carry at most four bounded public Tool
titles and references as untrusted lookup hints in the existing guest transcript;
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

## Acceptance boundary

Hosted guest and signed-in search, follow-up detail and immediate card comparison
were verified after PR #359. Current and legacy MCP and the downloadable CLI were
also checked. The [deployment map](../operations/deployments.md) records source
provenance; the separate paid chat journey remains open in [TODOS.md](../../TODOS.md).
