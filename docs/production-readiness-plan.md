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
skips and 3 todos; mandatory native-money CI is the next #277 packet. React Doctor's
changed-line scan reported zero errors and one existing action-sheet complexity
advisory. The staged whole-file hook also reported an unchanged chat-bootstrap
render-ref mutation and existing warnings; that bootstrap code was not modified.

This completes #289's source requirement. Genuine session-claim rotation,
interactive MFA and the deployed Clerk configuration remain unverified under
#281. No production deployment, live payment or public launch was performed.

## Native money matrix implementation contract — 2026-10-01 (#277)

Sluice: main, test and CI boundaries. Root owns acceptance and heavy execution;
one worker owns the matrix and minimal Workpool harness reuse, another owns the
isolated CI stack and workflow. No production money rules change in this packet.

- Requires: an isolated native Ledger v2.4.14 with strict schema enforcement,
  canonical funded buyer and Quote, real registered Convex/Workpool handlers, and
  fixtures only for authentication and external Provider/CDP/screening/RPC calls.
- Ensures: the nine scenarios assert the typed HTTP result, persisted Call/history,
  exact native references/postings and holds, signatures, and separate unpaid and
  paid Provider hit counts. Required CI fails on missing native execution.
- Invariant: uncertainty retains all liabilities; replay and concurrent attempts
  cannot pay twice. A settled 2xx is charged even when delivery is invalid. A
  settled non-2xx is a Provider loss without a buyer charge. A proven unpaid
  refusal releases holds. Chain settlement without response status cannot justify
  an ordinary buyer capture.
- On violation: the matrix fails with the observed HTTP/state/ledger discrepancy;
  missing native services and skipped mandatory cases fail CI. Timeout recovery
  must demonstrate eventual exact settlement once, while the no-response control
  remains explicitly uncertain.

The scenarios are settled 2xx, unpaid seller 500, settled seller error, receipt
timeout and recovery, changed Quote challenge, same-key replay, insufficient
credit, per-Call/daily limits, and concurrent attempts for one allowance.

Complexity decision: keep one new matrix file, extract the existing evidence
reader only for its second caller, and use official pinned PostgreSQL/Ledger/
Gateway images in disposable CI. Real Request/Response handlers need no additional
HTTP server. Reject a scenario framework, replacement ledger, paid test service
or generalized runtime wrapper. Existing native Workpool and ledger-boundary
tests remain complementary evidence. Verification runs the native matrix plus
those suites, workflow checks and `npm run check`; root inspects exact financial
assertions before acceptance. Live custody, RPC and screening remain separate
runtime evidence requirements.

Native matrix finding: released unpaid/changed-challenge Calls persisted private
transport failure codes as public refusal codes, so status validation returned
HTTP 503 despite completed release. Contract Enforcer and Error Strategist apply
at this projection boundary: require a recorded refusal, ensure an existing
public refusal category, preserve receipt/state/retry and exact transport audit
facts, and continue rejecting invalid fields outside this explicit mapping.
This is a producer/projection bug; no financial recovery or additional retry is
appropriate. Map private challenge-authority refusal to `pre_release_failed` and
other private transport refusals to `provider_refused`, preserving already-public
codes. Apply the same mapping when reading older records. Keep one small mapper
in the existing contract module, shared by actual producers and projections;
it replaces an incomplete owner-only special case and adds no schema or layer.

Source acceptance — 2026-10-01: all nine money scenarios pass through real HTTP
handlers and registered Convex/Workpool handlers against the disposable pinned
native Ledger v2.4.14 stack. The matrix verifies exact buyer/legal/principal/
custody/provider accounting subjects, native postings and holds, durable signing
liability, audit history and separate unpaid/paid Provider hit counts. Retained
paid-response recovery settles exactly once; losing the HTTP response retains
liability even with a valid chain receipt. The matrix also caught and fixed the
private-code/public-status defect, including read-only projection of historical
records and same-key replay without changes to stored effects.

The exact required CI packet passed **43/43 tests, zero skips/todos**: matrix 9,
Workpool 25 and ledger-boundary 9. Its sanitized evidence verifier accepted every
required file and assertion. Enabling native proof with an unavailable gateway
produced the expected failure. The workflow boots digest-pinned isolated
PostgreSQL/Ledger/Gateway services, checks actual version/health, uses the local
npm toolchain, rejects incomplete reports, publishes sanitized evidence and
removes its containers/volumes on success or failure. It runs on every supported
workflow event, including pull requests.

The 52 contract/replay/workflow and 72 worker/recovery tests pass; `npm run check`
passes with zero dependency cycles. Independent review found and closed the
historical replay gap. This completes #277's source requirement. The full release
gate must run again before merge/release; no merge or release is performed here.
The GitHub-hosted job has not yet run. Authentication, Provider, CDP, screening
and RPC remain external fixtures in this native packet; it is not the deployed
Sepolia journey or a live-money drill. The isolated local proof stack is removed
after acceptance, preserving the existing development stack and its data.

## Stage 19 — cost of a durable chat answer (#278)

Design thesis: an answer has one attributable USD model-cost record assembled
from its actual requests, with missing evidence visible. Sluice routes this as
cross-boundary work. The design review uses the non-interactive AFK fallback;
the interview is skipped. Integrity is strong: request observations, the turn
summary and the immutable Call-origin join all serve that thesis.

Requires: a durable turn, its matching thread/prompt and a stable request identity
before outbound inference. Internal observations must contain only bounded model
identifiers, nonnegative safe token counts and finite nonnegative reported USD
amounts. Ensures: each SDK step and each Jev discovery request is recorded before
I/O; completion enriches that record idempotently, including after cancellation.
Invariant: unknown is never zero; a reported zero is valid; one request and one
provider generation contribute at most once; a Call retains its originating turn
on replay; multiple Calls show one answer total. Buyer charges, Provider earnings
and USDC settlement remain separate facts. On violation: invalid identity/material
is rejected before outbound I/O or enrichment; a failed completion write leaves
the durable request visibly pending. Failed/absent provider usage stays unpriced.

Use one indexed child table and existing Convex transactions. Each request has
one of pending, unpriced (reason), or priced (exact decimal USD and evidence
source) states. Decimal.js is already installed; bound each amount to 18 integer
and 30 fractional digits and sum at most 256 rows with 64-digit precision. More
rows produce an explicitly incomplete bounded report. A tracking-version marker
on newly created turns distinguishes a completed, genuinely zero-request Card
Run from historical turns without coverage. Anonymous and legacy generation
without a durable turn remain outside this first report.

Existing AI SDK hooks observe initial, immediate-explanation and final-answer
requests. Its notification callbacks swallow errors, so persist starts from the
awaited prepareStep boundary and compose existing selection logic. Keep zero SDK
retries; a new SDK call is a new potential cost. Jev's existing fetch adapter
observes actual discovery attempts; its token-only result remains unpriced.
Do not retain prompts, raw provider bodies, credentials or arbitrary error text.
OpenRouter generation IDs need provider provenance (the response header), since
an SDK response ID can be synthetic. Bounded scheduled metadata lookups may price
an observed generation after completion; failure remains visible and never
repeats generation. No inferred token-price estimate or AUD conversion.

