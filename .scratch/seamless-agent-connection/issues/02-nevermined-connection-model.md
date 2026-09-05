# Map Nevermined's connection model

Type: research
Status: resolved
Blocked by:

## Question

How does current Nevermined move a developer or agent from first contact through SDK/MCP setup, authentication, delegation, verification, and usable readiness; which parts feel familiar, which dependencies implement them, and which documented or observed papercuts must AE avoid?

Use the existing Nevermined scavenger corpus first. Distinguish public browsing, authenticated identity, payment-method setup, delegated spending, and successful paid-use readiness. Record exact first-party sources and concrete reusable patterns; do not propose AE-specific design yet.

## Answer

### Decision-grade read

Nevermined does **not** model “connected” as one state. Its familiar journey is a staircase of independent capabilities:

```text
publicly discoverable
  -> client installed / endpoint configured
  -> human identity connected
  -> environment-specific credential issued
  -> payment method enrolled or wallet funded
  -> immutable Delegation active
  -> payment permission minted
  -> permission verified
  -> work executed
  -> settlement observed
```

That separation is the most useful reference behavior. A person or agent can browse first. Authentication connects an identity or connector. A payment method makes funding possible. A Delegation makes bounded spending possible. A successful paid call proves the particular path worked. None of those earlier states alone proves paid-use readiness.

Nevermined has no single documented `ready_to_buy` object or end-to-end readiness probe. **INFERRED:** paid readiness is a composite of a valid environment credential, a compatible and funded payment method, one unexpired/unrevoked/unexhausted Delegation, a resolvable Plan/Agent or Catalog target, and a successful verify/settle path. The public Catalog can show health, but that is service-wide discovery evidence rather than caller-specific payment readiness.

Local evidence: `.planning/nevermined-docs/01-PRODUCT-AND-APP.md:97-119`, `.planning/nevermined-docs/02-API-AND-PROTOCOL.md:125-159`, `.planning/nevermined-docs/02-API-AND-PROTOCOL.md:192-215`, and papercuts NVM-004, NVM-007, NVM-010, NVM-034-NVM-037, NVM-063 and NVM-097 in `.planning/nevermined-docs/NEVERMINED-SCAVENGE-PAPERCUTS.md`.

### Reference sequence and visible states

