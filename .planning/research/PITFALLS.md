# Domain Pitfalls

**Domain:** Safe multi-principal capability invocation and B2B provider-payment coordination
**Project:** Agentic Economy maturity rebaseline
**Researched:** 2026-08-26
**Overall confidence:** MEDIUM — HIGH for the repository forensics and accepted constraints; MEDIUM for current external protocol/framework claims because the research seam classified cross-checked WebSearch retrievals as MEDIUM even where the underlying source is primary.

## Evidence and Roadmap Vocabulary

This document separates two kinds of statements:

- **Sourced fact** means a paraphrase of a current primary/official source or an exact local forensic finding. External sourced facts are MEDIUM confidence unless noted; exact local history is HIGH confidence.
- **AE inference** means a roadmap recommendation derived by applying those facts to AE's accepted Principal/Account model and the Phase 1–2 forensic record. It is not a claim that a cited standard mandates AE's exact design.

Evidence classes are deliberately non-substitutable:

| Evidence class | What it can establish | What it cannot establish |
| --- | --- | --- |
| `architecture` | accepted trust model, threat model, boundaries, failure semantics, owners | implemented or deployed behavior |
| `source` | exact reviewed code and static boundaries at a Git ref | that a build or deployment contains those bytes |
| `test-harness` | deterministic behavior under fixtures, injected identities, mocks, and actual test registrations | hosted identity, live vault/provider/payment behavior |
| `hosted/external` | named vendor/network behavior against an exact deployed revision and environment | long-running operational readiness by itself |
| `operational` | alerts, runbooks, reconciliation, rollback, recovery, support, retention, and exercised procedures | source correctness by itself |
| `legal/commercial` | reviewed fund-flow, terms, payer/supplier posture, refund/dispute obligations, regulatory classification | technical enforcement by itself |

Recommended earliest owning phases/gates used below:

| Label | Roadmap responsibility |
| --- | --- |
| **G0 — Rebaseline design gate** | One accepted ADR, source-to-consequence map, threat model, evidence taxonomy, exact ownership, operability matrix, and repair counters before product edits. |
| **P1 — Runtime authority vertical slice** | One real registered entry through canonical Principal/Account resolution, denial/no-effect, durable effect, audit, operator path, rollback, and independent verification; then expand surface by surface. |
| **P2 — Delegation and lifecycle slice** | Multi-hop delegation, narrowing, cycles, generation revocation, consequence-time checks, complete attribution, and lifecycle controls. |
| **P3 — Connection and secret plane** | Connection ownership/sharing, SecretStore port, JIT material, rotation generations, outage behavior, recovery, and operator controls. |
| **P4 — Consequential provider and commerce slice** | Registered provider invocation, effect journal, x402/non-x402 adapters, budgets, ambiguous outcomes, reconciliation, refunds, disputes, and provider/buyer accounting. |
| **P5 — Operated release and evidence** | Cross-surface completion, canonical console/support paths, hosted proof, deployment identity, release/rollback, on-call and evidence close. |
| **P6 — Measured scale and resilience** | Load/chaos tests, retry budgets, capacity triggers, SLOs, and extraction decisions only after measured thresholds. |

## Critical Pitfalls

These failures cause unauthorized effects, money loss, regulatory drift, unrecoverable operations, or another Phase 2-style rebaseline.

### Pitfall 1: Treating a Credential as the owning or acting Principal

**What goes wrong:** A key, token, session, wallet, webhook secret, or workload credential becomes the owner of an Account or resource, or its identifier is used as the actor without resolving the current canonical Principal binding. Credential rotation then appears to transfer ownership; revocation leaves orphaned resources; and one credential reused across contexts can cross Account boundaries.

**Why it happens:** Authentication evidence is readily available at entry points, while Principal, Account, ownership, membership, and workload resolution require an additional canonical lookup. Legacy `callerId`, API-key, Clerk-user, and wallet-shaped code encourages collapsing these nouns.

**Sourced fact:** NIST SP 800-63-4 distinguishes a credential/authenticator from the subscriber account and defines authenticator invalidation as removal of a binding, not deletion or transfer of the subject. AE's accepted Phase 1 model separately locks Credentials as non-owners. [NIST SP 800-63-4](https://pages.nist.gov/800-63-4/sp800-63.html), [Authenticator lifecycle](https://pages.nist.gov/800-63-4/sp800-63b.html)

**AE inference:** Every entry must resolve `presented credential -> current Credential record -> Principal -> Account access/ownership -> resource relationship`. A Credential proves or supports authentication; it never supplies ownership, commercial identity, legal payer, supplier, or beneficiary by itself.

**Warning signs:** `credentialId`, wallet address, Clerk user ID, API key ID, or session subject stored in an `ownerId`/`accountId` field; resources survive without a Principal owner; local converters independently reconstruct identity rows; rotating a key changes authorization semantics; no negative test for a valid credential bound to the wrong Principal or Account.

**Prevention:** Use exactly one integration-owned canonical Convex adapter; preserve Credential provenance and generation; resolve ownership/membership from server-held facts; fail on ambiguous Account selection; test rotation, revocation, re-binding, deleted Principal, wrong Account, and same credential-shaped identifier in distinct namespaces.

**Detection:** Dependency scan finds zero production resolvers outside the canonical adapter; actual registered-reference tests swap each identity dimension independently and assert denial plus no durable/external effect.

**Earliest owning phase/gate:** G0 canonical-noun ADR; first executable proof in P1 runtime authority.

**Required evidence class:** `architecture + source + test-harness`; hosted Clerk/workload binding remains `hosted/external`.

### Pitfall 2: Confused-deputy invocation through platform or provider credentials

**What goes wrong:** AE has a powerful platform/provider credential and accepts caller-controlled Account, target, URL, operation, payee, or effect parameters. A caller induces AE to use its own authority for a different Principal, resource, provider, or payment recipient.

**Why it happens:** Authentication is mistaken for authorization; provider adapters are treated as trusted once connected; a signed ticket proves only that some upstream component issued it, not what exact consequence it authorized; or subject, actor, Account, Credential, payer, and beneficiary are collapsed.

**Sourced fact:** OAuth Security BCP recommends audience restriction, sender constraint, least privilege, and verification for the particular resource/action on every request. RFC 8693 separates subject and actor in delegation. AWS calls secret rotation code a privileged deputy and requires it to confirm both secret versions and the destination refer to the same resource. [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html), [RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html), [AWS rotation functions](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_lambda-functions.html)

**AE inference:** A consequence authorization must bind the complete actor/delegation chain, Principal, Account, Credential generation, operation/version, registered endpoint and method, resource identifiers, canonical input digest, budget reservation, provider Connection generation, payee, expiry, nonce/idempotency key, and intended effect class. The consequence worker independently re-resolves those bindings before using a platform secret.

**Warning signs:** caller-supplied `accountId` trusted after token validation; tickets reusable across operations or endpoints; generic `invokeAs`/`runWithCredential`; payee or provider URL accepted outside registered Connection facts; same secret can access several provider tenants without an explicit binding check; logs show only the beneficial owner or only the technical actor.

**Prevention:** Audience- and target-bound authority envelopes; server-side canonical lookup; least-privilege provider credentials; exact input/effect digests; nonce and generation checks; explicit legal payer, beneficial owner, operator, supplier, beneficiary, tax subject, technical Principal, and Credential fields; no ambient bucket of reusable capabilities.

**Detection:** Hostile tests substitute one field at a time after signing, replay at a sibling endpoint, switch Account with a valid Principal, redirect to another provider tenant, and assert refusal before any budget, payment, provider, or durable effect.

