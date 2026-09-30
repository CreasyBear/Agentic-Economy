# Duplication and dead code — 29 September 2026

**Verdict.** Copy-paste is real and local, not a second codebase. jscpd finds **879** clones covering **3.22%** of lines in `src` and `convex` (min-tokens 50). The large blocks are copied validators and a handful of logic clones: an IPv6 parser, a machine-agent revoke cascade, seller-canary commitment checks, and the membership-record prelude. Dead files have shrunk to **two unwired skeletons (55 lines)**. Knip’s **930** unused value exports are mostly surplus `export` keywords and barrel names; **49** exported names have no mention anywhere in `src`, `convex`, `tests`, `tools`, or `scripts`.

Compared with the [24 September orphan audit](../../2026-09-24-codebase-health/Orphans.md): unused files fell from 26 (1,748 lines) to 2. The unused-export counts barely moved (935 values / 1,234 types then; 930 / 1,223 now). The same three unused dependencies are still declared.

## How this was measured

| Tool | What ran |
|---|---|
| jscpd **5.3.3** | `jscpd --min-tokens 50 --mode mild --format typescript,tsx --ignore "**/_generated/**,**/routeTree.gen.ts,**/*.d.ts" --absolute src convex` |
| knip **6.33.0** | JSON reporter. Entries: `src/routes/**`, `src/router.tsx`, `src/start.ts`, `convex/*.ts`, `tools/**/cli.ts`, `tools/dev/*.ts`, `tools/release/**/*.ts`, `scripts/**/*.ts`, Vite/Vitest/Playwright configs, `tests/**`. Project: `src`, `convex`, `tools`, `tests`, `scripts`. Ignored: `convex/_generated/**`, `src/routeTree.gen.ts`, and the `react-doctor` devDependency (the `doctor` script calls it). |

jscpd respects `.gitignore` and scanned **2,235** files: **292,718** lines, **1,874,082** tokens. Generated Convex API files and `src/routeTree.gen.ts` are not in that scan. `*.test.ts` files under `convex/` are in the scan because they live in that tree.

Knip treats entry files as used, so exports of route modules and Convex root façades are not reported. A name Knip calls unused can still be called inside its own file. After Knip, every flagged `src` value export was checked for an identifier mention in `src`, `convex`, `tests`, `tools`, and `scripts`. That check does not see string-built calls.

## Duplication

| | Clones | Duplicated lines | Share of lines | Duplicated tokens | Share of tokens |
|---|---:|---:|---:|---:|---:|
| TypeScript | 853 | 9,158 | 3.64% of 251,529 | 66,584 | 4.13% |
| TSX | 26 | 279 | 0.68% of 41,189 | 1,737 | 0.66% |
| **Total** | **879** | **9,437** | **3.22%** | **68,321** | **3.65%** |

All reported clones are exact. **786** do not touch a `*.test.ts` file (61,697 tokens). **93** do (6,624 tokens). Of the production clones, **495** are cross-file and **291** are two ranges in one file. Production clone ranges touch **505** files. jscpd’s 9,437 counts each clone’s length once and counts overlapping clones again; it is the tool’s figure, not a unique-line count.

Production token mass sits in `convex/lib/capabilitySupply` (17,772), `convex/lib/money` (11,823), `src/modules/capability-supply` (9,314), `convex/lib/principalAccount` (8,215), and `convex/lib/capabilityExecution` (6,146). Pair counts: convex–convex 407, src–src 297, src–convex 82.

### Top duplicated blocks

Overlapping hits on the same pair (a clone shifted by a line) are one row. Token and line counts are jscpd’s.

