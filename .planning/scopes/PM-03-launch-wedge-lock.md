# PM-03 Launch Wedge Lock

## Verdict

**PM-03 verdict: GO.** AE should launch v1 against a narrow local-services supply wedge while preserving the broader product architecture as wedge-neutral; this satisfies the PM-03 gate because the launch wedge and not-yet list are explicit, and the schema rule remains unchanged (`PREMORTEM-VALIDATION-GATES.md:21-24`, `PREMORTEM-VALIDATION-GATES.md:9-16`).

**One-sentence v1 launch wedge:** recruit solo AU home/trade service owners in one metro and 2-3 urgent trades, starting with plumbing/electrical/locksmith-style providers, by offering a free assistant-readable listing and one safe qualified-inquiry next step (`PRODUCT-10-STAR.md:147-158`, `PRODUCT-10-STAR.md:190-195`).

**One-sentence not-yet list:** not yet multi-vertical local services, professional-services or farm-gate expansion, retail/SKU commerce, broad agent-native business tooling, booking, payment, dispatch, autonomous fulfilment, live money, generic action catalogs, request markets, developer platforms, or public claims beyond read/compare/summarize/route/qualified inquiry (`PRODUCT-10-STAR.md:51-57`, `PRODUCT-10-STAR.md:314-316`, `AGENTS.md:21-28`).

## Evidence

- `PRODUCT.md` already separates product vision from premature marketplace claims: AE is the trust and discovery layer, should feel like the beginning of a marketplace, and must not pretend booking/payment/dispatch/reviews/dispute handling exist before they do (`PRODUCT.md:7-13`).
- `PRODUCT.md` names local services as the seed market because need/trust/constraints are concrete, but says urgent help is only a seed use case; the larger wedge is trustworthy agent-readable commerce details before the next step (`PRODUCT.md:15-20`).
- `PRODUCT.md` keeps the first owned loop to search, compare, qualified inquiry, owner response/correction/claim, and fresher evidence; if qualified inquiry is not live, the product must plainly use detail view or external contact and not imply booking/payment/dispatch/autonomous execution (`PRODUCT.md:28-40`).
- `AGENTS.md` constrains assistants to read, compare, summarize, route, and send a qualified inquiry when published; it explicitly forbids assuming booking, payment, dispatch, availability, or facts needing confirmation (`AGENTS.md:21-28`).
- `PRODUCT-10-STAR.md` says the widened vision is not “home of AU trades”: the durable category is fragmented, local, small-counterparty commerce with live trust failures, while execution stays narrow and trades remains proof vertical #1 through H0-H2 (`PRODUCT-10-STAR.md:24-57`).
- `PRODUCT-10-STAR.md` names the cold-start wedge precisely: solo AU tradies and AU homeowners/renters, supply first, one metro x 2-3 urgent trades, and at least 25 published/claimed/response-committed listings before demand-side push (`PRODUCT-10-STAR.md:147-160`).
- `PRODUCT-10-STAR.md` H0 asks for 5 friendly owner rows -> 25 wedge listings, ≥20 real inquiries, ≥60% owner 24h response, and a kill signal if owners will not respond to real inquiries (`PRODUCT-10-STAR.md:190-195`).
- `PREMORTEM-VALIDATION-GATES.md` defines PM-03 as the guard against wedge ambiguity and says success is a one-sentence v1 wedge plus one-sentence not-yet list while fixtures/demos name the wedge and core schemas stay wedge-agnostic (`PREMORTEM-VALIDATION-GATES.md:19-24`).
- Scope 2 source-local 02-01 is complete: the capability axis is a closed four-kind union, trust state excludes unqualified “verified,” and the source module scan found no local-service-shaped fields in `src/modules/capabilities` (`02-01-SUMMARY.md:31-39`). Production/deployed proof is not claimed (`02-01-SUMMARY.md:56-58`).
- Scope 3 source-local 03-01 is complete only as a kernel acquisition/runtime spike; no agent-principal, Web Bot Auth verifier, public posture, or production/deployed proof is claimed (`03-01-SUMMARY.md:68-73`).

## Why schemas remain wedge-agnostic

The local-services wedge is a **recruiting and fixture constraint**, not a data-model commitment. It names who to call, which demo rows to seed, and what customer words to use; it does not authorize service-shaped fields in the core inquiry, thread, capability, action, or receipt models.

