# Alpha Maturity Source Architecture: Deep IceInVein Specification

**Date:** 16 September 2026  
**Status:** Comprehensive Master Design for Sign-Off (No implementation until Joel signs)  
**Authority:** `PRODUCT.md`, `START_LINE.md`, `CONTEXT.md`, `AGENTS.md`, `docs/operations/alpha-release-design.md`, `docs/operations/alpha-maturity-register.md`

---

## 1. Executive Thesis and Boundary Charter

### The North Star Thesis
> **"An invited Australian business can give its Agent bounded access to useful paid Tools, and can understand and recover every resulting purchase."**

Every architectural boundary, contract, type definition, and test in this document is scored against this single sentence. A change that does not directly serve this thesis is cut. Accretion without vision is strictly rejected.

### The Canonical Product Chain
Agentic Economy is a cross-harness Tool market and commercial boundary for just-in-time service procurement. It enforces one immutable chain:

```text
capability gap 
  → service request / comparison 
  → Quote (binding price, terms, parties, expiry) 
  → Call (atomic reservation, x402 payment, execution) 
  → delivery or uncertainty 
  → remedy if required (once-only refund / adjustment) 
  → Purchase resolution / status 
  → Outcome records (Logs, Usage, Spend, Documents, Earnings) 
  → agent continues
```

### Immutable Commercial Distinctions
Under no circumstances may any design or implementation collapse these boundaries:
1. **Funding is not Authority:** Holding credit does not grant spending permission.
2. **Authority is not a Purchase:** Spending policy allowance is not an executed Call.
3. **Buyer Consideration is not Provider Obligation:** AUD paid by customer does not equal USDC transferred upstream to provider.
4. **Settlement is not Delivery:** On-chain payment confirmation does not prove the Tool delivered valid output.
5. **Delivery is not Purchase Resolution:** Receiving output is not final commercial closure until adjustments and status reconcile.
6. **Provider $\neq$ Seller $\neq$ Payment Recipient:** Agentic Economy is the buyer-facing Seller; the Tool operator is the Provider; the crypto address is the Payment Recipient.

---

## 2. The 8-Point IceInVein Engineering Framework

Every release row (AM-01 through AM-32) must satisfy all 8 dimensions of the IceInVein engineering discipline before any implementation begins:

```text
1. Thesis Fit (design-review / Brooks)
   └─ Does this directly serve the buyer/provider journey? What is explicitly cut?
2. Semantic Contract (contract-enforcer / Meyer)
   └─ Preconditions (Requires), Postconditions (Ensures), Invariants, Loud Violations.
3. Type-Driven Modeling (type-driven-designer / Wlaschin & Minsky)
   └─ Make illegal states unrepresentable. Discriminated unions, branded types, no boolean flag explosions.
4. Temporal Invariants (temporal-coupling-detector / Hunt, Thomas, Seemann)
   └─ Eliminate hidden order dependencies. Phase encoding; A's output is B's input.
5. Error Taxonomy & Guarantees (error-strategist / Duffy & Abrahams)
   └─ Bug (crash/assert) vs Recoverable (typed refusal union) vs Fatal (clean exit). Exception safety guarantees.
6. Idempotency & Replay Safety (idempotency-guardian / Helland)
   └─ At-least-once delivery; idempotency keys; side-effect isolation; replay returns cached result.
7. CQS & Boundary Architecture (cqs-auditor / Meyer)
   └─ Pure queries (side-effect free) vs Commands (mutates state, returns void/receipt). No concealed commands.
8. Simplicity & Complexity Budget (simplicity-razor / Hickey & complexity-accountant / Ousterhout)
   └─ Decomplect braided concerns. Deep modules (simple interface, rich implementation). Minimal change amplification.
```

---

## 3. Dependency-Driven Layer Architecture

Execution proceeds strictly bottom-up by fact dependencies, never in random register order:

```text
Layer 0  [BASELINE PROVEN]  AM-02, AM-03, AM-04, AM-05, AM-06, AM-07, AM-08, AM-13, AM-19, AM-20
                            AM-01, AM-25, AM-28, AM-30, AM-31, AM-32 (Hosted-Only Fences)

Layer 1  [MONEY FACT FLOOR] AM-10: Duplicate or reordered Stripe events converge once
                            (The foundation of all balances, credits, and document records)

Layer 2  [MONEY OUTCOMES]   AM-09: Cancelled, failed, or expired Checkout return
                            AM-12: Supported funding refund / reversal

Layer 3  [MONEY RECORDS]    AM-11: Funding receipts, fee documents, period aggregation

Layer 4  [SUPPLY CANARY]    AM-14: Submit → platform-funded validation canary → publish

Layer 5  [SUPPLY LIFECYCLE] AM-15: Interrupted validation Call recovery
                            AM-16: Expiry, withdrawal, late callback protection
                            AM-17: Revise, withdraw, republish lifecycle

Layer 6  [PURCHASE FACTS]   AM-18: Free search; Quote binds version, input, price, parties, evidence

Layer 7  [PURCHASE REC]     AM-21: Interrupted buyer Call resume by durable reference
                            AM-22: Failed or disputed delivery, supported remedy once

Layer 8  [CROSS-SURFACE]    AM-23: Cross-surface reconciliation (Logs, Usage, Spend, Documents, Earnings)
                            AM-24: Continuation parity across HTTP, CLI, MCP, and Chat
                            AM-26: Connection isolation and resumable cleanup
                            AM-29: Help with Call reference and offboarding honesty

Layer 9  [UI & AUDIT]       AM-27: Supported UI journeys, keyboard navigation, honest states
```

