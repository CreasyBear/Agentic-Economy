# Convex root queue — 2026-09-24, HEAD `d073ccbfc`

51 depth-one non-test `convex/*.ts` roots exceed 200 scanner lines. Counts use `contents.split("\n").length` (including the final empty element for newline-terminated files); completed roots below 200 are excluded. This is a size-priority queue, not a fresh verdict on shared-core check 4.

[Protocol §5](../../../operations/convex-root-protocol.md) score = criticality (spine 3, projection/HTTP/other application 2, dev/admin 1) + failed checks (2 for oversized roots with inline depth; 1 for registration-only but oversized `capabilityCalls.ts` and `capabilityProviderConnections.ts`) + 2 for a direct `src/` root importer + 60-day churn tier + 3 over its current exception pin. Historical criticality classification is retained; direct source imports were checked against module paths. Unproven check 4 is not counted. Churn uses `git log --since=60.days --format=%h -- <file> | wc -l`; current-population terciles are 1–3 (tier 0), 4–6 (tier 1), 7+ (tier 2), with ties kept together. Sort is score descending, churn descending, name ascending. `—` means no pin.

| Score | Root | Lines / pin | Criticality | Failed checks | `src/` importer | 60d commits / tier | Over pin |
|---:|---|---:|---:|---:|---:|---:|---:|
| 8 | `convex/chatAnonymous.ts` | 290 / 213 | 2 | 2 | 0 | 6 / 1 | yes |
| 7 | `convex/qualifiedUse.ts` | 233 / 233 | 3 | 2 | 0 | 14 / 2 | no |
| 7 | `convex/capabilityCallWorker.ts` | 363 / 363 | 3 | 2 | 0 | 11 / 2 | no |
| 7 | `convex/capabilityProviderConnectionCleanup.ts` | 257 / 257 | 3 | 2 | 0 | 9 / 2 | no |
| 7 | `convex/capabilitySupplyShared.ts` | 251 / 251 | 3 | 2 | 0 | 9 / 2 | no |
| 7 | `convex/capabilityContractDocuments.ts` | 345 / 345 | 3 | 2 | 0 | 7 / 2 | no |
| 7 | `convex/capabilitySupplyIntegrationDrafts.ts` | 310 / 310 | 3 | 2 | 0 | 7 / 2 | no |
| 6 | `convex/chatTools.ts` | 529 / 529 | 2 | 2 | 0 | 23 / 2 | no |
| 6 | `convex/registry.ts` | 443 / 443 | 2 | 2 | 0 | 16 / 2 | no |
| 6 | `convex/chatGenerate.ts` | 217 / 217 | 2 | 2 | 0 | 10 / 2 | no |
| 6 | `convex/providerConsequenceHttp.ts` | 322 / 322 | 2 | 2 | 0 | 10 / 2 | no |
| 6 | `convex/capabilityCalls.ts` | 356 / 356 | 3 | 1 | 0 | 9 / 2 | no |
| 6 | `convex/capabilityProviderConnections.ts` | 277 / 277 | 3 | 1 | 0 | 9 / 2 | no |
| 6 | `convex/catalogPublicReads.ts` | 366 / 366 | 2 | 2 | 0 | 9 / 2 | no |
| 6 | `convex/capabilitySupplyToolQueries.ts` | 451 / 451 | 2 | 2 | 0 | 7 / 2 | no |
| 6 | `convex/chatShares.ts` | 402 / 402 | 2 | 2 | 0 | 7 / 2 | no |
| 6 | `convex/capabilityProviderTools.ts` | 465 / 465 | 3 | 2 | 0 | 6 / 1 | no |
| 6 | `convex/capabilitySupplyToolShared.ts` | 470 / 470 | 3 | 2 | 0 | 6 / 1 | no |
| 6 | `convex/moneyProviderObligations.ts` | 377 / 377 | 3 | 2 | 0 | 6 / 1 | no |
| 6 | `convex/sourceWriteAdmission.ts` | 299 / 299 | 3 | 2 | 0 | 6 / 1 | no |
| 6 | `convex/recoveryBreakGlass.ts` | 482 / 482 | 3 | 2 | 0 | 5 / 1 | no |
| 6 | `convex/actionExecutionControl.ts` | 388 / 388 | 3 | 2 | 0 | 4 / 1 | no |
| 6 | `convex/agentSpendingPolicy.ts` | 542 / 542 | 3 | 2 | 0 | 4 / 1 | no |
| 6 | `convex/securityAccountHistory.ts` | 565 / 565 | 3 | 2 | 0 | 4 / 1 | no |
| 6 | `convex/securityShared.ts` | 205 / 205 | 3 | 2 | 0 | 4 / 1 | no |
| 5 | `convex/devSeed.ts` | 1162 / 1162 | 1 | 2 | 0 | 28 / 2 | no |
| 5 | `convex/businessSupplyProjectionSnapshot.ts` | 424 / 424 | 2 | 2 | 0 | 6 / 1 | no |
| 5 | `convex/capabilitySupplyLists.ts` | 463 / 463 | 2 | 2 | 0 | 5 / 1 | no |
| 5 | `convex/secretLifecycleHttp.ts` | 216 / 216 | 2 | 2 | 0 | 4 / 1 | no |
| 5 | `convex/capabilitySupplyCommands.ts` | 299 / 299 | 3 | 2 | 0 | 3 / 0 | no |
| 5 | `convex/capabilitySupplyGraph.ts` | 253 / 253 | 3 | 2 | 0 | 3 / 0 | no |
| 5 | `convex/interactiveCredentialLifecycle.ts` | 270 / 270 | 3 | 2 | 0 | 3 / 0 | no |
| 5 | `convex/securityRemovalDisputes.ts` | 245 / 245 | 3 | 2 | 0 | 2 / 0 | no |
| 5 | `convex/workspaceSecurity.ts` | 295 / 295 | 3 | 2 | 0 | 2 / 0 | no |
| 5 | `convex/capabilityCallX402AuthorizationExpiry.ts` | 231 / 231 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/interactiveSession.ts` | 241 / 241 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/moneyAutoRecharge.ts` | 346 / 346 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/moneyCustomerTaxFacts.ts` | 367 / 367 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/moneyMonthlySpendBudget.ts` | 318 / 318 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/moneyStripeCustomer.ts` | 360 / 360 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/personalAccount.ts` | 652 / 652 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/workspaceInvitations.ts` | 382 / 382 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/workspaceMemberships.ts` | 693 / 693 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/workspaceProfile.ts` | 257 / 257 | 3 | 2 | 0 | 1 / 0 | no |
| 5 | `convex/workspaceProvisioning.ts` | 393 / 393 | 3 | 2 | 0 | 1 / 0 | no |
| 4 | `convex/devSeedFixtures.ts` | 503 / 503 | 1 | 2 | 0 | 4 / 1 | no |
| 4 | `convex/securityAdminMembership.ts` | 216 / 216 | 1 | 2 | 0 | 4 / 1 | no |
| 4 | `convex/capabilityCallProjections.ts` | 405 / 405 | 2 | 2 | 0 | 3 / 0 | no |
| 4 | `convex/marketDemandSignals.ts` | 244 / 244 | 2 | 2 | 0 | 3 / 0 | no |
| 4 | `convex/capabilitySupplyToolOriginMap.ts` | 227 / 227 | 2 | 2 | 0 | 2 / 0 | no |
| 4 | `convex/notifications.ts` | 471 / 471 | 2 | 2 | 0 | 1 / 0 | no |

Current over-pin roots: `convex/chatAnonymous.ts` (290 / 213). No pin was raised.
