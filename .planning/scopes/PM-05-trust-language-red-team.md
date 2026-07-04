# PM-05 Trust-Language Red-Team

**Artifact:** PM-05 trust-language red-team  
**Scope:** planned public human copy, demo copy, and assistant/agent descriptor language for Scopes 2–5.  
**Proof level:** planning/source-doc review only. No deployed-provider, live/production, or uninvolved-human reviewer proof is claimed.

## Verdict

**PM-05 verdict: ADAPT.**

PM-05 **does not unlock public/demo copy now**. The product story is explainable inside AE's trust contract, so this is not KILL, but the planned scope language still contains internal/protocol/authority words that are safe in planning docs and unsafe on public human surfaces or assistant-visible descriptors unless renamed and scan-guarded.

Public/demo copy and agent descriptors remain blocked until all of the following are true:

1. The rename and scan additions in this artifact are applied to the consuming plans or implementation scans.
2. The planned promise deck is reduced to boundary-honest public language.
3. Three uninvolved reviewers actually read that revised deck and correctly answer the PM-05 questions. This artifact simulates the questions from existing docs; it is **not** evidence of three human reviewer responses.

## Evidence

### Trust contract evidence

- `AGENTS.md` defines AE as business-supplied service pages customers compare and assistants safely read, with first owned conversion limited to a **qualified inquiry** for owner review (`AGENTS.md` lines 9–12).
- `AGENTS.md` explicitly says AE does **not** book, charge, dispatch, or auto-fulfil, and says `Verified` is only allowed when a named standard exists and a listing meets it (`AGENTS.md` lines 14–19).
- Assistant-safe contract is read, compare, summarize, route to next step, and send a qualified inquiry only when that listing publishes the capability; assistants may not assume booking, payment, dispatch, availability, or facts needing confirmation (`AGENTS.md` lines 21–28).
- Current assistant-callable actions are exactly `registry.search`, `registry.detail`, and `inquiry.submit`; only `inquiry.submit` is a write, and it must refuse booking/payment/dispatch/autonomous fulfillment (`AGENTS.md` lines 38–49; `scope-01-production-landing/SCOPE-01-INDEX.md` lines 24–27 and 106–113; `01-03-SUMMARY.md` lines 10–14).
- `AGENTS.md` bans public human-surface internal vocabulary including `source-owned`, `readback`, `manifest`, `capability`, `gateway`, `operator`, `MCP`, `OpenAPI`, `callable`, `autonomous`, `agent-native`, `DTO`, and `fixture` (`AGENTS.md` lines 90–92).
- `PRODUCT.md` repeats the product boundary: AE should feel like the beginning of a marketplace but must not pretend to have liquidity, booking, payment, dispatch, reviews, or dispute handling before they exist (`PRODUCT.md` lines 9–14).
- `PRODUCT.md` says qualified inquiry is the first owned conversion and says if qualified inquiry is not live, the product must plainly use `View details` or external contact instead of implying booking, payment, dispatch, or autonomous execution (`PRODUCT.md` lines 28–40).
- `PRODUCT.md` trust states are plain labels (`listed`, `business_supplied`, `publicly_observed`, `checked`, `contradicted`, `stale`, `disputed`, `unsupported`) and never unqualified `verified` (`PRODUCT.md` lines 42–58).
- `PRODUCT.md` anti-references include protocol theatre, fake marketplace liquidity, fake reviews, fake availability, fake badges, fake dashboard previews, and internal vocabulary (`PRODUCT.md` lines 74–79).

### Gate evidence

- `PREMORTEM-VALIDATION-GATES.md` global rule requires source/local, deployed test-mode, deployed provider, and live/production proof to stay separated (`PREMORTEM-VALIDATION-GATES.md` lines 9–15).
- PM-05 GO requires three uninvolved reviewers to read planned copy/promise deck and accurately answer: no booking, no payment, no dispatch, no auto-fulfilment, no unqualified verification; only gated inquire/propose/readback (`PREMORTEM-VALIDATION-GATES.md` line 25).
- PM-05 ADAPT is triggered if any label implies payment, booking, broad autonomy, marketplace liquidity, or protocol theatre; the remedy is rename before coding and add the term/pattern to scans (`PREMORTEM-VALIDATION-GATES.md` line 25).
- PM-05 KILL is reserved for a combined story that cannot be explained without public internal vocabulary or overclaim (`PREMORTEM-VALIDATION-GATES.md` line 25). Current docs can explain the story without overclaim, so KILL is not supported by this review.
- `PHASED-EXECUTION-PREP.md` makes PM-05 a Phase 0 validation artifact that blocks public/demo copy and agent descriptors in all scopes (`PHASED-EXECUTION-PREP.md` lines 16–28).

