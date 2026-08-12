# Wayfinder map — AE category destination and execution/history

Label: `wayfinder:map` (active category/destination map; local-markdown tracker fallback; `gh` token is invalid — see ticket T1).
Charted: 2026-08-08 against the current working tree (dirty).
Reconciled: 2026-08-12 after the post-remediation re-audit; the 2026-08-11 closeout is historical and hosted receipt remains unproduced.

## Destination

**Founder-confirmed category and ownership decision (2026-08-08; ADR-032):** Agentic Economy is the market and controlled transaction layer where authorized agents discover, buy and invoke admitted third-party Market Operations, and suppliers are paid after contract-valid delivery.

The **Principal** is the human or organization that owns authority and budget. The **Consuming Agent** is the Principal's delegated shopper and distribution interface: it discovers, compares, buys and invokes only within delegated authority and policy. Suppliers host implementations wherever they choose; AE owns admission, invocation identity, authority/policy, evidence, Qualified Use metering and payment reconciliation—not runtime hosting.

The **Market Operation** is the admitted, versioned third-party operation and competitive unit. An **Agent Service** is its market-facing representation for authorized Consuming Agents. Skills, SDKs and repositories are acquisition, lineage and distribution inputs, not market supply. The existing ask → Customer Request → authority → execution → evidence product remains a first-party demand application and proving ground, not the category definition.

**Category shorthand:** OpenRouter for agent services; a Vercel-style self-serve supplier publishing experience without AE-owned runtimes; the Consuming Agent is the app store that discovers, compares, buys and invokes Market Operations at runtime. These are structural analogies, not identity claims.

**V1 closure and wider proof gate:** V1 is closed to one family—public-document structured extraction with field-level provenance—with curated suppliers and AE-owned admission, verification and reconciliation. A wider category claim remains unearned until an eight-week pilot with 3–5 independent suppliers, one anchor consuming runtime, three unrelated paying Principals and at least 100 settled real-money calls per month for two consecutive months demonstrates repeat purchases by at least two Principals and two suppliers, AE retains at least 50% of each repeat buyer's eligible next paid purchases after direct alternatives are disclosed, and contribution-positive supplier/platform economics, with no transaction-spine failure. Contract-valid delivery and semantic correctness remain separate evidence classes; schema conformance never proves truth.

**Category guardrail:** Trades, Australian small businesses, BAS and human-service coordination may be future suppliers/use cases; they are not the category, ICP, wedge or default product frame.

**Superseded framing (historical only):** The old AE-hosted-runtime, business-earning/API-native, no-API-local, claim-funnel, local-business/trades/Australian-SMB/BAS and human-service-coordination destinations are historical records, not active category authority. `MAP-framework.md`, `MAP-engine.md` and `JOURNEYS.md` remain useful only for mechanics and execution history; they do not define today's category, ICP, wedge or destination.

## Notes

- Skills every session must consult: `wayfinder`. The `ae-*` skills were **retired 2026-08-01** (founder: they handicapped the build); their rules live in this map, `PROJECT.md`, `BRAND.md`, and the verdict docs.
- Standing preference: do not overcomplicate. Projection over new stores. One semantic supply object across human and agent hosts.
- Ground-truth harness: `eval/parity/check-parity.mjs` (autoresearch-style loop in `eval/parity/program.md`). The harness is not modified to make scores improve.
- Evidence classes never silently upgrade: sandbox callability is labelled `ae_sandbox_provider`; it proves the contract, not real supply.


## Current gateway workstream — 2026-08-12

**Status:** remediation campaign open; seven workstreams focused-verified; payout-period lifecycle blocked for lack of a trusted server-owned nonzero minimum-payout policy; full post-codegen source release gate not green and no later complete rerun; hosted proof blocked  
**Decision:** [ADR-035 — Single-Key Capability Gateway](../adr/ADR-035-single-key-capability-gateway.md)  
**Implementation plan:** [2026-08-09 gateway plan](../research/2026-08-09-single-key-capability-gateway-implementation-plan.md)  
**Historical remediation closeout:** [2026-08-11 goblin source closeout](../research/2026-08-11-goblin-source-remediation-plan.md)

The 2026-08-11 source-completion/local-gate claims are dated historical
evidence, superseded for current status by the 2026-08-12 post-remediation
re-audit recorded in `PAPERCUTS.md`.

The consuming-agent boundary is one Clerk-issued AE bearer key over many
admitted Market Operations. Clerk is the credential issuer/revocation
authority; AE owns the `AgentAccessPrincipal`, grant/policy, invocation,
money, evidence, and recovery. The canonical protected action is
`operation.invoke:v1`; the canonical HTTP route is
`POST /api/v1/operations/execute`; `/mcp`, CLI, and Answer adapt the same
application service. Existing `operation.execute:v1` remains
public/keyless/read-only. Supplier credentials stay inside the server-side
provider connection/transport boundary.