| # | Tokens | Lines | Copies | What is the same |
|---|---:|---:|---|---|
| 1 | 400 | 41 | `src/modules/catalog/internal/offering-supply.ts:369-409` and `src/modules/network-guard/public.ts:179-219` | Private IPv6 parse and embedded-IPv4 extraction (`6to4` and NAT64). Catalog does not call network-guard; `parseIpv6Bytes` is a second copy at `offering-supply.ts:393`. |
| 2 | 379 | 22 | `convex/lib/money/x402PaymentAttempt/read.ts:226-247` and `:283-304` | Two row projections repeat the custody, authorization, and observation fields. A second same-file clone (`:33-54` and `:107-128`, 249 tokens) repeats the matching `v` validators. Seven clones in this file sum to 996 tokens. |
| 3 | 364 | 51 | `convex/lib/principalAccount/personalAccount/retireDependents.ts:52-102` and `convex/lib/security/accountHistory/machineCascade.ts:77-127` | Both define `revokeMachineAgentAdmissionAndDependents`: patch the principal to `revoked`, revoke active grants, revoke OAuth refresh families with `clerk_password_reset`. The history copy also takes authority and a correlation ref. |
| 4 | 310 | 30 | `convex/lib/agentAccess/oauth/grants.ts:18-47` and `src/modules/agent-access/internal/oauth-convex-schema.ts:5-39` | `requestedAccess`, `connectionTarget`, and `replacement` validators. A later 198-token clone continues through the grant object (`grants.ts:51-56`, `oauth-convex-schema.ts:111-129`). Three clones on this pair sum to 604 tokens. |
| 5 | 278 | 42 | `convex/lib/principalAccount/memberships/membershipCreated.ts:15-56`, `membershipDeleted.ts:14-55`, `membershipUpdated.ts:14-55` | Same org-binding, account, identity-binding, and human-principal admission, with a different record scope. Created is paired with both of the others. |
| 6 | 261 | 26 | `convex/lib/capabilitySupply/publicationPorts/reads.ts:34-59` and `:87-112` | Two publication projections. The second stringifies `businessId`; the rest of the field list matches. |
| 7 | 247 | 26 | `convex/lib/catalog/publicReads/contracts.ts:36-61` and `convex/lib/registry/offeringSupply/contracts.ts:30-54` | Offering access-path unions (`accessPathRef`, `offeringRevision`, then the same arms). Four clones on this pair sum to 517 tokens. |
| 8 | 240 | 36 | `convex/interactiveSession.ts:23-58` and `convex/lib/principalAccount/onboarding/authority.ts:33-68` | Resolve the current Clerk identity to an active `principals` row (`tokenIdentifier`, then the same lookup). |
| 9 | 238 | 38 | `convex/lib/capabilitySupply/ownerCanary/identity.ts:77-114`, `src/modules/capability-execution/call-worker/call-execution-gates.ts:94-131`, `convex/lib/catalog/sellerCanary/evidence.ts:48-85` | Rebuild a seller-onboarding canary commitment from the same envelope fields. Identity is cloned against both other files. |
| 10 | 237 | 23 | `convex/lib/capabilitySupply/providerConnections/contracts.ts:12-34` and `src/modules/capability-supply/internal/convex-schema.ts:484-506` | Connection validator and `capabilityProviderConnections` table: `connectionRef`, `owningAccountRef`, `installedByPrincipalRef`, then the same fields. Lease validators are copied the same way (`leases.ts:22-43` and `convex-schema.ts:622-643`, 179 tokens). |
| 11 | 203 | 27 | `convex/lib/money/managedCall/booking.ts:10-36` and `convex/moneyLedgerValues.ts:67-93` | Managed-call booking object: `callRef`, `quoteRef`, `idempotencyKey`, then the same money fields. |
| 12 | 198 | 14 | `convex/lib/capabilityExecution/callProjection/contracts.ts:12-25` and `src/modules/capability-execution/internal/convex-schema.ts:311-329` | Terminal call state union: `deliveryState`, `paymentState`, `providerObligationState`. A 182-token overlap covers the same union again. |
| 13 | 181 | 28 | `convex/lib/principalAccount/invitations/invitationCreated.ts:13-40` and `invitationRevoked.ts:13-40` | Invitation record admission, same shape as the membership prelude above. |
| 14 | 179 | 22 | `convex/capabilitySupplyEligiblePorts.ts:27-48` and `convex/lib/capabilitySupply/graphPorts/ports.ts:25-46` | Eligible-port field list copied between the root façade and the lib module. |
| 15 | 118 | 20 | `convex/lib/money/autoRecharge/configure.ts:101-120` and `convex/lib/money/monthlyBudget/configure.ts:64-83` | Owner audit event body (`actorKind`, `actorRef`, `activeAccountRef`). Six clones on this pair sum to 418 tokens. |

Same-file hotspots that are not one block: `src/modules/capability-supply/supply-actions.ts` (14 clones, 833 tokens, mostly repeated type import lists), `src/lib/server/call-api.ts` (11 clones, 662 tokens, including the admit-and-content-type gate at `call-api.ts:455-468` and `:713-726`), and `convex/lib/capabilitySupply/providerConnections/leases.ts` (6 clones, 506 tokens, repeated lease-refusal unions).

Schema pairs (rows 4, 7, 10, 11, 12) are often the table definition and the validator that must accept that table. They are still drift risk. Rows 1, 3, 5, 8, and 9 are behavior copied in two places.

## Dead code

