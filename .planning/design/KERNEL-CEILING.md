# KERNEL-CEILING — what the kernel can truly become

Status: strategy authority for kernel design decisions. Does not change Wave 1–5 build order.
Derived from 4-agent ceiling wave (2026-07-13): `agent://ClearingLayer`, `agent://ProtocolField`, `agent://AgentFrontier`, `agent://PersonalAiEndgame`. All numeric claims below are sourced in those artifacts; labels OBSERVED/INFERRED/UNKNOWN preserved there.

Precedence: subordinate to WEDGE-LADDER on capability claims. This doc constrains **kernel schema shape**; it grants no new authority to any surface.

---

## 1. The ceiling, stated honestly

The kernel (K1–K12) is a domain-neutral answer to six questions no adopted protocol answers together for *arbitrary* business action:

1. Target admission/consent (K8)
2. Mandate scope + expiry + revocation, principal-bound (K2, K11)
3. Sign-what-you-see integrity (K12)
4. Duplicate-safe execution — same key → original result, conflicting digest → refuse (K1, §4.3b)
5. Evidence / replay / dispute, redaction-safe (K3, K10)
6. Temporal truth — expiry, aging, authoritative clocks (K4)

**Ceiling worldline:** the neutral **clearing envelope for delegated business actions** — the layer where an agent's proposed consequential action against any counterparty becomes a bounded, verifiable, replayable event. Composite analog: SWIFT message discipline + CA-style verification + DTCC-style records. NOT settlement, NOT payments, NOT the assistant, NOT the checkout.

**Position in the stack:** below assistants (ChatGPT/Gemini/Claude/Siri/Alexa/local agents = interchangeable principal interfaces), above transports and payment rails (MCP/A2A = transport; UCP = commerce schemas; AP2/ACP/x402/card networks = payment adapters; Web Bot Auth = caller attribution). AE governs admission + authority + evidence; it never reimplements those layers.

## 2. Probability bands (INFERRED, from ClearingLayer)

| Outcome by ~2035 | Band |
|---|---|
| Globally recognized multi-operator clearing protocol | 0.5–3% |
| Meaningful national/vertical clearing network (Australian, sector-specific, portable evidence contracts) | 8–20% |
| Kernel primitives valuable inside AE's own product, no external network | 25–45% |

Scenario weights (PersonalAiEndgame): platform-aggregated 30% (rail mostly commoditized), **heterogeneous-multipolar 50% (structural opportunity — most evidenced as of mid-2026)**, regulated-neutral 20% (certified-utility upside).

Decisive frontier UNKNOWN: whether consequential *non-payment* agent actions become frequent enough by 2031 for an independent horizontal layer vs platform-native audit logs.

## 3. Competitive window (ProtocolField)

- The gap claim survives only in its precise form: **"no widely adopted protocol currently combines these six controls for arbitrary consequential business actions."** "Nobody is building this" is FALSE:
  - **UCP + AP2** nearly closes the set for *commerce* (JCS-canonicalized signed checkout, mandates, receipts). Google/Shopify co-developed; AP2 donated to FIDO.
  - **DRP** (IETF individual draft): canonical JSON + action hashes, append-only receipt log with inclusion proofs, RFC3161 timestamps — closest conceptual overlap, no adoption.
  - **AIP** (IETF individual draft): identity/delegation/capability manifests, jti replay cache with stored-response retries.
  - **MCP/A2A**: transport with foundations + massive distribution; no consequential-action commit guarantee.
- **Window estimate:** 12–24 months to spec convergence; 24–48 months to cross-vendor deployment. Most likely to close first: Google (UCP+AP2) for commerce; Microsoft Entra + MCP/A2A extensions for enterprise arbitrary action.
- **Adopt, never compete:** Web Bot Auth (attribution), MCP/A2A (transport), UCP (commerce capability schemas), AP2 (portable commerce mandates), ACP/x402/card protocols (payment adapters), OAuth/Entra-compatible tokens (enterprise identity). AE's layer = the **governance compiler**: take an action proposed over any of these, resolve admission, compile principal authority into an exact canonical digest, commit once, project replayable evidence.

## 4. Capability-side demand (AgentFrontier)