### Scope evidence consumed

- Scope 1 ships no new public capability and keeps `agentTools` at exactly `registry.search`, `registry.detail`, and `inquiry.submit`; deployed smoke evidence is still blocked on user-provisioned inputs (`scope-01-production-landing/SCOPE-01-INDEX.md` lines 1–7, 66, 81–97; `01-04-SUMMARY.md` lines 3–5 and 79–92).
- Scope 2 current source-local result is a wedge-agnostic capability model with no `verified` trust state, no local-service-shaped fields in the capability module, and no deployed provider/check-engine proof claimed (`scope-02-capability-registry/02-01-SUMMARY.md` lines 31–58).
- Scope 2 index language is internally useful but risky publicly: `agent-native supply remodel`, `capability registry`, `business_endpoint`, `operationMode`, `ae-endpoint-check:v1`, and `agent-operated demo business` are implementation/planning terms, not public human copy (`scope-02-capability-registry/SCOPE-02-INDEX.md` lines 1–8, 24–38, 95–103).
- Scope 3 index states identity is not authority, Handshake vocabulary never ships on public human surfaces or in agent JSON/tools/boundaries copy, and verified signatures grant attribution/quota/audit only (`scope-03-handshake-identity-clearance/SCOPE-03-INDEX.md` lines 1–7, 19–33, 86–95).
- Scope 3 current source-local result acquired/spiked `handshake-protocol-kernel` but does not create agent identity, Web Bot Auth verifier, agent door public posture, or Handshake banned-copy scan yet (`scope-03-handshake-identity-clearance/03-01-SUMMARY.md` lines 1–10, 41–57, 68–73).
- Scope 4 boundary is safe if phrased correctly: AE reads, compares, summarizes, routes, delivers/reads-back messages, never books/charges/dispatches/auto-fulfils, never fabricates a business reply, a quote is communication, and acceptance emits only a next-step pointer (`scope-04-comms-rail-threads/SCOPE-04-INDEX.md` lines 1–6, 18–31, 86–93).
- Scope 5 is source/local, Stripe test-mode only; `businessAction.propose` is authored but not registered; live money is gated by a later decision record; public verifier is read-only/hash-only/non-enumerable (`scope-05-transactions-receipts/SCOPE-05-INDEX.md` lines 1–18, 23–35, 80–90, 101–108).

## Promise deck phrase red-team

### Safe public human copy phrases

Use these on public/demo surfaces when the corresponding feature is actually present at the stated proof level.

| Phrase | Where safe | Required qualifier | Evidence |
|---|---|---|---|
| `Search published business listings` | Public human copy and agent descriptor | Read-only; public catalog facts only | `AGENTS.md` lines 38–45 |
| `Compare business-supplied details` | Public human copy | Source/freshness/boundary shown; no availability guarantee | `PRODUCT.md` lines 13 and 42–58 |
| `See what is known and what needs confirmation` | Public human copy | Use plain labels, not JSON ledger labels on human surfaces | `PRODUCT.md` lines 13 and 46–58; `AGENTS.md` lines 67–72 |
| `Send a qualified inquiry for owner review` | Public human copy and `inquiry.submit` descriptor | Only where listing publishes inquiry; never book/pay/dispatch | `AGENTS.md` lines 21–28 and 46–49; `PRODUCT.md` lines 28–40 |
| `Checked against a named standard` | Public human copy | Only when the exact named standard exists and the listing/check passed; otherwise use `checked`, `published`, `supplied`, or `needs confirmation` | `AGENTS.md` lines 16–19; `PRODUCT.md` lines 51–58 |
| `Read-only receipt status` | Demo copy only after Scope 5 verifier exists | Hash-only, non-enumerable, source/local/test-mode unless deployed proof exists | `scope-05-transactions-receipts/SCOPE-05-INDEX.md` lines 31–35 and 80–90 |
| `Owner-reviewed proposal request` | Future copy only after Scope 3/5 exposure gates | Proposal-only; owner approval required; no booking/payment/dispatch; unavailable before deliberate action registration | `scope-05-transactions-receipts/SCOPE-05-INDEX.md` lines 29, 90, and 107 |
| `Sent via an assistant on behalf of a person` | Scope 4 provenance copy | Message provenance, not autonomous fulfillment | `scope-04-comms-rail-threads/SCOPE-04-INDEX.md` lines 26–31 |
| `Automated reply from {business}` | Scope 4 provenance copy | Only for signed/verified inbound business-agent reply; never AE-generated | `scope-04-comms-rail-threads/SCOPE-04-INDEX.md` lines 25–31 and 88–89 |
| `Source/local demo` | Demo artifact | Must say production/deployed/live proof is not claimed | `PHASED-EXECUTION-PREP.md` lines 167–180; `scope-05-transactions-receipts/SCOPE-05-INDEX.md` lines 80–90 |

