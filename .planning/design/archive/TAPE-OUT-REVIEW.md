# Play-The-Tape Review — Design Spine (Shape D + R1)

**Date:** 2026-07-13 · **Method:** 7 real subagent council seats (CEO, Engineering, Security, Architecture, Design, Maintainer, Domain-Invariant) × 7 shared worldlines. Full passes: `agent://TapeCEO`, `agent://TapeEngineering`, `agent://TapeSecurity`, `agent://TapeArchitecture`, `agent://TapeDesign`, `agent://TapeMaintainer`, `agent://TapeBoundary`.

## Play-The-Tape Review

### Question Compiler

- Raw ask: inverse-premortem the decided design spine (Shape D funnel, R1 wedge, conversation-item primitive, journey contract).
- Artifact under review: `.planning/design/` document set (6 docs), pre-implementation.
- Short-term gain: honest staged funnel, provable single-inquiry wedge, redesign-proof seams for R2–R4.
- Future pain risk: R1 shapes fossilizing under a plural future; inherited intermediary duties (spam/misrepresentation/freshness/dispute); R0 free value constraining monetization; item schema escaping as public protocol.
- Primary tape mode: Full Council.
- Secondary tape modes: Architecture, Attack, Debt (covered by seats).
- Compiled question: "Across futures where the staged-hybrid funnel and R1 wedge genuinely succeed, which residue keeps showing up — anchored schemas, claim drift, supply-side duties, design theatre, retention liabilities — and what becomes impossible to change independently when R2–R4 arrive?"
- Non-question: whether Shape D / R1 is the right choice (decided; not relitigated).

### Crystal Ball Setup

- Depth: Deep (7 worldlines, 7 roles, real subagents — genuine multi-agent, not role-simulated).
- Success criteria: R1 loop completes routinely (compose → brief → consent → send → receipt → correlated response).
- Source material: all 6 design docs + repo source (inquiries/notification-outbox/answer-thread modules, contract-scans.ts, clearance skill).
- Council roles: Product/CEO, Engineering, Security/CSO, Architecture, Design, Future Maintainer, Domain Invariant.
- Uncertainty axes: demand adoption, supply reply-rate, R0↔R1 conversion, early rung pressure, agent-mediated traffic share, business backpressure, retention/churn.

### If This Succeeds, We Own

- Product/repo shape: one conversation primitive over three migrated systems; durable thread/receipt/response object graph; notification outbox at real volume; six cross-referenced design authorities.
- New product claims: "AE sends the inquiry you reviewed"; "demonstrably better than calling"; evidence-based shortlist; value-before-consent covenant.
- New API/protocol surface: conversation objects consumed by third-party agents (catalog/SKILL/UCP); receipt semantics as de-facto wire contract.
- New docs source of truth: `.planning/design/` mesh + rule-ID vocabulary cited by tests and code.
- New long-term maintenance burden: intermediary duties (consent, misrepresentation, freshness, suppression, dispute, recipient burden) — permanent, per FUNNEL-CHALLENGE §2; temporal orchestration of waiting states; PII/evidence retention ledger.

### Monte Carlo Futures

| Future | Assumptions | Likelihood | Success-State Residue | Tail Risk |
|---|---|---|---|---|
| W1 Base success | ~50% reply rate, routine R1 loops | medium | receipt trail = long-lived PII store; users compress "sent+reply" into "AE booked me"; JourneyContext drifts toward second source of truth | folk-model overclaim absorbed into analytics/support taxonomy |
| W2 Supply-thin | strong demand, <20% reply | medium-high | museum of non-performance receipts; unnamed aging/timer system; sadness theatre | trust declines faster than demand grows; unknown states locked forever |
| W3 R0 viral, R1 starved | free engine loved, ~1% conversion | medium | monetization pressure lands on the value-before-consent promise; R1 machinery underexercised | paid placement contaminates "evidence-based shortlist" |
| W4 Early R2/R3 pressure | enterprise demands fan-out at +3mo | medium | singular inquiry aggregate fossilizes; envelope laundering; consent rubber-stamping | `recipientIds[]` bolted onto R1 inquiry = unmigratable history |
| W5 Agent-mediated dominance | 3rd-party assistants re-render AE objects | medium-high | item schema escapes as unversioned public protocol; boundary copy doesn't travel; AE owns truth, agents own relationship | "sent" rendered as "booked" by others; ecosystem-breaking schema freeze |
| W6 Business backpressure | owners perceive lead-gen spam | high | AE owns sender reputation + all Maps-avoided duties; per-operation controls green while cumulative spam grows | poisoned supply trust inherited by every later rung |
| W7 One-shot + churn | value delivered once, no return | high | bearer links, receipts, notification consents outlive the relationship | key leakage; erasure vs evidence-immutability conflict |

