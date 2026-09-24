# Convex root protocol (Quote standard)

Status: active from 2026-09-24. The owner is the orchestrator session. This file holds the backlog and the ledger (see the bottom).

## 1. What we optimise for

**Maintainability** is the cost of the next correct change. **Dev ergonomics** is the time from "I need to change X" to "X is changed and verified". Both come first. Every rule below serves them. Tidiness for its own sake is not a goal.

| Property | Target | How it is checked |
|---|---|---|
| Locality | Changing one concern touches one lib file plus its colocated test, and the root only when a signature changes. | Review of the diff |
| Findability | From the RPC name to the handler body is at most 2 hops. The file name names the concern. There are no barrels. | Review |
| One home | Each type, validator, digest and helper is defined once. | grep |
| Direction | `src/` never imports `convex/*.ts`. `convex/lib` may import `src/modules`. `src/modules` may import `convex/lib` only for ctx-bound helpers (the call-worker case). | grep and `test:imports` |
| Fast verify | Every concern has a colocated test that runs alone in under 60s. | `npx vitest run <path>` |
| Honest gates | Ratchets only go down. Every root over 200 lines is visible to the gate. | `test:imports` |

## 2. The standard

The reference is `convex/capabilityQuotes.ts`. It is about 75 lines of registrations only. Its depth lives in `convex/lib/capabilityQuotes/`, one concern per file. HTTP and chat share `quoteAction`, and tests sit next to the lib files.

A root passes when all four checks hold:
1. **Registration only.** The root contains imports plus `query`/`mutation`/`action`/`http` exports and nothing else: no handler bodies, no validator unions, no DB logic. The cap is 200 lines.
2. **Depth sits in `convex/lib/<domain>/`, one concern per file.** Files are grouped by concern (issue, admit, valuation, refusal), not by "everything the feature touches". A root that is really the lib fails.
3. **`src/` does not import the root.**
4. **One core, many callers.** HTTP, MCP and chat call the same core. None of them carries its own copy of admission, command building or parsing.

## 3. Judgement rules

- **Delete before you move.** Dead exports and RPCs with zero references are deleted first, so we never relocate code nobody calls.
- **Commits are move-only.** A root pass changes structure, not behaviour. If a clean split needs a behaviour change, stop, record it, finish the move, and ship the behaviour change as its own commit.
- **A concern is not a function.** Keep closely related helpers in one file. Do not create a lib file under ~30 lines unless it is a genuine standalone concern. A file under ~150 lines with a single concern stays as it is.
- **Validators live with their concern.** They go into a shared `contracts.ts` only when two or more concerns in the same domain use them. No global validator dump.
- **Type unification means one home, proven by the compiler.** When two copies of a shape have drifted, the Convex-authoritative shape wins, but only if every consumer compiles unchanged in meaning. If the drift is semantic, stop and record it.
- **RPC paths never change.** `api.<root>.<fn>` and `internal.<root>.<fn>` stay byte-identical, so no client, test or cron edits are needed.
- **Tests move only when they exclusively test a moved concern.** Do not rewrite tests to follow the code, and do not add tests to prove a move. The compiler and the existing tests are the proof.
- **Pure code goes to the domain, ctx-bound code goes to lib.** Logic with no `ctx` or `db` that `src/` needs goes into `src/modules/<domain>/`. Code that needs `ctx` goes into `convex/lib/<domain>/`.
- **Pins only go down.** Never raise a `FACADE_SIZE_EXCEPTIONS` ceiling. A root that has grown over its pin is the top priority, not a gate to relax.
- **Dev and seed roots** (`devSeed*`) are held to one rule only: fixture data is separate from registration. They are not gold-plated.

## 4. Triage classes

| Class | Examples | Treatment |
|---|---|---|
| Spine (money, authority, Call, Quote, supply admission) | moneyConnect, moneyDocuments, capabilityCallProjection | Full four checks |
| Projection or read model | capabilitySupplyProjection, x402DirectoryIndexStore | Checks 1 to 3; check 4 is usually not applicable |
| HTTP roots | providerConsequenceHttp, secretLifecycleHttp | Routes only; handlers move to lib |
| Small overshoot (200 to 300 lines, mostly inline validators) | varies | Mechanical: move the validators and handlers, then drop the pin |
| Dev and seed | devSeed, devSeedFixtures | Split data from registration |
| Dead | orphan RPCs | Delete |

