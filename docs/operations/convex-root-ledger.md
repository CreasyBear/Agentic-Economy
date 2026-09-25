# Convex root ledger

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
| 2026-09-24 | capabilityProviderTools.ts | 432 lines | 30 lines; capabilitySupply/providerTools | pending |
| 2026-09-24 | capabilitySupplyToolShared.ts + capabilitySupplyToolQueries.ts | 470 + 451 lines, zero RPCs | deleted; capabilitySupply/tool | pending |
| 2026-09-24 | capabilitySupplyCommands.ts + capabilitySupplyGraph.ts + capabilitySupplyLists.ts | 299 + 253 + 463 lines, zero RPCs | deleted; capabilitySupply/{commands,graphPorts,lists} | pending |
| 2026-09-24 | moneyProviderObligations.ts | 376 lines | 54 lines | pending |
| 2026-09-24 | sourceWriteAdmission.ts | 299 lines | 12 lines | pending |
| 2026-09-24 | securityShared.ts | zero RPCs | deleted; security/{admin,audit} | pending |
| 2026-09-24 | securityAccountHistory.ts | 565 lines | 28 lines | pending |
| 2026-09-24 | providerConsequenceHttp.ts | 322 lines | 15 lines | pending |
| 2026-09-24 | catalogPublicReads.ts | 366 lines, zero RPCs | deleted; catalog/publicReads | pending |
| 2026-09-24 | agentSpendingPolicy.ts | 542 lines | 16 lines | pending |
| 2026-09-24 | recoveryBreakGlass.ts | 482 lines | 20 lines | pending |
| 2026-09-24 | actionExecutionControl.ts | 317 lines | 67 lines | pending |
| 2026-09-24 | capabilityCalls.ts | 347 lines | 155 lines; callLifecycle split by role (authorityHandlers and dispatch removed; largest file 399 lines) | pending |
| 2026-09-24 | moneyCustomerTaxFacts.ts | 367 lines | 15 lines; money/customer | pending |
| 2026-09-24 | moneyStripeCustomer.ts | 360 lines | 29 lines; money/customer | pending |
| 2026-09-24 | moneyAutoRecharge.ts | 346 lines | 15 lines; money/autoRecharge | pending |
| 2026-09-24 | moneyMonthlySpendBudget.ts | 318 lines | 22 lines; money/monthlySpendBudget; eight registrations gained returns | pending |
| 2026-09-24 | workspaceMemberships.ts | 693 lines | 30 lines; principalAccount/workspace | pending |
| 2026-09-24 | workspaceInvitations.ts | 382 lines | 21 lines; principalAccount/workspace | pending |
| 2026-09-24 | personalAccount.ts | 652 lines | 34 lines; principalAccount/personalAccount | pending |
| 2026-09-24 | workspaceProvisioning.ts | 330 lines | 12 lines; principalAccount/provisioning | pending |
| 2026-09-24 | workspaceSecurity.ts | 295 lines | 21 lines; principalAccount/workspaceSecurity | pending |
| 2026-09-24 | interactiveCredentialLifecycle.ts | 270 lines | 21 lines; principalAccount/interactiveAuthority | pending |
| 2026-09-24 | securityRemovalDisputes.ts + securityAdminMembership.ts | 245 + 212 lines, zero RPCs | deleted; live RPCs remain in security.ts | pending |
| 2026-09-24 | capabilityCallProjections.ts | 405 lines | 36 lines; capabilityExecution/callProjection | pending |
| 2026-09-24 | capabilityCallX402AuthorizationExpiry.ts | 231 lines | 12 lines; capabilityExecution/liveX402Requirement | pending |
| 2026-09-24 | businessSupplyProjectionSnapshot.ts + capabilitySupplyToolOriginMap.ts | 424 + 225 lines, zero RPCs | deleted; capabilityToolCatalog uses internal twins | pending |
| 2026-09-24 | secretLifecycleHttp.ts | 216 lines | 5 lines; secrets/lifecycle | pending |
| 2026-09-24 | notifications.ts | 322 lines | 21 lines; principalAccount/notifications | pending |
| 2026-09-24 | devSeed.ts + devSeedFixtures.ts | 1162 + 503 lines, fixture root zero RPCs | 43 lines + deleted fixture root; lib/dev/seed | pending |
| 2026-09-24 | chatTools.ts | 529 lines, zero RPCs at HEAD | deleted; `lib/chat/tools/` | pending (wave 8) |
| 2026-09-24 | chatAnonymous.ts | 290 lines | 4 lines; `lib/chat/anonymous/` | pending (wave 8) |
| 2026-09-24 | chatGenerate.ts | 217 lines | 11 lines; `lib/chat/generate/` | pending (wave 8) |
| 2026-09-24 | chatShares.ts | 402 lines | 41 lines; `lib/chat/shares/` | pending (wave 8) |
| 2026-09-24 | registry.ts | 442 lines | 33 lines; `lib/registry/` | pending (wave 8) |

Wave 8 fixed the known 12 typecheck diagnostics, 3 import-gate failures and 33 unit failures. Its interim closeout had passing typecheck, imports, unit, integration and build gates, but lint still had 14 diagnostics and dependency cycles stood at 13. Wave 9 below supersedes that interim status.

