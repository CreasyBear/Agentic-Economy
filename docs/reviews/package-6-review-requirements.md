# Package 6 requirements review: did we ask the right questions?

**Review scope:** product, roadmap, plans, maturity references and closeout evidence only. This document does not inspect or grade the Package 6 implementation.

**Verdict:** Package 6 is aimed at the right problem, but its implementation plan is not a decision-complete record. It turned nine user outcomes and several release prerequisites into twelve owner rows without recording the answers its own research called mandatory. The prior task shows that Joel accepted the proposed OpenAI-first distribution shape, four anonymous tools and Open-Meteo proof path by instructing the agent to implement that proposed plan. It does not show that the client/auth compatibility, live Operation, support or complete journey evidence was established before implementation. The result can plausibly produce polished pages, a valid bundle and many green tests while still failing the actual job: an agent starts with a capability gap, finds a real Operation without premature authentication, retains intent through native connection, receives a useful result or exact recovery action, and a Provider can list and resume one service without losing its source or mistaking upstream setup for AE publication.

The roadmap is intentionally terse. Its headings are outcomes, not acceptance tests (`IMPLEMENTATION_ROADMAP.md:905-945`). The maturity research supplied the missing semantics and explicitly prohibited implementation before seven planning facts were recorded (`research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:296-306`). The inverse premortem expanded those into nine product requirements, five black-box journeys and nine planning gates (`research/PACKAGE-6-INVERSE-PREMORTEM.md:299-327`, `401-521`). The atomic plan does not contain those answers. It states that P6-01–09 were locally delivered and P6-10–12 remain blocked (`docs/designs/package-6-atomic-feature-build-plan.md:71-76`), but that is an execution status, not proof that the chosen requirements were complete or correct.

## What Package 6 should achieve

Package 6 should make the existing Operation market understandable, usable and recoverable through the environment an agent or Provider already uses. It should preserve this product chain: capability gap, resolution, Commitment, Invocation, delivery or uncertainty, remedy, commercial closure, outcome evidence, then agent continuation (`AGENTS.md:21-28`; `PRODUCT.md:84-100`). It should not create an onboarding subsystem.

For an agent, success is observable behavior:

1. State the job in ordinary language.
2. Search real public supply before connecting an Account.
3. Inspect a real Operation and its material public facts.
4. Use the current host's maintained plugin/directory or native MCP ceremony only when the chosen action requires access.
5. Preserve the job, Operation and input through connection.
6. Keep transport configuration, authentication, delegated authority, funding and purchase approval separate.
7. Complete the first useful result, or return one exact blocker with one safe continuation.
8. On uncertainty, read or reconcile the same Invocation. Never create a blind new Call.

This follows the charter's short agent path (`PRODUCT.md:235-275`), the amended Package 6 requirements (`research/PACKAGE-6-INVERSE-PREMORTEM.md:304-314`) and the black-box client journeys (`research/PACKAGE-6-INVERSE-PREMORTEM.md:406-443`). Funding cannot stand in for authority or a purchase (`PRODUCT.md:168-173`), and a successful connection cannot establish caller viability (`research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:87-103`).

For a Provider, success is also observable behavior:

1. Decide before sign-in whether AE fits, what source and evidence are needed, whether validation may cost or cause an effect, what happens after submission, and what timing is known.
2. Give AE an existing OpenAPI, MCP, Agent Plugin or x402 source rather than rebuilding its schema.
3. Select one discovered candidate and retain the exact saved source and draft.
4. Use official hosted/OAuth setup when the source provides it; use AE's secure manual credential handoff only for a supported source without such a maintained route.
5. Survive sign-in, cancellation, expiry, refresh, a second tab and a fresh process without changing Business, source, environment or selected Operation.
6. Return from the external ceremony to authoritative current state. A redirect is not proof of connection or publication.
7. See the current Operation state, the exact reason, and one safe next action.

Package 5 already owns most of this substrate. Its release evidence says it has source-native preview, durable attempts, exact source selection, authoritative readback, one shared eight-state projection, stable connections and paged offboarding (`docs/guides/package-5-release-evidence.md:32-44`). Package 6 should connect and explain those capabilities, not replace them.