---

## 4. Comprehensive Architectural Design per AM Item

---

### AM-01: Named Candidate and Sandbox Fences
- **Category:** Account and Access / Fences
- **Thesis Fit:** Live funds and mainnet assets must never leak through any direct API, UI, or script request. The sandbox environment is strictly bounded to Base Sepolia and Stripe Test Mode.
- **Contract:**
  ```text
  CONTRACT: enforceSandboxFence(requestContext, operation)
    Requires: AE_SERVICE_MODE is 'sandbox' | 'hosted_alpha'; commercial policy controls active.
    Ensures:  Rejects live funding attempts, mainnet EVM chain IDs (8453), or unapproved test tokens.
    Invariant: Health check 200 OK does NOT imply sellable state; degraded upstream dependency (e.g. Formance offline) fails closed, never minting a funded Call.
    On violation: 403 Forbidden with Problem type 'https://agentic-economy.com/errors/sandbox-fence-violation'.
  ```
- **Type-Driven Design:**
  - `type DeploymentClass = 'sandbox' | 'hosted_alpha' | 'production'` (no boolean flags `isSandbox: boolean`).
  - `type AllowedChainId = 84532` (Base Sepolia only; Base mainnet `8453` rejected at compile time).
- **Temporal Invariants:** Fence evaluation executes at the outermost request pipeline boundary BEFORE quote generation, balance reservation, or wallet signature dispatch.
- **Error Strategy:** Recoverable refusal (`sandbox_fence_violation`) with explicit problem detail; basic guarantee.
- **Idempotency:** Pure query; side-effect free.
- **Simplicity & Cuts:** No custom firewall layer; enforce via existing `hosted_alpha` commercial policy evaluator.
- **Source Seams:** `src/lib/server/gateway-json-route.ts`, `src/modules/capability-execution/call-worker/call-execution-gates.ts`.

---

### AM-02: Interactive Authentication and Account Recovery
- **Category:** Account and Access
- **Thesis Fit:** An invited user logs in through Clerk, resolves to exactly one canonical Account, and can navigate safely without session redirect loops, lost destinations, or duplicate account creation.
- **Contract:**
  ```text
  CONTRACT: resolveInteractiveAccount(clerkSessionToken, returnDestination)
    Requires: Valid Clerk JWT; returnDestination is a normalized application-relative URL.
    Ensures:  Resolves Clerk user ID to durable Principal, Account, and Ownership records; idempotently provisions on first login; restores existing Account on repeat logins.
    Invariant: Sign-out clears session credentials, NEVER mutates durable Account data, history, or policies.
    On violation: Discards unsafe/external return URL and falls back to '/'; unauthenticated session redirects to sign-in with preserved return context.
  ```
- **Type-Driven Design:**
  - `type AppRelativeUrl = string & { readonly __brand: 'AppRelativeUrl' }`.
  - `type SessionResolution = | { status: 'authenticated'; accountId: AccountId; principal: AgentAccessPrincipal } | { status: 'unauthenticated'; signInUrl: string } | { status: 'forbidden'; reason: string }`.
- **Temporal Invariants:** Clerk verification $\rightarrow$ Account materialization $\rightarrow$ Role binding $\rightarrow$ Route admission. Two-phase initialization prohibited.
- **Error Strategy:** Invalid token = 401; Missing ownership = 403 `ownership_missing`; Malformed session = 400.
- **Idempotency:** `provisionInteractiveAccount` in Convex uses atomic upsert indexed by Clerk user ID.
- **Source Seams:** `src/lib/server/agent-access-auth.ts`, `convex/interactiveAuthority.ts`.

---

### AM-03: Clerk Security Event History
- **Category:** Account and Access / Audit
- **Thesis Fit:** Sensitive security events (password changes, session revocations, MFA updates) are logged in the Account's durable history with cryptographic proof of origin and replay safety.
- **Contract:**
  ```text
  CONTRACT: recordClerkSecurityEvent(headers, rawBody)
    Requires: Svix headers (svix-id, svix-timestamp, svix-signature) valid; payload matches Clerk schema.
    Ensures:  Extracts event identity; writes single audit record to accountSecurityEvents table.
    Invariant: Replaying same svix-id produces no duplicate audit record and returns 200 OK.
    On violation: 400 Bad Request for signature mismatch or malformed JSON.
  ```
- **Type-Driven Design:**
  - `type ClerkSecurityEvent = { svixId: string; eventType: ClerkSecurityEventType; accountId: AccountId; recordedAt: number; data: Record<string, unknown> }`.
- **Temporal Invariants:** Cryptographic signature verification must succeed BEFORE payload deserialization or database insertion.
- **Idempotency:** Database unique constraint on `svixId`.
- **Source Seams:** `src/routes/api.v1.security.webhook.ts`, `convex/accountSecurity.ts`.