- Today's honest ceiling: agents operate bounded, reversible, instrumented workflows. OSWorld 2.0 best strict completion 20.6% on realistic long workflows; <7% of budget spent on verification. Delegation boundary in shipped products: per-action confirmation, single-use amount-capped credentials, merchant-of-record liability elsewhere (ACP), user-takeover for payment (Gemini).
- The gating metric for unattended action is shifting from pass@1 to **bounded expected loss** (probability × consequence × detectability × reversibility). Capability cannot answer *who authorized, what exactly, exactly-once, who bears loss* — those are counterparty problems, which is the kernel's domain.
- Rising capability increases rail demand **only if the rail is thin and transport-agnostic**: browser, API, MCP, voice, or human operator may execute; AE governs admission and evidence without requiring workflow migration.
- Shipped commerce already independently converged on the kernel's shape (scoped credential, expiry, idempotency, signed request, authoritative readback, receipt≠outcome) — evidence the primitives are correct, and warning the giants can build them.

## 5. Binding design consequences (take now, cheap)

<!-- kernel-ceiling: C-1 --> **C-1 · Vertical-neutral kernel types.** K1–K12 schemas MUST NOT import local-services vocabulary. `suburb`, `tradeCategory`, business-page concepts live in the brief payload under versioned `responseSchemaRef` (K5), never in kernel envelopes, mandate tuples, receipt structure, or event vocabulary.

<!-- kernel-ceiling: C-2 --> **C-2 · K12 digest = future wire format.** Design canonical serialization as if third parties will independently implement verifiers: schema version inside hashed bytes (already specified), stable canonicalization (evaluate JCS RFC 8785 — UCP+AP2 already use it; interop > invention), verification requiring zero AE-runtime dependency. This is why K12 cannot be retrofitted.

<!-- kernel-ceiling: C-3 --> **C-3 · Admission generalizes to counterparty admission.** `R1TargetAdmitted` (C6) is one admission *proof class* (claimed-owner + verified destination). Schema must permit future classes — business-signed endpoint attestation, platform attestation, registry credential — without reshaping the predicate's consumers.

<!-- kernel-ceiling: C-4 --> **C-4 · Refusal + incident taxonomy is product, not plumbing.** A clearing layer sells allocable failure: caller authored intent / principal granted scope / verifier checked / adapter attempted delivery / business authored response / receipt proves none of the physical world. Typed refusals and deterministic replay are the trust product; keep them first-class.

<!-- kernel-ceiling: C-5 --> **C-5 · Neutrality economics constraint.** The paying party is whoever creates operational risk (calling platform, enterprise principal, relying party). Businesses never pay for routing rank, admission, or basic response rights. Refusals priced at/near cost. Any monetization that biases routing is a kill condition (see §6.3).

<!-- kernel-ceiling: C-6 --> **C-6 · J7 envelope is the first external spec.** `ConversationEnvelope` + `doesNotProve` should be written as an implementable contract (versioned, with conformance vectors), because in the ceiling worldline it is what other parties code against. Build order unchanged (Wave 5).

<!-- kernel-ceiling: C-7 --> **C-7 · Claim wording.** Public/strategy copy may say: "no widely adopted protocol currently combines these controls for arbitrary consequential business actions." It may NOT say "no protocol does this" or "SWIFT/TLS for agents" — the latter is unearned until counterparties demand receipts.

## 6. Kill conditions for the ceiling ambition

1. **No record-side pull.** After 1,000 admitted R1 sends: <5% of users/businesses reopen, export, share, or cite the record, AND <1% of sends create a dispute/exception that replay materially resolves → the ledger is ceremony; keep the kernel as internal product infrastructure, drop the network ambition.
2. **Platform enclosure wins.** Three independent agent/platform integration attempts, none accepting AE canonical digests/receipts without proprietary translation, or two dominant ecosystems shipping incompatible native mandates → continue as adapter/private network, not "the layer."
3. **Economics require compromised neutrality.** Mature cohorts cannot price per-cleared-action below the avoided operational loss, or >50% of gross profit depends on paid ranking / lead resale / take-rate incentives that bias routing → the clearing identity is dead regardless of revenue.

## 7. Relationship to the wedge (unchanged)

R1 local services is the **proof schedule, not the identity**. Protocols win by being load-bearing somewhere first (Stripe's seven lines before "GDP of the internet"). The wedge exercises every durable primitive at low consequence. Governance sequencing if the network materializes: Phase A startup-owned network → Phase B royalty-free open spec (canonical encoding, refusal codes, replay semantics, verifier tests) *before* major competitors depend on it → Phase C independent foundation, AE retains hosted verifier/evidence service/certification. Refusing Phase B caps AE at a private network; opening too early creates a standard nobody uses.