## Authority versus evidence

| Source | Authority level | Actual content used in this review | Consequence for Package 6 |
|---|---|---|---|
| `AGENTS.md` | Governing instruction | Product chain, role separation, implementation-truth boundary, legacy identifier compatibility (`21-64`). | New wording must use Provider and the canonical commercial distinctions; source presence cannot establish the full Australian record. |
| `PRODUCT.md` | Active product charter | Customer job (`26-59`), Operation and progressive commercial responsibility (`61-82`, `139-187`), product surfaces (`207-233`), agent operating model (`235-275`), implementation boundary (`372-397`) and evidence rules (`437-460`). | The agent's job and purchase chain outrank setup ceremony. Public supply, authority, funding, delivery and closure remain separate facts. |
| `CONTEXT.md` | Canonical domain language | Market roles (`7-35`), market decision and Invocation terms (`37-81`), economic records (`83-151`) and supply/recovery language (`153-165`). | Ordinary public words may introduce the product, but consequential records cannot merge Provider, Seller, payment recipient, Funding, Charge, Payout or closure. |
| Australia whitepaper | Institutional thesis | Bounded just-in-time selection (`63-108`), settlement versus closure (`110-161`), delegated authority (`195-203`, `270-290`) and the institutional purchase (`235-290`). | Connection and payment must not be marketed as a completed or authorised purchase. |
| `IMPLEMENTATION_ROADMAP.md` | Current delivery scope | Package 6A–D outcome headings (`905-945`) and mature completion standard (`1159-1198`). | Package 6 must cover the listed onboarding/content/guidance outcomes, but the headings alone do not prove behavior. |
| Platform maturity rubric | Dated research | L0-L4 distinctions (`63-75`), principal/account/credential/authority separation (`130-199`), API/release lifecycle (`404-422`) and support controls (`445-460`). | Local tests are L1 evidence. Support and release claims require compatibility, deployed behavior, recovery and operational ownership. |
| Package 4 plan and closeout | Historical and current dependency evidence | Inspect/Invocation/recovery contracts (`docs/designs/package-4-atomic-feature-build-plan.md:399-455`), outage behavior (`495-505`), failure coverage (`907-950`) and open release gates (`docs/guides/package-4-release-evidence.md:6-19`, `71-120`). | Package 6 may explain existing recovery, but cannot claim a completed paid purchase or production readiness while Package 4 is open. |
| Package 5 plan, comparison and closeout | Implemented source baseline plus open external gates | Native source onboarding and one lifecycle (`docs/designs/package-5-atomic-feature-build-plan.md:77-113`, `236-323`), no-handroll rules (`811-834`), mature-reference adoption (`research/PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md:65-219`) and open live gates (`docs/guides/package-5-release-evidence.md:70-83`). | Retain Package 5 records, source adapters and projection. Actual client and live Provider claims remain unproved. |
| Whop maturity and papercuts | Comparative evidence, not authority | Hosted/expiring owner handoff, capabilities versus permission, resumable operations, directory/CLI/SDK distribution and progressive discovery (`.planning/whop-docs/WHOP-SCAVENGE-PAPERCUTS.md:381-597`, `2211-2371`, `3395-3549`); maturity paper says market formation and live evidence remain weak (`research/WHOP-AE-MATURITY.md:104-170`). | Adopt hosted ceremony, stable resource identity, exact readback and native distribution. Do not import Whop's Product/Plan/account ontology or treat a marketplace listing as buyer viability. |
| Locus maturity and papercuts | Comparative evidence with documented version drift | Compact meta-tools, auth-aware discovery, scoped Agent Connections, public versus executable supply and durable Call recovery (`.planning/locus-docs/LOCUS-SCAVENGE-PAPERCUTS.md:135-239`, `291-394`, `594-749`); maturity paper identifies inspect-to-invoke, caller viability and operating proof gaps (`research/LOCUS-AE-MATURITY.md:102-148`). | Adopt separation of transport, identity, authority, balance and current status. Current research warns that old Locus Pro mechanics are no longer reliable live authority (`research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:237-251`). |
| Whole-product papercut register | Point-in-time behavior evidence | Nine independent passes, current closeout notes, core-loop and abandonment failures, quality score and known limits (`.planning/audits/product-papercut-register-2026-09-03.md:3-58`, `96-172`, `240-265`). | It is a lead, not closure. The Package 6-related journeys must be rerun on one deployed Package 6 revision. |
| Package 6 research and inverse premortem | Direct planning evidence | Nineteen candidate controls (`research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:56-235`), twelve prioritized requirements and ten open questions (`253-305`), reduced to nine user requirements plus five proof journeys (`research/PACKAGE-6-INVERSE-PREMORTEM.md:299-502`). | This is the missing specification behind the roadmap. It does not override PRODUCT, but the atomic plan needed either to answer it or explicitly reject parts with reasons. |
| Package 6 atomic plan and release guide | Implementation record and release procedure | Twelve tasks and seven acceptance bullets (`docs/designs/package-6-atomic-feature-build-plan.md:26-66`); local checks, blockers and submission cases (`docs/guides/package-6-plugin-release.md:5-68`, `120-150`). | Useful status/evidence records, but much of the required specification appears only after implementation in a release guide. |

