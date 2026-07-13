<!-- Persisted from session agent artifact `agent://ClearingLayer` on 2026-07-13.
     Evidence labels OBSERVED/INFERRED/UNKNOWN preserved from source.
     Owner: Founder. Next review: 2026-08-13. Superseded-by: (none). -->

# Worldline assessment — AE as the clearing layer for agent-mediated business action

## Verdict

- **[OBSERVED]** AE’s designed kernel is an **authorization-and-evidence clearing kernel**, not financial settlement: K1–K12 cover task admission, principal-bound mandates, evidence lineage, clocks, response semantics, capability admission, access grants, asserted events, canonical digests, and delegation verification (`.planning/design/JOURNEYS-TO-BUILD.md:74-93`). WEDGE §4.3b expressly excludes distributed consensus, tokens, and money movement (`.planning/design/WEDGE-LADDER.md:98-112`).
- **[INFERRED]** The credible 10-star ceiling is therefore: **the neutral trust/control plane that converts an agent’s proposed business action into a bounded, verifiable, replayable event**. Payments, booking, messaging, identity, and fulfilment systems remain execution/oracle adapters.
- **[INFERRED]** “Visa/SWIFT for agents” is useful only for the network dynamic; “settlement layer” is inaccurate. The closer composite is **SWIFT message discipline + CA-style verification + DTCC-style records**, without AE taking payment or outcome liability.

## 1. Why durable clearing layers win

### Mechanic 1 — one accepted network record and rulebook