## 5. Priority

`score = criticality (spine 3, projection or HTTP 2, dev or admin 1) + checks failed + 2 if src/ imports the root + churn tier (0 to 2, from the 60-day commit count) + 3 if the root is over its pin`

Work the highest score first. Churn decides ties, because the ergonomics payoff is largest where people work most. `capabilityCalls.ts` is deferred: it is already a façade, and its next step is splitting `convex/lib/callLifecycle/` by role.

## 6. The root pass: one root per commit

0. **Card.** Record the four-row card (Quote vs this file), the line count and pin, every importer, and every `api.`/`internal.` caller.
1. **Delete** the dead exports and RPCs in this root. Check for zero references across src, convex, tools, tests, crons, `http.ts`, package.json scripts, and `convex run` lines in docs.
2. **Extract.** Handlers move by concern to `convex/lib/<domain>/<concern>.ts`, and validators move to their concern (or to `contracts.ts` when shared). The root keeps only registrations that point at the imported handlers.
3. **Deduplicate** every shape or helper that has a second copy elsewhere, leaving one home.
4. **Rewire** `src/` importers to the domain module or lib (check 3).
5. **Move tests** that exclusively cover a moved concern so they sit beside it.
6. **Verify.** Run `npm run typecheck`, `npm run test:imports`, and the domain's existing tests. The `api.*` paths must be unchanged.
7. **Ratchet and commit.** The orchestrator lowers or removes the pin and commits the root with explicit paths.

**Definition of done.** The card shows all four checks passing (or explicitly not applicable). The pin is removed or lowered to the actual line count. The gates are green. No behaviour has changed. Touched files contain zero dead exports.

## 7. Roles in a wave

- **Orchestrator:** chooses the roots, owns `tests/imports/convex-facade-size.test.ts` and every commit, and lowers the pins.
- **Pass agent:** owns its root, its lib folder, and the importers named in its brief. It messages the owner over hub before touching any other file. It stops and reports when a premise does not match the source. It never stashes, resets, checks out, adds or commits.
- **Out of bounds for everyone:** the user's uncommitted files, as listed in the wave brief.

## 8. Ledger