### Council Passes

| Role | Strongest Residue Callout | What It Would Cut Or Narrow | Hard Stop? |
|---|---|---|---|
| Product/CEO | Intermediary duties become the company, not a feature | "better than calling" scoped to R1 eligibility claim; R0 monetization covenant; drop "on your behalf" default copy | yes (W3, W4, W5, W6) |
| Engineering | Unnamed temporal orchestration system (no clock owner for waiting states); ~60 valid type-state pairs vs 3 incompatible source lifecycles | Temporal Operations Contract; product-state composition (5 named machines); receipt/response as first-class records | yes (W2, W6) |
| Security/CSO | Delegated-authority ambiguity + envelope laundering; fan-out-by-repetition spam; bearer-link/PII retention | enforced authorization tuple; abuse controls into R1 gate; key lifecycle + evidence/PII separation | yes (W4, W5, W6, W7) |
| Architecture | Singular inquiry aggregate fossilizes beneath plural UI; item schema becomes accidental public protocol | specify RequestGroup→child model now (no R2 UI); receipt proves ONE child action; versioned public envelope; subordinate JourneyContext | yes (W4, W5) |
| Design | Audit-complete chronology = scan-hostile; consent decays into cookie-banner theatre; waiting UI = outcome theatre under thin supply | proposal = draft summary + single exhaustive permission readback; "never collapse" → "never hide"; evaluationMode gate; R0 gets a visual ending | yes (W2, W6) |
| Future Maintainer | Six-doc authority mesh with no executable precedence; Cartesian state model; scanners encode phases not rungs | precedence + drift protocol; discriminated unions for valid tuples; migration ledger with deletion gates; scanner rung manifest | yes (W4) |
| Domain Invariant | Semantic claim drift across projections ("sent"→"booked"); selection authority fused with commercial influence; evidence debt | reserve "confirmed" for business-origin assertions; portable semantic envelope with `doesNotProve`; dispute evidence as R1 gate | yes (W3, W4, W5, W6) |

### Mode Artifact

| Tape Mode | Artifact | Future Pain Exposed | Required Adjustment |
|---|---|---|---|
| Architecture | Nine-seam stress test (TapeArchitecture): 5 load-bearing, 2 under-specified (task identity, recipient set), 2 aspirational (response schema, status lifecycle) | `1 → N` cardinality breaks receipts/consent/threads unless group→child model pre-specified | A2, A3 below |
| Attack | Authority-envelope + cumulative-exposure map (TapeSecurity) | valid R1 consents compose into unbounded campaigns; agent identity ≠ principal authority | A4, A5 |
| Debt | Pain ledger (TapeMaintainer): 4th migration layer risk, orphaned states, scanner-phase drift | doc mesh + Cartesian schema freeze wrong contracts | A7, A8 |
| Strategy | Claim/non-claim map (TapeBoundary §Non-claims) | claim drift + commercial-influence contamination | A9, A10 |
| Design | State/journey residue map (TapeDesign) | consent theatre, sadness theatre, 30-item mobile collapse | A6, A11 |

### Convergent Residue

