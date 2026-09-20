# Alpha maturity register

Baseline: 14 September 2026. **32 release items. Alpha is not ready.**

This is the execution and completion register. The
[release design](alpha-release-design.md) defines behavior and responsibilities;
the [validation plan](alpha-validation-plan.md) defines the cold-audit protocol.
Neither creates an additional backlog outside this register.

## Marking rules

**Current goal — 20 September 2026: launch-ready alpha with real transactions.**
Joel authorized stabilisation, repairs, deployment and hosted acceptance through
real x402 purchases using test USDC on Base Sepolia and real USDC on Base mainnet.
Source completion and sandbox acceptance are intermediate milestones. Complete
the required production prerequisites and activation; do not close the goal at
the source handoff or sandbox stage. This decision supersedes the previous
source-only stop and sandbox-only release scope. It does not establish that any
production prerequisite or purchase has passed.

The existing 32 records remain the queue. Their sandbox scenarios still prove
environment isolation and recovery. The additional launch proof is assigned to
the same parents below; sandbox-only wording does not limit final acceptance.

| Parents | Required launch evidence |
| --- | --- |
| AM-01, AM-25, AM-26, AM-30, AM-32 | Coherent production candidate with fresh production identities/state, scoped secrets, alerts, tested recovery and current production approvals; synthetic release data is never promoted in place. |
| AM-07–12 | Live AUD funding with the accepted credit/fee/total, one attributable credit, exact documents and a supported refund/adjustment. Sandbox webhook fault/replay proof remains required. |
| AM-14–18 | Supported Provider supply and exact Quotes on Base Sepolia and Base mainnet; asset, network, recipient, amount, authority and material drift checks remain enforced. |
| AM-19–24 | Actual paid x402 delivery on both networks, distinct AUD and USDC records, fresh-process continuation, once-only effects and supported recovery. Retain network, asset, transaction hash, Call/Quote and ledger references. |
| AM-02–06, AM-27–29, AM-31–32 | Customer/Provider activation, installed-client use, truthful UI/help, telemetry and finite cold journeys on the release candidate; no unresolved launch-blocking defect. |

Before real-value actions, record Joel's financial exposure limits and the exact
target/recovery boundary. Close the legal, AML/CTF, tax, banking and infrastructure
prerequisites in START_LINE.md and aws-foundation.md through attributable evidence
and the necessary human decisions. Do not fabricate approvals or bypass controls.

### Launch execution controls and deployment package

The authorized campaign ceilings are **A$25 cumulative live funding including
fees and tax**, **USDC 5 cumulative Provider payments across networks where the
asset has real value**, and **0.001 ETH cumulative mainnet gas**. There is no
automatic replenishment or limit increase. Accepted obligations and uncertain
submissions consume the remaining cap until reconciled; refunds do not
automatically restore it. Each effect requires exact pre-effect readback of the
environment, chain, asset, recipient, Tool, Quote, Call, amount and recovery
reference. These are launch-execution controls, not a product budget feature,
and the existing USD 400 monthly AWS ceiling is unchanged.

The production deployment package remains **NOT VERIFIED**. It must carry
attributable approval evidence for the AFSL/non-cash-payment and purchased-
payment-facility position; AML/CTF stored-value, remittance and virtual-asset
position; GST, tax-invoice, adjustment and service-fee treatment; and operating-
account, safeguarding or client-money treatment. It must also satisfy the
production gate in [aws-foundation.md](aws-foundation.md), including fresh
production state and identities, target/recovery evidence and unresolved
infrastructure blockers. Launch authorization is not approval evidence.

### LP-3/LP-4 deployment prerequisite inventory — 21 September 2026

This is read-only preparation, not LP-2 activation/freeze, LP-3 deployment or
LP-4 activation. The dated [deployment registry](deployment-registry.yaml) is
historical evidence; its synthetic `package4-release` identities and fixture
ledger cannot be promoted. Current provider readback must match the eventual
LP-2 target manifest before any mutation or value-bearing effect.

| Prerequisite | Exact evidence available now | Access/readback | Status and decisive next action |
| --- | --- | --- | --- |
| Hosted-alpha web artifact | Public `https://app.aecon.ai`; recorded Vercel project `agentic-economy` / `prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`. Fresh public reads returned health **200**, readiness **200** (`config`/`convex` ready) and release revision `ce68a15f5c006f068c9493135f3cfb0e52b86e02`; commercial readback was catalogue `absent`, quoting `unavailable`, sellable `false`. | Public read **YES**. Exact current Vercel deployment ID and operator CLI access **UNKNOWN**; no Vercel CLI is installed in this checkout. | **PARTIAL / STALE ARTIFACT.** LP-2 release owner freezes the candidate and intended deployment ID; LP-3 operator then proves alias, build SHA and rollback deployment match it. |
| Hosted-alpha backend and identity | Latest repository evidence names hosted-alpha Convex `cautious-zebra-473` and production Clerk instance `ins_3JEJtsKq3rdCZG94s6tAkkut9Y7` at `clerk.aecon.ai`. The public readiness probe establishes a reachable backend, not its identifier or authenticated identity path. | Exact Convex `function-spec` read **NO** from this worktree (`selected project` access refused). Clerk operator/readback **UNKNOWN**. | **NOT VERIFIED for LP-3.** Release owner resolves current Vercel→Convex and Vercel→Clerk IDs, access owners and deployed revision after LP-2 freeze; Luna then checks authenticated cold journeys. |
| Sandbox funding | Stripe sandbox account `acct_1Tlni770N4UjLqHt` is the recorded funding provider. | Official Stripe CLI identity read **YES** for the named sandbox account and current Super Administrator session; no key value was read. | **ACCESS PRESENT / JOURNEY OPEN.** LP-3 operator binds only the frozen candidate's restricted sandbox credentials/destinations and proves one attributable funding journey, replay and recovery. |
| Hosted-alpha ledger and Base Sepolia custody | `package4-release` Formance ledger `agentic-economy-release`, AWS host/database and Cloudflare edge are synthetic fixture-only evidence. The latest hosted-alpha handoff explicitly leaves an isolated alpha ledger, Stripe binding and x402 integration incomplete. No current CDP account/policy, exact Sepolia RPC pair or ledger binding was read. | Formance, Cloudflare and CDP access **UNKNOWN**. Historical synthetic stack availability is not current access proof. | **LP-3 BLOCKER.** Infrastructure owner selects an isolated alpha ledger and exact Sepolia custody/RPC/provider identities in the LP-2 manifest, proves access/readiness and records rollback; never reuse the fixture ledger as customer authority. |
| Production AWS/Formance/Cloudflare foundation | Source declares AWS account `197716152388`, Sydney `ap-southeast-2`, Melbourne `ap-southeast-4`, environment `ae-production`, Formance `formance.aecon.ai` / ledger `agentic-economy-production`. Repository and last accepted records describe the production root as declaration-only; source defaults `foundation_gates_passed=false`, and the example Cloudflare IDs/source SHA remain placeholders. These are not live-state proof. | AWS current access **NO**: the named `package4-release-deployer` session is expired. Cloudflare/Formance production access and current live resource presence are **UNKNOWN**. | **NOT VERIFIED / LIVE PRESENCE UNKNOWN.** Named operator renews MFA-backed AWS access when bounded preflight is scheduled, runs current identity/foundation/drift readback, and supplies exact Cloudflare IDs. Infrastructure mutation waits for accepted LP-3 exit and active LP-4. |
| Production application, identity, funding and custody targets | No frozen standard-mode Vercel deployment, Convex deployment, Stripe live account/destinations, production x402 custody account/policies/RPC pair or final Clerk binding exists in an accepted target manifest. The existing production Clerk instance is hosted-alpha evidence only until the manifest explicitly selects it. | Provider access **UNKNOWN** except the sandbox Stripe context above. | **LP-4 BLOCKER.** LP-2 release owner names each exact production identity and rollback source; LP-4 operator creates/binds only fresh accepted targets and proves cross-provider identity alignment. No synthetic state is promoted. |
| Secret custody | Registry evidence says the historical Infisical login found only an example project; approved platform/customer projects, environments, non-root paths and workload identities were not established. | Infisical CLI installed; current approved-scope identity/access **UNKNOWN**. | **LP-4 BLOCKER.** Access owner establishes and reads back the two approved scopes and Vercel trust bindings, then proves create/use/rotate/revoke/delete without exposing values (AM-25). |
| Recovery, alerts and rollback | Historical synthetic AWS evidence includes alerts/backups, but the retained restore missed the ≤300-second RPO by eight seconds. No accepted production recovery proof exists; current production resource presence is unknown until authenticated readback. | Current AWS readback unavailable because the session expired. | **LP-4 BLOCKER.** Infrastructure owner proves current alert delivery, cost/audit controls, unexplained-drift absence, ≤300-second RPO and rollback against the exact production target; Luna verifies references and outcomes. |

| Human-owned production decision | Evidence status and location | Decisive next action / owner |
| --- | --- | --- |
| AFSL, non-cash-payment and purchased-payment-facility position | **NOT VERIFIED.** `START_LINE.md` and the [regulatory perimeter](../../research/PACKAGE-4-AUSTRALIAN-PREPAID-LEDGER-REGULATORY-PERIMETER.md) state questions and requested advice, not an approval. No approver, scoped decision, conditions, evidence reference and effective date were found. | Joel obtains an attributable written decision from Australian financial-services counsel and records its exact product/contract/fund-flow scope and conditions. |
| AML/CTF stored value, remittance and virtual-asset position | **NOT VERIFIED.** The regulatory perimeter recommends specialist advice and conditional controls; it is not adviser approval. | Joel obtains attributable AML/CTF specialist advice for the exact AUD balance and corporate-USDC x402 flow, including any registration/program/limit conditions. |
| GST, tax invoice, adjustment and service-fee treatment | **NOT VERIFIED.** The research record requests a tax memorandum and leaves classification/timing open. | Joel obtains an attributable Australian tax-adviser decision with effective date and required policy/document treatment. |
| Operating account, safeguarding and client-money treatment | **NOT VERIFIED.** Source records the classification question; no bank/counsel approval or selected production account evidence was found. | Joel obtains the attributable banking/legal decision, then the LP-4 operator reads back the exact account/custody arrangement required by that decision. |

LP-4 remains dependency-blocked until these records and infrastructure proofs
exist. Joel has already authorised production activation after the recorded
prerequisites, exposure controls and exact-target gates pass; this inventory
does not add another blanket activation approval.

## Governing launch-control register

This is the sole launch process. Packages are finite acceptance units mapped to
the existing AM rows; they do not replace, waive or multiply those obligations.
Only the manager changes package status, accepts an exit or changes dependency
order. Only one implementation package may be active.

| Package | Existing AM parents | Dependency and order | Owner role | Initial status and evidence level | Exact acceptance and package exit |
| --- | --- | --- | --- | --- | --- |
| LP-0 Candidate baseline reconciliation | AM-01–32 | First | Manager assigns; Luna gathers bounded evidence; worker maps source | **ACCEPTED — 20 September 2026, candidate `0fafd075d90fbc552ed5faef13d30953705c22be`** | Every AM row has current source ownership, attributable existing proof, proof freshness and finite missing source/hosted conditions. This accepted map is not repaired code or a readiness claim. |
| LP-1 Bounded source repairs | Only AM parents with an LP-0 source defect or bounded source unknown; AM-14 production-owner and AM-14/18–20 local source packages are accepted; AM-14-B awaits user schema-scope approval; AM-27 source inventory is reviewed with hosted cold journeys open; AM-29 deletion enforcement design awaits user schema approval | LP-0 accepted; one repair/proof package at a time in dependency order | Sol implements one bounded package; separate Luna reviews; manager accepts | **ACTIVE — AM-29 deletion enforcement approval pending** | Each accepted source defect meets its full semantic contract through observable inputs/outputs and focused failure/retry/concurrency evidence. Every repair has independent review. Exit when no mapped release-blocking source defect remains; hosted proof stays open. |
| LP-2 Integrated candidate, gates and review | AM-01–32, with direct emphasis AM-01, AM-25–32 | LP-1 exit | Sol integrates/configures; Luna reviews candidate; manager freezes revision and artifacts | **PLANNED — no coherent frozen candidate evidence** | Freeze the source revision, build artifacts and intended exact target manifest; local/CI checks pass; secrets, telemetry, support, recovery and release gates are reviewed; no unresolved release-blocking integration defect. Exit is one reviewed artifact/evidence manifest with intended targets and rollback source. |
| LP-3 Deployed qualification and Base Sepolia | AM-02–24, AM-26–32 | LP-2 frozen artifacts and target manifest | Sol executes bounded deployment/repair; Luna runs finite hosted evidence; manager accepts | **PLANNED — source/sandbox history only, no current complete deployed journey** | Deployed web, backend and integration identities align with the LP-2 manifest. Fresh Customer/Agent and Provider journeys complete with sandbox AUD funding and an actual paid Base Sepolia buyer Call, usable output, exact records, duplicate/interruption/recovery checks and installed-client continuation. Provider validation cannot substitute for buyer purchase. Exit retains exact deployment/run/transaction/recovery references. |
| LP-4 Production activation prerequisites | AM-01, AM-07–12, AM-18–20, AM-25–26, AM-30–32 | LP-2 frozen artifacts permit read-only preflight and adviser evidence gathering alongside LP-3; every infrastructure mutation and activation waits for manager-accepted LP-3 exit and LP-4 active status | Named human approvers decide commercial perimeter; Sol handles bounded infrastructure only while LP-4 is active; Luna verifies readback; manager accepts | **DEPENDENCY BLOCKED / NOT VERIFIED — required legal, AML/CTF, tax, banking and infrastructure evidence not supplied** | Attributable decisions and conditions are recorded; production identities/state align with the intended manifest and are fresh; AWS/Cloudflare/Convex/Vercel/Stripe/Formance/Infisical targets and recovery are exact; alerts and rollback work; synthetic state is not promoted. Exit occurs when the manager confirms all prerequisite gates are evidenced under the existing launch authorization, not from configuration presence alone. |
| LP-5 Controlled live AUD and Base mainnet | AM-07–12, AM-18–24, AM-30–32 | LP-3 and LP-4 exits | Sol executes one bounded live run; Luna observes/reconciles; manager controls remaining cap and accepts | **DEPENDENCY BLOCKED — real-value effects forbidden until prerequisites pass** | Within cumulative A$25/USDC 5/0.001 ETH ceilings, live funding posts once and one real mainnet buyer Call yields usable delivery, separate AUD/USDC facts, transaction hash, exact documents and supported recovery/refund or adjustment evidence. Accepted/uncertain effects consume cap until reconciled. Exit leaves no unknown financial outcome. |
| LP-6 Final cold journeys and launch closeout | AM-01–32 plus the Base mainnet extension | LP-5 exit | Luna executes finite cold journeys; Sol only receives bounded defects; separate Luna rechecks; manager decides launch | **PLANNED — cannot begin from historical source totals** | All 32 original contracts and expanded production scope have fresh applicable proof; every supported surface has truthful success/failure/recovery and cross-client parity; blockers are closed and nonblockers dispositioned. Exit is the manager's evidence-backed launch decision and retained rollback/support handoff. |

### Definition of Done and end conditions

The goal is complete only when LP-0 through LP-6 have manager-accepted exits,
all 32 AM contracts and the mainnet extension meet their stated acceptance, the
production deployment package is verified, no financial outcome is unknown and
the frozen candidate has rollback, support and attributable evidence. Source
labels, test totals, configuration values, a free Call, Provider validation or
one happy-path transaction cannot establish completion.

A package ends when its table exit is evidenced and separately reviewed. If the
manager records it blocked, the exact unmet dependency, evidence sought and next
action remain active and the queue does not advance. Only verified launch criteria
complete the goal. A no-go decision halts affected release effects and records the
next action; the goal remains incomplete unless Joel explicitly cancels or pauses
it, or the host's blocked rules apply.

### Findings, uncertainty and evidence freshness

