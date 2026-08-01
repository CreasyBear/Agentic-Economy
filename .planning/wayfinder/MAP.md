# Wayfinder map — AE parity with agentic.market

Label: `wayfinder:map` (local-markdown tracker fallback; `gh` token is invalid — see ticket T1).
Charted: 2026-07-29 against `main` @ `b1b105b1` (dirty tree).

## Destination

**Redrawn 2026-07-30 v2 (founder grilling session):** Agentic Economy is the platform through which businesses earn agent revenue — what flysoar built for itself, productised for any business. Businesses list agent-callable services free and set a per-call price (free tier allowed); agent operators pay per call from prepaid account credit; AE takes a rake on paid calls only. Wedge: API-native businesses first — they show the marketplace works; self-serve onboarding builds the model; no-API locals (AE-operated endpoints, T10) are the fast-follow. Surfaces: a dedicated supply landing carries the offer ("list your API free, agents pay your price, you keep X%"); `/` is the demand-side offer (try the ask live → install in your own assistant). The flywheel must be grounded in documented patterns (Cold Start Problem, marketplace liquidity canon, Apify/OpenRouter/Shopify documented loops), never invented. The keyless cold-agent floor stands (7/7 parity; reads stay free as distribution).

**Superseded from v1 (T8):** "claim funnel = revenue funnel" and "driver ICP = no-API local SMBs". The claim funnel is now a supply channel; no-API locals remain the differentiated fast-follow, not the wedge.

## Notes

- Skills every session must consult: `wayfinder`. The `ae-*` skills were **retired 2026-08-01** (founder: they handicapped the build); their rules live in this map, `PROJECT.md`, `BRAND.md`, and the verdict docs.
- Standing preference: do not overcomplicate. Projection over new stores. One semantic supply object across human and agent hosts.
- Ground-truth harness: `eval/parity/check-parity.mjs` (autoresearch-style loop in `eval/parity/program.md`). The harness is not modified to make scores improve.
- Evidence classes never silently upgrade: sandbox callability is labelled `ae_sandbox_provider`; it proves the contract, not real supply.

## Decisions so far

- [Services IA](tickets/T0-services-ia.md) — Parity is served by a flat per-offering projection (`/api/v1/services`, `/api/v1/services/search`) derived from the existing V2 business catalog; no new tables, no second catalog store.
- [Callable endpoint source of truth](tickets/T0-services-ia.md) — Sandbox checkup-quote callability is driven by the offering's own `external_operation` access path + fixed price, not a hardcoded slug map.
- [Real-supply path](tickets/T4-real-supply-onboarding.md) — Resolved by research: first independent provider goes catalog Offering + `external_operation` path → capability-supply promotion (ADR-026 lineage); only new machinery is a no-credential adapter sentinel; claim ceiling is "published, last checked reachable".
- One-feature product — `/` is THE view: the human twin of `/api/v1/services` (search → priced service rows → instant sandbox quote), loader uses the same `projectPublicServicesPage` projection as the API. `/registry`, `/about`, `/help` 301 to `/`. Decided 2026-07-30 under founder directive. **Amended 2026-08-01:** `/for-agents` no longer 301s — `BRAND.md` (LOCKED, later) makes it the Door 2 landing, and `discovery-files.ts` already advertises it in the sitemap and `llms.txt`, so the 301 was serving a redirect for a surface AE tells agents to read. `/registry` still 301s while eight UI callsites label it "Browse services"; relabel or build, but do not keep promising a browse view.
- Parity evidence — autoresearch loop `eval/parity/` reached 7/7 against the agentic.market baseline contract on the local labelled deployment (results.tsv: 2/7 → 6/7 → 7/7). Evidence class: labelled local/dev; no hosted or real-supply claim follows.
- [ICP & positioning](tickets/T8-icp-positioning.md) — Resolved by founder: agent SEO for local businesses; the directory wall is the enemy; `/` = owner-first hero + ask-box answer engine (top 1–3 answers); rider distribution is machine surfaces, not a browse site; copy reader-first with concrete outcomes.
- [MCP host](tickets/T6-mcp-host-adapter.md) — Resolved 2026-07-30: Streamable HTTP `/mcp` over the action registry; anonymous tier = `surfaces:['mcp'] && readOnly` (4 tools, `ae_*` deterministic names); `sandbox.checkup_quote` registered; install one-liners in `/SKILL.md` + `/llms.txt`. Evidence: labelled local/dev smoke.
- [Keyless sentinel](tickets/T5-no-credential-adapter.md) — Resolved 2026-07-30: `credentialRef: 'none'` for `http-json:v1` only; admission validates it, readiness probe skips resolution, route runtime omits Authorization. MCP/x402 adapters still require env refs. Evidence: labelled unit/dev seam behavior.
- [Cold-agent keys](tickets/T3-cold-agent-keys.md) — Decided 2026-07-30 by founder: Soar-shaped OAuth/device-code issuance (AE-owned RFC 8628 flow + PKCE code grant, scopes mirror authority modes, keys ride Clerk). Execution plan: `plans/T3-oauth-issuance-PLAN.md`.
- [Plan-first surface](tickets/T9-plan-first-surface.md) — Plan ready 2026-07-30: consumer `ConsumerPlan` projection over Customer Request compilation, `/` stays the single view, inspect-only actions, no booking claims until T10. Execution plan: `plans/T9-plan-first-surface-PLAN.md`.
- Business model (founder grilling, 2026-07-30) — Payer: agent operators via prepaid credit (T2). Metered unit: paid invocation of a business-published service. Offer: free listing + business-set per-call price + free-call tier + rake on paid calls only. Wedge: API-native supply first. Surfaces: supply landing separate; `/` = demand offer keeping the T9 ask→plan experience as try→install funnel. Pattern sources: `research/2026-07-30-marketplace-pattern-borrow.md`, `research/2026-07-30-flywheel-patterns.md` (in flight).
- T7 reasoning inverted — API supply import/recruiting was descoped when the ICP was no-API locals; with the API-native wedge it returns as the supply-bootstrap play (see reopened T7).