| Date | Root | Before (lines, checks passed) | After | Commit |
|---|---|---|---|---|
| 2026-09-24 | capabilityProviderConsequenceJournal.ts | 985 lines, checks 3 | 44 lines, checks 1-4 pass | 314a0a544 |
| 2026-09-24 | capabilityCallProjection.ts | 873 lines, checks 4 only | 8 lines, checks 1-4 pass | 70f34603c |
| 2026-09-24 | moneyConnect.ts + moneyLedger.ts | 935 + 367 lines, check 3 only | 2-line shell + 131 lines; checks 1-3 pass, check 4 partial (Connect type drift is semantic) | 3945f4283 |
| 2026-09-24 | moneyDocuments.ts | 848 lines, check 3 only | 100 lines, checks 1-4 pass | faafb3aed |
| 2026-09-24 | x402DirectoryIndexStore.ts + x402DirectoryIndex.ts | 695 + 474 lines | 12 + 17 scanner lines, checks 1-4 pass | 81de5b0a6 |
| 2026-09-24 | capabilitySupplyReadiness.ts + capabilitySupplyPublicationPorts.ts + capabilitySupplyGraphPorts.ts | 314 + 247 + 239 lines | 33 lines + two 2-line empty shells | 6729cdb3a |
| 2026-09-24 | workloadCron.ts | 638 lines | 118 lines | 3640ec590 |
| 2026-09-24 | facilitatorDiscovery.ts | 552 lines | 9 lines | d3a419779 |
| 2026-09-24 | moneyFormance.ts + moneyAccountFunding.ts | 524 + 223 lines | 84 + 194 lines; one Node Formance gateway (`convex/lib/money/formance/gateway.ts`) | 85775bb67 |
| 2026-09-24 | moneyManagedCall.ts + moneyManagedCallLifecycle.ts | 327 + 320 lines | 21 + 59 lines | 1eb4a9c13 |
| 2026-09-24 | agentAccessPolicy.ts + authorityBoundary.ts | 329 + 438 lines | 43 + 9 lines | 982fe879e |
| 2026-09-24 | workspaceAccounts.ts + workspaceTeam.ts | 758 + 279 lines | 37 + 16 lines | 5413a9b1f |
| 2026-09-24 | moneyBillingAuthorization.ts | 606 lines, zero RPCs | deleted; lib/money/billingAuthorization/{sourceWrite,persistedCall,delegation} | 9ce990cea, ee831d3a3 |
| 2026-09-24 | capabilitySupplyOwnerFunnelCommands.ts + OwnerFunnelProjection.ts | 768 lines + dir, zero RPCs | deleted; lib/capabilitySupply/ownerFunnel/; registration root capabilitySupplyOwnerFunnel.ts is 88 lines | ed97cfeec, ee831d3a3 |
| 2026-09-24 | capabilitySupplyProjection.ts | 734 lines | 24 lines, lib/capabilitySupply/projection | ba30b98d5 |
| 2026-09-24 | catalogOfferingMutations.ts | 490 lines | 13 lines, lib/catalog/offerings | bad64ce45 |
| 2026-09-24 | lib/money layout | 17 loose files | money/{funding,credit,earnings}/ | 2716ecda2 |
| 2026-09-24 | dead code | 13 RPCs, 7 empty roots, 10 src files | deleted (-737 src lines; about -2,400 convex lines) | 3509f0ed9, ee831d3a3 |
| 2026-09-24 | convex/lib layout (wave 4) | 23 folders + 21 loose files, mixed naming | 13 domain folders (adminConsole, agentAccess, authority, capabilityExecution, capabilitySupply, catalog, chat, market, money, platform, principalAccount, secrets, security), no loose files; 366 files moved move-only; dead authorityRegistrars removed | 0a3580e29 |
| 2026-09-24 | qualifiedUse.ts | 232 lines | 12 lines, registration only | d2baca6cd |
| 2026-09-24 | capabilityCallWorker.ts | 363 lines | 43 lines, registration only | d2baca6cd |
| 2026-09-24 | capabilityProviderConnectionCleanup.ts | 257 lines | 21 lines, registration only | d2baca6cd |
| 2026-09-24 | capabilitySupplyShared.ts | zero RPCs | distributed to capabilitySupply concerns; root deleted | d2baca6cd |
| 2026-09-24 | capabilitySupplyIntegrationDrafts.ts | 310 lines | moved to capabilitySupply/integrationDrafts; root deleted | d2baca6cd |
| 2026-09-24 | capabilityContractDocuments.ts | 345 lines | 23 lines after extraction, then 14 after dead RPC deletion | d2baca6cd |
| 2026-09-24 | x402PaymentAttempt attempt.ts + callLifecycle/contracts.ts + providerConnections/contracts.ts | 856 + 394 + 424 lines | attempt 23 lines plus concern files; contracts 272 + 354 lines | d2baca6cd |
| 2026-09-24 | dead code (wave 5) | 11 dead test-only RPCs (including 2 backfills), 15 unwired skeletons, 774-line publication-admit pair, 4 x402 shell roots | deleted; `x402DirectoryIndexBackfill.start` retained for category-stats rebuild | d2baca6cd |

