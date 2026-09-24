# Dead and orphaned code audit

- Lens: Knip reachability, Convex RPC reference analysis, dependency hygiene
- Scope: `src/`, `convex/`, `tools/`, `tests/`; generated code excluded; `scripts/` and `packages/` additionally searched for RPC references; `.github/` checked for dependency CLI usage.
- Tool/skill used: `npx -y knip --config /tmp/knip-ae.json --reporter json` (JSON issues exit 1); ponytail-audit delete lens; source/alias/string-reference cross-check.
- Health score 0-10: **6/10** — 26 unused files (1,748 LOC), a substantial unused export surface, but few proven-safe runtime deletions; external Convex callers remain an uncertainty.

## Findings

| ID | Severity (HIGH/MED/LOW) | path:line | Finding | Evidence | Replace-with / fix | Est. LOC delta |
|---|---|---|---|---|---|---|
| O1 | HIGH | src/modules/capability-supply/internal/supply-funnel/publication-admit.ts:95 | Orphaned publication admission branch | Knip marks admission (410 LOC) and its sole import child publication-import (364 LOC) unused; their exported entry functions at admission:299,349,363 have no importer. | Remove both after checking historical deployment calls; no replacement. | -774 |
| O2 | MED | src/modules/money/internal/charge-contract.ts:123 | Unused charge-journal implementation | Knip marks complete 306-line file unused; exported validateChargeContract and chargeJournalDigest (:261) have no importer. | Remove obsolete branch if no archived runtime uses it. | -306 |
| O3 | MED | src/modules/agent-access/policy.functions.ts:45 | Grant-registration wrapper has no runtime consumer | Knip marks 83-line file unused; tests/unit/agent-access-functions.test.ts:31 still mocks this absent import. | Remove orphan wrapper and stale mock, unless intended flow needs wiring. | -83 |
| O4 | MED | src/components/ae/offerings/ProviderWorkspacePayoutPolicyPanel.tsx:26 | Unused payout-policy panel | Knip marks 53-line component unused; it independently calls Convex at :33-37. | Remove if superseded; preserve canonical payout form. | -53 |
| O5 | MED | src/components/ae/chat/chat-session/ChatSkeleton.tsx:4 | Seventeen unwired skeletons | Knip flags 17 *Skeleton.tsx files totaling 448 LOC, e.g. status skeleton at src/components/ae/status/system-status/AeSystemStatusSkeleton.tsx:7. | Wire only where an async boundary actually uses it, otherwise remove; check zero-CLS rule. | up to -448 |
| O6 | MED | convex/capabilityProviderApprovals.ts:145 | Four unreferenced internal approval RPCs | issue/read/readAtGeneration/project (:145,:190,:202,:216) have no api/internal/string/alias references in scanned code; table usage alone is not an RPC caller. | Trace deployed callers; retire RPC façade and dependent helpers only if unused. | up to -104 |
| O7 | MED | convex/interactiveAuthority.ts:98 | Sixteen further internal RPCs with no in-repo caller | Among 20 nowhere-referenced internal RPCs, 16 are outside approval group; examples interactive authority query here and qualified use query at convex/qualifiedUse.ts:234. Some are deliberate manual migrations/diagnostics. | Review individually against external/admin commands before removal. | not estimated |
| O8 | MED | convex/actionExecutionControl.ts:369 | Forty RPCs referenced only by tests | Examples recordLateObservationSource/readControlSource here/:378; all 40 have test refs, no production static or literal refs after alias resolution. Public RPCs may be external contracts. | Review interface ownership; do not equate test-only with safe deletion. | not estimated |
| O9 | LOW | src/modules/capability-supply/public.ts:61 | Large surplus export surface | Knip reports 935 value exports and 1,234 type exports; 21 values/89 types on capability-supply/public.ts and 25/56 on registry/public.ts:32. Many are barrels/contract exports. | Trim confirmed unused exported names without deleting live modules. | not estimated |
| O10 | LOW | src/modules/market/tool-detail-presentation.ts:24 | Four more small standalone orphans | 43-line presentation module; site-marker src/components/ui/site-marker.tsx:1 (32 LOC), mobile-navigation.contracts.ts:1 (8 LOC), query-length.ts:1 (1 LOC) all Knip unused. | Remove or wire individually; query-length duplicates local 200-char schema limits at src/routes/api.v1.registry.ts:23. | -84 |
| O11 | LOW | package.json:92 | Two unused runtime dependencies and one unused dev dependency | Knip: @rjsf/validator-ajv8 (:92), react-resizable-panels (:127), aislop (:154); no package import or script use found. react-doctor (:161) is a Knip false positive: npm doctor uses it at :67. | Remove verified unused packages only after installer graph/CI review; retain react-doctor for doctor script. | 0 source LOC; -3 deps possible |
| O12 | MED | tests/helpers/convex-fixtures.ts:6 | Unlisted directly imported test dependency | Imports @convex-dev/batch-worker/test; absent from root package.json:140-167, installed transitively by workpool at package-lock.json:1182-1188. | Declare direct test dependency if helper remains; do not rely on transitive hoisting. | 0 |