### Safe assistant/agent descriptor phrases

These are acceptable in machine-facing descriptors when paired with explicit boundaries. They are not automatically safe on public human surfaces.

| Descriptor phrase | Required boundary text |
|---|---|
| `Read-only. Returns public catalog facts only.` | `Does not book, charge, dispatch, send inquiries, or invent missing provider details.` |
| `Write, admission-gated qualified inquiry.` | `Sends first-contact inquiry for owner review only; refuses booking, payment, dispatch, or autonomous fulfillment.` |
| `Unsigned reads are allowed; unsigned writes are refused.` | `Identity changes attribution/quota/audit only; a signature never authorizes a verb.` |
| `Receipt/status lookup is read-only and hash/token scoped.` | `No list route; no private evidence; source/local/test-mode unless deployed proof is recorded.` |
| `Proposal-only; owner approval required.` | `Not registered/exposed until Scope 3 attributed-identity and mandate gates pass; no booking/payment/dispatch.` |

### Risky phrases requiring rename, qualifier, or scan guard

| Risky phrase | Why risky | Required rename / qualifier |
|---|---|---|
| `agent-native supply` | Publicly implies protocol/product maturity and assistant authority | Human copy: `assistant-readable listings`; internal docs may keep `agent-native` only when not surfaced publicly. |
| `capability registry` / `capability` | `capability` is banned on public human surfaces and can imply callable action authority | Human copy: `available next steps`, `published contact options`, or `listing details`; machine/internal: keep with scan isolation. |
| `business_endpoint` / `endpoint` | Sounds callable/dispatchable and internal | Human copy: `business reply channel`; machine descriptors: `registered business reply URL` only with no-dispatch boundary. |
| `agent-operated business` | Can sound like a fake business agent or autonomous provider | Demo copy: `AE-operated demo reply path` or `demo business reply simulator`; real copy: `business-operated reply channel` only with provenance. |
| `readback` | Internal term banned on public human surfaces | Human copy: `thread status`, `reply status`, `receipt status`, or `status page`. |
| `receipt-backed action` | Can imply executed commerce or payment | Demo copy: `receipt-backed local demo` or `receipt record`; public product copy only after proof level is explicit. |
| `proposal` / `propose` | Can imply a quote/order flow and action readiness | Human copy: `request an owner-reviewed proposal`; machine descriptor must say proposal-only, gated, no booking/payment/dispatch. |
| `quote accepted` / `acceptance` | Can imply booking/payment confirmation | Human copy: `intent recorded` or `next-step requested`; must say acceptance is not booking/payment/dispatch. |
| `delivered` | Can be mistaken for read/accepted | Use `delivered to the configured channel`; separate from `read` and owner response. |
| `checked` | Safe only if the check is defined | Pair with `against {named standard}` or use `published/supplied/needs confirmation`. |
| `verified` | Banned unless a named standard exists and passed | Prefer `checked`, `business-supplied`, `published`, or `last checked`. If ever used, require `Verified against {standard}` and evidence. |
| `marketplace` | Can imply liquidity, reviews, dispute handling, booking, payment | Use `directory`, `registry`, `published listings`, or `beginning of a marketplace` only in internal/product narrative with explicit non-marketplace limits. |
| `live`, `production`, `provider proof`, `deployed proof` | Current S1/S5 proof remains separated and incomplete | Public/demo copy must state source/local/test-mode unless deployed rows exist. |
| `Handshake`, `HSK`, `kernel`, `greenlight`, `clearance`, `mandate`, `protocol`, `gateway`, `ActionContract` | Scope 3 expressly bans these on public human surfaces and agent JSON/tools/boundaries | Replace publicly with `signed request`, `owner approval`, `permission check`, or omit. Agent descriptors should describe boundary, not implementation. |
| `MCP`, `OpenAPI`, `callable`, `autonomous`, `agent-native` | Explicitly banned public vocabulary and/or overclaim | Omit from public copy. For machine surfaces, use actual tool IDs plus boundaries; never marketing labels. |
| `checkout`, `pay`, `paid`, `charge`, `wallet`, `settlement`, `Stripe live` | Scope 5 is test-mode/source-local only and live money is gated | Demo copy: `Stripe test-mode` only where true; no public payment capability claim. |