The fixed W0→W8 map is:

| Wave | Discoverable contract |
| --- | --- |
| W0 | Freeze Clerk/AE ownership, canonical route/action, reused seams, no-handroll decisions, and proof ceiling. |
| W1 | Generalize Customer Request key/principal/OAuth through `src/modules/agent-access/`; no aliases or second verifier. |
| W2 | Add grant, budget, rate, concurrency, and standing-mandate admission through current money/rate seams. |
| W3 | Expose authenticated `operation.invoke:v1` over HTTP and registered MCP with shared idempotency identity. |
| W4 | Bind exact operation/publication/binding/provider/authority/money/evidence identity to Action Invocation and transport. |
| W5 | Add generation-bound provider connection leases and final server-only credential checks. |
| W6 | Add bounded read/cancel/reconcile, correlation, redaction, and durable unknown-outcome recovery. |
| W7 | Ask one first-use authority question and keep consumer keys separate from supplier connections. |
| W8 | Publish HTTP/MCP/CLI/Answer projections and run the exact hosted positive proof. |

The gateway reuses the existing Clerk auth/OAuth, action registry/MCP,
keyless executor, capability-supply publication/binding/readiness and
provider-connection, Action Invocation, route transport, money,
`convex/lib/rateLimit.ts`, canonical digest/stable serialization, RFC 9457,
Convex, workflow/workpool, and MCP SDK seams. No parallel token verifier,
registry, ledger, transport, or execution state machine is permitted. The
package and no-handroll evidence is maintained in ADR-035 and the linked
plan.

Positive proof requires the same real Clerk-issued key to invoke two real
operations from distinct admitted suppliers/connection modes on the exact
hosted revision, with current approval/budget, server-only credentials,
durable outcome/recovery, exact usage/evidence readback, same-key zero-meter
replay, revoke/withdraw refusal, and one hard-capped live
top-up/charge/payout with zero-movement replay. CI must independently parse
the strict receipt. Fixtures, mocks, refusals, synthetic local identities,
source-only OAuth, and unavailable Convex are not proof. Until that gate runs,
hosted and live-money proof remain uncertified. The full post-codegen source
release gate is not green and no later complete rerun exists; the payout-period
lifecycle remains blocked for lack of a trusted server-owned nonzero
minimum-payout policy.

## Decisions so far

- [Services IA](tickets/T0-services-ia.md) — Parity is served by a flat per-offering projection (`/api/v1/services`, `/api/v1/services/search`) derived from the existing V2 business catalog; no new tables, no second catalog store.
- [Callable endpoint source of truth](tickets/T0-services-ia.md) — Sandbox checkup-quote callability is driven by the offering's own `external_operation` access path + fixed price, not a hardcoded slug map.
- [Real-supply path](tickets/T4-real-supply-onboarding.md) — Resolved by research: first independent provider goes catalog Offering + `external_operation` path → capability-supply promotion (ADR-026 lineage); only new machinery is a no-credential adapter sentinel; claim ceiling is "published, last checked reachable".
- **Current first-party demand proving ground** — `/` remains THE view: the human twin of `/api/v1/services` (search → priced service rows → instant sandbox quote), loader uses the same `projectPublicServicesPage` projection as the API. `/registry`, `/about`, `/help` 301 to `/`. Decided 2026-07-30 under founder directive. **Amended 2026-08-01:** `/for-agents` no longer 301s — `BRAND.md` (LOCKED, later) makes it the Door 2 landing, and `discovery-files.ts` already advertises it in the sitemap and `llms.txt`, so the 301 was serving a redirect for a surface AE tells agents to read. `/registry` still 301s while eight UI callsites label it "Browse services"; relabel or build, but do not keep promising a browse view. This ask → plan → install surface exercises the platform but does not define its category.
- Parity evidence — autoresearch loop `eval/parity/` reached 7/7 against the agentic.market baseline contract on the local labelled deployment (results.tsv: 2/7 → 6/7 → 7/7). Evidence class: labelled local/dev; no hosted or real-supply claim follows.
- **Historical local/trades framing (superseded 2026-08-08)** — The 2026-07-30 "agent SEO for local businesses", no-API-local driver ICP, and later trades/Australian-SMB/BAS/human-service-coordination journeys are preserved for research and mechanics only. They do not define the current category, ICP, wedge or default product frame.
- [MCP host](tickets/T6-mcp-host-adapter.md) — Resolved 2026-07-30: Streamable HTTP `/mcp` over the action registry; anonymous tier = `surfaces:['mcp'] && readOnly` (4 tools, `ae_*` deterministic names); `sandbox.checkup_quote` registered; install one-liners in `/SKILL.md` + `/llms.txt`. Evidence: labelled local/dev smoke.
- [Keyless sentinel](tickets/T5-no-credential-adapter.md) — Resolved 2026-07-30: `credentialRef: 'none'` for `http-json:v1` only; admission validates it, readiness probe skips resolution, route runtime omits Authorization. MCP/x402 adapters still require env refs. Evidence: labelled unit/dev seam behavior.
- [Cold-agent keys](tickets/T3-cold-agent-keys.md) — Decided 2026-07-30 by founder: Soar-shaped OAuth/device-code issuance (AE-owned RFC 8628 flow + PKCE code grant, scopes mirror authority modes, keys ride Clerk). Execution plan: `plans/T3-oauth-issuance-PLAN.md`.
- [Plan-first surface](tickets/T9-plan-first-surface.md) — Plan ready 2026-07-30: consumer `ConsumerPlan` projection over Customer Request compilation, `/` stays the single view, inspect-only actions, no booking claims until T10. Execution plan: `plans/T9-plan-first-surface-PLAN.md`.
- Business-model mechanics (founder grilling, 2026-07-30; retained as mechanics, not category definition) — Payer: agent operators via prepaid credit (T2). Metered unit: paid invocation of a hosted Market Operation. Offer: free listing + Provider-set per-call price + free-call tier + rake on paid calls only. Surfaces: supply landing separate; `/` = demand application keeping the T9 ask → plan experience as try → install funnel. These mechanics remain subject to current implementation/evidence ceilings.
- **Superseded T7 rationale (2026-08-08)** — API supply import/recruiting was previously descoped because no-API locals were treated as the driver ICP. That local-wedge rationale is historical; T7 is only a supply-acquisition tactic to assess under the closed-family destination.