No file named “WHPO” was found. The actual corpus is Whop, under `.planning/whop-docs/` and `research/WHOP-AE-MATURITY.md`.

## Requirement-quality and coverage baseline

Status here means coverage by the requirements and plan, not implemented behavior.

| Roadmap / needed outcome | Reference basis | Requirements-plan status | Skeptical assessment |
|---|---|---|---|
| 6A: value proposition first | Roadmap `909`; charter `PRODUCT.md:35-59`; A1 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:60-67`; amended job-first requirement `research/PACKAGE-6-INVERSE-PREMORTEM.md:306`. | **Partial** | The plan says “value-first agent entry” and public discovery (`P6-06`, acceptance), but never names the real admitted Operation used to prove value. An empty or unavailable catalogue can pass the copy task. |
| 6A: one recommended installation path | Roadmap `910`; A2/A3 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:69-85`; amended environment-native path `research/PACKAGE-6-INVERSE-PREMORTEM.md:307`. | **Accepted direction; blocked proof** | Joel accepted an OpenAI Plugin Directory golden path with Codex CLI, Claude Code and Cursor fallbacks in the prior task. That is a sound distribution decision if the advertised OpenAI surface exists and each fallback uses its own maintained action. It does not license a static Codex instruction when the user is already in another supported environment. |
| 6A: first successful connection | Roadmap `911`; A4 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:87-94`; amended first-use requirement `research/PACKAGE-6-INVERSE-PREMORTEM.md:308`. | **Partial** | The acceptance list never states the complete first-result journey. Plugin validity, four tools and account connection are intermediate states. Completion requires a fresh task producing one useful public result, then caller readback/inspection and Invocation or one exact blocker. |
| 6A: alternatives through progressive disclosure | Roadmap `912`; A2 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:69-76`. | **Partial** | P6-06 says alternatives are disclosed, but the plan neither chooses exact supported builds/routes nor proves each emitted action. Cursor's route was explicitly unresolved in the research (`283-290`). |
| 6A: troubleshooting and verification | Roadmap `913`; A5 and D1–D4 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:96-103`, `183-217`. | **Absent as specification; blocked as release proof** | The plan records unresolved OpenAI auth metadata but does not specify the current protocol/client matrix, 401/403 behavior, restart, revoke or reconnect. The release guide later lists these. That is evidence planning after delivery. |
| Public no-match versus outage | A1 acceptance `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:62-66`; Journey D `research/PACKAGE-6-INVERSE-PREMORTEM.md:469-488`; release case `docs/guides/package-6-plugin-release.md:127-134`. | **Partial** | One acceptance bullet names no-match/outage. It lacks the fixture/source of live catalogue truth and the cross-surface proof that outage never becomes “nothing found.” |
| Public-to-connected agent continuity | Charter `PRODUCT.md:251-265`; A1/A4; Journey A/B `research/PACKAGE-6-INVERSE-PREMORTEM.md:406-443`. | **Partial** | The Provider handoff is specified more clearly than the buyer's selected Operation/input across native OAuth. No plan row owns preserving the agent's original job through connection. |
| Authority versus funding | Charter `PRODUCT.md:168-173`, agent model `251-265`; Locus authority evidence. | **Demonstrated in requirements** | The atomic plan correctly says connection does not grant authority and existing inspection/Invocation enforce it (`53-60`). It still needs behavior proof for insufficient authority and balance as distinct states. |
| Inspection, Invocation and uncertainty recovery | Charter `PRODUCT.md:258-275`; Package 4 recovery `docs/designs/package-4-atomic-feature-build-plan.md:399-455`; Journey D. | **Partial** | The plan states no blind Call and separates idempotence from uncertain recovery. It does not enumerate the cross-step branches: expired Commitment, possible Provider dispatch, missing Call, reconciliation required, restart and owner handoff. |
| 6B: simplify public Provider page | Roadmap `917`; B1 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:116-123`; amended Provider decision `research/PACKAGE-6-INVERSE-PREMORTEM.md:311`. | **Partial** | P6-07 says fit, requirements and outcomes but omits the mandatory questions: whether readiness can touch/cost the upstream, what Published does not guarantee, and what timing is unknown. |
| 6B: protocol details in documentation | Roadmap `918`; B2 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:125-132`. | **Questionable implementation interpretation** | “Existing documentation” is sound only if it projects AE's tested subsets and links upstream owners. The plan does not name the four owning pages/contracts, unsupported versions or drift test. A release guide is not Provider source documentation. |
| 6B: explain time, requirements and outcomes | Roadmap `919`; B1/B4 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:116-150`. | **Partial** | The plan assigns copy but sets no evidence rule for timing, freshness or owning authority. Unknown timing is acceptable; invented “usually” timing is not. |
| 6B: continue after sign-in | Roadmap `920`; B3 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:134-141`; Journey C `research/PACKAGE-6-INVERSE-PREMORTEM.md:445-467`. | **Partial** | P6-02/03 address the saved candidate, exits and readback. The acceptance omits sign-up instead of sign-in, cancellation, second tab, fresh process, changed source and wrong-account return. These are required behavior, not polish. |
| Provider manual/OAuth handoff boundary | Inverse premortem `312`, no-handroll `357-380`; Package 5 evidence `docs/guides/package-5-release-evidence.md:34-40`. | **Partial and decision missing** | The plan accepts manual handoff but does not list which source families lack a maintained hosted route and therefore justify it. Without that decision, “manual fallback” can silently become the primary credential workflow. |
| Provider state and next action | Package 5 projection `docs/guides/package-5-release-evidence.md:41-44`; D1; Journey C. | **Partial** | P6-04 says one continuation but does not require every eight-state/reason branch, waiting-with-no-action, source change, stale validation or exact owner. |
| 6C: canonical language | Roadmap `922-934`; C1–C3 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:152-179`; familiar-word map `research/PACKAGE-6-INVERSE-PREMORTEM.md:329-355`. | **Partial** | P6-09 says “consistent language on touched surfaces”, which is an undefined sample. It needs a named inventory of consequential routes, action descriptions, errors, CLI and generated guides, plus enumerated compatibility identifiers. |
| 6C: ordinary language without false simplification | Inverse premortem `313`, `329-355`. | **Absent** | The plan invokes CONTEXT but does not preserve the key usability correction: public users should not pass a glossary exam. Exact terms belong where authority, money and evidence matter. |
| 6C: claims cannot outrun evidence | Charter implementation boundary `PRODUCT.md:372-397`; C3 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:172-179`. | **Partial** | External gates are recorded honestly. There is no claim inventory or rule stopping source-complete Provider and Package 4 language from implying live, paid, useful or commercially closed behavior. |
| 6D: empty-state guidance and distinct states | Roadmap `938`; D2 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:192-199`; Journey D. | **Absent** | No task or acceptance row covers empty, confirmed zero, unavailable, blocked and unknown as five different states across web and machine surfaces. |
| 6D: inline explanations | Roadmap `939`; D3 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:201-208`. | **Partial** | Support/disclosure is assigned, but “inline explanations” has no content boundary. Essential cause and action must remain visible; raw code/version/reference may disclose. |
| 6D: clear corrective action | Roadmap `940`; D1 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:183-190`. | **Partial** | “One appropriate continuation” appears for Operation status only. The requirement applies across validation, auth, authority, funding, unavailable supply, uncertain dispatch and external handoffs. |
| 6D: advanced diagnostics behind disclosure | Roadmap `941`; D3. | **Partial** | P6-08 says disclosed diagnostics. It does not require secret/private-input exclusion, stable request reference, keyboard/screen-reader operation or visible recovery without expanding. |
| 6D: consistent success/failure wording | Roadmap `942`; D6 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:228-235`. | **Partial** | “Touched surfaces” and a shared skill do not prove semantic parity. One fixture per consequential state should compare web, HTTP, MCP, CLI and generated guidance. |
| 6D: durable resumable next actions | Roadmap `943-945`; D4 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:210-217`. | **Partial** | Provider attempts are addressed. Agent Call/Invocation recovery, owner handoff after restart, cancellation and lost conversation state are not a named acceptance matrix. |
| Accessible, private-safe support | D5 `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:219-226`; papercut private-support finding. | **Partial / blocked** | Keyboard and compact checks are too narrow. Screen-reader/status announcements, 200% zoom, safe-reference intake, secret rejection/redaction, mailbox delivery and retention ownership are absent or externally blocked. |
| Plugin packaging and distribution | Amended A2/A5; Journey A; release guide `41-68`, `70-150`. | **Accepted direction; blocked proof** | Joel accepted one OpenAI plugin and one shared skill in the prior task. A locally valid scaffold proves neither directory availability nor native authentication. Plugin removal, Account disconnect and source revocation must remain distinct. |
| Exactly four public tools | Atomic plan `13-16`, `34`; acceptance `61-63`. | **Accepted constraint; partial proof** | Joel accepted exactly four anonymous tools in the proposed plan. The choice is consistent with compact, public-before-auth discovery. The review should test that those four actually cover search, detail, comparison and truthful outage/no-match behavior within the byte budget; changing the count or freezing it as a long-term compatibility promise requires Joel. |
| One shared skill plus `/SKILL.md` | Atomic plan `16`, `38`; A6/C2/D6. | **Sound implementation choice, incomplete requirement** | Sharing one source prevents drift. It still requires live plugin snapshot parity, action/schema projection and a fresh-task behavior test. File identity alone is bookkeeping. |
| `app.aecon.ai` canonical origin | Atomic plan `17-18`; release guide `51-68`. | **Accepted intent, operationally blocked** | The name is recorded as intended origin, but DNS did not resolve. It must not appear in copied actions or support claims until same-revision HTTPS, OAuth resource/audience and public/legal/support endpoints pass. |
| First useful result | A4, Journey A/B, release cases. | **Absent from local completion definition** | The atomic plan's acceptance bullets stop at discovery/connection/status and package checks. The release guide supplies a free reference Operation, but explicitly says it proves mechanics, not commercial utility (`docs/guides/package-6-plugin-release.md:100-105`). Joel must choose whether mechanics or genuinely useful market value closes Package 6. |
| Rollout, production and commercial boundaries | Charter `PRODUCT.md:372-397`; Package 4/5 open gates; release guide `51-68`, `140-150`. | **Correctly blocked** | The documents are candid that no publication or production proof exists. Package 6 cannot be called complete while P6-10–12 are open, Package 4 paid-journey gates remain open and Package 5 lacks real-source/live-client proof. |