## Handrolling

- No verified library-reimplementation finding in this dead-code lens. The strongest waste is code with no reachable consumer: delete confirmed orphans rather than replacing them with a new abstraction. `src/lib/query-length.ts:1` is an unused local constant while Zod schemas already encode the bound at `src/routes/api.v1.registry.ts:23`; this is duplication, not proof that one global 200-character limit is desirable.

## Metrics and method

- Knip: **26 unused files, 1,748 physical LOC** (`splitlines`, blank lines included); **935 unused value exports + 1,234 unused type exports** (2,169 symbols); **2 dependencies**, **2 devDependencies**, **1 unlisted dependency**. Four duplicate-export diagnostics were not treated as dead code.
- Convex: **479** exported `query`/`mutation`/`action`/`internal*` declarations across 197 root `.ts` files; **60** without an in-repo runtime reference after direct dotted refs, quoted `module:fn` refs and aliases `const name = api/internal.module`: **20 nowhere**, **40 tests-only**. Direct-only search initially said 74; 14 were false positives from `const offboardingInternal = internal.capabilityProviderOffboarding` at `convex/lib/providerOffboarding/runWorkflow.ts:5` followed by `.fn` calls at :8-102.
- RPC scope: 3,014 TS/TSX/JS/JSON files across `src/`, `convex/`, `tools/`, `tests/`, `scripts/`, `packages/` and `package.json`, omitting generated files and node_modules; module-keyed and alias references counted; bare function-name occurrences and generated API declarations were not treated as callsites. No deployed scheduler state or external Convex clients inspected.
- Knip entry decisions: every route and root Convex façade is an entry; tools/dev and CLI entry, config files and tests are entries. This means Knip cannot detect orphaned Convex functions, and release scripts not explicit entries can inflate unused-export diagnostics. Public RPC methods can be called externally; internal backfills/diagnostics can be invoked by operators. `tests/helpers/convex-fixtures.ts:30` dynamically globs Convex test modules; never infer an internal RPC is dead merely because its façade is loaded.

### Unused files (Knip; raw LOC)

| File:line | LOC | Classification |
|---|---:|---|
| `src/modules/capability-supply/internal/supply-funnel/publication-admit.ts:1` | 410 | HIGH confidence unreachable import graph; verify external/operational intent |
| `src/modules/capability-supply/internal/supply-funnel/publication-import.ts:1` | 364 | HIGH confidence unreachable import graph; verify external/operational intent |
| `src/modules/money/internal/charge-contract.ts:1` | 306 | HIGH confidence unreachable import graph; verify external/operational intent |
| `src/modules/agent-access/policy.functions.ts:1` | 83 | HIGH confidence unreachable import graph; verify external/operational intent |
| `src/components/ae/offerings/ProviderWorkspacePayoutPolicyPanel.tsx:1` | 53 | HIGH confidence unreachable import graph; verify external/operational intent |
| `src/modules/market/tool-detail-presentation.ts:1` | 43 | HIGH confidence unreachable import graph; verify external/operational intent |
| `src/components/ae/status/system-status/AeSystemStatusSkeleton.tsx:1` | 41 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/supply/earnings-card/AeSupplyEarningsCardSkeleton.tsx:1` | 35 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/supply/price-update-modal/AePriceUpdateModalSkeleton.tsx:1` | 35 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/principal-account/onboarding/AeOnboardingPageSkeleton.tsx:1` | 33 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizardSkeleton.tsx:1` | 33 | Unwired skeleton; async-boundary decision required |
| `src/components/ui/site-marker.tsx:1` | 32 | HIGH confidence unreachable import graph; verify external/operational intent |
| `src/components/ae/agent-access/authorize-form/AeAgentAccessAuthorizeFormSkeleton.tsx:1` | 31 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/supply/tool-test-playground/AeToolTestPlaygroundSkeleton.tsx:1` | 31 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/activity/AeActivitySkeleton.tsx:1` | 29 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/chat/chat-session/ChatSkeleton.tsx:1` | 29 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialogSkeleton.tsx:1` | 29 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/console/agent-operator-console/AeAgentOperatorConsoleSkeleton.tsx:1` | 28 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/command-panel/tools-search-page/ToolsSearchPageSkeleton.tsx:1` | 26 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/supply/connection-handoff/AeConnectionHandoffSkeleton.tsx:1` | 26 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/console/spending-limits-form/AeAgentSpendingLimitsFormSkeleton.tsx:1` | 21 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/agent-access/home/AeAgentAccessHomeSkeleton.tsx:1` | 19 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/layout/mobile-navigation.contracts.ts:1` | 8 | HIGH confidence unreachable import graph; verify external/operational intent |
| `src/lib/query-length.ts:1` | 1 | HIGH confidence unreachable import graph; verify external/operational intent |
| `src/components/ae/auth/sign-in/AeSignInPageSkeleton.tsx:1` | 1 | Unwired skeleton; async-boundary decision required |
| `src/components/ae/auth/sign-up/AeSignUpPageSkeleton.tsx:1` | 1 | Unwired skeleton; async-boundary decision required |