## Not yet specified

- How a Provider (registered Business), rather than the AE operator, self-serves supply onboarding so eligible supply grows without dev seeds — depends on Business Account (Phase 4, ADR-024/026) shape.
- What quality and usage metrics can be honestly exposed for Market Operations (agentic.market advertises them); depends on real invocation telemetry existing.
- Composite requests over multiple callable Operations (Customer Request compilation over the services projection).

## Out of scope

- Matching agentic.market's catalog *size* (1,963 services). Parity here is contract parity, not supply-volume parity.
- Crypto settlement/USDC pricing display remains out of scope for this parity map; the payment rail is a future implementation choice within the canonical transaction boundary, and the rail decision remains ticket T2.
- T7 catalog import from agentic.market remains out of scope for this parity map; any import/claim-funnel work is a supply-acquisition tactic, not an ICP or category boundary.

## Successor effort

The agent-engine effort (non-mechanical `/`, dialog → plan → business calls) is a historical first-party demand application and proving ground. [MAP-engine.md](MAP-engine.md) and the framework journeys are execution/mechanics records, not the active category destination. The confirmed product vision (`.planning/VISION-conceptual-map.md`, 2026-08-01) is mapped against the repo in [Vision → repo gap](MAP-vision-gap.md); new vision-gap work belongs there.

## Open tickets (frontier)

| id | type | title | blocked by |
| --- | --- | --- | --- |
| [T1](tickets/T1-gh-auth.md) | task (HITL) | Re-authenticate `gh` and mirror this map to GitHub Issues | — |
| [T3](tickets/T3-cold-agent-keys.md) | task (HITL remainder) | OAuth/device-code dev journey and Convex grant store landed 2026-07-30; remaining: production Clerk enablement, deployment secrets, hosted readback | HITL |
| [T7](tickets/T7-agentic-market-importer.md) | task (reopened) | Supply bootstrap: import agentic.market public catalog as `publicly_observed` listings + claim funnel feed | founder optics sign-off |
| [T9](tickets/T9-plan-first-surface.md) | task (review) | Implemented 2026-07-30; now the demand experience on `/` with T13's install handoff | — |
| [T10](tickets/T10-booking-endpoints.md) | task (candidate) | Hosted operations for capability artifacts that lack an existing API — a possible supplier-acquisition path under the closed-family destination, not a no-API-local ICP or wedge | T3 production HITL, T12 live rail |
| [T11](tickets/T11-supply-funnel.md) | implemented | Supply landing and six-step publish funnel landed 2026-07-30 | credential-vault/live-provider HITL |
| [T12](tickets/T12-metering-payouts.md) | implemented (dev) | Credit ledger, 1000 bps rake, usage, payout state and T13 query seams landed 2026-07-30 | Stripe/Connect production HITL |
| [T13](tickets/T13-demand-console.md) | implemented | `/` ask-to-options-to-install funnel plus assistant access, credit, usage and revocation console landed 2026-07-30 | production Clerk/Stripe readback |
