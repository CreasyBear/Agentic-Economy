# Project research record: Cold-start offer and market mechanisms — supply and demand onboarding

**Owner:** Founder
**Status:** Active
**Maturity:** Hypothesis (GTM mechanism design; no field evidence yet)
**Question:** Which offer/market mechanisms get AE across cold start on both sides, given the binding constraints: no money movement pre-P5 (no cash subsidies, credits, or discount ledgers), no-overclaim copy rules, and the 14-day bootstrap gate metrics as the definition of "across" (30–50 source-backed profiles, 10 recruited providers, 100 attributable sessions, ≥10 qualified inquiries, ≥5 voluntary corrections, zero boundary overclaim)?
**Decision affected:** None yet (would feed a GTM decision record; companion to `2026-07-17-demand-side-tender-market-exploration.md` and `2026-07-17-market-forms-for-agentic-economy-literature-review.md`)
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

## Strategic read (INFERRED)

- **Demand is the hard side** for AU local services: owners multi-home and accept anything free; a person with an urgent job is scarce and impatient. ~80% of incentive design goes to demand; supply incentives should be pull ("a job is here"), not push ("please list").
- **Incentive currencies available pre-P5:** labor, placement, evidence, access — never money. This is a feature: subsidized liquidity is mercenary liquidity; non-monetary incentives filter for aligned participants.
- **Two structural advantages classic marketplaces lacked:** (1) supply can be manufactured unilaterally (source-backed profiles are already AE's model); (2) demand can arrive through assistants (agent-readable pages + `inquiry.submit` as the only assistant-callable write in the category).
- **The engine is receipts:** every hand-carried demand event mints supply-side attributable evidence, which is simultaneously the ranking currency (x402-Bazaar pattern, S-059), the recruiting proof, and the assistant-channel credibility. Flywheel: manufacture supply → hand-carry demand → receipts → founding-rank advantage → publicized wins → supply pull → thicker demand.
- **Guardrail (OBSERVED from repo rules):** any placement given as an incentive is commercial influence and must be disclosed/invalidated exactly per the existing comparison rules. The incentive system runs *through* the trust kernel, never around it.

## Supply-side mechanisms

| ID | Mechanism | Offer | Cost | Gate metric moved |
|---|---|---|---|---|
| S1 | **Seed, don't solicit** | Build the 30–50 source-backed profiles unilaterally; claim CTA = "your page exists — this fact is wrong" (loss-aversion beats create-a-page) | AE labor | Profiles; ≥5 corrections (a correction IS an onboarding event) |
| S2 | **"How AI sees you" mirror** | Free diagnostic: what assistants currently say about the business vs. with an AE page live; page valuable at zero network (single-player hook) | Compute + templating | Claims; profiles |
| S3 | **Founding receipts** | First N providers per category get all qualifying requests routed while the market is thin — honestly framed as "first receipts compound" (ranking = attributable settled evidence with recency decay) | Placement (MUST be disclosed as commercial influence) | 10 recruited providers |
| S4 | **Recruit with a job in hand** | Never recruit into an empty room: "someone needs X this week — want the inquiry?"; works at n=1 | Founder time | 10 providers; ≥10 inquiries |
| S5 | **Zero-fee-until-outcome posture** | Free to list and receive inquiries forever; AE earns only on outcomes (later, one provider-backed rail) — the pre-P5 constraint stated as the offer | Nothing | Removes join friction across all supply metrics |

## Demand-side mechanisms

| ID | Mechanism | Offer | Cost | Gate metric moved |
|---|---|---|---|---|
| D1 | **Concierge the first 100 sessions** | First ~20 requests hand-run end-to-end (find, compare, inquire, follow up); founder-as-market-maker; do not automate what hasn't been hand-run | Founder time | 100 sessions; ≥10 inquiries; mints receipt seed-corn for S3 |
| D2 | **Assistant channel as demand loop** | "Ask your AI — it can actually *send the inquiry* here"; make the assistant successful (clean llms.txt, honest boundaries, working receipts) and demand routes itself; measure agent-originated sessions separately | Engineering already shipped | Attributable sessions (new attribution class) |
| D3 | **Free work-sample tender as lead magnet** (post H-1 only) | "Post your project, get three finished drafts at firm prices — free"; supply subsidizes with near-zero-cost work samples; **award = qualified inquiry with artifact attached** (existing machinery; pre-P5-legal by construction; money stays off-platform as today). Guards: capped bid slots + artifact-required + qualification-gated admission | Moderation + admission design | Sessions; inquiries; exercises ADR-009 gates 1–3 with real motive |
| D4 | **Honesty as the guarantee** | Process guarantee, not money-back: every option source-backed, unknowns labeled, corrections visible at the moment of choosing | Discipline (already required) | Zero-overclaim criterion doubles as the demand offer |
| D5 | **Constrain to one atom** | One category × one metro cluster (AU urgent/local ICP); all incentives concentrate until the atom clears, then replicate | Focus | Makes every other metric achievable (Roth: thickness first) |

## Sequencing (90 days)

1. **Weeks 1–2:** H-1 owner interviews (recommendation vs compare-work vs done-for-you) + pick the atom; S1 seeding starts.
2. **Weeks 2–6:** S2 mirror reports to every seeded business; D1 concierge on all inbound; S4 recruiting only with jobs in hand.
3. **Weeks 6–12:** if H-1 favors comparing work → D3 tender in one deliverable class ("ads for your business page"); S3 founding-receipts offer formalized with commercial-influence disclosure.
4. **Throughout:** every metric attributed; boundary overclaim = program failure (it is both a gate criterion and mechanism D4).

## Hypotheses (falsifiable, per records rules)

**H-CS1 (loss-aversion claim trigger — S1).** "Your page exists and is wrong" converts owners to claim/correct at a materially higher rate than "create your page."
- Decision: whether seeding + correction-bait is the primary supply motion.
- Population: the 30–50 seeded launch-ICP businesses. Comparison: claim CTA framing A/B (exists-and-wrong vs create).
- Measurement: claim + correction rate per contacted owner within 14 days.
- Falsifier: no difference or seeded owners react negatively (removal requests > corrections) ⇒ revert to consent-first outreach.
- Owner: Founder. Review: 2026-08-17.

**H-CS2 (mirror hook — S2).** The "how AI sees you" diagnostic gets ≥30% of contacted owners to view it and ≥10% to claim within 7 days.
- Falsifier: <10% view rate ⇒ the AI-visibility pain is not felt yet in this ICP; drop as lead hook, keep as onboarding artifact.
- Owner: Founder. Review: 2026-08-17.

**H-CS3 (founding-receipts pull — S3).** "First receipts compound" recruits providers without cash incentives: ≥10 providers accept routed-priority within the atom.
- Falsifier: providers demand payment/exclusivity instead ⇒ evidence-currency insufficient at zero network; revisit after D1 mints visible receipts.
- Guard: priority placement disclosed as commercial influence; any breach fails the zero-overclaim gate criterion.
- Owner: Founder. Review: 2026-08-17.

**H-CS4 (job-in-hand conversion — S4).** Supply recruited with a live inquiry in hand converts ≥3× better than cold listing outreach and responds to the inquiry ≥80% of the time.
- Falsifier: response rate <50% ⇒ recruited supply is not actually engaged; inquiry-in-hand is vanity conversion.
- Owner: Founder. Review: 2026-08-17.

**H-CS5 (assistant-originated demand — D2).** Assistants produce attributable sessions and ≥1 completed qualified inquiry without human navigation to AE surfaces.
- Measurement: agent-attributed sessions and inquiries (separate attribution class) within the atom's window.
- Falsifier: zero agent-originated inquiries in 60 days ⇒ the agent channel is read-only reach today, not a demand loop; deprioritize as acquisition (keep as distribution).
- Owner: Engineering. Review: 2026-08-17.

**H-CS6 (tender lead magnet — D3; gated on tender H-1).** "Three finished drafts free" acquires demand at materially lower effort per qualified inquiry than concierge D1, with ≥50% of tender posters proceeding to an award-inquiry.
- Falsifier: posters collect samples and vanish (<20% award-inquiry) ⇒ the free-sample offer trains free-riding; require intent signals (budget band, timeline) at posting.
- Owner: Product. Review: 2026-08-17.

**H-CS7 (hard side — cross).** Demand is the binding constraint: with supply seeded (S1) and providers recruited (S4), sessions/inquiries — not provider count — remain the last unmet gate metrics.
- Falsifier: providers churn or refuse inquiries while demand queues ⇒ supply is the hard side in this ICP; rebalance incentives toward supply quality.
- Owner: Founder. Review: 2026-08-17.

## UNKNOWNS

- Whether the bootstrap gate's superseded status (wayfinder #112 proof ladder) means these metrics need re-ratification before being used as the cold-start definition of done.
- AU consumer-law posture for the D3 free-sample tender (firm-price representations attached to samples).
- Whether S3 thin-market priority can be expressed inside existing commercial-influence disclosure without new schema.

## Relationship to standing authority

Nothing here authorizes building D3 (request-market cut stands) or any money mechanism. S1/S2/S4/S5/D1/D2/D4/D5 are executable under current authority (they are labor, copy, attribution, and outreach — not new surfaces). D3 requires the tender decision record (companion record) after H-1. S3 requires a disclosure design check but no new market machinery.

---
*Companion to the tender exploration and market-forms review. Hypothesis-class; no field evidence yet; review 2026-08-17.*