Complexity decision: keep a single cost domain helper, one table, one transaction
module with thin registrations, one shared chat-hook adapter, and a bounded Node
metadata action. Each has current consumers (three model call paths, Jev and
operator inspection) and isolates an existing runtime or consistency boundary.
The cost is one start and completion mutation per inference plus at most three
metadata lookups for an observed unpriced generation. Console-only measurement
cannot establish completeness; per-Call totals would duplicate multi-Call spend.
Reject a billing framework, replacement SDK, model transport, raw-stream parser,
new dependency, FX service and historical backfill. Existing admin object detail
is the operator consumer; no additional customer flow is required.

Top risks are missed inference paths, synthetic provider IDs and late/repeated
observations. Verify single/multi-step and fallback paths, zero-request Card Run,
failed/aborted streams, duplicate/concurrent writes, later completion, historical
coverage, immutable Call replay and two Calls sharing one turn. Assert exact USD
sums, visible unknowns and unchanged financial facts. Root owns integration and
heavy checks; bounded workers own storage, SDK hooks and Jev propagation. Native
provider reconciliation remains unverified until an authorized provider run.

Source acceptance — 2026-10-01: durable chat now records initial, immediate
explanation, final-answer and Jev discovery attempts before provider I/O. Exact
USD subtotals distinguish pending/unpriced requests, observed zero, historical
coverage and bounded-read incompleteness. Call reservation stores its original
turn once; the existing Admin Call page shows the shared answer total, related
Calls and bounded request evidence. Duplicate/concurrent writes cannot multiply
cost, and late completion cannot erase the original Account/prompt binding.