---

### AM-04: Account and Role Isolation
- **Category:** Account and Access / RBAC
- **Thesis Fit:** Possessing an Account ID or resource identifier grants no access. Owners, Agents, and Administrators are strictly restricted to their authorized boundaries.
- **Contract:**
  ```text
  CONTRACT: assertAccountAccess(principal, targetResourceRef, requiredPermission)
    Requires: Valid authenticated principal; target resource reference.
    Ensures:  Verifies principal's accountId matches target resource's accountId and role has requiredPermission.
    Invariant: Cross-account queries for private resources return 404 Not Found (concealed-not-found) to prevent enumeration. Public catalog items remain accessible.
    On violation: 404 for unowned private resources; 403 for owned resources with insufficient role.
  ```
- **Type-Driven Design:** Branded identifiers: `AccountId`, `PrincipalId`, `BusinessId`, `CallRef`, `QuoteRef`. No unbranded strings crossing authorization boundaries.
- **Error Strategy:** Concealed 404 prevents resource existence leakage; strong exception guarantee.
- **Source Seams:** `src/lib/server/agent-access-auth.ts`, `src/modules/agent-access/access.ports.ts`.

---

### AM-05: Buyer Connection, Approval, and Return
- **Category:** Account and Access / Agent Connection
- **Thesis Fit:** A customer connects an Agent via CLI or IDE extension, approves it with an initial spending policy, and the Agent immediately discovers tools and requests quotes without manual configuration.
- **Contract:**
  ```text
  CONTRACT: approveAgentConnection(deviceCode, ownerPrincipal, spendingPolicy)
    Requires: Valid pending deviceCode; authenticated owner principal; valid spending policy constraints.
    Ensures:  Binds device code to new Agent Principal; attaches SpendingPolicy; transitions state to 'approved'.
    Invariant: Polling during pending returns { status: 'pending', pollAfterMs: 2000 }; after approval, device exchanges code for Agent credential token.
    On violation: Expired code returns { status: 'expired' }; rejected approval returns { status: 'denied' }.
  ```
- **Type-Driven Design:**
  - `type DeviceAuthorizationStatus = | { status: 'pending'; pollAfterMs: number } | { status: 'approved'; token: AgentCredentialToken } | { status: 'denied' } | { status: 'expired' }`.
- **Simplicity Cuts:** Standard RFC 8628 Device Authorization Grant. No custom deep links or proprietary chat schemes.
- **Source Seams:** `src/routes/api.v1.agent.authorize.ts`, `@agentic-economy/cli`.

---

### AM-06: Credential Replacement and Retained Capacity
- **Category:** Account and Access / Credentials
- **Thesis Fit:** Rotating an Agent's credential creates a fresh secret while preserving the Agent's durable identity, history, and current-period spending usage. Revocation kills the old key immediately.
- **Contract:**
  ```text
  CONTRACT: rotateAgentCredential(agentId, ownerPrincipal)
    Requires: Active Agent belonging to owner's Account.
    Ensures:  Increments credentialGeneration; mints new credential key; marks previous generation as 'revoked'; retains accumulated period spend.
    Invariant: Revoked credential cannot authorize new Quotes or Calls. Concurrent use of old and new credentials cannot double-spend period allowance.
    On violation: Calls with revoked credential receive 401 Unauthorized with code 'credential_revoked'.
  ```
- **Type-Driven Design:**
  - `type CredentialRecord = { credentialId: CredentialId; agentId: AgentId; generation: number; status: 'active' | 'revoked'; revokedAt?: number }`.
- **Temporal Invariants:** Atomic Convex mutation replaces active generation in a single transaction.
- **Source Seams:** `convex/agentSpendingPolicy.ts`, `convex/interactiveAuthority.ts`.

---

### AM-07: Funding Quote Agrees with Checkout
- **Category:** Funding and Customer Records
- **Thesis Fit:** A customer requesting credit sees exact AUD amounts (principal, 2.50% service fee, 10% GST on fee, total). Authorizing Checkout charges the exact total, and the full principal is credited.
- **Contract:**
  ```text
  CONTRACT: calculateFundingQuote(principalAmount, accountRef)
    Requires: principalAmount is positive AUD exact amount (min $5.00, max $25,000.00, step $0.01).
    Ensures:  serviceFee = 250 bps; taxOnFee = 10% of serviceFee; totalPayment = principalAmount + serviceFee + taxOnFee; advisory TTL = 300s.
    Invariant: Service fee is collected on top of principal. Service fee NEVER reduces customer balance.
    On violation: Amounts outside bounds return 400 Problem 'funding_amount_out_of_bounds'.
  ```
- **Type-Driven Design:**
  - `type ExactAmount = { currency: 'AUD'; units: string; exponent: 6 }`.
  - `type FundingQuote = { principalAmount: ExactAmount; serviceFee: ExactAmount; taxOnServiceFee: ExactAmount; totalPayment: ExactAmount; serviceFeeBps: 250; advisoryExpiry: number }`.
- **Source Seams:** `src/routes/api.v1.funding.quote.ts`, `src/modules/money/internal/account-funding-http.ts`.

---

