# Accounts, Agents and Tool Calls

This guide explains the current Aecon contract for customers, organisation administrators, Agent integrators and Providers. The [public API schema](https://app.aecon.ai/openapi.json), [machine instructions](https://app.aecon.ai/SKILL.md) and [release](https://app.aecon.ai/api/v1/release) describe the deployed surface. [PRODUCT.md](../PRODUCT.md) sets direction; current source and tests establish implementation.

Production paid access is currently limited to Admins. Public discovery is available. The recorded paid acceptance used the CLI and promotional credit; it does not establish paid chat, unrestricted customer access or every Provider's availability. See the [deployment and acceptance record](operations/deployments.md).

The shortest supported command sequence is in the [CLI guide](../packages/cli/README.md#discover-before-connecting): discover an exact ready Tool, describe its contract, connect, inspect a Quote, Call, then read the result and receipt. This is a supported source path, not a qualified public sandbox tutorial. The installed-CLI integration fixture seeds Tools and buyer authority and uses a mock Provider; its recorded delivery does not establish that a fresh public user can complete this journey. Until a safe environment supplies discovery, authority and useful output from returned values, stop at discovery unless the owner has authorised the selected environment and effects.

## Start here

Aecon lets your Agent find a Tool, check its terms and buy a bounded result under your Account's authority. Your Agent keeps control of the larger task.

| Your goal | Start with |
| --- | --- |
| Find and use a Tool | [Customer journey](#choose-and-use-a-tool), then the [CLI commands](../packages/cli/README.md#discover-before-connecting). |
| Manage an Account and Agent access | [Administrator journey](#administrator-journey). |
| Connect a client or integrate the API | [Integrator journey](#integrator-journey) and [Agent authority](#connect-an-agent-and-control-authority). |
| Publish and maintain a Tool | [Provider journey](#provider-journey). |
| Resume interrupted or uncertain work | [Call recovery](#recover-without-making-another-purchase). |

For one Tool, start with a Quote and Call. For an exact procurement request or a bounded multi-Tool Plan, read [Choose the purchase entry point](#choose-the-purchase-entry-point). The [glossary](glossary.md) explains the shared terms.

### Before you make a purchase

This documentation describes a pre-stability source candidate. Its [compatibility policy](operations/deployments.md#public-contract-compatibility) does not yet identify a qualified external release combination. Public discovery needs no key; paid production access remains Admin-only. A safe public discovery-to-delivery sandbox is not yet qualified.

Use an owner-authorised environment and permitted Tool effects for a purchase. If those prerequisites are unavailable, stop at discovery. A pending response means Aecon accepted work, not that the Provider delivered it. Keep the returned identity and follow [recovery](#recover-without-making-another-purchase) before trying again.

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

For the command-by-command path, use the [single-Tool CLI guide](../packages/cli/README.md#discover-before-connecting).

Production paid access remains Admin-only. A safe public discovery-to-delivery sandbox is not yet qualified. Use an owner-authorised environment and permitted Tool effects; otherwise stop at discovery. The local installed-CLI fixture seeds authority and supply and mocks the Provider.

Start at [the market](https://app.aecon.ai/market) or [the Agent guide](https://app.aecon.ai/for-agents). Search by the contribution you need. Inspect the exact Tool's input, price, data recipients, effects and readiness. `setup_required`, unknown freshness and unverified availability are meaningful states; finding a listing does not establish that it can be called now.

For an integrator, the current HTTP path is:

| Step and contract | Request | Retain or supply |
| --- | --- | --- |
| [Search](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1market-tools~1search/post) | `POST /api/v1/market-tools/search` | Public query |
| [Describe](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1market-tools~1describe/post) | `POST /api/v1/market-tools/describe` | Exact returned `toolRef` |
| [Quote](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1tools~1quote/post) | `POST /api/v1/tools/quote` | `toolRef` and schema-valid input; Agent auth |
| [Call](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1tools~1call/post) | `POST /api/v1/tools/call` | `quoteRef` and retained `idempotencyKey`; Agent auth |
| [Status](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1calls~1{callRef}/get) | `GET /api/v1/calls/{callRef}` | Read the same `callRef`; Agent auth |

The Quote checks the caller's authority, budget and current terms. Follow any returned funding/authority/readiness action, then obtain a current Quote. Submit the returned `quoteRef`; do not reconstruct prices, recipients or authority from discovery. The server resolves the Account; the caller does not select another Account by supplying a reference.

Review the recipient and permitted input before quoting. A managed x402 price inspection can send the proposed input to the selected Provider before a Quote exists. Quoting creates no purchase or payment, but it is not a guarantee that no information leaves Aecon. A refusal or inspection timeout does not establish that no request reached the Provider.

Current Call input:

```json
{
  "quoteRef": "<exact quoteRef returned by tool.quote>",
  "idempotencyKey": "<persisted key for this logical Call, 8–200 characters>"
}
```

These placeholders must be replaced with actual returned values. Read the [Call request/response reference](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1tools~1call/post) for the exact action; Tool input varies by contract. This guide does not add a universal result envelope or a generic workflow API.

After acceptance, keep the exact `callRef` and read `ae status "$CALL_REF" --json` or the returned HTTP/MCP status continuation. Inspect the actual result, usage and available receipt; a pending response or missing output is not useful delivery. In the signed-in browser, [Calls](https://app.aecon.ai/activity) lists recorded work and `/calls/<returned callRef>` follows one Call. Use the returned outcome and permitted recovery before returning to your task. For interrupted or uncertain work, follow the [recovery guide](#recover-without-making-another-purchase).

For a result or spend discrepancy, retain the request ID, Call reference and the observed state, then use [support](https://app.aecon.ai/support). Share private input/output only through an appropriate private support channel, never public issues. Account disconnection does not cancel or resolve that purchase.

## Connect an Agent and control authority

Use [the existing Agent setup](https://app.aecon.ai/for-agents) and your client's current supported connection flow. Aecon exposes [MCP](https://app.aecon.ai/mcp), [OAuth server metadata](https://app.aecon.ai/.well-known/oauth-authorization-server), [protected-resource metadata](https://app.aecon.ai/.well-known/oauth-protected-resource), and the [discovery manifest](https://app.aecon.ai/.well-known/ucp).

Direct HTTP uses `Authorization: Bearer <Agent access key>`. The purchase scope is `market_tools:call`; scope alone does not override the Agent's authority mode, spending policy, environment or lifecycle. Keep credentials inside the client's credential storage. Each client connection must be authorised in that client. Follow the challenge and advertised metadata for OAuth; registration or login alone does not prove paid readiness.

An administrator chooses the appropriate Agent limit and lifetime, reviews connections and revokes compromised access through owner controls. Credential replacement preserves the Agent's identity, budget and history. Current authority still decides whether already accepted work can proceed. A funding balance is capacity, not permission to spend it.

The CLI source and downloadable package have recorded acceptance. Select a published version of `@agentic-economy/cli` using the [CLI installation guide](../packages/cli/README.md) and the [deployment record](operations/deployments.md#accepted-application-release). A source package version or prepared release does not prove registry publication. Web source, backend source, OpenAPI/action contract versions, docs revision and installed CLI/MCP protocol versions identify different parts of the supported combination; `/api/v1/release` identifies the web source only. Use the recorded combination when assessing a hosted claim.

## Choose the purchase entry point

Use an ordinary Quote and Call for one exact Tool. The CLI `ae call` obtains its own fresh Quote and retains a recovery record before submission; direct HTTP/MCP callers retain their own Quote and key. A separate `ae quote` inspection does not bind a later `ae call` to that Quote.

Use [`tool.procure`](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1tools~1procure/post) or `ae procure --input - --json` when the exact Tool, schema-valid input and AUD spend ceiling are already known. A `kind: "need"` request selects a candidate and asks for input; it does not buy it. An exact request supplies `kind: "exact"`, `toolRef`, `input`, `maxSpendAud` and `idempotencyKey`. The CLI retains the complete exact request and key in its protected local purchase journal before submission and returns a `recoveryRef`; this stores the private Tool input locally. After response loss, use `ae procure resume <recoveryRef>` with the same origin and Agent. Known Calls are observed only; otherwise only the saved exact request/key is replayed. Direct HTTP/MCP callers retain their own exact request. Never replace a key to escape uncertainty. A refusal without a Call reference can remain unresolved; persistent Quote preparation requires support investigation, not a new Quote or key.

Use a bounded buyer Plan for 1–10 admitted Tool nodes with explicit inputs and dependencies. Review its frozen Plan Quote, exact AUD micro-unit total and data flows, then run with the returned `planRef`, unchanged `approvedTotalAudUnits` and a retained run key. [The CLI Plan guide](../packages/cli/README.md#quote-and-run-a-plan) describes approval, partial results, cancellation and recovery. Plans are implemented and have [recorded acceptance](operations/deployments.md#accepted-application-release); Provider-created service packages and a general Agent orchestration runtime are separate product work.

## Recover without making another purchase

Persist `idempotencyKey` before Call submission and keep the returned `callRef`. A lost response does not justify a new key. Repeat the same logical request with the same key; changed material may conflict. A new key can represent a separate purchase.

Read status for pending or uncertain work. Follow the returned continuation and retry timing. Use [`call.cancel`](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1calls~1{callRef}~1cancel/post) or [`call.reconcile`](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1calls~1{callRef}~1reconcile/post) only when the current Call permits it. A timeout after possible dispatch requires observation/reconciliation; blindly resubmitting can duplicate an external effect. Closing a browser or client connection does not establish cancellation.

Read the [Call status contract](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1calls~1{callRef}/get) for the returned state and continuation. Keep result, payment, refund and purchase status distinct. A completed payment does not prove delivery; a cancellation request does not guarantee rollback; a terminal execution response does not itself prove refund settlement. The current Call receipt is the authority for that Call's state. Preserve the `x-ae-request-id` for support and share no credentials.

### Choose the next safe action

| What you received | What to do next |
| --- | --- |
| `completed` with output | Read the result and receipt. Return to your task with that output. |
| `completed` with `contentExpiredAt` | The recorded work completed, but its output is no longer retained. Inspect the receipt and contact support if you need help. A new Call would be another purchase. |
| `pending` | Read the same Call using its returned reference and retry timing. Keep the original request and key. |
| `outcome_unknown` | Inspect the same Call and its evidence. Follow its permitted reconciliation action before any retry. |
| `refused` | Read the refusal and owner handoff. Correct the named prerequisite before making another purchase decision. |
| A transport error or no response | Treat acceptance as unknown. Resume the journalled CLI Call or replay the unchanged direct request with its original key as permitted. |

For a journalled CLI Call, use `ae call resume "$RECOVERY_REF" --json` with the returned recovery reference, same origin and same Agent. For journalled Plan runs or exact procurement, use `ae plan resume "$RECOVERY_REF" --json` or `ae procure resume "$RECOVERY_REF" --json`. The same origin, Account and Agent are required; no new input or key is accepted. Read the [CLI recovery instructions](../packages/cli/README.md#connect-inspect-a-quote-then-call) and [purchase entry points](#choose-the-purchase-entry-point) before selecting a retry command.

### Ask for help with the same purchase

Give [support](https://app.aecon.ai/support) the request ID, Call or Plan reference, observed state and expected result. Keep the original request and recovery material privately. Do not include keys, credential files or private Tool input/output in public issues. Support can investigate a purchase; a support request does not itself cancel, refund or reconcile it.

## Provider setup

Start at [the Provider entrance](https://app.aecon.ai/for-providers). The supported source funnel previews/imports contracts, establishes a Provider Connection where needed, tests readiness, publishes, withdraws/rechecks/republishes, and exposes Calls and offboarding status. The generated API identifies these as `supply.*` actions; their scopes and schemas remain authoritative. The current `supply.earnings` read returns `capability_unsupported`; it does not provide a qualified earnings balance or prove that none is owed.

Publish exact inputs/outputs, data use, effects, price and recovery capability. A Provider must own or be entitled to the supplied endpoint and credential. An external directory entry is metadata until admitted and published. Test the declared transport, failure and output behaviour; a queued provider job must not be advertised as a delivered result. Conventional asynchronous Provider completion remains subject to the SDK and counterparty qualification in MM-057 → MM-022 of the [maturity register](operations/mercator-maturity-register.md). Buyer Plans use the existing Call lifecycle; their implementation does not qualify arbitrary Provider job protocols.

## Administrator journey

Prerequisite: sign in as the owner or authorised administrator of the intended workspace. The browser session, membership and Agent credentials are distinct; check the selected workspace before changing access or money.

1. Open [Team & roles](https://app.aecon.ai/owner/settings/team) and inspect the current roster. Where invitations are available, invite one email as Member or Admin; invitation submission does not establish membership until acceptance is recorded. This page does not provide role-change, member-removal or ownership-transfer controls. Keep those gaps explicit during offboarding.
2. Open [Agent keys](https://app.aecon.ai/owner/settings/agent-keys), create the supported key/authority request with permitted environment and limits, and complete its same issuance if confirmation is required. Deliver credentials through secure client storage. Retain the displayed Agent identity and credential generation, never the bearer value in URLs or shared reports.
3. Inspect [spending defaults](https://app.aecon.ai/owner/settings/spending) and, if permitted, [Credit](https://app.aecon.ai/owner/credit). A monthly cap or confirmed funding does not grant Agent scope or permission. Production paid access remains Admin-only.
4. Ask the connected client to read `ae account status --json` (MCP `ae_agentAccess_whoami`); verify the expected Account/Agent and scopes. Inspect [Calls](https://app.aecon.ai/activity), [receipts](https://app.aecon.ai/owner/settings/receipts) and [security activity](https://app.aecon.ai/owner/settings/security-activity) for the recorded consequences, without accessing another Account's private work.
5. For replacement, use the reconnect consent's existing-Agent option when offered and confirm the same Agent identity after connection. To revoke a key, select its exact creation/generation in Agent keys, confirm, and refresh the directory. A partial or unconfirmed response requires refresh/recovery; it is not completed revocation. The Agent and history remain.
6. During exit or compromise, use [owner revocation](https://app.aecon.ai/agent-access#revoke) or the appropriate owner key controls, inspect remaining connections and unresolved Calls, and follow permitted Call recovery separately. Removing local client credentials, revoking authority, cancelling delivery and retention/deletion are different actions. For membership offboarding that the roster does not support, contact the workspace owner or [support](https://app.aecon.ai/support).

## Integrator journey

Prerequisite: a published supported client, an authorised target environment and the correct protected resource. Use the [CLI installation guide](../packages/cli/README.md#install-from-npm), then confirm the [credential origin](../packages/cli/README.md#origin-credentials-and-provider-access). For MCP or direct HTTP, follow the [authentication metadata and authority guide](#connect-an-agent-and-control-authority). Never send a credential to a guessed alternate host.

1. Install a verified published CLI/archive, or connect the named MCP client to the advertised `/mcp` resource. For CLI, run `ae connect`, then `ae account status --json` and `ae doctor --json`. For MCP, refresh tools/list and read `ae_agentAccess_whoami`. Confirm the returned identity and readiness; successful authentication alone does not qualify paid delivery.
2. Discover anonymously, describe an exact returned ready `toolRef`, and construct input from its schema. Fetch [OpenAPI](https://app.aecon.ai/openapi.json), the advertised MCP tool contracts or `ae manifest --technical --json` for exact defaults, limits and variants; do not infer them from a title or another transport.
3. Use the [single-Tool sequence](../packages/cli/README.md#connect-inspect-a-quote-then-call) or the generated `tool.quote` and `tool.call` HTTP/MCP contracts. Retain the Quote, origin, Agent and idempotency key before direct submission, then the returned Call reference. The CLI journals Calls, [Plan runs](../packages/cli/README.md#quote-and-run-a-plan) and [exact procurement](../packages/cli/README.md#exact-procurement) before purchase submission. Exact procurement stores its full input privately; direct HTTP/MCP callers retain their own request/key material.
4. After interruption, use `ae call resume "$RECOVERY_REF" --json` for a journalled CLI Call, or observe/replay the original direct request as its contract permits. Read pending/uncertain work and the offered retry timing; changed keys/material create conflict or another purchase. Preserve `x-ae-request-id` and the exact returned continuation for diagnosis.
5. Before upgrade/reconnect, compare the published client/protocol against recorded web, backend and contract compatibility; preserve old accepted purchase identities. Read the same work after reconnect and confirm the same principal. Follow the [disconnect/uninstall guide](../packages/cli/README.md#upgrade-disconnect-and-uninstall), retaining unresolved purchase journals and manually saved direct HTTP/MCP requests. Local uninstall is not server revocation.

## Provider journey

Prerequisite: an authenticated entitled Provider, the intended Business reference and an owner-approved Provider connection. A buyer key or public listing is insufficient. Start at [Provider setup](https://app.aecon.ai/for-providers), confirm the [Business profile](https://app.aecon.ai/owner/settings/workspace), then use the returned owner identity/connection references; do not invent a Business identifier.

1. Open [Add Tool](https://app.aecon.ai/owner/operations/new) for the existing owner funnel, or connect the CLI with `ae connect --provider` and inspect `ae doctor --provider "$BUSINESS_ID" --json`. Keep buyer and Provider credentials separate. Review `ae help supply` and each generated action schema before writes.
2. Where a Connection is needed, use the source-native owner handoff or [`supply.connection.connect`](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1connections~1connect/post) with metadata only. Retain returned `attemptRef`/`requiredAction.cta`; open that exact secure handoff and enter credentials there, never in CLI JSON, MCP input or prompts. On return read the existing attempt or `ae supply connection "$CONNECTION_REF" --json`. A callback or lost response does not justify a duplicate connection.
3. Preview the exact source using `ae supply preview --input "$PREVIEW_JSON" --json` or [`supply.source.preview`](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1sources~1preview/post). Current programmatic preview/publication accepts an x402 source; supported Connection variants do not imply other source kinds can publish. Keep the returned `sourceDigest` and supported candidate's `candidateRef`, input/output schemas and source selector. An unsupported candidate is a refusal, not callable supply.
4. Prepare [`supply.publish`](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1publish/post) from the returned candidate and exact source, using its digest as `expectedSourceDigest`, entitled Business/Connection, truthful presentation/consequences, permitted validation input, environment and retained idempotency key. Use `ae supply publish --input "$PUBLISH_JSON" --json`. Publication performs readiness/validation requests: approve their data release and effects before submission. A `submitted` response does not prove `Published` or delivery.
5. Retain `toolRef`, publication identity and the returned authenticated `maintenance` tuple: `businessId`, `offeringRef`, `offeringRevision`, `offeringSourceHash`, `publicationRef`, `publicationRevision`. Read the [Provider status contract](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1status/post) and `ae supply status "$BUSINESS_REF" "$TOOL_REF" --json` and its routeability, reasons and owner handoff. Save `status.maintenance` when present; a missing stale/legacy tuple requires owner repair, never guessed revisions or hashes.
6. For a permitted maintenance action, pass the exact tuple plus a retained operation key, for example `ae supply recheck --input "$MAINTENANCE_JSON" --idempotency-key "$RECHECK_KEY" --json`. Use [`withdraw`](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1withdraw/post) or [`republish`](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1republish/post) only for the intended lifecycle change, and reread status for the new tuple before another write. Inspect `ae supply calls --json` and its opaque continuation for delivery/settlement evidence. Earnings currently returns `capability_unsupported`, not zero or proof of payout.
7. Before exit, withdraw callable supply through the supported maintenance operation and inspect `ae supply offboarding "$BUSINESS_REF" --json`. Read the [offboarding contract](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1offboarding~1status/post). Retain its case reference, state and blockers; missing status is not completed retirement. Connection revocation/cleanup uses `ae supply disconnect --input "$DISCONNECT_JSON" --json` with the exact connection authority generation/digest and key from the [connection revocation contract](https://app.aecon.ai/openapi.json#/paths/~1api~1v1~1supply~1connections~1revoke/post). Reread connection/offboarding status; local `ae account disconnect provider` neither cleans the remote Connection nor resolves Calls, obligations or retention blockers. If completion is unavailable, follow the returned owner handoff or contact [support](https://app.aecon.ai/support). Retain the request ID and case reference.

## Complete the supported task and handoff

| Actor | Task and evidence to retain | Recovery and exit |
| --- | --- | --- |
| Customer | Discover and compare exact returned Tools; inspect price, recipients, setup and input; authorise the supported Call or Plan; read useful output and its receipt. | Keep Call/Plan identity, inspect recorded spend and delivery separately, and recover that work before returning to the larger task or buying again. |
| Administrator | Sign in as the correct Account owner/admin; use existing owner settings for supported membership, Agent limits and expiry; inspect authenticated identity and activity; follow a funding handoff when permitted. | Rotate/revoke through owner controls and inspect the access consequences. Revocation, cancellation and record retention are separate; unresolved Calls require their own permitted recovery. |
| Integrator | Install a verified published client, connect to its exact resource origin, validate authenticated identity/scopes, use the generated operation and exact Tool schemas, and persist consequential request identity. | Read the same work after interruption. Verify the supported release combination before upgrading/reconnecting. Disconnect local credentials and uninstall only after preserving unresolved recovery records and arranging server-side revocation where required. |
| Provider | Establish entitlement and a Provider Connection, retain secure connection/draft handoffs, preview and test the exact contract, publish, and inspect the resulting Tool and Calls. | Use the authenticated `maintenance` tuple returned by publish or status; add the operation’s retained idempotency key. A stale or legacy publication may omit the tuple and require owner repair. Recheck, withdraw or republish through the supported operation; inspect offboarding and connection cleanup independently. Earnings and conventional async completion remain qualified separately. |

These task boundaries describe the supported source and its handoffs. They do not establish completion of all four persona acceptance gates. Unavailable financial reads, missing maintenance identity on a legacy or stale publication, or a deployment-specific authority refusal must remain visible rather than being repaired by guessing private identifiers or using founder privileges.

## Data, receipts and lifecycle

Review the disclosed recipient before releasing input. Some AI-assisted searches release the query and bounded candidate summaries to the displayed recipient; discovery does not mean no data release. A Provider receives the selected service input under its contract. Funding/payment, platform privacy and Provider terms describe different relationships.

Current alpha content retention and founder-review scope are described in the [platform privacy contract](designs/platform-data-privacy.md#approved-alpha-learning-change--4-october-2026). Financial/audit records and public blockchain transactions have separate retention constraints. Do not infer a blanket no-retention promise, Australian-only processing or deletion of blockchain records.

Use Account activity, receipts and permitted owner recovery controls for inspection and offboarding. Financial resolution and Provider earnings are different from Tool delivery. The complete Australian Seller/Provider obligation/tax/document record remains explicit product work; a payment receipt alone does not prove it is complete.
