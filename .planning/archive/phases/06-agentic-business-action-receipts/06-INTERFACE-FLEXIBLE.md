# Business Action Card Evaluator — Flexible Interface Design

**Constraint:** Maximize flexibility — support many use cases and future rails.
**Scope:** Interface design only. No implementation.
**Domain basis:** `06-ENGINEERING-REQUIREMENTS.md` and `06-SPEC.md`.

---

## 1. Interface Signature

TypeScript-style pseudocode. The surface is intentionally small for callers but exposes rich extension points for future rails, policies, and projections.

```typescript
// ---------------------------------------------------------------------------
// Primitive / shared value types
// ---------------------------------------------------------------------------

type Hash = string;
type Timestamp = string; // ISO-8601, normalized by the evaluator
type Money = { amount: number; currency: string };

type ActionOutcome =
  | 'greenlight'   // authority proven, evidence sufficient, action admitted
  | 'refuse'       // authority denied or rules blocked
  | 'proof-gap';   // authority not yet deniable, but evidence is missing/mismatched

type Audience =
  | 'owner'        // full owner/operator view
  | 'agent'        // Hermes/agent runtime view (hashes + non-sensitive refs)
  | 'admin'        // operator/auditor view
  | 'public';       // redacted public projection

// ---------------------------------------------------------------------------
// Domain objects
// ---------------------------------------------------------------------------

type BusinessActionCard = {
  id: string;
  version: string;              // immutable card version
  sourceHash: Hash;             // canonical hash of the card body
  slug: string;                 // e.g. 'provision-paid-intake-endpoint'
  businessId: string;
  title: string;
  description: string;
  visibility: 'public' | 'unlisted' | 'disabled';
  policyFlags: string[];        // e.g. ['owner-approval-required', 'spend-cap-applies']
  evidenceExpectations: EvidenceExpectation[];
  resultArtifactSchema: JsonSchemaRef; // schema the success artifact must satisfy
  // card body is intentionally opaque to callers; version+hash are the contract
};

type EvidenceExpectation = {
  evidenceKind: string;         // e.g. 'payment', 'guardrail', 'execution', 'deployment'
  provider: string;             // e.g. 'stripe', 'nvidia-nemo', 'hermes', 'link-cli'
  required: 'required' | 'optional' | 'forbidden';
  cardinality: 'once' | 'many' | 'at-most-one';
  policyHashHint?: Hash;         // which policy rule governs admission
};

type Mandate = {
  id: string;
  mandateHash: Hash;
  buyerId: string;              // who/what the agent is acting on behalf of
  businessId: string;             // owner/business scope
  allowedActionSlugs: string[];   // e.g. ['provision-paid-intake-endpoint']
  allowedSellerIds: string[];
  maxAmount: Money | null;
  expiresAt: Timestamp;
  revokedAt: Timestamp | null;
  idempotencyKey: string;
  correlationId: string;
  metadata: Record<string, unknown>; // extensible per-use-case constraints
};

type CapabilityRequest = {
  cardId: string;
  cardVersion: string;
  cardHash: Hash;
  mandateHash: Hash;
  actionSlug: string;           // must match card.slug
  inputHash: Hash;              // hash of action-specific inputs (not the inputs themselves)
  requestedAmount: Money | null;
  idempotencyKey: string;       // same key + same body -> idempotent
  correlationId: string;        // ties together all related events/receipts
  requestedAt: Timestamp;
  // caller never supplies authority or provider secrets here
};

type AuthorizationDecision = {
  checkpointId: string;
  requestHash: Hash;
  status: 'accepted' | 'refused' | 'clarification_required';
  decidedBy: string;            // owner/operator principal
  policyHash: Hash;
  decidedAt: Timestamp;
  reason: string;
};

type AuthorizationCheckpoint = {
  checkpointId: string;
  checkpointHash: Hash;
  requestHash: Hash;
  mandateHash: Hash;
  status: 'accepted' | 'refused' | 'clarification_required' | 'proof_gap' | 'expired';
  decidedBy: string | null;
  policyHash: Hash;
  createdAt: Timestamp;
  resolvedAt: Timestamp | null;
};

type ExternalEvidenceEvent = {
  eventId: string;
  provider: string;             // e.g. 'stripe', 'nvidia-nemo', 'hermes', 'link-cli'
  eventType: string;            // e.g. 'payment_intent.succeeded', 'guardrail.allow'
  requestHash: Hash;
  checkpointHash: Hash;
  mandateHash: Hash;
  amount: Money | null;
  providerRefHash: Hash;         // hash of the private provider-side reference
  payloadHash: Hash;             // hash of the canonical normalized payload
  idempotencyKey: string;        // provider/event idempotency key
  correlationId: string;
  observedAt: Timestamp;
  // raw payloads, secrets, prompts, and raw model output are NOT stored here
};

type ActionReceipt = {
  receiptId: string;
  receiptHash: Hash;
  outcome: ActionOutcome;
  outcomeReason: string;
  cardHash: Hash;
  cardVersion: string;
  mandateHash: Hash;
  requestHash: Hash;
  checkpointHash: Hash;
  evidenceRefHashes: Hash[];    // ordered refs to canonical evidence events
  policyHash: Hash;
  priorReceiptId: string | null;
  signature: SignatureEnvelope;  // opaque; callers treat as a blob
  createdAt: Timestamp;
  // public projection only; private fields are in the reconstruction envelope
};

type ReconstructableReceipt = {
  receipt: ActionReceipt;
  card: BusinessActionCard;       // public projection only
  mandate: Mandate;               // public projection only
  request: CapabilityRequest;
  checkpoint: AuthorizationCheckpoint;
  evidence: ExternalEvidenceEvent[]; // admin/owner view, redacted for public
  reconstructionStatus: 'complete' | 'partial' | 'tampered' | 'stale';
  reconstructionLog: ReconstructionEntry[];
};

type VerificationReport = {
  receiptId: string;
  signatureValid: boolean;
  hashChainValid: boolean;
  bindingValid: boolean;         // all hashes and refs cross-check
  policyHashRecognized: boolean;
  status: 'valid' | 'tampered' | 'stale' | 'unbound';
  findings: VerificationFinding[];
};

type AudienceReceipt = {
  receiptId: string;
  outcome: ActionOutcome;
  outcomeReason: string;
  createdAt: Timestamp;
  cardSlug: string;
  cardVersion: string;
  // fields below vary by audience
  public: PublicReceiptProjection;
  owner?: OwnerReceiptProjection;
  agent?: AgentReceiptProjection;
  admin?: AdminReceiptProjection;
};

type RequestState = {
  requestHash: Hash;
  mandateHash: Hash;
  checkpointStatus: AuthorizationCheckpoint['status'] | 'not-created';
  evidenceSummary: EvidenceSummary[];
  latestReceiptId: string | null;
  nextActions: NextAction[];
  terminal: boolean;
};

// ---------------------------------------------------------------------------
// Extension points (how the evaluator stays flexible)
// ---------------------------------------------------------------------------

interface EvidenceAdapter {
  readonly providerId: string;               // e.g. 'stripe'
  readonly eventTypes: string[];             // events this adapter can canonicalize
  canonicalize(rawEvent: unknown): CanonicalEvidence | null;
  validateBinding(
    evidence: CanonicalEvidence,
    request: CapabilityRequest,
    checkpoint: AuthorizationCheckpoint
  ): boolean;
}

interface PolicyRule {
  readonly ruleId: string;
  readonly appliesTo: string[];              // action slugs or '*' wildcard
  evaluate(context: EvaluationContext): PolicyResult;
}

interface ReceiptSigner {
  readonly keyFingerprint: string;
  sign(receipt: UnsignedReceipt): Promise<SignatureEnvelope>;
  verify(receipt: SignedReceipt): Promise<boolean>;
}

interface ReceiptProjection {
  readonly audience: Audience;
  project(receipt: ReconstructableReceipt): AudienceReceiptFragment;
}

// ---------------------------------------------------------------------------
// Evaluator configuration and main interface
// ---------------------------------------------------------------------------

type EvaluatorConfig = {
  evidenceAdapters: EvidenceAdapter[];
  policyRules: PolicyRule[];
  receiptSigner: ReceiptSigner;
  projections: ReceiptProjection[];
  // no secrets, no provider credentials, no wallet/settlement config here
};

interface BusinessActionEvaluator {
  /**
   * Evaluate a capability request against the current mandate, checkpoint,
   * and evidence. Idempotent for the same request + evidence set.
   * Accepts an optional owner/operator decision to drive the checkpoint.
   */
  evaluate(request: EvaluateRequest): Promise<EvaluateResult>;

  /**
   * Ingest an external evidence event (e.g. from a Stripe webhook or Hermes
   * callback). Returns the canonicalized evidence or a proof-gap/hold reason.
   */
  ingestEvidence(evidence: EvidenceIngestionRequest): Promise<EvidenceIngestionResult>;

  /**
   * Submit an explicit owner/operator authorization decision.
   */
  submitDecision(decision: AuthorizationDecision): Promise<DecisionResult>;

  /**
   * Reconstruct the full receipt chain for a given receipt id.
   * Includes private evidence refs only for audiences with permission.
   */
  reconstruct(receiptId: string): Promise<ReconstructableReceipt>;

  /**
   * Verify a signed receipt cryptographically and structurally.
   */
  verify(receipt: ActionReceipt): Promise<VerificationReport>;

  /**
   * Project a receipt into a audience-specific view (public, agent, owner, admin).
   */
  project(receiptId: string, audience: Audience): Promise<AudienceReceipt>;

  /**
   * Inspect the current state of a request without producing a receipt.
   */
  getRequestState(requestHash: Hash): Promise<RequestState>;
}

// ---------------------------------------------------------------------------
// Input / output types for the main methods
// ---------------------------------------------------------------------------

type EvaluateRequest = {
  capabilityRequest: CapabilityRequest;
  authorizationDecision?: AuthorizationDecision; // owner/operator override
  requesterContext: RequesterContext;
};

type RequesterContext = {
  callerId: string;             // principal of the caller
  callerKind: 'owner-ui' | 'agent-runtime' | 'admin-tool' | 'webhook-handler' | 'workflow-engine' | string;
  // open string allows future callers without interface churn
};

type EvaluateResult = {
  outcome: ActionOutcome;
  receipt: ActionReceipt;
  checkpoint: AuthorizationCheckpoint;
  nextActions: NextAction[];
  // no raw provider payloads, no secrets, no executable action outputs
};

type NextAction =
  | { kind: 'await-owner-decision'; ownerId: string; reason: string }
  | { kind: 'await-evidence'; provider: string; evidenceKind: string; reason: string }
  | { kind: 'mandate-revoked'; reason: string }
  | { kind: 'expired'; reason: string }
  | { kind: 'no-action'; reason: string };

type EvidenceIngestionRequest = {
  rawEvent: unknown;            // provider-specific payload (e.g. Stripe webhook body)
  sourceContext: RequesterContext;
  // adapters extract provider, eventType, amount, binding, etc.
};

type EvidenceIngestionResult =
  | { status: 'admitted'; evidence: ExternalEvidenceEvent }
  | { status: 'held'; reason: string; rawFingerprint: Hash }
  | { status: 'duplicate'; evidenceId: string }
  | { status: 'conflict'; evidenceId: string; conflictReason: string };

type DecisionResult = {
  checkpoint: AuthorizationCheckpoint;
  receipt: ActionReceipt | null; // refusal/expired immediately produces a receipt
  nextActions: NextAction[];
};

// helper types omitted for brevity: JsonSchemaRef, SignatureEnvelope,
// UnsignedReceipt, SignedReceipt, PublicReceiptProjection, OwnerReceiptProjection,
// AgentReceiptProjection, AdminReceiptProjection, EvidenceSummary, ReconstructionEntry,
// VerificationFinding, EvaluationContext, PolicyResult, CanonicalEvidence, AudienceReceiptFragment.

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

declare function createBusinessActionEvaluator(
  config: EvaluatorConfig
): BusinessActionEvaluator;
```