### AM-08: Successful Sandbox Checkout Credits Once
- **Category:** Funding and Customer Records
- **Thesis Fit:** A successful Stripe Checkout session triggers Formance ledger posting, crediting the exact AUD principal to the customer's available balance once.
- **Contract:**
  ```text
  CONTRACT: finalizeSuccessfulFunding(stripeSessionId)
    Requires: Stripe session payment_status === 'paid'; verified webhook or authoritative Stripe SDK readback.
    Ensures:  Posts credit to Formance ledger under transaction reference 'funding:${commandRef}'; updates command state to 'succeeded'.
    Invariant: Browser return does NOT authorize credit. Formance posting occurs strictly on verified settlement evidence.
    On violation: Unpaid or fraudulent session leaves balance untouched and marks command 'failed'.
  ```
- **Idempotency:** Formance transaction reference locked to `command.idempotencyKey`.
- **Source Seams:** `convex/moneyAccountFunding.ts`, `src/modules/money/formance.ts`.

---

### AM-09: Cancelled, Failed, or Expired Checkout Return
- **Category:** Funding and Customer Records / Recovery
- **Thesis Fit:** If Checkout is cancelled, fails, or expires, the customer returns to an honest UI state without double-charging or account lockup. Settled-despite-failed-browser displays credit, not a retry button.
- **Contract:**
  ```text
  CONTRACT: resolveCheckoutReturn(sessionId, accountPrincipal)
    Requires: Valid Stripe sessionId or cancel signal.
    Ensures:  Authoritative status check:
              - If succeeded: returns { state: 'succeeded', balance: ExactAmount, documents: string[] }.
              - If awaiting_payment: returns { state: 'awaiting_payment', checkoutUrl: string }.
              - If expired/failed: returns { state: 'expired' | 'failed', retryable: true }.
              - If cancelled: returns { state: 'cancelled' }.
    Invariant: Settled payment never invites a second Checkout. Retrying terminal failure creates a new command; retrying unknown outcome polls the existing command.
    On violation: Unknown session returns 404 Problem.
  ```
- **Type-Driven Design:**
  - `type FundingReturnResolution = | { state: 'succeeded'; creditedAmount: ExactAmount; availableBalance: ExactAmount; receiptId: string } | { state: 'awaiting_payment'; checkoutUrl: string; expiresAt: number } | { state: 'expired'; retryable: true } | { state: 'failed'; reason: string; retryable: true } | { state: 'cancelled' }`.
- **Temporal Invariants:** Return page reads durable command status from Convex/Stripe; it cannot execute `begin` for a second command on the same attempt.
- **Source Seams:** `src/routes/fund.cancelled.tsx`, `src/routes/api.v1.account.funding-sessions.$fundingSessionId.ts`, `src/components/ae/console/use-account-funding.ts`.

---

### AM-10: Duplicate or Reordered Stripe Events Convergence (Money Fact Floor)
- **Category:** Funding and Customer Records / Concurrency
- **Thesis Fit:** Stripe events (`checkout.session.completed`, `payment_intent.succeeded`, `charge.succeeded`) can arrive out of order, duplicated, or interrupted. System converges on exactly one balance credit, one fee record, and one document set.
- **Contract:**
  ```text
  CONTRACT: stripeFundingConvergence(event)
    Requires: Cryptographically verified Stripe webhook; event references existing funding command.
    Ensures:  Deduplicates against stripeWebhookInbox; if Formance posting has not occurred, atomically posts credit and fee to Formance and enqueues document issuance; if already posted, marks event processed without second ledger transaction.
    Invariant: Exactly one Formance credit of principalAmount and one fee posting occur, regardless of event arrival sequence or duplicate webhook delivery.
    On violation: Unknown command marks event 'action_required' for operator intervention; never mints unbacked funds.
  ```
- **Type-Driven Design:**
  - `type StripeConvergenceOutcome = | { kind: 'converged_new'; transactionRef: string; documentsIssued: [string, string] } | { kind: 'converged_replayed'; transactionRef: string } | { kind: 'action_required'; reason: string }`.
- **Temporal Invariants:** Inbox dedup check $\rightarrow$ Command resolution $\rightarrow$ Formance atomic post under idempotency key $\rightarrow$ Document generation enqueue $\rightarrow$ Inbox status `completed`.
- **Idempotency Guardian:** Webhook inbox primary key `event.id`; Formance transaction key `funding:${commandRef}:credit`.
- **Source Seams:** `convex/moneyAccountFunding.ts`, `convex/lib/money/funding-stripe-event-pipeline.ts`, `tests/unit/convex/money-account-funding.test.ts`.

---

### AM-11: Funding Receipts and Period Documents
- **Category:** Funding and Customer Records / Statements
- **Thesis Fit:** Customers can view and reconcile funding receipts, fee documents, and monthly statements. All amounts sum exact sub-cent units before rounding. Unauthorized links disclose nothing.
- **Contract:**
  ```text
  CONTRACT: readAccountDocument(documentId, customerPrincipal)
    Requires: Authenticated customer principal owning the document's Account.
    Ensures:  Returns document metadata and signed download URL; sums exact units before display rounding.
    Invariant: Foreign account access returns concealed 404. Unsettled transactions produce no receipts.
    On violation: 404 Not Found.
  ```