### Unused files

Knip unused files: **2**, both in `src`. Nothing else in `src`, `convex`, `tests`, `tools`, or `scripts` names them.

| File | Lines | Export |
|---|---:|---|
| `src/components/ae/chat/chat-session/ChatSkeleton.tsx` | 29 | `ChatSkeleton` at line 4 |
| `src/components/ae/command-panel/tools-search-page/ToolsSearchPageSkeleton.tsx` | 26 | `ToolsSearchPageSkeleton` at line 5 |

The 24 September audit listed 17 unwired skeletons. These two are the ones still unimported.

### Unused dependencies

| Package | Declared | Evidence |
|---|---|---|
| `@rjsf/validator-ajv8` | `package.json:94` | No import. `@rjsf/shadcn` peers are only `react`, `@rjsf/core`, and `@rjsf/utils`. The Tool playground uses a local `playgroundValidator` in `src/components/ae/market/directory-tool-input.ts:78`. |
| `react-resizable-panels` | `package.json:129` | No import outside the lockfile. |
| `aislop` | `package.json:156` (dev) | No script, source, or workflow reference. |
| `@convex-dev/batch-worker` | not declared | Direct import `tests/helpers/convex-fixtures.ts:6` (`@convex-dev/batch-worker/test`). Installed only because `@convex-dev/workpool` depends on it. |

`react-doctor` is a Knip false positive and was ignored: `package.json` script `doctor` runs it.

### Top unused exports

Knip reported **930** unused value exports and **1,223** unused type exports (plus **29** value and **8** type exports under `tools/`, outside this list). **None** were under `convex/`: root façades are entries, and every lib export Knip could see is imported.

Of the **901** `src` value exports Knip flagged:

| Class | Count | Meaning |
|---|---:|---|
| No mention outside the defining file, and the name is not used in that file either | 49 | Strongest dead exports |
| Used only in the defining file | 278 | Live helpers with an unnecessary `export` |
| Name also appears in another file | 574 | Usually a barrel re-export, or a public alias of a symbol callers import from somewhere else |

The files Knip flags most often are barrels, not the dead set: `src/modules/capability-supply/server.ts` (44), `src/modules/capability-supply/supply-actions.ts` (26), `src/modules/registry/public.ts` (25), `src/modules/capability-supply/public.ts` (22), `src/modules/money/public.ts` (20), `src/modules/action-execution/index.ts` (19). Type exports pile up on the same doors: `capability-supply/public.ts` 89, `registry/public.ts` 58, `money/public.ts` 49.

These are the largest of the 49 unreferenced names. “Lines” is from the export line to the next top-level declaration, so it is the size of the export, not a proof the body has no side effect.

| Lines | Export | Site |
|---:|---|---|
| 36 | `reverseOwnerProviderSettlementServer` | `src/lib/server/money-documents.functions.ts:236` |
| 32 | `fundingWebhookReadbackRefusal` | `src/modules/money/internal/account-funding-http.ts:546` |
| 28 | `AeSettingsRow` | `src/components/ae/layout/AeSection.tsx:54` |
| 26 | `presentOfferingAccessPath` | `src/components/ae/offerings/offering-presentation.ts:104` |
| 25 | `resolveEd25519Keyring` | `src/modules/common/ed25519-attestation.ts:49` |
| 24 | `resolveOwnerMoneyCaseServer` | `src/lib/server/money-documents.functions.ts:211` |
| 22 | `plainTrustLabel` | `src/lib/ui/provider-plain-labels.ts:63` |
| 21 | `offeringSupportCopy` | `src/components/ae/offerings/offering-presentation.ts:131` |
| 19 | `plainAvailabilityLabel` | `src/lib/ui/provider-plain-labels.ts:16` |
| 19 | `ownerToolAvailabilityPresentation` | `src/components/ae/offerings/provider-workspace-projection.ts:48` |
| 15 | `plainNextStepLabel` | `src/lib/ui/provider-plain-labels.ts:85` |
| 12 | `directoryVolumePayTos` | `src/modules/market/x402-directory-index.ts:133` |
| 10 | `groupCapabilitiesByCategory` | `src/modules/market/tool-view-model.ts:172` |
| 10 | `readBelowMatch` | `src/modules/chat/search-presentation.ts:26` |
| 10 | `buildCallMaterial` | `src/modules/capability-execution/call-material.ts:39` |

