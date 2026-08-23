# Treg parity against current Agentic Economy

**Analysis date:** 2026-08-23

| Scope | Pin |
|---|---|
| Treg reference | [`superdesigndev/treg@603540f`](https://github.com/superdesigndev/treg/tree/603540f653994080d4f507a9a3564e1017c28eef) |
| Agentic Economy | Current working tree based on `ac857aef0`, including tracked and untracked WIP |
| Evidence | The four pinned Treg maps and two AE parity maps in this directory; current source was mapped, but no live deployment was inferred |

Statuses describe observable contract parity: `MATCHED`, `PARTIAL`, `MISSING`, `DIFFERENT-BY-DESIGN`, and `AE-EXTRA`.

## Master parity matrix

| Area | Treg contract | Current AE counterpart | Status | Evidence | User-visible consequence |
|---|---|---|---|---|---|
| Discover | Anonymous task/catalog search | Anonymous operation search | MATCHED | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | An unauthenticated agent can search before spending. |
| Discover | Broad curated provider-route catalog | Protocol-imported operation publications | PARTIAL | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | AE can ingest several contract types, but does not demonstrate Treg's route-level catalog breadth. |
| Discover | Catalog-first landing and shelves | Landing plus `/market` operation/business views | PARTIAL | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Both expose supply publicly; AE's presentation is business/market oriented rather than a pure tool catalog. |
| Inspect | Exact endpoint/provider detail | Exact operation detail | MATCHED | [Treg interactions](./INTERACTIONS.md); [AE surfaces](./AE-SURFACE-PARITY.md) | An agent can inspect schema and terms without calling the provider. |
| Inspect | Catalog endpoint comparison | Operation comparison | AE-EXTRA | [AE surfaces](./AE-SURFACE-PARITY.md) | AE exposes an explicit multi-operation comparison surface. |
| Inspect | Access and cost inferred from catalog/tool state | Explicit `inspect-plan` decision | AE-EXTRA | [AE surfaces](./AE-SURFACE-PARITY.md) | AE can disclose preflight authority and execution planning before invocation. |
| Inspect | Tutorial, docs, skill and discovery pages | Agent/provider guides, `/SKILL.md`, `/llms.txt`, UCP | PARTIAL | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Machine guidance exists, but the install/tutorial route family is not equivalent. |
| Authorize | Human session via GitHub, Google or email OTP | Clerk sign-in and sign-up | PARTIAL | [Treg architecture](./ARCHITECTURE.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | Both identify humans, but onboarding and provider choices differ. |
| Authorize | One organization-scoped agent token | AE caller key backed by bounded grant policy | PARTIAL | [Treg interactions](./INTERACTIONS.md); [AE surfaces](./AE-SURFACE-PARITY.md) | AE agents receive explicit budgeted authority rather than Treg's team token contract. |
| Authorize | Organizations, membership, invites, projects and deny rules | Owner/operator roles and agent principals | MISSING | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | There is no Treg-equivalent organization administration surface. |
| Authorize | Organization tool → secret/OAuth → platform key ladder | Principal grant → provider connection/lease → transport authority | PARTIAL | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | AE can authorize provider access, but not through Treg's simple, visible credential ladder. |
| Authorize | MCP OAuth and team bearer access | MCP OAuth device/authorization-code grants | PARTIAL | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Protected MCP actions work through a different token and grant lifecycle. |
| Fund | Organization balance read | Agent credit/balance readback | PARTIAL | [Treg interactions](./INTERACTIONS.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Both can show available spending capacity; ownership and response shapes differ. |
| Fund | Stripe top-up and auto-top-up | Stripe-backed credit top-up | PARTIAL | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | A buyer can add credit, but AE does not mirror all Treg billing controls. |
| Fund | Insufficient credit returns HTTP 402 before relay | Paid admission/refusal before provider execution | PARTIAL | [Treg interactions](./INTERACTIONS.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Both stop an unfunded paid call before provider work; error contracts differ. |
| Fund | Idempotent hold before upstream call | Buyer and external-spend reservations | PARTIAL | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | Both reserve value before effects; AE separately models custody/external spend. |
| Invoke | `/call/{rest:path}` transparent proxy | `/api/v1/operations/call` typed operation invocation | DIFFERENT-BY-DESIGN | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Treg accepts a provider-like route; AE requires a published operation contract. |
| Invoke | Faithful generic HTTP relay with injected credentials | Admitted HTTP JSON, MCP and x402 transports | PARTIAL | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | AE relays declared operations, not arbitrary catalog URLs. |
| Invoke | Header-based idempotency and replay semantics | Body idempotency key plus durable invocation identity | PARTIAL | [Treg interactions](./INTERACTIONS.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Retries are safe in both systems, but their public contracts are not interchangeable. |
| Invoke | Provider calls paid from ordinary platform billing | CDP-custodied Base USDC x402 broker path | AE-EXTRA | [AE engineering](./AE-ENGINEERING-PARITY.md) | AE can sign and submit provider payment authorization as part of invocation. |
| Invoke | Arbitrary upstream/full-URL proxy and local interception | No equivalent root call/proxy family | MISSING | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Existing Treg clients cannot point AE at an arbitrary URL and expect transparent relay. |
| Validate | Catalog access and provider health preflight | Inspect-plan, readiness and operation admission | PARTIAL | [Treg interactions](./INTERACTIONS.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Both can refuse unavailable supply before payment, with different evidence models. |
| Validate | Bounded upstream response relay | Typed output validation and provider-failure classification | PARTIAL | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | AE validates declared output rather than only returning a bounded upstream response. |
| Validate | No identified chain-settlement verifier | Independent x402 settlement verification | AE-EXTRA | [AE engineering](./AE-ENGINEERING-PARITY.md) | AE can distinguish submitted, settled and unknown chain outcomes. |
| Validate | Credential/provider health run | Liveness, readiness and catalog/admin health | PARTIAL | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | AE has system readiness but not the same per-credential reconnect workflow. |
| Account | Organization credit hold, settle and release | Buyer reservation, ledger, external-spend finalization and reversal | PARTIAL | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | Both conserve buyer value; AE tracks more economic legs and recovery states. |
| Account | Platform/provider call cost | Exact provider amount plus separate AE fee | AE-EXTRA | [AE engineering](./AE-ENGINEERING-PARITY.md) | AE can expose and account for provider price and platform fee separately. |
| Account | Calls, runs, activity and billing records | Invocation status, telemetry, audit and redacted receipts | PARTIAL | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Both retain call history, but identifiers and receipt shapes differ. |
| Account | Provider cost represented through call billing | Externally settled provider earning state | AE-EXTRA | [AE engineering](./AE-ENGINEERING-PARITY.md) | An x402-paid provider can be excluded from a second payout path. |
| Account | Stripe checkout, portal, refunds and disputes | Stripe top-up, webhook and provider-money workflows | PARTIAL | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | The billing foundations overlap, but AE centers accounting on principals and operations. |
| Recover | Call/run lookup and replay | Durable invocation status and recovery locator | PARTIAL | [Treg interactions](./INTERACTIONS.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Callers can poll an uncertain or asynchronous operation. |
| Recover | Idempotent hold/settlement recovery | Explicit settlement/accounting reconciliation | AE-EXTRA | [AE engineering](./AE-ENGINEERING-PARITY.md) | Unknown external outcomes can be reconciled without blind resubmission. |
| Recover | Run lifecycle controls | Explicit invocation cancellation | PARTIAL | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | AE exposes cancellation, subject to its durable state machine. |
| Recover | Refund/release after failed call | Refund, fee reversal, loss and reservation recovery | PARTIAL | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | AE distinguishes customer recovery from an externally paid provider loss. |
| Publish | Tool, provider, connection and skill publication | Owner supply/offering publication and public registry | PARTIAL | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Providers can publish executable supply, but the bundle and ownership models differ. |
| Publish | CLI scan/upload of local tools and credentials | No scan/upload command family | MISSING | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | AE lacks Treg's local-to-hosted publication loop. |
| Publish | Catalog verification metadata | Market evidence, external snapshots and ranking inputs | AE-EXTRA | [AE engineering](./AE-ENGINEERING-PARITY.md) | AE carries a richer first-party market/evidence layer. |
| Operate | Admin and super-admin catalog/call/org controls | Index health, run and audit administration | PARTIAL | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | AE operators can inspect health and runs, but not every Treg administrative resource. |
| Operate | Limited repository-owned recurring health work | Application-owned discovery, reconciliation and cleanup jobs | AE-EXTRA | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | AE owns more of the operational clock inside the application. |
| Operate | Render service plus PostgreSQL | Vercel Node gateway plus Convex backend | DIFFERENT-BY-DESIGN | [Treg architecture](./ARCHITECTURE.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | Deployment, persistence and readiness operations cannot be copied directly. |
| Operate | Thin CLI and MCP over server behavior | Thin CLI and MCP over AE routes/actions | MATCHED | [Treg engineering](./ENGINEERING.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | Neither client reimplements the provider execution engine. |
| Install | `install.sh` and editor/agent plugin artifacts | No equivalent served installer/plugin | MISSING | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | AE is harder for a new agent to adopt in one command. |
| Install | `llms.txt`, skill, tutorial and generated client guidance | `llms.txt`, uppercase `SKILL.md`, UCP and CLI README | PARTIAL | [Treg surfaces](./SURFACES.md); [AE surfaces](./AE-SURFACE-PARITY.md) | Machine discovery exists, but the complete Treg install journey does not. |
| Install | Python package with web and CLI entrypoints | Node package, hosted web routes and repository CLI | DIFFERENT-BY-DESIGN | [Treg architecture](./ARCHITECTURE.md); [AE engineering](./AE-ENGINEERING-PARITY.md) | Distribution and local runtime expectations differ even where commands overlap. |

## Status totals

| Status | Count |
|---|---:|
| MATCHED | 3 |
| PARTIAL | 25 |
| MISSING | 4 |
| DIFFERENT-BY-DESIGN | 3 |
| AE-EXTRA | 9 |
| **Total** | **44** |

Only 3 of 44 mapped contracts are exact matches. That does not mean AE is less mature: nine rows are AE-only capabilities, concentrated in x402 custody, chain verification, fee accounting, reconciliation, and market evidence. It means AE is not yet a Treg-shaped product.

## Closest Treg-equivalent journey in AE today

1. Search anonymously through AE's market-operation search.
2. Inspect an exact operation, compare candidates, and request an inspect plan.
3. Obtain an AE caller key and bounded grant, then fund the associated credit balance.
4. Invoke the published operation with a caller-supplied idempotency key.
5. Poll durable status; reconcile an unknown result instead of resubmitting blindly.
6. Receive validated output and a redacted durable receipt after accounting finalizes.

The first material parity break is step 3. Treg presents one organization token backed by a visible tool/secret/OAuth/platform-key ladder. AE presents a caller principal, production grant policy, provider connection and admitted transport. The underlying controls are stronger and more explicit, but the interaction is not the simple Treg contract.

Strict request-shape parity breaks again at step 4: Treg relays a catalog/full-path call, while AE invokes a typed, published operation. This is the central product-shape difference, not a missing execution engine.

## AE specialization beyond Treg

- Base USDC x402 custody, typed payment authorization and independent settlement verification.
- Separate buyer reservation, provider amount, Agentic Economy fee and externally settled provider earning.
- Durable unknown-outcome reconciliation, refund/fee reversal, and AE-attributed external-loss paths.
- Inspect-plan, explicit comparison, market evidence and external snapshot surfaces.
- Typed operation admission and output validation across HTTP JSON, MCP and x402 transports.

## Clone-parity gap clusters

- **Adoption:** no one-command installer/plugin family and no equivalent local scan/upload workflow.
- **Identity simplicity:** no Treg-shaped organization token, membership/project surface, or visible credential fallback ladder.
- **Invocation shape:** operation-contract calls replace Treg's transparent provider-route/full-URL proxy.
- **Catalog proof:** AE supports multiple ingestion protocols, but the current source map does not establish a Treg-scale, fully onboarded route catalog.
- **Product shell:** AE's business, market and operator surfaces expose more concepts than Treg's compact catalog/tool dashboard.
- **Contract compatibility:** CLI, MCP, status, receipts, billing errors and recovery are functionally adjacent but not wire-compatible.

These are factual parity gaps. They do not imply that AE should discard its x402, accounting, recovery, validation or market-evidence specialization.