### Decisions applied 2026-09-24
- **D1, catalog origin:** eligible-ports admission now checks the business ID and fails closed, as the graph path does (`34ccfe8f7`).
- **D2, command contract:** capability-supply owns the owner command result validator; its readonly view is derived from that contract (`fd96e01dc`).
- **D3, Connect:** HTTP no longer fabricates a payout binding; one Connect contract home remains, but the refusal and authority envelopes differ semantically (`483a2d613`).
- **D4, operator RPCs:** the two obsolete backfills were deleted; `x402DirectoryIndexBackfill.start` was restored as the category-stats rebuild entry (alongside its state/batch work). Kept operator entries: `moneyFormance.health`, `moneyFormance.installSchema`, `moneyManagedCallRemedyActions.resolveLostResult`, `interactiveAuthority.reconcileScheduledInteractiveAuthority`, `recoveryBreakGlass.submitRecoveryApproval`, `recoveryBreakGlass.authorizeRecoveryOperation`, and `x402DirectoryIndexBackfill.start` (`d2baca6cd`).
- **D5, dead RPCs:** 11 further test-only RPCs deleted: `actionExecutionControl.readControlSource`, `actionExecutionControl.recordLateObservationSource`, `capabilityContractDocuments.getActiveExactInternal`, `capabilityProviderConnectionMigration.backfillFacilitatorDiscoveryAuthority`, `capabilityProviderTools.backfillAdmissionPage`, `interactiveSession.listUserWorkspaces`, `moneyDocuments.createOwnerTaxInvoice`, `moneyStripeWebhookInbox.readHealth`, `notifications.dispatchNotificationInternal`, `workspaceProfile.syncOrganizationDisplayNameForServer`, `workspaceProvisioning.claimCreatedWorkspace`. Integration-fixture RPCs remain for a test-fixture pass; five Clerk webhook string references were kept: `workspaceInvitations.recordOrganizationInvitationCreatedForServer`, `workspaceInvitations.recordOrganizationInvitationRevokedForServer`, `workspaceMemberships.recordOrganizationMembershipCreatedForServer`, `workspaceMemberships.recordOrganizationMembershipUpdatedForServer`, `workspaceMemberships.recordOrganizationMembershipDeletedForServer` (`d2baca6cd`).
- **D6, layout:** pure terminal projection moved to `src/modules/capability-execution/terminal-projection.ts`; oversized attempt and shared contracts were split (`d2baca6cd`).
- **D7, ingress identity:** on Vercel, rate limiting trusts only `x-vercel-forwarded-for` (`7524cb6c8`).
- **D8, docs:** strategy documents 64→18 (`e5cc39fff`); docs overall 276→58 files and 24.7 MB→1.3 MB (`326c1b422`, `e5cc39fff`).

### Open
- Integration-fixture RPCs need a test-fixture pass before any further deletion; Clerk's five string-ref handlers are live references, not dead code.
- Connect's differing refusal and authority envelopes are semantic; do not unify them as a type-only move.
- `convex/lib/capabilityExecution/callLifecycle/admissionReserve.ts` (598 lines) and `convex/lib/money/x402PaymentAttempt/identity.ts` (412) remain oversized; `convex/moneyX402PaymentAttempts.ts` still has an inline reconcile handler.
- `convex/capabilityCalls.ts` remains at 347 lines and is deferred pending the lib/callLifecycle role split.
- Chat-session gates remain: `chatAnonymous.ts` 290 against pin 213; the `chatTools` registry entry; status vocabulary 20 against 17; and 12 chat-owned typecheck errors. Principal refusal codes and Managed-Call remedy transitions remain deliberately distinct.


## 9. Wave rules learned (binding from wave 2)
- **Baseline first.** Record `npx tsc --noEmit --pretty false` and `npm run test:imports` at HEAD before dispatching the wave. Attribute errors by diffing against that baseline, not by guessing.
- **Shared entry files get one owner.** Each domain's declared Convex consumer entry (e.g. `src/modules/capability-execution/convex.ts`) is owned by exactly one agent per wave. Other agents send it their lines.
- **No root files are created or deleted in move waves**, and nobody edits `convex/_generated`.
- **Commits run serially, with explicit pathspecs.** Another session may be committing in the same checkout, and parallel `git commit` calls collide on `index.lock`.

## 10. Relocation layout (binding from wave 3)
Moving code is fine only if every moved line lands where the next reader would look for it first.