**Earliest owning phase/gate:** G0 threat model; P1 for local consequences; repeated at P3/P4 for secrets and provider/payment effects.

**Required evidence class:** `architecture + source + test-harness + hosted/external`.

### Pitfall 3: Partial entry-point coverage and raw-capability escape

**What goes wrong:** HTTP and UI paths enforce authority while MCP, CLI, callback, cron, job, worker, dashboard/CLI-invoked internal function, or reconciliation paths bypass it. Alternatively, a wrapper adds checked context but leaves raw `db`, scheduler, `run*`, or fetch capabilities available, so handlers can route around the check.

**Why it happens:** Teams count registrations or lint syntax instead of driving actual registered references. “Internal” is treated as “authorized.” Framework context-merging is assumed to remove raw capabilities when it does not.

**Sourced fact:** Convex documents that public functions are client-accessible, internal functions reduce exposure but should still validate invariants, and internal functions can be run by actions, schedules, cron, dashboard, and CLI. OWASP recommends deny-by-default authorization on every request and object. The Phase 2 assessment found 298 static registrations but no migrated runtime composition and reproduced raw-context/static-checker bypasses. [Convex internal functions](https://docs.convex.dev/functions/internal-functions), [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

**AE inference:** Framework-native wrappers are necessary but insufficient unless an explicit least-privilege membrane and actual-reference test prove which capabilities remain. Internal functions revalidate consequence invariants; they are reachability controls, not an authorization boundary.

**Warning signs:** surface inventory marked green without executions; wildcard “all handlers protected” claims; public and internal builders mixed; handlers receive full context despite claiming confinement; privileged dashboard/CLI paths absent from the matrix; callback/cron/reconciliation ownership missing.

**Prevention:** Thin registered endpoints, explicit authority wrapper objects, restricted raw-builder imports, internal-function invariant validation, and a finite registration/effect-path inventory. Expand only by vertical slices, each naming its exact registration and every consequence path.

**Detection:** Drive the generated `api`/`internal` or HTTP registered reference, not a helper. Add substitution tests at sibling registrations and direct dashboard/CLI/scheduler entry tests. Review the wrapper's installed source and types when context removal is claimed.

**Earliest owning phase/gate:** G0 source-to-consequence map; P1 actual-reference gate; every later phase inherits it.

**Required evidence class:** `source + test-harness`; dashboard/CLI/hosted middleware claims also need `hosted/external` or `operational`.

### Pitfall 4: Multi-hop delegation widens, loops, or loses the real actor

**What goes wrong:** A child grant exceeds a parent scope, target, budget, time window, or Account; a cycle or excessive chain causes ambiguity/DoS; revoking an ancestor does not revoke descendants; or the final audit records only the root owner or final agent.

**Why it happens:** Each edge is validated locally without intersecting the entire chain, delegation is represented as impersonation, or cached resolved authority is treated as permanent.

**Sourced fact:** RFC 8693 distinguishes delegation, where actor and subject remain distinct, from impersonation and supports actor-chain representation while leaving the deployment trust model to the implementer. The W3C CCG zcap draft is a useful design analogue for inherited restrictions, full ordered chains, bounded depth, expiry, revocation checks, and monotonic attenuation; it is a community draft, not an AE compliance authority. [RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html), [ZCAP draft](https://w3c-ccg.github.io/zcap-spec/)

**AE inference:** Effective authority is the monotonic intersection of every edge and current canonical Account policy. Each grant needs an immutable parent, grant generation, issuer/subject/actor attribution, Account, resource/operation constraints, budget ceiling, time bounds, and revocation lineage. Reject self-edges, repeated nodes, disconnected roots, depth overflow, widening, and missing ancestors.

**Warning signs:** only immediate parent checked; union rather than intersection of permissions; delegate may choose a new Account; no chain depth limit; deletion used as revocation; audit flattens `A -> B -> C` to C; tests cover one hop only; generation not carried into scheduled work.

**Prevention:** Canonical chain validator; explicit maximum depth; cycle detection; generation revocation propagated through ancestor lookup; complete attribution; deterministic denial codes that do not reveal unrelated resources; operator tree/revoke workflow.

**Detection:** Property/adversarial tests for every narrowing dimension, multiple hops, sibling replay, ancestor revocation, generation rollover, cycles, depth limit, expired middle edge, and actor-chain audit reconstruction.

**Earliest owning phase/gate:** G0 delegation semantics; P2 delegation vertical slice.

**Required evidence class:** `architecture + source + test-harness + operational`.

### Pitfall 5: Authorization is fresh at admission but stale at consequence time

**What goes wrong:** A request is admitted, then membership, ownership, delegation, Credential, Connection, budget, recovery freeze, or secret generation changes before a delayed job, provider call, settlement, refund, or reconciliation effect. The old snapshot still acts.

**Why it happens:** Client time or enqueue time is treated as authoritative; signed context snapshots are mistaken for current authorization; durable jobs contain an “authorized: true” result instead of references and generations; multi-step actions read inconsistent snapshots.

**Sourced fact:** Convex recommends passing document IDs rather than documents to internal functions so they operate on up-to-date state. Scheduled-function auth is not propagated. Its action documentation also warns that separate `runQuery`/`runMutation` calls are separate transactions and may observe inconsistent state. [Convex internal functions](https://docs.convex.dev/functions/internal-functions), [Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions), [Convex actions](https://docs.convex.dev/functions/actions)

**AE inference:** Revalidate with current server time immediately before every irreversible or external effect. Carry immutable intent plus IDs, versions, generations, and digests—not authority snapshots. Reserve budget atomically; re-check freeze/revocation and Connection generation after waits; define whether already-dispatched effects may finish.

**Warning signs:** `authorizedAt` used as an authorization result; `Date.now()` supplied by caller; job args contain full Principal/Account/membership rows; no test revokes between enqueue and execution; budget check and reservation are separate; refund/settle worker trusts the original caller session.

**Prevention:** Consequence-time canonical lookup, server clock, generation checks, atomic intent/reservation mutation, explicit states for admitted/ready/dispatched, and cancellation semantics that distinguish not-started from already-external work.

**Detection:** Deterministic clock-boundary and interleaving tests revoke or narrow every authority dimension after admission and before effect; assert denial/no effect or documented reconcile-only behavior.

**Earliest owning phase/gate:** P1 consequence seam; P2 delegation generation; P3/P4 repeat for Connection and commerce.

**Required evidence class:** `source + test-harness`; delayed hosted proof is `hosted/external`.

### Pitfall 6: Scheduling, callbacks, and reconciliation silently drop Principal/Account context

**What goes wrong:** A scheduled target runs without authentication, so it defaults to a system user, trusts serialized caller data, or performs an Account-less action. Provider callbacks authenticate the provider but are not bound to AE's invocation/Account. Cron or reconciliation scans cross tenant boundaries.

**Why it happens:** Authentication propagation is assumed; “background” is treated as “trusted”; provider event IDs are globally unique only within a provider account; or cron loops use an unrestricted store without per-row authority context.

**Sourced fact:** Convex explicitly states that authentication is not propagated from scheduling to the scheduled function. Stripe requires webhook signature verification but also documents duplicate and out-of-order delivery, so a valid callback still needs domain correlation and idempotent processing. [Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions), [Stripe webhooks](https://docs.stripe.com/webhooks)

**AE inference:** Every async record carries Principal, Account, complete actor chain, invocation, provider tenant/Connection, authority and secret generations, intent digest, and idempotency/correlation key. The worker treats these as lookup keys and claims, not proof, and revalidates them. Cron has an explicit narrow system Principal plus per-Account iteration and audit.

**Warning signs:** optional `accountId` on job args; a fallback platform Account; callbacks look up only by external event ID; unsigned internal HTTP is allowed because it is “inside”; reconciliation queries all unresolved rows and invokes a provider credential without Connection ownership checks.

**Prevention:** Authenticated callback admission, exact provider-account binding, durable inbox/dedup row, per-Account worker commands, consequence-time checks, and explicit system-Principal scopes. Never use scheduler possession or queue visibility as authority.

**Detection:** Cross-Account duplicate event tests, scheduled-job tampering, revoked-before-run cases, replay from a different provider tenant, cron row substitution, and direct internal-route invocation.

**Earliest owning phase/gate:** P1 async context contract; concrete provider proof in P4.

**Required evidence class:** `source + test-harness + hosted/external`.

### Pitfall 7: Blind retry after an ambiguous external effect

**What goes wrong:** AE times out after a provider may have charged, emailed, booked, transferred, or mutated state, then repeats the call. A duplicate effect occurs; or AE marks failure and refunds while the original effect later succeeds.

**Why it happens:** HTTP failure is treated as provider failure; retries are owned at several layers; idempotency keys are absent, unstable, or scoped incorrectly; “exactly once” is claimed across a network boundary; unknown state is collapsed to failed.

**Sourced fact:** Convex does not automatically retry actions with side effects because it cannot know whether an effect happened. Stripe documents idempotency keys for safe API repetition. Google SRE warns retries can amplify failures and recommends bounded retries, jitter, retry budgets, and one deliberate retry layer. The x402 v2 spec makes `settlement_pending` non-terminal and requires a transaction hash/network so callers reconcile before retry. [Convex actions](https://docs.convex.dev/functions/actions), [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests), [Google SRE cascading failures](https://sre.google/sre-book/addressing-cascading-failures/), [x402 v2 §9 at reviewed main ref](https://github.com/x402-foundation/x402/blob/b1a88efb90f61e498ea1907971f4b0379a5673b8/specs/x402-specification-v2.md)

**AE inference:** Unknown additive/irreversible effects remain `unknown` until observed. Persist intent before dispatch, use a stable provider idempotency key derived from the invocation/effect, record dispatch attempts and provider correlation, and reconcile externally before any retry. If a provider lacks idempotency/status lookup, automatic retry of an ambiguous irreversible call is forbidden.

**Warning signs:** catch-all retry on timeout/5xx; new idempotency key per attempt; “failed” written immediately after network error; worker framework plus SDK both retry; no `unknown`/`settlement_pending` state; operator cannot inspect or resolve ambiguous outcomes.

**Prevention:** Durable effect state machine (`intended -> dispatched -> observed_succeeded|observed_failed|unknown -> reconciled`), error taxonomy, bounded retry ownership, provider-specific observation adapter, manual escalation, and compensation/refund rules that account for late success.

**Detection:** Fault injection after provider acceptance but before response, lost callback, delayed settlement, duplicate worker delivery, and provider status disagreement. Assert no second irreversible request until observation proves it safe.

**Earliest owning phase/gate:** P4 provider consequence and unknown-outcome gate; retry-budget scale tests in P6.

**Required evidence class:** `source + test-harness + hosted/external + operational`.

### Pitfall 8: Registered provider endpoints become an SSRF and credential-exfiltration plane

**What goes wrong:** A supplier-controlled URL reaches loopback, link-local, metadata, private networks, or a redirected host; DNS changes between validation and use; AE sends provider secrets to the wrong origin; a discovery record silently changes its endpoint.

**Why it happens:** Provider discovery is promoted directly to executable configuration; URL string validation is considered sufficient; redirects are enabled; endpoint ownership and Connection credential scope are not joined canonically.

**Sourced fact:** OWASP identifies custom webhooks and server-side provider calls as SSRF paths, recommends allowlists for known targets, validates resolved IPs, disables unsafe redirects, and advocates network-layer egress controls. [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

**AE inference:** Discovery is untrusted input. Invocation uses a reviewed, versioned registered endpoint bound to the supplier, capability, Account-visible offering, Connection, allowed scheme/method, and credential audience. Endpoint changes are control-plane lifecycle events, not transparent data refreshes.

**Warning signs:** arbitrary URL in invocation input; credentials attached before final-origin verification; DNS checked only at registration; redirects followed across origins; provider/Bazaar listing is sole registry truth; no operator diff/approval on endpoint changes.

**Prevention:** Canonical provider resolution; scheme/host/port allowlist where feasible; A/AAAA and redirect validation at use; block local/private/link-local/metadata ranges; egress firewall/proxy; TLS validation; body/time/response bounds; secret audience binding; quarantined re-verification on endpoint changes.

**Detection:** DNS rebinding, IPv4/IPv6 encoding, redirect-to-private, credential cross-host, oversized/slow response, and discovery-update substitution tests plus hosted egress observation.

**Earliest owning phase/gate:** G0 provider trust boundary; P3 Connection binding; P4 real endpoint slice.

**Required evidence class:** `source + test-harness + hosted/external + operational`.

### Pitfall 9: Secret rotation advances an unverified generation or vault outage fails open

**What goes wrong:** The pointer advances before the new secret works; old and new generations are confused across in-flight jobs; a failed rotation destroys the last known good version; secret material is persisted in Convex/logs; or vault outage causes fallback to environment/static credentials and new consequential work continues unaudited.

**Why it happens:** Rotation is treated as a single overwrite; secret generation is absent from authority/effect records; caches outlive revocation; operational availability pressure overrides the trust boundary.

**Sourced fact:** AWS rotation stages a pending version, verifies it against the same target, tests it, then moves the current pointer while preserving the previous version for rollback. Vault documents leases/revocation and refuses requests when it cannot write to any configured audit device. [AWS rotation functions](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_lambda-functions.html), [AWS secret versions](https://docs.aws.amazon.com/secretsmanager/latest/userguide/whats-in-a-secret.html), [Vault audit devices](https://developer.hashicorp.com/vault/docs/audit), [Vault leases](https://developer.hashicorp.com/vault/docs/concepts/lease)

**AE inference:** Secret material is JIT, memory-only, bounded in lifetime, and never a Convex fact. Convex stores only Connection metadata, provider/vault references, generation, lifecycle, validation result, and audit correlation. Vault failure blocks new consequential work; recovery/reconciliation that does not require secret access may continue under explicit narrow modes. Rotation validates new generation before atomic pointer advance and retains a controlled rollback path.

**Warning signs:** `secretValue` or access token in DB/log/error; overwrite-in-place; one unversioned cache; pointer moves before provider probe; old jobs silently fetch newest secret; environment fallback; no operator view of stalled rotation or vault health; break-glass lacks expiry/dual control.

**Prevention:** Replaceable `SecretStore` port; version/generation state machine; same-resource checks; JIT fetch with explicit zeroization limits; redacted structured errors; fail-closed outage policy; health alerts; rollback/reconcile runbook; bounded dual-control break-glass; audit from both AE and vault.

**Detection:** Rotation failure at every step, wrong-target pending secret, concurrent old/new work, cache expiry, vault timeout/denial/audit outage, rollback, log scanning, and memory/persistence boundary review.

**Earliest owning phase/gate:** G0 secret/outage ADR; P3 Connection and secret-plane acceptance.

**Required evidence class:** `architecture + source + test-harness + hosted/external + operational`.

### Pitfall 10: Treating `402`, `/verify`, or a facilitator response as generic “payment complete”

**What goes wrong:** AE treats an x402 challenge as a charge, a successful verification as settlement, a broadcast hash as finality, or a facilitator success as proof of the buyer charge/provider payment/commercial obligation. It ignores scheme-specific ordering and may deliver unpaid work or retain payment after failed work.

**Why it happens:** x402 is flattened into one boolean; version/scheme/network/asset/payee/amount/flow are not persisted; “payment” conflates authorization, provider settlement, buyer charge, supplier payable, and reconciliation.

**Sourced fact:** The reviewed x402 v2 specification defines distinct `authorization`, `upfront`, and `escrow` orderings; requires a verify or settle before resource execution; makes `/verify` read-only; makes `/settle` the durable payment commitment; permits multiple settles for some schemes; and defines `settlement_pending` as non-terminal. It explicitly leaves client-side budget management out of scope. Reviewed upstream `main` resolved to `b1a88efb90f61e498ea1907971f4b0379a5673b8`; AE currently declares x402 `2.23.0`, so phase research must also bind the installed package and supported spec revision. [x402 v2 specification at reviewed ref](https://github.com/x402-foundation/x402/blob/b1a88efb90f61e498ea1907971f4b0379a5673b8/specs/x402-specification-v2.md)

**AE inference:** For supported synchronous x402 calls, the provider's exact 402 requirements and the verified/settled external transaction are transactional inputs, not AE's whole commercial truth. AE still owns provider-neutral capability resolution, Principal/Account authority, budgets, invocation/effect history, buyer charging, supplier payable, refunds/disputes, and reconciliation. Non-x402 adapters enter the same canonical state machine.

**Warning signs:** `paid: true`; no protocol/scheme/flow version; resource executes after no pre-check; `/verify` result books money; broadcast transaction is final without observation; provider payee differs from registered supplier; discovery quote overrides returned 402 without policy; no unpaid-fulfilled or paid-unfulfilled state.

**Prevention:** Persist the exact PaymentRequirements/payload digests, accepted scheme/network/asset/amount/payee/flow, verify result, resource effect, settle attempts, external transaction and confirmation/finality evidence. Model each ordering explicitly and define compensation for both effect-before-payment and payment-before-failed-effect.

**Detection:** Conformance tests per supported scheme/flow, altered 402 fields, facilitator/provider disagreement, settlement pending/late failure, resource failure after upfront payment, settlement failure after successful resource, replayed authorization, and wrong payee/network.

**Earliest owning phase/gate:** P4 x402/provider-payment truth gate, preceded by a version-pinned protocol ADR.

**Required evidence class:** `architecture + source + test-harness + hosted/external + commercial`.

### Pitfall 11: No immutable commercial ledger or operated refund/dispute/reconciliation lifecycle

**What goes wrong:** Invocation status is used as accounting; refunds mutate the original payment row; provider settlement is assumed to equal buyer charge; fees, partial refunds, reversals, disputes, chargebacks, payout failures, and late changes cannot be reconstructed; deadlines pass without an owner.

**Why it happens:** The happy path ends at provider response; webhook order is trusted; external provider dashboards are treated as the only ledger; payer, Account, supplier, beneficiary, tax subject, and technical actor are collapsed.

**Sourced fact:** Stripe documents duplicate and out-of-order webhook delivery, signature verification, asynchronous handling, and durable deduplication. Its balance transactions are immutable movements; refunds and disputes create separate movements. Disputes may be partial, can outlive the original transaction by months, and require timely evidence. [Stripe webhooks](https://docs.stripe.com/webhooks), [Stripe reporting and reconciliation](https://docs.stripe.com/plan-integration/get-started/reporting-reconciliation), [Stripe disputes](https://docs.stripe.com/disputes/how-disputes-work), [Stripe refunds](https://docs.stripe.com/refunds)

**AE inference:** Convex remains the sole writable AE record but must preserve external references and an append-only commercial journal: provider authorization/settlement, AE buyer charge, supplier payable, fee, refund, reversal, dispute, chargeback, payout and reconciliation adjustments. Never rewrite history to make totals agree.

**Warning signs:** mutable `paymentStatus`; total inferred from invocation rows; event handlers depend on order; no event/provider-account dedup key; refund has no original-line linkage; dispute alerts lack SLA/owner; operator cannot explain provider-vs-AE variance; supplier payout proceeds while outcome is unknown/disputed.

**Prevention:** Double-entry-like immutable movement model or equivalently replayable journal; explicit legal payer/supplier/beneficiary fields; idempotent inbox; provider snapshot polling/reconciliation; variance queues; refund/dispute state machines; evidence retention; deadlines and escalation; operator correction only through compensating entries.

**Detection:** Replay provider history in arbitrary order with duplicates; reconcile daily totals and per-invocation lines; inject partial refund, late dispute, payout failure, fee/currency variance, provider missing event, and AE/provider disagreement.

**Earliest owning phase/gate:** P4 minimal journal and refund semantics; full operational acceptance in P5.

**Required evidence class:** `source + test-harness + hosted/external + operational + legal/commercial`.

### Pitfall 12: Commercial convenience drifts into custody, stored value, exchange, or unreviewed consumer obligations

**What goes wrong:** Internal “balances,” deposits, withdrawals, reusable credits, pooled provider funds, exchange, or transferable value are added to simplify UX. AE's locked B2B reseller/no-stored-value posture silently changes, potentially changing licensing, AML/CTF, safeguarding, accounting, tax, refund, and contract obligations.

**Why it happens:** A technical ledger is mistaken for customer money; roadmap teams import marketplace/wallet features; x402 stablecoin mechanics are treated as removing legal/commercial analysis; “B2B” is assumed to exclude all consumer-law remedies.

**Sourced fact:** ASIC's current guidance says non-cash payment facilities can include stores of value and that some stablecoins are likely non-cash payment facilities; licensing outcomes depend on the actual arrangement and exemptions. AUSTRAC says businesses providing registrable virtual-asset/digital-currency exchange services must register. ACCC notes a business can be a consumer for some purchases, including certain transactions under AUD 100,000, and qualifying services can carry statutory remedies. These are scoping signals, not legal conclusions about AE. [ASIC digital assets guidance](https://www.asic.gov.au/regulatory-resources/digital-transformation/digital-assets-financial-products-and-services), [ASIC 2026 non-cash facility relief](https://www.asic.gov.au/about-asic/news-centre/news-items/asic-remakes-non-cash-payment-facilities-instrument), [AUSTRAC registration](https://www.austrac.gov.au/enrol-and-register-dce), [ACCC consumer guarantees](https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees)

**AE inference:** Keep AE's journal as attributable obligations and movements, never a user-controlled reusable balance. Any proposal involving holding, pooling, converting, transferring, depositing, withdrawing, or re-spending value is a mandatory product/legal rebaseline before design or code. Protocol choice does not decide regulatory classification.

**Warning signs:** user-visible “wallet” or balance; supplier proceeds reused before payout; cross-invocation credits; AE controls customer private keys; conversion between fiat/token; terms say “no refunds” categorically; commercial owner absent from phase gates.

**Prevention:** Fund-flow diagram and legal/commercial acceptance at G0/P4; explicit no-custody/no-stored-value invariants in schema/API/UI terminology; transaction-specific charging; provider payout/refund agreements; Australian counsel review for material flow changes; do not infer obligations solely from technical design.

**Detection:** Architecture diff asks whether AE ever possesses/control funds or credentials, owes redemption, enables multiple payees or exchange, or creates reusable value. Contract/API/UI vocabulary scan blocks balance/wallet/deposit/withdrawal semantics without rebaseline.

**Earliest owning phase/gate:** G0 commercial boundary; P4 legal/commercial release gate.

**Required evidence class:** `architecture + legal/commercial + operational`.

### Pitfall 13: Backend facts exist without an operator/control-plane path

**What goes wrong:** Principal, Account, ownership, membership, Credential, delegation, Connection, secret, recovery, break-glass, invocation, payment, or dispute state is correct in storage but cannot be safely inspected, changed, recovered, or escalated. Support edits rows directly or cannot resolve incidents.

**Why it happens:** Machine APIs are equated with operability; UI is deferred without ownership; legacy Clerk/profile/key/provider pages are relabelled as canonical controls; destructive/recovery actions lack ceremony.

**Sourced fact:** The local Phase 2 assessment found no coherent operator console for canonical Principal/Account lifecycle, membership, Credentials, delegation, Connections, recovery, or secret status. Existing UI used legacy nouns and partial provider-specific flows. This gap was HIGH-confidence local evidence, not an external market assumption.

**AE inference:** Every canonical entity/action needs an architecture-time operability row: inspect, change, recover, escalate; HTTP/MCP/CLI/UI/staff/support/machine-only disposition; self-service/dual-control/staff-only/automated ownership; accessibility, audit, safety, failure, and reconciliation behavior.

**Warning signs:** “can be done in Convex dashboard”; no Account selector; no delegation ancestry/revoke view; secret automation has no status/reconcile view; break-glass has no dual-control ceremony; support has no correlation search; terminology differs between API/UI/runbook.

**Prevention:** Plan operability at G0 alongside backend schema; implement the minimum operator path in the same vertical slice; forbid direct-row support as the normal path; use dual control for high-impact actions; retain existing accessibility strengths.

**Detection:** Tabletop exercises for compromised Credential, ambiguous Account, revoked delegate, stuck rotation, unknown provider effect, partial refund, dispute deadline, and break-glass recovery. An operator must resolve each using owned product/runbook surfaces with complete audit.

**Earliest owning phase/gate:** G0 operability matrix; minimum path in every P1–P4 slice; coherent console/support acceptance in P5.

**Required evidence class:** `architecture + source + hosted/external + operational`.

### Pitfall 14: Audit evidence is forgeable, incomplete, secret-bearing, or controlled by the actor being audited

**What goes wrong:** The same adapter both mutates and “observes” its effect; callers submit their own receipts; audit records omit actor chain/Account/effect correlation; logs contain secrets; or an outage disables audit while work continues.

**Why it happens:** Application logs are treated as proof; evidence creation and mutation share one lying port; success responses are mistaken for independent observation; logging is added after the data model.

**Sourced fact:** OWASP recommends attributable, integrity-protected logs while excluding tokens, passwords, keys, and primary secrets. Vault refuses API requests when it cannot write to any enabled audit device, illustrating a deliberate fail-closed audit boundary. Phase 1 twice rejected green evidence because caller-shaped or same-port evidence could lie, then accepted distinct mutation/evidence/reconciliation capabilities and immutable attribution. [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), [Vault audit devices](https://developer.hashicorp.com/vault/docs/audit)

**AE inference:** Separate intent, dispatch, provider observation, reconciliation, and operator decision records. Bind audit to exact Principal, Account, actor chain, Credential/Connection generation, invocation/effect IDs, provider correlation, deployment revision, server time, result and evidence source. Redact secret material before persistence.

**Warning signs:** audit accepts `actorId` or receipt from caller; one interface returns both mutation and proof; only free-text logs; no denial/no-effect audit; secret/token in structured context; audit sink failure ignored; provider observation cannot be traced independently.

**Prevention:** Append-only domain audit, independent observation adapter where possible, tamper-evident export/digest, redaction schema, audit health gate, retention/access policy, and explicit confidence/source for external facts.

**Detection:** Lying-port tests, forged receipt, post-effect response loss, missing audit sink, log-injection/redaction tests, complete chain reconstruction, and comparison with provider/vault/payment records.

**Earliest owning phase/gate:** G0 evidence model; P1 first attributable effect; P3/P4 external audit; P5 retention/operations.

**Required evidence class:** `source + test-harness + hosted/external + operational`.

### Pitfall 15: Source, test-harness, hosted, and operational evidence substitute for one another

**What goes wrong:** A local mock is called production proof; a source commit is called deployed behavior; a hosted smoke without exact revision is applied to another build; stale ignored output closes a gate; external credential absence blocks a source invariant or is silently waived.

**Why it happens:** Evidence classes and owners are not declared before work; exact refs/digests/freshness are missing; high test counts create pressure to claim maturity.

**Sourced fact:** SLSA v1.2 distinguishes source provenance from build provenance and requires the artifact digest, trusted builder identity/signature, canonical repository, build type, and parameters to be verified. The AE forensics found wrong candidate labels, absent ignored output, mock/hosted substitution, and Phase 1/2 false greens; it established `SOURCE_ACCEPTED_EVIDENCE_OPEN` as the correct bounded verdict. [SLSA v1.2 provenance](https://slsa.dev/spec/v1.2/provenance), [SLSA artifact verification](https://slsa.dev/spec/v1.2/verifying-artifacts), [NIST SSDF](https://csrc.nist.gov/projects/ssdf)

**AE inference:** Every claim names artifact, Git ref, build/deployment digest, command/tool version, environment, timestamp, freshness/expiry, owner, gate, and evidence class. Source acceptance may leave hosted evidence open only with a named later owner and exact completion rule.

**Warning signs:** “tests pass, therefore production”; `.env.local` as deployment identity; screenshots without revision; ignored coverage folder; reused smoke after dependency/deploy change; stale checkbox; mock Clerk/Infisical/provider called hosted; missing spend consent hidden as pass.

**Prevention:** Machine-readable evidence manifest, separate ledgers/owners, exact-revision hosted smoke, immutable/digest-bound artifacts, freshness windows, clean-checkout reproduction, and explicit `SOURCE_ACCEPTED_EVIDENCE_OPEN` rather than blended verdicts.

**Detection:** Acceptance reviewer traces every claim backward to its artifact and forward to its exact candidate/deployment; substitution with same-shaped evidence from another registration/ref/environment must fail.

**Earliest owning phase/gate:** G0 evidence taxonomy; applied to every phase; P5 closes hosted/operational release evidence.

**Required evidence class:** Each class closes only its own claim; acceptance requires the declared combination.

### Pitfall 16: A static analyzer or generated matrix becomes the authorization architecture

**What goes wrong:** A bespoke AST/dataflow rule claims runtime dominance, misses a JavaScript shape or registration identity, and becomes a second security platform. Coverage, diagnostics, inventories, or projected sink matrices remain green while real handlers bypass authority.

**Why it happens:** Local syntax is easier to count than semantic effect paths. Every discovered bypass invites “one more alias case” instead of questioning the proof property.

**Sourced fact:** The Phase 2 checker missed protected-context destructuring and aggregate registrar selection; its diagnostic runner accepted a same-signature error at a substitute registration; 27 representative sinks were projected over 207 protected handlers; the root remained 0/6 despite green leaves. The forensics concluded that lint should enforce only locally decidable import/literal facts and runtime authorization must use framework-native seams plus actual references. OWASP likewise notes automated tests help but do not replace dedicated authorization testing. [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

**AE inference:** Static tools may inventory registrations and restrict imports/builders/categories. They may not prove aliases, dataflow, dominance, escaped capabilities, interprocedural authorization, or absence of effect-path bypass. Semantic acceptance binds exact registration, source location, target/capability, invariant, oracle, and no-effect behavior.

**Warning signs:** analyzer grows with each syntax form; “100% registrations classified” used as authority proof; tests assert any diagnostic rather than exact location/invariant; representative handler stands for many registrations; interface-only tests; a checker change alters the security proof.

**Prevention:** Framework-native runtime seams, thin endpoints, actual-reference hostile tests, narrow standard lint (`no-restricted-imports`-like) only, and independent raw counterexamples. Counts are scope evidence, never semantic closure.

**Detection:** Destructure/alias/aggregate/cast/escape/substitute-location probes; direct actual registration invocation; every effect path separately exercised. A missed syntax form stops source work instead of expanding a load-bearing analyzer.

**Earliest owning phase/gate:** G0 proof-property ADR; P1 authority acceptance.

**Required evidence class:** `architecture + source + test-harness`; analyzer output alone is insufficient.

### Pitfall 17: Horizontal integration and duplicated canonical facts create late blast radius

**What goes wrong:** Teams build all interfaces/adapters/manifests first and defer real endpoint composition. Parallel leaves duplicate Principal/Account converters, authority resolvers, validators, provider state, or commercial truth. Each appears green; integration later touches hundreds of files.

**Why it happens:** Work is divided by technical layer rather than end-to-end outcome; shared integration is assigned to one late driver; exact file ownership is advisory rather than enforced.

**Sourced fact:** Phase 2 had 82 commits, 365 paths, 173,479 insertions, 46 fix/test commits, and all five leaf ledgers green 62 commits before a 0/6 root stop. Nine cross-surface adapters had no production instantiation; duplicate canonical converters/resolvers appeared; 103,027 generated planning lines described a migration that never occurred. This is HIGH-confidence local forensic evidence.

**AE inference:** The smallest roadmap unit is one real registered endpoint through canonical adapter, domain logic, durable/external effect, denial/no-effect, audit, operator path, rollback and independent verification. Only after acceptance does the next registration reuse the seam.

**Warning signs:** adapter has no production caller; leaf passes only unit fixtures; “integration phase later”; more than one production converter/resolver; generated matrix grows faster than migrated endpoints; shared file edited by several workers; actual effect path owned by nobody.

**Prevention:** Exact ownership manifest; one integration-owned canonical adapter/parser; vertical slice plan; zero competing facts gate; blast-radius amendment before new paths; genuine parallelism only for non-overlapping slices; no leaf green without a production consumer.

**Detection:** Production dependency graph from each new module to a registered endpoint; exact diff ownership; duplicate-symbol/query scan; root integration gate evaluated continuously rather than after all leaves.

**Earliest owning phase/gate:** G0 phase topology and ownership; enforced in every implementation phase.

**Required evidence class:** `architecture + source + test-harness + lifecycle/operational`.

### Pitfall 18: Repair loops continue after the architecture or proof has changed

**What goes wrong:** Review finds a trust defect, local repair exposes another, and the team keeps patching the same critical files while green counts rise. The implementation silently changes the proof property, trust source, runtime seam, or effect boundary without returning to design.

**Why it happens:** Repair is cheaper to dispatch than rebaseline; counters are not recorded; formal rejection has no automatic stop; useful partial work is mistaken for an accepted baseline.

**Sourced fact:** Phase 1 required two formal rejection rounds before acceptance. Phase 2 produced repeated same-file repair sequences, architecture only after 77/82 commits, and an unaccepted 17-file aggregate. The stop-line prevented an unsound 298-registration migration. This is HIGH-confidence local forensic evidence.

**AE inference — mandatory exact policy:** Maximum **two repair passes per slice** and **two `CHANGES_REQUIRED` verdicts per phase**. A **repeated trust-defect class**, **three consecutive repairs to a critical file**, or **any proof-property/runtime-seam change** forces a stop and rebaseline. Consistent with the forensic rule, changes to the trust source or effect boundary are proof/runtime changes and also force immediate rebaseline. The counter is written before work resumes.

**Warning signs:** third repair proposed; same trust defect recurs after a repair; same critical file appears in three consecutive repair commits; checker semantics change to make evidence pass; design doc follows source; commit says “complete” while root gate is red; partial aggregate proposed as new baseline.

**Prevention:** Gate-owned repair counters, automated diff/history triggers, stop-line state, architecture-only restart, preservation of partial commits as evidence, new independent design acceptance, and prohibition on further source edits until accepted.

**Detection:** Phase close checks commit sequence, critical-file churn, verdict count, trust-defect taxonomy, and proof/runtime diffs. A trigger is a stop condition, not a warning.

**Earliest owning phase/gate:** G0 lifecycle contract; enforced by every slice/phase review.

**Required evidence class:** `lifecycle + architecture + source history + independent review`.

### Pitfall 19: Lifecycle, ownership, and workspace state become non-canonical

**What goes wrong:** ROADMAP/STATE/phase artifacts, launch packet, Git refs, task/goal state, worktree state, and gate checkboxes disagree. A stale candidate is resumed, sibling ledgers are modified, useful commits become unreachable, or ignored scratch is mistaken for durable evidence.

**Why it happens:** Parallel custom lifecycle trees; task/tool display treated as source truth; path ownership exists only in prompts; closeout is deferred.

**Sourced fact:** AE's canonical GSD artifacts were deleted during the historical program; custom launch/state artifacts later contradicted the accepted base and stop-line. A positional checker invocation wrote sibling ledgers. The stopped Phase 2 task remained operationally/statically inconsistent, and retained local artifacts were mislabeled or absent. This is HIGH-confidence local forensic evidence.

**AE inference:** One GSD-recognized lifecycle is authoritative. Each transition records exact ref, task, owner, evidence class, next allowed action and terminal state. File ownership is mechanically checked. Closeout proves clean status, reachable refs, task/worktree reconciliation, scratch disposition, and open-evidence owners.

**Warning signs:** `PREPARED` or `IMPLEMENTING` after stop; active goal with stopped source; old base SHA in launch packet; checked gate predates candidate; multiple agents write one ledger/shared file; untracked/ignored evidence; worktree has no owner/expiry; completion inferred from commits without SUMMARY/VERIFICATION.

**Prevention:** Canonical state transitions; exact named-ledger invocation; planning diff review; ownership allowlist; retained-ref manifest; clean-checkout verification; archive/remove terminal tasks and clean worktrees; scratch retention owner/expiry; tool faults recorded as tool evidence, never source verdicts.

**Detection:** Pre-dispatch and close scripts reconcile HEAD/ancestry, branch, status, task, goal, worktrees, ledger/ref freshness, changed-path ownership, reachable commits and scratch inventory.

**Earliest owning phase/gate:** G0 lifecycle gate; every handoff/stop/close.

**Required evidence class:** `lifecycle/operational + source history`.

## Moderate Pitfalls

### Pitfall 20: Budget enforcement races or uses unsafe money arithmetic

**What goes wrong:** Concurrent invocations each pass a non-atomic budget check; reservations are not released/reconciled; currency/token atomic units are converted through floating point; retries consume or refund budget twice.

**Warning signs:** read-then-write budget logic across functions; `number` for monetary atomic units; budget keyed only by Principal, not Account/policy window; no reserved/committed/released states; provider amount rounded differently from AE.

**Prevention:** Atomic Account-scoped reservation mutation, integer/decimal atomic units, currency/network/asset in the key, immutable adjustments, idempotent commit/release, and reconciliation of provider actuals.

**Detection:** Concurrent overspend tests, rounding/property tests, duplicate callback/retry, partial settlement/refund, and reservation leak alarms.

**Earliest owning phase/gate:** P4 budget/payment slice.

**Evidence class:** `source + test-harness + hosted/external + operational`.

### Pitfall 21: Provider contract, SDK, or protocol drift is accepted silently

**What goes wrong:** A provider changes schema, signing, x402 behavior, error meanings, package externalization, or API version; permissive parsing turns the change into a false success or destructive retry.

**Warning signs:** `any` at external boundaries; unpinned protocol interpretation; no response byte/depth bounds; unknown enum defaults to success/retry; live smoke not tied to deployed package-lock digest.

**Prevention:** Exact runtime validation; unknown value fails closed or becomes `unknown`; protocol/package version compatibility matrix; pinned reviewed x402 revision; contract fixtures plus bounded live smoke; dependency-change gate for the CDP external-package seam.

**Detection:** Schema fuzzing, old/new fixture replay, canary provider calls, unknown error injection, and release diff on provider SDK/spec/package externalization.

**Earliest owning phase/gate:** P4 adapter gate; P5 release gate.

**Evidence class:** `source + test-harness + hosted/external`.

### Pitfall 22: Retry storms and recovery work starve new or critical work

**What goes wrong:** Provider outage triggers retries across HTTP client, SDK, workpool, callback and reconciliation layers; queues grow, stale authority accumulates, and recovery jobs cannot run.

**Sourced fact:** Google SRE documents retry amplification and recommends jitter, bounded attempts, service-wide retry budgets, overload shedding, and avoiding retries at multiple layers. [Google SRE cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)

**Warning signs:** same attempt retried by several layers; no queue age/cardinality metrics; permanent 4xx retried; no per-provider/Account concurrency limits; reconciliation and new work share an unbounded queue.

**Prevention:** One retry owner per effect, exponential backoff with jitter, retry budget, circuit breaker/load shedding, per-provider isolation, priority for reconciliation/recovery, authority revalidation after queue delay, and operator drain/pause controls.

**Detection:** Outage/load tests with retry amplification metrics, queue-age SLO, cancellation propagation, and recovery-time objectives.

**Earliest owning phase/gate:** Basic controls in P4; measured acceptance in P6.

**Evidence class:** `test-harness + hosted/external + operational`.

### Pitfall 23: Destructive lifecycle work lacks recoverable evidence and typed human control

**What goes wrong:** Legacy tables, credentials, Connections, delegations, provider configurations, or sensitive exports are deleted in batches; rollback material is inaccessible, over-retained, or leaked.

**Sourced fact:** Current codebase concerns identify eleven possibly extant legacy tables whose dashboard deletion is irreversible and require separate typed confirmation and deletion records; rollback exports may contain private production data and need restricted retention/disposal.

**Warning signs:** batch-confirm deletion; no count/bytes/digest; ordinary CI artifact contains production export; deletion before exact Release B verification; no retention owner or disposal proof.

**Prevention:** One-resource-at-a-time ceremony, exact deployment/revision, before/after inventory, encrypted restricted export, digest and access log, rollback test, dual control for high impact, and explicit retention/disposal policy.

**Detection:** Tabletop rollback and restore, deletion-record audit, access review, expiry alert, and exact deployment reconciliation.

**Earliest owning phase/gate:** P5 release/housekeeping gate; entity-specific destructive actions are planned at G0.

**Evidence class:** `operational + hosted/external`.

## Minor Pitfalls

### Pitfall 24: Canonical terms drift across source, UI, API, evidence, and support

**What goes wrong:** “Account” means Clerk profile in UI, money ledger elsewhere, and canonical tenant/policy context in authority code; “Credential,” “Connection,” “agent,” and “recovery” similarly diverge.

**Warning signs:** The same identifier is labelled differently across API/UI/runbooks; legacy nouns appear in new schemas; support cannot map a screen label to a canonical entity; reviewers use “user,” “agent,” or “account” interchangeably when describing authority.

**Prevention:** Ubiquitous-language glossary, generated labels where practical, cross-surface terminology review, migration aliases clearly marked as legacy, and support runbooks using canonical IDs.

**Detection:** Vocabulary scan and operator usability review per vertical slice.

**Earliest owning phase/gate:** G0, enforced through P5.

**Evidence class:** `architecture + source + operational`.

### Pitfall 25: Error responses become an authorization or existence oracle

**What goes wrong:** Invalid credential, wrong Account, absent resource, revoked delegation, secret mismatch, provider denial, and budget denial return distinguishable details that let an attacker enumerate cross-tenant facts.

**Warning signs:** Wrong-tenant and absent-object tests produce different status/body shapes; raw provider or vault errors reach callers; logs contain externally supplied secrets; response timing varies materially by authorization branch; correlation IDs are absent.

**Prevention:** Externally safe error taxonomy, indistinguishable absent/unauthorized responses where appropriate, detailed correlation only in protected audit, constant-time secret comparisons, bounded rates.

**Detection:** Paired wrong-tenant/absent tests compare status, body shape, timing envelope and no-effect behavior.

**Earliest owning phase/gate:** P1 and repeated at P3/P4.

**Evidence class:** `source + test-harness + hosted/external`.

## Phase-Specific Warnings

| Phase topic | Likely pitfall | Required early mitigation/gate |
| --- | --- | --- |
| G0 rebaseline | Architecture or proof property arrives after code | Accepted ADR with alternatives, official docs, installed-version proof, source-to-consequence/effect map, operability rows, evidence classes, exact ownership and mandatory repair triggers before edits. |
| P1 runtime authority | HTTP/UI are protected but async/internal/MCP/CLI paths escape | One actual registered vertical slice; explicit least-privilege wrapper; canonical adapter; sibling-registration substitution and denial/no-effect tests. |
| P2 delegation | One-hop happy path hides widening, cycles and stale grants | Chain intersection, complete actor attribution, depth/cycle tests, generation revocation and consequence-time server checks. |
| P3 Connection/secrets | Rotation/outage creates invalid generations or fail-open fallback | Pending/test/current pointer state machine, same-target validation, JIT memory-only secrets, fail-closed new work, rollback and operator health/reconcile path. |
| P4 provider/commerce | 402/verify/timeout becomes paid/failed boolean | Version-pinned per-flow x402 truth, durable intent/effect journal, stable idempotency, explicit unknown state, external reconciliation, refunds/disputes, immutable commercial movements. |
| P5 operated release | Source commit substitutes for deployed, supported service | Artifact/deployment provenance, exact-revision hosted smokes, canonical control plane, tested rollback/on-call/support, evidence freshness and clean lifecycle close. |
| P6 scale | Retrying harder is mistaken for resilience | Capacity/load tests, queue SLOs, jitter/retry budgets, circuit breaking, provider isolation, reconciliation priority, measured extraction triggers only. |

## Roadmap Stop Conditions

The roadmap should make these mechanically visible and non-waivable by a green test count:

1. Production source/test architecture edits before G0 design acceptance: **stop**.
2. A leaf without a real registered production consumer and exact effect-path test: **cannot become green**.
3. Static lint must infer alias/dataflow/control-flow to prove authority: **stop and return to architecture**.
4. A competing Principal/Account/Credential resolver or canonical converter appears: **gate failure**.
5. A semantic counterexample passes while coverage/checks are green: **gate is red**.
6. Evidence lacks exact ref/digest/tool/freshness/class/owner: **inadmissible**.
7. Mock/local evidence is promoted to hosted/operational, or missing hosted access is promoted to source failure/success: **review failure**.
8. Maximum **two repair passes per slice** or **two `CHANGES_REQUIRED` verdicts per phase** is reached: **new accepted architecture/design gate required**.
9. A **repeated trust-defect class**, **three consecutive repairs to a critical file**, or **any proof-property/runtime-seam change** occurs: **immediate stop and rebaseline**.
10. Work writes outside exact ownership, a shared canonical seam has no integration owner, or a checker changes another ledger: **stop, preserve evidence, reconcile ownership before resuming**.
11. Canonical lifecycle/ref/task/worktree/gate state disagrees: **no further dispatch and no phase close**.
12. Any proposal introduces deposits, withdrawals, transferable/reusable value, custody/control, exchange, or a materially different fund flow: **commercial/legal rebaseline before design or code**.

## What the Roadmap Must Measure Early

| Leading indicator | Healthy threshold | Escalation |
| --- | --- | --- |
| Actual registered consequence paths accepted | Every green slice has at least one named production registration and all of its effect paths executed | Green interface/matrix with zero real consumers stops the slice. |
| Canonical resolvers/converters | Exactly one integration-owned production adapter/parser seam | Any duplicate is a hard gate failure. |
| Unknown external outcomes | 100% retained as unknown/pending until observed; zero blind irreversible retries | Any blind retry blocks P4 acceptance. |
| Async authority | 100% of scheduled/callback/cron/job/worker/reconciliation paths carry explicit IDs/generations and revalidate | Any implicit/system fallback blocks P1/P4. |
| Secret material persistence | Zero in Convex, logs, errors, evidence artifacts, or ordinary CI output | Any occurrence triggers incident handling and P3 rebaseline. |
| Commercial variance | Every external movement correlated or queued with owner/SLA | Unowned variance/refund/dispute blocks operated release. |
| Evidence substitution | Zero cross-class substitutions; every claim has ref/digest/freshness/owner | Any substitution turns the relevant gate red. |
| Repair churn | At most two repair passes per slice; at most two `CHANGES_REQUIRED` per phase | Exact stop/rebaseline rules above. |
| Critical-file churn | Fewer than three consecutive repair commits to the same critical file | Third consecutive repair stops the phase. |
| Lifecycle hygiene | Clean, reachable, reconciled task/ref/worktree/scratch state at every handoff | Any stale/unowned state blocks dispatch/close. |

## Sources

### Current primary and official technical sources

- [Convex Auth in Functions](https://docs.convex.dev/auth/functions-auth) — official; retrieved 2026-08-26; external confidence MEDIUM.
- [Convex Internal Functions](https://docs.convex.dev/functions/internal-functions) — official; retrieved 2026-08-26; external confidence MEDIUM.
- [Convex Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions) — official; retrieved 2026-08-26; external confidence MEDIUM.
- [Convex Actions](https://docs.convex.dev/functions/actions) — official; retrieved 2026-08-26; external confidence MEDIUM.
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html) — IETF BCP; cross-checked with RFC 8707/9728; external confidence MEDIUM.
- [RFC 8693: OAuth 2.0 Token Exchange](https://www.rfc-editor.org/rfc/rfc8693.html) — IETF standards track; external confidence MEDIUM.
- [Authorization Capabilities for Linked Data draft](https://w3c-ccg.github.io/zcap-spec/) — W3C Credentials Community Group draft used only as a design analogue; external confidence MEDIUM with maturity caveat.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [BOLA](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/), [SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), and [Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — primary OWASP guidance; external confidence MEDIUM.
- [NIST SP 800-63-4](https://pages.nist.gov/800-63-4/sp800-63.html) and [SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html) — final NIST identity/authenticator lifecycle guidance; external confidence MEDIUM.
- [AWS Secrets Manager rotation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_lambda-functions.html), [versions](https://docs.aws.amazon.com/secretsmanager/latest/userguide/whats-in-a-secret.html), and [rollback](https://docs.aws.amazon.com/secretsmanager/latest/userguide/roll-back-secret.html) — official; external confidence MEDIUM.
- [Vault audit devices](https://developer.hashicorp.com/vault/docs/audit) and [leases/revocation](https://developer.hashicorp.com/vault/docs/concepts/lease) — official; external confidence MEDIUM.
- [x402 v2 specification at reviewed upstream ref `b1a88efb…`](https://github.com/x402-foundation/x402/blob/b1a88efb90f61e498ea1907971f4b0379a5673b8/specs/x402-specification-v2.md) — upstream protocol source; external confidence MEDIUM; phase work must pin the supported spec/package combination rather than follow mutable `main`.
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests), [webhooks](https://docs.stripe.com/webhooks), [reconciliation](https://docs.stripe.com/plan-integration/get-started/reporting-reconciliation), [refunds](https://docs.stripe.com/refunds), and [disputes](https://docs.stripe.com/disputes/how-disputes-work) — official provider behavior; external confidence MEDIUM.
- [Google SRE: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/), [Emergency Response](https://sre.google/sre-book/emergency-response/), and [Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — primary operational guidance; external confidence MEDIUM.
- [SLSA v1.2 Provenance](https://slsa.dev/spec/v1.2/provenance) and [Artifact Verification](https://slsa.dev/spec/v1.2/verifying-artifacts) — current approved specification; external confidence MEDIUM.
- [NIST Secure Software Development Framework](https://csrc.nist.gov/projects/ssdf) — official; external confidence MEDIUM.

### Current Australian commercial/regulatory scoping sources

- [ASIC: Digital assets — financial products and services](https://www.asic.gov.au/regulatory-resources/digital-transformation/digital-assets-financial-products-and-services) and [2026 non-cash payment facility relief](https://www.asic.gov.au/about-asic/news-centre/news-items/asic-remakes-non-cash-payment-facilities-instrument) — primary regulator guidance; MEDIUM confidence; not a project-specific legal conclusion.
- [AUSTRAC: Enrol and register digital currency exchange services](https://www.austrac.gov.au/enrol-and-register-dce) — primary regulator guidance; MEDIUM confidence; applicability requires legal analysis of AE's actual services.
- [ACCC: Consumer rights and guarantees](https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees) — primary regulator guidance; MEDIUM confidence; applicability depends on transaction facts.

### Local execution evidence

- `.planning/PROJECT.md` — accepted boundaries, active requirements, exact repair policy, evidence ownership, and lifecycle constraints; HIGH confidence for current project intent.
- `.planning/forensics/report-20260826-190606.md` — exact Phase 1–2 history, root-cause model, stop/rebaseline rules, and quantified churn; HIGH confidence for repository history.
- `.planning/maturity-execution/reviews/phase-2-foundation-checkpoint-assessment.md` and companion gate — reproduced analyzer escapes, 0/6 root, evidence substitution, duplicated facts, operator gaps, and safe rebaseline boundary; HIGH confidence for assessed refs.
- `.planning/maturity-execution/PROGRAM-PAPERCUTS.md` — exact checker contamination, stale evidence, tool/lifecycle and authority-scope defects; HIGH confidence for preserved local findings.
- `.planning/codebase/CONCERNS.md` and `.planning/codebase/TESTING.md` — current release, secret, deployment, external-smoke, data-deletion, and evidence-class boundaries; HIGH confidence for current repository documentation.

## Research Gaps Requiring Phase-Specific Work

- Pin the exact x402 v2 specification revision supported by installed `x402` 2.23.0 and Coinbase CDP behavior; test provider deviations rather than assuming upstream conformance.
- Obtain current official Infisical Cloud documentation and a live tenant for OIDC, audit, availability, rate limits, secret versioning, rotation, and rollback before choosing it behind the SecretStore port.
- Obtain Australian legal/accounting advice on AE's exact reseller fund flow, stablecoin/provider-payment role, GST/tax invoicing, refund/dispute allocation, and whether any planned service is a financial product, virtual-asset service, remittance, custody, or consumer transaction.
- Define provider-specific finality and reconciliation rules for each non-x402 adapter and every supported x402 network/scheme.
- Set measured SLOs, retry budgets, queue limits, evidence freshness windows, dispute/support SLAs, retention periods, and extraction thresholds from actual usage rather than inventing scale requirements.