## Not yet specified

- How a business (not the AE operator) self-serves supply onboarding so the services list grows without dev seeds — depends on Business Account (Phase 4, ADR-024/026) shape.
- What "quality metrics" mean for AE services (agentic.market advertises them); depends on real invocation telemetry existing.
- Composite requests over multiple callable services (Customer Request compilation over the services projection).

## Out of scope

- Matching agentic.market's catalog *size* (1,963 services). Parity here is contract parity, not supply-volume parity.
- Crypto settlement/USDC pricing display. AE prices are business-published ISO-4217; rail decision is ticket T2, not this effort.
- T7 catalog import from agentic.market — moved out of scope by T8: their supply is APIs; AE's driver ICP is no-API local businesses. Revisit only as a deliberate SEO-mass play.

## Successor effort

The agent-engine effort (non-mechanical `/`, dialog → plan → business calls) has its own map: [Agent engine on `/`](MAP-engine.md), charted 2026-07-31 (destination reached). The confirmed product vision (`.planning/VISION-conceptual-map.md`, 2026-08-01) is mapped against the repo in [Vision → repo gap](MAP-vision-gap.md); new vision-gap work belongs there.

## Open tickets (frontier)

| id | type | title | blocked by |
| --- | --- | --- | --- |
| [T1](tickets/T1-gh-auth.md) | task (HITL) | Re-authenticate `gh` and mirror this map to GitHub Issues | — |
| [T3](tickets/T3-cold-agent-keys.md) | task (HITL remainder) | OAuth/device-code dev journey and Convex grant store landed 2026-07-30; remaining: production Clerk enablement, deployment secrets, hosted readback | HITL |
| [T7](tickets/T7-agentic-market-importer.md) | task (reopened) | Supply bootstrap: import agentic.market public catalog as `publicly_observed` listings + claim funnel feed | founder optics sign-off |
| [T9](tickets/T9-plan-first-surface.md) | task (review) | Implemented 2026-07-30; now the demand experience on `/` with T13's install handoff | — |
| [T10](tickets/T10-booking-endpoints.md) | task (fast-follow) | AE-operated endpoints for no-API locals — next major completion gap behind the API-native wedge | T3 production HITL, T12 live rail |
| [T11](tickets/T11-supply-funnel.md) | implemented | Supply landing and six-step publish funnel landed 2026-07-30 | credential-vault/live-provider HITL |
| [T12](tickets/T12-metering-payouts.md) | implemented (dev) | Credit ledger, 1000 bps rake, usage, payout state and T13 query seams landed 2026-07-30 | Stripe/Connect production HITL |
| [T13](tickets/T13-demand-console.md) | implemented | `/` ask-to-options-to-install funnel plus assistant access, credit, usage and revocation console landed 2026-07-30 | production Clerk/Stripe readback |
