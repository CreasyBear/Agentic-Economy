# Seamless agent connection

Label: wayfinder:map

## Destination

Implement and validate one Agentic Economy feature that makes connecting an external agent as familiar and seamless as the strongest Nevermined, Locus, and Whop examples. The feature ends in two explicit states: **Ready to browse** after transport verification and **Ready to buy** after owner-approved authority.

## Notes

- Joel has authorized this map to continue through implementation after the reference journey, prototype and public TDD seams are confirmed.
- Use `wayfinder`, `forward-implementation-first`, and `tdd` throughout.
- Familiar reference behavior comes first. AE should not invent a new onboarding ceremony where an established SDK, OAuth, device-flow, MCP, CLI, UI, or verification pattern can be reused.
- Reuse the current AE OAuth/device flow, agent directory, CLI distribution, MCP endpoint, public market reads, credential lifecycle, and existing UI primitives before adding code.
- Do not change Operation, Commitment, Invocation, payment, settlement, or commercial-closure semantics merely to simplify onboarding.
- Tests must be black-box at user-visible seams agreed with Joel before test writing. Work vertically: one failing behavior test, minimal implementation, then the next behavior.
- Forward implementation first: plan working user behavior and focused validation; do not add planning gates, hashes, receipts, dashboards, or progress machinery that are not part of the feature.

## Decisions so far

- [Define connected as two-stage readiness](issues/01-define-connected.md) — A verified transport is **Ready to browse**; owner-approved purchasing authority advances it to **Ready to buy**.
- [Map Nevermined's connection model](issues/02-nevermined-connection-model.md) — Nevermined uses an orthogonal staircase from public discovery through identity, credential, funding, immutable Delegation, call permission and settlement; its strength is state separation, while the user must still mentally assemble paid readiness.
- [Contrast Locus and Whop connection models](issues/03-locus-whop-connection-models.md) — Both establish a familiar public-read → install → verify → authorize → execute-ready → recover sequence; Locus makes Agent Connection/readiness most coherent, while Whop supplies the strongest maintained SDK, CLI, OpenAPI and hosted-action ecosystem.
- [Map AE's reusable connection primitives and current friction](issues/04-ae-reuse-and-friction-map.md) — AE already has the standards and lifecycle machinery; hostility comes from duplicated setup contracts, two MCP-registration paths, incomplete harness verification, non-resumable CLI polling and disconnected owner/local readback.
- [Select the reference-aligned connection journey](issues/05-select-reference-journey.md) — Use Locus as the staged interaction model, Whop for familiar maintained packaging and Nevermined for orthogonal readiness; compose AE's existing standards and canonical identity rather than create a new connection system.
- [Decide the duplicate MCP path disposition](issues/09-retire-duplicate-mcp-path.md) — Remove `ae connect --mcp` and its generic bearer-file path; pinned client-specific `add-mcp` exclusively owns MCP setup, while `ae connect` exclusively owns purchasing authorization.
- [Prototype the familiar connection workbench](issues/06-prototype-connection-workbench.md) — Use a one-action A for first connection and transition into C as the durable record; native client installation or agent handoff is primary, raw commands are recovery, and purchase authority stays out of onboarding.
- [Confirm the public TDD seams](issues/07-confirm-tdd-seams.md) — Prove one Account-free harness handoff, official anonymous MCP browse readiness, just-in-time owner authorization without Invocation, canonical buy readiness, and identity-preserving recovery through public boundaries.

## Not yet specified

- The exact visual composition and progressive-disclosure treatment should follow the selected reference journey; it is premature before the reference contrast is resolved.
- The final success metric and instrumentation should be chosen after the reference journey and current AE friction are mapped.
- Any SDK-shaped helper required by the chosen connection flow must be separated from a broader AE SDK programme.

## Out of scope

- Changes to the canonical Operation purchase chain, commercial roles, payment rails, settlement model, or commercial closure.
- General platform-maturity work unrelated to connecting and verifying an external agent.
- Building proprietary OAuth, MCP, code-block, polling, QR, secret-storage, or SDK-generation infrastructure when a maintained dependency or existing AE primitive already satisfies the selected behavior.
