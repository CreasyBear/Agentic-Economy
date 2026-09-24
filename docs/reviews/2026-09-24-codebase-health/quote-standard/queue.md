# Convex root queue (2026-09-24)

72 current depth-one non-test roots exceed 200 scanner lines. The scanner counts `contents.split("\n").length` (newline-terminated files count one above `wc -l`). Roots completed below 200 in this wave are omitted. This is a priority queue, not a proof that unresolved check 4 fails.

Score follows [root protocol §5](../../../operations/convex-root-protocol.md): criticality + proven failed checks + 2 when `src/` imports the root + 60-day churn tier + 3 when over the existing pin. Criticality is spine (money, authority, Call, supply admission) 3; projection/HTTP and other application read/chat/catalog roots 2; dev/admin 1. A `tools/` import alone does not trigger the `src/` bonus (`devSeedFixtures.ts`). Check failures and importer facts come from `QsSweep.md` (checks marked unclear are not counted); its explicitly deferred `capabilityCalls.ts` was checked against source: size and mixed `lib/callLifecycle/` concern split fail, no direct `src/` import. These audit check scores are historical assessments, not new post-extraction verdicts.

Churn was measured per root using `git log --since=60.days --format=%h -- <file> | wc -l`. Tercile cutoffs across these 72 roots: tier 0 = 1–4, tier 1 = 5–9, tier 2 = 10+ commits. Ties stay in the same tier. Sort: score descending, churn descending, root name ascending.

## Coverage hole closed

Previously the scanner admitted only a depth-one root importing `./_generated/server` **and** matching a narrow non-generic RPC-call pattern; the test then filtered again on `isFacade`. `devSeedFixtures.ts`, `chatTools.ts` and `businessSupplyProjectionSnapshot.ts` have neither signal. `capabilitySupplyShared.ts` imports the server but has no RPC registration. `providerConsequenceHttp.ts` and `secretLifecycleHttp.ts` register `httpActionGeneric`, which the pattern missed. `capabilityProviderConnections.ts` uses `convex/server` generic registrars rather than the generated import. `devSeed.ts` met the scanner predicate but was explicitly skipped by the temporary test exclusion. **`chatGenerate.ts` was already seen** and was the sole unpinned 217-line failure in the pre-change test; the premise that it was invisible is false. The gate now enumerates every depth-one non-test root, including `convex.config.ts`, and checks the scanner roster against the directory so an omitted root cannot silently pass. `_generated/` is nested; `.test.ts` roots are test fixtures, the only excluded categories.

