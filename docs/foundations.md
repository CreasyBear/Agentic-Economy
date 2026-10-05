# Accounts, Agents and Tool Calls

This guide explains the current Aecon contract for customers, organisation administrators, Agent integrators and Providers. The [public API schema](https://app.aecon.ai/openapi.json), [machine instructions](https://app.aecon.ai/SKILL.md) and [release](https://app.aecon.ai/api/v1/release) describe the deployed surface. [PRODUCT.md](../PRODUCT.md) sets direction; current source and tests establish implementation.

Production paid access is currently limited to Admins. Public discovery is available. The recorded paid acceptance used the CLI and promotional credit; it does not establish paid chat, unrestricted customer access or every Provider's availability. See the [deployment and acceptance record](operations/deployments.md).

## Who owns what

| Concept | Meaning |
| --- | --- |
| User | A person who signs in and acts with their current Account membership. |
| Organisation / workspace | The organisation identity and its shared working interface. Ownership and membership determine access. |
| Account | The context for access, funds and attributable activity. The server resolves it from verified identity. |
| Customer | The person or organisation directing the larger task and delegating authority. |
| Agent | A persistent actor operating under the Customer's authority. Its credential can change without changing its identity or history. |
| Credential / connection | A key or OAuth connection identifying an authorised actor. It is separate from funds, scope and spending permission. |
| Spending policy / grant | The permitted work, resources, budget and expiry. Funding the Account does not widen it. |
| Provider | The party performing a Tool. Provider credentials and Connections are separate from the buyer's Agent key. |
| Tool | An exact admitted, published callable contract. An imported directory entry may still require setup and admission. |
| Quote / Call | An expiring caller-specific purchase decision, then its idempotent durable execution. |

An Account owner or organisation admin should use the existing owner settings for teams, Agent connections, limits and security. A key identifies an Agent; it does not grant every owner action. Administrative status does not itself make another Account's private result readable. Revocation, cancellation, refund and history access are separate actions.

## Choose and use a Tool

Start at [the market](https://app.aecon.ai/market) or [the Agent guide](https://app.aecon.ai/for-agents). Search by the contribution you need. Inspect the exact Tool's input, price, data recipients, effects and readiness. `setup_required`, unknown freshness and unverified availability are meaningful states; finding a listing does not establish that it can be called now.

For an integrator, the current HTTP path is:

```text
POST /api/v1/market-tools/search       public query
POST /api/v1/market-tools/describe     exact returned toolRef
POST /api/v1/tools/quote               toolRef + schema-valid input; Agent auth
POST /api/v1/tools/call                quoteRef + retained idempotencyKey; Agent auth
GET  /api/v1/calls/{callRef}           resume the same Call
```

The Quote checks the caller's authority, budget and current terms. Follow any returned funding/authority/readiness action, then obtain a current Quote. Submit the returned `quoteRef`; do not reconstruct prices, recipients or authority from discovery. The server resolves the Account; the caller does not select another Account by supplying a reference.

Current Call input:

```json
{
  "quoteRef": "<exact quoteRef returned by tool.quote>",
  "idempotencyKey": "<persisted key for this logical Call, 8–200 characters>"
}
```

These placeholders must be replaced with actual returned values. Read the [OpenAPI request/response schemas](https://app.aecon.ai/openapi.json) for the exact action; Tool input varies by contract. This guide does not add a universal result envelope or a generic workflow API.

## Connect an Agent and control authority

Use [the existing Agent setup](https://app.aecon.ai/for-agents) and your client's current supported connection flow. Aecon exposes [MCP](https://app.aecon.ai/mcp), [OAuth server metadata](https://app.aecon.ai/.well-known/oauth-authorization-server), [protected-resource metadata](https://app.aecon.ai/.well-known/oauth-protected-resource), and the [discovery manifest](https://app.aecon.ai/.well-known/ucp).

Direct HTTP uses `Authorization: Bearer <Agent access key>`. The purchase scope is `market_tools:call`; scope alone does not override the Agent's authority mode, spending policy, environment or lifecycle. Keep credentials inside the client's credential storage. Each client connection must be authorised in that client. Follow the challenge and advertised metadata for OAuth; registration or login alone does not prove paid readiness.

An administrator chooses the appropriate Agent limit and lifetime, reviews connections and revokes compromised access through owner controls. Credential replacement preserves the Agent's identity, budget and history. Current authority still decides whether already accepted work can proceed. A funding balance is capacity, not permission to spend it.

The CLI source and downloadable package have recorded acceptance. The public npm package is `@agentic-economy/cli`; registry readback on 5 October confirms version 0.2.1. Follow the [CLI installation guide](../packages/cli/README.md) for the versioned command and archive verification.

## Recover without making another purchase

Persist `idempotencyKey` before Call submission and keep the returned `callRef`. A lost response does not justify a new key. Repeat the same logical request with the same key; changed material may conflict. A new key can represent a separate purchase.

Read status for pending or uncertain work. Follow the returned continuation and retry timing. Use `call.cancel` or `call.reconcile` only when the current Call permits it. A timeout after possible dispatch requires observation/reconciliation; blindly resubmitting can duplicate an external effect. Closing a browser or client connection does not establish cancellation.

Keep result, payment, refund and purchase status distinct. A completed payment does not prove delivery; a cancellation request does not guarantee rollback; a terminal execution response does not itself prove refund settlement. The current Call receipt is the authority for that Call's state. Preserve the `x-ae-request-id` for support and share no credentials.

## Provider setup

Start at [the Provider entrance](https://app.aecon.ai/for-providers). The supported source funnel previews/imports contracts, establishes a Provider Connection where needed, tests readiness, publishes, withdraws/rechecks/republishes, and exposes Calls, earnings and offboarding status. The generated API identifies these as `supply.*` actions; their scopes and schemas remain authoritative.

Publish exact inputs/outputs, data use, effects, price and recovery capability. A Provider must own or be entitled to the supplied endpoint and credential. An external directory entry is metadata until admitted and published. Test the declared transport, failure and output behaviour; a queued provider job must not be advertised as a delivered result. Conventional job-handle completion and caller-composed graphs remain proposed work in [ADR 0006](adr/0006-mercator-capability-foundations.md), not features this guide promises.

## Data, receipts and lifecycle

Review the disclosed recipient before releasing input. Some AI-assisted searches release the query and bounded candidate summaries to the displayed recipient; discovery does not mean no data release. A Provider receives the selected service input under its contract. Funding/payment, platform privacy and Provider terms describe different relationships.

Current alpha content retention and founder-review scope are described in the [platform privacy contract](designs/platform-data-privacy.md#approved-alpha-learning-change--4-october-2026). Financial/audit records and public blockchain transactions have separate retention constraints. Do not infer a blanket no-retention promise, Australian-only processing or deletion of blockchain records.

Use Account activity, receipts and permitted owner recovery controls for inspection and offboarding. Financial resolution and Provider earnings are different from Tool delivery. The complete Australian Seller/Provider obligation/tax/document record remains explicit product work; a payment receipt alone does not prove it is complete.