### Convex RPCs referenced nowhere in searched code

All 20 are **internal**; these are absence-of-in-repo-reference findings, not unconditional delete instructions. Manual migration, maintenance and diagnostics deserve an explicit operator/deployment search.

| RPC at declaration | Classification |
|---|---|
| `convex/capabilityProviderApprovals.ts:145` `issue` (internalMutation) | No in-repo caller; review before deletion |
| `convex/capabilityProviderApprovals.ts:190` `read` (internalQuery) | No in-repo caller; review before deletion |
| `convex/capabilityProviderApprovals.ts:202` `readAtGeneration` (internalQuery) | No in-repo caller; review before deletion |
| `convex/capabilityProviderApprovals.ts:216` `project` (internalQuery) | No in-repo caller; review before deletion |
| `convex/capabilityProviderConnectionMigration.ts:145` `backfillFacilitatorDiscoveryAuthority` (internalMutation) | Likely manual/diagnostic or migration false positive |
| `convex/capabilityProviderTools.ts:433` `backfillAdmissionPage` (internalMutation) | Likely manual/diagnostic or migration false positive |
| `convex/capabilityToolCatalog.ts:126` `rerank` (internalAction) | Likely manual/diagnostic or migration false positive |
| `convex/devSeed.ts:200` `provisionDevSeedCatalogIdentity` (internalMutation) | Likely manual/diagnostic or migration false positive |
| `convex/interactiveAuthority.ts:98` `reconcileScheduledInteractiveAuthority` (internalQuery) | No in-repo caller; review before deletion |
| `convex/interactiveCredentialLifecycle.ts:102` `reconcileInteractiveCredentialExpiry` (internalMutation) | No in-repo caller; review before deletion |
| `convex/moneyFormance.ts:181` `health` (internalAction) | Likely manual/diagnostic or migration false positive |
| `convex/moneyFormance.ts:187` `installSchema` (internalAction) | Likely manual/diagnostic or migration false positive |
| `convex/moneyFormance.ts:193` `readAccount` (internalAction) | Likely manual/diagnostic or migration false positive |
| `convex/moneyFormance.ts:204` `readTransactionByReference` (internalAction) | Likely manual/diagnostic or migration false positive |
| `convex/moneyFormance.ts:405` `canRebindLegalCustomer` (internalAction) | Likely manual/diagnostic or migration false positive |
| `convex/moneyManagedCallRemedyActions.ts:21` `resolveLostResult` (internalAction) | No in-repo caller; review before deletion |
| `convex/moneyProviderObligations.ts:378` `markDisputed` (internalMutation) | No in-repo caller; review before deletion |
| `convex/moneyProviderObligations.ts:405` `resolveDispute` (internalMutation) | No in-repo caller; review before deletion |
| `convex/qualifiedUse.ts:234` `readQualifiedUseByCall` (internalQuery) | No in-repo caller; review before deletion |
| `convex/x402DirectoryIndexBackfill.ts:50` `start` (internalAction) | Likely manual/diagnostic or migration false positive |