### Banned public human copy phrases

Do not ship these on public human surfaces. Some are allowed only in planning docs, code identifiers, private tests, owner/admin surfaces, or machine JSON where explicitly permitted and scan-isolated.

- `Book now`, `instant booking`, `booked`, `booking confirmed`
- `Pay now`, `checkout`, `charged`, `payment complete`, `live payment`, `wallet`, `settlement`
- `Dispatch`, `provider dispatched`, `job scheduled`, `auto-dispatched`
- `Auto-fulfil`, `autonomous fulfilment`, `agent completed the job`, `hands-free execution`
- Unqualified `verified`, `verified provider`, `verified receipt`, `verified business`
- `Marketplace with ready providers`, `available now`, `real-time availability`, `reviews`, `ratings`, unless real evidence exists and the claim is scoped
- `MCP`, `OpenAPI`, `callable`, `agent-native`, `autonomous`, `protocol`, `gateway`, `source-owned`, `readback`, `manifest`, `capability`, `operator`, `DTO`, `fixture`
- `Handshake`, `HSK`, `kernel`, `greenlight`, `clearance`, `mandate`, `ActionContract`
- `businessAction.propose is live`, `agents can propose`, `agents can execute`, `agent can take action`, until Scope 3/5 gates and deliberate snapshot diff exist
- `production-ready payments`, `live Stripe`, `provider smoke passed`, `deployed proof`, unless the named deployed/provider evidence row exists

## Simulated PM-05 reviewer questions

These are **document-based simulated answers**, not actual uninvolved reviewer responses.