---

## 2. Concrete Usage Example

The same evaluator, used by four different callers without changing the interface.

```typescript
const evaluator = createBusinessActionEvaluator({
  evidenceAdapters: [stripeAdapter, nemoGuardrailsAdapter, hermesAdapter, linkCliAdapter],
  policyRules: [mandateBoundsRule, ownerApprovalRule, spendCapRule, cardFreshnessRule],
  receiptSigner: aeReceiptSigner,
  projections: [publicProjection, agentProjection, ownerProjection, adminProjection],
});

// ---------------------------------------------------------------------------
// A. Owner UI — approve/refuse a proposed request and view the receipt
// ---------------------------------------------------------------------------

const ownerDecision: AuthorizationDecision = {
  checkpointId: 'chk_123',
  requestHash: 'reqh_abc',
  status: 'accepted',
  decidedBy: 'owner@example.com',
  policyHash: 'policy_v1',
  decidedAt: new Date().toISOString(),
  reason: 'endpoint provisioning approved under June mandate',
};

const ownerResult = await evaluator.evaluate({
  capabilityRequest: proposedRequest,
  authorizationDecision: ownerDecision,
  requesterContext: { callerId: 'owner@example.com', callerKind: 'owner-ui' },
});

const ownerReceipt = await evaluator.project(ownerResult.receipt.receiptId, 'owner');
// ownerReceipt includes full checkpoint reason, evidence refs, and redacted card.

// ---------------------------------------------------------------------------
// B. Agent runtime tool (Hermes) — propose a request and poll state
// ---------------------------------------------------------------------------

const agentResult = await evaluator.evaluate({
  capabilityRequest: {
    ...proposedRequest,
    cardId: 'card_paid_intake_endpoint',
    cardVersion: '2026-06-30-1',
    cardHash: 'cardh_xyz',
    mandateHash: 'mandh_abc',
    actionSlug: 'provision-paid-intake-endpoint',
    inputHash: 'inputh_qrs',
    requestedAmount: { amount: 10, currency: 'USD' },
    idempotencyKey: 'idem_001',
    correlationId: 'corr_hermes_run_42',
  },
  requesterContext: { callerId: 'hermes-runtime', callerKind: 'agent-runtime' },
});

// Hermes sees only non-sensitive hashes and what evidence/decision is awaited.
const agentState = await evaluator.getRequestState(proposedRequest.inputHash);
for (const next of agentState.nextActions) {
  if (next.kind === 'await-evidence' && next.provider === 'stripe') {
    // Hermes knows to ask the payment rail to create a Checkout Session,
    // but it does NOT interpret that as authority.
  }
}

// ---------------------------------------------------------------------------
// C. Admin audit — reconstruct and verify a historical receipt
// ---------------------------------------------------------------------------

const full = await evaluator.reconstruct('rcpt_789');
const report = await evaluator.verify(full.receipt);

// admin can follow the chain: card -> mandate -> request -> checkpoint -> evidence -> receipt
assert(report.status === 'valid');
assert(full.reconstructionStatus === 'complete');

// ---------------------------------------------------------------------------
// D. Future webhook handler — Stripe payment_intent.succeeded arrives
// ---------------------------------------------------------------------------

const stripeIngestion = await evaluator.ingestEvidence({
  rawEvent: stripeWebhookPayload, // { id: 'pi_123', object: 'payment_intent', ... }
  sourceContext: { callerId: 'stripe-webhook', callerKind: 'webhook-handler' },
});

if (stripeIngestion.status === 'admitted') {
  // Webhook handler does not greenlight anything; it only records evidence.
  // The agent or owner may re-evaluate later, reusing the same idempotency key,
  // and the evaluator will now see the admitted evidence.
  await evaluator.evaluate({
    capabilityRequest: proposedRequest,
    requesterContext: { callerId: 'hermes-runtime', callerKind: 'agent-runtime' },
  });
}

// All four callers share the same types and methods. The only difference is
// which method they call and what audience projection they request.
```