### Convex RPCs referenced only from tests

These 40 are **not** high-confidence dead code; test refs establish behavior but public clients/webhooks may be out of repository. First observed test reference shown.

| RPC at declaration | Example test reference |
|---|---|
| `convex/actionExecutionControl.ts:369` `recordLateObservationSource` (mutation) | `tests/unit/convex/source-write-admission.test.ts:79` |
| `convex/actionExecutionControl.ts:378` `readControlSource` (query) | `tests/unit/convex/source-write-admission.test.ts:64` |
| `convex/agentAccessPolicy.ts:312` `revokeGrant` (internalMutation) | `tests/integration/capability-call-workpool.test.ts:1552` |
| `convex/agentAccessPrincipals.ts:114` `recordAgentPrincipal` (internalMutation) | `tests/integration/capability-supply-owner-funnel-harness.ts:593` |
| `convex/capabilityCallProjections.ts:374` `rebuild` (internalMutation) | `tests/unit/convex/capability-call-projection.test.ts:104` |
| `convex/capabilityContractDocuments.ts:52` `register` (mutation) | `tests/integration/capability-contract-registry.test.ts:16` |
| `convex/capabilityContractDocuments.ts:159` `getActiveExactInternal` (internalQuery) | `tests/integration/capability-contract-registry.test.ts:26` |
| `convex/capabilityProviderTools.ts:407` `backfillDraftPage` (internalMutation) | `tests/integration/capability-supply-integration-draft.test.ts:257` |
| `convex/capabilitySupplyCanaryFunding.ts:92` `provisionProductionSellerOnboardingCanaryFunding` (internalMutation) | `tests/integration/capability-supply-owner-funnel-publish.test.ts:424` |
| `convex/capabilitySupplyCanaryFunding.ts:98` `provisionSellerOnboardingCanaryFunding` (internalMutation) | `tests/integration/capability-call-workpool-harness.ts:149` |
| `convex/capabilitySupplyOwnerCanary.ts:21` `requestSellerOnboardingCanaryForAdmittedPublication` (internalMutation) | `tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts:471` |
| `convex/capabilitySupplyOwnerCanary.ts:32` `readSellerOnboardingCanaryEvidence` (internalQuery) | `tests/integration/capability-supply-owner-funnel-publish.test.ts:483` |
| `convex/capabilitySupplyOwnerSupply.ts:23` `runOwnerSupplyReadiness` (action) | `tests/integration/capability-call-workpool-harness.ts:163` |
| `convex/capabilitySupplyOwnerSupply.ts:30` `runOwnerSupplyTest` (action) | `tests/integration/capability-supply-owner-funnel-run-test.test.ts:142` |
| `convex/catalogOfferingMutations.ts:427` `promoteAdmittedSellerCanary` (internalMutation) | `tests/integration/capability-call-workpool-harness.ts:233` |
| `convex/chatMessages.ts:37` `sendMessage` (mutation) | `tests/integration/chat-scheduled-authority.test.ts:193` |
| `convex/chatThreads.ts:78` `createThread` (mutation) | `tests/integration/chat-thread-metadata.test.ts:11` |
| `convex/devSeed.ts:293` `seedDevCatalog` (internalMutation) | `tests/integration/dev-seed-public-catalog-facts.test.ts:132` |
| `convex/interactiveCredentialLifecycle.ts:90` `armInteractiveCredentialExpiry` (internalMutation) | `tests/unit/convex/interactive-credential-lifecycle.test.ts:20` |
| `convex/interactiveSession.ts:112` `setActiveWorkspace` (mutation) | `tests/unit/convex/notifications.test.ts:122` |
| `convex/interactiveSession.ts:180` `listUserWorkspaces` (query) | `tests/unit/convex/interactive-authority-tenancy.test.ts:68` |
| `convex/moneyAccountFunding.ts:167` `prepareVerifiedEvent` (internalMutation) | `tests/helpers/money-funding-fixtures.ts:427` |
| `convex/moneyAccountFunding.ts:179` `finalizeVerifiedEvent` (internalMutation) | `tests/helpers/money-funding-fixtures.ts:440` |
| `convex/moneyAccountFunding.ts:191` `finalizeVerifiedRefund` (internalMutation) | `tests/helpers/money-funding-fixtures.ts:539` |
| `convex/moneyDocuments.ts:136` `createOwnerTaxInvoice` (mutation) | `tests/unit/convex/money-documents.test.ts:429` |
| `convex/moneyStripeWebhookInbox.ts:162` `readHealth` (internalQuery) | `tests/unit/convex/money-stripe-webhook-inbox.test.ts:110` |
| `convex/notifications.ts:403` `dispatchNotificationInternal` (internalMutation) | `tests/unit/convex/notifications.test.ts:116` |
| `convex/personalAccount.ts:224` `readDeletionEligibility` (query) | `tests/unit/convex/personal-account-deletion.test.ts:78` |
| `convex/recoveryBreakGlass.ts:406` `submitRecoveryApproval` (mutation) | `tests/helpers/recovery-break-glass-driver-fixture.ts:362` |
| `convex/recoveryBreakGlass.ts:416` `authorizeRecoveryOperation` (mutation) | `tests/helpers/recovery-break-glass-driver-fixture.ts:401` |
| `convex/workspaceInvitations.ts:255` `recordOrganizationInvitationCreatedForServer` (mutation) | `tests/unit/convex/workspace-invitation-observation.test.ts:70` |
| `convex/workspaceInvitations.ts:319` `recordOrganizationInvitationRevokedForServer` (mutation) | `tests/unit/convex/workspace-invitation-observation.test.ts:78` |
| `convex/workspaceMemberships.ts:300` `recordOrganizationMembershipCreatedForServer` (mutation) | `tests/unit/convex/workspace-membership-observation.test.ts:86` |
| `convex/workspaceMemberships.ts:433` `recordOrganizationMembershipUpdatedForServer` (mutation) | `tests/unit/convex/workspace-membership-observation.test.ts:94` |
| `convex/workspaceMemberships.ts:556` `recordOrganizationMembershipDeletedForServer` (mutation) | `tests/unit/convex/workspace-membership-observation.test.ts:102` |
| `convex/workspaceProfile.ts:169` `syncOrganizationDisplayNameForServer` (mutation) | `tests/unit/convex/workspace-profile.test.ts:57` |
| `convex/workspaceProvisioning.ts:339` `provisionOrganizationWorkspaceForServer` (mutation) | `tests/unit/convex/workspace-provisioning.test.ts:59` |
| `convex/workspaceProvisioning.ts:354` `claimCreatedWorkspace` (mutation) | `tests/unit/convex/workspace-provisioning.test.ts:69` |
| `convex/workspaceSecurity.ts:140` `readPolicy` (query) | `tests/unit/convex/workspace-security-policy.test.ts:68` |
| `convex/workspaceSecurity.ts:181` `updatePolicy` (mutation) | `tests/unit/convex/workspace-security-policy.test.ts:74` |

