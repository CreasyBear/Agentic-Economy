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