---

## 3. What This Design Hides Internally

The interface deliberately keeps the following inside the evaluator boundary:

1. **Signature generation and verification**
   `ReceiptSigner.sign` and `ReceiptSigner.verify` are pluggable, but the caller never sees private keys, key fingerprints beyond the opaque envelope, or canonical serialization.

2. **Policy/rule engine internals**
   `PolicyRule.evaluate` is an extension point, but the evaluator decides how rules compose, how precedence works, and how `policyHash` is computed. Policy arithmetic (e.g. spend cap + mandate expiry + owner approval) is hidden.

3. **Evidence normalization and binding validation**
   `EvidenceAdapter.canonicalize` turns a Stripe/NVIDIA/Hermes/Link payload into a canonical `ExternalEvidenceEvent`, but the caller never sees the provider-specific schema mapping. `validateBinding` enforces exact request/checkpoint/mandate binding without exposing the comparison logic.

4. **Time / expiry arithmetic**
   Mandate TTL, card staleness, and checkpoint expiry are computed internally. Callers only see `ActionOutcome` and `nextActions`.

5. **Receipt envelope serialization**
   The exact bytes that are signed, the `receiptHash` algorithm, and the `SignatureEnvelope` structure are internal. Callers pass receipts around as opaque values.

6. **Provider-specific mapping**
   How Hermes result artifacts, Stripe `PaymentIntent` objects, NVIDIA guardrail decisions, or Link CLI spend requests map to `ExternalEvidenceEvent` is encapsulated in adapters. The core evaluator is provider-agnostic.

