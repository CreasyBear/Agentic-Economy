# The callable-business onboarding wedge

**Status:** Direction adopted for exploration — founder-confirmed 2026-07-22
**Decision affected:** AE's supply-acquisition wedge and the first paid supply-side product
**Evidence cutoff:** 2026-07-22

## The signal

Monid × akta are serially unbundling packaged data incumbents into per-request agent services ("killed PitchBook" 2026-07-07 at $0.125/request vs $25k/seat; "killed Crunchbase" 2026-07-22 at $0.125/request vs $2,400/yr; plus phone-calling and 3D services on the same rails inside the same month). No transaction volumes are disclosed — this is an offer pattern, not proven demand (R-024 demand record stands). The signal is the **playbook**: usage-priced, agent-callable services are becoming how capability is sold, and the unbundling run only works on businesses that already exist as APIs.

## The wedge

> Businesses are beginning to offer usage-based services via an endpoint to agents. Most businesses cannot do that. AE provides that capability — and providing it onboards the business into AE.

Three parts, in order of what they change:

1. **The product a business buys first:** "your business, callable" — one thing it already knows or can determine, formed into a bounded, priced, agent-callable service. Not software it operates; a revenue line AE stands up for it.
2. **The mechanism:** the existing registration seam, unchanged. `PRODUCT.md`: read-only, advisory, communicative, and consequential operations use the same registration seam; supply may expose an action through its own endpoint, an onboarded adapter, or an **AE-hosted implementation**. The callable-business product = paid advisory/answer action classes (`answer`, `check`, `assessment`) on the same action plane as `booking_request`, with the same receipts, evidence classes, invocation/attempt model, and claim ceilings. No new control plane.
3. **The funnel:** onboarding inverts. Today's supply acquisition asks a business to claim a page and wait for demand. This wedge opens with "start earning from what you already know" — a materially easier sell than "buy an AI receptionist" because it monetizes an owned asset instead of selling a tool. Once the business is admitted, bound, credentialed, and earning through one advisory action, every other AE capability — more actions, consequential actions (quotes, bookings, dispatch), discovery, mandate-gated autonomy — is expansion on an account that already exists and already gets paid.

## Why AE and not the rails

Monid-class aggregators require a finished API; their intake cannot onboard an unpackaged business. AE's registration seam + adapter + hosted-implementation model is intake for exactly that. Division of the stack: **AE forms and registers (owns the business relationship, the contract, the receipts, the trust); rails distribute (AE-formed actions can list on Monid-class channels at their 0–3% take).** The competitive clock: an aggregator adding a "bring your dataset" formation service is their obvious adjacent move; the defensible difference is AE's admission/evidence/accountability spine and local business relationships, which a metering layer does not have.

## Design rules carried in from the evidence base (R-024)

1. **No endpoint without a named first caller.** Supply is never the bottleneck; repeat demand is. An onboarded endpoint with zero identified callers is the "large untested registry" failure the original thesis names. Every formation pairs the business with at least one concrete caller (an agent workflow, a developer, an adjacent business) before the action goes live.
2. **Clean classes first.** Non-personal, supplier-generated data/judgment with a short provenance chain (legal record matrix). No personal-data resale, no listed-company material information, nothing under a confidentiality regime.
3. **Bounded accountability, priced in.** Named intended use, provenance and freshness disclosure, correction/refund remedy, capped liability — ACL s 18 cannot be disclaimed away; the accountability wrapper is part of the price, not free.
4. **Formation is paid or paired.** Pure revenue-share for formation work is killed by the GTM evidence; charge a formation fee, or pair formation with a buyer-paid brief that guarantees the first caller.
5. **Success metric: the second paid invocation.** First calls are curiosity; the wedge is validated per-business by a repeat call, and validated as a wedge when formation steps reuse >70% across businesses (else it is bespoke consulting).

## The probe (replaces booking-drift framing of R-025 for this direction)

One business → one callable action → one paying caller → second invocation.

- **Supplier pool:** the businesses already asking "can we leverage our internal data?" (founder network — they are self-selected supply; no cold outreach needed for the probe).
- **Formation:** exposure sign-off (what's exposed, boundary, price, accountability tier — one page, founder-run), then AE-hosted implementation registered as an advisory action. The business does nothing technical.
- **Demand:** the named first caller is recruited before the action goes live; per-call price anchored against decision value, not against akta's $0.125 commodity tier (a backed, decision-grade answer clears 100–1000× commodity data — R-024 price ladder).
- **Receipts on every invocation** — this is also the seed of the loss-history/reliance record the category needs long-term.
- **Falsifiers:** (a) no business signs exposure despite already asking about it → the interest is talk; (b) first caller won't pay anything → demand unproven in reach; (c) no second invocation within 90 days → not decision-embedded; (d) second business's formation shares <70% of steps → consulting, not a wedge.

## Relationship to prior records

- **R-024 (latent-capacity evidence base):** this wedge is the R-024 "vertical answer products entered via services" verdict, made concrete as AE's supply funnel; all R-024 kills (marketplace-first, rails-first, contributory-entry, revenue-share formation) remain binding.
- **R-025 (first-reliance probe):** parked as a separate, still-valid question about counterparties accepting agent-initiated consequential actions. This record owns the supply-onboarding direction.
- **Original thesis (2026-07-22-agent-native-latent-capacity-thesis.md):** this is its "reveal latent supply → form products → make exchange repeatable" loop, bound to AE's registration seam and onboarding funnel.

## Claim ceiling

Founder-adopted direction and probe design; zero formed actions, zero paying callers, zero onboarded businesses exist under this wedge at the evidence cutoff. Public copy must not claim businesses can "sell their data on AE" until at least one formed action has cleared its second paid invocation on an intended surface.