- **Domain = the module that owns the feature's primary aggregate.** The primary aggregate is the table the feature's RPCs command or read. Table ownership is set in the module schema files composed by `convex/schema.ts`. A workflow that also writes another module's tables stays whole in its primary domain; never scatter one workflow across folders by table. A cross-domain write is allowed when it is visible: it goes through that domain's lib helper, not a raw `ctx.db` call on a foreign table, where such a helper exists. The folder name is the module name in camelCase: `money`, `capabilitySupply`, `capabilityExecution`, `catalog`, `agentAccess`, `authority`, `principalAccount`, `market`, and so on.
- **Feature is a subfolder.** Path: `convex/lib/<domain>/<feature>/`. The feature name is the root name with the domain prefix removed: `moneyConnect` becomes `money/connect`, `moneyBillingAuthorization` becomes `money/billingAuthorization`. Go at most two levels deep.
- **Files inside a feature folder:**
  - `contracts.ts` holds validators and `Infer` types shared by two or more files. It is the only allowed name: never `validators.ts`, `types.ts`, `*Validators.ts` or `*Contracts.ts`.
  - Every other file is named for one concern (`issue.ts`, `reads.ts`, `reserve.ts`, `stripeEvent.ts`).
  - A test sits next to its concern as `<concern>.test.ts`.
- **RPC symbol naming follows Quote:** `<rpcName>Args`, `<rpcName>Result`, `<rpcName>Handler`. The root line then reads `export const x = mutation({ args: xArgs, returns: xResult, handler: xHandler })`.
- **Files are camelCase.** No kebab-case, and no `index.ts` barrels. Import the concern file directly.
- **No loose files directly in `convex/lib/`.** Each one gets a domain home. Genuinely cross-domain infrastructure (rate limiting, for example) goes in `convex/lib/platform/`.
- **Pure code that `src/` needs** goes to `src/modules/<domain>/`, as in §3.

Existing folders that break this layout are moved in dedicated layout waves, one domain at a time, following the mapping in `docs/reviews/2026-09-24-codebase-health/quote-standard/layout-map.md`.

## 11. Pass gates (binding from wave 3; tightens §6)
- **Deletion gate (step 1).** Before moving anything, list every export and RPC in the root. Each one gets a reference with path:line or is deleted. Report the delete count.
- **Evidence for check 4.** Give path:line of the shared core for each caller (HTTP, MCP, chat, cron), or name the duplicate and record it as a follow-up. A bare "pass" does not count.
- **Net lines.** Report `git diff --shortstat` for the pass. Relocation overhead (imports) is acceptable. Growth beyond roughly 10% of the moved lines must be explained.
- **Codegen.** Only the wave's designated owner runs `npx convex codegen`, and only in waves that change the API. After it runs, `.env.local` must still contain `CONVEX_DEPLOYMENT=anonymous:anonymous-agent`.

### §10 decisions for the wave 4 layout moves (orchestrator, 2026-09-24)
- **`capabilityExecution/`:** callLifecycle, callProjection, providerConsequence, `quotes` (formerly capabilityQuotes), liveX402Requirement.
- **`market/`:** `directoryIndex` (formerly x402DirectoryIndex), `flow` (formerly marketFlow).
- **`principalAccount/`:** workspace (absorbs workspaceDecommissionFences), workspaceSecurity, onboarding, interactiveAuthority.
- **`platform/`:** workloadCron (cron workload identity is shared infrastructure), and `rateLimit.ts`. A single-file concern in `platform/` may sit directly under `platform/`.
- **`capabilitySupply/`:** providerConnections, providerOffboarding (absorbs providerOffboardingFreeze), facilitatorDiscovery, toolCatalog (the presentation helper). Its loose concern files are grouped into feature subfolders.
- **`money/`:** x402PaymentAttempt (the 5 attempt files plus x402ResponseRecovery), agentReads, spendingPeriods, legalCustomer, qualifiedUsePayout (no barrel).
- **`authority/`:** boundary (the wave 2 loose files), delegation, consequence (owner, proof, publication), canonicalAgent. `agentAccess/policy/` takes the wave 2 grant files.
- **`secrets/`:** pointer, lifecycle.
- **`catalog/`:** sellerCanary (split by concern), devSeed.
- **Exception:** `adminConsole/` stays a top-level folder. It is the operator console across domains, and nesting it would exceed depth 2. Only its naming gets fixed.