7. **Idempotency ledger and replay detection**
   Same `idempotencyKey` replay returns the same receipt; same key with different body returns a conflict. The ledger is internal.

8. **Correlation tracking**
   `correlationId` ties events together, but the evaluator decides how to index and reconstruct chains.

9. **Redaction and projection logic**
   `ReceiptProjection` defines what each audience sees, but the evaluator enforces that raw prompts, customer identifiers, private business notes, raw Stripe payloads, and secrets never leave the boundary.

10. **Failure-to-receipt mapping**
    Refusal, proof-gap, clarification, and expired states all produce durable readbacks. The evaluator decides when a state becomes terminal and which `nextActions` are surfaced.

---

## 4. Trade-offs vs. Other Constraints

### Compared to a minimal interface

| Flexible design | Minimal design |
|---|---|
| Separate `ingestEvidence`, `submitDecision`, `evaluate`, `reconstruct`, `verify`, `project`, `getRequestState` | Likely only `evaluate` and `verify` |
| Pluggable `EvidenceAdapter`, `PolicyRule`, `ReceiptSigner`, `ReceiptProjection` | Hard-coded providers and one projection |
| `RequesterContext.callerKind` is open string | Caller kind is an enum or absent |
| `NextAction` tells caller what to await | Caller must infer from outcome |
| Supports async webhook evidence natively | Webhook must be shoe-horned into `evaluate` or handled outside |

