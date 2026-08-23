# Wayfinder map — Build the Agentic Economy tool market foundation

Tracker: [GitHub map #196](https://github.com/CreasyBear/Agentic-Economy/issues/196)

Label: `wayfinder:map`
Rewritten: 2026-08-23 after the product prune and founder direction to make the market itself the product.

## Destination

Agentic Economy is the useful market and transaction layer where agents find,
compare, connect to, pay for, invoke, and recover third-party tools through one
stable interface.

The foundation is complete when:

- one explicit market capability can organize related supplier Operations
  without weakening the identity, schema, effects, authority, price, or version
  of any exact Operation;
- the public home and `/market` expose the same searchable supply to people,
  while machine discovery exposes the same admitted Operations to agents;
- buyers can compare exact price, readiness, authenticated rating, completed
  use, and measured latency without fabricated values or an opaque score;
- every listing continues into understandable detail and the surviving
  connect → inspect → invoke → status/recover gateway;
- suppliers can publish, update, withdraw, and earn through the same canonical
  publication and settlement records; and
- a hosted proof demonstrates independent supply, real use, durable recovery,
  and honest economic/evidence readback.

Specialist agent-mediated experiences come later. They are focused discovery,
composition, and workflow views over this same market and gateway—not new
catalogs, runtimes, or product spines.

## Product shape

The market has five surfaces and one shared transaction path:

1. **Catalogue** — anonymous, job-oriented search and category browsing.
2. **Operation detail** — outcome, supplier, exact parameters, price, examples,
   measured evidence, and a clear call action.
3. **Agent setup** — thin onboarding through the API, `llms.txt`, skill, and MCP.
4. **Supplier workspace** — publish and manage Operations, access, usage, money,
   and recovery without inventing a second domain model.
5. **Operator workspace** — health, exceptions, runs, and market administration.
6. **Call boundary** — authenticate, authorize, reserve, call, settle or release,
   record evidence, and replay idempotently.

## Operating rules

- **Execution is in scope.** The founder explicitly asked to clone familiar
  marketplace patterns and make them work, not merely produce a specification.
- Structural donor: Treg's "OpenRouter for agent tools" model—named inventory,
  literal search, capability groups, supplier comparisons, pay per call, one
  connection. Reuse the pattern, not its copy or provider-specific branches.
- The exact `Operation` remains the transaction and execution unit. A market
  capability is a discovery/comparison classification and never proof that two
  contracts are interchangeable.
- Project over the surviving Operation registry, publication, readiness,
  invocation, evidence, money, and recovery seams. Do not create a second
  catalog, analytics event pipeline, ledger, transport, or identity system.
- Human-facing copy uses familiar marketplace language such as tool, supplier,
  price, rating, calls, latency, and ready now. Technical references stay behind
  detail/inspection boundaries.
- UI work reuses shadcn and the consolidated AE product components. No bespoke
  primitive system, prestige theatre, terminal cosplay, ticker motion, or
  provider/vertical conditionals.
- Ratings, popularity, latency, settlement, Qualified Use, and x402 transfers
  remain distinct evidence classes. Missing evidence stays visibly missing.
- Agentic Market and other external indexes are sources and acquisition inputs,
  not authorities over AE delivery, identity, settlement, or native supply.
- Work uses `wayfinder` for decisions and `unlazy` gates for executable leaves.

## Decisions so far

- [Make `/market` a working capability marketplace front door](https://github.com/CreasyBear/Agentic-Economy/issues/207)
  — `/market` is the focused tool catalog over canonical Operation projections;
  exact detail links now work, while analytics remain a separate evidence contract.
- [Define normalized capability families without weakening exact contracts](https://github.com/CreasyBear/Agentic-Economy/issues/208)
  — the registry owns a curator-versioned browse taxonomy whose explicit
  memberships bind exact Operation references and never imply equivalence,
  routing, fallback, authority, price, or trust.
- [Cut over surviving product surfaces to the Treg-derived market system](https://github.com/CreasyBear/Agentic-Economy/issues/214)
  — the catalogue, detail, agent setup, supplier workspace, operator workspace,
  and conversation surfaces share one compact marketplace system. The cutover
  borrows proven information architecture and visual grammar, not Treg source.

## Next decisions

- The economic launch sequence after the foundation proof: fee schedule,
  supplier payout policy, currency/rail expansion, and when public market-wide
  amounts become defensible.
- The first specialist experience and the stable extension contract it needs
  from the market once the foundation is proven.
- Whether external observed services graduate into a claim/admission funnel or
  remain source-labelled links outside native search.

## Out of scope

- Restoring the pruned Customer Request, WorkTree, Study, Project Spine, or
  general Agent Engine as the product's organizing surface.
- A general crypto/DeFi dashboard, combined "total agent economy" number, or
  Agentic Market catalog clone inside native Operation results.
- Provider-name inference, fuzzy title grouping, fabricated ratings, default
  chain/currency/facilitator assumptions, or a single opaque quality score.
- AE-hosted provider runtimes, specialist vertical branches in the market core,
  and bespoke bilateral procurement workflows.
- Historical engine-first child tickets
  [Complete the Agent runtime rationalization prerequisite](https://github.com/CreasyBear/Agentic-Economy/issues/199)
  and
  [Prove the hosted registry-to-engine harness over heterogeneous operation schemas](https://github.com/CreasyBear/Agentic-Economy/issues/204),
  which were closed when this destination replaced the old map.