- **[OBSERVED]** Visa’s predecessor was reorganized by participating bankers after BankAmericard suffered fraud and bad debt; Visa then digitized authorization, clearing, and settlement through VisaNet in 1973 ([Visa history](https://corporate.visa.com/en/sites/visa-perspectives/company-news/dee-hock-in-memoriam.html)).
- **[OBSERVED]** SWIFT is a financial-industry cooperative with shareholding/governance tied to its users ([SWIFT governance](https://www.swift.com/about-us/organisation-governance), [shareholding](https://www.swift.com/about-us/legal/swift-shareholding)). DTCC calls itself post-trade market infrastructure and reported a one-day NSCC peak of **545 million transactions** and **$5.55 trillion** in April 2025 ([DTCC](https://www.dtcc.com/news/2025/april/23/dtcc-processes-record-volumes-across-services-amid-market-volatility)).
- **[INFERRED]** Their defensibility is not merely transport. Participants agree that the network’s identifiers, message states, timestamps, exceptions, and records are the operational reference when bilateral accounts disagree.
- **AE implication [INFERRED]:** the scarce asset is a widely accepted **cleared-action record**: exact digest, verified authority chain, commit-time preconditions, nonce result, delivery evidence, response provenance, and replay output.

### Mechanic 2 — explicit liability boundaries and exception handling

- **[OBSERVED]** AE already separates receipt from outcome: a receipt proves admission/dispatch evidence, while the business remains the real-world oracle (`.planning/design/WEDGE-LADDER.md:108-112`; `PRODUCT.md:44-46,103-104`).
- **[OBSERVED]** Public TLS trust similarly depends on rule-bound verification rather than a CA guaranteeing website conduct: CA/Browser Forum requirements define what CAs must verify for browser trust ([CA/B Forum](https://cabforum.org/working-groups/server/baseline-requirements/about/)).
- **[INFERRED]** A clearing layer wins when it makes failures allocable: caller authored intent; principal granted scope; verifier checked signatures/delegation; adapter attempted delivery; business authored response; neither receipt nor signature proves fulfilment.
- **AE implication [INFERRED]:** publish a refusal/incident taxonomy and deterministic replay contract before selling “trust.” Liability should attach to failures of AE’s checks or records, not business performance.

### Mechanic 3 — credible neutrality plus sustainable economics

- **[OBSERVED]** Neutral infrastructure has multiple viable ownership models: Visa began as a bank-led association; SWIFT remains a cooperative; Stripe remains private infrastructure and reports businesses generated **$1.9 trillion in 2025** ([Stripe 2025](https://stripe.com/annual-updates/2025)); Let’s Encrypt is a nonprofit CA serving **762 million websites** at end-2025, funded by donations/sponsors ([ISRG/Let’s Encrypt](https://letsencrypt.org/2025/12/29/eoy-letter-2025.html)); DNS root operation is institutionally distributed ([ICANN](https://www.icann.org/root-server-system-en)).
- **[OBSERVED]** “Fee per cleared event” is **not universal**: commercial transaction networks meter usage, while DNS and Let’s Encrypt rely on registrant fees, membership, sponsorship, or public-interest funding.
- **[INFERRED]** The common mechanic is not one fee model but **non-discriminatory rules whose economics do not corrupt routing**. If recipients pay for placement or admission, AE ceases to be neutral.

## 2. Ten-star worldline, 2031–2035

### Operating model

- **[INFERRED] Who verifies:** accredited clearing operators run conformant AE verifiers. They validate canonical bytes/digest, principal or delegation proof, mandate scope/expiry, target binding revision, nonce uniqueness, and commit-time preconditions. Independent conformance labs certify implementations; participants can recompute receipts and projections from disclosed ledger events.
- **[INFERRED] Who pays:** the party creating operational risk pays—normally the calling-agent platform, enterprise principal, workflow vendor, insurer, or regulated relying party. Businesses may pay for endpoint/adaptor operations, but **never for routing rank or basic response rights**. Consumer confirmation and dispute export remain free.
- **[INFERRED] Unit:** one fee for an **admitted consequential action**, plus storage/export/assurance tiers; refusals are free or near-cost so operators are not rewarded for unsafe admission. This is usage infrastructure, not a take-rate on external commerce.
- **[INFERRED] 2031–2035 scale target:** **0.1–1.0 billion cleared actions/year** across service inquiries, bookings, procurement requests, account changes, claims, and regulated submissions. This is a scenario target—not a forecast—and requires several major agent platforms plus thousands of provider systems.
- **[INFERRED] Value proposition:** fewer unauthorized actions, duplicate sends, irreconcilable “the agent changed it” disputes, and bespoke audit integrations; not better real-world fulfilment.

### Governance and ownership

- **[INFERRED] Phase A, startup-owned:** AE owns hosted network, schema evolution, conformance suite, and commercial operations while product-market fit is narrow. This is the Stripe precedent: private ownership is viable while customers buy execution quality and can switch providers.
- **[INFERRED] Phase B, open specification:** before multiple major agent/platform competitors depend on it, canonical encoding, envelope, refusal codes, replay semantics, verifier tests, and cryptographic agility must become royalty-free and implementable without AE.
- **[INFERRED] Phase C, shared governance:** place protocol evolution under an independent foundation/standards body with balanced seats for agent platforms, businesses/provider software, principal/consumer advocates, security researchers, insurers/regulators, and competing operators. AE retains a commercial hosted verifier, evidence service, certification tooling, and premium operations.
- **[INFERRED] Fork in the road:** a startup can own **the leading network and implementation**; it is unlikely to retain unilateral ownership of a universal constitutional layer. Refusing shared governance caps AE at a valuable private network. Opening too early creates a standard nobody uses.
- **[OBSERVED] Competitive urgency:** Google’s 2025 AP2 already defines cryptographically signed mandates for agent payments ([Google AP2](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)); Stripe/OpenAI’s ACP exposes agentic checkout ([Stripe ACP](https://stripe.com/newsroom/news/stripe-openai-instant-checkout)). **[INFERRED]** AE must interoperate and clear non-payment actions, not pretend the field is empty or rebuild payment rails.

## 3. Causal chain: R1 local service → horizontal clearing layer

1. **Prove one governed send. [SUPPORTED-DESIGN]** R1 admits one target, binds exact brief revision and consent, executes once, and records receipt≠outcome. K1/K2 and the §4.3 tuple exist in contract; K12 canonical serialization is explicitly new and must precede persisted receipts (`JOURNEYS-TO-BUILD.md:80-82,90`).
2. **Make disputes replayable. [PARTIAL]** Land append-only events, immutable payload/consent snapshots, selective-disclosure projections, and same-key/same-result semantics. K3 export projection and K12 are still new; direct projection writes are prohibited (`WEDGE-LADDER.md:104-112`).
3. **Close the local-services loop. [PARTIAL]** Add owned clocks, terminalization, business responses, customer-asserted outcomes, and scoped access. K4 requires a scheduler the repo says does not exist; K9/K10 are partial/new (`JOURNEYS-TO-BUILD.md:83,88-89`).
4. **Earn bilateral acceptance. [STARTUP-OWNED]** Businesses use the record to answer “what was requested?” and callers use it to prove “what was authorized/sent.” Earliest moat is repeated dispute resolution, not volume.
5. **Standardize heterogeneous replies. [PARTIAL]** K5/K6 preserve provenance, null semantics, canonical field identity, and structural diffs; K7 derives honest response posture from events (`JOURNEYS-TO-BUILD.md:84-86`). This turns records into routing evidence without adjudicating quality.
6. **Expose machine parity. [SUPPORTED-DESIGN]** K11 verifies third-party delegation; public envelopes state `doesNotProve`. Human and machine surfaces must describe the same lifecycle (`PRODUCT.md:60-69,105`).
7. **Expand by adjacent action class. [STARTUP-OWNED]** Booking request, quote acceptance, claims intake, procurement, and account changes each add an adapter plus domain preconditions—never domain semantics inside the kernel.
8. **Become a multi-operator protocol. [OPEN-PROTOCOL FORK]** Freeze portable canonical bytes, event vocabulary, verifier behavior, replay vectors, and conformance tests. Allow competing operators and cross-operator receipt verification.
9. **Obtain institutional reliance. [GOVERNANCE FORK]** Insurers, enterprise risk teams, regulators, and major agent platforms cite the rulebook and accept replay artifacts. At this point independent governance becomes a prerequisite, not branding.
10. **Clear horizontally. [WORLDLINE]** Agents route consequential business intents through any conformant operator because counterparties require a cleared-action receipt, just as network participation becomes the default rather than a feature.

## 4. Kill conditions and earliest metrics

1. **No record-side pull.** Kill horizontal-clearing investment if, after **1,000 admitted R1 sends [INFERRED threshold]**, fewer than **5% [INFERRED]** of users/businesses reopen, export, share, or cite the record, and fewer than **1% [INFERRED]** of sends create a dispute/exception that replay materially resolves. This means the ledger is ceremony, not infrastructure.
2. **Governance cannot overcome platform enclosure.** Kill universal-standard ambition if, after **three independent agent/platform integration attempts [INFERRED]**, none will accept AE canonical digests/receipts without proprietary translation, or two dominant ecosystems require incompatible native mandates. Continue as an adapter/private network, not “the layer.”
3. **Economics require compromised neutrality.** Kill per-cleared-event network economics if mature cohorts cannot cover verification, support, evidence retention, and incident liability at a price below the avoided operational loss, or if more than **50% of gross profit [INFERRED threshold]** depends on paid ranking, lead resale, or take-rate incentives that bias routing.

## 5. Probability band

- **[INFERRED] 0.5%–3%** that AE becomes a globally recognized, multi-operator default clearing protocol for consequential agent→business actions by 2035.
- **[INFERRED] 8%–20%** that AE becomes meaningful private/vertical infrastructure—an Australian or sector-specific clearing network with portable evidence contracts—without becoming the universal standard.
- **[INFERRED] 25%–45%** that the kernel primitives become valuable inside AE’s own product even if no external protocol network emerges.
- **What raises the top band [INFERRED]:** demonstrable replay-resolved disputes; counterparties demanding receipts; cryptographic/verifier interoperability; major agent and provider-platform integrations; a clean liability rulebook; credible shared governance introduced after usage but before capture fears harden.
- **What lowers it [INFERRED]:** low consequential-action frequency; users treating receipts as clutter; platforms internalizing mandates and logs; payment protocols expanding into general authorization; unverifiable physical outcomes overwhelming record value; AE monetization depending on biased routing.
- **[UNKNOWN]** Whether consequential non-payment agent actions become frequent enough by 2031–2035 for an independent horizontal layer, rather than platform-native audit logs, is the decisive frontier uncertainty. No current evidence establishes that demand.