# First-reliance probe: who accepts an agent's action because of an AE instrument?

**Status:** Probe design — approved question, unexecuted
**Decision affected:** Whether "registrar of standing" is AE's category bet; reframes the R-024 wedge sequence
**Evidence cutoff:** 2026-07-22 (design only; no field evidence exists)

## The question this probe answers

> Who is the first counterparty that will accept an agent's consequential action — one they would otherwise refuse — because an AE mandate and receipt are attached?

An institution exists at the moment of **third-party reliance**: not when a mandate is granted (principal ↔ AE), not when an answer is sold (a transaction), but when a party on the other side changes its acceptance decision because of the instrument. This is the category's first precedent and it is testable with one business, one agent, one action.

## Definition of the reliance event

A business **commits scarce or irreversible capacity** — holds a slot, issues a firm quote, dispatches, opens an account — to a non-human counterparty it cannot phone-vet, because the AE instrument substitutes for the vetting it would otherwise demand.

The refusal this targets is real and observable today: businesses ignore anonymous web leads, demand a phone call before committing calendar time, and require deposits from unknown parties. AE's existing qualified-inquiry product is shaped by exactly this refusal; the probe tests whether an instrument can convert one inquiry into an accepted commitment.

## Counterparty class ranking

| Class | Reliance event | Access speed | Refusal base rate today | Verdict |
|---|---|---|---|---|
| Local service business (trades with scheduling/no-show cost) | Holds a slot or issues a firm quote to an agent without phone-vetting the human | Days (Perth network, existing AE supply relationships) | High and documented (ignored web leads, call-to-confirm norms) | **First probe** |
| Business as seller of goods w/ credit terms | Extends terms / accepts PO from an agent | Weeks | High | Second wave |
| Platform/provider | Whitelists AE-attributed agents where bots are blocked | Months (policy process) | Total | Later; needs precedents to cite |
| Insurer | Underwrites agent actions against AE receipts | Quarters (needs loss history that does not exist) | Total | End-state; the probe *generates* the loss-history seed |

## The minimum instrument (hypothesis, decomposed for testing)

1. **Principal attestation** — a real, identified human principal granted this mandate (identity ≠ authority; both shown).
2. **Readable mandate scope** — what the agent may commit to: job class, time window, spend ceiling. Rendered in customer language, not protocol vocabulary.
3. **Commitment backing (the bond)** — a deposit actually reserved, or a no-show/withdrawal compensation promise. Hypothesis: this is the decisive element, because reliance follows liability, not information.
4. **Receipt + dispute path** — a durable record both sides hold; a named recourse if the commitment is broken.

## Three-arm design (the arms exist to decompose the instrument)

Same genuine job, same trade, matched businesses, requests placed by an agent acting for a real principal with a real need (no deception; the agent, mandate, and deposit are real; operations may be founder-operated behind the interface and are labelled development activity internally):

- **Arm 1 — bare agent request:** competent request, no identity/mandate/bond attached.
- **Arm 2 — deposit only:** payment/deposit offered, no attestation, mandate, or receipt framework.
- **Arm 3 — full instrument:** attestation + mandate scope + bond + receipt/dispute path.

**Outcome measure per contact:** did the business commit capacity (hold/quote/dispatch) **without requiring a phone call with the human principal?** Secondary: time-to-commitment; conditions demanded; verbatim reasons for refusal.

**Scale:** 10 businesses per arm in one trade (30 contacts), one metro area. Trade selection criteria: real no-show/lead-quality pain, scarce scheduling capacity, low regulatory load, reachable through existing relationships. Candidates meeting criteria (to be confirmed against the field-selection protocol): locksmiths, appliance repair, equipment/skip hire, mobile mechanics.

## Pre-committed readings

| Result pattern | Reading | Consequence |
|---|---|---|
| Arm 3 ≫ Arm 1, Arm 3 > Arm 2 | The instrument itself moves acceptance — standing is real and priceable | Category bet confirmed at this counterparty; instrument becomes the product spec; repeat in a second trade for transfer evidence |
| Arm 2 ≈ Arm 3 | Reliance collapses to the money — mandate/receipt add nothing the deposit doesn't | Sobering and decisive: AE's near-term value at this counterparty is escrow/bond, not attestation; rerun at a counterparty where money can't substitute (credit terms, dispatch, account opening) before abandoning the bet |
| Arm 1 ≈ Arm 3 (businesses accept bare agent requests) | No refusal exists — the scarcity is imagined at this counterparty | Category timing wrong here; move up the ranking table (platforms/insurers are still total-refusal counterparties) |
| All arms refused | Standing has a higher price than this instrument pays | Ask each refuser what would change acceptance (deposit size, insurance, known brand, track record); the answers price the institution |
| Businesses accept but only after phone-vetting the human | Partial: instrument reduces friction but doesn't substitute for vetting | Measure the delta; iterate instrument elements before re-running |

**Thresholds (falsification bar, stated before contact):** the probe supports the bet only if ≥4/10 Arm-3 businesses commit without phone-vetting AND Arm 3 exceeds Arm 2 by ≥2 acceptances. Below that, the relevant fallback row above governs — no post-hoc rescue narratives.

## Governance and claim ceiling

- Real jobs, real principal, real reserved funds; internal labelling as development activity; no public claim of booking capability arises from any outcome (PRODUCT.md current-evidence boundary holds).
- Outreach conduct follows the existing field-governance protocol (`2026-07-18-wa-field-study-consent-privacy-recording-protocol.md`) where it applies to business contact; no recording without consent; refusals are data and are thanked, not worked.
- This probe proves at most: N businesses in one trade in one city changed one acceptance decision. It does not prove supply quality, customer value, production safety, insurability, or that any other counterparty class will rely. Each acceptance is one precedent; the category is accreted, not declared.

## Relationship to prior records

- Reframes [R-024 synthesis](./2026-07-22-latent-capacity-synthesis.md): the R-024 Step 0–3 loop tests *who pays* (demand for formed capacity); this probe tests *who relies* (acceptance of agent authority). Reliance is upstream: if no counterparty accepts agent actions, formed capacity has no agent buyers with standing. The two loops can run in parallel; they share the receipt/mandate instrument.
- Grounds the category definition (registrar of standing) argued from `PRODUCT.md` §Execution contract and the Delphi "agentic compliance" thesis (delphiventures.io/writings/the-decade-ahead): consequential, legal, insured action enabled by license, bond, or insurance. Arm 2 vs Arm 3 directly tests Delphi's "bond or insurance" conjecture against the attestation conjecture.

## Open design decisions before contact (founder-owned)

1. Trade selection (against the field-selection protocol's incumbent/freshness criteria).
2. Bond mechanics: deposit held by AE vs direct prepayment vs compensation promise — and the AU legal wrapper for whichever is chosen (the legal record's ACL/recourse constraints apply to the promise wording).
3. Whether the principal is the founder (fastest, weakest generality) or 2–3 consenting participants with genuine jobs (slower, stronger).