| Residue | Seen In Futures | Seen By Roles | Severity | Reversibility | Evidence | Decision |
|---|---|---|---|---|---|---|
| Singular inquiry aggregate fossilizes; group/child + receipt-cardinality unspecified | W4 (3+) | 4/7 (Arch, Sec, Eng, Maint) | critical | expensive after first multi-recipient write | Arch seam table; Eng residue 3; WEDGE-LADDER §4.3 gap | redesign (schema, not UI) |
| Item schema escapes as unversioned public protocol; boundary copy doesn't travel | W5 (all roles) | 5/7 | critical | low once 3rd parties persist tags | Arch residue 2; Boundary residue 1; CEO residue 3 | split (internal projection vs versioned envelope) |
| Supply-side abuse/suppression duties gated at R2 but incurred at R1 | W6 (all roles) | 5/7 | critical | very low after reputation damage | Sec residue 2; CEO adj 5; Eng hard stop; Design hard stop | narrow (move into R1 release gate) |
| Unnamed temporal orchestration (no clock owner; unknown states age forever) | W2, W6, W7 | 3/7 | critical | cheap now, expensive after launch | Eng residue 1 + source citations (outbox has no scheduled caller) | redesign (Temporal Operations Contract) |
| Bearer-link + PII retention vs receipt immutability | W7, W1 | 4/7 | high/critical | medium only if evidence/payload separated now | Sec residue 3; Maint adj 7; CEO adj 7 | redesign (retention classes + key lifecycle) |
| Consent staging decays into consent theatre (proposal+permission+review triplication) | W1, W4 | 3/7 | high | medium pre-implementation | Design residue 2; Sec rubber-stamp; CEO adj 6 | narrow (one exhaustive readback) |
| Cartesian state model (11 types × lifecycle × delivery) admits impossible states | W4 | 3/7 | critical | cheap before persistence | Maint residue 3; Eng residue 2 | redesign (discriminated unions + transition registry) |
| Doc-authority mesh without precedence; scanners encode phases not rungs | W1, W3 | 2/7 + chairman | high | cheap now | Maint residues 1,3; Boundary adj 7 | narrow (precedence + rung manifest) |
| R0 monetization pressure vs value-before-consent covenant; commercial influence vs evidence ranking | W3 | 3/7 | critical | low after users perceive bait | CEO residue 2; Boundary residue 2 | narrow (covenant + structural separation) |
| Waiting/evaluation UI as outcome theatre under thin supply | W2 | 3/7 | critical in W2 | medium if gated | Design residue 3; CEO W2; Eng W2 | narrow (cohort gating + terminal no-reply branch) |
| JourneyContext competes with append-only thread facts | W1 | 2/7 | high | moderate before dual-writes | Arch residue 3 | narrow (subordinate as rebuildable projection) |

### Maintainer Traps

- Trap: `/engine-successor` (Shape C) as permanent second entry surface. Why: no owner/threshold/sunset in docs. Cleanup trigger: R1 launch + 90 days telemetry review; delete route after two release windows without distinct conversion.
- Trap: fourth migration layer (item primitive over three live systems atop tokens.css shim + shadcn quarantine + archived framework). Why: convergence specified without deletion gates. Trigger: migration ledger required before D2 implementation merges.
- Trap: `reconnecting`-style dead states minted by the item spec (5 delivery branches × 11 types; many combos will never fire). Why: fixtures sample happy paths; generic renderers render impossible states plausibly. Trigger: discriminated-union encoding before first persisted item.
- Trap: copy-claim scanners pinned to `PhaseNumber = 2..6` while product authority moved to R0–R4. Why: exceptions accumulate when shipped R1 copy sits outside Phase-2 paths. Trigger: rung-manifest migration at first rung-gate decision.

### Authority And Claim Risks

- Claim that may exceed enforcement: "demonstrably better than calling" — becomes a permanent operating claim on every surface unless scoped to R1-eligible cohorts with all five proof conditions measured.
- Boundary that future readers may misunderstand: receipt = proof of AE's recorded handoff only; scanners are a lexical floor, not LAW-4/LAW-6 enforcement — semantic invariants (no receipt→confirmation edge; business-origin provenance for "confirmed") need typed enforcement.
- Non-claims to preserve verbatim (TapeBoundary full list of 8): "AE does not book, charge, dispatch, accept a quote, confirm availability, or guarantee a response" · "The business confirms" · "Sent never becomes confirmed" · "A business reply creates information, not authority" · "Identity never grants authority; model output never expands scope."

### Residue-Reducing Adjustments