| Score | Root | Lines / pin | Criticality | Failed checks | `src/` importer | 60d commits / tier | Over pin |
|---:|---|---:|---:|---:|---:|---:|---:|
| 10 | `convex/workloadCron.ts` | 638 / 628 | 3 (spine) | 2 | 0 | 19 / 2 | yes |
| 8 | `convex/x402DirectoryIndexStore.ts` | 695 / 688 | 2 (projection/HTTP/other) | 2 | 0 | 9 / 1 | yes |
| 8 | `convex/chatAnonymous.ts` | 290 / 213 | 2 (projection/HTTP/other) | 2 | 0 | 6 / 1 | yes |
| 8 | `convex/x402DirectoryIndex.ts` | 474 / 455 | 2 (projection/HTTP/other) | 2 | 0 | 6 / 1 | yes |
| 8 | `convex/workspaceAccounts.ts` | 758 / 648 | 3 (spine) | 2 | 0 | 3 / 0 | yes |
| 8 | `convex/workspaceTeam.ts` | 279 / 242 | 3 (spine) | 2 | 0 | 2 / 0 | yes |
| 7 | `convex/facilitatorDiscovery.ts` | 553 / 553 | 3 (spine) | 2 | 0 | 17 / 2 | no |
| 7 | `convex/moneyAccountFunding.ts` | 223 / 223 | 3 (spine) | 2 | 0 | 17 / 2 | no |
| 7 | `convex/capabilitySupplyReadiness.ts` | 314 / 314 | 3 (spine) | 2 | 0 | 14 / 2 | no |
| 7 | `convex/moneyFormance.ts` | 524 / 524 | 3 (spine) | 2 | 0 | 14 / 2 | no |
| 7 | `convex/capabilitySupplyPublicationPorts.ts` | 247 / 247 | 3 (spine) | 2 | 0 | 13 / 2 | no |
| 7 | `convex/moneyManagedCall.ts` | 327 / 327 | 3 (spine) | 2 | 0 | 13 / 2 | no |
| 7 | `convex/qualifiedUse.ts` | 248 / 248 | 3 (spine) | 2 | 0 | 13 / 2 | no |
| 7 | `convex/capabilitySupplyGraphPorts.ts` | 239 / 239 | 3 (spine) | 2 | 0 | 12 / 2 | no |
| 7 | `convex/agentAccessPolicy.ts` | 329 / 329 | 3 (spine) | 2 | 0 | 11 / 2 | no |
| 7 | `convex/authorityBoundary.ts` | 438 / 438 | 3 (spine) | 2 | 0 | 11 / 2 | no |
| 7 | `convex/capabilitySupplyOwnerFunnelCommands.ts` | 768 / 768 | 3 (spine) | 2 | 0 | 11 / 2 | no |
| 7 | `convex/moneyBillingAuthorization.ts` | 606 / 606 | 3 (spine) | 2 | 0 | 11 / 2 | no |
| 7 | `convex/moneyManagedCallLifecycle.ts` | 320 / 320 | 3 (spine) | 2 | 0 | 10 / 2 | no |
| 6 | `convex/chatTools.ts` | 529 / 529 | 2 (projection/HTTP/other) | 2 | 0 | 23 / 2 | no |
| 6 | `convex/capabilitySupplyProjection.ts` | 734 / 734 | 2 (projection/HTTP/other) | 2 | 0 | 16 / 2 | no |
| 6 | `convex/catalogOfferingMutations.ts` | 490 / 490 | 2 (projection/HTTP/other) | 2 | 0 | 15 / 2 | no |
| 6 | `convex/registry.ts` | 445 / 445 | 2 (projection/HTTP/other) | 2 | 0 | 15 / 2 | no |
| 6 | `convex/chatGenerate.ts` | 217 / 217 | 2 (projection/HTTP/other) | 2 | 0 | 10 / 2 | no |
| 6 | `convex/providerConsequenceHttp.ts` | 322 / 322 | 2 (projection/HTTP/other) | 2 | 0 | 10 / 2 | no |
| 6 | `convex/capabilityCallWorker.ts` | 363 / 363 | 3 (spine) | 2 | 0 | 9 / 1 | no |
| 6 | `convex/capabilityCalls.ts` | 356 / 356 | 3 (spine) | 2 | 0 | 9 / 1 | no |
| 6 | `convex/capabilityProviderConnectionCleanup.ts` | 257 / 257 | 3 (spine) | 2 | 0 | 9 / 1 | no |
| 6 | `convex/capabilitySupplyShared.ts` | 253 / 253 | 3 (spine) | 2 | 0 | 8 / 1 | no |
| 6 | `convex/capabilityContractDocuments.ts` | 345 / 345 | 3 (spine) | 2 | 0 | 7 / 1 | no |
| 6 | `convex/capabilitySupplyIntegrationDrafts.ts` | 310 / 310 | 3 (spine) | 2 | 0 | 6 / 1 | no |
| 6 | `convex/capabilityProviderTools.ts` | 465 / 465 | 3 (spine) | 2 | 0 | 5 / 1 | no |
| 6 | `convex/capabilitySupplyToolShared.ts` | 470 / 470 | 3 (spine) | 2 | 0 | 5 / 1 | no |
| 6 | `convex/recoveryBreakGlass.ts` | 482 / 482 | 3 (spine) | 2 | 0 | 5 / 1 | no |
| 6 | `convex/sourceWriteAdmission.ts` | 302 / 302 | 3 (spine) | 2 | 0 | 5 / 1 | no |
| 5 | `convex/devSeed.ts` | 1177 / 1177 | 1 (dev/admin) | 2 | 0 | 26 / 2 | no |
| 5 | `convex/capabilityProviderConnections.ts` | 277 / 277 | 3 (spine) | 1 | 0 | 9 / 1 | no |
| 5 | `convex/capabilitySupplyOwnerFunnelProjection.ts` | 609 / 609 | 2 (projection/HTTP/other) | 2 | 0 | 9 / 1 | no |
| 5 | `convex/catalogPublicReads.ts` | 368 / 368 | 2 (projection/HTTP/other) | 2 | 0 | 8 / 1 | no |
| 5 | `convex/capabilitySupplyToolQueries.ts` | 451 / 451 | 2 (projection/HTTP/other) | 2 | 0 | 7 / 1 | no |
| 5 | `convex/chatShares.ts` | 402 / 402 | 2 (projection/HTTP/other) | 2 | 0 | 7 / 1 | no |
| 5 | `convex/businessSupplyProjectionSnapshot.ts` | 424 / 424 | 2 (projection/HTTP/other) | 2 | 0 | 6 / 1 | no |
| 5 | `convex/capabilitySupplyLists.ts` | 463 / 463 | 2 (projection/HTTP/other) | 2 | 0 | 5 / 1 | no |
| 5 | `convex/actionExecutionControl.ts` | 388 / 388 | 3 (spine) | 2 | 0 | 4 / 0 | no |
| 5 | `convex/agentSpendingPolicy.ts` | 542 / 542 | 3 (spine) | 2 | 0 | 4 / 0 | no |
| 5 | `convex/moneyProviderObligations.ts` | 430 / 430 | 3 (spine) | 2 | 0 | 4 / 0 | no |
| 5 | `convex/securityAccountHistory.ts` | 565 / 565 | 3 (spine) | 2 | 0 | 4 / 0 | no |
| 5 | `convex/securityShared.ts` | 205 / 205 | 3 (spine) | 2 | 0 | 4 / 0 | no |
| 5 | `convex/capabilitySupplyCommands.ts` | 299 / 299 | 3 (spine) | 2 | 0 | 3 / 0 | no |
| 5 | `convex/capabilitySupplyGraph.ts` | 253 / 253 | 3 (spine) | 2 | 0 | 2 / 0 | no |
| 5 | `convex/interactiveCredentialLifecycle.ts` | 297 / 297 | 3 (spine) | 2 | 0 | 2 / 0 | no |
| 5 | `convex/securityRemovalDisputes.ts` | 245 / 245 | 3 (spine) | 2 | 0 | 2 / 0 | no |
| 5 | `convex/workspaceSecurity.ts` | 295 / 295 | 3 (spine) | 2 | 0 | 2 / 0 | no |
| 5 | `convex/capabilityCallX402AuthorizationExpiry.ts` | 231 / 231 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/capabilityProviderApprovals.ts` | 249 / 249 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/interactiveSession.ts` | 241 / 241 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/moneyAutoRecharge.ts` | 346 / 346 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/moneyCustomerTaxFacts.ts` | 367 / 367 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/moneyMonthlySpendBudget.ts` | 318 / 318 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/moneyStripeCustomer.ts` | 360 / 360 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/personalAccount.ts` | 652 / 652 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/workspaceInvitations.ts` | 382 / 382 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/workspaceMemberships.ts` | 693 / 693 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/workspaceProfile.ts` | 257 / 257 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 5 | `convex/workspaceProvisioning.ts` | 393 / 393 | 3 (spine) | 2 | 0 | 1 / 0 | no |
| 4 | `convex/secretLifecycleHttp.ts` | 216 / 216 | 2 (projection/HTTP/other) | 2 | 0 | 4 / 0 | no |
| 4 | `convex/marketDemandSignals.ts` | 244 / 244 | 2 (projection/HTTP/other) | 2 | 0 | 3 / 0 | no |
| 4 | `convex/capabilityCallProjections.ts` | 405 / 405 | 2 (projection/HTTP/other) | 2 | 0 | 2 / 0 | no |
| 4 | `convex/capabilitySupplyToolOriginMap.ts` | 227 / 227 | 2 (projection/HTTP/other) | 2 | 0 | 2 / 0 | no |
| 4 | `convex/notifications.ts` | 471 / 471 | 2 (projection/HTTP/other) | 2 | 0 | 1 / 0 | no |
| 3 | `convex/devSeedFixtures.ts` | 503 / 503 | 1 (dev/admin) | 2 | 0 | 4 / 0 | no |
| 3 | `convex/securityAdminMembership.ts` | 216 / 216 | 1 (dev/admin) | 2 | 0 | 4 / 0 | no |

## Six pre-wave pinned overages

These six already exceeded their pins at the first gate run; **no pin was raised**. `git log -1 --format=%h\ %s -- <file>` supplies each last touching commit; `git log -1 --numstat -- <file>` confirms each added more lines than it removed.

| Root | Pin → first-run scanner lines | Last touching commit |
|---|---:|---|
| `convex/chatAnonymous.ts` | 213 → 290 | bb90e2e67 fix(chat): search before answering; same results signed-in and guest |
| `convex/workloadCron.ts` | 628 → 638 | 2199c986b Keep the Tools and Providers catalogues on one stable page. |
| `convex/workspaceAccounts.ts` | 648 → 758 | 45b322b43 Build cohesive workspace settings and owner surfaces |
| `convex/workspaceTeam.ts` | 242 → 279 | 45b322b43 Build cohesive workspace settings and owner surfaces |
| `convex/x402DirectoryIndex.ts` | 455 → 474 | 2199c986b Keep the Tools and Providers catalogues on one stable page. |
| `convex/x402DirectoryIndexStore.ts` | 688 → 695 | 2199c986b Keep the Tools and Providers catalogues on one stable page. |