Attach every new finding to an existing AM parent and classify it **release
blocker**, **nonblocker** or **unknown**. Record the next diagnostic evidence.
Do not switch the active package unless the finding changes a dependency and the
manager records the reason. A relevant code, configuration, target or approval
change invalidates only the proofs it affects; it does not restart unrelated
audits.

For an unknown, record: factual question; why it changes acceptance; evidence
sought; owner; next action; and dependent packages held. Unknown is neither a
pass nor a fabricated blocker. Resolve it by readback or the smallest diagnostic
before proposing repair.

### Access, approvals, escalation and rollback

Workers receive only the access and exact targets required by the active package.
Professional legal/AML/CTF, tax and banking decisions remain human-owned. Joel's
launch authorization already permits production activation once the recorded
prerequisites, exposure controls and exact-target gates pass; do not add another
blanket approval stop. Missing access or prerequisite evidence, and any genuinely
new out-of-scope risk, is escalated to the manager with the blocked effect and
evidence required; it is never bypassed. Before deployment or real value, record
the prior revision/configuration, exact rollback action, authorised operator and
post-rollback readback. On target mismatch, isolation failure, duplicate-risk or
uncertain submission, stop new effects, preserve durable references and reconcile
or roll back only the reversible deployment layer; never erase economic evidence.

### Current working set and decision log

1. **Accepted:** LP-0 — the AM-01–32 map for candidate
   `0fafd075d90fbc552ed5faef13d30953705c22be` passed separate Luna and manager review.
2. **Accepted local source package:** LP-1/AM-14/18–20 standard-mode production
   Quote/Call path and mainnet material-drift refusals. This does not complete
   those AM rows or LP-1.
3. **Accepted local source package:** AM-14 production-owner admission, explicit
   production platform funding rotation and causal mainnet canary/Quote proof.
4. **Active preparation:** the reviewed four-commit route dependency is merged
   into the isolated launch candidate; focused route checks pass and the source
   gate is pending. This prepares LP-2 but does not activate or complete it.
5. **Held:** AM-14-B delegated-Agent validation and AM-29.1 personal-login
   deletion enforcement await user approval for their prepared schema scopes;
   later LP-1 items and LP-2–LP-6 remain planned or dependency-blocked.

Current AM-14/18–20 finding: a supported facilitator-discovered production Tool
reaches standard-mode Quote, Call admission, confirmed mainnet-USDC settlement
and exact replay with distinct AUD/USDC amounts. Preauthorization refusals now
carry explicit no-authorization/no-submission evidence; the brokered worker
releases only after an exact durable-attempt lookup returns null. Lookup failure
retains reconciliation; an existing attempt follows the original observation/
reconciliation path, including legitimate recorded pre-submit release; a crossed
submission fence refuses release and retains reconciliation. The bounded source
package passed independent review; it is not hosted or live-mainnet proof.

Decision log: **20 September 2026** — launch goal expanded from sandbox/source
closure to Base Sepolia plus controlled Base mainnet; cumulative campaign limits
set to A$25 including fees/tax, USDC 5 and 0.001 ETH, without auto-replenishment.
The production approval package remains NOT VERIFIED. The manager accepted this
launch-control process after independent Luna review; that acceptance completes
the process package only and does not complete any AM row. The manager separately
accepted LP-0 on 20 September after Luna reviewed the complete AM-01–32 map and
the corrected standard/hosted-alpha and AM-27 sequencing boundaries. The reviewed
scope is source candidate `0fafd075d90fbc552ed5faef13d30953705c22be` plus
these launch-control documents; the launch goal remains incomplete.

The manager accepted AM-14-A on 20 September after Luna PASS; parent AM-14 stays
open. AM-14-A diagnosis: the owner readiness gate was correct once the probe compared
the stored USDC source obligation in the asset denomination, separately from
the route's USD metadata. The other source defect was command identity: the
owner action rewrote an omitted signed input to `{}`, so the nested mutation
rejected the changed digest. The repair preserves omission exactly. Neither
change establishes delegated-Agent validation or a real hosted payment.

**21 September 2026** — the manager held AM-14-B before source edits because
delegated reconstruction needs a distinct persisted expiry for the short-lived
x402 seller claim; reusing provider-connection authority expiry would wrongly
expire long-lived supply. Existing replay/audit stores hashes and command
identities, not the verified claim expiry, and the redacted audit cannot recover
it truthfully. The schema decision is pending. AM-24 then ran as the
one active independent package so work did not switch mid-package.

**21 September 2026** — Luna PASS and manager acceptance closed the AM-24 local
source package after the paid pre-claim, uncertain and terminal parity cases and
the complete 16/16 Workpool file passed. This does not establish hosted Sepolia,
production/mainnet parity or overall launch readiness.

**21 September 2026** — Luna PASS and manager acceptance closed the bounded
AM-14/18–20 local source package. The full Workpool file passed 19/19; focused
x402 transport/worker tests passed 74/74; TypeScript, scoped lint and diff checks
passed. External Provider, custody, RPC and payment effects remain mocked and
Formance is a local simulator. AM-14-B, hosted
Sepolia and real mainnet value remain open.

**21 September 2026 — accepted local source package:** the bounded AM-14 production-owner
package stages the exact Base-mainnet profile, requires an explicitly
provisioned short-lived production platform grant, runs one mocked-external
mainnet canary through the real worker, promotes the Tool and issues an AUD Quote
bound to its exact USDC obligation. Initial and successor issuance races converge
on one active generation for both live rotation and expired renewal; replay,
stale-dispatch refusal,
two-RPC readiness, cross-environment custody policy refusal and empty buyer-ledger
validation passed Luna and manager review. The shared Workpool regression remains
19/19. This is not hosted proof or
real-value evidence.

**21 September 2026 — candidate preparation, not LP-2 activation:** the manager
included the exact current authoritative root `PRODUCT.md` and `AGENTS.md` in
this isolated worktree. The charter adds the six core buyer/Provider market
journeys and keeps managed x402 as the entry release rather than the product's
limit. The process instructions require product and architecture assessments to
ground priorities in those journeys, treat Jev delivery verification as a minor
supporting use case, and keep governance controls from replacing the product
purpose. The copied file digests are `PRODUCT.md`
`c100ffb7dd2260238854dacb62e3dcd9241900932d305ed56e8e3ce998d78b19` and
`AGENTS.md` `e868936f6b01eac75d6cfe7add2e86b5e465a0b4b4079051372bfc041c12c7f3`.
These two reviewed document edits are included despite being dirty in
the shared root because they are authoritative corrections; no other dirty root
file was copied.

Dirty experimental Jev, discovery reranking, chat changes and their dependent
generated spillover remain excluded. Unrelated governance, research and history
remain context rather than launch proof. Luna's bounded review recommended, and
the manager accepted, inclusion of four committed local `main` refactors as one
coherent launch-supported route dependency:
`176385637` (thin eight public/operator page routes), `aa0cbba72` (thin Tool
detail routes), `b25e89e80` (thin public Business route) and `52df868b0` (thin
funding return route). The accepted synchronization used local `main` pinned at
`52df868b05a883f33f1e407c27841a114a7fd75b` and observed 182 commits ahead of
local `origin/main`; this records local repository state and does not claim
remote publication. The exact four commits were merged without conflict after
the authoritative document sync `e9e212a39422906a31809e8681ad9ee026d9569c`.
The resulting isolated candidate is merge revision
`be7e7aead759c398addb9a64f01613149c4b3529`; no moving or dirty shared-root
source was copied. Focused authentication, market, Tool, Business, onboarding,
funding-return, status, support and legal route checks pass 104/104. These route
refactors reduce page-entry coupling across Customer acquisition and Provider
distribution while retaining their observable route contracts. This remains
reviewed candidate preparation only. LP-2 remains planned: no candidate
revision/artifact/target manifest is frozen, no package exit is accepted and no
pending schema approval is implied.

The shared-root validation previously observed seven Jev/reranker failures amid
dirty experimental work. They are neither copied nor waived. The eventual
integrated candidate must pass its applicable gates; any recurrence on that
candidate requires diagnosis against its exact revision rather than attribution
to excluded root work.

**Current integrated-candidate gate receipt — 21 September 2026.** The required
gate on merge candidate `be7e7aead` passed deployment manifest checks, **480**
conformance cases, **55** chat-conformance cases, anonymous Convex codegen,
release integrity, architecture, lint, zero-ceiling dependency checks,
typecheck, **598 files / 5,959 unit tests**, **159 files / 1,816 integration
tests** plus one skipped file, and all four type tests. The accepted finite
repairs preserve authenticated `POST tool.procure`; canonical OpenAPI/HTTP/MCP/
chat inventory and hostile-input behavior; matching production canary replay and
cross-environment refusal; and the real Workflow/Workpool lifecycle. Their
focused receipts are **111/111 in nine files**, **3/3** Workflow lifecycle cases
and **19/19** integration-repair cases.

The import-boundary follow-up is also accepted: the exact procurement entry and
consumer declarations, two white-box test pairs, Formance Node-action fence and
pure capability-supply import pass **16/16** focused boundary cases. The only
remaining tool-surface/import-stage blocker is substantive `tool.procure` CLI and
durable recovery behavior; the supported payment capability was not removed to
make the inventory green. Independent suffix diagnostics passed TypeScript
standards (**1/1**), SEO (**28/28**), UI contracts (**2/2**), packaged CLI and
production build. These individually successful suffix checks do not constitute
one passing final gate.

The worktree's shared-root `node_modules` symlink caused Vite to resolve existing
React Start/Nitro runtime files outside the candidate and fail before Playwright.
Replacing only that symlink with `npm ci` from the unchanged lock made Vite start
normally; no package or version changed. The first real browser execution then
reported **28 passed, 8 authenticated skipped and 4 failed**: two compact tests
assumed the intentionally hidden desktop `Primary` navigation, and schema checks
could not authenticate the public-read limiter without a running selected local
Convex runtime. The viewport-aware compact repair keyboard-opens the labelled
public menu, proves the `Public navigation` landmark/link and focus restoration,
while retaining the wide `Primary` assertions; its focused compact/wide suite
passes **8/8**. A fresh candidate-local anonymous Convex deployment then supplied
the real public-read limiter and source-write/server-function secrets from
ignored local files without seeding or bypass. The focused developer-discovery
schema/examples check passed **4/4**; the full browser suite passed **32/32**
public cases with **8** authenticated cases skipped, and the accessibility suite
passed **18/18**. The loopback backend and browser servers were stopped after
the run. This proves candidate-local public behavior only: keyless Clerk,
unseeded degraded market reads and skipped authentication are not hosted or
authenticated evidence.

This is a current candidate defect/evidence receipt, not a passing full gate,
hosted proof, frozen LP-2 artifact or release acceptance. AM-14-B delegated-Agent
claim-expiry storage and AM-29.1 deletion-command storage remain held for user
schema approval. The AM-24/25 `tool.procure` storage/public-contract proposal
below is also held; none of those held designs has been implemented.

#### AM-24/25 durable `tool.procure` repair proposal — approval held

The integrated gate confirmed that `tool.procure` advertises CLI support without
an adapter. Its production engine also creates a random Call key, loses the
durable Call reference for nonterminal results, maps uncertainty to
`no_matching_tool`, and claims an immediate refund from Provider refusal codes
without authoritative money evidence. It also synthesizes GST with
`calculateAudGstSplit(total, 1000)`, fixed `jevDecisionsCostAud`, fixed
adjudicator confidence and refund copy. Those are not Quote or Call facts and
must not appear as authoritative purchase evidence.

**Proposed contract.** Requires an authenticated current caller and a stable
caller-supplied `idempotencyKey` at every HTTP, MCP, chat and CLI adapter before
search, Quote or purchase effects. The canonical request binds normalized need,
maximum spend and simulation input to an immutable admitted authority binding.
Ensures one durable procurement reference, one frozen selected Quote and at most
one Call for that request. Before the Quote is atomically frozen, a fenced retry
may reselect because no purchase exists; after the freeze, catalog change,
retry, concurrency or response loss can never reroute the intent. Supported
successor-Credential recovery must freshly prove the same Account, Principal,
application and environment through the stored grant lineage without rewriting
the original binding. Money and audit fields come only from persisted
Quote/Call/receipt evidence. On conflict or stale/unrelated authority, return a
structured refusal without a new Quote, Call, reservation or payment.

The public result becomes a phase-discriminated union so references are required
only after they exist:

- `pending/selection_or_quote`: `procurementRef`, `retryAfterMs`; no invented
  Quote or Call reference.
- `pending/quoted`: `procurementRef`, `quoteRef`, `retryAfterMs`; no Call
  reference before reservation.
- `pending/call`: `procurementRef`, `quoteRef`, `callRef`, `retryAfterMs`.
- `needs_authority/quote`: the exact Quote refusal requirements/continuation and
  no required Call reference; `needs_authority/call`: the frozen Quote, Call and
  exact authority request.
- `outcome_unknown`: the same procurement, Quote and Call references plus the
  existing reconciliation evidence and any persisted receipt.
- terminal delivered/remedied: the same three references and authoritative
  output/receipt facts. `price`, tax, refund and audit fields are present only
  when the Quote/Call/receipt records establish them.
- structured `refused` distinguishes pre-effect selection/Quote refusal from a
  Call refusal and carries retryability and the supported continuation. A
  Provider refusal alone never asserts release or `A$0.00`; only authoritative
  settlement/refund evidence does.

The smallest storage change reuses `operationKeys` under a `toolProcure`
namespace and adds two optional fields, leaving existing rows and indexes
compatible:

- `claimGeneration: number` fences each bounded lease/reclaim.
- `authorityBinding: { actorKind, accountRef, principalRef, applicationRef,
  environment, originalCredentialRef, originalGrantRef,
  originalGrantGeneration, lineageDigest, bindingDigest }` records the typed,
  immutable admitted identity and lineage. The digests authenticate the
  canonical material; they do not replace its recoverable typed fields.

`requestHash` covers the normalized business request and stored
`authorityBinding.bindingDigest`; `effectRefs` retain the Quote then Call. Every
claim/replay runs the existing current-authority resolver. It accepts the
original current authority or a valid successor only when verified lineage
reaches the stored original grant family with the same Account, Principal,
application and environment; it never rewrites `authorityBinding`.

Before a Quote exists, `claimGeneration` and `retryAfter` permit one successor
worker to reselect while a stale generation cannot freeze anything. Quote
issuance verifies that generation and binding and appends the selected Quote in
the same mutation. A crash immediately before that mutation leaves no purchase;
a crash immediately after it is recovered from the frozen `quoteRef` and can
never reselect. Call reservation uses a deterministic key and appends the Call
in its admission transaction; concurrent or response-lost retries recover the
same Call. Accepted or uncertain intents do not expire, reopen or disappear
before their Call/financial retention boundary. Definite pre-effect failures
may be reclaimed under a new generation; accepted effects never are.

The CLI adds `procure --input <json> --idempotency-key <key> [--wait]`, retains
the exact request/key before HTTP, and replays that intent after transport loss.
Once a Call reference exists it uses the existing status/wait/cancel/reconcile
surfaces; no new recovery endpoint or dependency is proposed. Acceptance covers
concurrent first claim and reclaim, process loss on both sides of Quote freeze
and Call binding, exact adapter replay, conflicting input, unrelated/stale and
valid successor authority, Quote-only and Call authority requirements,
pending/unknown continuations, authoritative refund versus unproved refusal,
and terminal replay with one Quote, Call, reservation and payment maximum. This
needs user approval for the two optional storage fields and public input/result
change before implementation.

**21 September 2026 — AM-29 open launch blocker:** `readDeletionEligibility`
has focused source tests but no caller, so it does not enforce a prerequisite to
Clerk self-deletion. The Clerk `user.deleted` webhook truthfully retires the
principal after deletion but cannot prevent it. Clerk self-delete must be disabled
and read back on each deployed instance in LP-3/LP-4 until a supported
eligibility-gated final action exists. The current instance setting is NOT
VERIFIED. The user must close outstanding solely-owned scope or complete a
supported ownership transfer. Provider offboarding and financial fences apply
to scope actually being closed; a transferred Account and its Provider activity
remain with the valid successor. Retained commercial records are not erased by
identity retirement.