## Accepted product direction versus unverified assumptions

The repository records these as accepted decisions in the Package 6 plan (`docs/designs/package-6-atomic-feature-build-plan.md:11-24`). The prior task provides direct provenance: the proposed plan specified the OpenAI Plugin Directory as the recommended path, exactly four anonymous tools, one shared skill, `app.aecon.ai`, `support@aecon.ai` and Open-Meteo as the first-use Operation; Joel then said “Implement the proposed plan.” These are accepted directions, not reviewer assumptions:

- Public discovery before protected action.
- Native Account connection; no authentication tool or token-paste flow.
- One OpenAI plugin and one maintained skill, with Codex CLI, Claude Code and Cursor alternatives.
- Exactly four anonymous public tools and the stated context budget.
- Open-Meteo as the named first-use proof Operation.
- `app.aecon.ai`, Agentic Economy as publisher and `support@aecon.ai` as intended public identities.
- Reuse Package 4/5 action, source, attempt, status, Account and UI authorities.
- No installer, workflow, draft store, error taxonomy, CMS, ticketing or evaluation framework.
- External publication and real client proof are completion gates.

Those decisions do not prove these implementation assumptions:

- That the accepted OpenAI-first path overrides the native supported action in a user environment that is already open.
- That an OpenAI plugin distribution surface and its authentication contract work for the current bundle and server.
- That the four accepted anonymous tools behave correctly across no-match, outage, detail and comparison, or form a permanent compatibility promise beyond Package 6.
- That the accepted Open-Meteo proof Operation is currently admitted and returns a useful result on the deployed revision. The later release guide instead names an echo-style reference Operation, which proves mechanics only.
- That the existing manual credential form is justified for every source currently routed to it.
- That `support@aecon.ai` delivers mail, has an owner, safely handles request references or has a defined retention boundary.
- That `app.aecon.ai` is deployable, registered, secure and compatible merely because manifests name it.
- That Package 4/5 “source complete” capabilities are usable through the same deployed revision.
- That 105 focused tests and four browser checks cover actual client installation, native OAuth, purchase, Provider OAuth/manual recovery or commercial closure.