**Cost:** More methods, more types, more documentation, and a slightly steeper learning curve for the first implementer.
**Benefit:** New rails (e.g. a future payment provider or safety model) and new callers (e.g. a workflow engine) do not require interface changes.

### Compared to a common-case interface

A common-case design might optimize for the owner-approval flow and hard-code the action-card + mandate + owner decision + Stripe payment path. This flexible interface trades that ergonomics for generality by:
- Making the action-card slugs and evidence expectations open (but still constrained by policy).
- Allowing the mandate to carry arbitrary `metadata` and the request to carry `requestedAmount` that some cards ignore.
- Supporting `callerKind` and `Audience` so the same receipt serves multiple surfaces.

**Cost:** Callers must supply more context (e.g. `requesterContext`, `callerKind`).
**Benefit:** The same module can be used for future actions beyond `provision-paid-intake-endpoint` without broadening the core types.

### Compared to an event-sourced interface

An event-sourced design would expose the event log as the primary interface and derive receipts from folds. This design keeps the log internal:
- `evaluate`, `ingestEvidence`, and `submitDecision` are the write commands.
- `reconstruct`, `verify`, and `project` are read models.
- The event store itself is not exposed.

**Cost:** Less transparency for auditors who want raw event streams; less purity for functional-programming consumers.
**Benefit:** Callers do not need to understand event-sourcing patterns; the evaluator can change its persistence model without breaking callers.

### Specific risks of this design

1. **Flexibility creep** — The open `callerKind` string and `metadata` fields could let callers smuggle authority or provider secrets. Mitigation: the evaluator validates and rejects anything that looks like a secret, raw credential, or client-supplied authority inside the policy rules.
2. **Indirection tax** — Every new rail requires writing an `EvidenceAdapter` and possibly a `PolicyRule`. Mitigation: the adapter interface is small (`canonicalize` + `validateBinding`), and common rules are reusable.
3. **Overgeneralization** — The design supports many slugs and evidence kinds, but Phase 6 intentionally locks only `provision-paid-intake-endpoint`. The interface does not force that lock; the policy layer does. This is a deliberate separation: the surface stays flexible while the deployment is narrow.

---

## 5. Why this does not violate the anti-constraints

- The evaluator **decides**; it does not book, pay, dispatch, or fulfill. External rails are evidence sources only.
- No wallet, credit system, marketplace settlement, x402, Connect, or payouts appear in the interface.
- Money only appears as an optional `Money` field on the mandate and request, bounded by policy, never as authority.
- No generic `executeAction` or broad action catalog is exposed. The action slug is a constrained field, and the card is the authority.
- Raw provider payloads, secrets, and prompts are never returned through any audience projection.