- **Type-Driven Design:**
  - `type DocumentKind = 'funding_receipt' | 'platform_fee_receipt' | 'period_statement' | 'tax_invoice'`.
  - `type DocumentStatus = 'preparing' | 'issued' | 'failed'`.
- **Temporal Invariants:** Document issuance can only be marked `issued` after Formance posting transaction reference is committed.
- **Source Seams:** `convex/moneyDocuments.ts`, `src/routes/api.v1.account.documents.ts`, `tests/unit/convex/money-documents.test.ts`.

---

### AM-12: Supported Funding Refund / Reversal
- **Category:** Funding and Customer Records / Reversals
- **Thesis Fit:** When a funding payment is refunded via Stripe, exactly one matching debit adjustment is posted to Formance, available credit is decreased, and a reversal receipt is generated.
- **Contract:**
  ```text
  CONTRACT: processFundingRefund(stripeRefundEvent)
    Requires: Verified Stripe refund event with status === 'succeeded'.
    Ensures:  Posts debit transaction to customer's Formance account reversing original credit; updates funding command status to 'reversed'.
    Invariant: Interrupted retry reuses 'funding-reversal:${refundId}' key; duplicate events never deduct balance twice.
    On violation: Unmatched refund event marks event 'action_required'.
  ```
- **Idempotency:** Formance transaction key: `funding-reversal:${refundId}`.
- **Source Seams:** `convex/moneyAccountFunding.ts`, `src/modules/money/formance.ts`, `tests/unit/convex/money-account-funding.test.ts`.

---

### AM-13: Provider Connection and Draft
- **Category:** Provider Supply
- **Thesis Fit:** A Provider connects their service via x402 specification, proves control of the payee EVM address via EIP-191 signature, and creates a draft Tool without making it discoverable.
- **Contract:**
  ```text
  CONTRACT: createProviderConnection(input, ownerPrincipal)
    Requires: Valid EIP-191 signature verifying payee address; valid x402 seller endpoint.
    Ensures:  Creates Provider business and stores initial Tool offering in 'draft' status.
    Invariant: Tool draft is NOT discoverable in public catalog, NOT quotable, and NOT callable by buyers.
    On violation: Invalid EVM signature returns 400 Problem 'invalid_payee_proof'.
  ```
- **Type-Driven Design:**
  - `type ToolStatus = 'draft' | 'validating' | 'active' | 'withdrawn' | 'frozen'`.
- **Source Seams:** `convex/lib/providerConnections/owner.ts`, `src/modules/capability-supply/supply-actions.ts`.

---

### AM-14: Submit, Validate, Publish for Sandbox Quotes
- **Category:** Provider Supply / Publication
- **Thesis Fit:** Publishing a Tool requires passing exactly one bounded platform-funded canary validation Call against the sandbox target. A 402 probe is not enough; contract-valid output is mandatory before public Quotes.
- **Contract:**
  ```text
  CONTRACT: publishToolOffering(offeringId, ownerOrAgentPrincipal)
    Requires: Offering in 'draft' status; valid provider connection; platform canary budget available.
    Ensures:  Dispatches platform-funded canary Call to 'POST https://agentic-economy-sandbox-tools.vercel.app/x402/execute'; validates output against schema; on success, promotes offering status to 'active'.
    Invariant: Platform funds the canary from corporate treasury; NO customer or buyer balance is charged. Tool becomes quotable ONLY after output validation succeeds.
    On violation: Output mismatch marks offering 'action_required' with specific error; Tool remains unquotable.
  ```
- **Temporal Invariants:** Draft $\rightarrow$ Canary Dispatch $\rightarrow$ Output Validation $\rightarrow$ Promotion to Active.
- **Source Seams:** `convex/catalogOfferingMutations.ts`, `convex/lib/catalog/sellerCanary.ts`, `src/modules/capability-supply/internal/supply-publish-pipeline.ts`.

---

### AM-15: Interrupted Provider Validation Recovery
- **Category:** Provider Supply / Recovery
- **Thesis Fit:** If client polling disconnects or network times out during validation, the validation case remains durable. Resuming recovery rechecks the existing Call rather than minting a duplicate payment.
- **Contract:**
  ```text
  CONTRACT: recoverValidationCall(admissionCaseId, principal)
    Requires: Retained admission case; authorized provider principal.
    Ensures:  Inspects retained Call:
              - never_signed: re-dispatches execution using original parameters.
              - expired_signing: re-issues challenge or fails truthfully.
              - submitted_uncertain: polls settlement without fresh signature.
    Invariant: NO second payment authorization, NO duplicate canary reservation, NO buyer balance charge.
    On violation: Late overwrite rejected; original validation evidence preserved.
  ```
- **Type-Driven Design:**
  - `type ValidationRecoveryState = | { kind: 'never_signed'; callRef: string } | { kind: 'expired_signing'; callRef: string } | { kind: 'submitted_uncertain'; callRef: string; pollAfterMs: number } | { kind: 'completed'; output: unknown } | { kind: 'failed'; reason: string }`.
- **Source Seams:** `convex/lib/callLifecycle/dispatchSellerCanary.ts`, `convex/capabilityCallRecovery.ts`, `tests/unit/convex/capability-call-recovery.test.ts`.