| Reviewer question | Expected answer from boundary-honest deck | Evidence | Current risk |
|---|---|---|---|
| Can AE book an appointment or job? | No. AE can show listings and route to a safe next step; a qualified inquiry is not a booking. | `AGENTS.md` lines 14–28; `PRODUCT.md` lines 28–40 | Any `book`, `confirmed`, `scheduled`, or `acceptance` copy must be banned or reframed. |
| Can AE take payment or charge the customer? | No. Scope 5 is source/local and Stripe test-mode only; live money is behind a later evidence decision. | `scope-05-transactions-receipts/SCOPE-05-INDEX.md` lines 8, 31–35, and 80–90; `01-04-SUMMARY.md` lines 63–68 | Demo copy mentioning `paid` or `Stripe` can be misread as live payment. Require `test-mode` and `no live payment`. |
| Can AE dispatch a provider? | No. AE can send/read messages only through admitted paths; dispatch is outside the contract. | `AGENTS.md` lines 14–28; `scope-04-comms-rail-threads/SCOPE-04-INDEX.md` lines 1–6 | `business_endpoint`, `delivery`, and `delivered` need careful status copy. |
| Can AE auto-fulfil or autonomously execute work? | No. Assistant actions are read/compare/summarize/route and qualified inquiry only today; future propose is gated and proposal-only. | `AGENTS.md` lines 21–28 and 38–49; `scope-05-transactions-receipts/SCOPE-05-INDEX.md` lines 29, 90, and 107 | `agent-native`, `autonomous`, `action`, and `execute` language should not reach public/demo copy. |
| Does `verified` mean AE verified the business? | No unqualified `verified` claim is allowed. Use named trust states and named check standards only when passed. | `AGENTS.md` lines 16–19; `PRODUCT.md` lines 42–58 | Existing planning language avoids `verified` as a trust state, but scans should catch public/descriptor regression. |
| What can an assistant do today? | Read/search/detail, compare/summarize, route, and submit a qualified inquiry if allowed; only `inquiry.submit` is a write. | `AGENTS.md` lines 21–49; `01-03-SUMMARY.md` lines 10–14 | Agent descriptors must not imply new verbs from Scope 2/3/5 unless deliberate snapshot diff exists. |
| Is identity a new authority grant? | No. Signed identity affects attribution/quota/audit only; verbs require mandate/checkpoint/action contract and are not present from a signature alone. | `scope-03-handshake-identity-clearance/SCOPE-03-INDEX.md` lines 6, 27–32, and 86–95 | Public copy must not mention Handshake/greenlight/clearance/mandate; descriptor copy must not imply signature authorizes writes. |
| Can a business-agent reply be fabricated by AE? | No. Scope 4 requires signed inbound business reply admission and says AE never auto-generates a reply. | `scope-04-comms-rail-threads/SCOPE-04-INDEX.md` lines 25–31 and 88–89 | Demo business copy must explicitly label AE-operated simulators and real business-operated channels. |
| Is a quote a transaction? | No. A quote is communication; acceptance records intent/next step only and never charges/books. | `scope-04-comms-rail-threads/SCOPE-04-INDEX.md` lines 23, 31, and 90 | `quote accepted` language needs `intent recorded`, not `confirmed booking/payment`. |
| Is the receipt verifier public proof of a live transaction? | No. Scope 5 verifier is read-only/hash-only and source/local/test-mode until deployed/live gates are met. | `scope-05-transactions-receipts/SCOPE-05-INDEX.md` lines 31–35 and 80–90 | `verified receipt` and `live payment` must be banned. |
| Is Scope 1 deployed proof complete? | No. Scope 1 has source/config proof; deployed smokes are blocked on user-provisioned env/provider inputs. | `01-04-SUMMARY.md` lines 3–5 and 79–92 | Public/demo claims must not say deployed/provider proof passed. |
| Is Scope 2 provider check proof complete? | No. 02-01 is source-local model only; deployed provider/check-engine proof is later. | `02-01-SUMMARY.md` lines 31–58 | `checked endpoints` or `agent-operated business` public claims need future evidence. |
| Is Scope 3 Handshake/WBA public posture complete? | No. 03-01 acquired/spiked kernel only; no WBA verifier, agent principal, public posture scan, or banned-copy scan exists yet. | `03-01-SUMMARY.md` lines 41–57 and 68–73 | Agent descriptor changes depending on Scope 3 identity must remain blocked. |

## Required ADAPT renames

These are exact replacements for consuming plans, public deck drafts, demo scripts, and eventual implementation copy. They do not require code edits in this artifact.

| Unsafe/risky term | Public human replacement | Agent/machine descriptor replacement |
|---|---|---|
| `agent-native supply` | `assistant-readable listings` | `published listing data with assistant-safe boundaries` |
| `capability registry` | `available next steps` / `published contact options` | `capability` may remain only in internal code/docs; descriptor should say `available action metadata` only if necessary and boundary-scoped |
| `capability` | `next step`, `listing detail`, `contact option` | `capability` only in non-public typed payloads; never in action summaries/boundaries shown to assistants unless scan-approved |
| `business_endpoint` / `endpoint` | `business reply channel` | `registered business reply URL; no dispatch; checked before use` |
| `operationMode` | `how replies are handled` | `operationMode` only in internal/JSON schema; descriptor should explain `human-operated`, `business-operated`, or `AE-operated demo` boundaries |
| `agent-operated demo business` | `AE-operated demo reply path` | `demo fixture; source/local only; not a real provider` |
| `readback` | `status`, `thread status`, `receipt status` | `read-only status lookup` |
| `receipt-backed action` | `receipt-backed local demo` / `receipt record` | `read-only receipt reconstruction; source/local/test-mode unless evidence says otherwise` |
| `businessAction.propose` | `request an owner-reviewed proposal` | `proposal-only action; not registered until Scope 3 gate; no booking/payment/dispatch` |
| `quote acceptance` | `intent to continue` / `next-step request` | `acceptance records intent only; no payment, booking, or dispatch consequence` |
| `verified` | `checked`, `business-supplied`, `published`, `last checked`, `needs confirmation` | `verified` only if paired with a named standard and evidence row; otherwise forbidden |
| `Handshake` / `greenlight` / `clearance` / `mandate` / `protocol` | Omit; if unavoidable, `signed request` or `owner approval` | Descriptor should describe boundary (`signature does not grant authority`) without naming implementation vocabulary |
| `MCP-shaped`, `callable`, `OpenAPI` | Omit | `quiet agent tools` only in internal docs; public human surface says `Get as agent JSON` where already approved |

