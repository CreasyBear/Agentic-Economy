# Project research record: Demand-side tender market — open requests that supply bids into

**Owner:** Founder
**Status:** Active
**Maturity:** Hypothesis
**Question:** Should AE invert its primary market mechanism — from businesses displaying capabilities to customers posting open requests ("tenders") that businesses and agents bid into with work samples and firm prices — and if so, as what wedge, when, and under which existing authority?
**Decision affected:** None yet (would require a decision record re-scoping Phase 3 + a roadmap change; ROADMAP currently cuts "request market")
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

## Standing authority this idea collides with (OBSERVED)

- `ROADMAP.md` Phase 1 **Cut** list includes "request market"; STATE keeps request-market settlement out of P5; the bootstrap gate excludes request markets from early public shipment. **This record is exploration, not a decision; nothing here authorizes building.**
- Money-language kill-zone: no wallet/credits/custody/settlement design or copy; any award payment is P5's single provider-backed rail.
- Public-copy rules (AGENTS.md, office-hours jargon list): human surfaces would say *open request, offer, work sample, firm price* — never tender/bid/RFP/auction/protocol.

## Why the mechanism is architecturally native (OBSERVED against design artifacts)

A tender is a Customer Request with the visibility bit flipped. Every tender component maps to an existing AE primitive:

| Tender concept | Existing AE primitive |
|---|---|
| Tender notice / brief | Customer Request (compiled intent, typed clarification, material facts) |
| Bid | **Supplied candidate** — ADR-009 gates 1–3, the exact cluster the 2026-07-17 gate-coverage audit found orphaned (`.planning/audits/2026-07-17-adr009-010-gate-coverage-audit.md`) |
| Bid qualification | Gate 1: supplied-candidate qualification reusing current supply-evidence contracts |
| Quote inside a bid | Gate 2: supplied-candidate quote collection through existing preparation/disclosure/attempts |
| Bidder track-record claims | Gate 3: external commitment observation → attributable claims |
| Bid comparison | Comparison engine + `projectCustomerOptionSet` (ordering/coverage/commercialInfluence, `customer-option-set.ts:6-36`) |
| Award | Per-action authority binding (exact inputs, spend limit, expiry, material-change invalidation) — externally corroborated by AP2 mandates (S-049) |
| Delivery proof | Evidence/receipt/reconcile machinery incl. `unknown` outcomes |
| Standards precedent | OCDS/UBL/Peppol model exactly this decomposition; UBL Quotation's optional RFQ reference (cardinality 0..1, S-045) is an *unsolicited bid* in standard form |

**INFERRED:** the tender market is not a new lifecycle — it is the demand-side *productization of Phase 3* (supplied candidates + commitments + composition). Building Phase 3's evals as a tender flow would exercise ADR-009's three orphaned gates with real economic motive, instead of synthetic fixtures. It also supplies the multi-candidate action that Phase 2 validation (VAL-202) says parity dimension 3 (suitability/comparison rules) needs.

## The load-bearing new insight (INFERRED)

Classic reverse auctions (Upwork/Freelancer/government tendering) fail for quality-differentiated work: winner's curse, race to the bottom, promise-based bids, evaluation burden. Near-zero marginal production cost inverts the mechanism:

> **When production is cheap, suppliers bid the work, not a promise.** A "make ads" tender returns actual creatives at firm prices; a "landing page" tender returns rendered pages. The customer compares artifacts, and AE's comparison engine compares structured deliverables.