---

### AM-16: Expiry, Withdrawal, Late Callback Protection
- **Category:** Provider Supply / State Invariants
- **Thesis Fit:** When a Tool is withdrawn or frozen, new Quotes and Calls are blocked immediately. Late callbacks from completed workers cannot republish withdrawn supply or overwrite authoritative state.
- **Contract:**
  ```text
  CONTRACT: withdrawToolOffering(offeringId, ownerPrincipal)
  CONTRACT: handleValidationWorkerCallback(offeringId, validationResult)
    Requires: Offering in valid state; authorized principal / worker token.
    Ensures:  Withdrawal transitions offering to 'withdrawn' and freezes routeability (providerRouteabilityIsFrozen = true). Late worker callback records execution evidence but REFUSES to promote status to 'active'.
    Invariant: Offering status cannot be downgraded from 'withdrawn' to 'active' by a delayed callback.
    On violation: Late callback on withdrawn tool returns { kind: 'refused', reason: 'offering_withdrawn' }.
  ```
- **Type-Driven Design:**
  - FSM strict transitions: `draft -> validating -> active -> withdrawn`. No transition from `withdrawn -> active` without fresh submission.
- **Source Seams:** `convex/catalogOfferingMutations.ts`, `convex/lib/catalog/offeringPersistence.ts`, `tests/integration/capability-supply-sandbox-publish.test.ts`.

---

### AM-17: Revise, Withdraw, Republish Lifecycle
- **Category:** Provider Supply / Versioning
- **Thesis Fit:** Material revisions (schema, price, endpoint) require re-validation. Replay after promotion preserves identity without forcing the Provider to become private again.
- **Contract:**
  ```text
  CONTRACT: reviseOfferingVersion(offeringId, revisionInput, ownerPrincipal)
    Requires: Existing active offering; valid revised parameters.
    Ensures:  Creates new offering revision in 'draft' status; existing revision remains 'active' until new revision passes canary validation.
    Invariant: Material changes do not alter pending Quotes or Calls bound to the previous version.
    On violation: Invalid revision parameters return 400 Problem.
  ```
- **Source Seams:** `convex/catalogOfferingMutations.ts`, `src/routes/api.v1.supply.republish.ts`.

---

### AM-18: Free Search; Quote Binds Version, Input, Price, Parties, Evidence
- **Category:** Buyer Purchase
- **Thesis Fit:** Searching and browsing tools is free (0 AUD). `tool.quote` is the sole viability read: it binds Tool version, literal input digest, all-in AUD price, challenge digest, and distinct parties (Seller: Agentic Economy, Provider: businessId, Payment Recipient: payee address).
- **Contract:**
  ```text
  CONTRACT: issueToolQuote(toolRef, inputPayload, agentPrincipal)
    Requires: Admitted sandbox Tool; valid Agent authority; schema-compliant input.
    Ensures:  Validates x402 challenge (USDC on Base Sepolia); calculates all-in AUD price (rate + fee); returns signed Quote valid for 5 minutes.
    Invariant: Browsing/search consumes 0 AUD. Quote projects distinct parties: { seller: 'Agentic Economy', provider: businessId, paymentRecipient: payeeAddress }.
    On violation: Unsupported network or recipient returns 422 Problem 'unsupported_settlement_parameters'.
  ```
- **Type-Driven Design:**
  - `type ToolQuote = { quoteRef: string; toolRef: string; toolVersion: string; inputDigest: string; priceAUD: ExactAmount; challengeDigest: string; expiresAt: number; parties: { seller: 'Agentic Economy'; provider: string; paymentRecipient: string } }`.
- **Source Seams:** `convex/capabilityQuotes.ts`, `src/modules/capability-execution/quote.ts`, `tests/unit/convex/capability-quotes.test.ts`.

---

### AM-19: Accept Quote, Literal Output, One Capture
- **Category:** Buyer Purchase / Execution
- **Thesis Fit:** Calling an accepted Quote moves AUD from available to reserved, executes paid x402 call from pooled corporate USDC, captures AUD on delivery, and returns literal output. Replay returns identical output without double-charge.
- **Contract:**
  ```text
  CONTRACT: executeToolCall(quoteRef, idempotencyKey, agentPrincipal)
    Requires: Valid unexpired Quote; sufficient customer balance and agent budget; unique idempotencyKey.
    Ensures:  Atomically reserves AUD in Formance; executes x402 payment and call via CDP wallet; captures AUD on verified delivery; returns literal output.
    Invariant: Replay with same idempotencyKey returns cached output, 1 reservation, 1 capture, 1 USDC transfer.
    On violation: Expired quote returns 409 'quote_expired'; insufficient funds returns 402 'insufficient_funds'.
  ```
- **Idempotency:** Idempotency key scoped to `(principalId, idempotencyKey)`.
- **Source Seams:** `src/lib/server/call-api.ts`, `convex/capabilityCalls.ts`, `convex/lib/callLifecycle/dispatch.ts`.

---