#### AM-27 reviewed source surface inventory

This finite inventory was reviewed on 21 September 2026. It maps maintained
source behavior and existing tests; the suites were not rerun for this docs-only
package. It does not complete AM-27: authenticated deployed desktop/compact and
keyboard cold journeys, real loading latency, focus across hosted navigation,
and observed empty/error/recovery behavior remain LP-3/LP-6 evidence.

| Supported surface | Existing source evidence | Exact remaining condition |
| --- | --- | --- |
| Market discovery, comparison and Tool detail | `tests/unit/routes/market-search.test.ts` covers guided/default/filter behavior without silently broadening invalid input; `tests/unit/market-terminal/compare.test.ts` preserves canonical comparison facts and exact continuations; `tests/unit/routes/tool-detail-route.test.tsx` keeps compact/full facts, focus and callable/setup-required/unavailable states aligned. | Cold browse → compare → inspect on deployed desktop and compact layouts, including real loading, empty and source-failure states. |
| Activation and Agent management | `tests/unit/routes/onboarding.test.tsx` covers role selection, keyboard progression, validation, failure and landing; `tests/unit/ui/assistant-install-progression.test.tsx` proves ordered connection steps and non-repeatable checking; `tests/unit/ui/agent-access-owner-console.test.tsx` covers consequential Agent controls. | Hosted sign-in/onboarding/connection with one real installed client; compact and keyboard completion with actual authentication latency and failure recovery. |
| Tool → Agent handoff and retained continuation | `tests/unit/routes/agent-access-caller-continuation.test.tsx` validates and retains `resumeTool`, preserves it across Agent selection, returns only after confirmed connection and keeps known Agents on read failure; `tests/unit/ui/assistant-install-progression.test.tsx` states setup creates no Call. Authorization/close outcomes remain truthful in `tests/unit/routes/agent-access-authorize.test.tsx`. | Hosted browser/client handoff, user close and resume from the same Tool with no lost context, duplicate connection or invented Call. |
| Funding and Call status/recovery | `tests/unit/routes/funding-return-route.test.tsx` keeps one funding session across processing/transient failure and never offers an invented new payment; `tests/unit/routes/call-status-route.test.tsx` distinguishes pending, reconciliation, cancelled and refused states, retains exact retry identity and never fabricates settlement. | Hosted funding return and interrupted paid Call on desktop/compact/keyboard, with real refresh latency and the same durable references. |
| Provider lifecycle | `tests/integration/capability-provider-offboarding.test.ts` covers routeability freeze, bounded retirement, status isolation, pre-freeze cancel and post-freeze refusal; `tests/unit/capability-supply/provider-offboarding.test.ts` covers truthful blockers and one continuation. | Authenticated deployed Provider connect/publish/withdraw/offboard journey, including compact status, action-required recovery and retained history. |
| Support | `tests/unit/routes/support-route.test.tsx` preserves a Call reference, points back to authoritative records and does not invent retry; private support remains primary. | Hosted support handoff with the exact reference and an actual response/recovery path; AM-29.1 remains a linked deletion-enforcement source blocker. |
| Security history | `tests/unit/settings/account-security-history.test.tsx` distinguishes AE/Clerk/provider observations, protects raw identifiers, preserves loaded evidence/cursor on failure and leaves vendor controls available when history is unavailable. | Authenticated hosted history pagination, security controls and failure recovery with real Clerk events. |
| Compact, keyboard and shell recovery | `tests/unit/layout/shell-a11y-focus.test.tsx`, `tests/unit/operator-shell-chrome.test.tsx`, `tests/unit/layout/keyboard-shortcuts-dialog.test.tsx`, `tests/unit/layout/operator-sidebar-collapsed-mode.test.tsx` and `tests/unit/layout/owner-primary-navigation.test.tsx` cover skip/focus targets, route-commit focus, pending/error shell retention, mobile navigation, collapsed labels and keyboard help. | Deployed viewport/keyboard/screen-reader cold traversal across each supported journey; unit shell contracts do not prove browser focus timing or usable touch layout. |

Inventory status: **SOURCE REVIEWED / AM-27 PARTIAL**. New source findings attach
to the relevant row above; evidence freshness reopens only the affected surface.

#### AM-29.1 deletion-command storage approval package

**Selected boundary.** Keep Clerk as identity deleter and the existing verified
`user.deleted` webhook as the authoritative AE retirement observation. Add one
AE-gated Settings action and one durable intent/attempt record. This removes the
unsafe gap between the tested eligibility query and Clerk deletion without
introducing the unimplemented privacy-request, exit-archive or operator-case
system described in the later lifecycle design.

**Semantic contract.** Requires an authenticated current human, Clerk strict
reverification, an exact active identity binding, and no outstanding solely-owned
scope. Each formerly owned Account must either be active under a different valid
successor, or be closed with its applicable financial fences clear and every
Provider business retired through the existing offboarding workflow. Ensures one
durable deletion intent and at most one claimed remote-delete dispatch for that
intent; Clerk acknowledgement and webhook completion remain separate facts.
Throughout admission and an unresolved remote result, the principal is
`suspended`, so existing active-principal authority checks fail while an exact
status read remains available. Identity deletion never erases commercial records
or substitutes for Account closure, ownership transfer or Provider retirement.
On stale authority, prerequisite drift or failed reverification, refuse before a
Clerk effect. A timeout, process loss after dispatch claim or ambiguous Clerk
error remains `outcome_unknown` under the same command reference and is not sent
again blindly.

**New storage requiring user confirmation.** Add
`personalAccountDeletionCommands` with fields `commandRef`, `principalRef`,
`bindingRef`, `targetRefHash`, `auditAccountRef`, `idempotencyRef`,
`commandDigest`, `prerequisiteDigest`, `evidenceRefs`, `reverificationId`,
`proofVerifiedAt`, `proofExpiresAt`, `lockedPrincipalRevision`, `state`,
`revision`, bounded `remoteAttempts` entries containing attempt reference,
user-or-operator actor, start time, disposition and observed time, and optional
`failureCode` and `completedAt`, plus `createdAt`/`updatedAt`. States are
`admitted`, `attempting`, `outcome_unknown`, `acknowledged`, `completed` and
`refused`. Indexes: `by_commandRef`, `by_principalRef_and_createdAt`,
`by_reverificationId`, and `by_state_and_updatedAt`. `commandRef` is derived
from principal plus idempotency input; Convex transaction serialization and the
principal lookup enforce one unresolved command. `auditAccountRef` supplies
retained audit attribution after closure has ended every ownership/membership;
it grants no Account access.

The application claims the initial attempt before invoking Clerk, but this is not
an exactly-once remote-delivery claim: transport retry or process loss can make
the external outcome unknowable. An expired `attempting` lease projects as
`outcome_unknown`; it is never recycled into a fresh dispatch automatically.
Any later operator attempt is separately authorized, appended and attributable;
it is not replay of the initial attempt.

**Exact source seams and reachable route.** The existing `/owner/settings` route
cannot own the final action: `requireOperatorBeforeLoad` requires canonical
Account access, and closing a workspace ends its ownership and memberships. Add
the account-neutral authenticated route `src/routes/account.delete.tsx`, guarded
only by `requireClerkServerSession`; it grants no owner/business surface. A
Settings panel in `OwnerSettingsSections.tsx` links to this route and explains
the current blocker. Its workspace-closure link uses one validated fixed return
intent, `continue=account-delete`; `_operator/owner.workspace.tsx` accepts that
enum value only, never an arbitrary return URL. `useWorkspaceDangerZone.ts`
returns to `/account/delete` after successful closure only when that explicit
personal-login deletion intent is present. Ordinary workspace closure keeps its
existing supported completion path. The route uses server functions,
not ordinary owner resolution or automatic workspace provisioning, to read
`personalAccount:readDeletionEligibility` and
`personalAccount:readCurrentDeletionStatus`; it links blockers back to
`/owner/workspace` or `/owner/operations#offboarding` while those scopes remain
active.

The POST server function in `personal-account-deletion.functions.ts` uses
existing `auth()`, `requireStrictClerkConsequenceProof()` and
`clerkClient().users.deleteUser(userId)`. Convex mutations in
`personalAccount.ts` admit/lock the command, claim its initial remote attempt, and
record acknowledgement/refusal/unknown through the existing server-function
service assertion pattern. `retirePersonalAccountForServer` matches the exact
principal/target command and advances it to `completed`; duplicate webhooks keep
the existing replay contract.

The lock uses the existing `active -> suspended -> retired` principal lifecycle,
not a new lifecycle value. Current ownership transfer already rejects a successor
whose principal is not active; organization-workspace provisioning resolves only
an active creator; interactive and owner consequence resolvers require an active
principal. The existing authenticated-identity provisioning seam must also check
the bound principal before refreshing credentials, so a suspended deletion
principal cannot regain authority. A special deletion-status query may resolve
the same active Clerk binding while the principal is suspended, but exposes no
other Account data or authority. If the Clerk session expires, the command
persists; self-service status becomes authentication-required and the retained
command reference is used for private support/reconciliation. Session expiry
does not authorize another delete attempt.

**Definite refusal and lock release.** A prerequisite or proof refusal before
admission creates no command and never suspends the principal. After admission
but before any attempt claim, an expired proof or exact local refusal transitions
the same command to `refused` and restores `principal.lifecycle` from
`suspended` to `active` in one Convex transaction only when the principal still
matches `principalRef`, kind `human`, `lockedPrincipalRevision`, and the command
is the sole unresolved command for that binding. The restore increments the
principal revision and records the refusal code. If any compare fails, retain
the suspension and surface action-required/unknown; never guess that reopening
authority is safe. Once an attempt is claimed, every thrown or transport result
is treated as possibly effected unless Clerk supplies documented definitive
no-effect evidence; the initial implementation assumes no such exception.
`attempting`, `outcome_unknown` and `acknowledged` therefore stay locked until
the exact webhook completes retirement or a separately evidenced reconciliation
is authorized. A duplicate request cannot restore an unknown or acknowledged
command.

**Unknown-outcome operational recovery.** Extend the existing admin audit
surface rather than use the public support mailbox as a deletion entry. An
admin-authorized read in `personal-account-deletion.functions.ts` returns the
exact redacted command, locked principal revision, binding/target hashes,
attempt history and current state. Its server-only branch resolves the persisted
binding to the same Clerk user and calls Clerk user readback; raw provider
identity does not enter the browser or audit payload. If Clerk reports the user
absent, keep the command locked and await the genuine verified `user.deleted`
delivery; an authentic provider replay may complete the same command. Never
synthesize a webhook or retirement observation from the readback. If Clerk
reports the exact user still present, an authorized admin may explicitly request
one same-target completion: Convex first revalidates the original admitted
eligibility digest, suspended-principal revision, binding target, unresolved
state and admin authority, then appends a distinct operator attempt before the
server invokes Clerk. Any resulting genuine webhook completes the intent. A
failed or ambiguous read/completion remains unknown and cannot unlock authority
or trigger an automatic resend.

This recovers an already admitted, locked command; it differs from the rejected
support-email path for starting deletion without enforcement. Clerk documents
Dashboard/API user inspection and deletion, but this production instance's
operator access and Clerk/Svix event readback or authentic replay are unproved.
LP-3 must demonstrate those hosted controls and the new admin source seam;
otherwise unknown-outcome recovery remains NOT VERIFIED and AM-29 cannot close.

**Observable acceptance.** Focused tests must show: active ownership, incomplete
Provider retirement, financial fences, stale revisions and stale proof produce
no Clerk call; a transferred Account remains active under its successor and does
not block the former owner; every actually closed Account has retired Providers;
same-input replay and concurrent requests produce one intent and one claimed
attempt, while changed input conflicts; principal suspension blocks ownership,
provisioning and ordinary authority yet permits the exact status read; Clerk
acknowledgement remains pending until webhook completion; timeout, lookup failure
and process-loss simulation retain `outcome_unknown` and never auto-resend;
process loss after the initial claim is recoverable by exact admin inspection:
absent identity waits for authentic webhook delivery/replay, while present
identity permits only a newly authorized same-target operator attempt;
duplicate webhook delivery converges on one completed command; retirement retains
Calls, obligations, receipts and audit evidence. Route tests must additionally
prove `/account/delete` remains reachable with a valid Clerk session and no
active Account, `/owner/settings` is not used as the post-closure boundary, the
fixed deletion return intent resumes `/account/delete`, an absent/invalid intent
cannot redirect ordinary closure, an exact pre-attempt refusal restores only the
matching suspended revision, and revision drift/unknown/acknowledged states
never restore authority. LP-3 and
LP-4 separately require
deployed-instance readback that Clerk self-delete is OFF. No external setting is
changed by this source package.

**Complexity decision.** Keep the single command table because an external
destructive effect cannot be recovered truthfully from the current query and
post-effect webhook alone. Reject advisory-only UI and direct Clerk deletion;
they do not enforce prerequisites. Reject the support-mail operator path because
the current route has no verified request, durable case or status. Reject the
larger future privacy/exit-archive subsystem because AM-29 does not require
inventing it for this alpha. The cost is one table, one user application server
action, narrow user/admin Convex command/status seams, one account-neutral
authenticated route, a bounded panel on the existing admin audit surface and the
existing webhook reconciliation; no public versioned API, dependency or
additional external service is added.

## LP-0 current-candidate evidence map

Source candidate: `0fafd075d90fbc552ed5faef13d30953705c22be` plus the
uncommitted launch-control documents in this package. **Current proof** means the
supplied 20 September focused run passed 6 files / 73 tests. **Accepted claim**
means the existing row cites a prior focused pass and current proof path, but it
was not rerun for LP-0. **Retained hosted evidence** remains usable only while its
named target and relevant behavior are unchanged.