Core schemas remain neutral because the validated long-term category is not “AU trades forever”; it is fragmented local small-counterparty commerce whose primitives can be re-parameterized after liquidity evidence (`PRODUCT-10-STAR.md:51-57`). The premortem makes this explicit: no service-shaped fields such as urgency/jobSuburb may enter the core models without a later explicit decision (`PREMORTEM-VALIDATION-GATES.md:9-16`). Scope 2 reinforces the same rule by requiring no serviceArea/suburb/hours/urgency/emergency fields in the new capability tables and by scan-enforcing the invariant (`SCOPE-02-INDEX.md:95-102`).

## Local-services seed vs hardcoding services

| Seed choice | Allowed now | Not allowed now |
|---|---|---|
| Supply recruiting | DM/call solo AU tradies in one metro and 2-3 urgent trades; pitch “free qualified inquiries, no lead fees, readable by your customers’ AI” as the concierge owner offer (`PRODUCT-10-STAR.md:190-195`, `PRODUCT-10-STAR.md:333-335`). | Treat all future supply as trades, or block adjacent verticals that later clear the same evidence bar. |
| Fixtures and demos | Name plumbing/electrical/locksmith-style demo businesses so reviewers can evaluate concrete listings, inquiries, replies, and receipts. | Add local-service-only fields or validation to core inquiry/thread/capability/action/receipt models. |
| Public copy | Say AE helps people compare listed businesses and send a qualified inquiry when available, with boundaries visible before action (`PRODUCT.md:65-72`, `AGENTS.md:21-28`). | Promise booking, payment, dispatch, availability, autonomous fulfilment, broad marketplace liquidity, or unqualified verification (`PRODUCT.md:74-79`, `AGENTS.md:14-19`). |
| Architecture | Keep shared trust states, qualified inquiry, evidence, and receipt primitives usable by later local verticals. | Create a trades-only platform shape or public-facing internal vocabulary. `AGENTS.md` keeps internal architecture words out of human copy (`AGENTS.md:90-92`). |

## Downstream effect

| Downstream work | PM-03 effect | Still blocked / not proven |
|---|---|---|
| **02-02 capability tables + additive migration** | PM-03 removes wedge-ambiguity as a blocker only if 02-02 keeps the table shape wedge-neutral. The local-services wedge may appear in fixtures, but the schema must continue the 02-01 closed-kind/discriminated-descriptor/trust-state model and enforce no service-shaped fields (`SCOPE-02-INDEX.md:26-38`, `SCOPE-02-INDEX.md:63-68`, `SCOPE-02-INDEX.md:95-102`, `02-01-SUMMARY.md:31-39`). | 02-02 still requires Scope 1 source substrate and S2-G3 wedge-agnostic contract pack; deployed/provider proof remains separate (`SCOPE-02-INDEX.md:10-17`, `PHASED-EXECUTION-PREP.md:65-72`). PM-01, PM-02, and PM-05 remain separate non-kill gates for Scope 2 build (`SCOPE-02-INDEX.md:10-17`). |
| **03-02 Web Bot Auth identity + public posture** | PM-03 tells 03-02 which public posture to scan against: identity can support attribution/quota/audit for the qualified-inquiry front door, not new verbs or public autonomy claims. The launch wedge may inform examples; it does not turn signer identity into authority (`SCOPE-03-INDEX.md:8-16`, `SCOPE-03-INDEX.md:27-32`). | 03-02 still requires S3-G2 fixture/header proof and must keep identity ≠ authority plus no public Handshake vocabulary (`SCOPE-03-INDEX.md:8-16`, `SCOPE-03-INDEX.md:86-95`). Production/deployed proof is not established by 03-01 (`03-01-SUMMARY.md:68-73`). PM-02 and PM-05 remain separate non-kill gates for public posture (`SCOPE-03-INDEX.md:8-16`). |
| **Scope 4 durable communication rail** | PM-03 narrows the first communication demo to a local-services qualified-inquiry/reply thread, so the product story can be judged against real owner words instead of abstract messaging. A quote remains communication, and acceptance can only create a next-step pointer while booking/payment/dispatch remain unclaimed (`PHASED-EXECUTION-PREP.md:94-115`). | Scope 4 still waits on Scope 2 dispatchability semantics, Scope 3 attributed identity/mandate posture, PM-02 non-kill, PM-04 non-kill, and Scope 4 local gates/ADR resolutions (`PHASED-EXECUTION-PREP.md:94-115`). PM-03 does not prove owner willingness to use the thread twice. |
| **Scope 5 receipt-backed action demo** | PM-03 gives S5-G2 a product wedge to map against: if a source/local/test-mode receipt demo is built, it should tell the same one-metro urgent-trades story and label what it proves and does not prove (`PHASED-EXECUTION-PREP.md:117-138`). | Scope 5 remains lab/source-local/test-mode unless PM-01 and PM-04 pass; it is not proof of supply liquidity, assistant distribution, local-services demand, live money, production payment, dispatch, booking, or broad marketplace readiness (`PHASED-EXECUTION-PREP.md:117-148`). H2 live money also requires H1 exit plus owners explicitly asking to take money through AE (`PRODUCT-10-STAR.md:204-211`). |