### Decisions applied 2026-09-24
- **D1, catalog origin:** eligible-ports admission now checks the business ID and fails closed, as the graph path does (`34ccfe8f7`).
- **D2, command contract:** capability-supply owns the owner command result validator; its readonly view is derived from that contract (`fd96e01dc`).
- **D3, Connect:** HTTP no longer fabricates a payout binding; one Connect contract home remains, but the refusal and authority envelopes differ semantically (`483a2d613`).
- **D4, operator RPCs:** the two obsolete backfills were deleted; `x402DirectoryIndexBackfill.start` was restored as the category-stats rebuild entry. Kept operator entries: `moneyFormance.health`, `moneyFormance.installSchema`, `moneyManagedCallRemedyActions.resolveLostResult`, `interactiveAuthority.reconcileScheduledInteractiveAuthority`, `x402DirectoryIndexBackfill.start`, and the **internal** operator mutations `recoveryBreakGlass.submitRecoveryApproval`, `recoveryBreakGlass.authorizeRecoveryOperation`, `capabilityProviderApprovals.issue`, and `moneyProviderObligations.resolveDispute`. The recovery entries remain callable only through internal Convex authority; no public registration is required.
- **D5, dead RPCs:** 11 further test-only RPCs deleted: `actionExecutionControl.readControlSource`, `actionExecutionControl.recordLateObservationSource`, `capabilityContractDocuments.getActiveExactInternal`, `capabilityProviderConnectionMigration.backfillFacilitatorDiscoveryAuthority`, `capabilityProviderTools.backfillAdmissionPage`, `interactiveSession.listUserWorkspaces`, `moneyDocuments.createOwnerTaxInvoice`, `moneyStripeWebhookInbox.readHealth`, `notifications.dispatchNotificationInternal`, `workspaceProfile.syncOrganizationDisplayNameForServer`, `workspaceProvisioning.claimCreatedWorkspace`. Integration-fixture RPCs remain for a test-fixture pass; five Clerk webhook string references were kept: `workspaceInvitations.recordOrganizationInvitationCreatedForServer`, `workspaceInvitations.recordOrganizationInvitationRevokedForServer`, `workspaceMemberships.recordOrganizationMembershipCreatedForServer`, `workspaceMemberships.recordOrganizationMembershipUpdatedForServer`, `workspaceMemberships.recordOrganizationMembershipDeletedForServer` (`d2baca6cd`).
- **D6, layout:** pure terminal projection moved to `src/modules/capability-execution/terminal-projection.ts`; oversized attempt and shared contracts were split (`d2baca6cd`).
- **D7, ingress identity:** on Vercel, rate limiting trusts only `x-vercel-forwarded-for` (`7524cb6c8`).
- **D8, docs:** strategy documents 64→18 (`e5cc39fff`); docs overall 276→58 files and 24.7 MB→1.3 MB (`326c1b422`, `e5cc39fff`).

### Open
- Integration-fixture RPCs need a test-fixture pass before any further deletion; Clerk's five string-ref handlers are live references, not dead code.
- Connect's differing refusal and authority envelopes are semantic; do not unify them as a type-only move.
- `convex/lib/money/x402PaymentAttempt/identity.ts` (412 lines) remains oversized; `convex/moneyX402PaymentAttempts.ts` still has an inline reconcile handler.
- `convex/capabilityProviderConnections.ts` remains a 274-scanner-line registration-only exception for 29 RPCs.
- The chat-session typecheck, import and unit failures were fixed in wave 8; its empty `chatTools.ts` root is deleted. Principal refusal codes and Managed-Call remedy transitions remain deliberately distinct.

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

### Wave 9: re-audit and polish — 2026-09-25

- **AB-01/02:** Restored the sole approval writer `capabilityProviderApprovals.issue` and disputed-obligation exit `moneyProviderObligations.resolveDispute` as internal operator mutations.
- **AB-03:** Connect readiness now returns only persisted currency bindings when at least one exists, rather than rejecting the whole account for one missing currency; regression coverage exercises the mixed case.
- **AB-04/05:** Off-Vercel rate-limit header trust is explicitly dev-only in `rate-limit.ts`; removed the obsolete ledger claim that catalog actions use public source reads.
- **AB-06/07:** Moved 12 test-only public RPCs to their corresponding internal kinds after checking for product callers. Clerk observation refs now use Convex `module:function` form instead of dotted function names, with a regression test.
- Restored behavioral coverage for toaster placement, exact-contract reads, tool-catalog presentation, persisted tax admission, Stripe inbox failed completion, six-result search cap, and invalid `chatSearchUse`. Four move-fidelity audits across execution, money, supply/market, and identity/chat found no unintended behavior drift.
- Split 12 agent-access/supply files and four additional files plus three roots by concern; grouped loose chat/adminConsole code and made `chatTurns`, `adminConsoleAudit`, and `agentDirectory` registration-only. `capabilityToolCatalog.{searchInternal,detailInternal,compareInternal}` are internal action twins sharing the public handlers.
- Final closeout: typecheck 0 errors; lint 0 warnings; dependency cycles 0; imports 30 files/89 tests; unit 644 passed files/6,479 passed tests (one skipped); integration 185 passed files/1,994 passed tests (31 skipped, three todo); build passes. The API kind snapshot changed by exactly 12 visibility flips and five added registrations (three catalog twins and two restored operator RPCs). File-size ceilings are 207 over 300 and 65 over 500; the sole façade exception is 274 scanner lines.