| AM | Current source/evidence classification | Exact remaining condition or bounded next diagnostic |
| --- | --- | --- |
| AM-01 | Hosted-only claim; registry already records web/backend revision mismatch | LP-2 freezes manifest; LP-3 proves qualification identities/fences and dependency failure; LP-4 proves production identities and activation gates. |
| AM-02 | Accepted source claim: auth redirect, unique provisioning and stable Account contracts in release design | Hosted invite/Google flow, sign-out/session expiry, interrupted return and concurrent first provisioning against LP-3 deployment. |
| AM-03 | Accepted source claim plus retained signed-webhook/replay record | Confirm target/fingerprint unchanged in LP-2; otherwise send one signed duplicate and read one Account-scoped history row in LP-3. |
| AM-04 | Accepted source claim: named-resource owner/Agent/admin isolation tests | LP-3 two-Account positive/negative direct-route and storage readback; public Tool discovery remains public. |
| AM-05 | Accepted source claim including installed CLI connection/Quote cases | LP-3 hosted approval, credential propagation, expired/reconnect and installed-client return to the correct Account/Quote. |
| AM-06 | Accepted source claim: replacement/revocation, stable Principal capacity and retained history | LP-3 simultaneous old/new clients and revoked-call refusal; LP-4 verifies production scheduling and provider cleanup readback. |
| AM-07 | Accepted source claim: exact principal/fee/tax/total, stale-policy refusal and explicit requote | LP-3 sandbox display/Checkout; LP-5 live display and charge within cumulative cap. |
| AM-08 | Accepted source claim plus retained A$10.55→A$10 sandbox receipt | LP-3 fresh payment/return/refresh with matching Stripe/Formance/documents; LP-5 repeats live once. |
| AM-09 | Accepted source claim: cancel/fail/expire/outcome-unknown states preserve command identity | LP-3 hosted negative returns, including settled despite failed return, with no duplicate Checkout. |
| AM-10 | Accepted source claim: duplicate/reordered Stripe events converge on one command/posting/documents | LP-3 forced sandbox duplicate/reordering/interruption; LP-5 confirms live replay protection without spending twice. |
| AM-11 | Accepted source claim: exact-unit aggregation, Account-bound document access and distinct document kinds | LP-3 hosted open/refresh/period aggregation and concealed foreign link; LP-5 exact live documents/adjustment. |
| AM-12 | Accepted source claim: one refund identity, event reordering and recoverable Formance uncertainty | LP-3 sandbox refund failure/retry; LP-5 supported live refund/adjustment with original payment retained. |
| AM-13 | Accepted source claim plus retained approved sandbox connection/draft | LP-3 fresh owner UI/CLI connection and payee-control readback; production Provider connection belongs to LP-4. |
| AM-14 | **Accepted local source proof — 21 September 2026:** the owner path stages the exact sandbox or production x402 revision, completes readiness, requests one environment-bound platform-funded canary, and keeps the Tool private until actual promotion. The production case uses explicit privileged grant provisioning, real worker/custody logic with mocked external CDP/RPC/Provider effects, then issues an exact AUD Quote for the promoted Tool's USDC obligation. Buyer usage and Provider-obligation ledgers remain empty during validation. | Delegated-Agent submission remains AM-14-B and awaits user schema-scope approval. LP-3 owes hosted Base Sepolia validation; LP-4 owes exact production provisioning/target readback; LP-5 owes real mainnet value. Hosted-alpha refusal remains correct. |
| AM-15 | Accepted source claim: never-signed, expired-signing and submitted-uncertain recovery retains one validation Call | LP-3 hosted interruption/return with same Call and no buyer reservation; repeat on approved production supply if LP-4 changes this boundary. |
| AM-16 | Accepted source claim: withdrawal/routeability freeze blocks late promotion | LP-3 hosted expiry/source/ownership/offboarding changes and retained historical Call evidence; LP-4 production gate readback. |
| AM-17 | Accepted source claim: material drift, withdrawal, republish and historical Call isolation | LP-3 full hosted lifecycle/replay; LP-4 verifies the same production state transitions after activation. |
| AM-18 | **Accepted local source proof — 21 September 2026:** Quote suite covers identity/policy/currentness/refusals and correctly refuses production while service mode is `hosted_alpha`; a focused standard-mode run issues a production Quote for an actually facilitator-discovered Base-mainnet USDC Tool after current policy/legal/custody/treasury checks. The accepted owner-production package separately reaches the same Quote boundary after real worker promotion. Wrong network/asset/payee are refused before Quote effects; changed amount is refused at Call admission. | LP-3 still owes deployed Base Sepolia Quote proof; LP-4 must provision the exact production grant and configure two distinct production RPC targets. |
| AM-19 | **Accepted local source proof — 21 September 2026:** on one backend, the actual production Quote causes one reserved Call, one mocked custody signature, unanimous mocked two-RPC mainnet receipt verification, terminal output and exact replay. The persisted Call/Quote/attempt retain production, distinct AUD 1,200 atomic and USDC 1,000 atomic, Base-mainnet asset/network and original ledger references. | External Provider, custody, RPC and payment effects remain fixtures. LP-3 owes actual paid Base Sepolia; LP-5 owes actual mainnet delivery. |
| AM-20 | **Accepted local source proof — 21 September 2026:** atomic balance/policy/treasury scarcity, stable period limits and safe pre-submission release remain green. Network/asset/payee/amount/material drift produces no signature/payment; postreservation resource drift releases the exact reservation. Definite noauthorization with null attempt releases once and replay keeps the same release refs/balance; attempt-read failure retains reconciliation, an existing attempt follows the original observation path, and a crossed fence refuses release and retains reconciliation. | LP-3/LP-5 retain hosted/live conditions. |
| AM-21 | **Current proof:** HTTP recovery suite; existing integration proof covers fresh-process Call recovery/hold/cancel | LP-3 installed-client interruption before/after possible Sepolia submission; LP-5 same-reference mainnet reconciliation with no new payment. |
| AM-22 | **Current proof:** managed-Call remedy idempotency and conflict refusal | LP-3 hosted remedy with original Call/Provider obligation; LP-5 one supported live refund/adjustment and retry. |
| AM-23 | **Current proof:** Call projection reconciles Logs/Usage/Spend/Provider obligation without phantom spend | LP-3 hosted refresh/replay and role views; LP-5 reconciles distinct AUD and mainnet USDC facts plus adjustment. |
| AM-24 | **Accepted source proof — 21 September 2026:** focused local-Formance cases carry the same paid Call through fresh installed CLI, HTTP status, MCP status and canonical chat replay before claim, after possible submission and after successful settlement. They agree on durable identity, state/continuation, exact AUD/USDC receipt and terminal output without another reservation, payment or Provider attempt. Luna PASS and manager acceptance followed a 16/16 shared Workpool run and static checks. | LP-3 proves the same supported surfaces against the deployed Base Sepolia target. Production proof remains LP-5. |
| AM-25 | Hosted-only claim: projects/trust/bindings configured | LP-3 exact Infisical create/use/rotate/revoke/delete and denial readback for qualification; LP-4 fresh production scope without copied secrets. |
| AM-26 | Accepted source claim: Account/generation isolation and resumable cleanup | LP-3 hosted cross-Account, stale-generation and failed-cleanup readback; LP-4 repeats for production identities. |
| AM-27 | **SOURCE REVIEWED / PARTIAL:** the finite inventory above maps Market/comparison/Tool, activation/Agent, retained handoff, funding/Call status, Provider lifecycle, support, security history and compact/keyboard shell evidence. No concrete additional source defect was established by this bounded inventory. | LP-3/LP-6 must run authenticated deployed desktop/compact/keyboard cold journeys with real loading, focus, empty/error and recovery behavior; source changes reopen only affected surfaces. |
| AM-28 | Hosted-only; configured destinations are not delivery proof | LP-3 resolve actual Sentry/PostHog destinations and send one non-sensitive failure/event with matching user/operator correlation reference; production alert readback in LP-4. |
| AM-29 | Partial source evidence: support route preserves Call reference; workspace closure, Provider offboarding, deletion eligibility and webhook retirement exist as separate contracts. **OPEN BLOCKER:** no caller enforces eligibility before Clerk self-delete. | Choose and prove one coherent eligibility-gated final deletion action. LP-3/LP-4 must prove Clerk self-delete disabled on each deployed instance while this blocker is open, then exercise hosted support/offboarding without erasing unresolved obligations. |
| AM-30 | Hosted-only; retired restore achieved 308s and fails current 300s RPO acceptance | LP-4 current-target restart/restore, ≤300s RPO, retained financial reconciliation and actual alert delivery; retain exact rollback evidence. |
| AM-31 | Hosted-only; finite audit protocol restored, no candidate run | LP-6 cold inventory coverage with six-turn/twelve-minute limits and explicit pass/fail/untested disposition. |
| AM-32 | Hosted-only release rollup | LP-6 trace every AM row and mainnet extension to fresh applicable evidence, release checks, no critical child defect and tested rollback/support handoff. |

Candidate-integration uncertainty: the shared root contains authorized dirty work
that is not copied here. Factual question: which root changes the manager will
integrate into the launch candidate. It affects proof freshness and the LP-2
artifact manifest. Evidence sought: manager-selected integration revision/diff;
owner: manager; next action: select after accepting LP-0; LP-2 onward are held.
This uncertainty is not a source defect and does not invalidate unrelated proof.

### Dependency-ordered LP-1 recommendation

1. AM-14 supported-entry verification; repair only if the focused journey exposes
   a defect.
2. AM-18–20 production path verification: trace standard service mode through
   Provider rollout flags and existing commercial-policy/custody gates, preserving
   correct hosted-alpha sandbox refusal. Prove configured standard-mode Quote/Call
   and mainnet network/asset/recipient/amount/drift refusal before effects;
   `package5RolloutDecision` is a supply-write/connect gate, not a buyer-call gate.
3. AM-19–24 production buyer integration verification against that existing
   gated path; repair only missing mainnet admission/recovery/projection behavior.
4. AM-27 source inventory is reviewed with hosted cold journeys open. AM-29.1
   remains the active source blocker and awaits user confirmation for its exact
   one-table storage/action scope before LP-2 freezes artifacts.

LP-0 passed separate Luna and manager review on 20 September 2026. The bounded
AM-14/18–20 local source package passed Luna and manager review on 21 September;
AM-14-B awaits user schema-scope approval and later LP-1 items remain planned.

### Record-by-record execution

Joel requires systematic closure of these release records. A record's complete
behavioral contract is the unit of work; a discovered issue, component, skill
invocation or passing test total is not a replacement work queue.

For each assigned record:

1. Read its Given/When/Then and failure/recovery conditions in full. Execute the
   matching skills and state the semantic preconditions, guarantees, invariants
   and failure behavior for the whole affected journey before implementation.
2. Map every source condition to existing implementation and attributable
   evidence first. Reuse valid evidence, including evidence already produced
   under another record. Identify the finite missing conditions; do not assume
   that an open verification label requires new code or another broad audit.
3. Implement and verify only those missing conditions, in dependency order.
   Keep newly discovered in-scope defects within that record's acceptance list.
   Put unrelated findings under their existing parent for later consideration;
   do not switch the active work to them or expand alpha scope silently.
4. Check the resulting source against the stated contracts. Close SOURCE VERIFIED
   only when all source conditions are supported. Otherwise name the exact
   unmet condition, dependency and next action. Hosted-only proof stays separate.
5. The manager integrates and accepts the record's source outcome, then advances
   to the next assigned record. Do not start a new roast, polish pass, general
   audit or cleanup loop between records. Missing paperwork does not invalidate
   correct work; establish the missing substantive evidence without restarting it.

### Bounded package protocol

The manager assigns one package with an explicit owner, files, full behavioral
contract, accepted prior evidence and finite completion checks. Consequential
implementation uses Sol; bounded evidence collection and independent review use
Luna. The worker proves the complete assigned contract and reports satisfied and
remaining conditions. A separate reviewer checks the changed result and evidence;
the manager accepts or returns a bounded repair, then alone advances the queue.
Only one implementation package is active at a time. Do not start broad repeated
audits or create a parallel status ledger.

**Current assignment: reconcile the candidate and remaining proof.** The
20 September launch instruction resumes this work. Existing claims report 26
source-verified rows and six hosted-only rows; these are historical acceptance
claims, not a fresh verification of the current checkout. Reuse attributable
evidence and inspect contrary evidence before deciding that a row needs repair.

**UX phase boundary:** address every existing finding at source first. During
this phase use the selected skills/contracts and narrow relevant source checks;
do not run Playwright, browser setup, visual/keyboard sweeps or repeated full
reviews. Record a finding as fixed in source when its source contract is met,
with browser/runtime evidence explicitly deferred. A real missing source
dependency remains blocked; deferred browser proof alone is not a source defect.
After all required source findings are complete, the manager commissions one
consolidated review of the integrated result. Repair defects found in that review
and recheck the affected behavior, without restarting open-ended audit cycles.
Deployment and hosted configuration repair then proceed under the authorized
launch goal and the deployment-operations target and recovery controls.

**Next closeout order:** reconcile source evidence and linked repairs, close
actual gaps in dependency order, verify the integrated candidate, establish
hosted/testnet proof, close production prerequisites, then prove mainnet and
launch acceptance. AM-27 retains its linked UX conditions. Already verified
behavior is not reopened without relevant contrary evidence. Reports identify
the active record, conditions satisfied/remaining and next record, not merely
files changed or tests run.

### Source and hosted status

The compact source column is independent of acceptance status. Its initial
classification is **3 SOURCE VERIFIED, 23 SOURCE GAP, 6 HOSTED ONLY**.
`SOURCE GAP (verification)` means the complete source contract still needs
attributable coverage mapping or a focused check; it is not an assertion that
an implementation defect exists. `HOSTED ONLY` means available evidence
indicates operational proof, with no new source change currently justified.
Move a gap to SOURCE VERIFIED only with evidence for the entire row's source
obligations. Never manufacture implementation work to make an operational row
look active, and never change its hosted acceptance standard.

- **VERIFIED:** the stated pass condition has attributable evidence against the
  intended hosted environment. Relevant failure checks are included where stated.
- **PARTIAL:** configuration, source tests or part of the journey is proved;
  the entire pass condition is not.
- **FAILING:** an observed failure or established missing behavior contradicts
  the pass condition.
- **NOT VERIFIED:** sufficient acceptance evidence has not been collected.

Each change, audit and defect must name an item below. Root owns integration and
closure; a worker owns only its assigned files and check. Code completion and
passing unit tests do not automatically change a row to VERIFIED. Record the
revision, environment, date, exact references and observed result before marking.
Evidence is invalidated only by relevant changes; do not repeat unrelated work.

The baseline stays at 32 items. New findings become child defects under the
appropriate item, not new milestones. A genuine change in alpha scope requires
an explicit product decision. No silent exclusions or changing acceptance to
match the implementation. A blocker identifies a concrete dependency and next
action; it is not a substitute for testing.

## Behavioral acceptance contract

The acceptance question is: **under these conditions, can the Customer and
Agent complete the promised job and recover it without guessing or manual data
repair?** Provider and operator rows establish the supporting promises; they do
not stand in for a buyer purchase. These are acceptance conditions, not new
commercial terms or claims that the behavior is already implemented.

Read each row as **Given / When → Then**, followed by its failure or recovery
check. Both columns must pass. Preconditions describe legitimate starting state;
the application must check them, not assume the user obeyed them. Invalid input,
stale authority and interruption are test conditions, not excuses for undefined
behavior. Cross-references reuse another row's proof without merging its status.

The following meanings apply throughout:

- **Usable result:** literal output for the accepted input that satisfies the
  quoted Tool output contract and is retrievable by the caller. A successful
  payment, HTTP response or background job alone is insufficient.