The installed SDK can synthesize both response IDs and model names. Generation
joins therefore require the provider header; a same-as-requested model remains
labelled requested unless generation metadata establishes its provenance.
[OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming) documents
the generation header; [generation metadata](https://openrouter.ai/docs/api/api-reference/generations/get-generation)
provides the reported total cost for bounded reconciliation.

Across the final focused runs, **189 tests pass** in 14 files, including actual
AI SDK/official OpenRouter adapter calls against external response fixtures,
registered Convex mutations/actions, all three chat request paths, model-free
Card Run, exact multi-step sums, cancellation, duplicate metadata action delivery,
three-attempt exhaustion, two Calls sharing one answer and unchanged Call
financial records. `npm run check` passes with zero dependency cycles. Independent
review found the SDK model-name provenance gap; its fix has three regression
cases. React Doctor's stage-scoped score stays 90/100, with no errors and two
reviewed warnings: a conventional four-column table header and deliberately
ordered failure observations. Avoiding a generic table abstraction preserves the
smaller design; no diagnostics were suppressed.

No provider generation, live-money movement or deployment was performed. Native
OpenRouter billing reconciliation remains runtime evidence work. Anonymous chat
and historical coverage remain explicitly excluded from complete totals. Full
Convex codegen needs deployment configuration, absent in this worktree; the local
API inventory and registration-kind fixture are updated and checked. The release
gate must run again before merge/release; this stage does not merge or release.


## Stage 20 — a restore proof that cannot pass on partial evidence

Design thesis: a restored Formance ledger must reproduce a recorded, stable
financial state and retry an original command without creating another posting.
Sluice routes this as deep cross-boundary recovery work. Apply contract-enforcer,
error-strategist, idempotency-guardian and complexity-accountant; the narrow
Terraform change also uses tf-best-practices. No new service or dependency.

Requires: every source ledger writer is quiesced and drained (Calls, funding,
refund/recovery workers, webhooks and operator writes), an original valid AE
command already present in that ledger, and an isolated restored target.
Ensures: two complete source reads agree around a recorded cutoff; verification
compares the restored target to that saved baseline, then repeats the original
application and native command and proves the same native transaction ID and
unchanged complete state. Invariant: every transaction, account/asset with signed
input/output/balance volumes, schema content and ledger configuration participates;
unknown account families, zero balances, metadata, templates and reversions are
not filtered away. On violation: missing/malformed pages, duplicate identities,
looping cursors, unsupported numeric precision, scan limits, drift, missing replay
material or any ambiguous response fails the proof. No truncated or null digest
can produce PASS, and a 409 alone is not successful replay evidence.

The current SDK normalizes timestamps and strips unknown fields. Its maintained
HTTP response hook will capture bounded raw GET payloads before SDK decoding,
retaining exact timestamp strings and native schema attribution. Normal SDK
transport, origin/authentication fences and validation remain in use. Unsafe
wire numbers are refused rather than silently rounded. No raw bodies or secrets
are emitted; the private baseline stores only coverage counts/digests, source
identity, cutoff and the original command digest/transaction identity.

The cloud drill pins an explicit restore time between equal baseline reads and
waits until RDS reports that time restorable while source writers remain frozen.
Verification never compares a later live source with an older backup. Two equal
reads establish observed stability; they do not establish writer quiescence.
Quiescence and the backup/target identity remain explicit operating prerequisites.
This stage does not run AWS, deploy Convex or claim full application recovery.

Complexity decision: keep one Node snapshot adapter, a small CLI orchestrating
baseline/compare/replay, and one opt-in native restore spec using existing Compose
pins. The adapter absorbs complete pagination, raw SDK evidence and conservative
failure handling for both operational verification and the native proof. The CLI
replaces the shell's truncated hashes and synthetic probe. One optional response
observer on the existing SDK factory avoids a second transport. The cost is two
full scans per stability check with explicit bounds; no background service, new
reporting framework, arbitrary SQL production probe or replacement SDK is added.

Root owns CLI/infra/runbook/integration, checks and runtime acceptance. Bounded
workers own the snapshot adapter/unit evidence and disposable native proof;
independent review checks the actual false-green failure modes. Native acceptance
must include more than 1,000 transactions, exact baseline equality after database
backup/restore, duplicate native retry with a stable ID, and rejection of an old
row change, same-total account redistribution, schema drift and reversion drift.

### Stage 20 acceptance — 1 October 2026

The disposable PostgreSQL backup/restore passes with more than 1,000 transactions
and Accounts on Ledger 2.4.14 and Gateway 2.3.1. Complete source and target state
agrees; application replay and two concurrent native retries preserve the original
transaction ID and all state digests. A changed original command is refused
without a posting. An old transaction change beyond the retired 1,000-row window,
same-total redistribution between Accounts, transaction reversion and schema
content drift with an unchanged version each fail verification. The final native
case passes in 10.95 seconds. Its two named Compose projects and volumes are removed.

The cloud script binds its target to the exact private, encrypted, available RDS
drill instance and its managed secret before reading credentials or creating
Kubernetes resources. Source and target database identities must differ. Its
shell fixtures reject substituted endpoints, secrets, source identities and
malformed AWS results before side effects. Cleanup must succeed before PASS.
OpenTofu format/validation and the Terraform policy check pass without AWS calls.

The focused restore packet passes 92 tests. `npm run check` passes with zero
dependency cycles. The full `npm run gate` passes: anonymous Convex code generation,
public build integrity, clean types, 7,191 unit tests, 2,480 integration tests,
4 type tests, 75 import checks, TypeScript standards, 31 SEO checks, 16 browser
journeys, 18 accessibility checks and the reproducible CLI package. The ordinary
gate retains one unit skip, 54 integration skips and three todos; the opt-in
native restore evidence above was run separately.

This cumulative gate also found a Stage 19 deployment defect: Convex skips
`*.actions.ts`, so the model-cost reconciliation registration is now
`chatModelCostActions.ts`, with its callers and generated API aligned. The
existing module-path check now rejects registrations in skipped filenames.
Twenty-eight focused registration/reconciliation checks and ten schema checks
pass; the schema inventory now includes the already implemented cost table.

Independent restore review findings are resolved. This evidence proves selected
Formance ledger financial state and original-command replay on the pinned local
stack. It does not establish production quiescence, cloud PITR/RPO/RTO, Convex
records/files/jobs, deployed alerts or complete application recovery. Those
remain #286 runtime work. No cloud provisioning, deployment, provider generation
or live-money movement was performed.

## Stage 21 — terms and trust that describe the actual alpha

Sluice routes #280 as a main-channel content and UI boundary. Reuse the existing
legal document layout and current route, receipt and credit components. Apply
cognitive-load-auditor to disclosures beside Run, credit and reports, and
contract-enforcer to the promises those surfaces make. This is a reviewable draft;
the contracting entity and contact ownership remain pending Joel. It changes no
Call charging, screening, refund eligibility or spending-authority rule.

Requires: claims trace to current source and the agreed promo-only principal
alpha. Ensures: terms, privacy and the seven trust topics explain credit draw,
uncertain outcomes, report limits, Provider data release and support consistently;
the footer, credit sheet and human-facing Call receipts link to that explanation.
Invariant: aecon's Seller role remains separate from Provider and payment
recipient; 2xx delivery is not a quality promise; report limits never disclaim
mandatory remedies; expired promotional credit is not revived. No unspecified
liability cap, seller verification, provider privacy guarantee or all-money-system
status claim is introduced. On missing evidence: state the limit and offer Support,
without inventing legal entity, retention periods or processor locations.

Quote preparation can already send mapped real input before payment. The existing
pre-Run panel will disclose that next to the selected Provider and inputs, with
no extra approval step. The current report response already returns the remaining
daily allowance; show that amount and its UTC reset instead of hardcoding a policy
count. Where existing funding constraints refuse card funding, the credit sheet
must not advertise an actionable checkout; an existing pending funding attempt
must retain its status and balance checks. No new alpha profile or funding policy.

Cognitive-load decision: keep one primary Run or money action, plus a secondary
trust link. The trust page's seven named topics are a scannable document index,
not seven choices required before spending. Keep inputs, recipient, price and
charge timing together; show current report allowance rather than require recall.
Funding unavailability should remove an unusable choice rather than open a blank
checkout tab. Reuse the established document and control styles; verify compact
and desktop rendering, link targets, unavailable/pending states and accessibility.

Complexity decision: keep the existing legal page/contract/route pattern for
one trust page. Reuse the existing funding constraint result as UI state and the
existing report allowance; add no service, dependency, policy flag or general
legal-content framework. Root owns final copy, route/link integration and
acceptance; bounded workers may prepare content or implement the credit presenter.
Focused behavior tests, React Doctor, `npm run check`, rendered inspection and the
release gate will establish the changed guarantees. Publication and operational
claims remain separate from a passing local draft.

The funding state follows unidirectional-flow-enforcer: existing server balance
and constraints responses become owner-bound state; the panel derives checkout
availability from those responses. A failed constraints request does not erase a
successful promotional balance read. Before submission, re-read the policy and
reject a changed user or Account. A pending attempt retains its original key and
Account. Completion requires the maintained `readAccountFundingServer` result for
that command and idempotency key, which returns success only after the funding
posting is recorded, plus a refreshed balance for the original Account. A balance
increase alone can be a refund or another top-up and must not clear the attempt.
Missing, refused or unknown command evidence retains uncertainty and the same key.
A confirmed failed payment stops polling with a visible failure and no automatic
Call continuation; only that terminal attempt may be cleared for a new top-up.
A check timeout is not payment finality: pause polling, retain the original key,
keep checkout disabled and offer one Check payment action for that same attempt.
This replaces the numeric balance heuristic with an existing producer/consumer
contract; it adds no backend endpoint, storage schema or second payment state machine.
Reloading must also retain uncertainty: reuse the existing command-and-key recovery
storage, restore that locator before permitting funding, and authenticate a pending
command candidate with the original key. Missing or wrong-Account evidence keeps
the attempt available for recovery. Recovery stays accessible when paying is off;
it does not require a new spending approval.

The funding adapter must preserve the same contract for every consumer. Requires:
a durable reservation precedes the provider call. Ensures: any returned uncertainty
after invoking the provider includes that original command reference, even if
binding evidence or recording uncertainty refuses. Invariant: an ordinary refusal
must not imply that a post-provider attempt had no effect. On failure: return the
existing outcome-unknown variant and recover the same command; preserve definite
pre-provider validation/reservation refusals. This changes result classification,
not the public union, financial policy, provider operation or ledger state machine.

The idempotency-guardian and error-strategist review covers both funding start and
funding read: start reserves the original command and creates or recovers checkout;
read can bind payment evidence and finish the existing ledger posting. Those
external effects are protected by the existing command/key and posting contract.
The UI retains that identity across transport loss, delayed posting, timeout and
reload. A typed `funding_pending` or `funding_outcome_unknown` start refusal can
follow an external effect, so it is recovery evidence, not permission to clear the
key. These recoverable failures provide a basic guarantee: valid credit remains
visible, the original attempt remains recoverable and no replacement starts.
Retryable reads keep polling within the existing ten-minute bound; after that,
Check payment resumes the same attempt. A definite terminal failure does not
continue the Call. No new service, backend retry policy or expiry is introduced.

The privacy draft now names the actual conditional approval-email delivery path
in `convex/notificationDelivery.ts`, along with Clerk, Convex, Formance, Coinbase,
RPC services, Sentry and configured model/ranking hosts. It does not claim their
retention, countries or training policies are all verified. Publication still
needs the legal entity, contact ownership, retention schedule and processor
locations. The [OAIC APP 1 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-1-app-1-open-and-transparent-management-of-personal-information)
supports the contact, complaint, access/correction and overseas-recipient review;
the [ACCC remedy guidance](https://www.accc.gov.au/business/problem-with-a-product-or-service-you-sold/repair-replace-refund-cancel)
supports keeping mandatory remedies separate from the limited self-service route.
No proposed liability cap or default promotional expiry becomes a new commitment.

### Stage 21 acceptance — 1 October 2026

The terms, privacy and seven-topic Trust centre are reviewable alpha drafts.
The footer, Add credit sheet, full and inline Call receipts, and funding documents
link to Trust. Pre-Run copy names the Provider role and the possibility of sending
real inputs during price checks. Reporting shows the source's actual allowance
and UTC reset. None of these links adds a purchase approval or discards Run inputs.

Funding now uses current source constraints, preserves real promotional balances
when constraints fail, and requires exact command/key evidence plus a refreshed
original Account balance before continuing. Tests establish no completion from
an unrelated balance increase; no new checkout during uncertainty; retained
recovery across timeout, reload, missing/wrong locators and Account changes;
and usable recovery while spending is off. Server-side post-provider refusals
retain the original command even when evidence binding or uncertainty recording
fails. Definite pre-provider refusals remain ordinary refusals. Independent review
of the final producer and consumer is clean; 59 focused funding tests pass.

Browser inspection at 1440px and 390px confirms all three documents render,
Trust anchors work, and compact layouts have no horizontal overflow or JavaScript
errors. Review images are under `output/review/stage21/` and are not source files.
React Doctor is 90/100 with no errors and five control-flow complexity warnings
in the existing UI controls. The branches express real states; no wrapper or
suppression was added to change the score.

`npm run check` and the full `npm run gate` pass: anonymous Convex generation,
public build integrity, clean types, 7,223 unit tests, 2,480 integration tests,
4 type tests, 75 import checks, TypeScript standards, 31 SEO checks, 16 browser
journeys, 18 accessibility checks and reproducible CLI packaging. The ordinary
gate still has one unit skip, 54 integration skips and three todos. The corrected
public-semantic and discovery fixtures now reflect the new draft and Trust route.

Publication still needs the contracting entity, contact ownership, retention and
processor-location facts. A lost start response with no observable command locator
retains uncertainty and Support; it does not infer success from credit movement.
These tests do not establish live Stripe operation, hosted money readiness or legal
approval. No production deployment, paid provider generation or live-money movement
was performed. Next is the Convex records/files restore proof and explicit evidence
of the scheduled work that snapshots omit, under #286.

## Stage 22 — prove Convex data restoration and expose missing work

Sluice selects the main channel for #286's archive-to-runtime boundary. The
existing official Convex export/import operations own backup transport. Add a
complete comparison of their records, component data, schema material and storage
bytes, then run it against two disposable local deployments. This is the next
application-recovery step after the proven ledger restore; it is not a substitute
for restoring scheduled work or the hosted drill.

Requires: readable complete native exports, a fresh isolated target, matching code
and component configuration, and explicit development environment. Ensures: every
archive member is accounted for; document IDs, creation times, typed values, schema
and raw files agree after native import and re-export. Invariant: no sample or
truncated listing can establish completeness; no shared deployment, secret-bearing
environment or production import is used; matching stored data does not prove
that a missing scheduler callback will run. On malformed, duplicate, unsafe,
oversized or unreadable input, fail comparison without extracting files or
printing private rows. A failed command or cleanup makes the native drill fail.

The native fixture will exceed 1,000 root records, include special Convex values,
real Agent component records and binary storage, and query restored invariants.
Altered old records, missing/extra records, changed component data and missing or
changed files must be detected. A harmless future timer and its durable marker
will demonstrate what import actually does to scheduled work. Job evidence uses
complete namespace censuses; the CLI's silent `--limit` saturation is incomplete
evidence. Missing component namespaces cannot be called empty. Root and nested
Workpool, Workflow, Agent and migration work must not be silently treated as
recovered merely because their ordinary rows match.

Complexity decision: one archive reader/comparator absorbs native ZIP/JSONL,
canonical comparison, limits and private-data-safe receipts. Use installed OS
`unzip` with argument arrays, never extraction; no ZIP library or new dependency.
Its operational CLI and native drill are the two callers. Extract the existing
anonymous CLI environment/process cleanup only for the existing codegen proof and
this second real caller, keeping selectors and cleanup in one place. The added
module boundary buys one implementation of environment isolation, bounded command
output and owned-process cleanup; a general deployment framework would not.

Recovery classification: archive/CLI/target failures are operational failures
that stop this isolated proof and retain a diagnostic code. They never trigger a
production fallback or a data import retry against another target. Cleanup belongs
to the native process owner and must finish before success is reported. Tests use
the existing Vitest setup and native CLI; no new test infrastructure, cloud service,
application API or durable application schema is introduced. Fixture registrations
and schema additions exist only in the disposable copies.

Root owns the native orchestration, fixture and acceptance. Bounded workers own
the complete archive comparison and the reused anonymous CLI runtime separately;
heavy checks are serialized. The gate remains a source check, while the explicit
native drill establishes data restoration and records any unrecovered work. A
separate recovery action, grounded in that observation, is still required wherever
the maintained components or application do not resume the original work.

Native format findings refine the comparison contract. Each namespace's `_tables`
member is its table census; `_storage` and `_tables` themselves sit outside that
census. Mapped ordinary tables must exist, including empty tables, and ordinary
table members must be mapped. Uniform exports write int64 values as raw JSON
integer tokens and finite Float64 values as floating-point tokens. Preserve
those tokens through Node 22's maintained JSON reviver before hashing: ordinary
JavaScript numeric parsing can silently equate distinct int64 values. Preserve
the order of `generated_schema.jsonl`; its first line selects decoding and later
legacy lines supply per-document context. Actual native import and readback own
semantic schema validation; no JavaScript copy of Convex's Rust schema parser is
introduced. The installed SDK validates reserved binary and special-float tags.

The two runtime callers have different process lifetimes. Codegen keeps automatic
per-command cleanup. The native drill explicitly retains a backend after a
successful command because `data`, `export` and `import` require a running local
backend. The installed CLI also closes a backend it temporarily starts for `run`,
so the native owner starts the maintained `convex dev` process in each disposable
copy and keeps it alive for the drill. Startup is bounded and its returned stop
operation reports unexpected process failure. Failed, timed-out or saturated
commands always clean up. The owner terminates both disposable deployments and
removes their data before it reports success. Both native pushes use the same
cached backend version; the target is observed empty before import. The two
explicit lifetime operations replace a duplicate environment/process launcher;
there is no native binary reimplementation, session manager or deployment service.

The operational comparison command is read-only:

```sh
npm run verify:convex-restore -- \
  --source /secure/source-snapshot.zip \
  --restored /secure/restored-snapshot.zip \
  --receipt /secure/convex-records-files-match.json
```

Use complete native exports with file storage, generated from the verified source
and isolated restored target at the agreed cutoff. The command creates a new
private receipt containing aggregate counts and digests; it will not overwrite an
existing receipt. It does not select or mutate a deployment, establish archive
provenance, or prove scheduler, environment, code, Formance or external-effect
recovery. Hosted target selection, encryption, retention, RPO/RTO and production
restore authorization remain separate operator responsibilities.

The native acceptance fixture restores 1,007 root records, a real Agent thread and
message, and a 1,031-byte stored file. The complete archive covers 19 namespaces,
225 table entries, 1,198 document/table-mapping entries and 414 logical members.
Readback verifies exact int64, fractional values, bytes, NaN, Infinity, signed
zero, component data and file checksum. Six independent corruptions are refused:
an old record outside a 1,000-row listing, a missing record, an extra record,
changed component data, a deleted file and modified file bytes. The private
receipt is created exclusively after a complete match; failed comparisons do not
create one. Unit evidence additionally establishes malformed-input rejection,
complete bounded output, isolated selectors and owned-process failure cleanup.

The scheduler census establishes a specific remaining gap: the source has one
future callback, the restored target has none across all 19 namespaces, and the
durable marker still refers to the missing callback. This proves data recovery,
not resumed application work. The next stage must prove the maintained component
and application recovery operations, preserving uncertain external outcomes and
the original effect identity. No hosted restore, production wiring, live-money
operation or paid provider generation was performed.

Final verification: `npm run check` passes. Under Node 22/npm 11.5.1,
`AE_DEPLOYMENT_ENVIRONMENT=development AE_FORMANCE_ENVIRONMENT=sandbox npm run gate`
passes anonymous seven-file Convex generation, public-build integrity, clean
types, zero cycles, 7,277 unit tests, 2,534 integration-command tests, four type
tests, 75 import checks, TypeScript standards, 31 SEO checks, 16 browser journeys,
18 accessibility checks and reproducible CLI packaging. The integration command
also selects the 54 new Convex-named unit cases; its count is not a disjoint total.
One unit skip, 55 integration skips and three todos remain. The native restore
test is deliberately opt-in in the ordinary gate; the separate
`AE_CONVEX_RESTORE_INTEGRATION=true vitest run tests/integration/convex-native-restore.test.ts --no-file-parallelism`
passes in 148 seconds with the pinned native backend. One preceding run timed out
during a verified 24-minute clamshell sleep; its disposable process/data were
explicitly cleaned before the successful rerun. These are local source and native
runtime proofs, not hosted or complete application-restoration acceptance.

## Stage 23 — recover missing Call completions; queued restore remains open

Sluice selects the main channel for the restored scheduler and durable Call
boundary. Successful Workpool actions already run their completion callback in
the completion mutation; no new inline-callback adapter is needed. The remaining
failure, recovery and callback-fallback paths can leave a pending Call referring
to finished work. The existing automatic reconciliation selector excludes those
Calls. Reuse the maintained Workpool status query and existing Call completion
classification, connected to the admitted reconciliation sweep.

Requires: current workload admission, a bounded native cursor page under a fixed
creation-time cutoff, a pending non-approval Call and its exact stored WorkId.
Ensures: only Workpool items observed finished are passed through the existing
failed-completion and reconciliation initialization path. Every page is visited,
including equal timestamps and pages filled by active work. Invariant: queued or
running work is not replaced; Call identity, input, booking, attempt and release
fences remain authoritative; no Provider request, signature or external ledger
posting occurs in this mutation. A missing scheduler row is never evidence that
an external effect did not happen. On violation: invalid bounds or workload,
failed component reads or failed continuation scheduling abort the transaction;
no partial page is reported as recovered. Each continuation revalidates current
workload admission. The next admitted cron can restart a lost continuation.

The recovery mutation and its continuation are naturally replayable through
Convex transactions and the existing pending-state/exact-WorkId completion guard.
Concurrent passes and late callbacks must not overwrite a terminal Call or create
a second attempt. The existing reconciliation worker owns any later status read
or exact refund; new spending still requires current authority. The native acceptance test
requires queued Workpool work to resume with its original identity and one effect
after stopping the source and invoking the maintained `kick:forceKick` twice.
This criterion is not yet met. It does not authorize blanket external action
replay or establish complete application recovery.

Complexity decision: extend the existing Call reconciliation concern and cron
consumer, with one internal registration. Reuse the existing pending/creation-time
index, native cursor and transaction/scheduler mechanisms; no new table, index,
public API, recovery service or generic callback reconstruction. Native fixtures
reuse the isolated CLI runtime. This adds a bounded scan to the existing recovery
cadence in exchange for automatically repairing the observed missing-consumer
path, without adding a customer decision or manual retry requirement.

The seven new registered-mutation tests and 18 reconciliation-worker tests pass.
They establish cursor reachability beyond 25 active rows at the same creation
cutoff, conservative held/uncertain classification, preserved original financial
and attempt records, duplicate/stale-generation protection, current workload
admission, and transaction rollback on component-read or scheduling failure.
The scheduler failure is an injected boundary; status reads use the real
Workpool component. Financial records in this fixture are synthetic, not proof
of a native Formance refund or an external Provider effect.

The native drill reached and passed the data/file comparison, six corruption
falsifiers and Call-recovery assertions: three stranded Calls were classified
behind 25 active Calls through a real scheduled cursor continuation. Concurrent
recovery repeats retained the same classification and original identities. The
source backend was stopped before target execution. **Queued work did not resume.**
Three native runs reached the same failure; direct readback found the queued job
pending with zero effects and zero completions, and both restarted BatchWorker
loops failed with `Function handle not found`. No successful full-restore receipt
was produced. At Stage 23 close, the opt-in native test retained the positive
one-effect assertion and failed promptly on an explicit runner-failure check.

This matches the pinned backend's handle contract: a stored function handle is
resolved by its system-table ID, with the appended function name only advisory
([handle format](https://github.com/get-convex/convex-backend/blob/5c7cb5b/crates/common/src/bootstrap_model/components/handles.rs),
[lookup](https://github.com/get-convex/convex-backend/blob/5c7cb5b/crates/model/src/components/handles.rs)).
Logical exports include user tables and optional file storage, excluding the
system handle mapping ([export implementation](https://github.com/get-convex/convex-backend/blob/5c7cb5b/crates/exports/src/lib.rs)).
The documented cloud backup and CLI export use the same ZIP format
([backup contract](https://docs.convex.dev/database/backup-restore)). This is
fresh-target evidence for backend `precompiled-2026-09-28-5c7cb5b`, Workpool 0.4.10
and BatchWorker 0.2.1, not a test of same-deployment or dedicated physical restore.

Installed Workpool has no maintained operation to rebind the execution and
completion handles on an existing WorkId. Refreshing its main-loop handles alone
would leave those job handles stale. Do not make the drill pass by rewriting
private component records or treating an advisory handle suffix as authority.
Keep #286 open. The next engineering boundary is supported handle restoration or
reconstruction of work from AE's original durable domain records, with explicit
Call/effect identity and external reconciliation before any new dispatch. Other
restore consumers, hosted retention/RPO/RTO, and actual restored financial effects
remain outstanding. This stage's safe finished-Call repair does not close those
requirements or the full Wayfinder objective.

The final native run fails explicitly on two `loop.js:loop` handle-resolution
failures after 160 seconds; the preceding Call-recovery assertions pass. Both
disposable deployments and their files were cleaned. Stage 23 ended with this
failing acceptance test; Stage 24 below adopts a different, bounded recovery operation.
The ordinary gate leaves this pre-existing opt-in native drill disabled, so a
passing source gate does not establish full recovery.

Final source verification under Node 22/npm 11.5.1: `npm run check` and
`AE_DEPLOYMENT_ENVIRONMENT=development AE_FORMANCE_ENVIRONMENT=sandbox npm run gate`
pass. The gate verifies seven-file anonymous Convex generation, public-build
integrity, clean types, zero cycles, 7,285 unit tests, 2,542 integration-command
tests, four type tests, 75 import checks, TypeScript standards, 31 SEO checks,
16 browser journeys, 18 accessibility checks and reproducible CLI packaging.
Integration selection also includes Convex-named unit files; these totals are not
disjoint. Existing skips/todos remain: one unit skip, 55 integration skips and
three todos. The separately executed native command
`AE_CONVEX_RESTORE_INTEGRATION=true npm test -- tests/integration/convex-native-restore.test.ts --no-file-parallelism`
failed at Stage 23 on the restored function handles as described above. No production
deployment or live-money drill is represented by these local checks.

## Stage 24 — quarantine restored Calls and retire broken dispatches

The Stage 23 fresh-target failure rules out assuming that an unchanged WorkId
can resume after logical import. This stage changes the recovery operation, not
that backend fact: preserve the original commercial Call and effect identity,
retire the unusable dispatch through maintained cancellation, and retain an
explicit unresolved purchase. Source shutdown and target isolation are operator
preconditions. This is a partial restore capability, not permission to restart
payments from an old snapshot.

Requires: the old source is stopped, target application crons/ingress are held,
the target Workpool's BatchWorker is stopped, current workload admission, and
1–25 distinct exact Call/expected-WorkId pairs from the restored records. Ensures:
only matching pending or already quarantined Calls are admitted; their existing
reconciliation becomes manual review of unknown settlement, their dispatch is
cancelled through the maintained API, and local reserved/possibly-submitted money
projections become outcome unknown. Invariant: preserve Call, input, Quote,
booking references, WorkId and any actual attempt/generation; no Provider call,
signature, transfer, refund or replacement purchase. Missing local reservation
or attempt evidence never proves that no post-snapshot effect occurred. On
violation: refuse a stale/ineligible batch; invalid bounds, lost admission or a
component failure abort the transaction. Cancellation acknowledgement is not
retirement: separately read maintained Workpool status until every exact old
WorkId is finished before continuing.

Reads must preserve this manual unknown-settlement result instead of deriving a
retryable status or pre-submission refund from an older canonical control.
Positive external evidence that identifies the original payment remains the basis for
later resolution. An unused old nonce does not exclude another attempt after the
snapshot, so expiry scheduling and unused-authorization claims cannot erase this
hold either. Current work does not reconstruct missing signing identity or
claim that a local fixture proves native Formance/chain reconciliation.

The same hold is enforced when writing the result: a generic recovery or record
operation that started before quarantine must not clear the result, WorkId,
attempt or evidence afterward. Such a stale operation raises
`call_manual_settlement_review_required` before mutation, so its caller cannot
report a successful retryable reset. The existing verified-paid projection
retains its separate exact-attempt, settlement and retained-output checks.

Complexity decision: one operator-only concern/registration for bounded exact
quarantine plus cancellation, and the existing recovery read/control boundary
exposes the existing manual hold. This adds no app table/index, public endpoint,
queue implementation or customer step. It earns its cost by making the domain
hold and cancellation atomic; raw component cancellation cannot protect the
Call from an unsafe local-absence inference. Reusing ordinary failed completion
was rejected because it can offer a new purchase for an apparently unfunded old
snapshot. Blind redispatch and private component-handle rewrites are rejected.

Error strategy: stale identities or terminal Calls are recoverable operator
conflicts with no changes; malformed bounds and invalid workload fail admission;
component/scheduling errors propagate and roll back the complete batch. The
multi-transaction stop/refresh/cancel/start sequence has a basic guarantee: interruption
leaves Calls held and is replayable with the same exact pairs. No successful
receipt may claim retirement while work is pending/running. Native acceptance
must observe zero additional effects from old jobs and a single effect plus
completion from a newly enqueued probe after retirement. The former original-
WorkId resume criterion is unsupported on this pinned logical-import path; this
new criterion establishes safe retirement and subsequent queue usability only.

Operator sequence for the pinned Workpool 0.4.10/BatchWorker 0.2.1 installation:
select and independently verify the isolated target before every CLI operation;
keep application ingress/crons and the old source off throughout this procedure.
Use the verified archive census for the exact Call/WorkId pairs. This operation
does not discover or classify all other restored consumers or unbound Calls.

1. Run `lib:stop {"name":"main"}` in component `workpool/batchWorker`.
2. Run `loop:updateRunStatus {}` in component `workpool`. This installed,
   deprecated compatibility registration calls the maintained runner ping with
   freshly created target handles while leaving a stopped worker stopped. It is
   not a public Workpool client API. This refresh is required even when every
   cancellation already exists in the backup, because duplicate cancel is a no-op.
3. Read `workloadCron:admit` with
   `{"name":"reconcile due facilitator invocations"}`. Supply that current
   snapshot as `workload` to `capabilityCalls:quarantineRestoredDispatches`, with
   `dispatches` containing 1–25 `{callRef,expectedWorkId}` pairs. Repeat exact
   batches safely; stop on a refused pair and inspect the changed domain record.
4. Run `lib:start {"name":"main"}` in `workpool/batchWorker`. Poll `lib:statusBatch`
   in `workpool` with `{"ids":[...]}` for every old WorkId until all are `finished`.
   Already-running work can take the maintained recovery interval to retire.
   A timeout is incomplete retirement, never proof of no external effect.
5. Read the original Calls: they must remain manual unknown-settlement holds,
   with the original references and no new purchase. Keep payment execution and
   unrelated consumers held pending their own reconciliation. Queue usability
   alone does not permit re-enabling production.

The internal recovery projection carries an optional derived manual-settlement
flag; this is not new storage or a public response field. It suppresses generic
status/cancel/pre-submission and managed-signing recovery while held. The expiry
scheduler and claim refuse held Calls before scheduling or changing evidence;
the former retry-limit path could erase the hold without any chain read. The
dedicated verified-paid remedy retains its existing admission rules. Generic
onchain reconciliation and CDP forensic recovery also pass through
the shared hold, so this stage does not promise every former recovery route can
run during quarantine. The response watchdog cannot erase the manual hold.

### Stage 24 acceptance and handover

- The 24 new focused cases establish exact-batch admission, transaction rollback,
  duplicate/concurrent replay, normalization of incomplete prior holds, retained
  financial identity, and refusal of stale result writers, watchdogs and expiry
  recovery. A registered positive-control case resolves the exact manual hold
  with the original settled payment and matching retained output. These are
  application transaction proofs; they do not prove external payment recovery.
- The final opt-in native drill passes in 170 seconds. Records/files and all six
  corruption falsifiers still pass. It explicitly observes two original-handle
  restart failures, then uses the documented stop/refresh/quarantine/cancel/start
  sequence. All 28 old Call jobs finish with zero additional executions; all Calls
  retain their original references and manual holds. The old queued probe has
  zero executions/completions; a fresh probe executes and completes exactly once.
  Expiry attempts 0 and 5 cannot remove the hold. Both disposable deployments and
  their files were removed. An earlier CLI stop failed once after reimport and
  did not reproduce; its cause remains unproven. The final procedure additionally
  stops the first experiment's monitor before replacing its durable state.
- Node 22/npm 11.5.1 `npm run check` and
  `AE_DEPLOYMENT_ENVIRONMENT=development AE_FORMANCE_ENVIRONMENT=sandbox npm run gate`
  pass: seven generated files, public build integrity, zero cycles, clean types,
  7,309 unit tests, 2,566 integration-command tests, 75 import/boundary checks,
  31 SEO checks, 16 browser journeys, 18 accessibility checks and CLI packaging.
  Integration counts overlap the unit suite. The existing one unit skip,
  55 integration skips and three todos remain. Native restore is a separate
  successful opt-in command, not an ordinary gate pass through a skipped test:
  `AE_CONVEX_RESTORE_INTEGRATION=true npm test -- tests/integration/convex-native-restore.test.ts --no-file-parallelism`.

Keep #286 and #256 open. This proves safe retirement and queue usability, not
same-WorkId resumption, automatic payment recovery or complete application restore.
Other restored consumers, hosted wiring, retention/RPO/RTO and live-money
acceptance remain outstanding. Next, exercise held Calls against the native
Formance ledger, including external money effects recorded after the snapshot;
resolve from original financial evidence before allowing another purchase.

## Stage 25 — recover original financial facts across a stale Convex snapshot

Design thesis: repair a restored Call's original accounting facts from exact
native ledger evidence without creating another financial effect or inventing
delivery. Sluice selects the main workflow for the Convex/Node/native-ledger
boundary. The existing settle action cannot serve this operator operation: when
its references are absent, it submits a new bulk. Refund processing already
contains the exact original-settlement proof; separate that read for reuse.

Requires: a valid frozen Call/Quote booking, a compatible configured money world,
local financial state eligible for reconciliation, and the original local
reservation attachment and matching Provider obligation. Ensures: only a complete
native settlement whose references, templates, metadata and postings match the
original booking may restore the local financial and Provider-obligation facts.
Recheck the booking digest, reservation attachment and obligation identity/state
in the final mutation, including on replay. Invariant: no ledger write,
new signature, Provider request, refund, credit release, replacement purchase or
delivery/status inference; the original Call's manual hold and input persist.
On violation: malformed, missing, partial, conflicting or unavailable evidence
returns an explicit refusal/unavailability; changed bookings, missing local
reservation/obligation facts and conflicting remedies or obligation states refuse
local finalization. Every unsuccessful read leaves local state
unchanged. A retry repeats the read and repairs the same original references.

Type decision: a settlement observation is confirmed (with complete ordered
references), refused, or unavailable. It must not reuse the write result's
`submissionProvenAbsent` flag: a failed read says nothing about an earlier
payment. Existing write/refund results retain their contracts.

Idempotency and error strategy: the native operation is read-only. The local
finalizer is one Convex transaction, with exact booking binding and existing
state/remedy conflict controls; duplicate and concurrent calls converge on the
same references without changing replay timestamps. Network failure is a
recoverable read failure; native evidence conflicts refuse. An interruption
between proof and local finalization leaves a replayable hold. Accounting
settlement does not establish delivery or account for every later adjustment.

Design review was completed against the settled requirements without an
interview. Integrity is strong: proof, runtime adapter and transaction binding
all serve the same repair. The main risks are mistaking absence for authority,
accepting incomplete native evidence, and a stale local booking. Keep the proof
in the existing workflow module and reuse it in refund verification. Reject a
new reconciliation table, scheduling framework, automatic payment retry or UI
step. The cost is one read result and two internal action registrations, plus
an optional binding on the existing finalizer; the benefit is a real recovery
operation that cannot write money. Bounded native reads and the existing
component/ledger harnesses keep its scope contained.

Verification must retain the native Formance ledger while restoring an older
Convex archive, recover a post-snapshot settlement, and prove unchanged complete
ledger state across recovery, replay and concurrent calls. Missing/conflicting
evidence must retain the hold. Root owns the native integration and acceptance;
bounded workers own the shared native proof and Convex consumer respectively.

Operator use follows Stage 24 quarantine and retirement. Stop and drain effect
writers in both the source and target, including other operators and remedy
workers, before reading original financial evidence. Keep them stopped during
this operation. The native proof is an observation of the original settlement;
it cannot rule out a later refund, reversal, remedy or chain event. Retention
and reconciliation of those later facts remain separate restore work.

On the independently verified target, run the internal action
`moneyManagedCallLifecycle:reconcileSettlement` with the original `callRef` and
current millisecond `now`. It repairs eligible `possibly_submitted` or
`outcome_unknown` accounting state; an already `settled` Call still requires a
fresh exact native read before replay. A successful result is
`{"kind":"accepted","state":"settled","replayed":false}`; matching repeated
calls report `replayed:true`. Inspect the original settlement references and
Provider obligation, and verify that the manual hold remains. A refusal retains
the hold and requires investigation; it never authorizes a replacement payment,
credit release, refund or completed delivery. This operation has no automatic
scheduler and does not reopen execution or general purchasing.

Final contract review identified a pre-attachment gap: an `outcome_unknown` Call
can exist before the local reservation and Provider obligation are recorded.
The new read-bound finalizer must refuse that incomplete local restore, and
refuse a mismatched or subsequently reversed/disputed obligation, before any
write or settled replay. Recovering the missing reservation/obligation is a
separate operation; native settlement evidence alone does not make this local
record complete. Existing unbound settlement callers retain their contract.

### Stage 25 acceptance and handover

The final native drill passed in 95.40 seconds on the pinned local Convex backend
and the maintained disposable Formance stack. It takes a Convex archive after
real native reservation, stops the source, then records original settlements in
the surviving native ledger before importing the older application archive.
After quarantine and dispatch retirement, the registered recovery action:

- recovers two original settlements (mixed purchased/promotional and all-promotional);
- refuses a missing settlement and a conflicting native Provider transaction;
- retains all four manual holds, original inputs, Quotes, WorkIds and reservation references;
- converges on concurrent replay without rewriting Call or obligation timestamps;
- preserves every original native transaction ID and the complete ledger summary
  (schema, accounts and transactions), establishing zero native money writes
  across recovery, refusal and replay.

The registered Convex boundary tests also establish changed-booking refusal,
read unavailability without an absence claim, preserved payment-attempt records,
missing attachment/obligation refusal, and protection of later obligation facts.
The native fixture does not seed a real payment attempt or prove chain payment,
Provider delivery, later refunds/reversals, or recovery of a missing local
reservation/obligation. Both isolated deployments and the test's Compose project
were removed after the drill; shared deployments were not used.

Reproduce the native proof separately from the ordinary gate (which skips it):
`AE_CONVEX_RESTORE_INTEGRATION=true AE_FORMANCE_INTEGRATION=true npm test -- tests/integration/convex-native-restore.test.ts --no-file-parallelism -t 'repairs post-snapshot settlements'`.

Acceptance on Node 22/npm 11.5.1: `npm run check` and
`AE_DEPLOYMENT_ENVIRONMENT=development AE_FORMANCE_ENVIRONMENT=sandbox npm run gate`
passed. The gate includes seven-file isolated code generation, public build,
clean types, 7,370 unit tests, 2,600 integration-suite tests, 75 import checks,
31 SEO checks, 16 browser journeys, 18 accessibility cases and the reproducible
CLI package. Suite counts overlap; one unit skip, 56 integration skips and three
todos remain. Focused money/refund and recovery suites passed 97 cases. The
funding suite passed 31 cases after its rendering assertion was corrected to
advance and await scheduled work with the existing controlled-clock pattern.

Keep #286 and #256 open. This stage repairs original accounting facts while
retaining delivery uncertainty. Complete restore still needs missing local
financial records, later adjustments, other consumers and hosted retention/RPO/RTO
acceptance. Production provisioning and explicitly authorized live-money drills
remain separate requirements. No merge, deployment or live-money action occurred.

### Stage 26 — recover missing reservation records under a manual hold

The next restore boundary is a surviving native reservation whose local Call
attachment or canonical Provider obligation is absent. A restored Call may have
no WorkId because reservation precedes dispatch. Ordinary attachment can reopen
that Call, so recovery needs a separate internal action and transactional repair
inside the existing managed-Call concerns.

Contract-enforcer, idempotency-guardian and error-strategist conclusions:

- **Requires:** stopped and drained source/target effect writers and remedy
  operators; the original executable frozen booking; a consumed Quote; exact
  native proof of every original reservation command, metadata value and posting.
  A Call with a WorkId must already have the existing manual unknown-settlement
  hold. An unbound Call can enter that hold atomically with repair.
- **Ensures:** restore compatible missing attachment fields and the canonical
  Provider obligation, held pending reconciliation. Recheck the booking digest
  and all surviving local facts within the transaction. Preserve original input,
  Quote, WorkId, authority, payment attempts, controls, financial locators and an
  existing uncertainty result. Exact concurrent replay performs no timestamp or
  evidence rewrite. The existing settlement reconciliation can then consume the
  repaired accounting facts.
- **Invariant:** zero native money writes; reservation history establishes
  neither current spendability nor payment absence. Recovery leaves financial
  uncertainty and a manual hold; it grants no retry, release or delivery success.
  Ordinary reservation claim, attachment and unknown-result writers respect that
  hold. Existing non-manual reservation recovery retains its behavior.
- **On violation:** missing, partial, reverted or conflicting native evidence
  refuses; unavailable reads stay unavailable. Changed booking, conflicting local
  attachment/obligation, active remedies and later released, settled, disputed or
  reversed facts refuse before any local write. Retain evidence for investigation.

Type-driven design uses an explicit confirmed/refused/unavailable native read
result. Confirmed contains the complete ordered references, with no absence or
retry field. A distinct repair operation makes historical accounting recovery
separate from ordinary reservation authority without changing stored schemas.

The complexity/design review keeps the producer's exact command builder and the
existing native reference reader and posting matcher. Eight reads per batch bound
the maximum 103-command reservation without lowering the supported grant limit.
The cost is two internal action registrations and one internal mutation, plus
four template cases in the existing matcher. The benefit is recovery of the real
pre-attachment failure window. Reject a new table, generic repair framework,
automatic retry, payment submission or user-facing step. The settled product and
financial boundaries supply the design constraints; no new design interview is
needed. Root owns integration and acceptance; bounded workers own the native
proof and the Convex consumer in separate files.

Verification will archive genuine unbound Calls before reservation, stop the
source, create their original native reservations and settlements, restore the
older application state, then invoke the registered repair and settlement
actions. Complete ledger summaries and original transaction IDs must stay
unchanged. Missing/conflicting evidence must refuse without local mutation;
focused tests cover local conflicts, stale booking, later facts, duplicate and
concurrent repair, and late ordinary writers against the manual hold.

Operator sequence: retain the source/target and remedy-writer stop from Stage 25.
If the restored Call has a WorkId, complete Stage 24 quarantine and retirement
first. For an original unbound Call, run
`moneyManagedCallLifecycle:reconcileReservation` with its `callRef` and current
millisecond `now`. The successful result is
`{"kind":"accepted","state":"outcome_unknown","replayed":false}`; a matching
repeat returns `replayed:true`. Inspect the complete original reservation refs,
held canonical Provider obligation and manual unknown-settlement hold. Then use
Stage 25 `reconcileSettlement` if original settlement is present in the native
ledger. Both operations preserve delivery uncertainty. Refusal requires evidence
investigation and gives no permission to release credits or retry payment. A
missing original native reservation leaves the restored local record unchanged;
keep the deployment stopped while resolving that uncertainty.

### Stage 26 acceptance and handover

Both native financial restore scenarios passed in 381.60 seconds including
disposable environment setup and cleanup. The earlier attached-reservation
scenario remains green. The new scenario archives four genuine unbound Calls
before native reservation, local attachment or Provider obligation; stops the
source; and creates original reservations/settlements in the surviving ledger.
After restoring the older application archive, the registered operations:

- reconstruct two complete reservation attachments and held Provider obligations,
  covering mixed purchased/promotional and all-promotional consideration;
- converge on concurrent initial repair and inert replay, then recover both
  original settlements through the existing settlement reconciliation action;
- retain the original Quotes, inputs, absent WorkIds and manual uncertainty;
- refuse missing and conflicting reservation evidence without local changes;
- preserve complete ledger summaries and every original reservation/settlement
  transaction ID, proving zero native money writes during recovery and replay.

The 159 focused workflow/refund and managed-Call tests passed. They additionally
cover stale booking, local partial/conflicting facts, later dispositions,
unavailable reads, preserved payment attempts, delayed ordinary writers, and
the full 103-member reservation with at most eight reads in flight. Independent
review found and closed a compatibility defect: a genuine uncertain-payment
receipt retains the first reservation reference. Repair now preserves that
proven locator and refuses foreign or later references.

On Node 22/npm 11.5.1, `npm run check` and
`AE_DEPLOYMENT_ENVIRONMENT=development AE_FORMANCE_ENVIRONMENT=sandbox npm run gate`
passed. The gate reproduced seven generated Convex files, built the public app,
passed clean types, 7,432 unit tests, 2,630 integration-suite tests, 75 import
checks, 31 SEO checks, 16 browser journeys, 18 accessibility cases and reproducible
CLI packaging. Counts overlap across suites; one unit skip, 57 integration skips
and three todos remain. The ordinary gate skips native drills; the Stage 25
opt-in command now runs both financial restore scenarios.

Keep #286 and #256 open. This closes original reservation attachment/obligation
loss without reopening execution. Later adjustments, other restore consumers,
hosted retention/RPO/RTO and explicitly authorized live-money acceptance remain
unverified. Native fixtures do not prove chain payment or Provider delivery;
payment-attempt preservation is established by the registered boundary tests.
Both scenarios removed their own deployments and Compose projects. No public API,
storage schema, deployment or live-money change occurred.
