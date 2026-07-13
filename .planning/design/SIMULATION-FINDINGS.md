# Blind Simulation Findings — 10 critics, 2 waves

**Date:** 2026-07-13 · **Method:** blind persona agents experienced the amended page specs as screens (no access to rationale docs), reviewed food-critic style. Wave 1 = consumer floor (6 personas); Wave 2 = sophisticated coordination/procurement (4 personas). Full reviews: `agent://Sim{UrgentTradie,SkepticalShopper,OwnerPlumber,ReturningUser,SeoLander,BrowserOnly,PropertyManager,BuilderProcurement,SupportCoordinator,FacilitiesManager}`.

## Verdict board

| Critic | Persona | ★ | One-line verdict | Walked out at |
|---|---|---|---|---|
| UrgentTradie | Dana, hot water emergency, mobile | 2.5 | honest system that serves an urgent customer too late | "Reply: within 2 business days" discovered beside the send button |
| SkepticalShopper | Marcus, $25k reno, privacy-wary | 3.5 | superb consent wrapped around an incomplete comparison workflow | Activity can't show his two records or compare replies |
| OwnerPlumber | Tony, receiving business | 3 | disciplined ledger behind an expensive door | second deep-link sign-in with unspecified re-entry |
| ReturningUser | Priya, 4-days-later, new device | 3 | trustworthy record served across two dining rooms | Activity remembers the thread but can't open the reply record |
| SeoLander | Ben, Google→listing, 9pm | 2 | chain of custody wrapped around a missing phone number | "Ask this business" + "Business will quote" with no phone/reviews/hours |
| BrowserOnly | Lena, sensitive research, never sends | 3.5 | evidence-led research meal, kitchen mostly respects leaving | "Copy decision aid" with unknown payload = privacy gamble |
| **PropertyManager** | Rhonda, 40 doors, 6 parallel jobs | **2** | a beautifully documented single table that cannot run a six-table service | replies update records without updating Activity — command center is a coat check |
| **BuilderProcurement** | Dave, 2 sites, 3 quotes/trade + BOM | **2** | leaves the quote package, documents, and comparison to the builder | no attachment control for the window spec |
| **SupportCoordinator** | Amara, NDIS, audit-grade records | **2.5** | honest consumer record, portions too small for professional duty | acting-on-behalf reduced to a self-attestation toggle; no export |
| **FacilitiesManager** | Greg, recurring vendors, head-office proof | **2.5** | careful one-shot concierge, not an operating system | both replies in hand, still had to open Excel to prove market-testing |

## The founding insight, confirmed

The sophisticated wave rated LOWEST (2–2.5) while being the personas whose jobs the full-journey system should serve 10x. Their unanimous framing: **the one-business-at-a-time send was NOT the dealbreaker** ("I can accept sequential sends if each creates clean evidence" — Greg; "it was not the one-business limit" — Amara, Rhonda, Greg verbatim). What kills them is that the *outputs* of sequential sends can't be worked: no comparison across records, no export, no reuse, no worklist. **The consent/record spine is praised across all 10 reviews; the work-management layer above it doesn't exist.**

## Convergent abandonment map (≥3 critics each)