The other 34 unreferenced names, shorter: `validationProblem` (`src/lib/server/problem.ts:40`); `businessSupplyProjection` (`src/modules/catalog/internal/schema.ts:150`); `shutdownPostHogServer` (`src/lib/observability/posthog.server.ts:62`); `AGENT_DOOR` and `BUSINESS_DOOR` (`src/content/brand-copy.ts:49` and `:88`); `captureClientProductEventOnClient` (`src/lib/observability/capture-client-events.ts:11`); `isOwnerSupplyStep` (`src/modules/capability-supply/owner-supply-validators.ts:115`); `runCapabilityCall` (`src/modules/capability-execution/call-runtime.ts:35`, a wrapper around `runCapabilityCallWithAuthority`, which Convex does call); `ADMIN_APPROVAL_ACTION_LABELS` (`src/components/ae/admin/audit/audit.contracts.ts:120`); `requireOpaqueCursor` (`src/modules/registry/opaque-cursor.ts:65`); `buildRegistrySearchDocumentsFromCatalogs` (`src/modules/registry/internal/search-documents.ts:79`); `marketWindowToUpstream` (`src/modules/market/contracts.ts:88`); `reconnectOwnerProviderConnectionServer` (`src/modules/capability-supply/supply-funnel.functions.ts:152`); `isLocalHumanBusinessContext` (`src/modules/business/public.ts:70`); `readWebhookRefundCommandQuery` and `readWebhookFundingCommandQuery` (`src/modules/money/internal/account-funding-http.ts:264` and `:260`); `accountRefForExternalLoss` and `accountRefForRake` (`src/modules/money/internal/account-ref.ts:13` and `:9`); `readX402DirectoryCanonicalUrlForToolServer`, `readX402DirectoryCatalogueBySlugServer`, `readX402DirectoryAnalyticsServer` (`src/modules/market/x402-directory-index.functions.ts:34`, `:30`, `:22`); `readOwnerStatusServer` (`src/lib/server/owner-status.functions.ts:38`); `chatViewTool` (`src/lib/public/chat-ia.ts:117`); `blockTelemetryForPrivateRecord` (`src/lib/observability/private-route-safety.ts:107`); `directoryCount` (`src/components/ae/market/directory-presentation.ts:5`); `directoryArraySearchKeys` (`src/modules/market/x402-directory-navigation.ts:14`); `MARKET_MAX_FEATURED_SERVICES`, `MARKET_MAX_RECENT_ACTIVITY`, `MARKET_MAX_DAILY_POINTS` (`src/modules/market/contracts.ts:96-94`); `createConvexSupplyManagementAdapter` (`src/modules/capability-supply/supply-management-service.ts:591`, an alias of `createSupplyManagementService`); `ownerSupplyResultStepValue` (`src/modules/capability-supply/owner-supply-validators.ts:113`); `X402_SELLER_CLAIM_TTL_MS` (`src/modules/capability-supply/internal/x402-seller-claim.ts:3`); `PUBLIC_CREDENTIAL_REF` (`src/modules/capability-supply/internal/transport-adapters.ts:24`); `MANAGED_SIGNING_RECOVERY_EVIDENCE_SOURCE` (`src/modules/capability-execution/call-worker/recovery/managedSigning.ts:360`).

The two settlement/case server functions and the three directory server functions are `createServerFn` exports with no route or test import found. They are unused in this repo; they are not evidence that the underlying Convex mutations are unused.

Knip also reports five **duplicate export** pairs, which are aliases rather than pasted blocks: `publicToolChoiceSchema` = `compactToolCandidateSchema` (`src/modules/registry/tool-choice-contracts.ts:116`); `savedToolRemoveInputSchema` = `savedToolIdentitySchema` (`src/modules/market/saved-tools.contracts.ts:23`); `createConvexSupplyManagementAdapter` = `createSupplyManagementService` (`supply-management-service.ts:591`); `LEGACY_FORMANCE_TEMPLATE_NAMES` = `PACKAGE4_FORMANCE_TEMPLATE_NAMES` (`src/modules/money/formance-schema.ts:50`); `LEGACY_FORMANCE_SCHEMA_DIGEST` and `PACKAGE4_FORMANCE_SCHEMA_DIGEST` (`formance-schema.ts:522` and `:528`).

## What this does not show

Convex root exports and route modules are Knip entries, so an RPC or server function exported from those files is invisible to the unused-export list. Internal RPCs with no in-repo caller are a separate question; this pass did not repeat the 24 September RPC reference scan. Copied Convex validators may be the required twin of a table schema, not a candidate for deletion. Do not drop `@rjsf/core`, `@rjsf/shadcn`, or `@rjsf/utils`; only `validator-ajv8` lacks an import.