This removes the three classic failure modes (information asymmetry, winner's curse, evaluation cost) — **and creates the mirror risk: bidding is also free for spammers.** The defensible mechanism is therefore the *costly signal*, which is AE's trust layer: qualification gates from admitted-supply evidence, capped offer slots, artifact-required bids (slop is self-evident when work must be shown), and — post-P5 only — bond-like commitments. The moat is bid *admission*, not bid *collection*.

**Anti-leak (INFERRED, native answer):** work samples leak value pre-award. Mitigation uses existing primitives: degraded/watermarked samples public, full artifact released on award through the receipt path.

## Office-hours output

- **One-sentence thesis:** AE opens your project to competing offers — you compare the actual work, not the sales pitch.
- **Enemy (condition, not company):** *paying people-prices for machine-work* — "the $8k quote for the $80 job."
- **Tagline candidates:** "Post the job. Compare real work." / "Three quotes without three phone calls — with the work attached."
- **Funnel frames:** TOFU "See what your project would cost — post it free"; MOFU "Real offers with the work attached, side by side"; BOFU "Pick one; pay only for what you keep"; retention "Your next project starts from your last one's record."
- **Narrowest wedge:** ONE tender class — **"ads for your business page"**, sold to already-listed AE businesses. Brief auto-drafted from page facts AE holds; N capped offers, each = actual creatives + firm price + firm-until date; pick one. No booking/dispatch/fulfilment ambiguity; deliverable verifiable by looking.
- **Cold start (INFERRED, inverted):** supply (agents) is infinitely elastic day one; scarce side is demand-with-budget. AE's registry businesses are the warm demand pool — hand-sell the first ~20 open requests to listed owners.

## Hypotheses (falsifiable, per records rules)

**H-1 (demand existence).** Listed-business owners prefer comparing finished work samples at firm prices over (a) a recommended provider or (c) fully delegated "just do it."
- Decision it could change: whether Phase 3 is productized as an open-request market vs backstage supplied-candidate machinery under the RoutePlan recommendation.
- Population: next 5-10 real AU listed-business owners (bootstrap-gate cohort).
- Comparison: forced choice (a) recommendation / (b) three finished drafts at firm prices / (c) done-for-you.
- Measurement: choice distribution + willingness to name a budget on the spot.
- Falsifier: if ≥60% choose (c), the tender is backstage machinery, not the product; if (a) dominates, the existing path stands.
- Evidence owner: Founder. Review by 2026-08-17.

**H-2 (spam economics).** Artifact-required + capped-slot + qualification-gated bidding keeps offer quality above a usable floor without human moderation.
- Decision: bid-admission design for any Phase 3 tender eval.
- Population: first N sandbox tenders with open agent bidding.
- Measurement: % of offers a blinded reviewer rates "would show a customer"; moderation minutes per tender.
- Falsifier: <50% usable offers or >15 min moderation/tender ⇒ admission mechanism insufficient as designed.
- Evidence owner: Engineering. Review by 2026-08-17.

**H-3 (mechanism fit).** Work-sample bidding produces better customer-chosen outcomes than promise bidding for software-cheap deliverable classes (ads, landing pages, comparison pages).
- Comparison: same brief run as artifact-bid vs promise-bid.
- Measurement: award rate, time-to-decision, post-award dispute/rework rate.
- Falsifier: no difference ⇒ the "software is cheap" inversion claim fails and classic reverse-auction risks apply in full.
- Evidence owner: Product. Review by 2026-08-17.

## UNKNOWNS

- Whether the demand side wants a *procurement process* at all, vs a result (H-1 is the gate).
- Legal posture of artifact-for-award exchanges (IP transfer point, AU consumer law on quote firmness) — needs its own research before any live tender.
- Pricing mechanics that avoid the money-language kill-zone pre-P5 (likely: free during eval; award fee via the P5 rail later).
- Interaction with neutrality: a tender ranks *offers*; commercial-influence disclosure rules must carry over unchanged.

## Recommendation (not a decision)

Do not open a new roadmap phase. Instead: (1) run H-1 with the next real owner cohort; (2) if H-1 favors (b), write the decision record that scopes **Phase 3's supplied-candidate evals as a single-class open-request flow** ("ads for your business page"), which simultaneously exercises ADR-009 gates 1/2/3, feeds Phase 2's multi-candidate parity gap, and stays inside the existing Request lifecycle; (3) keep all public shipment behind the existing gates and P5 money rules. If H-1 fails, the supplied-candidate machinery still gets built for Phase 3 — just without a tender-shaped front door.

**Generalization (2026-07-17):** the tender is one instance of a broader family. See `.planning/research/2026-07-17-market-forms-for-agentic-economy-literature-review.md` for the primary-source review of which market form fits which good (verifiability ladder, mechanism selector on capability-contract flags, non-monetary forms viable pre-P5). In that framework this record's wedge is a *reverse auction with scoring over attested work-sample artifacts* — the procurement literature's fix for price-only quality shading, made viable by near-zero production cost.