- **Safe continuation:** the offered action works for that actor and current
  state, carries the durable references and resumes the existing work. After
  possible dispatch, it cannot create a fresh purchase. A non-terminal machine
  response has at most one executable continuation and one optional owner
  handoff, as defined in [START_LINE.md](../../START_LINE.md#proof-contract).
- **Once:** one business effect per accepted command across retries, refreshes,
  duplicate events and concurrent attempts. This does not promise that an
  external event or network request is delivered only once.
- **Truthful status:** distinguish available/reserved/captured credit, upstream
  settlement, delivery and purchase resolution. Pending evidence remains
  pending; a timeout is not proof of failure or success. The response explains
  what is known and the permitted next step.
- **Bounded authority:** funding does not grant spending permission; a new
  credential does not reset Agent limits. Account, Agent and current policy
  remain attributable through purchase, recovery and records.

No row introduces an instant-completion guarantee, automatic refund for every
failure, live-money capability or a new support SLA. Existing supported remedies
and operating targets apply. Public discovery may show unsupported external
Tools; browsing does not confer execution support. Sandbox restrictions apply
at Quote/Call admission and before paid effects.

## Account and access

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-01 | Given the named alpha candidate, a Customer uses the app and connected Agent against the same Account, balance and Tool state; web, backend and integrations resolve to the recorded targets | Health/readiness and release identities match the recorded candidate; sandbox fences refuse live funding/mainnet execution even through direct requests. An unavailable dependency cannot produce false success | PARTIAL | HOSTED ONLY — Release owner: target/revision alignment and effective sandbox-fence proof deferred; no additional source change indicated. | Targets and health recorded in [registry](deployment-registry.yaml#hostedalphareadback); current web and backend have different source revisions. Coherent candidate and effective restrictions need verification |
| AM-02 | Given a fresh invited business user, signing up or signing in reaches the intended app page; signing out removes access and signing back in restores the correct Account context | Invalid or expired authentication and an interrupted return offer a working sign-in/recovery path; no redirect loop, lost destination or accidental second Account | PARTIAL | SOURCE VERIFIED — Shared URL-parser validation rejects external/control-character and normalized authentication self-returns; documented Clerk reciprocal fallback settings preserve the intended destination through flow switching. Current-session guard and canonical first provisioning/restoration enforce one stable Account without rewriting durable identity on sign-out. | `eaa0d7256` integrated as `4997f7072`; [AM02 contract and source evidence](alpha-release-design.md#am02-interactive-authentication-and-account-recovery). Nine-file source matrix 125/125 on candidate and main; candidate combined typecheck and integrated changed-file lint pass. Real invitation/Google challenge, cookie/session termination and hosted concurrency remain unverified. AM-04 owns broader Account isolation. |
| AM-03 | Given a bound Account, a genuine signed Clerk security event appears in that Account’s security history with its original event identity | Replaying the same event preserves one history record. Session enforcement and cross-Account isolation are separately required by AM-02/04; an event record alone does not prove them | VERIFIED | SOURCE VERIFIED — Signed/redacted webhook tests and retained event/replay evidence; preserve AM-02/04 separation. | Recorded event and duplicate-delivery readback `audit:clerk:1f0b1f8774643c66dedb9f68361d2a0963dac1a3886fe9a55cb6cc513ce11b3a`; signed delivery and persistence in registry |
| AM-04 | Given two isolated Accounts with owner, Agent and administrator test roles, each actor can access only the Tools, Calls, money, credentials and documents its role permits | Changing identifiers or calling a route directly cannot read or mutate another Account’s private resources or bypass role restrictions; publicly discoverable Tool information remains public | NOT VERIFIED | SOURCE VERIFIED — Existing canonical owner, delegated Agent, administrator and source-admission boundaries pass named-resource positive/negative checks. Private reads/mutations refuse foreign locators or role substitution; legitimate owners/Agents retain access and public discovery stays public. No new permission layer required. | `2e6929721` integrated as `349f69d0f`; missing existing private-Provider preparation prerequisite `40e5a9859` integrated as `f7499e12d`. [Full source contract and evidence](alpha-release-design.md#am04-account-and-role-isolation). All 22 changed-file cases pass on candidate and main; existing selected source-boundary16 and public-discovery1 cases pass on candidate; both combined typechecks pass. Hosted role/direct-route/storage proof remains unverified. |
| AM-05 | Given an owner with a spending policy, connecting and approving a buyer Agent lets it resume in the actual installed CLI or harness and request a Quote for the correct Account | An unapproved or expired connection offers the supported approval/reconnection path; no copied Account identifier, wallet setup or mandatory diagnostic sequence is needed to purchase | PARTIAL | SOURCE VERIFIED — Supported CLI device polling preserves its pending approval and validates the canonical Account before credential storage; installed connection → discovery → first Quote passes. Registered OAuth callbacks preserve client state on approval/denial. Malformed decisions refuse before mutation; lost responses remain unknown with same-request status recovery; confirmed expired requests offer reconnection. | `af97fd565` integrated as `29a7ddc53`, with existing pending-approval prerequisites `5820d9c45`/`584cba57f` integrated as `56ac71a76`/`f9d1c4074`. [AM05 contract and source evidence](alpha-release-design.md#am05-buyer-connection-approval-and-return). Integrated three-file 132/132 including installed CLI; candidate/main typechecks and scoped lint pass. Hosted approval/credential propagation/harness proof remains deferred. Funding/task return remains AM-09/24; arbitrary external conversation URLs require an actual supported client contract. |
| AM-06 | Given an existing Agent and history, the owner rotates its credential; the replacement acts for the same Agent with the same current limits and history. Revocation blocks new Calls through the old credential | Old and new credentials used concurrently cannot multiply capacity. Revocation preserves accepted Call history; any further effect or recovery still checks current authority | NOT VERIFIED | SOURCE VERIFIED — Existing canonical replacement/revocation, provider cleanup and stable-Principal capacity contracts hold. Active successor selection excludes cancelled history before bounding results; stale binding replay refuses; grant validation precedes inserts and new promotion checks live successor material before predecessor revocation. Completed outcome replay does not reactivate expired authority. | `349d1bbb0` integrated as `a859a1f65`; [AM06 contract and evidence](alpha-release-design.md#am06-credential-replacement-revocation-and-retained-capacity). Integrated replacement/rotation-dispatch 15/15, candidate combined typecheck and scoped lint pass. Existing canonical lifecycle/cleanup/authority checks and AM-20 native registered rotation/capacity evidence reused. Hosted simultaneous clients, Clerk cleanup and production transaction scheduling remain unverified. |

## Funding and customer records

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-07 | Given a requested AUD credit amount, the Customer sees credit, separate service fee and total before authorizing Checkout; Checkout charges the accepted total without reducing the promised credit | Invalid or expired quotes are refused with a working correction/requote path before a changed obligation is accepted; no silent price or credit substitution | PARTIAL | SOURCE VERIFIED — Exact credit/fee/tax/total precedes Checkout; invalid amounts retain correction, stale policy blocks Pay and refresh requires explicit acceptance of the new total. Canonical policy expiry and digest validation precede new obligations; accepted commands replay unchanged. | Source `542d59e0b` plus manager optional-prop test correction. Final three-file matrix 46/46 in candidate and main working tree; candidate combined typecheck and scoped lint pass. Five-minute advisory quote expiry is freshness, not payment authority; caller-supplied quote/expiry/total is refused. Checkout expiry and negative return remain AM-09. Hosted proof deferred. |
| AM-08 | Given one successful sandbox Checkout, the Customer returns to the same Account and sees the exact requested credit, supported by matching Stripe settlement and Formance posting | Refreshing the return page preserves that balance and the same document references. Browser return alone cannot authorize credit; forced delivery/reordering checks are AM-10 | VERIFIED | SOURCE VERIFIED — Exact booking/finalization tests plus the retained successful payment/return receipt cover this narrow row. | A$10.55 payment → A$10 credit; event `evt_1UF9SZ70N4UjLqHtsVtI98CB`, PaymentIntent `pi_3UF9SY70N4UjLqHt0Pfx80wX`; return refresh retained the balance and documents |
| AM-09 | Given Checkout that is cancelled, fails or expires, the Customer returns to an understandable funding state and can begin the permitted retry without repairing the Account | No confirmed settlement means no credit. If a payment did settle despite a failed browser return, show its durable status instead of inviting an unnecessary second payment | PARTIAL | SOURCE VERIFIED — Cancel, fail, expire and lost-begin return read stored command state: failed writer, expired from `providerCheckoutStatus`, succeeded wins over leftover expired. Agent and owner cancel URLs share `{CHECKOUT_SESSION_ID}` with success. `/fund/cancelled` is non-action. Owner panel starts another payment only after succeeded, failed or expired checkout; pending open sessions resume; outcome_unknown does not mint a key. Public session ids match Stripe `cs_[A-Za-z0-9_]+`. Hosted negative journeys outstanding. | Unit cases in `tests/unit/convex/money-account-funding.test.ts` (AM-09) and `tests/unit/ui/demand-console.test.tsx`. Hosted negative funding journeys outstanding |
| AM-10 | Given an accepted funding payment, duplicate or reordered Stripe events converge on the same Account credit, fee and document identities | Replay or interrupt processing before and after posting; no duplicate or missing effect, false completion or second Checkout required to repair the first | PARTIAL | SOURCE VERIFIED — Same Stripe event id before finalize, and `checkout.session.completed` / `async_payment_succeeded` in either order, converge on one `command.idempotencyKey`, one Formance ref and two documents. The second paid event id may remain `received`; command state is the credit identity. Hosted reorder proof outstanding. | Unit cases in `tests/unit/convex/money-account-funding.test.ts` (AM-10). Hosted Stripe reorder remains unverified |
| AM-11 | Given funding, captured Calls and adjustments, the authorized Customer can open funding receipts, fee documents and period documents and reconcile each line to its source record | Refresh and period aggregation include each item once; exact sub-cent values sum before document rounding. Unauthorized document links disclose nothing; unavailable documents have a truthful recovery path | PARTIAL | SOURCE VERIFIED — Statement pages sum exact units before rounding and replay once. Owner list/create/sign/URL stay Account-bound; unauthorized links return concealed-not-found. Funding receipts and fee documents issue from settlement; refund adjustments enqueue the same document worker with one source transaction. Kinds stay distinct; `tax_invoice` issuance remains policy-gated. Hosted open/aggregation outstanding. | Unit cases in `tests/unit/convex/money-documents.test.ts` (AM-11) and `tests/unit/convex/money-account-funding.test.ts`. Hosted document journeys remain unverified |
| AM-12 | Given a funding payment eligible for a supported refund/reversal, the Customer can follow its status to a single matching Stripe, Formance, balance and document adjustment | Interrupted or rejected processing retains the original payment and recoverable status; retry does not duplicate the adjustment or claim completion before evidence | PARTIAL | SOURCE VERIFIED — Same Stripe refund event id before finalize, and `refund.created` / `refund.updated` in either order, share `funding-reversal:${refundId}` and one adjustment. `refund.failed` leaves the original credit. Interrupted Formance retry (`outcome_unknown`) reuses the same booking key. Hosted sandbox refund proof outstanding. | Unit cases in `tests/unit/convex/money-account-funding.test.ts` (AM-12). Hosted Stripe refund remains unverified |

## Provider supply

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-13 | Given the controlled sandbox source, the Provider can preview it and establish an approved connection with payee-control evidence; returning through owner UI/CLI finds the saved connection and draft | Setup completion does not claim that the Tool is published or buyer-ready; publication is AM-14 and stale or invalid authority is AM-16 | VERIFIED | SOURCE VERIFIED — Owner connection onboarding/proof/refresh tests and retained UI/CLI connection evidence cover this narrow row. | Approved `Agentic Economy Sandbox Tools` business and persisted x402 connection/payee claim in cutover evidence; retained draft exists |
| AM-14 | Given an approved current draft and connection, the owner or delegated Agent submits through the supported entry point; one bounded platform-funded validation returns contract-valid output and makes that version available for supported sandbox Quotes and Calls | Submission shows progress on the same Tool; setup or validation failure explains the blocker and safe next action. No buyer balance funds Provider validation; interruption/continuation is AM-15 | PARTIAL | AM-14-A and the production-owner extension are ACCEPTED locally — sandbox evidence remains unchanged. The production path now selects the exact Base-mainnet profile, requires a privileged short-lived production platform grant, runs actual worker/signing/receipt/promotion logic with mocked external effects, and issues an exact AUD Quote bound to 10,000 atomic USDC. Concurrent initial issue and concurrent successor rotation converge on one active generation; live rotation and expired renewal revoke exactly one predecessor, advance the principal and make the old persisted dispatch stale. Extra scopes, policy/profile mismatch, one-RPC readiness and altered grant material refuse. Buyer usage/obligation records remain empty during validation. Delegated-Agent validation, hosted validation and real-value execution remain open. | `tests/integration/capability-supply-owner-funnel-publish.test.ts`; funding/preflight/CDP signer unit tests; retained sandbox and withdrawal evidence |
| AM-15 | Given submitted validation, the Provider closes the client or work is interrupted, pending or timed out; returning shows the same validation case and platform-funded Call with a working safe continuation | Recheck/recovery follows current authority and resumes that validation Call without buyer reservation or Charge. Possible submission remains uncertain; no second payment, permanent polling dead end or manual database repair | PARTIAL | SOURCE VERIFIED — Provider validation recovery distinguishes never-signed vs expired-signing vs submitted-uncertain. Resuming interrupted validation retains the original platform-funded Call, respects current workload authority, and creates no buyer reservation. | Tested in `tests/unit/convex/capability-call-recovery.test.ts` and `tests/unit/convex/capability-call-worker-run.test.ts`. Hosted validation recovery journey remains unverified. |
| AM-16 | Given pending validation or publication, claims expire, source/connection changes, ownership changes or offboarding begins; the Provider sees the current blocker and permitted correction | Those changes block new effects and promotion. A late callback cannot republish withdrawn supply or overwrite authoritative state; retained accepted Calls and their evidence remain recoverable | PARTIAL | SOURCE VERIFIED — Late worker completion cannot promote withdrawn supply (`target_drift`); routeability freeze prevents promotion under offboarding or authority revocation. Tested in `tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts`. Hosted proof outstanding. | Integration tests prove late callback protection, withdrawal and freeze enforcement |
| AM-17 | Given a draft or published Tool, the Provider repeats submission/recheck, revises, withdraws and republishes through supported actions; the displayed version and discoverable/callable state match the accepted action | Replay after promotion or interruption preserves identity and evidence. Withdrawal blocks new purchases without erasing accepted Calls; republishing cannot reuse stale approval for changed material | PARTIAL | SOURCE VERIFIED — Material change (digest, source, price) rejects republishing; withdrawal isolates historical Call records to their accepted publication revision. Tested in `tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts`. Hosted lifecycle proof outstanding. | Replay, revise, withdraw, republish material-drift rejection and Call isolation verified |

## Buyer purchase and recovery

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-18 | Given an authorized Agent seeking a service, search spends nothing; a supported sandbox Tool yields an exact expiring Quote binding version, input, authority, price, terms, effects, parties and evidence | Unsupported asset/network/recipient/amount or material drift is refused before reservation, signing or paid Provider effects, with a safe next action. External discovery is not a promise of execution support | PARTIAL | SOURCE VERIFIED — Committed Quote results project distinct parties (`seller: 'Agentic Economy'`, `provider: operation.identity.businessId`, `paymentRecipient: operation.identity.paymentRecipient`). Unit suite verifies exact party binding on issued Quotes. | Tests in `tests/unit/convex/capability-quotes.test.ts`. Hosted admitted sandbox discovery and Quote proof outstanding |
| AM-19 | Given a funded authorized buyer and valid Quote, accepting it yields literal contract-valid output and one matching AUD reservation/capture, with separate upstream settlement and delivery evidence for that Call | The same accepted command survives refresh/replay without another purchase. Provider validation cannot satisfy this row; unknown outcomes follow AM-21 rather than being labelled delivered | NOT VERIFIED | SOURCE VERIFIED — `19caa3a64`: registered buyer Quote/Call and real local Formance/Workpool prove literal output, one AUD1.20 reservation/capture and same-command replay without a second Call, signature or Provider effect. External payment/Provider responses are fixtures; hosted acceptance remains open. | No hosted buyer paid Call. Provider validation cannot satisfy this row |
| AM-20 | Given insufficient funds, treasury capacity or policy allowance, the Agent is refused with a bounded reason and safe continuation; concurrent Calls/credentials cannot spend the same capacity | Funds/policy refusal admits no purchase. Treasury refusal leaves customer credit available and releases any Agent budget/exposure reservation exactly once, with no signature or paid effect. Possible submission instead follows AM-21; the buyer never operates AE’s treasury | PARTIAL | SOURCE VERIFIED — Manager accepted the full local source contract: distinct stable Agent daily/monthly UTC limits and rollover, native atomic treasury/legal/period scarcity, maintained rate/concurrency limits, credential rotation, owner policy updates with retained usage and stale-Quote refusal, accepted worker execution through fresh authority checks, and exact pre-submission refund recovery after expiry/revocation. | [Spending design and condition-level evidence](../designs/alpha-spending-periods.md#source-evidence-and-exact-remaining-conditions); commits `b37e93fb3`, `ebb98d590`, `dabf14fe1`, `b481cbd8c`, `a3cd08a25` plus integration fixes. Manager source acceptance below. Hosted Stripe Checkout, production Convex scheduling and deployment remain unverified; possible submission and captured remedies retain AM-21/22 ownership. |
| AM-21 | Given an accepted Call interrupted before or after possible submission, the buyer resumes it by durable reference: proven pre-submission failure releases safely; uncertainty retains the reservation and status | Status/cancel/reconcile are offered only when permitted and work from a fresh process. A timeout cannot authorize a fresh Call, duplicate payment, false delivery or an unsupported release | PARTIAL | SOURCE VERIFIED — Interrupted buyer Call resumption parity proven across fresh processes: authentic clients resume by `callRef` alone; uncertain states retain holds and return `reconciliation_required`; pre-claim cancel returns safe release. Tested in `tests/unit/server/call-recovery-api.test.ts` and `tests/integration/capability-call-workpool.test.ts`. Hosted recovery proof outstanding. | Fresh-process `callRef` recovery, hold retention and cancellation verified |
| AM-22 | Given a failed or disputed delivery eligible for a supported remedy, the buyer follows the original Call to an attributable refund/adjustment and resolved purchase status | Interrupted or refused remedy retains a reason and safe next step. Retry applies the remedy once; original delivery, payment and adjustment records remain linked and visible | PARTIAL | SOURCE VERIFIED — Single remedy applies once and is attributable: pre-submission release replays idempotently with `replayed: true`; conflicting release references refuse with `managed_call_release_conflict`; original Call row and Provider obligations retain linked evidence. Tested in `tests/unit/convex/money-managed-call.test.ts` and `tests/integration/capability-call-workpool.test.ts`. Hosted proof outstanding. | Single-remedy idempotent replay and attributable evidence verified |
| AM-23 | Given the same sandbox purchase and remedy, the Customer reads Calls, Logs, Usage, Spend and documents while the Provider reads its permitted earnings/obligation records; identities, amounts and states reconcile | Refresh/replay cannot duplicate lines or conflate AUD buyer consideration with upstream settlement. Provider, Seller and recipient remain distinct; pending/adjusted purchases are shown truthfully | PARTIAL | SOURCE VERIFIED — Cross-surface reconciliation across Operator Logs, Usage, Spend, and Provider obligations verified without drift: settled amounts (AUD 2.50) aggregate into `settledSpendUnits`, uncertain amounts are excluded from settled spend, and rebuilds remain strictly idempotent. Tested in `tests/unit/convex/capability-call-projection.test.ts`. Hosted proof outstanding. | Cross-surface reconciliation across Logs, Usage, Spend, and Provider obligations verified |
| AM-24 | Given equivalent authority and the same purchase state, HTTP, installed CLI, MCP and supported chat agree on Tool/Quote/Call identities, amounts, result/status and permitted continuation | After interruption, the supported client can resume from durable references without conversation history; no surface offers a fresh purchase where another requires reconciliation | PARTIAL | SOURCE ACCEPTED — 21 September 2026 Luna PASS and manager acceptance. A focused paid local-Formance integration proves fresh installed CLI, served HTTP, MCP status and canonical chat same-command replay for pre-claim cancellation, possible-submission uncertainty and successful terminal settlement. Each path retains one buyer Call and exact reservation identity; replay adds no buyer charge, Provider attempt or payment. Terminal clients agree on literal output and exact AUD/USDC receipt. The complete shared Workpool file passes 16/16 with every paid scenario using real canary admission. Controlled seller-canary worker completion and external Provider/payment fixtures are test boundaries; hosted proof remains open. | `tests/integration/capability-call-workpool.test.ts`; helper-only comparison remains `tests/unit/market-terminal/suggested-continuation-adapter.test.ts`; deployed Base Sepolia parity is LP-3 and production parity is LP-5. |

## Connections, usability and operations

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-25 | Given the deployed app identity and an authorized connection, the operator verifies hosted secret create/use/rotate/revoke/delete in the intended Infisical scope; the supported app action can consume the stored credential | Exact provider readback establishes each lifecycle result. Missing trust or denied access yields a truthful setup/recovery state, without an operator copying secret values between services to complete the test | NOT VERIFIED | HOSTED ONLY — Secrets owner: configured Infisical lifecycle requires real scope/delivery proof; no additional source change indicated. | Projects, OIDC trust and nine bindings configured; hosted lifecycle unproved |
| AM-26 | Given scoped connections and credential generations, only the owning authorized actor can use or change them; revocation/cleanup reports the actual external result | Cross-Account access and stale-generation cleanup cannot affect another owner or replacement credential. Failed cleanup remains resumable; no secret exposure or premature deletion claim | PARTIAL | SOURCE VERIFIED — Scoped connection and credential isolation matrix (`tests/security/maturity/isolation-secret-canary.test.ts`), cross-account and stale authority rejection (`tests/unit/convex/secret-lifecycle-operations.test.ts`), and uncommitted cleanup / resumable pointer reconciliation (`tests/unit/secrets/secret-plane.test.ts`). | Scoped pointer/cleanup boundaries verified in source; hosted isolation, stale-generation and failed-cleanup proof outstanding |
| AM-27 | Given each supported UI journey, a user can complete it on desktop, compact layout and keyboard; focus, loading, empty, validation, error and success states explain progress and next action | Invalid input or failed requests preserve recoverable work; no dead controls, inaccessible action or internal jargon. Test interaction and transitions, not screenshots alone | PARTIAL | SOURCE REVIEWED — The 21 September finite inventory maps maintained evidence for Market/comparison/Tool, activation/Agent, retained Tool handoff, funding/Call status, Provider lifecycle, support, security history and compact/keyboard shell behavior. Existing tests cover honest pending/cancelled/refused/error states without fabricated effects. The inventory was docs-only and did not rerun suites. | No concrete new source defect identified. Authenticated deployed desktop/compact/keyboard cold journeys, real loading/focus timing and observed empty/error/recovery behavior remain LP-3/LP-6. |
| AM-28 | Given a deliberate application failure, the user gets a usable correlation reference and the operator receives the matching event at the intended error/alert destination; configured analytics receives a non-sensitive test event | Failure details support diagnosis without secret exposure; a missing delivery is a failed check, not proof from an enabled integration toggle | NOT VERIFIED | HOSTED ONLY — Observability owner: destination identity and actual event/alert delivery deferred; no additional source change indicated. | Actual Sentry/PostHog project destinations and delivery remain unverified; resolve and record them before running the AM-28 acceptance scenario below |
| AM-29 | Given an uncertain Call or a request to leave, the user can reach the supported help path with the relevant reference; supported workspace, Provider and personal-login actions explain what completes and what remains outstanding | Offboarding cannot silently erase history, unresolved purchases or obligations. Personal-login deletion requires the user to close outstanding solely-owned scope or transfer it to a valid successor; Provider offboarding and financial fences apply to actual closure. A blocked action gives a reason and supported next step without promising cancellation or erasure | PARTIAL | SOURCE PARTIAL — The reference-bearing `/support` path is tested. Workspace closure, ownership transfer, Provider offboarding, `readDeletionEligibility`, Clerk webhook retirement and retained-record behavior exist, but the eligibility query has no caller and does not gate Clerk self-delete. | Open source blocker: implement and prove one supported eligibility-gated final deletion action. Deployment blocker: disable Clerk self-delete per instance and read back the setting in LP-3/LP-4. Hosted support/offboarding journeys remain outstanding. |
| AM-30 | Given a runtime interruption, the operator restores service from the declared recovery/backup procedure and demonstrates the recorded alpha recovery target using authoritative data, including recovery-point loss of at most 300 seconds | Exercise restart, recovery and actual alert delivery; retained accepted work and financial records remain reconcilable. Missing target evidence or an exceeded target keeps the row open | PARTIAL | HOSTED ONLY — Operations owner: current restore/restart/alert/RPO proof deferred; no additional source change indicated. | Infrastructure and retained backups established. The 308s result is from the retired environment’s 4 September restore, not current-alpha acceptance; the 300s target remains. Current restore and SNS delivery unverified |
| AM-31 | Given the frozen supported UI and machine inventory, cold Luna/max auditors attempt the assigned user jobs and record observed outcomes, easy/difficult steps, likes/dislikes, papercuts and tasks over three turns | Every surface has evidence or an explicit failed/untested result. Stop each assignment at six decision turns or twelve minutes; unfinished work stays unverified and findings receive disposition, not silent scope cuts | NOT VERIFIED | HOSTED ONLY — Audit owner: final cold user audit is deferred; source-level UX repairs remain AM-27, with original acceptance intact. | Audit follows the existing six-turn/twelve-minute lifecycle. More than three turns is a friction flag, not automatic failure |
| AM-32 | Given one named candidate, the release owner can trace every preceding row to accepted evidence, passing relevant regression/release checks and no open critical child defect before inviting the waitlist | A relevant candidate change reopens affected proof. Green health or source tests cannot substitute for hosted behavior; an unmet contract prevents the alpha-ready claim | NOT VERIFIED | HOSTED ONLY — Release owner: final candidate/acceptance rollup deferred; source-complete handoff to Joel is required first. | Final release audit; no readiness claim from source tests or a green health endpoint alone |

## Current defect queue

These are children of release items, not additional release scope. Status:
OPEN / ASSIGNED / FIXED IN SOURCE / VERIFIED. A fixed-in-source defect does not
close its parent until the parent's acceptance is met.

| Defect | Parent | Required correction | Status |
| --- | --- | --- | --- |
| AM-15.1 | AM-15 | Treat elapsed polling as pending work with an owned continuation, not completed business failure | FIXED IN SOURCE |
| AM-15.2 | AM-15 | Resume/recheck the original case and Call; replace the permanent workflow-ID no-resume guard | FIXED IN SOURCE |
| AM-16.1 | AM-16 | Apply consistent evidence precedence across readiness, promotion and workflow completion; retained admission markers must not demote admitted supply | FIXED IN SOURCE |
| AM-16.2 | AM-16 | Prove withdrawal/freeze/current-authority refusal at final promotion and safe handling of late completion | FIXED IN SOURCE |
| AM-29.1 | AM-29 | Before the supported personal-login deletion action, require outstanding solely-owned scope to be closed with applicable Provider/financial fences or transferred to a valid successor; retain commercial records and make duplicate/concurrent requests converge without deleting on an uncertain result | OPEN — design active; Clerk self-delete instance setting NOT VERIFIED |
| AM-17.1 | AM-17 | Prove replay after promotion and after interruption between promotion and coordinator completion | FIXED IN SOURCE |

## Execution order and boundaries

The **Record-by-record execution** assignment and numeric queue above supersede
the earlier Provider/buyer milestone ordering. AM-20, AM-02, AM-04, AM-05 and AM-06 are now source-accepted;
AM-07 is now source-accepted and execution is stopped at Joel's request. Historical contributor notes below remain evidence, not an active
alternative queue. Run affected source checks at coherent integration boundaries;
full browser/release review follows source completion. No deployment is authorized.

Latest assignments: AM-16.1 and AM-15.1 have source fixes. The registered private
Provider recheck now resumes the same admission through current owner/delegated
authority; interruption/status/replay checks pass. AM-15.2 now has integrated
source proof of owner recheck and safe rearming with a retained Call, plus bounded
recovery selection. It remains open for the complete paid recovery journey and
hosted proof. AM-16.2 retains withdrawal/status-precedence and hosted checks;
AM-17.1 now has registered promotion/replay/cancellation proof with a controlled
completion fixture, while the parent still requires hosted acceptance.
Do not mark a parent VERIFIED from this.

Source-first follow-up: a cold three-file AM-16.2 audit confirms existing
freeze, exact target/claim and obsolete-workflow guards. It found no actual
withdrawal exercise in the retained-Call integration fixture. A one-file worker
assignment now extends that fixture through the supported withdrawal action,
late callbacks and unchanged accepted Call evidence. Callback bookkeeping may
truthfully become action-required; tests must protect withdrawal-owned state
and prevent republishing, not prohibit all bookkeeping updates. A missing test
is not a confirmed production defect. Hosted withdrawal proof remains deferred.

### UX contributor and finding mapping

The [14 September UX audit](../improvements/2026-09-14/audit.md) is supporting
design/evidence within this register. It is not another release backlog. This
task owns the register, backend contracts, integration, deployment and acceptance;
the UX task owns explicitly assigned interface files and supplies change receipts.
Main-checkout application edits predate this coordination and remain preserved.

| Existing items | Supporting P0/P1 findings and boundary |
| --- | --- |
| AM-05, AM-24 | Resumable Agent setup, self-contained approval facts and Tool handoff; preserve originating context and use supported client continuations. |
| AM-07–10 | Balance/fee/total hierarchy and exact-session funding return/retry. First assignment owns only the funding-return route and its focused test. |
| AM-11, AM-23 | Chronological Account-history presentation of existing funding, Calls, refunds and adjustments; no new ledger, postings or accounting semantics. Balance availability must not depend on Agent-directory success. |
| AM-21–23 | Attention-first Calls, one permitted remedy, stable receipt context, consistent buyer-facing status and recoverable pagination. Backend remains the owner of permitted actions and distinct money/delivery facts. |
| AM-27 | Neutral owner home, coherent desktop/mobile navigation, role-appropriate supply disclosure, guided Market entry, responsive layout and progressive disclosure of technical evidence. |
| AM-28 | Privacy-safe funnel events only after the intended destination and event schema are verified. |
| AM-31–32 | Cold task evidence against the integrated candidate; contributor component checks cannot close hosted journey acceptance. |

The payer-safe funding return currently exposes no Checkout or Agent deep-link.
The bounded UI fix must remove false “Return to Stripe” affordances and recheck
the same session. A missing executable return to lost Checkout/Agent context
remains a dependency of AM-05/09/24, not a silently reduced acceptance condition.

## Contract sanity check and test handoff

### Skill selection for each assignment

Use the full available skill catalog to select the relevant expertise for each
item. Read and apply the selected skills to the actual boundary; do not run the
whole library on every item. Detailed UX and specialist audit queues remain
intact, with findings, status and evidence mapped to these 32 release items.
Independent work is limited to read-only evidence gathering. Every source or
configuration mutation is serialized under the one active package and its agreed
ownership. The following are starting points, not a restriction to one subset of
the catalog:

| Work boundary | Skills to select when applicable |
| --- | --- |
| Scope and technical design | `sluice`, `iceinvein-design-review`, `simplicity-razor`, `complexity-accountant`; the relevant boundary/coupling audit for structural changes |
| Account, Agent and authorization | `clerk`, `clerk-testing`, `contract-enforcer`, `type-driven-designer`, `convex:convex-reviewer` |
| Funding, purchases, ledger and remedies | `stripe-best-practices`, `contract-enforcer`, `idempotency-guardian`, `error-strategist`, `integration-pattern-auditor` |
| Provider submission, validation and maintenance | `contract-enforcer`, `idempotency-guardian`, `error-strategist`, `integration-pattern-auditor`, `convex:convex-expert`; current Convex docs when API behavior needs verification |
| Deployment, secrets, observability and recovery | `deployment-operations`, `tf-best-practices`, `module-secret-auditor`, `integration-pattern-auditor`; provider-specific skills and official tools for the actual service |
| User journeys and release evidence | `cognitive-load-auditor`, `unidirectional-flow-enforcer`, `gestalt-reviewer`, `rams-design-audit`, `qa-only`, `devex-review`, `react-doctor`; relevant release/review skills at delivery |

Each assignment records its selected skills and the practical decision or check
they inform. Reuse official SDKs, maintained components and established product
patterns. A skill's generic example does not authorize a new service, framework,
queue, abstraction or recovery promise. Preserve the existing scope, financial
invariants and authorization when adapting its guidance. If a reference behavior
is needed, establish it from the existing maturity evidence or current official
documentation before implementation.

### Sanity check

Before assigning a change, root checks the contract against PRODUCT.md,
START_LINE.md and the existing supported action. The check asks:

1. Can the named actor reach the starting state and perform the action through
   a supported surface? A private operator shortcut is not buyer/Provider proof.
2. Can another tester judge the result from stated output, visible state and
   attributable records? Replace “works”, “ready” or “usable” without an oracle.
3. Does failure state what happened to work, money and authority, and offer a
   permitted continuation? Never turn missing evidence into claimed success.
4. Do retries, concurrent actors, stale authority and late callbacks preserve
   the original effect identity? Test the boundary that could violate it.
5. Does the implementation reuse the owning service and existing contracts?
   The Stripe heuristic is predictable behavior, not a claim about Stripe’s
   internals or permission to build another subsystem.

Each bounded assignment carries **one parent ID, the exact scenario, expected
observable result, invariant, affected boundary, 1–3 owned files where practical,
and relevant check**. Review the whole affected journey after integration.
Auditors report findings without editing code. Do not reopen a proven unrelated
journey or add a new milestone for each defect.

For each stated failure/recovery case, record an individual result; one happy
path cannot stand in for the whole row. Cover each supported remedy/action in
the frozen inventory. An inventory omission or exposed but unsupported promise
must be dispositioned under the existing parent before closure. Operators may
inject controlled faults to test a journey; the user’s recovery must still work
through the supported product path. Fault injection is not permission to use
manual repair as acceptance evidence.

### Acceptance examples for the next two milestones

| Parent | Starting condition and action | Observable pass | Must remain true |
| --- | --- | --- | --- |
| AM-15 | Provider validation has a retained Call; interrupt after possible dispatch, then reopen status and follow the offered continuation | Same Tool, case and Call; truthful pending/known outcome; continuation works for the Provider | No fresh purchase or second payment; evidence and current-authority checks retained |
| AM-16 | Withdraw supply while validation completion is outstanding, then deliver the late completion | Tool stays unavailable for new purchases; accepted work has an accurate status | Callback cannot promote withdrawn supply or erase an accepted Call |
| AM-19 | Buyer accepts an exact Quote for the controlled sandbox input | Literal output matches the Tool contract; buyer sees the quoted AUD capture and same Call history | Separate upstream settlement and delivery proof; validation funds cannot substitute for buyer funds |
| AM-21 | Buyer Call has possible submission and no conclusive result; restart the client and follow the returned continuation | Original Call remains resumable and uncertainty is visible until evidence resolves it | Reserved funds are not blindly released; no fresh Call or duplicate payment |

These examples make the existing conditions executable; they do not replace the
other cases in their parent rows. No implementation or hosted outcome is implied.

### Concrete test boundaries

- **AM-14/18:** the initial controlled source is
  `POST https://agentic-economy-sandbox-tools.vercel.app/x402/execute`, on Base
  Sepolia (`84532`) only. Bind each scenario to its current approved Tool version,
  contract input/output and Quote; the endpoint URL alone is not execution
  authority. Other external Tools may be discoverable without being supported
  for a paid Call. This names the initial proof fixture, not a permanent catalog
  restriction or permission to skip other supported inventory.
- **AM-28:** before injection, read and record the intended existing Sentry
  project and PostHog project identifiers, environment and destination, or keep
  the row unverified if they are absent. Use an isolated test failure and a
  non-sensitive analytics test event with a unique run marker. Record the exact
  event name/schema, timestamp, release and correlation reference; include the
  Call reference when the failure concerns a Call. Pass only when the operator
  can find matching event IDs in those destinations and match the user-facing
  error reference. A local log, SDK acknowledgement or chosen ad hoc destination
  does not establish delivery to the app’s intended project.
- **AM-30:** record the fault/cutoff time and newest authoritative data recovered;
  their difference establishes recovery-point loss. Record service restoration
  time separately and assess it against the declared operating target. Do not
  use the retired environment’s restore measurement as proof of the current
  candidate. A current measured miss is FAILING; missing current proof stays open.

## Closure evidence format

For each checked scenario, retain a compact receipt in the existing evidence
record: `parent ID / scenario | actor and starting state | action or injected
fault | expected → observed | surface + source/deployment + date | durable
references | recovery/replay result | reviewer`. Include visible/machine results
and authoritative readback for financial/security effects; omit secret material.
Backend records alone cannot establish that the buyer can find and use an action.

Append one short entry when a row changes:

`ID | old → new | date | source/deployment | test or exact external reference |
observed result | remaining child defects | reviewer`

Preserve failures and previous evidence rather than overwriting them. A baseline
VERIFIED row links earlier hosted evidence; revalidate it if a relevant change
invalidates that proof. Never place secrets in this register.

Qualification retains sandbox Stripe funding and Base Sepolia execution so
fault/replay behavior can be proved without production value. Launch acceptance
also requires controlled live funding and Base mainnet purchase proof under the
deployment package and exposure controls above. Production effects remain
disabled until every applicable gate is evidenced; this is a current blocker,
not a waiver or a sandbox-only release decision.

## Evidence log — 14 September 2026

- AM-16.1 | OPEN → FIXED IN SOURCE | commit `9eaad08e7` | existing registered
  readiness integration covers ordinary, required-only, canonically admitted
  and malformed admission evidence; market presence and admission state agree.
- AM-15.1 | remains OPEN; timeout behavior fixed, continuation pending | uncommitted coordinator in the working
  checkout | registered completion mutation retains `under_review` / `pending`
  without `completedAt` after the polling window; it retains its workflow journal.
- AM-16.2 / AM-17.1 | remain OPEN | registered tests reject a different workflow's
  callback and a claimed successful callback after ownership changes; the
  workflow test skips readiness replacement for retained validation. Full
  withdrawal/freeze and actual post-promotion replay remain outstanding.
- Combined verification: 14 tests in three suites passed (owner readiness,
  private staging and workflow coordination); application typecheck, targeted
  Oxlint, dependency ratchet and whitespace checks passed. React Doctor's commit
  hook reported no errors and one advisory warning on an existing sequential
  database-write loop; no unrelated concurrency change was made.
- No hosted deployment or payment was made. Parent register counts remain
  3 VERIFIED, 17 PARTIAL, 1 FAILING and 11 NOT VERIFIED.

## Behavioral contract review — 14 September 2026

- All 32 IDs now specify actor/start/action/result and a failure, recovery or
  explicitly linked check. Scope and existing defects are retained. The detailed
  start-line purchase proof remains binding; these rows do not replace it.
- Buyer purchase, Provider qualification and operating evidence stay separate.
  Public Tool discovery is distinguished from permission to buy. Success means
  contract-valid output, not payment or background completion.
- Existing VERIFIED rows stay deliberately narrow: AM-03 proves the recorded
  security event and replay, AM-08 the completed funding return/refresh, and
  AM-13 approved Provider setup/readback. They do not close session enforcement,
  payment failure/reordering or publication. Evidence for these observations
  was reread in the deployment registry and cutover record.
- No status was upgraded and no new runtime proof was collected. Counts remain
  3 VERIFIED, 17 PARTIAL, 1 FAILING and 11 NOT VERIFIED. Additional clarified
  scenarios on open rows require their own receipts before closure.

- Cold independent `gpt-5.6-luna` / `max` review completed against the register,
  PRODUCT.md and START_LINE.md. Five findings were dispositioned: clarify
  discovery versus execution and the sandbox fixture; retain the existing
  platform-funded validation Call with explicit exclusion of buyer financial
  effects; require explicit treasury-refusal release; identify the recovery
  measurement as historical; and specify observability destination/event proof.
  Validation was not remodeled as an administrative Action execution: its
  retained Call is the purchased Tool invocation, while coordination remains
  administrative. This preserves the established design and source boundary.
  No findings establish hosted correctness; AM-28 destinations and AM-30 current
  recovery proof remain outstanding.

## Provider continuation evidence — 14 September 2026

- AM-15.1 | OPEN → FIXED IN SOURCE | current uncommitted candidate | owner and
  delegated Agent recheck use current authority and the exact retained admission.
  A replay of the same maintenance request does not start another workflow.
  Canceling through the installed Workflow component produces a real terminal
  coordinator state; owner status exposes recheck, and a new maintenance request
  starts a new coordinator with the same admission case and original command.
  A late callback from the old coordinator cannot overwrite it. No purchase was
  created in this scheduling fixture; this is not retained-payment recovery proof.
- AM-16.2 | remains OPEN | validation admission and final promotion reuse the
  existing Provider freeze predicate. Regression first reproduced the missing
  gate; registered tests now refuse preparation/request/promotion while frozen,
  reject a claimed successful late completion and preserve supply/Call records.
  These tests cover the freeze boundary, not full withdrawal or offboarding.
- AM-15.2 / AM-17.1 | remain OPEN | original-Call recovery/rearming and actual
  replay after paid validation/promotion still need integrated and hosted proof.
- Verification: 61 tests passed across staging, ordinary publication ownership,
  Provider offboarding, promotion, status and workflow coordination. The enhanced
  five-test staging suite then passed again with real component cancellation and
  owner status readback. Test clocks isolate scheduled external work; these
  assertions do not claim the paid worker or full workflow ran to delivery.
  Final typecheck, targeted Oxlint and whitespace checks passed; dependency
  checks passed with ratchets unchanged (0/34/258). Register IDs, counts and
  local document links were checked.
- Cold Luna/max review found no concrete authority bypass or unsafe promotion
  in the bounded freeze/resume surface. It identified a remaining conservative
  status after publication commits immediately before a freeze; that remains
  under AM-16.2. The recheck worker stopped at its finite lifecycle, and root
  completed integration and fixed the scheduled-work test isolation failure.
- Skills applied: `sluice`, `contract-enforcer`, `idempotency-guardian`,
  `error-strategist` and `integration-pattern-auditor`, with the repository's
  Convex guidelines. Recheck admission is transactional; external payment
  uncertainty retains its original identity/evidence. Existing Workflow journals
  retain failed coordination and carry callbacks; no new queue, recovery service
  or global ownership exception was introduced. The next recovery assignment
  must reuse the existing Call recovery boundary, not create a second retry path.
- No hosted deployment or payment occurred. Parent counts remain 3 VERIFIED,
  17 PARTIAL, 1 FAILING and 11 NOT VERIFIED; alpha remains unready.

### AM-15.2 recovery design

Two separate omissions explain the stalled continuation: validation request
replay bypasses the existing safe rearm functions, and coordination stops at
reconciliation without invoking Call recovery. Workflow restart alone cannot
resolve either. The design review uses the already accepted behavioral contract;
the interactive interview is skipped under the standing execution authorization.

| State owner | Bounded change | Required observable proof |
| --- | --- | --- |
| Call recovery | Select the existing pre-submission or managed-signing recovery from retained payment facts. Keep their evidence checks and current workload authority. | Never-signed and expired-signing cases become retryable on the same Call; submitted, signed, foreign or incomplete evidence cannot trigger a new payment. |
| Call dispatch | Reuse existing known-unpaid and safe-before-release checks before refreshing validation readiness or rearming retained work. | Duplicate rechecks enqueue at most one worker; canonical uncertainty retains its sealed evidence. |
| Provider validation | Invoke recovery through the existing internal Call API; resume the original admission and command only after recovery permits retry. | Supported owner/Agent recheck retains the Call reference, creates no buyer financial effects, and cannot promote without verified delivery. |

No new queue, recovery service or buyer API is introduced. `contract-enforcer`,
`idempotency-guardian` and `error-strategist` preserve effect identity and evidence;
`type-driven-designer` and `bounded-context-auditor` keep coordination, payment,
delivery and publication states distinct. `complexity-accountant` limits the
change to existing owners and real continuation callers. Source checks precede
hosted acceptance, and neither substitutes for the other. Submitted-payment
uncertainty still requires the existing verified reconciliation evidence; its
unresolved dependency must remain visible in this item.

### AM-15.2 source evidence — 14 September 2026

- Existing Call recovery now selects its never-signed or expired-managed-signing
  proof from retained facts. Current workload authority remains mandatory;
  interactive owner/Agent callers cannot invoke this internal mode. Submitted,
  signed and incomplete evidence stays uncertain. Each coordinator run attempts
  recovery at most once and observes the original Call throughout.
- Dispatch's existing known-unpaid, safe-before-release and recovered-workless
  conditions now govern readiness refresh and rearming. A registered integration
  test creates a real Call, injects only a pre-claim worker refusal, cancels the
  actual Workflow, invokes owner recheck, refreshes readiness and resumes that
  Call. It proves one Call, one replacement worker, unchanged original command,
  duplicate suppression and no usage/Provider consequence records. A subsequent
  uncertain state preserves the full retained row. Scheduled external work is
  isolated: this fixture does not claim a paid worker ran or funds moved.
- Cold Luna/max review raised a possible identity fork during readiness refresh.
  Further tracing established that the existing stable identity intentionally
  excludes readiness and reservation replay checks principal/idempotency identity.
  The refreshed-readiness integration test passes with the same Call and a new
  commitment digest; no redundant identity mechanism was added. Review did not
  establish a second-purchase defect.
- Verification: 79 tests passed across six suites; typecheck, targeted Oxlint,
  dependency checks (unchanged ratchets 0/34/258) and whitespace checks passed.
  Fixture digests were corrected to meet the real commitment contract, rather
  than weakening production validation.
- Remaining dependencies stay within AM-15: actual paid recovery through the
  complete workflow and hosted recheck; verified evidence for submitted-payment
  uncertainty; and the existing snapshot restriction that rejects an already
  public Provider (`convex/lib/capabilitySupply/currentTool.ts`) even though
  staging admits its new Tool. The latter has source evidence only and needs a
  bounded contract decision/test before correction. AM-16/17 final promotion,
  withdrawal and post-promotion replay proof remain outstanding.
- No hosted deployment or payment occurred. Counts remain 3 VERIFIED, 17 PARTIAL,
  1 FAILING and 11 NOT VERIFIED. The release is not yet alpha-ready.

### Provider admission and promotion integration — 14 September 2026

- A cold Luna/max worker reproduced the public-Provider rejection, then corrected
  the existing snapshot boundary. Public and private Providers now use the same
  exact Tool admission requirement; unrelated qualification blockers remain
  binding. Existing business evidence is preserved without adding a duplicate.
- Extending the registered integration test through promotion reproduced
  `seller_promotion_post_publish_operation_drift` for both Provider states.
  Contract, binding and price matched; only the evidence-derived material digest
  changed after admission. Cold review rejected normalizing the whole evidence
  digest: it could conceal unrelated qualification drift. Promotion now predicts
  only its exact admission record and Provider publication through the existing
  graph qualification and Tool materialization rules, then compares the complete
  material identity after writing. Readiness times and the current Provider
  claim are checked again. No evidence field is exempted from comparison.
  The cold reviewer rechecked the correction and found no remaining blocking
  bypass in the scoped source. Registered internal validators expose no new
  argument; the projection option is only used inside the promotion transaction.
- AM-17.1 is FIXED IN SOURCE: the same retained Call survives actual registered
  promotion, repeat promotion/request, and a canceled coordinator's completion
  callback after publication commits. Public Tool readback succeeds. Completion
  and settlement enter through a controlled test fixture; these checks do not
  establish hosted payment or full external-worker execution.
- The relevant six-suite milestone check passed 44 tests, including ordinary
  publication ownership, offboarding and current-Tool snapshot stability. Final
  typecheck, targeted Oxlint, dependency ratchets and whitespace checks passed.
- Skills used: `sluice`, `contract-enforcer`, `bounded-context-auditor` and
  `iceinvein-design-review` for state ownership; existing canonical digest and
  receipt builders preserve `idempotency-guardian` and `complexity-accountant`
  constraints. `deployment-operations` scoped the fresh read-only preflight.
  The incorporated UX audit maps to existing AM IDs and preserves the same
  behavioral acceptance; funding-return interface work has separate file ownership.
- No parent status changed and no hosted mutation occurred. AM-14–17 still
  require the complete deployed Provider journey, paid recovery evidence and
  remaining withdrawal/authority checks before release acceptance.

### Funding return integration — 14 September 2026

- Integrated UX assignment `61b7b0866` as `41b101430`: the funding return
  preserves the same session and last confirmed pending state across transient
  failures; invalid, expired and failed links remain distinct. Ready directs the
  user back to the named Agent, with Balance used for verification.
- The payer-safe API has no Checkout or Agent return URL. The interface therefore
  cannot reopen either destination. That executable continuation remains an
  AM-05/09/24 dependency; AM-09/10 remain open for complete hosted proof.
- The detailed UX audit queue remains active independently, mapped to the AM
  rollup. The Market discovery correction has separate ownership of its route,
  directory component and existing search test; no backend overlap is assigned.

### Integrated source candidate — 14 September 2026

- Candidate code `c4132d1ce498eb396c9858977fa74c06a526a4ed` includes Provider
  promotion, same-session funding recovery and Market default discovery
  (`bf9a71be7`, from UX `c7a9546e0`). Following Joel's source-first sequencing,
  Market refinement `8d885b887` is integrated as `ac82e9a73`, with its detailed
  repair queue `b74de25cf` integrated as `0efd42ef5`. Its 44 focused tests pass;
  integration also narrowed a test helper's required catalogue argument to
  preserve exact optional types. The full UX P0/P1 queue remains active.
- `npm run gate` initially stopped at module-boundary checks after 4,755 unit
  tests and 1,344 integration tests passed (five integration tests skipped,
  three todo). The source fixes use declared module interfaces; four private
  recovery test imports have exact test-only ownership entries. No runtime
  exception or new public worker API was added. All 50 import tests then passed.
- The next standards check identified two non-null assertions and an inexact
  worker result declaration. Explicit missing-state guards and generated query
  result types replaced them; standards, typecheck and 134 affected tests pass.
  The `module-secret-auditor` decision preserves private worker implementation;
  `contract-enforcer` preserves explicit authority and missing-state behavior.
- Remaining release checks were resumed: lint, dependency checks, SEO (28), UI
  contracts (2), accessibility (10), packaged CLI and production build passed.
  This is a resumed check receipt, not a claim that one complete `npm run gate`
  invocation passed on the final revision. CI remains required before merging.
- Initial browser run: 23 passed, eight authenticated checks skipped, one
  `/api/businesses` request exceeded 10 seconds. The unchanged wide-screen
  suite passed with one worker (12 passed, four skipped). Retain the first
  timeout as a reliability observation; do not inflate the timeout or count
  skipped authenticated journeys as proof. Local browser checks use the
  development backend, not the hosted alpha buyer account.
- Official Convex dry run targeted `cautious-zebra-473`, reported no index
  deletions and did not deploy. The live alpha still requires coherent source
  deployment, Provider validation/publication and a separate buyer purchase.
  All parent statuses remain unchanged; alpha release acceptance is still open.


### AM-20 manager source acceptance — 14 September 2026

Accepted against candidate `a3cd08a25`, following worker correction `b481cbd8c`.
The iceinvein design, complexity, simplicity, temporal and semantic-contract
reviews found two concrete integration defects: a superseded access-grant read
blocked actual accepted worker execution after a monetary update, and cron
attribution confused access/canonical generations and required live buyer
authority to complete a proved pre-submission refund. Both are fixed through
existing canonical reconciliation and existing exact-Call refund proof.
No grant is revived, no accepted booking rewritten and no new paid authority is
created by refund bookkeeping. Formance remains the sole spend/balance authority.

Condition-level evidence is in the spending design. Final affected registered
buyer/native-ledger file passed **16/16**, including monetary updates before
dispatch and after claim/before payment, current-grant revocation with no second
paid effect, lost refund acknowledgement and exact scheduled return after expiry.
Worker/authority focused checks passed **100/100**; manager workload boundary
checks passed **32/32**, including cross-Call refusal, independent generations,
wildcard scope, expiry/revocation and refusal once execution evidence exists.

Manager `npm run typecheck` and `npm run lint` passed. Official Convex codegen
completed; the existing module-derived binding inventory needed no further diff.
`npm run test:conformance` passed **507**, with **14 explicitly skipped** in the
ordinary source run; the separately enabled real-ledger run above covered its
conditional buyer cases. Architecture checks previously passed **21/21**; no
relevant architecture change invalidates that evidence. The full `npm run gate`
contains browser and full build checks and was not run in this source phase.
`npm run deps:check` also passed with all existing ceilings unchanged.
Hosted/runtime acceptance stays PARTIAL. This source closure leaves **5 SOURCE
VERIFIED, 21 source-unclosed and 6 HOSTED ONLY** release records out of 32.


Main integration completed through `7b1f892b0`. Exact AM-20 source and required
existing environment/payment prerequisites were integrated without changing
hosted configuration or disturbing unrelated main edits. Main's enabled native
buyer file passed **16/16** in 29.95s; affected Quote/worker/refund checks passed
**59/59**, and payment/authorization checks **122/122**. Final main typecheck and
lint passed. Older Provider candidate/main differences remain for their owning
source records; this is not a claim of complete repository parity or alpha
readiness. Backend is assigned AM-02, with AM-04 next after manager acceptance.


### AM-02 manager source acceptance — 14 September 2026

Source accepted at `eaa0d7256`, integrated as `4997f7072`. The complete sign-in,
return, sign-out and same-Account restoration contract is mapped in the release
design. Two source defects were reproduced before correction: control-character
return targets could resolve externally, and auth-flow switching omitted Clerk's
opposite-flow destination setting. Fixes reuse the platform URL parser and
maintained Clerk API; no handrolled session/OAuth/retry machinery was added.

The nine-file focused source command recorded in the worker outcome passed
**125/125** on both candidate and integrated main. Actual canonical source tests
cover unique first provisioning, anonymous refusal with unchanged durable facts,
and same-identity restoration. Server guard tests use mocked Clerk/source
boundaries, preserve destination and exercise missing/unavailable authority and
retry. Candidate `npm run typecheck`, integrated changed-file `oxlint` and
`git diff --check` pass. Changed source and its authority guards match across
checkouts, so no unrelated full suite was repeated.

Hosted invitation/OAuth, actual browser session termination and production
transaction scheduling remain explicitly unverified. SOURCE VERIFIED does not
change hosted status from PARTIAL. The source totals are now **6 verified,
20 unclosed, 6 hosted-only** out of 32. Backend next owns AM-04; AM-05 follows only
after manager acceptance of the whole AM-04 source contract.


### AM-04 manager source acceptance — 14 September 2026

Source accepted at `2e6929721`, integrated to main as `349f69d0f`. The existing
release design maps the whole named-resource isolation contract to enforcing
source and positive/negative evidence. The bounded design/contract review found
no need for a new IAM layer. No new production implementation was required in
the candidate; the five test files close finite proof gaps.

Main integration reproduced two legitimate private-Provider preparation failures
because its earlier `40e5a9859` source prerequisite had not been integrated.
Applied that existing two-file correction as `f7499e12d`, retaining all newer
isolation tests and unrelated main edits. The four other files' 15 tests passed
before that correction; the affected private-provider file then passed 7/7.
Thus all **22/22** changed-file cases pass in main as well as candidate. Existing
selected role/secret/funding/source checks passed **16/16**, and the selected
public discovery scenario passed **1/1**, with unrelated cases deliberately
excluded. Combined `npm run typecheck` passes in both checkouts; relevant explicit
`oxlint` and `git diff --check` pass.

Evidence limits remain explicit: Call snapshots cover protected Call rows, not
all audit/ledger state; ledger scoping is tested at the SDK boundary; document
checks establish URL issuance isolation, not revocation of an issued bearer URL.
Actual hosted Clerk/Agent/admin sessions, direct-route and storage probes remain
unverified. AM-04 hosted status stays NOT VERIFIED. Source totals are now
**7 verified, 19 unclosed, 6 hosted-only** out of 32. Backend next owns AM-05;
AM-06 follows only after manager acceptance of the whole AM-05 source outcome.


### AM-05 manager source acceptance — 14 September 2026

Accepted source `af97fd565`, integrated to main as `29a7ddc53`. Main also required
the candidate's existing pending-approval persistence and current URL-validator
prerequisites (`5820d9c45`/`584cba57f`), now `56ac71a76`/`f9d1c4074`. Conflicts
preserved the newer CLI scenarios; relevant client, OAuth and UI source matches
between candidate and main. No external configuration or dependency changed.

The actual installed executable completed connection, its emitted search,
selection of a returned Tool and the first Quote against the existing controlled
HTTP fixture. The same-origin credential and server-derived Account/Agent were
verified; no copied Account input, wallet setup, diagnostic prerequisite or paid
Call was used. OAuth consent accepts explicit decisions only, uses the registered
callback on denial, preserves client state and does not mistake lost replies for
expiry. Confirmed terminal expiry and retryable uncertainty have distinct paths.
These changes reuse OAuth device/code flows and existing persistent state.

Main's complete three-file run (cold-loop, authorize-route and OAuth API) passed
**132/132** with `AE_TEST_INSTALLED_CLI` set; no source-bundle fallback or new
install was used. Candidate/main `npm run typecheck`, integrated scoped `oxlint`
and `git diff --check` pass. Existing candidate issuance/binding **3/3** and
canonical approval/replacement/reconnection **7/7** selected cases remain valid;
unrelated cases were deliberately excluded in those filtered runs.

This verifies supported CLI polling and registered browser-client callback
contracts, not arbitrary third-party conversation URLs. Funding/task return
context stays AM-09/24 and the related AM-27 dependency remains explicit. Hosted
Clerk challenges, invitation/approval, actual credential propagation and real
harness/browser execution remain unverified. AM-05 stays PARTIAL for hosted
acceptance. Source totals: **8 verified, 18 unclosed, 6 hosted-only** out of 32.
Backend next owns AM-06; AM-07 follows only after whole-record manager acceptance.


### AM-06 manager source acceptance — 14 September 2026

Accepted source `349d1bbb0`, integrated as `a859a1f65` with no conflict or missing
prerequisite. Replacement implementation and both changed test files match
candidate/main. Four reproduced transition defects are corrected in the existing
module: cancelled-history successor selection, revoked-binding replay, grant
validation after partial writes, and predecessor revocation before validating a
live successor. Existing transaction, indexes, canonical validators and provider
adapter remain the owners; no new lifecycle store or permission framework.

Main's replacement and rotation-dispatch files passed **15/15**. Candidate
`npm run typecheck`, integrated scoped `oxlint` and `git diff --check` pass.
Existing selected canonical lifecycle, provider cleanup, current authority,
refresh and stable-Principal admission/rate evidence is recorded in the design;
AM-20's native registered-buyer rotation/capacity proof is reused without another
full money run. The changed dispatch fixture explicitly refuses AM-20's accepted
Call authority fallback for revoked credential authority; it does not substitute
for the existing production reconciliation tests.

Hosted provider cleanup, simultaneous clients and production transaction
scheduling remain unverified; hosted status remains NOT VERIFIED. Source totals
are **9 verified, 17 unclosed, 6 hosted-only** out of 32. Backend next owns AM-07,
then AM-09 after whole-record manager acceptance.


## AM-07 manager source acceptance and requested stop — 2026-09-14

AM-07 source is accepted after the final optional-prop test correction.
`npm test -- tests/unit/ui/demand-console.test.tsx tests/unit/server/funding-handoff-api.test.ts tests/unit/convex/money-account-funding.test.ts`
passes 46/46 in both candidate and main working tree. Candidate
`npm run typecheck`, scoped Oxlint and diff checks pass. Earlier condition-level
proof remains in `alpha-release-design.md`; no full browser or hosted claim.

The five-file source patch and test correction are applied to main's working
tree. Its funding test already contained unrelated uncommitted financial
prerequisites: those edits and the new test remain unstaged together, preserved
without folding the baseline into this acceptance commit. The candidate retains
the complete committed source/test record. Other AM-07 files are committed on main.

Totals: **10 source verified, 16 source unclosed, 6 hosted-only** out of 32.
**STOPPED after AM-07 at Joel's request.** AM-09 is not started. Monitoring is
paused and UX remains archived. Resume only on new user instruction.

## AM-11 owner document facts and AM-14 pickup — 16 September 2026

This session closed AM-09, AM-10, AM-11 and AM-12 in source (hosted still
outstanding). AM-11 owner credit facts now label issued documents Issued and
preparing documents Recorded; failed documents stay Needs attention with Open
disabled and the record remaining. AM-11 Status remains PARTIAL. No hosted
document claim.

Joel then authorized Layer 4 AM-14 source closeout. The historical stop after
AM-07 above is left as the dated record of that request.

## AM-14 sandbox publish source closeout — 16 September 2026

Owner and delegated Agent `supply.publish` for sandbox managed x402 now write
the seller-canary fence and start the admission Workflow. A healthy 402 probe
does not mark the Tool Quote-eligible. One platform-funded canary with
contract-valid output, then internal promotion, does. Known failures stay
action_required without published/Quote. Replay after admit does not mint a
second canary. Buyer ledgers stay empty. AM-14 Status remains PARTIAL. Hosted
paid validation/publication outstanding. AM-15 is unchanged.

**Evidence correction — 20 September 2026:** the integrated journey test cited
for this closeout is absent from the current repository. The component evidence
listed in the AM-14 row remains valid, but the supported owner/delegated-Agent
entry-to-promotion journey is an LP-0 source verification gap until focused proof
is added or located.

## Easy AM items source closeout (AM-16.2, AM-18, AM-26, AM-29) — 16 September 2026

Fanned out Composer subagents for discrete file-specific tasks (<3 files):
- **AM-15 (SOURCE VERIFIED):** Verified platform-funded validation call recovery distinction across never-signed, expired-signing, and submitted-uncertain states in `tests/unit/convex/capability-call-recovery.test.ts` and `tests/unit/convex/capability-call-worker-run.test.ts`. Flipped status from FAILING to PARTIAL / SOURCE VERIFIED.
- **AM-16.2 (FIXED IN SOURCE):** `promoteX402SellerCanaryForOwner` in `convex/catalogOfferingMutations.ts` enforces `providerRouteabilityIsFrozen` and `capabilityOfferings.status === 'active'`, refusing promotion with `target_drift` if routeability is frozen or the offering is withdrawn. Current proof is in `tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts`.
- **AM-18 (SOURCE VERIFIED):** `quoteResult` committed variant in `convex/capabilityQuotes.ts` projects distinct `parties: { seller: 'Agentic Economy', provider: operation.identity.businessId, paymentRecipient: operation.identity.paymentRecipient }`. Verified in `tests/unit/convex/capability-quotes.test.ts`.
- **AM-26 (SOURCE VERIFIED):** Scoped credential isolation, cross-account and stale generation rejection, and uncommitted cleanup / resumable pointer reconciliation verified across `tests/security/maturity/isolation-secret-canary.test.ts`, `tests/unit/convex/secret-lifecycle-operations.test.ts`, and `tests/unit/secrets/secret-plane.test.ts`.
- **AM-29 (SOURCE VERIFIED):** `src/routes/support.tsx` implements reference-bearing help path via `callRef` search param with displayed banner and prefilled mailto href. Verified in `tests/unit/routes/support-route.test.tsx`.

Totals: **15 source verified, 11 source unclosed, 6 hosted-only** out of 32.

## Final source items closeout (AM-16, AM-17, AM-21, AM-22, AM-23, AM-24, AM-27) — 17 September 2026

Orchestrated IceInVein source closeout across all remaining open source gaps with subagent characterization and implementation:
- **Pre-flight Call Idempotency Rotation:** Fixed fixture bug in `tests/unit/capability-execution/call-idempotency-rotation.test.ts` where credential-rotated replays supplied an uninherited QuoteRef.
- **AM-16 (SOURCE VERIFIED):** Enforced late worker completion rejection (`target_drift`) and routeability freeze protection on withdrawn offerings. Verified in `tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts`.
- **AM-17 (SOURCE VERIFIED):** Material drift (price, source descriptor, digest) rejects republishing; Call isolation across publication revisions verified in `tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts`.
- **AM-21 (SOURCE VERIFIED):** Interrupted buyer Call resumption parity across fresh processes verified by `callRef` + bearer key alone (with 401/404 foreign principal boundaries, uncertain hold retention, and pre-claim safe release) in `tests/unit/server/call-recovery-api.test.ts` and `src/lib/server/call-api.ts`.
- **AM-22 (SOURCE VERIFIED):** Single remedy and attributable adjustment verified: idempotent pre-submission release replay with `replayed: true`, conflict rejection on divergent transaction references, and intact Provider obligations with linked evidence in `tests/unit/convex/money-managed-call.test.ts`.
- **AM-23 (SOURCE VERIFIED):** Cross-surface reconciliation across Operator Logs, Usage, Spend, and Provider obligations verified without drift or phantom spend in `tests/unit/convex/capability-call-projection.test.ts`.
- **AM-24 correction — 20 September 2026:** the cited adapter test proves CLI-helper/shared-presentation agreement only. The finite HTTP, MCP, supported chat and installed-client paid-state gap was closed and accepted on 21 September by the focused integration evidence in the row above; hosted proof remains open.
- **AM-27 (SOURCE VERIFIED):** Honest UI state rendering verified for cancelled and refused-before-claim Calls (no false success "Complete", no misleading reuse actions, no fabricated output or money facts) in `tests/unit/routes/call-status-route.test.tsx`.

6-Gate Verification: 8 test suites (111 tests) passed, TypeScript typecheck passed (0 errors), ESLint passed (0 errors), dependency ratchet passed (0 circular), module boundaries passed (12/12), TypeScript standards passed.

Historical total recorded on 17 September: **26 source verified, 0 source
unclosed, 6 hosted-only** out of 32. This is superseded by the AM-14 and AM-24
evidence corrections above and cannot close LP-0 or establish source completion.