## Required ADAPT scan additions

### Public human copy scan additions

Target: public route/source strings, demo README/public deck copy, SEO metadata, UI copy fixtures, and marketing/demo artifacts. Planning docs may contain these terms only under explicit planning/test allowlists.

Add fail patterns for public human surfaces:

```text
\bbook(?:ed|ing)?\b
\binstant\s+booking\b
\bschedul(?:e|ed|ing)\b
\bdispatch(?:ed|es|ing)?\b
\bauto[- ]?fulfil(?:l|led|ment)?\b
\bautonomous(?:ly)?\b
\bpay(?:ment|ments|ing)?\b
\bcheckout\b
\bcharg(?:e|ed|ing)\b
\bwallet\b
\bsettlement\b
\blive\s+(?:payment|money|stripe)\b
\bverified\b
\bmarketplace\s+(?:liquidity|ready|providers?)\b
\breal[- ]?time\s+availability\b
\bsource-owned\b
\breadback\b
\bmanifest\b
\bcapabilit(?:y|ies)\b
\bgateway\b
\boperator\b
\bMCP\b
\bOpenAPI\b
\bcallable\b
\bagent-native\b
\bDTO\b
\bfixture\b
\bHandshake\b
\bHSK\b
\bkernel\b
\bgreenlight\b
\bclearance\b
\bmandate\b
\bprotocol\b
\bActionContract\b
\bbusinessAction\.propose\b
\bagents?\s+can\s+(?:execute|book|pay|dispatch|propose)\b
```

Required allowlist/exception discipline:

- Allow `verified` only in private tests/planning docs or when the string also includes `against {named standard}` and the implementation points at a recorded evidence row.
- Allow `capability`, `readback`, `fixture`, `source-owned`, and protocol terms in `.planning/**`, tests, and internal code identifiers, but not in public human copy, public route metadata, or demo decks.
- Allow `payment`, `Stripe`, and `paid` only in Scope 5 demo contexts that also contain `test-mode` or `source/local` and a `no live payment` boundary.
- Allow `endpoint` in technical docs and code, not human copy; human copy must say `reply channel`.

### Agent descriptor / machine-boundary scan additions

Target: action registry summaries, `boundaries`, `GET /api/agent/tools` payload snapshots, agent JSON payloads, `llms.txt`, and quiet agent door descriptors.

Add fail patterns for assistant-visible descriptors unless the descriptor is explicitly a refusal/boundary statement:

```text
\bbook(?:ed|ing)?\b
\bpay(?:ment|ments|ing)?\b
\bcheckout\b
\bcharg(?:e|ed|ing)\b
\bdispatch(?:ed|es|ing)?\b
\bauto[- ]?fulfil(?:l|led|ment)?\b
\bautonomous(?:ly)?\b
\bwallet\b
\bsettlement\b
\blive\s+(?:payment|money|stripe)\b
\bHandshake\b
\bHSK\b
\bkernel\b
\bgreenlight\b
\bclearance\b
\bmandate\b
\bprotocol\b
\bgateway\b
\bActionContract\b
\bverified\b(?!\s+against\s+[A-Za-z0-9_.:-]+)
```

Add positive descriptor requirements:

- `registry.search` and `registry.detail` descriptors must include `read-only` and must say they do not book, charge, dispatch, send inquiries, or invent missing details.
- `inquiry.submit` descriptor must include `qualified inquiry`, `owner review`, and refusal of booking/payment/dispatch/autonomous fulfillment.
- Any future proposal descriptor must include `proposal-only`, `owner approval required`, `not booking`, `not payment`, `not dispatch`, and an explicit Scope 3/mandate gate before exposure.
- Any future receipt/status descriptor must include `read-only`, `hash/token scoped`, `non-enumerable`, and the proof level (`source/local`, `test-mode`, `deployed provider`, or `live`) that is actually supported.
- Identity descriptors must include `identity is attribution/quota/audit only` and must not say a signature authorizes a verb.

## Missing evidence

PM-05 cannot be GO because the following evidence is absent:

