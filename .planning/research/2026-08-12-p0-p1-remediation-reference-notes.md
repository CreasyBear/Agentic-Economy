# P0/P1 remediation reference notes — 2026-08-12

This is a primary-source mechanics note for the current scoped P1 plan. The accepted P0 count is zero. Scope is PRA-001–PRA-005; folded buyer anger-test #2/#3; reopened WGA-002 and WGA-004; reopened SG-017; open SG-011; and SG-024 as the hosted-certification boundary. P2 PRA-006/PRA-007/WGA-015/SG-016 are out of scope except where named as dependencies.

**Evidence labels.** `Normative` means an all-caps requirement in a standard/specification. `Documented contract` means behavior promised by a first-party library or vendor document. `Example/heuristic` is illustrative and is not an acceptance gate. The AE decisions below preserve the incumbent owners supplied by the plan: exact money ledger; operation worker/invocation idempotency; Answer reservation/checkpoint/finalization; `customerRequestRouteWorkpool` provider cleanup; canonical Service/OAuth schemas; x402 readiness; and the strict hosted receipt. This note makes no claim that any hosted or live-money proof currently exists.

## 1. Brendan Gregg USE Method

**Primary source:** Brendan Gregg, [The USE Method](https://www.brendangregg.com/usemethod.html) (author-maintained overview; last updated 2017-08-24).

**Exact mechanic to adopt (author guidance, not a formal standard):**

- Start with a **resource inventory** (physical components and, where meaningful, software resources or imposed limits), rather than starting from whichever metrics happen to be available.
- For **every resource**, check **utilization**, **saturation**, and **errors**. Utilization is busy time/capacity used; saturation is extra work that cannot be serviced, often a queue or wait; errors are error events.
- Put the tool and statistic beside each checklist item. If a signal is unavailable, write **`?`**. `?` is a known unknown, not zero, no error, healthy, or proof of absence. A long average can hide a short saturated burst.
- Gregg's resource lists, mappings, and high-utilization examples are examples. A stated threshold is not a universal pass/fail value.

**AE decision informed:** Use a small resource × `{utilization, saturation, errors}` checklist for operational triage around Workpool/worker capacity, transaction conflict/error signals, and external rails **only where a signal has a defined owner**. Preserve `?` in evidence and review. Use this method early to find resource bottlenecks and error events; keep correctness, integrity, authorization, privacy, and security proof on their own authority paths.

**Observable proof target:** A review artifact can enumerate resources and show each U/S/E cell as an observed value or `?`, without converting missing data to a healthy result. This is a plan proof target, not a claim about current telemetry.

**What it does not justify:** USE is not a correctness, security, authorization, data-integrity, or payment-settlement method. Low utilization/no saturation/no errors only narrows a performance investigation. It does not justify a new dashboard, telemetry registry, generic monitoring framework, or replacing the incumbent kernel gates. Gregg explicitly describes USE as one tool in a larger methodology toolbox.

## 2. x402 payment lifecycle

**Primary sources:** [HTTP 402](https://docs.x402.org/core-concepts/http-402), [Client / Server](https://docs.x402.org/core-concepts/client-server), [Facilitator](https://docs.x402.org/core-concepts/facilitator), and the [Payment-Identifier (Idempotency) extension](https://docs.x402.org/extensions/payment-identifier).

**Exact mechanic to adopt (x402 documented protocol lifecycle):**

1. An unpaid request receives `402 Payment Required` and `PAYMENT-REQUIRED`, which carries accepted payment requirements.
2. The client selects a requirement, creates/signs a payment payload, and retries with `PAYMENT-SIGNATURE`.
3. The resource server verifies the payload, locally or through a facilitator. Verification is distinct from execution/settlement.
4. After successful verification, the server performs the requested work, settles directly or through a facilitator, and returns `PAYMENT-RESPONSE` with the settlement result. Failed settlement is an error response, not a successful paid resource.
5. A facilitator verifies and settles on behalf of the server and is documented as non-custodial. The public `x402.org` facilitator is documented for development/testnet workflows; production mainnet use requires an appropriate production facilitator, self-facilitation, or another explicitly chosen path.
6. The payment-identifier extension is opt-in: when advertised, one payment ID belongs to the logical request, survives retries/restarts, and lets a server return a cached result rather than re-process payment. Direct Solana settlement has a documented duplicate-submission race and requires equivalent short-lived duplicate detection.

**AE decision informed:** Keep provider-direct x402 and AE-internal charging as distinct rails. The existing x402 readiness owner must distinguish requirement, signature/verification, settlement, and settlement response; the existing operation/invocation idempotency owner must derive one stable logical payment/command identity across retries. The exact money ledger remains authoritative for AE-internal debit, supplier accrual, rake, transfer, payout, and reconciliation. A provider-direct x402 settlement remains rail-specific evidence and must create no AE-internal debit, accrual, or rake.

**Observable proof target:** For each rail, a signed-but-unsettled attempt is not a settled charge; a settlement failure cannot produce a paid result; replaying the same logical payment ID does not re-process the payment when the extension is supported; rail-specific duplicate protection is visible. These are acceptance targets, not observations of current runtime behavior.

**What it does not justify:** A valid signature is not proof that money settled. The x402 docs do not authorize collapsing provider-direct and AE-internal rails into a generic balance, assuming the public facilitator is production custody, or replacing the exact money ledger/reconciliation path. The optional payment-identifier extension is not universal idempotency unless both sides advertise/use it. x402 also does not prescribe AE Answer checkpointing, output-validation policy, or payout accounting.

## 3. Stripe Connect, transfers, payouts, and idempotency

**Primary sources:** [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), [Accept a payment using separate charges and transfers](https://docs.stripe.com/connect/marketplace/tasks/accept-payment/separate-charges-and-transfers), [Create a transfer](https://docs.stripe.com/api/transfers/create), and [Pay out to connected accounts](https://docs.stripe.com/connect/marketplace/tasks/payout).

**Exact mechanics to adopt (Stripe documentation):**

- A POST idempotency key causes Stripe to save and return the first status/body for that key, including a `500`; reusing it with different parameters errors. Keys can be removed after at least 24 hours, and validation/concurrent-conflict requests may not save a result. Idempotency keys belong on POST, not GET/DELETE.
- A platform charge and a Connect transfer are decoupled. `transfer_group` associates objects but does not reserve funds or control payout timing. `source_transaction` binds a transfer to a charge's funding/availability; a transfer can wait for that charge's funds. Transfer amounts are integer smallest-currency units, may be split across accounts, and an insufficient-balance transfer is not automatically retried.
- A **transfer** moves platform Stripe balance to a connected account's Stripe balance. A **payout** moves connected balance to an external bank account/debit card and follows a separate schedule. Stripe documents `payout.created`, `payout.updated`, `payout.paid`, and `payout.failed`; a failed payout disables the external account involved until it is updated.

**AE decision informed:** PRA-002/PRA-003 should keep immutable command/charge/transfer/payout identities and explicit outcome/reconciliation states in the exact money ledger. Model transfer and payout as different events; use a source linkage where the provider supports it; preserve the current-month payout gate before later accrual. Use an idempotency key derived from the logical money command, not a fresh timestamp. Reconcile an unknown response by the provider's durable identity rather than blindly creating another transfer or payout.

**Dependency order:** Stable money-command identity and ledger reservation first; provider transfer/payout invocation second; provider readback/webhook reconciliation third; accrual/payout gate evaluation after the authoritative state is known.

**Observable proof target:** Same Stripe idempotency key and same parameters return the same first result; different parameters are rejected; a transfer cannot be mistaken for a payout; a payout failure remains distinguishable from a successful transfer; repeated recovery does not create a second money command. These are plan proof targets, not current runtime claims.

**What it does not justify:** Stripe's idempotency layer does not make an AE Convex mutation or an external provider effect globally exactly-once, and its retention window is not an indefinite ledger. `transfer_group` is not a reservation or payout control. A transfer is not a bank payout; a webhook/event is not, by itself, the complete AE hosted-money receipt. Stripe objects do not replace the exact AE ledger, frozen-period/accounting policy, or x402 settlement evidence.

## 4. Convex transactions/OCC and the installed Workpool component

**Primary sources:** Convex [OCC and Atomicity](https://docs.convex.dev/database/advanced/occ), [Mutations](https://docs.convex.dev/functions/mutation-functions), [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions), and the installed first-party `@convex-dev/workpool@0.4.9` README/API (repository source: [get-convex/workpool](https://github.com/get-convex/workpool/blob/main/README.md)).

**Exact mechanics to adopt:**

- **Normative/documented Convex behavior:** A mutation reads a consistent view and commits its database writes atomically. Convex uses the read set for optimistic concurrency; on a conflict it may re-run the mutation. This requires deterministic mutation code. Convex explicitly directs third-party/irreversible effects such as payment-provider calls into actions rather than mutations. Scheduling from a successful mutation is atomic with that mutation; Convex documents scheduled mutations as exactly-once with transient internal retries, while scheduled actions are at-most-once and are not automatically retried because they may have side effects.
- **Documented Workpool contract:** Workpool limits parallel action/mutation execution with `maxParallelism`; action retries/backoff are for idempotent actions and are configurable. The README documents an `onComplete` callback for success, failure, or cancellation, and states that it runs in a different transaction from the enqueued job. A started cancellation may let the current work finish but prevents retry. Mutation jobs rely on Convex's own deterministic OCC retry rather than Workpool action retry. Work status is retained for a configurable TTL (the installed README documents one day by default).

**AE decision informed:** Keep Answer reservation/checkpoint/finalization mutations, operation worker/invocation identity, and cleanup-attempt persistence inside their incumbent Convex transaction owners. Keep x402/Stripe/provider effects in actions. Reuse the existing `customerRequestRouteWorkpool` for provider cleanup; atomically bind the enqueued work ID and exact cleanup attempt to the connection row in the same outer mutation; use `retry: false` for a non-idempotent effect; make the completion callback short, total, and idempotent. This is reuse of the incumbent seam, not a new queue, ledger, or state machine.

**Dependency order:** Durable reservation/checkpoint or cleanup command identity → atomically enqueue and bind work identity in the owning mutation → action effect and bounded retries only when idempotent → separate callback transaction records the terminal result → owner recovery reconciles unknown/possibly-released work.

**Observable proof target:** OCC retry cannot commit a partial reservation/checkpoint; a provider effect is not placed in a retryable action without a stable idempotency identity; cleanup has an attempt record before enqueue; callback replay is harmless; cancellation/recovery leaves an explicit terminal or reconciliation state. These are proof targets, not current runtime claims.

**What it does not justify:** Convex OCC retries do not make external calls exactly-once, do not settle money, and do not eliminate a cancellation race around an already-started action. Workpool is not an exactly-once payment system; `onComplete` is not the job's transaction; status TTL is not durable certification evidence. Do not introduce a second queue/work ledger or generic workflow framework from these mechanics.

## 5. MCP authorization, OAuth registration, and device flow

**Primary sources:** current MCP authorization spec ([2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [client registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)); [RFC 7591 — OAuth 2.0 Dynamic Client Registration](https://www.rfc-editor.org/rfc/rfc7591); [RFC 8628 — OAuth 2.0 Device Authorization Grant](https://www.rfc-editor.org/rfc/rfc8628).

**Exact mechanics to adopt:**

- **Normative MCP requirements for HTTP authorization:** Authorization is optional, but an HTTP implementation that supports it SHOULD follow the MCP authorization spec. The MCP server MUST expose OAuth Protected Resource Metadata and clients MUST use it for authorization-server discovery. The authorization server MUST provide OAuth AS metadata (RFC8414) or OIDC discovery, and clients MUST support the specified discovery mechanisms.
- Before authorization, a client MUST obtain a client ID using the registration priority in the current MCP spec: pre-registration, Client ID Metadata Documents, Dynamic Client Registration (DCR) fallback, then user-supplied configuration. Current MCP marks DCR deprecated/backwards-compatible and says it MAY be supported. The access token request and authorization request MUST carry the canonical MCP `resource`; bearer tokens MUST be sent in the `Authorization` header on every HTTP request and MUST NOT be put in the query string. Token audience/resource binding and HTTP 401/403 handling are explicit requirements.
- **RFC 7591 normative registration mechanic:** A registration request submits client metadata (including redirect URIs); the response returns a client identifier and registered metadata. An authorization server MAY require an initial access token or software statement; how those are issued is outside the RFC.
- **RFC 8628 normative device mechanic:** The device authorization endpoint returns `device_code`, `user_code`, verification URI, expiry, and optional polling interval. The user authorizes on a second device; the client polls the token endpoint with the device code, waits at least the advertised interval (5 seconds if omitted), increases the interval on `slow_down`, and stops on approval, denial, or expiry. Device flow is for constrained/no-browser devices and is not a replacement for browser OAuth on capable native apps.

**AE decision informed:** WGA-004's narrow repair is governed by AE's actual registration handler and device-flow constants: emit the required client metadata, scopes, endpoints, and polling behavior that the current handler accepts. For MCP interoperability, generated metadata should also describe the server's supported registration mechanism, issuer/resource, and endpoints without presenting DCR or device flow as universal MCP requirements. Keep the canonical Service/OAuth schemas as the authority; do not create a generic OAuth registry or rewrite the Service representation based on MCP prose. WGA-002 generated Service guidance can link to these mechanics but cannot infer unsupported provider capabilities.

**Observable proof target:** A recipe records the discovered issuer and exact resource/redirect/registration mechanism; tokens are audience-bound and sent only in the bearer header; device polling honors `interval`/`slow_down` and terminal errors; an unsupported mechanism is reported as unsupported rather than presented as a working path. These are plan proof targets, not runtime claims.

**What it does not justify:** MCP does not require every server to support authorization, DCR, device flow, or one universal registration recipe. DCR is explicitly a deprecated compatibility option in the current MCP spec. RFC 7591 does not discover a registration endpoint or grant client access by itself, and RFC 8628 does not authenticate the user or guarantee a token. None of these sources overrides AE's canonical OAuth/Service authority or supplies provider credentials.

## 6. GitHub artifact attestations and SG-024

**Primary sources:** GitHub [Artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations) and [Using artifact attestations to establish provenance for builds](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

**Exact mechanic to adopt (GitHub documented supply-chain evidence):** An artifact attestation is a cryptographically signed claim linking a built artifact to its workflow, repository/organization, environment, commit SHA, triggering event, and OIDC-derived identity. GitHub documents generating attestations for a binary or immutable image digest and verifying them with `gh attestation verify`. GitHub also explicitly warns that an attestation is **not a guarantee that the artifact is secure**; it links consumers to source/build information so they can apply their own policy.

**AE decision informed:** SG-024 may use verified artifact provenance as one input to the strict hosted receipt: bind the exact hosted build/deployment revision or immutable digest to its source/workflow identity, then separately record the hosted live smoke and money/x402 evidence. The strict hosted receipt remains the authority; no artifact registry, dashboard, or provenance ledger is introduced.

**Observable proof target:** The receipt verifies the exact artifact/digest and source revision, and the live check is explicitly tied to that revision. The hosted receipt must still show the required runtime/configuration and payment/custody observations; unavailable observations remain `?` and cannot be called certified.

**What it does not justify:** A GitHub attestation alone does not prove that a particular deployment is serving that artifact, that hosted secrets/configuration are correct, that x402 funds settled, or that a payout succeeded. It does not replace the strict hosted receipt or permit a hosted-certification claim without the separately required live evidence.

## 7. Cross-source dependency order and non-goals

1. Preserve stable identities and atomic durable rows in the incumbent money, operation, Answer, and provider-cleanup owners.
2. Keep rail-specific x402 verification/settlement and Stripe transfer/payout effects outside Convex mutation transactions; use stable idempotency and explicit reconciliation.
3. Persist cleanup/checkpoint/finalization intent before Workpool enqueue or external effect; use the existing Workpool seam only.
4. Generate OAuth guidance from discovered metadata and the provider's supported registration/device mechanism; do not advertise an unsupported path.
5. Bind SG-024 provenance to the exact hosted artifact/revision, then collect strict live evidence; until that evidence exists, hosted certification is unavailable (`?`).
6. Apply USE only as an early resource/utilization/saturation/error checklist. `?` is an explicit unavailable signal. It is never a correctness, security, money, or certification substitute.

**Non-goals:** no new state machine, queue, ledger, docs registry, dashboard, generic OAuth/payment framework, or framework substitution; no claim that a source document closes a P1 root; no source-code changes in this research note.