| # | Abandonment cause | Critics | Class |
|---|---|---|---|
| G1 | **No cross-record comparison.** Replies live in isolated 1-of-1 records; "comparison is not a bonus feature, it is the job" (Marcus). Bid-tab instinct forces export to Excel. | Marcus, Dave, Greg, Rhonda | **R1-compatible fix** — a read-only comparison VIEW over sequentially obtained replies is not R2 fan-out; WEDGE §5 already permits comparison at ≥2 attributable responses. Sequential episodes produce exactly that. |
| G2 | **No export/share artifact.** Records can't become a forwardable quote pack, audit citation, printable proof, or sanitized shortlist. Private links are security-sensitive and non-portable. | Rhonda, Amara, Greg, Marcus, Lena | **R1-compatible fix** — controlled export (PDF/print/sanitized copy with visible payload preview) per record + per comparison. |
| G3 | **Activity is a signpost, not a worklist.** Record events don't update it; `/i` visits never index; "needs me" is invisible; the `/t`-visit ritual is hidden. | Rhonda, Priya, Marcus | **R1 partial fix** — index records via non-secret handles (never keys); surface reply/needs-attention events; the deeper worklist (stage/age/filters) is the accounts-era product. |
| G4 | **No context/brief reuse.** Sites, access details, participant boundaries, duplicate-and-edit, field-diff between episodes ("identical brief" assertion for comparability). | Greg, Rhonda, Dave, Amara | **R1-compatible fix** (reuse within a thread/episode chain + explicit diff); saved templates/sites are R1.5. |
| G5 | **Response-time posture surfaces too late.** Urgency users discover "within 2 business days" at the send button; no urgency budget in streaming; no proud direct-contact routing for emergencies. | Dana, Ben, Rhonda | **R1-compatible fix** — surface evidence-based response posture on cards/listing BEFORE selection; explicit "this is not an emergency channel, call now"路由 with the number. |
| G6 | **SEO cold landing loses to the Google panel it came from.** No dependable phone/hours/reviews trio; AE-purpose incomprehensible in 10 seconds; unclaimed copy describes routing, not participation. | Ben, Dana | **R1-critical fix** — the listing is the acquisition surface; it must beat GBP on trust signals or it converts nobody. |
| G7 | **Acting-on-behalf-of is mechanics-real but UI-fake.** The authority tuple HAS principal/subject; the form reduces it to "You / another person with permission" self-attestation. No participant separation, no authority record. | Amara (+Rhonda implicitly) | **R1-compatible fix** — the A5 tuple's principal/subject posture gets real UI + per-subject context isolation ("start clean for another person"). |
| G8 | **Owner deep-link re-entry auth unspecified.** Repeated sign-in = channel death; queue rows lack suburb/scope/urgency for 10-second triage. | Tony | **R1-critical fix** — durable-session/biometric re-entry contract + queue row content. |
| G9 | **No attachments.** Spec sheets, intake documents — prose-only briefs are product-killing for trades/allied-health. | Dave, Amara | **Rung decision** — attachment = disclosure-scope expansion; belongs in WEDGE as an explicit R1.5 gate, not silently added. |
| G10 | **No out-of-band reconciliation.** User calls the business directly (they will); the record can't be closed as "contacted elsewhere," so the record decays into a lie. | Dana, Ben, Lena | **R1-compatible fix** — one customer action: "I handled this another way" → terminal state. |

## Strengths every wave confirmed (do not regress)

1. **The consent readback is a trust weapon** — "field-by-field disclosure and 'Phone: Not shared' — major trust win" (Marcus, the lead-gen-burned skeptic); "AE performs this exceptionally well" (Ben); "bank-grade" pattern recognized repeatedly.
2. **Boundary honesty reads as honesty, not weakness** — "Sent never means confirmed" earned explicit praise from Tony (owner side) and Greg ("trust-enhancing").
3. **Immutable record + delivery evidence beats email Sent Items** — Dave: "materially better… strong differentiator"; Greg: "the clearest reason AE deserves any place in my workflow."
4. **R0 non-coercion works** — Lena: "genuinely non-coercive… major trust strength" (with the funnel-pressure caveat on visual hierarchy).
5. **Suppression/opt-out separation** — Tony: "strong pass."

## Recommended action packet

| Priority | Action | Feeds |
|---|---|---|
| P0 | G6 listing trust trio + 10-second AE-explainer; G5 response-posture-before-selection + emergency routing; G8 owner re-entry contract | listing.md, registry.md, home.md, owner-inbox.md |
| P1 | G1 read-only cross-record comparison view (new page spec: `compare.md`, gated ≥2 replies, episodes-sourced); G2 export artifact contract; G10 "handled another way" terminal | new spec + private-record.md, thread.md, WEDGE §5 amendment |
| P2 | G3 Activity record-indexing via handles + needs-me events; G4 episode diff + carried-context assertion; G7 principal/subject UI | activity.md, confirm-and-send.md, JOURNEY-SYSTEM C7 |
| Rung gate | G9 attachments as explicit R1.5 disclosure-scope decision | WEDGE-LADDER |
| Positioning | Portfolio/recurring/compliance workloads (Rhonda's rounds, Greg's schedules, Amara's caseload) are the accounts-era product — name them as such, don't fake them | WEDGE-LADDER anti-scope |