1. **No three uninvolved reviewer responses.** This artifact simulates the PM-05 questions from docs; it does not claim real human reviewer answers.
2. **No final public promise deck.** The reviewed material is the current planning/index/summary language, not a polished deck shown to reviewers.
3. **No applied rename/scan diff.** The exact rename and scan additions are proposed here but not implemented in source, plans, or tests by this artifact.
4. **No Scope 1 deployed smoke evidence.** Scope 1 has source/config proof; deployed smokes remain blocked on Vercel/Convex/Clerk/provider/seeded-business inputs (`01-04-SUMMARY.md` lines 79–92).
5. **No Scope 2 deployed provider/check-engine proof.** 02-01 is source-local model proof only (`02-01-SUMMARY.md` lines 56–58).
6. **No Scope 3 WBA public posture / descriptor scan proof.** 03-01 explicitly leaves WBA verifier, agent principal, public posture, and Handshake banned-copy scan for later (`03-01-SUMMARY.md` lines 68–73).
7. **No Scope 4 copy/provenance fixture.** S4-G5 is still a future gate before 04-04 UI/e2e/demo work (`PREMORTEM-VALIDATION-GATES.md` lines 70–71; `scope-04-comms-rail-threads/SCOPE-04-INDEX.md` lines 14–15).
8. **No Scope 5 demo anti-theatre / evidence boundary matrix.** S5-G1/S5-G5 remain future gates before demo closeout (`PREMORTEM-VALIDATION-GATES.md` lines 76–80; `scope-05-transactions-receipts/SCOPE-05-INDEX.md` lines 14–18).

## Blocks / Unlocks

### Blocks

Until ADAPT work is applied and reviewer evidence is collected, PM-05 blocks:

- Any public/demo copy that says or implies booking, payment, dispatch, autonomous fulfillment, broad marketplace liquidity, live money, deployed provider proof, or unqualified verification.
- Any Scope 2 public copy using `agent-native`, `capability`, `business_endpoint`, `endpoint`, `operationMode`, `manifest`, or `verified` as human-facing vocabulary.
- Any Scope 3 public or assistant-visible descriptor using `Handshake`, `HSK`, `kernel`, `greenlight`, `clearance`, `mandate`, `protocol`, `gateway`, or `ActionContract`.
- Any Scope 4 demo/provenance copy that blurs quote vs transaction, delivery vs read, AE-operated demo vs real business reply, or acceptance vs booking/payment.
- Any Scope 5 demo copy that implies live payment, production payment, public transaction proof, or registered/exposed `businessAction.propose`.
- Any agent-tools descriptor widening beyond the current `{registry.search, registry.detail, inquiry.submit}` without a deliberate snapshot diff and boundary review.

### Unlocks after adaptation

After the rename/scan additions are implemented and three uninvolved reviewers pass the PM-05 questions, PM-05 can unlock:

- Boundary-honest public/demo copy that says AE publishes assistant-readable listings, compares business-supplied facts, and routes people to a qualified inquiry or status page.
- Machine descriptors for the current three agent tools, if they remain explicit about read-only/read-write boundaries and refusal of booking/payment/dispatch/autonomous fulfillment.
- Scope 4/5 demo language that is explicitly labelled source/local/test-mode and describes receipts/status/proposals as owner-reviewed or read-only, not fulfilled commerce.

## Next consuming plan

**Next consuming plan: Phase 0 public/demo-copy adaptation before any Scope 2–5 public/demo copy or agent descriptor change.**

Specific consumers:

1. **Scope 2 / 02-04 registry search/discovery/disclosure/copy** must consume the public rename table and public/agent descriptor scan additions before capability labels or discovery copy are exposed.
2. **Scope 3 / 03-02 agent-door identity public posture scan** must consume the Handshake/identity banned vocabulary list and the descriptor positive requirements before any WBA/identity descriptor ships.
3. **Scope 4 / 04-04 receipts/provenance/boundary e2e** must consume the quote≠transaction, delivered≠read, AE-operated-demo vs business-operated-reply language rules.
4. **Scope 5 / 05-04 demo kit closeout** must consume the source/local/test-mode/live-money boundary language and ban `verified receipt`, `live payment`, and registered/exposed propose claims.

The next artifact after this should be a revised promise deck or copy fixture that applies these renames, followed by actual three-reviewer PM-05 evidence. Until then, PM-05 remains **ADAPT / not unlocked**.