### AM-20: Scarcity Refusal and Concurrent Capacity
- **Category:** Buyer Purchase / Policy
- **Thesis Fit:** When available balance, spending policy limit, or platform treasury capacity is insufficient, the Call is refused before any reservation or wallet signature. Concurrent calls cannot double-spend capacity.
- **Contract:**
  ```text
  CONTRACT: evaluateSpendingCapacity(agentPrincipal, quoteAmount)
    Requires: Authenticated agent; current spending policy; atomic balance check.
    Ensures:  Verifies available balance >= quoteAmount, daily spent + quoteAmount <= daily limit, monthly spent + quoteAmount <= monthly limit, treasury capacity available.
    Invariant: Refusal admits 0 purchase, leaves balance untouched, and releases any locks.
    On violation: Returns typed refusal: 'insufficient_customer_funds' | 'agent_daily_limit_exceeded' | 'agent_monthly_limit_exceeded' | 'treasury_capacity_constrained'.
  ```
- **Temporal Invariants:** Capacity and policy checks occur atomically BEFORE signature generation and BEFORE provider dispatch.
- **Source Seams:** `convex/agentSpendingPolicy.ts`, `convex/lib/agentSpendingPeriods.ts`, `tests/integration/agent-spending-periods.test.ts`.

---

### AM-21: Interrupted Buyer Call Resume by Durable Reference
- **Category:** Buyer Purchase / Recovery
- **Thesis Fit:** If client disconnects or process crashes during a Call, resuming with `callRef` from a fresh process restores exact status. Pre-submission failure releases the reservation; uncertain submission retains the hold until verified.
- **Contract:**
  ```text
  CONTRACT: resumeBuyerCall(callRef, agentPrincipal)
    Requires: Valid callRef belonging to caller's Account.
    Ensures:  Returns current status and permitted next action:
              - Pre-submission failure: hold released, status 'failed', nextAction 'create_new'.
              - Submitted-uncertain: hold retained, status 'submitted_uncertain', nextAction 'poll' | 'reconcile'.
              - Delivered: returns output, status 'delivered'.
    Invariant: Timeout does NOT authorize blind retry or release of funds if transaction may have reached the network.
    On violation: Unauthorized caller receives 404 Not Found.
  ```
- **Type-Driven Design:**
  - `type CallResumeStatus = | { status: 'submitted_uncertain'; pollAfterMs: 5000; nextAction: { kind: 'poll' } } | { status: 'delivered'; output: unknown } | { status: 'released'; reason: string; nextAction: { kind: 'create_new' } }`.
- **Source Seams:** `src/lib/server/call-api.ts`, `convex/capabilityCallRecovery.ts`, `tests/unit/convex/capability-call-recovery.test.ts`.

---

### AM-22: Failed or Disputed Delivery, Supported Remedy
- **Category:** Buyer Purchase / Remedy
- **Thesis Fit:** When delivery fails or is disputed after funds were captured, supported remedy issues exactly one Formance adjustment/refund, updates purchase status to `remedied`, and preserves the complete audit trail.
- **Contract:**
  ```text
  CONTRACT: applyCallRemedy(callRef, reason, ownerOrAdminPrincipal)
    Requires: Call in failed/disputed state; eligible for remedy; authorized actor.
    Ensures:  Posts Formance refund transaction reversing AUD charge; updates Call purchase status to 'remedied'; creates adjustment record.
    Invariant: Original Call, payment attempt, and remedy adjustment remain linked. Replay applies remedy once.
    On violation: Ineligible call returns 400 Problem 'call_ineligible_for_remedy'.
  ```
- **Idempotency:** Remedy command keyed by `remedy:${callRef}`.
- **Source Seams:** `src/routes/api.v1.calls.$callRef.reconcile.ts`, `convex/capabilityCallRecovery.ts`, `src/modules/capability-execution/adapters/convex-call-execution.adapter.ts`.

---

### AM-23: Cross-Surface Reconciliation (Logs, Usage, Spend, Documents, Earnings)
- **Category:** Cross-Surface Coherence
- **Thesis Fit:** Calls, Logs, Usage, Spend, Documents, and Provider Earnings views tell one coherent story. Buyer consideration (AUD) is never conflated with upstream settlement (USDC). Provider, Seller, and Recipient are distinct.
- **Contract:**
  ```text
  CONTRACT: reconcileCrossSurfaceRecords(callRef)
    Requires: Authoritative Call record with associated Formance and settlement evidence.
    Ensures:  Consistent projection across Logs, Usage, Spend, Settlement, and Earnings.
    Invariant: Pending stays pending on all surfaces. Sum of individual Call spends equals account total spend. Provider != Seller != Recipient.
    On violation: Mismatched surface data triggers alert; never emits fabricated success.
  ```
- **Source Seams:** `convex/capabilityCallProjection.ts`, `src/components/ae/call-receipt/CallMoneyFacts.tsx`, `src/components/ae/console/AeAccountHistoryTable.tsx`.

---

