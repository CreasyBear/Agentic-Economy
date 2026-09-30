# Production readiness: from diagnosis to live money (30 September 2026)

## Execution contract

The active execution queue is [Wayfinder #256](https://github.com/CreasyBear/Agentic-Economy/issues/256), including each ticket's current Briefing. The orchestrator owns direction, technical decisions, sequencing, integration and acceptance. Joel owns external commitments and launch authorization. This contract applies the `forward-implementation-first` and proportional iceinvein workflows to that queue.

### Global requirements

- Deliver the promotional-credit alpha: 20 invited users, A$10 each, founder-funded production USDC, Base first. Card funding belongs to beta. Preserve the recorded product decisions; resolve contradictory older text before implementing the affected behavior.
- One explicit money environment per deployment. Missing, invalid or mismatched authority, configuration or payment evidence refuses new financial effects. Hosting mode and key prefixes cannot silently select another money world.
- Preserve the customer journey: find a suitable Tool, use it within granted limits, obtain an answer and an understandable purchase record, recover when necessary, and continue. Optional intelligence may fall back to deterministic behavior; financial controls may not fall back to permissive behavior.
- Keep funding, spending authority, buyer credit, Provider expense, settlement and delivery distinct. Enforce the selected settled-2xx rule and source-correct remedies. Duplicate requests, concurrent attempts and interrupted writes must conserve money and preserve one effect identity.
- Uncertain external effects remain attributable to the original Call and consume the appropriate reserved capacity until resolved. Pausing new spending must leave admitted work recoverable.
- Reuse existing modules, maintained SDKs/components, official protocols and proven local patterns. Establish a concrete missing capability before adding an abstraction, dependency or parallel mechanism.
- Prove source behavior, deployed operation and live-money consequences separately. Completion requires the actual result and the expectation checked against it, including the relevant failure cases.

### Atomic agent chain

1. A bounded evidence/decomposition agent identifies the implementation delta, closest reference patterns, dependencies and exact file ownership. The orchestrator chooses the packet and applicable skills.
2. Where the boundary warrants it, a requirements agent drafts the specification from the orchestrator's decisions. The orchestrator settles Requires, Ensures, Invariant and On violation before edits.
3. An implementer receives one observable outcome, exclusive editable paths, fixed interfaces, exclusions and focused acceptance checks. It reports material ambiguity rather than expanding scope.
4. A different reviewer inspects the implementation against that contract and reports concrete defects. The orchestrator adjudicates findings and issues bounded corrections.
5. An evaluator exercises unresolved behavioral or runtime claims. The orchestrator inspects the decisive code and evidence, integrates the result, and accepts it or replays only the affected dependency cone.

Keep execution, independent review and behavioral evaluation in separate agents. An implementer's self-check does not substitute for either independent role. Keep at most three child lanes active; parallelize only independent light work with settled interfaces. Refill available lanes from useful bounded backlog. No recursive delegation. The root alone runs heavy checks, publishes changes and accepts completion.

Each packet names its parent issue, outcome, contract, owned files, protected files, dependencies, existing reference pattern, selected skill conclusions and observable checks. Handoffs are compact; they report changed behavior, evidence and literal blockers. The existing Wayfinder queue remains the plan, with no duplicate status system.

### Pitfalls to prevent

- Do not dispatch an entire cross-cutting issue to an unconstrained worker or let several workers edit shared manifest, schema, readiness or generated files.
- Do not rebuild functioning recovery because an older plan lists it as missing. Establish the smallest actual delta from current source and tests.
- Do not replace an SDK, ledger transaction, signed proof or maintained component with a local imitation without a demonstrated gap and an explicit design decision.
- Do not patch symptoms across callers while leaving their shared cause. Identify the owning boundary and verify every affected entry point.
- Do not confuse a passing mock, a file's existence, a green dashboard or an administrative receipt with the required outcome. Preserve product signatures, financial identity, real transaction evidence and substantive revision integrity.
- Do not rerun unchanged work or block forward progress on administrative hashes, locks, markers or certification. Preserve valid output and validate only the changed dependency cone, plus required integration/release checks.
- Do not run competing compilers, full suites, builds or large scans. Use Node 22 and npm 11.5.1; root runs `npm run check` for integrated changes and the full gate before merge or release.
- Do not broaden alpha into beta, incur new service costs, alter material commercial commitments, erase shared work or exercise live-money/launch actions without applicable authorization. Prepare concrete decisions and continue independent engineering.

### First implementation boundary

Start with #266's explicit deployment declaration, then enforce it at Quote, Call and funding admission. Build #267's credential controls and #268's rail consistency against the same contract; integrate #269's supply/development-surface restrictions and #270's behavioral isolation proof. Serialize overlapping files. Investigate #289 against the latest identity implementation and reuse its existing signed consequence-proof pattern. Existing chat work remains separately owned.

Design review synthesis: the thesis is one bounded purchase that remains financially explainable through failure. The scope coheres around that thesis. The main risks are environment bypasses, duplicate or stranded financial effects, and drift between separately deployed runtimes. Token, compute and solo-operator constraints favor small dependency cones and maintained capabilities. Cut duplicate ledgers, replacement auth/signing frameworks, new orchestration infrastructure and administrative completion gates. The review uses the recorded decisions directly; a new interview is unnecessary.

### Implementation checkpoint — 30 September 2026

#266 is implemented in the isolated `codex/production-money` worktree. Its release acceptance remains open until the complete gate passes.

- **Contract:** require the exact deployment declaration before new Quote, Call, funding or supply-write work; match stored and requested payment environments; refuse missing/malformed/mismatched inputs before financial effects. Consumed Call replay and uncertain-effect recovery retain their existing order. Funding readback cannot send a stored payment to the opposite Stripe rail; terminal expired/failed handoff status remains readable.
- **Simplification:** one required declaration replaces the service-mode and synthetic-profile selectors. Development has one deterministic fixture. Historical stored synthetic control values remain readable; they cannot select a new execution path or satisfy production policy controls. No service, dependency, schema migration or buyer approval step was added.
- **Verified:** `npm run check` passes, including zero dependency cycles. Anonymous Convex generation reproduces all seven generated files; the public build passes release-integrity verification. Focused tests cover both environment directions, absent/invalid declarations, recovery and configuration overrides. The funding HTTP/recovery suite passes 24 tests. `npm run test:release:unit` passes 6,284 tests (one skipped). The full integration run passed 1,956 and failed 30; the three declaration-related failures subsequently pass in focused Workpool/invoice-history checks (three passed, 19 skipped). The 27 inherited failures across eight chat/provider integration files remain a release blocker. The full gate is not green; browser/SEO/CLI acceptance beyond its stopped stage remains unverified. These results do not establish deployed or live-money readiness.
- **Review corrections:** an independent review found the opposite-rail funding readback gap and it was fixed. The actual anonymous CLI proof exposed an unsupported local-selector combination; anonymous and named local launch paths now use their appropriate Convex CLI selection. The local launcher suite passes 60 tests.
- **Handover:** preserve the identity A-then-B deployment order in `docs/operations/identity-slim-release.md`. Provision matching declarations separately in Vercel and Convex before deployment. Continue with #267 credential isolation, #268 rail consistency and #269 public/development surface isolation before #270's integrated proof. No deployment or live-money operation has been performed.

### Credential isolation checkpoint — 30 September 2026

#267 source implementation and its affected checks are complete. Release acceptance remains open with the integrated isolation stage.

- **Contract:** issuance, authentication, canonical credential admission and OAuth issuance/rotation require an explicit matching deployment environment. Production cannot admit unrestricted test authority. Refusal occurs before creating a credential or admitting a protected action; cancellation, expiry, revocation and completed cleanup readback retain their existing recovery semantics.
- **Buyer behavior:** owner chat receives a deployment-specific grant, bounded in production to A$1 per Call, A$5 daily and A$20 monthly, without an additional step-up prompt. Generic production key defaults remain unchanged. The key form derives its environment from the server; URL and restored-draft values cannot select another environment.
- **Migration and retries:** the old sandbox owner-chat grant is revoked through the existing canonical lifecycle before creating its successor. Interrupted provider cleanup remains retryable, and the stable issuance identity prevents duplicate grants. The old grant is never relabelled as production. Chat selects one active grant in its deployment; same-environment ambiguity refuses selection.
- **Complexity decision:** keep one narrow authenticated lookup for the historical grant, reusing the existing revocation and issuance machinery. It isolates legacy identity lookup without adding a migration state, service or dependency. Remove the environment selector and its draft state, eliminating a choice the deployment already owns.
- **Verified:** `npm run check` passes with zero dependency cycles. `npm run test:release:unit` passes 6,347 tests (one skipped). Anonymous Convex generation reproduces seven files. The 75 selected access-policy, principal and OAuth integration tests pass; the adjacent scheduled-chat suite passes 15 and retains its ten inherited failures. React Doctor reports no introduced findings against the preceding stage (91/100). Source tests cover opposite environments, missing/malformed declarations and claims, no-effects refusals, cleanup interruption/retry, duplicate issuance, OAuth recovery and UI draft/reset behavior. Full browser and deployed-credential proof remain unverified; the complete release gate is not green.
- **Handover:** continue with #268's Formance configuration comparison, missing rail diagnosis, public funding refusal and 30-minute treasury freshness. Stripe remains optional for the promotional-credit alpha, but an invoked funding surface must refuse if Stripe is unconfigured. Keep the identity A-then-B release order and the inherited integration blockers visible. No deployment, provisioning or live-money action has occurred.

### Rail and treasury checkpoint — 30 September 2026

#268 closes the remaining configuration and observation gaps using the existing readers and Quote boundary.

- **Contract:** require exact, matching deployment and Formance declarations before constructing a ledger client. Missing Formance environment is a manifest finding in development and production. Public and owner funding constraints share the same Stripe configuration fence; an absent, unrestricted or opposite-rail key cannot produce usable constraints. Stripe remains optional for the promotional-credit alpha until a funding operation is requested.
- **Treasury evidence:** use only the newest observation for the configured environment, custody identity and credential generation, with the existing network/amount checks. Its `observedAt` must be a safe integer between `now - 30 minutes` and `now`, inclusive. Invalid evidence omits capacity; it cannot fall back to an older row or become fresh through `recordedAt`. Existing paid Quote refusal and recovery behavior remain in place.
- **Scope and cost:** four existing production files, no additional query, schema, dependency, service, retry layer or buyer interaction. The 30-minute limit tolerates one missed 15-minute observation cycle; its operational sufficiency still requires deployed evidence.
- **Verified:** `npm run check` passes with zero dependency cycles; `npm run test:release:unit` passes 6,373 tests (one skipped). The focused Formance suite passes 45 tests, manifest/funding suites pass 78, and Quote preparation passes 33. The existing paid Quote handler also returns `treasury_capacity_unavailable` for stale evidence, performs only its inspection action and writes no Quote. Independent review found no actionable bypass in the four changed production files. Live ledger/custody behavior remains unverified, and the inherited integration failures still prevent release acceptance.
- **Handover:** declare `AE_FORMANCE_ENVIRONMENT=sandbox` alongside development money for local/source validation, or `production` for production money. Continue with #269's network selection across directory ingestion, browsing, exact resolution and chat, plus development-only entry points. Preserve the inherited integration blockers for #270; no deployment or live payment is implied by these source checks.

### Directory and development-surface checkpoint — 30 September 2026

#269 closes the directory, chat and development-entry-point isolation boundary. The x402 directory remains the primary discovery surface; the environment is deployment configuration, not a buyer choice.

- **Contract:** require an exact deployment declaration; production selects Base Mainnet and development selects Base Sepolia. Enforce it at admission, publication, indexed browse/compact search, exact resource/ID/slug lookup, selected source, raw directory fallback and direct resolution. Mixed listings select and display only the matching payment option while retaining complete upstream challenge evidence. Missing or opposite environments refuse before new publication or financial effects.
- **Consumer behavior:** the public Tool descriptor and both wire validators carry publication `runtimeEnvironment`. Chat checks that environment, health and any declared payment network; query words such as “testnet” cannot bypass selection. Home rails and compact external leads use the same deployment network. No selector, service, dependency, schema migration or additional approval step was introduced.
- **Development doors:** all four seed registrations, including continuation, refuse before seed effects outside development. The sandbox reference route returns 404 before request admission/body processing. The provider-consequence route refuses raw-key x402 ticket issuance and execution before attestation, vault access or provider calls outside development. Its permitted development receipt verification uses the sandbox environment; non-x402 provider consequences retain their existing behavior.
- **Verified:** `npm run check` passes with zero dependency cycles. The full unit suite passes 6,398 tests (one skipped); anonymous Convex generation reproduces all seven generated files. Indexed directory integration passes 18 tests, including both deployments and both mixed-price orders. Additional direct resolution cases prove matching publication in both deployments and no publication for opposite-only upstream resources. Focused publication checks prove wrong/missing declarations create no supply. Seed/HTTP and signer tests establish refusal before effects; non-x402 execution controls pass. Integration exposed a missing Convex Tool return validator, which was fixed alongside the descriptor consumer fixtures.
- **Integration baseline:** the full run passed 1,989 tests and failed 38 before fixture correction. Eleven new failures came from existing mainnet fixtures using the development default; all now pass in their affected reruns. The original 27 failures across eight chat/provider files remain. The complete gate is not green and no browser, deployed or live-money claim is made.
- **Handover:** #270 consolidates the cross-boundary production refusal proof and resolves the inherited gate failures. Preserve the identity A-then-B deployment order and provision matching declarations in both runtimes. This checkpoint is local source work; nothing has been deployed and no live payment has run.

### Integrated isolation checkpoint — 30 September 2026

#270 establishes the production refusal proof across valid stored authority, Quotes, Tools, funding, configuration, discovery, chat and development entry points. The four focused integration files are included in the existing release gate.

- **Contract:** valid opposite-environment inputs must reach the relevant fence and refuse before creating a Quote, consuming a Quote, recording a Call/Provider obligation, funding command, publication or provider/signing request. Same-environment controls establish that an earlier parser or unrelated fixture failure cannot satisfy the proof. Treasury capacity expires immediately beyond the agreed inclusive 30-minute boundary.
- **Source correction:** provider directory projection now translates the managed pricing requirement's payment network into directory prices, search rows and facets. The canonical publication namespace remains `ae:public`; missing or malformed x402 pricing creates no chain-specific projection. Existing non-x402 projection behavior is preserved. This changes two existing production files and adds no service, dependency, index or buyer step.
- **Independent evidence:** a separate evaluator passed all 19 isolation cases, temporarily disabled the sandbox-route guard, observed the expected 200-versus-404 failure, restored the exact source bytes and passed the restored case. A separate reviewer inspected the implementation and resulting fixes. Execution, review and evaluation remain separate roles.
- **Inherited failures:** all 27 integration failures are resolved. Fixtures now use supported x402 owner flows, current immediate-catalogue chat behavior and persisted terminal outcomes. OAuth cancellation and late-callback refusal remain covered. Actual readiness probing distinguishes a valid encoded 402 challenge (`published`) from a malformed challenge (`action_required`) and preserves one admission case on replay.
- **Verified:** final `npm run check` passes with zero dependency cycles. The full gate passed anonymous Convex generation, public build integrity, 6,398 unit tests (one skipped), 2,048 integration tests (30 skipped, three todo), four type tests, 74 import checks, TypeScript standards, 31 SEO tests and 16 browser tests. It then stopped on two stale accessibility selectors. After correcting the selector and adding a keyboard-focus assertion, `npm run test:e2e:a11y` passed all 18 tests and `npm run test:cli-package` passed reproducible packaging. Thus every source-gate stage has passing evidence across the full run and its focused continuation; an uninterrupted final gate remains required before merge/release. Browser checks here use the configured source-only server, not an authenticated deployed backend.
- **Handover:** isolation source work is locally accepted. Continue with #271's settled-2xx accounting rule and retained-response recovery, preserving the existing canonical-safe-block proof for expired unused authorizations. Deployed isolation, the full paid development Call and live-money drills remain unproven. No deployment, production configuration change or live payment has occurred.

### Settled-response implementation contract — #271

- **Requires:** one admitted managed x402 Call, its original payment attempt and reservation, a validated original paid HTTP status, and independently verified exact settlement before deciding either economic leg.
- **Ensures:** settled 2xx captures buyer AUD and settles Provider USDC once; invalid output remains a delivery refusal with a paid receipt. Settled HTTP errors restore the buyer's reserved credit, retain the settled Provider expense and close with the existing public `provider_refused` code and `provider_http_error` receipt fact so selection evidence counts the failure. The exact HTTP status remains on the attributed payment attempt.
- **Invariant:** payment, HTTP status and parsed delivery remain separate facts. The existing response checkpoint retains status before chain verification, including when there is no usable JSON. Retry uses the same Call, attempt, nonce, reservation and ledger command identity; it never signs or dispatches again. Expiry release still requires every configured RPC to establish an unused nonce at a canonical safe block after expiry.
- **On violation:** missing, invalid, conflicting or unavailable evidence holds the reservation for recovery. Interrupted ledger or receipt writes retain the existing recovery ownership and resume the same financial effect.
- **Design and ownership:** extend existing observation/checkpoint fields, strict validators and atomic ledger/remedy paths; no new service, queue or financial template. Optional stored status preserves old rows without fabricating evidence. Transport, persistence and remedy implementation packets have exclusive files; root integrates worker/recovery behavior, and separate agents review and evaluate it. Verification covers malformed 2xx, settled 4xx/5xx, absent/conflicting evidence, interrupted writes, replay and unchanged expired-unused proof.


### Settled-response source checkpoint — #271

- **Implemented locally:** paid HTTP status survives parsing and is checkpointed before exact settlement verification. Verified 2xx captures both economic legs even for invalid/malformed output; receipt, paid usage and terminal Purchase resolution preserve failed delivery. Verified 3xx–5xx (including 402 with payment evidence) restores buyer credit and settles the existing Provider expense. Public refusal remains `provider_refused`, with the separate `provider_http_error` receipt fact; the existing selection evidence records one Provider failure.
- **Recovery and integrity:** missing/conflicting status cannot authorize charging or release. A status-only 2xx cannot enter the lost-response remedy. Checkpoint attribution, revoked-credential recovery, exact proof, concurrent remedy claims, interrupted ledger/receipt writes and replay preserve the original financial identities. Terminal paid-refusal replay cannot overwrite accounting references. Existing canonical-safe-block expiry proof remains unchanged.
- **Verified:** `npm run check` passes with zero cycles. The full unit run reached 6,431 passes and four failures; the substantive missing paid-refusal Purchase resolution and two stale expectations were repaired, and all 142 checks across those five affected suites passed. Full integration then passed 2,072 checks (30 skipped, three todo). Anonymous Convex regeneration reproduced all seven files. Existing Formance posting and expired-unused authorization cases passed in the unit run.
- **Independent acceptance:** the separate reviewer found and root fixed receipt classification and public refusal parsing; final review found no remaining defect in the subsequent Purchase resolution, replay and 402 changes. A separate evaluator proved that a paid 200 echoing its payment signature into a response header creates no response checkpoint, invokes no settlement verification, exposes no secret and remains unknown (one focused probe; temporary test removed).
- **Runtime limit / handover:** no Formance service is listening at the maintained default loopback endpoint `127.0.0.1:3069`. Three additional existing-harness smoke cases are prepared for malformed/invalid paid 200 and settled 500 with ledger/replay/ranking assertions, but their external ledger behavior has not run. They do not move real money; Provider signing/RPC boundaries are test fixtures. The Formance smoke, deployed development paid Call and authorized live-money drills remain outstanding. Continue unblocked source work at #272; do not close #271's runtime acceptance or claim production readiness from this checkpoint.

### Promotional-credit implementation contract — #272

The AFK issue fixes the product decision: explicit expiry per grant, promo first,
and purchased credit remains separate. The design review therefore uses that
decision directly. Implementation is split at the ledger/allocation boundary,
then operator issuance and balance presentation; neither slice alone closes #272.

**Requires:** a positive bounded AUD amount, an existing Account in the admitted
environment, future explicit expiry, owner-admin authority, fresh MFA, reason and
evidence, and an exact second approval where the existing owner-count policy
requires it. Paid Call admission requires an immutable Quote and atomically
claims unexpired grants in expiry order before submitting the ledger reservation.

**Ensures:** issuance is spendable only after exact ledger confirmation. A Call
stores purchased units and every grant contribution before external submission;
retry, settlement and release reuse that allocation. Purchased revenue/GST is
proportional to purchased consideration; redeemed promo transfers to marketing
expense. Issuance and expiry create neither sales/GST nor marketing expense.

**Reservation recovery:** a Call stores one bounded attempt record (generation,
lease deadline, ambiguity). Only its current first attempt may abandon after an
explicit absent/refused ledger result. A takeover marks ambiguity permanently;
lease expiry permits exact-command retry but never proves that the old write is
absent. Confirmed reference readback attaches once. This small record preserves
ordinary insufficient-funds cleanup without allowing a concurrent failure to
restore another attempt's grant. Reusing only the existing pending flag either
stranded interrupted Calls or made release unsafe; keep the attempt record.

**Invariant:** the ledger remains the money authority. The transactional grant
counter controls eligibility and concurrent allocation, never creates funds.
Budget, legal exposure and Provider obligations retain the full accepted Call
value. Legacy v1.3/v1.4 schemas and command identities remain unchanged. Expiry
filters apply during admission and reads, independently of cleanup. A returned
expired contribution cannot be spent; its original grant receives the fixed
ledger return and a separately frozen expiry operation removes it.

**On violation:** invalid authority/input refuses without issuance; uncertain
external writes retain the immutable pending operation and claimed funds for
exact-reference recovery. Definitively absent reservations may restore claims.
At most 100 grant contributions fit one atomic Call; if more are required,
admission refuses without substituting purchased credit or partially claiming.

**Complexity decision:** retain the existing native atomic bulk, adding one
templated transfer per grant and a frozen allocation on Call. This adds a bounded
array and indexed grant lifecycle, but avoids a second ledger, variable script
generation, a new queue, or a recomputed refund policy. A shared allocation
contract isolates the common wire shape; grant eligibility belongs beside the
existing money concerns. Expiry uses the existing admitted workload framework.
Verification must cover mixed/all-promo posting, duplicate and concurrent
admission, exact replay, unknown writes, late returns and old schema recovery.
The operator form adds amount/expiry to the existing audited action flow; the
customer sees total, purchased, promo and next expiry, without another decision.

### Promotional-credit source checkpoint — #272

- **Implemented locally:** audited owner-admin grants with fresh MFA, explicit expiry and exact second approval where required; pending receipts until confirmed native-ledger issuance; earliest-expiry allocation frozen on each Call; separate purchased and promotional ledger pools, balances and history; bounded expiry/retry through the existing admitted workload. Buyer sale/GST tracks purchased consideration, and only redeemed promo becomes marketing expense.
- **Integrity and recovery:** native atomic reservation prevents overdraft. Transactional grant claims prevent concurrent over-allocation. A generation/lease record serializes external reservation attempts; ambiguity retains claims until the same command is confirmed. Expired grant returns never become spendable. Interrupted initial Call reservations currently require a same-key caller retry; there is no autonomous sweep for those pending Call reservations.
- **Verified:** final `npm run check` passes with zero cycles, including generated API/string-reference fences. Anonymous Convex generation passed all seven files. The full unit run passed 6,449 tests before finding 17 compatibility/fixture failures; the fixes and affected cron assertions then passed all 143 tests across seven suites. Additional focused tests cover grant authority/approval/receipts, bounded expiry, balance eligibility and ledger readback, mixed/all-promo history, concurrent admission and reservation takeover. Two native Formance promotional-credit integration tests pass, including exact replay, expiry and concurrent atomic no-overdraft behavior.
- **Independent acceptance:** separate implementation, review and evaluation packets covered ledger/allocation, admin lifecycle and balance presentation. Review findings on reservation ambiguity, expiry scheduling and attribution were resolved and reviewed. No new service, dependency or customer decision was added.
- **Runtime handover:** the maintained local Formance 2.4.12/PostgreSQL stack is now available for test-only proof. Native paid-Call tests pass treasury exhaustion and paid invalid/malformed 200 settlement. Twelve remaining runtime failures concern MCP/CLI fixtures, mainnet admission/clock fixtures and the settled-500 remedy. Carry these into the next acceptance stage; #271 runtime acceptance and deployed development paid-Call proof remain open. Nothing was deployed and no live money moved.

### Native paid-Call acceptance contract — #271/#272

Requires the admitted environment, token network/address, six-decimal amount and exact original transfer proof before remedy. The Tool's display price label does not establish its settlement asset. Ensures a verified paid HTTP error restores buyer credit and retains the Provider expense once; replay uses the same ledger command. Missing or conflicting identity/proof retains the reservation for recovery. The native runtime test is the acceptance boundary, with separate review and evaluation of any resulting correction.

### Native paid-Call acceptance checkpoint — #271/#272

- **Corrected:** recovery validates the admitted environment/network/token and exact transfer proof. A Tool price labelled `USD` no longer blocks recovery of its verified USDC payment. Neither the onchain proof nor the held-booking/claim/idempotency controls changed.
- **Verified:** final `npm run check` passes with zero dependency cycles. All 26 native Formance integration cases pass, including mainnet-profile settlement/drift, sandbox purchase across HTTP/MCP/CLI, fresh-process acknowledgement-loss recovery, UTC spending boundaries, treasury exhaustion, malformed/invalid paid 200, paid 500, promotional allocation/expiry and concurrent no-overdraft. The 20 remedy unit tests pass too. The mainnet-profile tests explicitly route a fixture HTTPS origin to the loopback ledger; RPC/custody are fixtures. This establishes application/native-ledger behavior, not a deployed or real-money Call.
- **Independent evidence:** review accepted the asset-based guard with existing exact EIP-3009 attribution and concurrency controls. A separate evaluator restored the former currency guard temporarily: both USD recovery cases failed with `payment_identity_unavailable`; restoring the exact source bytes made both pass. Fixture corrections align environment claims, current CLI references/actions and the treasury observation clock with their existing contracts.
- **Handover:** #271's prepared native-ledger proof is now accepted locally, and #272's native posting proof remains green. Continue with #273, the settled-sale report/refund path. Deployed development proof, provisioning, final release gate and authorized live-money drills remain outstanding. No deployment or live payment occurred.

### Settled-answer report contract — #273

**Requires:** current owner authority for the exact Account/Call, a completed paid and settled buyer sale, an unchanged frozen booking, and a slot under the canonical person's UTC-day report limit (default three; optional operations-policy control). One existing report always replays before consuming another slot. Free, held, reversed and foreign-account Calls are ineligible.

**Ensures:** one atomic native-ledger reversal restores purchased net/tax and original promotional grants, exposure and the original spending allowances. The Provider remains paid and delivered output remains available. Only exact confirmed posting changes the receipt/usage and current Purchase resolution to refunded. The report retains the original resolution and settlement references as its adjustment evidence. Expired promotional grants keep their original expiry and cannot become spendable.

**Invariant / failure:** one report per Call, transactional quota enforcement, immutable refund command, original policy generations/periods and no new Provider request or payment. Pending external writes stay pending and retry the same command through the existing admitted workload. Quota refusal preserves the support route. A separate 30-day distinct-reporter signal lowers selection rank; it never changes delivery success counts or success-rate copy.

**Design and complexity decision:** retain one report row as both audit fact and bounded pending work, plus a shared booking validator for the existing Node consequence and the frozen report. Add a versioned settled-sale reversal using existing native atomic bulk/reference readback; preserve historical schema digests and command identities. Reuse the operations-policy approval flow and existing authenticated owner server functions. A shared report control serves the paid chip and receipt and verifies eligibility from the owner read before enabling the action. No new service, queue, dependency, user text field, MFA or confirmation step. Keep these additions because reservation release cannot reverse a consumed sale and generic ratings cannot enforce per-Call refunds or a concurrent per-person quota.

**Verification:** source-correct purchased/mixed/all-promo reversal, expired returned grants, unchanged paid Provider, replay/concurrent attempts, daily quota with separate owners, interrupted posting/finalization, receipt/Purchase status and ranking separation; authoritative eligibility and pending/refunded/support states on both UI surfaces. Root integrates the producer/consumer contract, and separate review and behavioral evaluation remain required.

### Settled-answer report checkpoint — #273

- **Implemented locally:** the owner can report a completed paid Call from its chat chip or receipt. One immutable report consumes one canonical person's UTC-day slot, restores the original purchased/promotional credit sources, preserves the paid Provider and answer, and changes Purchase/receipt/history only after exact native-ledger confirmation. Retry and the existing admitted workload resume the same command. Above the default three reports, support remains reachable; operations policy can configure the limit. Expired promotional credit retains its expiry.
- **Selection:** one evidence fact per Call feeds a separate 30-day distinct-reporter signal through procurement and both chat selectors. The bounded penalty is `0.15 × reporters / (reporters + 3)`; no-report scores and delivery-success counts remain unchanged.
- **Integrity correction:** original sale and refund readback must match exact posting amounts, assets, sources and destinations as well as command metadata; reverted transactions cannot prove completion. Existing Call commands remain on schema v1.5, while the new refund templates use v1.6. Original receipt issuance time, evidence hash and settlement references remain intact.
- **Verified:** `npm run check` passes, including 74 import checks, types, the TypeScript standards fence and zero cycles. Anonymous Convex regeneration passed all seven files. The 29-suite affected run passed 351 tests and exposed seven fixture failures; corrected fixture and final quota/UI/receipt reruns pass all 40 checks across five suites. All 30 native-ledger cases pass, including pure purchased, mixed and all-promo refunds and interruption after ledger posting before local finalization. Concurrent public retries produce one report, credit restoration and evidence fact. Separate-owner and next-UTC-day quota assertions pass.
- **Independent acceptance:** a separate reviewer required exact posting proof and preserved original receipt evidence; both corrections are applied. A separate evaluator passed six adversarial/control cases, disabled posting comparison, observed the four expected tampering failures with two controls still passing, restored exact source bytes and passed all six again. React Doctor reports no introduced errors against the preceding commit; five advisory findings remain for the bounded sequential recovery/schema reads, existing ToolCard structure and report-control branching. No additional abstraction or concurrent financial workload was added to satisfy a heuristic.
- **Handover:** #273 is accepted locally at the source/native-ledger boundary. Authenticated deployed UI, provider/custody operation and the final complete release gate remain unverified. Continue with #274's mandatory signing gate and atomic spending caps. TRM tenant documentation/entitlement remains an external dependency; absence cannot authorize signing. Nothing was deployed and no live money moved.

### Integrated source-gate acceptance — #266–#273

The uninterrupted release gate passes on `2d674d5fe` with explicit development/sandbox declarations: `AE_DEPLOYMENT_ENVIRONMENT=development AE_FORMANCE_ENVIRONMENT=sandbox npm run gate` under Node 22/npm 11.5.1. Evidence: anonymous Convex generation, public build integrity, 6,487 unit passes (one skipped), 2,095 integration passes (39 skipped, three todo), four type tests, 74 import checks, TypeScript standards, 31 SEO tests, 16 browser journeys, 18 accessibility checks and reproducible CLI packaging. Three stale table/cron inventory assertions found in the first run were corrected; the recovery wrapper is included in authority tests. The separate native-ledger run passed all 30 cases. Source issues #266–#273 can close at this boundary; #279/#286/#287 still own deployed and live-money acceptance.

### Signing admission implementation contract — #274

**Requires:** exact persisted unsigned material whose accepted requirement, EIP-3009 authorization and typed message agree on recipient, amount and all authorization fields; the deployment's Base/USDC profile; complete trusted limits; a fresh explicit clear for the exact recipient/material before each actual CDP invocation, including forensic replay. A callback failure is not a definitive CDP rejection.

**Ensures:** the audit decision and one immutable exposure reservation commit atomically before signing. Retried signatures require a new screening invocation but reuse the attempt/effect reservation. Refusals return without signing and retain audit evidence. The signer rechecks normal authorization lifetime after the awaited admission and protects its intent from callback mutation.

**Invariant / recovery:** platform and normalized-payee buckets span custody/credential rotations. Platform rolling exposure includes all unresolved liabilities plus settlements confirmed within the last 24 hours; Call exposure covers its lifetime non-unused authorizations. A new payee's first admitted reservation starts its 24-hour tighter limit. Only conclusive settlement, expiry/unused, cancellation or definitive no-sign evidence can resolve exposure. An empty new table cannot erase legacy liability; incomplete or saturated history refuses. Missing configuration and unavailable/ambiguous screening never default to clearance.

**Design and complexity:** keep one screening table and one reservation table, existing payment-attempt identity and Convex transactions. Derive first payee admission from retained reservation history; avoid another counter table, ledger, service or queue. Four canonical USDC/6 ceilings reuse the existing Call/platform configuration and add payee/new-payee values; no live dollar defaults are chosen. Exact indexed BigInt sums and bounded refusal buy concurrency and uncertainty safety at the cost of two durable records and focused integration hooks. Separate implementation packets own the signing leaf and atomic admission; root owns orchestration, resolution hooks and acceptance. Tests must show zero signatures on every refusal, one exposure under retry/concurrency, rolling-time and rotation behavior, and retained uncertain liability.

**External dependency:** official [TRM API documentation](https://docs.trmlabs.com/api-reference) and [agent access guide](https://docs.trmlabs.com/guides/resources/how-to) were located. Wallet Screening schemas are account-entitled; the available browser exposes public documentation only. Its endpoint/schema, tenant access and retention rights remain unverified. Implement the mandatory boundary while keeping the real adapter unavailable until that contract is accessible; do not substitute the distinct public Sanctions API or guessed third-party schemas.

### Signing admission source checkpoint — #274

- **Implemented:** both CDP signing paths require the exact canonical EIP-3009 material and a fresh committed admission. Normal signing rechecks lifetime after admission. The screening provider currently returns explicit unavailability; there is no runtime clear fixture or configurable bypass. A dedicated money server entry keeps the provider boundary out of the web framework's bundle.
- **Durable limits:** one single-use screening audit and one immutable exposure reservation commit in the same Convex transaction. All four ceilings are trusted canonical USDC atomic values, without live defaults. Platform and payee exposure span wallet rotations; unresolved liability never ages out. Settlements age from conclusive confirmation, while each Call retains its lifetime non-unused total. Legacy or incomplete history refuses; a variable-size legacy scan stops early and preserves transaction headroom for the refusal audit.
- **Recovery:** every actual forensic replay still requires fresh screening, current durable authority and cap admission. Only expired, unsubmitted material is eligible. Conclusive cancellation, expired-unused or definitive CDP no-sign evidence can release exposure; generic `not_settled`, HTTP failures and uncertainty cannot. A saved exact no-sign proof resumes interrupted financial/control finalization without another signature. Terminal exposure cannot be signed again.
- **Review:** independent signing and cap reviews found two material defects during integration: premature terminal exposure blocked a recovery retry, and a fixed legacy-row batch could exhaust transaction bytes before the refusal audit. Durable proof resumption and a bounded iterator/headroom check resolve them; both focused source re-reviews are clear.
- **Verified:** `npm run check` passes on the restored source, including zero dependency cycles, incremental types, 74 import/boundary checks and the TypeScript standard. Anonymous Convex regeneration passes all seven files. The affected signing/recovery cone passes 198 cases; 116 orchestration/expiry/deployment cases pass separately, and the schema inventory passes 10. The final cap and independently authored recovery packet passes 37 cases (30 cap, seven recovery). It proves the first-admission payee clock, retained uncertainty and resumption after financial/control interruption without further signing. Seven targeted source mutants are killed with unchanged refusal controls passing; every mutation is restored by byte-for-byte verification and the 37-case baseline passes again. Counts overlap. The recovery evaluator uses actual controller, signing leaf and registered proof transactions, with bounded loader/control/admission and external-ledger seams.
- **Handover limit:** #274 remains open for the entitled TRM contract, real adapter and deployed acceptance. The conservative legacy cutover requires a deployment history audit before enabling an existing populated lane. Runtime transaction metrics, real TRM/CDP operation and cloud concurrency are not proven by local tests. The complete release gate must run again after the remaining source work and before merge/release. No production deployment or live money was authorized or moved.

### Treasury implementation contract — #275

**Purpose and scope:** give the operator a trustworthy view of aecon's own USDC working capital, automatic deposit accounting, and a fast way to stop new purchases. The design review runs against the accepted AFK design, without an interview. Its coherent five groups are Float, Runway, Coverage, In flight and Actions; the highest risk is financial evidence, not another dashboard abstraction. Keep existing Formance, RPC, cron, MFA and approval capabilities. No outbound transfer UI, new service or generic accounting framework.

**Requires:** an explicit deployment payment environment, its configured custody identity, canonical USDC and bounded agreeing chain evidence. **Ensures:** incoming transfers book once through the existing native ledger executor; retries after posting resume the same transfer identity. A fresh observation alone is not a deposit. **Invariant:** balances, deposits, payments and purchase outcomes remain distinct; unexplained falls or incomplete evidence never create money or appear reconciled. Quote freshness is already implemented. The observer must read only its deployment's network. **On violation:** retain the last trustworthy checkpoint, expose unavailable/conflicting evidence, and retry the same pending work; native posting ambiguity is not a zero balance.

**Design correction:** the proposed positive balance-minus-ledger algorithm can mint a false deposit when a stale chain observation overlaps settlement. Use finalized incoming USDC Transfer identities instead. Establish one durable opening checkpoint for a clean treasury generation, retain a pending range before external writes, book every transfer by network/transaction/log identity, and advance the cursor only after exact ledger readback. Existing populated generations require an explicit cutover audit; never silently reinitialize them. Credential generation changes must not reset a wallet's checkpoint.

**Protected cash buffer:** native integration exposed that crediting the full opening balance made the existing buffer spendable. Keep it in a separate purpose-derived corporate committed account, distinct from Call commitments, and atomically book full incoming cash plus the buffer allocation using existing v1.5 templates/bulk execution. The pending range freezes the target, prior proven buffer and increase; empty and small first deposits fill the buffer before becoming spendable. Verify native buffer continuity before new credits and exact posting readback before advancing. A changed custody generation or buffer target requires cutover. Reconciliation includes available cash + Call commitments + protected buffer. This adds one account and two range amounts, preserves the existing floor under concurrent Calls, and avoids a new ledger schema or off-ledger cash adjustment.

**Controls:** pause changes `paymentsOpenTo` to `none`, retaining its prior audience; resume restores that audience. Fresh MFA and audit use the existing command envelope. Pause needs one owner; resume uses the existing second-owner rule. The production default is admins, development everyone. Thresholds default to three/14 days of measured burn; a fixed USDC low-water/target pair is an explicit alternate state. Use USDC 0.01 drift tolerance and 30 minutes for unresolved-reservation age. New paid Quote admission, owner-chat spending activation, and first acceptance of an unused paid Quote respect pause; accepted Calls retain replay and recovery authority.

**Complexity and verification:** one treasury checkpoint/pending-range boundary isolates external chain-to-ledger recovery; existing native transfer templates and exact-reference execution avoid another ledger/schema protocol. Typed thresholds and evidence states prevent absent data becoming zero. The screen keeps comparisons together and reveals refill details on demand, with a single urgent alert summary. Independent source review and behavior evaluation must cover duplicate/concurrent deposits, interrupted posting, conflicting RPCs, cursor continuity, stale readings, pause/resume/MFA/audit, and mismatch alerts. Native-ledger proof must establish actual balances, not only mocked calls.

### Treasury native acceptance checkpoint — 1 October 2026

- **Working source:** finalized incoming transfers and the protected buffer book atomically through the existing Formance gateway. The workload retains its pending range across failure, including a failed CDP balance read. Paid admission follows the live root Admin and launch audience; pause preserves accepted Call replay and recovery. Native integration exposed an accepted-Call budget-update regression at signing: the gate now reuses the existing monetary-only reconciliation exception, pins the original Call/tool/input/attempt and authority tuple, and still checks live canonical revocation.
- **Independent behavior:** the treasury evaluator's 25 cases pass, including concurrent range ownership, interrupted native posting, zero opening, buffer continuity and intermediate-block fork evidence. Nine targeted treasury mutants are killed. A separate 20-case signing evaluator and seven-case operator evaluator pass; nine additional mutants are killed for superseded authority, changed Call identity, nonmonetary widening, consumed-Quote identity, root Admin and restored audience. Source bytes were restored and the 27-case signing/operator baseline passed again. The broader signing/recovery/cap/control packet passes 64 cases. Counts overlap.
- **Native evidence:** all 27 local Formance deposit and paid-Call integration cases pass. An additional native snapshot case verifies 17 settlements across two pages, separate purchased/promotional available and reserved balances, cash-only payment counting and later backdated inserts excluded from an insertion-time cutoff. After a later native revert, the earlier read must either remain identical or become unavailable. RPC, screening, custody and Provider boundaries remain fixtures in the paid-Call proof; this is not deployed or live-money acceptance.
- **Metric contract:** cash and liabilities use insertion-time PIT. Payment history uses effective 24-hour/seven-day windows with insertion bounds and explicit reversion-time validation. The payment measure is gross Provider payments, not net burn: returned cash changes the float but does not rewrite the original payout. Incomplete history or unsafe integers yield unavailable, never partial totals presented as complete.
- **Cash correction boundary:** source review found the legacy buyer-directed Provider reversal could credit corporate USDC using only a buyer's evidence digest. New and unresolved admissions now refuse; exact historical terminal receipts still replay, and conflicting requests leave those receipts intact. Existing buyer reports/refunds remain the remedy and preserve Provider settlement. Actual incoming cash is booked once from chain evidence. Historical posted reversals require reconciliation during the existing populated-ledger cutover audit.
- **Final source acceptance:** `npm run check` passes, including zero dependency cycles, types, all 74 import/boundary checks and the TypeScript standard. The affected 292-case packet passes across the full run and corrected historical-fixture rerun; the snapshot's 36 cases pass after its final fixture change. Five independently authored public-action reversal cases pass with real ownership and source-write admission. A deliberate admission bypass reaches the native cash action and fails three cases while two terminal/ownership controls pass; original source bytes are restored, and the final five-case baseline passes. Counts overlap with the checks above.
- **Handover:** the deposit cursor proves range accounting, not overall treasury reconciliation. Keep #275 open for the scheduled chain/ledger, settlement/transfer and Stripe/ledger comparisons, durable alerts, and the operator screen/actions. Rerun the full release gate before merge or alpha. No production deployment or live money has moved.

### Treasury reconciler and operator acceptance — 1 October 2026

- **Producer and consumer:** the deployment-scoped 15-minute workload joins finalized chain ranges, native insertion-cutoff transactions, durable Calls/signing reservations and current Stripe payment/refund evidence. Sealed, monotonic snapshots feed `/admin/treasury`; independent unavailable sources remain explicit. Complete source/native rereads reject a comparison whose evidence changed during execution. Bounded page counts and elapsed/request deadlines preserve action headroom and never publish partial history as matched.
- **Financial contract:** cash includes available USDC, Call commitments and the protected buffer, with timing adjustments only for attributed transfers. Settlement proof requires the exact EIP-3009 transfer from two RPCs; duplicate matching receipt logs cannot pass. Funding matches all principal, fee and tax postings, and discovers pending/partial/unrecorded refunds. Reservation reconciliation includes accepted Calls before a signing attempt exists. Metrics distinguish purchased/promotional AUD and available/reserved credit, gross Provider payments, rolling exposure and finalized-chain/CDP observation ages.
- **Recovery and controls:** durable alert episodes retain a proved mismatch through later unavailability. New episodes and warning-to-critical escalation emit the existing structured observability event with stable alert identity; external receiver delivery remains unproved. Resume requires fresh complete reconciliation, current wallet identity/observation and current spending capacity. Both the proposing owner and the second approver see the exact payment audience; changed or unavailable review state prevents approval while the mutation rechecks its digest. Existing MFA, transactional receipts and two-owner rules remain the authority.
- **Native proof:** the actual controller/native-ledger integration passes five successive publications: opening/buffer plus Stripe funding; a reserved Call without a signing attempt; native Provider settlement with exact decoded receipt evidence; orphan cash detected as critical; and a later ledger outage retaining that critical episode. Separate native funding/refund readback verifies all four postings and opposite principal deltas, and rejects a changed fee. These are isolated local ledgers with only Stripe/RPC I/O replaced; this does not establish deployment or live-money operation.
- **UI proof:** 24 treasury view/action tests pass, plus six second-owner approval tests using the real action sheet. They establish exact unit math, draft/command continuity, changed-state review and audience disclosure/refusal. Source review found and drove the second-owner correction. Browser visual/authenticated acceptance remains open.
- **Final source acceptance:** Node 22/npm 11.5.1 `npm run check` passes with zero dependency cycles, types, 74 import/boundary checks and the TypeScript standard. The final guard/funding/cash/source/metric packet passes 67 cases; funding has 32 cases including response-body abort and constructor failure preserving a known mismatch. The funding plus native-controller packet passes 33 cases. Counts overlap. The stage-specific React Doctor scan has no errors and 12 bounded backend performance advisories; no checks or boundaries were disabled.
- **Readiness handover:** the original 20-concurrent template-write failure against Ledger 2.4.12 is resolved by the native patch acceptance below. QR dependency approval, browser acceptance, deployed alert receipt, readiness/restore/development paid-Call evidence, the full release gate and explicitly authorized real-money drills remain open. No production deployment or live money moved.

## Native Ledger patch acceptance — 1 October 2026

- **Cause and change:** Ledger 2.4.12 upserted transaction accounts through the outer connection pool while holding a write transaction, exhausting its default 20 connections under the unchanged concurrency proof. The [official fix](https://github.com/formancehq/ledger/commit/c40a94b55a8100f12059e43baa7bff04f2854522) uses the existing transaction store. The maintained v2.4.14 binary includes it; runtime requirements, release image and restore-drill image now pin v2.4.14 at digest `sha256:9a2902d8d04c67c8a5f6270fc297f8ca5c6cf288f463dfad3984e5d376179c43`. No application wrapper, pool increase or relaxed assertion was introduced.
- **Contract:** concurrent retries must terminate, resolve one immutable posting and retain the exact capacity balance; changed reference content must still refuse. The application resolves native duplicate-reference responses through existing verified readback. Missing or mismatched runtime versions still refuse. Existing production custody approvals referring to v2.4.12 require normal review and reissue; they are not rewritten.
- **Local runtime proof:** the test-money Ledger behind `127.0.0.1:3069` reports v2.4.14, commit `e6285a49b`. The original raw SDK burst completes in 113 ms with one write and 19 duplicate-reference responses, replacing 20 timeouts. All 18 cases across the five native money integration files pass in 21.33 seconds, including the unchanged 20-request application capacity test with all results completed and its exact balance, native paid-Call reservation/settlement/recovery, funding/refunds, promotional-credit contention, deposits/buffer, reconciler publications and insertion-bound historical snapshots/backdated entries. Stripe and RPC remain fixtures in the controller test.
- **Rollback and compatibility:** the existing PostgreSQL volume is retained. A whole-database custom-format dump (16,883,571 bytes, SHA-256 `8f0991ab3b1630360faced51e2b570883d6ad1f16e90f3ea78bfca7ce6315549`) has a readable 8,794-entry archive; this verifies archive integrity, not a restore drill. The old image and stopped container `ae-dev-finance-ledger-v2412-stage14-rollback` are retained, with private configuration and backup in `/tmp/ae-stage14-ledger-rollback-20261001`. The [upstream compatibility note](https://github.com/formancehq/ledger/blob/e6285a49b34bfbd9e12750dd3a0d72f3e3158f50/docs/database/migration-temporary-tables.md) confirms unchanged persistent schema/data format and migration inventory. Binary rollback requires stopping/disconnecting the new Ledger, reconnecting the retained container to `ae-dev-finance_default` with alias `ledger`, and starting it; reverting restores the old liveness defect. No shared app/backend or cloud runtime was changed.
- **Source proof:** the affected release-topology and Treasury reconciliation packet passes 34 cases. The Formance/commercial-policy packet passes 74 cases, including literal-v2.4.12 refusal by runtime health and production custody approval. Node 22/npm 11.5.1 `npm run check` passes. The full release gate and deployed acceptance remain required after the remaining readiness work.

## Readiness implementation contract — #276

The design thesis is one current, explainable admission decision for new production payment exposure. Existing accepted Calls retain their replay/recovery path, and pause remains available. The design review is non-interactive because the issue is AFK; requirements and existing authority boundaries supply the decisions.

- **Requires:** complete production configuration on the actual web runtime; observed backend Formance health/version/schema, exact CDP custody policies, agreeing Base RPCs, fresh stored FX, an implemented sanctions provider, current commercial approvals and reconciled treasury. Configured credentials alone do not establish provider health. Web Clerk/Sentry checks establish configuration only; authenticated browser acceptance and delivered alerts remain separate deployment evidence.
- **Ensures:** production boot and `/api/ready` use the same semantic manifest. A bounded Node producer publishes eight fixed checks to one current row; the admin view, new Quote/Call admission, owner enablement and Resume consume that evidence. Sandbox behavior remains separate. Failed, missing, stale, future, wrong-environment or changed-configuration evidence cannot authorize a new production payment.
- **Invariant:** the backend configuration binding includes actual credential values inside an opaque digest, never persisted raw or projected to the UI. Publication recomputes that binding transactionally; exact retries replay and older probe starts cannot overwrite newer evidence. Each passed source retains its own expiry, with a ten-minute upper bound. Web evidence comes from the actual fixed HTTPS `/api/ready` endpoint, whose payment environment and Convex origin must match this backend. Web observation is bounded by expiry; web boot independently refuses its changed invalid configuration immediately. No manually mirrored browser variables are accepted as web proof.
- **Failure/recovery:** provider timeout or invalid response produces a named failed check and keeps payment effects absent. A later successful probe can recover readiness. Malformed/stale publication is refused without writes. The sanctions adapter currently reports `trm_tenant_contract_unavailable`, so production remains not ready until the entitled integration exists; there is no key-presence or manual-ready bypass.
- **Complexity decision:** keep one snapshot contract, a Node producer, transactional store and existing admin projection. One indexed current-row read replaces divergent UI/admission opinions; the producer reuses native Treasury, FX, Formance and CDP policy checks. Reject per-provider frameworks, a new service, duplicated web settings and a second deployment registry. A five-minute existing-pattern workload adds at most 288 refreshes/day; provider checks are bounded and read-only. The most important risks are stale evidence crossing configuration changes and a readiness probe accidentally invoking signing. Both require behavioral failure/concurrency tests. Keep the web endpoint independent of backend paid-readiness to prevent a recursive health check.

### Readiness source acceptance — 1 October 2026

- **Producer and consumers:** actual production deployment identity activates the complete semantic manifest regardless of host mode. The scheduled producer binds the live web endpoint to this backend, reads eight checks, preserves each source's original deadline and publishes one sealed current snapshot. Production Quote/Call admission, owner spending enablement, Resume and the admin panel consume the same evidence. Missing, expired or configuration-changed evidence refuses; emergency Pause and accepted Call replay remain available. The screen removes expired Ready immediately and on returning to the tab.
- **Provider boundaries:** CDP readiness uses three bounded authenticated GETs and the same custody-policy predicate as signing, without invoking signing or changing the SDK's process-wide transport. Formance's external deadline covers response bodies. Both RPC providers must have distinct normalized hostnames and agree on finalized evidence; DNS, connection and body stalls are bounded while private-address protection remains enforced. Distinct hostnames alone do not establish independent companies.
- **Review correction:** the configuration digest now binds raw values. Whitespace that changes an exact runtime parser's result therefore invalidates prior readiness and prevents late publication. Independent source review found no remaining actionable gate, replay, publication or authority defect after this correction.
- **Native regression:** all 25 Workpool lifecycle cases pass against the pinned local Ledger v2.4.14, including the production admission fixtures, financial recovery, daily/concurrent limits and settled-answer refunds. Custody, RPC, screening and Provider boundaries remain fixtures; this proves local native financial behavior, not a Base transaction.
- **Verified:** `npm run check` passes, including zero dependency cycles, types, 74 import/boundary checks and the TypeScript standard. Anonymous Convex regeneration passes all seven files. The final nine-suite acceptance packet passes 205 cases covering producer failures, bounded provider reads, publication concurrency, raw configuration rotation, paid admission/replay, operator controls, isolation and UI expiry. Separate deployment/diagnostic reruns pass 116 cases; source-check tests preserve original FX, policy and treasury deadlines. The actual Formance SDK response-body abort test passes. Counts overlap. React Doctor reports 89/100 and no introduced errors against the preceding commit; remaining warnings concern the visible readiness/expiry branches, existing chat-hook branching and a bounded manifest lookup. Retain these direct checks rather than adding another abstraction.
- **Remaining acceptance:** the real TRM tenant adapter is unavailable, so production remains Not ready. Web Clerk/Sentry checks prove configuration only; authenticated operation, delivered alerts, real provider reads and deployed cron concurrency are still required. The full release gate must run again before merge or release. No production deployment or live money was authorized or moved.

### Integrated signing, treasury and readiness source gate — 1 October 2026

The full release gate passes under Node 22/npm 11.5.1 with `AE_DEPLOYMENT_ENVIRONMENT=development AE_FORMANCE_ENVIRONMENT=sandbox npm run gate`: seven-file anonymous Convex generation, public-build integrity, clean types, zero dependency cycles, 7,012 unit passes (one skipped), 2,406 integration passes (44 skipped, three todo), four type tests, 74 import checks, the TypeScript standard, 31 SEO tests, 16 browser journeys, 18 accessibility checks and reproducible CLI packaging. The separate native local Ledger Workpool proof remains 25/25; conditional release-suite skips are not native or deployed passes.

The gate exposed and corrected four integration omissions: the generated TanStack Start registration, the readiness table/index inventory, required custody/Sentry release-workflow settings, and a boot fixture inheriting a build-only variable. It also identified two provider clients outside the reviewed SSRF boundary. They now reuse guarded connection DNS with one operation-local dispatcher, retain whole-body deadlines, refuse redirects and destroy the transport on every exit. Stripe reads additionally require the exact HTTPS provider origin and GET. CDP's Node-only transport loads inside the reader, preserving browser route safety. Actual transport tests establish private-DNS refusal and cancellation of stalled DNS/body reads; independent source review found no remaining actionable transport defect. No fence or assertion was relaxed.

The next source work is #289's real Clerk-to-Convex step-up path, #277's required native contract matrix/CI coverage and #278's model-cost accounting. Runtime acceptance remains separate: the shared development stack responds but runs older source and retains its 8.83 GB database; no reset or runtime replacement was performed. Real screening/custody/provider operation, delivered alerts, complete restore evidence, the Sepolia paid journey and explicitly authorized mainnet drills remain open.

## Honest status
The isolation, settled-response, promotional-credit and report/refund source stages above pass the earlier integrated source gate. Signing controls, treasury operations and readiness are now implemented with the focused source/native evidence recorded above. Native paid-Call/ledger acceptance is established locally with fixture custody, RPC and Provider boundaries. Provisioning, the entitled TRM adapter and deployed proof remain required; rerun the full release gate after these later source changes before merge or release.
- **Real:** the money code paths exist (AUD ledger in Formance, CDP custody signing, x402 payment, 2-RPC settlement verification, receipts) and the chat journey is built in source. None of it has run with real money. No paid Call has been proven end to end, even on testnet.
- **Unproven in deployment:** #266–#270 close the original ten production-isolation findings in source. The checkpoints above supersede their pre-fix code descriptions; deployed proof remains open.
- **Unprovisioned:** the last production env snapshot (`.vercel/prod-debug.env`, 4 August 2026) contains **no** Stripe, Formance, CDP, RPC or Sentry configuration. It still carries legacy integrations (Autumn billing, Meilisearch, Novu, Resend) and `AE_SANDBOX_PROVIDER_KEY`. The browser build loads Clerk **development** keys.

## Operating-model concerns still open
1. **Where Formance runs.** The manifest declares a *private Formance community stack* behind a Cloudflare Access gateway, with managed PostgreSQL (`manifest.ts:224`). In production that means a solo founder operating a financial database: uptime, upgrades, backups, point-in-time recovery. Options:
   - (a) Formance Cloud (managed).
   - (b) Self-host on a managed platform with managed Postgres and point-in-time recovery, behind Cloudflare Access.

   Decide before M2. If Formance is down, no Quote can reserve and no top-up can credit.
2. **Legacy integrations in production.** Autumn (billing), Meilisearch, Novu and Resend are present. Decide for each: keep (for example, Resend for receipt email) or remove. Autumn in particular must not coexist with the credits model.
3. **Secrets live in several places:** Vercel env, Convex env, Formance, CDP, Stripe. Adopt one secret manager as the source of truth. Infisical is already integrated in code (the secret-isolation tests), with named holders and rotation.
4. **Two deployments only.** *Development* (local plus a Convex dev deployment, sandbox money) and *production* (real money). No staging with real money, and no production data in development.
5. **Release process without CI minutes:** local `npm run gate` → deploy to a Vercel preview against the Convex dev deployment → promote to production. GitHub Actions minutes return on 1 October; re-enable the gate workflows then.
6. **One operator.** Everything in M2 needs a runbook: float low, drift, Formance down, Stripe webhook failures, CDP outage, sanctions hit.

## Infrastructure: target state
| Component | Alpha (promo credit, Joel-funded float) | Open beta (card funding) | Status | Owner |
|---|---|---|---|---|
| Web (Vercel, TanStack Start) | Production project on the domain | Same | Project exists; env stale | Joel provisions, E wires |
| Convex | Production deployment, backups on, restore drill done | Same | Deployment exists (`CONVEX_DEPLOYMENT` present); backups unverified | Joel, E |
| Clerk | **Production instance** (live keys, domain, MFA) | Same | Dev keys in use | Joel |
| Formance (AUD ledger) | Production ledger (decision 1), point-in-time recovery | Same | Not provisioned | Joel decides, E wires |
| CDP custody | Separate production project, server wallet and policies; funded by Joel | Company-funded; hot/reserve split | Not provisioned | Joel |
| Base RPC | 2 independent HTTPS providers (`AE_X402_RPC_URLS_JSON`) | Same | Not provisioned | Joel |
| FX feed | Coinbase public USDC/AUD (built; refreshes) | Same | Working | — |
| Sanctions screening | OFAC data plus a screening API key | Same | Not built | E, Joel (vendor account) |
| Stripe | Not needed | Live restricted keys, webhook, GST rate; **written pre-approval** | Not provisioned | Joel |
| Sentry | Production DSN, alerts wired | Same | Absent from the production env | Joel, E |
| Secrets | Infisical as the source of truth | Same | Partial | Joel, E |
| Email | Receipts and alerts (Resend, if kept) | Same | Present (legacy) | Joel |

## Critical path to the first real Call
Two tracks run in parallel; the join points are marked ⇄.

**Engineering track (no dependency on provisioning):**
1. **M1 isolation:**
   - `AE_DEPLOYMENT_ENVIRONMENT`: required, fail closed.
   - Delete `hosted_alpha`, `standard` and the synthetic profile.
   - Close the 10 P0 doors.
   - The isolation test goes into the gate.
2. **Money rules:**
   - Charge on a settled 2xx (paid-200); write off seller errors.
   - Release unbroadcast authorizations after `validBefore`.
3. **Alpha features:**
   - Promotional credit grant (admin action, drawn first, expiry).
   - "Report this answer" refunds with the daily limit.
4. **Payment safety:**
   - Screen `payTo` before signing.
   - aecon-side caps per Call, per rolling day and per payee.
5. **Treasury:**
   - Deposit booking from observations.
   - The reconciler.
   - `/admin/treasury` (read-only first, then pause and thresholds).
6. **Readiness:**
   - The manifest requires the production groups.
   - The readiness panel is pass/fail.
   - Boot fails closed on a mismatch.
7. **Prove the loop on the development deployment:** one full paid Call on Base Sepolia (M0 exit).

**Joel track:**
1. Formance hosting decision (concern 1).
2. Clerk production instance and domain.
3. CDP production project, wallet and policies; fund the alpha float.
4. Two Base RPC providers.
5. Sentry production DSN.
6. Secrets into Infisical.
7. Legacy integration decisions (concern 2).

⇄ **Join 1:** wire the production env, the readiness panel goes green, the restore drill (M2 exit).

⇄ **Join 2:** Joel's account makes 20 real Calls across at least 5 listings, reconciled to the cent, and the failure drills pass (M3 exit).

Then: the trust centre and credits terms page, and alpha invites (20 users, A$10 each).

**Beta-only track (starts now, blocks nothing in alpha):**
- The Stripe pre-approval request.
- Lawyer and accountant engagements with the fixed questions in `docs/operating-model.md`.

## What should make us comfortable, and what shouldn't yet
- **Comfortable:** the model is coherent (principal, OpenRouter-style credits, own float). The regulatory posture is defensible. Alpha exposure is capped at about A$200 of seller payments. Every money path already refuses when config is missing, rather than guessing.
- **Not yet:**
  - Nothing has run with real money.
  - Production isolation has source evidence but has not been verified on the deployed pair.
  - Formance hosting is undecided and it is the money authority.
  - Production config is absent.
  - One operator with no runbooks.
  - The first alpha user must not arrive before the Join 2 exit.

## Step-up authentication implementation contract — 2026-10-01 (#289)

Sluice: deep, bounded to the server→Convex sensitive-action boundary. Root owns
the shared proof contract, operator integration and acceptance; discrete workers
own Agent spending updates and workspace/owner-Call actions respectively.

- Requires: a current authenticated owner/operator, exact validated command,
  current target revision, and server-verified Clerk MFA for authority increases,
  workspace closure/ownership transfer and owner-chat Call approval. MFA requires
  both factors within ten minutes; Clerk's first-factor fallback is insufficient.
- Ensures: the server signs the command plus Clerk subject, genuine
  `reverification_id`, factor ages and the session token's `iat`. Convex verifies
  the existing source-write envelope, matches the authenticated subject, checks
  elapsed time from that signed token timestamp and consumes the existing proof
  record atomically with the consequence. No Convex `identity.fva` dependency.
- Invariant: current ownership, revisions, commercial limits, accepted Calls and
  recovery remain authoritative. Exact completed retries return the original
  result; changed commands or competing revisions cannot reuse proof or create
  duplicate grants/effects. Spending reductions and denials need no MFA prompt.
- On violation: missing, stale, forged, wrong-user or reused evidence refuses
  before authority changes; the existing Clerk reverification UI retries the
  same command once. Storage failures roll back the complete mutation.

Complexity: add one stronger proof shape and MFA derivation in the existing
server/backend proof modules, reused by the three real caller groups. This buys
one definition of subject/freshness semantics and removes ineffective JWT-refresh
workarounds and misleading operator guidance. Reuse source-write HMAC, consequence
proof-use storage, current transaction/revision checks and Clerk's maintained UI;
no new table, dependency, authentication service or general framework. Keep this
bounded extension; reject per-feature proof engines and client-authoritative MFA.

Verification must demonstrate fresh-MFA acceptance without Convex `fva`, refusal
of first-factor-only/stale/wrong-user/modified proofs, same-command retry, competing
commands, lower-limit/no-MFA behavior and rollback/no extra authority. Root runs
the affected tests and `npm run check`, then the release gate before acceptance.
Live Clerk configuration and an interactive development session remain runtime
evidence requirements; configure the documented session claim
`{"reverification_id":"{{session.reverification_id}}"}` before claiming them.
Sources: [Convex claims](https://docs.convex.dev/auth/functions-auth),
[Clerk reverification](https://clerk.com/docs/guides/secure/reverification),
[Clerk token claims](https://clerk.com/docs/guides/sessions/session-tokens).

Source acceptance — 2026-10-01: the server-derived, signed MFA proof now covers
operator actions, workspace closure/transfer, owner Call approval and spending
increases. Tests establish acceptance without Convex `fva`, subject and exact
command binding, token-anchored expiry, first-factor-only refusal, transactional
proof consumption, concurrent-command exclusion and proof-free completed replay.
Limit reductions retain their existing flow. Clerk cancellation preserves the
reviewed command; approval replay remains valid after the Call later completes,
refuses or is cancelled.

`npm run check` and the full `npm run gate` passed: 7,068 unit tests, 2,446
integration tests, 4 type tests, 74 import checks, the TypeScript standards check,
31 SEO tests, 16 browser journeys, 18 accessibility tests and reproducible CLI
packaging. The separate `AE_FORMANCE_INTEGRATION=true` Workpool run passed all 25
tests against pinned native Ledger v2.4.14, including accepted-Call recovery after
spending-policy changes. The ordinary gate still has 44 optional integration
skips and 3 todos; mandatory native-money CI is the next #277 packet. React Doctor
reported zero errors and one existing action-sheet complexity advisory.

This completes #289's source requirement. Genuine session-claim rotation,
interactive MFA and the deployed Clerk configuration remain unverified under
#281. No production deployment, live payment or public launch was performed.