## Questions the plan failed to ask, or failed to answer

These need Joel's decision or an explicitly delegated owner. They should not be silently inferred from the implementation:

1. **What closes the first-value requirement now that the accepted Open-Meteo path is not the release guide's fixture?** The release guide's controlled reference Operation proves mechanics only (`100-105`). Either restore same-revision Open-Meteo proof or have Joel approve a different genuinely useful admitted Operation.
2. **How does the accepted OpenAI-first priority behave inside each host?** The distribution priority is settled. The remaining question is whether the action presented inside Codex, ChatGPT, Claude or Cursor always uses that environment's maintained supported path.
3. **Does the accepted four-tool count become a public compatibility promise after Package 6?** Package 6 behavior and byte limits are settled; future versioning/compatibility treatment is not.
4. **Which exact client builds and MCP revisions will be supported?** The Package 6 research made this a pre-implementation gate (`research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md:283-305`).
5. **Does the current MCP server meet the current OpenAI/MCP auth contract?** The unresolved `securitySchemes`/SDK premise is a release blocker, not a documentation footnote. The official supported route must be established before any workaround is designed.
6. **Which source families may use manual credentials, and why?** Each must have evidence that no maintained hosted/OAuth path exists. Otherwise official source ceremony wins.
7. **What wrong-account behavior is required?** Returning under another Business/Account must refuse or offer an explicit switch without rebinding the draft.
8. **What cancellation means at each layer?** Cancelling plugin install, AE connection, source OAuth, Provider submission and Invocation are different actions. Which durable state and next action follows each?
9. **Who owns private support?** Name mailbox delivery, response ownership, safe fields, secret rejection, retention and escalation. Package 7 can own policy maturity, but Package 6 cannot advertise a dead mailbox.
10. **Which claims are allowed before Package 4/5 close?** “Available,” “connected,” “published,” “paid,” “delivered,” “ready” and “complete” need explicit evidence gates.
11. **What current papercuts remain?** The September 3 register cannot be copied as current truth. Rerun only affected journeys on one deployed revision.
12. **Are local delivery and release completion labelled consistently everywhere?** They are legitimately different statuses. Every claim should preserve that distinction: local candidate delivered; Package 6 release incomplete until actual public installation (`docs/guides/package-6-plugin-release.md:147-150`).