### Dependencies and false positives

| Kind | Declared/import site | Name | Assessment |
|---|---|---|---|
| Runtime unused | `package.json:92` | `@rjsf/validator-ajv8` | No direct import in scan; likely removable after integration check. |
| Runtime unused | `package.json:127` | `react-resizable-panels` | No direct import in scan; likely removable. |
| Dev unused | `package.json:154` | `aislop` | No script/source/CI use observed; likely removable. |
| Dev apparent unused | `package.json:161` | `react-doctor` | **False positive**: `package.json:67` invokes it as npm script binary; CI separately uses pinned action `.github/workflows/react-doctor.yml:38`. |
| Unlisted | `tests/helpers/convex-fixtures.ts:6` | `@convex-dev/batch-worker` | Direct test import depends on transitive `@convex-dev/workpool` dependency (`package-lock.json:1182-1188`). |

### Final one-off Knip config (`/tmp/knip-ae.json`)

```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": [
    "src/routes/**/*.{ts,tsx}",
    "src/router.tsx",
    "convex/*.ts",
    "tools/**/cli.ts",
    "tools/dev/*.ts",
    "vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts",
    "tests/**/*.{ts,tsx}"
  ],
  "project": [
    "src/**/*.{ts,tsx}",
    "convex/**/*.ts",
    "tools/**/*.{ts,tsx}",
    "tests/**/*.{ts,tsx}"
  ],
  "ignore": [
    "convex/_generated/**",
    "src/routeTree.gen.ts"
  ]
}
```