| Stage | What the person or agent sees/does | Underlying state | Evidence |
|---|---|---|---|
| 1. First contact | Browse `nevermined.app/catalog`, search/filter, open a service, or read a provider's `llms.txt`, `agentic-instructions.md` or `ai-catalog.json`. A detail page offers copyable Prompt, Skill, MCP and Router instructions. | No identity, key, funding or Delegation is required. Public UI, unauthenticated API and ARD are projections of listed supply. | **OBSERVED/PUBLISHED.** [Catalog](https://nevermined.app/catalog/) · [Discover services](https://nevermined.ai/docs/products/catalog/discover) · [Agentic integration](https://nevermined.ai/docs/solutions/organizations/agentic-integration). Local: `01-PRODUCT-AND-APP.md:101`, `:113`, `:142-155`; NVM-004. |
| 2. Choose an integration surface | Copy a prompt/instruction, install the TypeScript or Python package, configure an MCP endpoint, or call Router directly. SDK users initialize one `Payments` facade with a Nevermined key; browser-capable TypeScript clients can call `connect()`. | Transport choice is separate from identity and payment. Public discovery can already be tested before auth. | **PUBLISHED/OBSERVED.** [TypeScript SDK](https://github.com/nevermined-io/payments) · [Python SDK](https://github.com/nevermined-io/payments-py) · [MCP integration](https://nevermined.ai/docs/integrations/mcp). Local: `03-TYPESCRIPT-SDK.md:38-62`, `:118-123`; `04-PYTHON-AND-INTEGRATIONS.md:32-57`. |
| 3. Connect the human identity | Sign in to the hosted App. Current auth docs describe Privy with Google or email OTP. A browser callback, OAuth authorization-code flow, or device-code flow returns control to the connector/headless client. | Hosted human account/session. OAuth clients are pre-registered; authorization code requires exact redirect URI and S256 PKCE. Device authorization requires a registered connector and currently an `agent_id`. | **PUBLISHED.** [Authentication overview](https://nevermined.ai/docs/integrate/authentication/overview) · [OAuth OpenAPI](https://github.com/nevermined-io/docs/blob/main/api-reference/oauth-openapi.json). Local: `02-API-AND-PROTOCOL.md:125-153`; NVM-034. The protected App was not observed with an account (`01-PRODUCT-AND-APP.md:157-167`). |
| 4. Issue an authenticated credential | Create an environment-specific API key in Profile, or receive a bounded credential through OAuth. The TypeScript browser helper redirects through Nevermined and removes returned key/account query parameters from the visible URL. | NVM API key or OAuth token. Sandbox and live are separate. The OAuth `resource` determines whether the result is account/API access or an x402 permission. An `AgentBinding` persists connector consent and can be listed/revoked. | **PUBLISHED/OBSERVED in SDK source.** [Authentication overview](https://nevermined.ai/docs/integrate/authentication/overview) · [browser connect source](https://github.com/nevermined-io/payments/blob/1305b50f9bcaa1628032bbbfdd43205f578029fa/src/payments.ts#L152-L189). Local: `02-API-AND-PROTOCOL.md:129-153`; `03-TYPESCRIPT-SDK.md:120-123`; NVM-032, NVM-034-NVM-035. |
| 5. Prove basic authenticated access | The SDK/API sends `Authorization: Bearer ...`; MCP authenticates the HTTP session with OAuth Bearer. | Authenticated identity/session only. MCP payment remains separate in tool-call metadata. | **PUBLISHED/OBSERVED.** [MCP docs](https://nevermined.ai/docs/integrations/mcp) · [MCP source](https://github.com/nevermined-io/payments/tree/1305b50f9bcaa1628032bbbfdd43205f578029fa/src/mcp). Local: `02-API-AND-PROTOCOL.md:137-159`; `03-TYPESCRIPT-SDK.md:184-197`; `04-PYTHON-AND-INTEGRATIONS.md:114-120`; NVM-063. |
| 6. Make funding available | Use the default ERC-4337 smart-account route and fund it on the required network, or complete one hosted card-enrollment ceremony. Visa additionally requires a WebAuthn/passkey ceremony for each Delegation. | Payment method exists and may have funds. This is still not spending permission. Card details remain in PSP/VGS-hosted surfaces rather than the agent process. | **PUBLISHED.** [Payments overview](https://nevermined.ai/docs/products/payments/overview) · [Card enrollment](https://nevermined.ai/docs/products/payments/card-enrollment) · [Card Delegation](https://nevermined.ai/docs/solutions/card-delegation). Local: `01-PRODUCT-AND-APP.md:102-104`, `:161-163`; NVM-007, NVM-037. |
| 7. Grant bounded spending | In the App or SDK, choose provider/currency, lifetime cents limit, duration and optional transaction cap, API-key, Plan, recipient, payment method or organization-wallet scope. | A create-first immutable Delegation becomes `Active`. Only `Active` can be used. It later becomes `Exhausted`, `Expired` or `Revoked`; widening requires revoke-and-recreate. | **PUBLISHED/OBSERVED in SDK source.** [Delegations](https://nevermined.ai/docs/products/payments/mandates) · [Delegation selection](https://nevermined.ai/docs/products/payments/mandate-selection). Local: `02-API-AND-PROTOCOL.md:192-215`; `03-TYPESCRIPT-SDK.md:124-148`; NVM-009, NVM-036. |
| 8. Mint call-level payment material | The buyer references an existing `delegationId` to obtain the x402 access/payment token. Inline Delegation creation is deprecated. | Bearer payment credential tied to Nevermined Plan/Agent/payment requirements and the selected Delegation. It is not the login/session credential. | **PUBLISHED/OBSERVED.** [x402 developer guide](https://nevermined.ai/docs/development-guide/nevermined-x402) · [Delegation selection](https://nevermined.ai/docs/products/payments/mandate-selection). Local: `01-PRODUCT-AND-APP.md:104-106`; `03-TYPESCRIPT-SDK.md:126-154`. |
| 9. Verify and use | Raw HTTP receives a 402 challenge, mints/selects the accepted scheme, retries with `payment-signature`; MCP sends `_meta["x402/payment"]`. The Provider verifies before work, then settles after work. | `challenge -> permission -> verified -> executed -> settled/failed/unknown`. MCP session auth and per-call payment remain orthogonal. | **PUBLISHED/OBSERVED.** [Facilitator flow](https://nevermined.ai/docs/products/x402-facilitator/how-it-works) · [MCP integration](https://nevermined.ai/docs/integrations/mcp). Local: `01-PRODUCT-AND-APP.md:105-107`; `02-API-AND-PROTOCOL.md:217-251`; NVM-063. |
| 10. Confirm practical paid readiness | Read the payment response/receipt, remaining Plan balance, Delegation transaction/status, or Router ledger record. Repeat use can skip the human ceremonies while the key, funding and Delegation remain valid. | There is no separate global readiness state. The strongest proof is a successful sandbox paid call plus readable current authority/funding state; for Router Mode A or missing receipts, the payment may remain `Issued`. | **PUBLISHED; composite readiness is INFERRED.** [Check credits](https://nevermined.ai/docs/agents-guide/check-credits) · [Router ledger](https://nevermined.ai/docs/products/catalog/router/ledger). Local: `01-PRODUCT-AND-APP.md:107-109`, `:115-119`; `02-API-AND-PROTOCOL.md:174-190`. |

### The state model is deliberately orthogonal

Nevermined's reference model is clearer when represented as several small state machines instead of one onboarding percentage:

```text
Discovery
  public / listed / readable

Identity connection
  pending -> approved -> credential issued -> refreshed | revoked | expired

Payment method
  absent -> enrollment pending -> enrolled
  smart wallet: provisioned -> unfunded | funded

Delegation
  Active -> Exhausted | Expired | Revoked

Payment permission
  absent -> challenged -> issued -> verified -> settled | failed | outcome unknown

Catalog service health
  Validating -> Live -> Degraded | Action needed -> Removed
```

**PUBLISHED:** the Delegation and catalog-health states are explicitly documented. **PUBLISHED/OBSERVED:** OAuth error/revocation states and payment uncertainty are present in API/docs/SDK behavior. **INFERRED:** the combined readiness interpretation is not a first-class Nevermined state.

This explains the familiar UX: browse immediately; connect once; authorize money separately; reuse until a clearly named prerequisite expires or is revoked.

### Maintained standards, libraries and hosted services underneath the journey

| Concern | Nevermined relies on | Evidence status and boundary |
|---|---|---|
| Hosted human sign-in | Privy; current docs describe Google/email OTP | **PUBLISHED.** [Authentication](https://nevermined.ai/docs/integrate/authentication/overview). Older App docs still say Web3Auth, so the older page is not current authority. |
| Browser/CLI/headless consent | OAuth 2.1 Authorization Code, mandatory S256 PKCE; RFC 8628 Device Authorization; refresh tokens; RFC 7009-like revocation | **PUBLISHED.** [OAuth OpenAPI](https://github.com/nevermined-io/docs/blob/main/api-reference/oauth-openapi.json). Connector registration is static/pre-registered on this Nevermined OAuth surface. |
| Discovery of auth servers/resources | RFC 8414 authorization-server metadata, RFC 9728 protected-resource metadata, JWKS with ES256K/secp256k1 | **PUBLISHED.** Local: `02-API-AND-PROTOCOL.md:125-133`. |
| API clients | `@nevermined-io/payments` (ESM TypeScript) and `payments-py` | **OBSERVED.** Both are active first-party SDKs backed by the hosted Nevermined control plane. They are handwritten clients, not generated from OpenAPI. Local: `03-TYPESCRIPT-SDK.md:38-44`; `04-PYTHON-AND-INTEGRATIONS.md:32-57`. |
| Agent/tool transport | MCP Streamable HTTP and OAuth for session auth; x402 v2 in `_meta` for payment; A2A via `@a2a-js/sdk` 0.3; raw HTTP 402 | **OBSERVED/PUBLISHED.** [MCP docs](https://nevermined.ai/docs/integrations/mcp) · [A2A docs](https://nevermined.ai/docs/integrations/a2a). The MCP server's dynamic registration endpoints are distinct from Nevermined's pre-registered general connector OAuth API. |
| HTTP framework integration | Express middleware and FastAPI decorators/middleware | **OBSERVED/PUBLISHED.** [TypeScript package](https://github.com/nevermined-io/payments) · [Python package](https://github.com/nevermined-io/payments-py). |
| Card enrollment and charging | Stripe, Braintree, Visa and VGS; PSP/VGS-hosted capture keeps raw card data away from the agent | **PUBLISHED; hosted enforcement not source-visible.** [Payments](https://nevermined.ai/docs/products/payments/overview) · [Card enrollment](https://nevermined.ai/docs/products/payments/card-enrollment). |
| Stablecoin route | ERC-4337 smart accounts; sandbox defaults to Base Sepolia and live to Base mainnet | **PUBLISHED/OBSERVED in SDK configuration.** [Smart-account specification](https://nevermined.ai/docs/specs/x402-smart-accounts). |
| Machine discovery | Public Catalog REST, ARD feed, `llms.txt`, `agentic-instructions.md`, `ai-catalog.json` | **OBSERVED/PUBLISHED.** [Live ARD](https://api.live.nevermined.app/.well-known/agent-services-catalog.json) · [Agentic integration](https://nevermined.ai/docs/solutions/organizations/agentic-integration). |
| Version/error operation | `Nevermined-Version` major/minor contract pin; structured `BCK.*` errors with retryability, hint, docs URL and correlation ID | **PUBLISHED/OBSERVED.** [API versioning](https://nevermined.ai/docs/development-guide/api-versioning) · [API errors](https://nevermined.ai/docs/development-guide/api-errors/overview). Local: `02-API-AND-PROTOCOL.md:288-345`. |

### Recovery behavior the reference exposes

| Failure | Current recovery path | Evidence |
|---|---|---|
| OAuth approval still pending or polling too fast | Continue device polling on `authorization_pending`; slow on `slow_down`; stop and restart on `access_denied` or `expired_token`. | **PUBLISHED.** `02-API-AND-PROTOCOL.md:149-153`. Nevermined documents nonstandard `Retry-After-short` / `Retry-After-long` headers, a papercut. |
| Token or connector consent should be removed | Revoke token; list AgentBindings; revoke one binding independently. Unknown/already-revoked token revocation succeeds idempotently. | **PUBLISHED.** [OAuth OpenAPI](https://github.com/nevermined-io/docs/blob/main/api-reference/oauth-openapi.json). |
| Wrong environment | Sandbox and live have independent identities, keys, balances and organizations; obtain/use the credential for the target environment. | **PUBLISHED.** [Buyer guide](https://nevermined.ai/docs/getting-started/ai-agent-purchase#sandbox-vs-live). The key prefix normally selects the backend. |
| Payment method absent | Resume hosted card enrollment or fund the smart-account wallet. Callback sessions return `paymentMethodId`, optional `delegationId`, and echoed CSRF state. | **PUBLISHED.** [Card Delegation](https://nevermined.ai/docs/solutions/card-delegation); local `02-API-AND-PROTOCOL.md:326-331`. |
| Delegation expired, exhausted, revoked or wrong scope | Create a new immutable Delegation. Explicit ID wins; otherwise API-key-linked eligible Delegations are considered; ambiguity fails rather than silently choosing. | **PUBLISHED/OBSERVED.** [Delegations](https://nevermined.ai/docs/products/payments/mandates) · [selection](https://nevermined.ai/docs/products/payments/mandate-selection). |
| 402 payment required | Read the advertised schemes/requirements, mint against the selected Delegation, and retry with payment material. | **PUBLISHED.** [Facilitator](https://nevermined.ai/docs/products/x402-facilitator/how-it-works). |
| API failure | Inspect stable error code/status, `retryable`, hint, docs URL and correlation ID. | **PUBLISHED.** [Errors](https://nevermined.ai/docs/development-guide/api-errors/overview). |
| Router retry after uncertain response | Reuse the same work-derived `requestId`; Mode B returns the original payment ID rather than paying twice. | **PUBLISHED.** [Router flow](https://nevermined.ai/docs/products/catalog/router/how-it-works#mode-b--the-router-calls-the-merchant-recommended). |
| Router payment issued but settlement not proven | Query/export the Router ledger and reconcile the merchant reference. Mode A can remain `Issued` if the buyer does not report settlement. | **PUBLISHED.** [Router ledger](https://nevermined.ai/docs/products/catalog/router/ledger). This is a recovery anchor, not full proof or remedy. |
| SDK/setup process crashes part-way | No first-class setup workflow was found; callers must retain Agent, Plan, Delegation and purchase identifiers and resume manually. | **INFERRED from OBSERVED API shape.** NVM-077; `.planning/nevermined-docs/04-PYTHON-AND-INTEGRATIONS.md:150-170`. |

### Familiar patterns worth carrying into the contrast

These are reference behaviors, not an AE design proposal:

1. **Browse before sign-in.** Public human, LLM and machine views all lead to the same supply without demanding credentials.
2. **Choose the client surface first.** Prompt, Skill, MCP, Router, TypeScript and Python are recognizable entry choices, not internal platform nouns.
3. **Use standard browser and device authorization.** Hosted approval keeps long-lived credentials out of copy/paste where the connector supports OAuth.
4. **Make the one-time human steps honest.** Nevermined explicitly acknowledges login, card enrollment and Visa passkey approval rather than claiming zero-touch autonomy.
5. **Separate session identity from payment.** MCP OAuth Bearer opens/authenticates the session; call payment travels separately in x402 metadata.
6. **Create spending authority once, then reuse it.** Delegations are bounded, immutable and revocable; the routine paid-call path references a stable ID.
7. **Make ambiguity fail visibly.** Nevermined prefers explicit Delegation ID, then an API-key binding, and refuses ambiguous eligible choices.
8. **Derive environment from the credential.** The key prefix reduces a configuration choice and makes sandbox/live mismatch visible.
9. **Return operational recovery data.** Correlation IDs, retryability, hints, docs links, receipts, balance and Delegation status give the client somewhere concrete to go.
10. **Treat a successful sandbox call as the strongest connection check.** **INFERRED:** because there is no unified readiness object, executable proof outranks configuration-complete claims.

### Papercuts and false-familiarity to avoid in the comparison

1. **No single readiness answer.** The user must mentally join key validity, environment, payment method, funds, Delegation, Plan scheme and endpoint health. Catalog health is not caller readiness. NVM-097.
2. **Authentication generations conflict.** Current auth docs say Privy; the older App page says Web3Auth. The protected App was not authenticated during the scavenge, so exact current screens are `PUBLISHED`, not `OBSERVED`.
3. **Key formats conflict.** Buyer docs show `sandbox:` / `live:` while a current Catalog snippet shows `nvm_sk_live_…`; migration/support behavior is not explained.
4. **OAuth `resource` changes credential type.** The same ceremony may yield an API key or an x402 permission. This is powerful but easy to misunderstand.
5. **Device polling is almost standard, not fully standard.** It uses standard OAuth errors but documents nonstandard retry headers.
6. **General connector OAuth requires pre-registration while MCP surfaces advertise dynamic client registration.** These are separate servers/use cases, but the distinction is easy to miss.
7. **Browser connect returns powerful material through callback query parameters.** The SDK scrubs the visible URL, but redirect integrity, history, logging and hosted-flow availability remain trust dependencies.
8. **Credential claims are decoded locally without signature verification.** The SDK uses decoded `sub` and observability claims as convenience metadata; they must not be mistaken for locally authenticated identity. NVM-059.
9. **API key power can exceed “connect an agent.”** An organization admin key may invite members or move treasury; Nevermined itself warns not to give it to an autonomous agent. NVM-114.
10. **A Delegation is funding permission, not a durable agent identity.** It may bind to an API key or Plan, but key rotation can disturb attribution/budget interpretation. NVM-008.
11. **Funding and authority can diverge.** An active Delegation without funds cannot pay. Router x402 may still reserve Delegation cap before an underfunded transfer fails, without releasing the merchant portion.
12. **Raw token mint defaults to the crypto scheme.** Higher-level adapters resolve Plan metadata; low-level callers must choose the scheme from the challenge or Plan, especially for card routes.
13. **Tutorials are not executable contracts.** The scavenger build found the TypeScript HTTP tutorial calling a stale six-argument API and the MCP tutorial missing Node types; Python examples span incompatible generations. NVM-075 and NVM-107.
14. **The managed TypeScript MCP server has a confirmed concurrency race.** Its familiar high-level start API is not sufficient production proof. NVM-064.
15. **Connection recovery stops short of a universal purchase recovery object.** Router `Issued`, plan balance, Delegation transactions and receipts live on different surfaces; no complete buyer purchase index or universal refund/reconcile path was found.
16. **Mutable organization context is dangerous.** `setOrganizationId` mutates the shared TypeScript facade; concurrent callers can cross tenant context if one singleton is reused. NVM-072.

### What is actually proved

- **OBSERVED:** the unauthenticated Catalog, service details, API/ARD discovery surfaces, active SDK source, SDK APIs, package structure, tests and documented code paths.
- **PUBLISHED:** hosted App authentication, OAuth ceremonies, card enrollment, Delegation policy/state, payment-provider behavior and authenticated dashboard journeys.
- **INFERRED:** a unified paid-readiness composite, because Nevermined does not publish one first-class readiness state or caller-specific end-to-end readiness endpoint.
- **NOT PROVED:** the exact authenticated App screens, live card enrollment, live connector approval, backend enforcement, real-rail settlement reliability or complete end-to-end recovery. The scavenger used no Nevermined account or secret. See `.planning/nevermined-docs/NEVERMINED-CORPUS-COVERAGE.md` and `.planning/nevermined-docs/01-PRODUCT-AND-APP.md:498-505`.

### Bottom line for the later reference selection

Nevermined's strongest familiar model is:

> **Public first → familiar client choice → hosted standards-based identity connection → explicit one-time funding setup → reusable bounded Delegation → per-call payment challenge → visible receipt/status.**

Its core lesson is the layering and progressive disclosure. Its main connection weakness is that the user still has to assemble “ready” from several subsystems, and its docs/examples sometimes describe different generations of those subsystems.