## What should remain, be removed from the requirements, or be corrected

### Remain

- The nine amended user requirements in `research/PACKAGE-6-INVERSE-PREMORTEM.md:304-314`.
- Package 4's inspect, Invocation, idempotence and exact-reference recovery.
- Package 5's source-native Provider intake, durable attempt/draft/connection identifiers, official source adapters and one eight-state projection.
- Existing action/discovery contracts, reason codes, continuation registry, design-system components and generated human/machine surfaces.
- One shared skill source and a public `/SKILL.md` projection.
- Hard separation of public discovery, authentication, authority, funding, Commitment and Invocation.
- Honest external publication and production gates.

### Remove as standalone requirements

- “First successful connection” as a stored state. A real read/result is the proof.
- “Product language system” as software. It is a constraint on existing content owners.
- “Compatibility matrix” as a user workflow. It is release evidence and support documentation.
- “Versioned documentation” as a publishing platform. AE should publish its tested compatibility facts and link the protocol owner.
- “Durable guidance” as a task engine. Stable existing references and authoritative readback carry continuation.
- Treat “exactly four” as the accepted Package 6 contract. Do not silently extend it into a permanent cross-version promise.

These removals match the inverse premortem's explicit list (`research/PACKAGE-6-INVERSE-PREMORTEM.md:316-327`) and forward-implementation-first discipline: a file, bundle, status badge or copied command does not earn completion without behavior.