### AM-24: Continuation Parity Across HTTP, CLI, MCP, and Chat
- **Category:** Cross-Surface Coherence
- **Thesis Fit:** On non-terminal states, HTTP API, installed CLI, MCP server, and chat interfaces agree on the exact Call status and permitted next action (`nextAction`). No surface offers a blind retry where another requires reconciliation.
- **Contract:**
  ```text
  CONTRACT: normalizeCallContinuation(callRecord, clientSurface)
    Requires: Valid Call record in any lifecycle state.
    Ensures:  Emits standardized response: { callRef, status, nextAction: { kind: 'poll' | 'reconcile' | 'continue' | 'create_new' } }.
    Invariant: No surface allows fresh tool.call when Call is in 'submitted_uncertain'.
    On violation: Client attempting unpermitted action receives 409 Conflict.
  ```
- **Source Seams:** `src/lib/server/call-api.ts`, `@agentic-economy/cli`, `src/routes/api.v1.calls.$callRef.ts`.

---

### AM-25: Infisical Hosted Secret Lifecycle (Hosted Only)
- **Category:** Infrastructure / Hosted Only
- **Thesis Fit:** Sensitive credentials (Stripe, CDP, Clerk) are stored in Infisical and injected via runtime environment without manual operator copying.

---

### AM-26: Connection Isolation and Resumable Cleanup
- **Category:** Security & Isolation
- **Thesis Fit:** One owner cannot view, modify, or revoke another owner's Provider connection. Revoking a connection cleans up external credentials; failed external cleanup is resumable without premature deletion claims.
- **Contract:**
  ```text
  CONTRACT: revokeProviderConnection(connectionId, ownerPrincipal)
    Requires: Active connection belonging to caller's Account.
    Ensures:  Marks connection 'revoking'; invokes provider cleanup endpoint; on success marks 'revoked'.
    Invariant: Cross-account revocation returns 404. Connection is not marked deleted until external cleanup succeeds. If cleanup fails, state is 'cleanup_failed' and remains resumable.
    On violation: 404 for foreign connection.
  ```
- **Source Seams:** `convex/lib/providerConnections/ownerRevoke.ts`, `src/modules/capability-supply/supply-actions.ts`.

---

### AM-27: Supported UI Journeys, Keyboard, and Honest States
- **Category:** UI / Usability
- **Thesis Fit:** Every UI journey (Funding, Call Receipt, Console, Recovery) works on desktop, compact layout, and full keyboard navigation. States are honest: loading shows spinners, empty shows guidance, errors explain the cause and next action.
- **Contract:**
  - Distinct views for every state: `LoadingView`, `EmptyView`, `ErrorView`, `SuccessView`.
  - Accessible keyboard navigation without focus traps.
  - No internal jargon (e.g. no "Convex error", "Formance uncommitted", "x402 reject"); plain customer-facing copy.
- **Source Seams:** `src/components/ae/call-receipt/CallStatusViews.tsx`, `src/components/ae/console/AeCreditTopUpPanel.tsx`.

---

### AM-28: Failure Correlation and Intended Destinations (Hosted Only)
- **Category:** Observability / Hosted Only
- **Thesis Fit:** Failures generate an opaque correlation ID (`correlationRef`) presented to the user and routed to Sentry/PostHog without exposing secrets.

---

### AM-29: Help with Call Reference and Offboarding Honesty
- **Category:** Support & Offboarding
- **Thesis Fit:** Failed or uncertain Calls offer a direct link to `/support?callRef=...` pre-filling the ticket. Offboarding preview explains completed vs outstanding obligations and refuses to cancel submitted on-chain payments.
- **Contract:**
  ```text
  CONTRACT: generateSupportLink(callRef) -> '/support?callRef=' + callRef
  CONTRACT: previewAccountOffboarding(accountPrincipal)
    Requires: Authenticated owner.
    Ensures:  Returns balance, active tools, in-flight calls, and unsettled obligations.
    Invariant: Offboarding CANNOT cancel an already-submitted on-chain payment or erase financial history.
  ```
- **Source Seams:** `src/routes/support.tsx`, `src/routes/api.v1.supply.offboarding.status.ts`.

---

### AM-30: Disaster Recovery within 300 Seconds (Hosted Only)
- **Category:** Operations / Hosted Only
- **Thesis Fit:** Disaster recovery restores operational state from backup within 300 seconds without financial ledger inconsistency.

---

### AM-31: Cold User Audit of Frozen Inventory (Hosted Only)
- **Category:** QA / Hosted Only
- **Thesis Fit:** Independent cold auditor completes core user journeys within 3 turns without developer intervention.

---

### AM-32: Named Candidate Rollup (Hosted Only)
- **Category:** Release / Hosted Only
- **Thesis Fit:** The release candidate has all previous 31 rows verified with attributable evidence before inviting waitlist users.

---

## 5. Verification & Safety Gating

Before any code modification in this well, the following gates must be satisfied:
1. **Design Sign-off:** Written approval from Joel on this specification.
2. **Pre-flight Check:**
   - `npm run lint` passes (0 warnings, 0 errors).
   - `npx tsc --noEmit` passes (0 errors).
   - `npm run deps:check` passes (`no-circular` at 0).
   - `npm run test:imports` passes (12/12 boundary test suites green).
   - `npm run test:ts-standards` passes.
3. **Execution Channel:** Deep Channel under Sluice.
   - Tasks executed in dependency layer order (Layer 1 $\rightarrow$ Layer 9).
   - Test-first: write failing characterization test before writing production code.
   - Run verification commands in-turn before claiming completion.