## Missing evidence

- **Owner pull is not proven here.** PM-01 still needs contacted-owner counts, claim/listing completions, and 24h inquiry-response commitments; H0 separately requires ≥25 listings, ≥20 real inquiries, ≥60% 24h owner response, and ≥3 owners upset-if-gone (`PREMORTEM-VALIDATION-GATES.md:19-24`, `PRODUCT-10-STAR.md:190-195`).
- **Assistant distribution is not proven here.** PM-02 still needs external assistant/search discovery and boundary-survival evidence before deeper discovery, public posture, readback, or propose surfaces (`PREMORTEM-VALIDATION-GATES.md:19-25`, `PHASED-EXECUTION-PREP.md:16-28`).
- **Trust-language red-team is not proven here.** PM-05 still needs reviewer confirmation that public/demo copy does not imply booking, payment, dispatch, auto-fulfilment, broad autonomy, marketplace liquidity, or unqualified verification (`PREMORTEM-VALIDATION-GATES.md:19-25`).
- **Production/provider proof is not proven here.** Scope 2 02-01 and Scope 3 03-01 summaries explicitly claim source-local proof only (`02-01-SUMMARY.md:56-58`, `03-01-SUMMARY.md:68-73`).
- **Structured service-shaped inquiry fields are not approved here.** `PRODUCT-10-STAR.md` discusses H1 structured demand, but the current PM-03 decision holds schemas neutral until a later explicit decision and evidence gate (`PRODUCT-10-STAR.md:197-202`, `PREMORTEM-VALIDATION-GATES.md:9-16`).

## Blocks / Unlocks

- **Unlocks:** PM-03 no longer blocks planning consumption for S2/S3/S4/S5, provided each consumer keeps source/local, deployed test-mode, deployed provider, and live/production proof separate and does not widen public authority (`PHASED-EXECUTION-PREP.md:8-15`).
- **Blocks:** Any change that adds urgency/jobSuburb/serviceArea/hours-style assumptions to core inquiry/thread/capability/action/receipt models remains blocked until an explicit later decision; any public copy implying booking, payment, dispatch, autonomous fulfilment, live money, broad marketplace liquidity, or unqualified verification remains blocked (`PREMORTEM-VALIDATION-GATES.md:9-16`, `AGENTS.md:14-28`, `PRODUCT.md:74-79`).
- **Does not unlock:** 02-02 implementation without S2-G3 and Scope 1 substrate; 03-02 public posture without S3-G2 and PM-05; Scope 4 without Scope 2/3 prerequisites and PM-04; Scope 5 beyond source-local/test-mode without PM-01/PM-04 and its own evidence gates (`PHASED-EXECUTION-PREP.md:49-138`).

## Next consuming plan

1. **02-02** consumes this as the PM-03 GO artifact, but must pair it with S2-G3 before table/disclosure work so fixtures can be local-service-shaped while schemas remain neutral (`SCOPE-02-INDEX.md:10-17`, `PHASED-EXECUTION-PREP.md:65-72`).
2. **03-02** consumes this as the wedge/public-posture input, but must keep identity attribution-only and avoid public internal vocabulary or new verbs (`SCOPE-03-INDEX.md:8-16`, `SCOPE-03-INDEX.md:27-32`).
3. **Scope 4 04-02+** consumes this only after its own prerequisites; use the wedge to script a concrete inquiry/reply demo, not to claim booking/payment/dispatch (`PHASED-EXECUTION-PREP.md:94-115`).
4. **Scope 5 S5-G2 / 05-01+** consumes this as the wedge mapping input for any receipt demo, explicitly labelling source/local/test-mode proof and missing live/production gates (`PHASED-EXECUTION-PREP.md:117-148`).