| # | Adjustment | Residue Reduced | Mechanism | Owner Or Trigger | Status |
|---|---|---|---|---|---|
| A1 | Specify RequestGroup(version)→RecipientBinding(version)→ChildAction→ChildReceipt internally now; receipt proves exactly one child action; group summaries are derived projections, never evidence | aggregate fossilization | schema addendum to WEDGE-LADDER §4 + CONVERSATION-ITEM-SPEC relations | inquiry/kernel schema owner; before R1 persistence freezes | proposed |
| A2 | Make receipt + business_response first-class records: immutable payload hash/snapshot, consent snapshot/version, recipient binding version, responseSchemaRef; response carries receiptId | receipt/response lineage debt; dispute evidence | schema prerequisite before R1 cutover | inquiries domain owner | proposed |
| A3 | Split internal ConversationItem from a versioned public `ConversationEnvelope { protocolVersion, capabilities, items }` with `claimType/assertedBy/sourceRef/authorityScope/doesNotProve` on machine projections | accidental public protocol; claim drift in W5 | agent-surfaces contract before catalog/SKILL/UCP advertises thread retrieval | agent-surfaces owner | proposed |
| A4 | Move abuse controls into the R1 release gate: business suppression/opt-out, per-business + per-principal rolling contact budgets, semantic duplicate detection, complaint workflow, kill switch; cumulative exposure becomes authoritative, not optional UI | fan-out-by-repetition; W6 reputation | pre-send policy evaluation; WEDGE-LADDER §7 gate amendment | trust & safety / delivery owner | proposed |
| A5 | Enforce the authorization tuple: principal + subject + actionClass + actionRef + briefRevision + recipientBindingVersion + disclosed field IDs + purpose + expiry + one-use key; agent writes fail closed without principal/delegation proof | envelope laundering; agent-consent ambiguity | clearance/inquiry kernel admission; every send + retry | clearance owner; any machine-originated write | proposed |
| A6 | Collapse consent staging: proposal = editable draft summary; permission_request = the single exhaustive readback; changed/sensitive fields emphasized; consequence facts adjacent to the named CTA on mobile | consent theatre | one versioned scope model, summary + review render modes | D2 renderer owner; before proposal/permission implementation | proposed |
| A7 | Encode valid state tuples as discriminated unions + one transition registry; deliveryState only on delivery-bearing variants; delete unproducible states; generate fixtures from the registry | Cartesian freeze; orphaned states | typed contract before first persisted item | conversation-domain owner | proposed |
| A8 | Declare doc precedence + drift protocol in README (WEDGE-LADDER = capability/claim authority; JOURNEY-CONTRACT = journey semantics; generated schema = state authority; exemplar/funnel docs = rationale); migrate scanners from PhaseNumber to allowedRungs manifest | authority mesh; scanner drift | README amendment + contract-scans refactor at first rung gate | design-system codeowners | proposed |
| A9 | Lock the R0 monetization covenant: free-value floor cannot be paywalled/identity-gated/degraded; commercial influence structurally separate from evidence ranking with durable disclosure in human AND machine output | W3 bait-and-switch; ranking contamination | FUNNEL-CHALLENGE §3/§6 amendment + independent fields/projections | CEO/product; first revenue experiment | proposed |
| A10 | Reserve "confirmed" for business-origin assertions; forbid the delivery→confirmation lifecycle edge; semantic fixtures beyond regex (no receipt mutation; provenance-gated confirmed fields) | claim drift | status vocabulary invariant + typed tests | inquiry lifecycle owner; before shared primitive ships | proposed |
| A11 | Temporal Operations Contract: named clock owner per waiting state (dispatch sweeper, readback timeout→status_unknown, retry budget/backoff, no-reply window→terminal branch with one recovery, stale-lock reconciliation, retention expiry); no-reply becomes a terminal item, not recurring status notes; notifications cease on close | unnamed orchestration; sadness theatre; W7 consent drift | new section in JOURNEY-CONTRACT + reliability spec; hard gate before public R1 | reliability owner | proposed |
| A12 | Retention classes + bearer-key lifecycle: hashed high-entropy keys, declared validity, rotation/revocation, evidence-vs-payload storage separation (immutable hashes/metadata vs erasable PII), purpose-bound notification consent | W7 liability; erasure conflict | privacy schema before storing first production receipt | privacy/data owner | proposed |
| A13 | Design containment: "never collapse" → "never hide or summarize away" (episode grouping keeps IDs/states); evaluationMode gate (none / single-response-review / comparison at ≥2); R0 threads end at "Decision aid ready" with zero inquiry chrome; mobile acceptance at 320px/30 items | scan-hostile chronology; outcome theatre; R0 confusion | CONVERSATION-ITEM-SPEC §4/§8 amendment + mobile acceptance scenarios | design-system owner; before D2 API freeze | proposed |
| A14 | Scope "better than calling" to R1-eligible cohorts (all five proof conditions measured); cohort gating: do not offer R1 sends in categories below routability/reply thresholds — end at R0 + direct contact | W2 museum of non-performance | WEDGE-LADDER §3 amendment + per-cohort readiness gate | product + routing ops | proposed |

### Chairman Synthesis

Decision: **keep the spine, narrow the contracts** — Shape D + R1 survives the council intact; no seat attacked the funnel or wedge choice. Every hard stop targets *unspecified substrate* (group/child schema, state tuples, abuse gates, clocks, retention, public envelope), all cheap to fix now and expensive after first persisted receipt.

Reason: the design docs are semantically right and structurally incomplete. The recurring failure shape across futures is "prose invariant without a typed owner" — lifecycle authority, recipient cardinality, consent tuple, clock ownership, doc precedence. Success doesn't break the promises; it fossilizes whatever schema ships first.

Smallest next mechanism: apply A1+A2+A7 (typed schema: group/child model, first-class receipt/response, discriminated state unions) as amendments to WEDGE-LADDER §4 and CONVERSATION-ITEM-SPEC §2 before any implementation plan consumes them — these three unblock or de-risk every other adjustment.