### Correct

- Correct the broken behavior first. Update the existing release evidence with a compact trace from each affected roadmap outcome to the retained Package 4/5 authority, black-box proof and claim enabled; do not create a new planning system.
- Move the live MCP/client/auth question ahead of plugin copy and distribution work. If an official SDK migration is needed, scope it as a prerequisite with its own compatibility proof.
- Specify agent intent preservation through native connection, not only Provider draft preservation.
- Expand Provider recovery to sign-up, cancellation, expiry, second tab, fresh process, source drift and wrong-account return.
- Replace “consistent language on touched surfaces” with a finite inventory and one fixture-per-state parity proof.
- Replace narrow keyboard/compact checks with the Package 6 accessibility boundary: keyboard, screen-reader/status announcements, 320px and 200% zoom, safe support references and secret rejection.
- Keep release proof types separate: static/schema, local unit/integration, local browser, deployed synthetic, actual client, external provider and paid commercial journey.

## Minimum decision and proof gates before grading Package 6

The implementation can be reviewed now, but it should be graded against these gates rather than the atomic plan's task checkboxes:

| Gate | Decision/proof required | Owner |
|---|---|---|
| Product closure | Re-prove the accepted Open-Meteo path or have Joel approve a replacement useful admitted Operation; a mechanics-only echo fixture cannot silently substitute. | Joel + market owner |
| Distribution | Preserve the accepted OpenAI priority; prove the maintained native action for every claimed environment. | Product + integration owner |
| Public API | Preserve four public tools for Package 6 and prove their behavior/byte budget; Joel decides only any future compatibility promise or count change. | API owner; Joel for scope change |
| MCP/auth | Official supported metadata/configuration path; exact client builds; same-revision install/auth/restart/revoke/reconnect. | Integration owner |
| Agent journey | Real public result/no-match/outage, protected challenge preserving intent, inspection, Invocation, uncertain recovery. | Agent surface owner |
| Provider journey | Each source family, public/protected source, OAuth/manual eligibility, cancellation, expiry, second tab, fresh process, changed source and wrong Account. | Provider surface owner |
| Language/parity | Consequential term/claim inventory and fixture parity across web, HTTP, MCP, CLI and generated guidance. | Feature owners, not a new copy system |
| Support/accessibility | Working private mailbox with a named recipient and safe-reference instructions; keyboard, screen-reader/status, zoom and compact checks. | Support + UI owner |
| Release/commercial | Resolvable canonical origin, verified publisher/legal/support, directory listing/install, Package 4/5 dependent gates and truthful claims. | Operator/business owner |

Until these gates are either passed or explicitly cut by Joel, the defensible status is: **Package 6 has a locally implemented candidate, but the requirements plan does not establish readiness and cannot support a completion claim.**
