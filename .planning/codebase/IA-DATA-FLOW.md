# Business Data Model & Flows (IA-DATA-FLOW)

**Analysis Date:** 2026-09-01

## 1. Schema Composition

`convex/schema.ts` composes the database exclusively from module-owned table bundles (convex/schema.ts:1-46): `chatTables`, `chatSharingTables`, `actionInvocationTables`, `capabilityOperationInvocationTables`, `businessTables`, `catalogTables`, `capabilityContractRegistryTables`, `capabilitySupplyTables`, `agentAccessPrincipalTables`, `agentAccessPolicyTables`, `agentAccessOAuthTables`, `registryTables`, `observabilityTables`, `securityTables`, `moneyTables`, `marketTables`, `principalAccountTables`, `authorityDelegationTables`, `secretReferenceTables`, `recoveryProductionTables`, `marketDemandTables`. Each bundle is defined in the owning module's `internal/convex-schema.ts` (or `internal/schema.ts`) and re-exported through the module's public `schema.ts`.

## 2. Table Inventory by Domain

### 2.1 Identity & Authority

| Table | Module file | Notes |
|---|---|---|
| `principals` | src/modules/principal-account/principal/convex-schema.ts:30 | kind/lifecycle; indexes `by_principalRef`, `by_kind_and_lifecycle`, `by_lifecycle_and_updatedAt` |
| `accounts`, `accountOwnerships`, `memberships`, `accountRecoveryParticipantApprovals`, `accountSuccessionAuthorizations`, `accountSuccessionAuthorizationParticipants` | src/modules/principal-account/account/convex-schema.ts:134-158 | Canonical Phase-1 account registry; every command row carries `accountActionContextValue` (actor + idempotency) |
| `externalIdentityBindings`, `credentials` | src/modules/principal-account/external-identity/convex-schema.ts:79-84 | Clerk binding (`providerNamespace: 'clerk/api-key'`) and generationed credentials; indexes `by_bindingRef_and_generation_and_lifecycle`, `by_principalRef_and_lifecycle` |
| `agentAccessPrincipals`, `agentAccessProviderRevocations` | src/modules/agent-access/internal/principal-convex-schema.ts:18-30 | Agent runtime identity: `principalId`, `credentialId`, `authorityMode` (inspect_only/approve_each/bounded_mandate/full_yolo), `grantGeneration`, `policyDigest` |
| `agentAccessGrants` | src/modules/agent-access/internal/convex-schema.ts (agentAccessPolicyTables) | Exact-union storage of `ae.agent-access-grant:v1` (legacy) and `:v2` (new writes only, line ~90); policy embeds `budget` (max spend per invocation/day/month + concurrency) and `rate` (calls/minute/hour); hybrid shapes rejected (validator `storedAgentAccessGrantValue`) |
| `agentAccessOAuthGrants`, `agentAccessOAuthClients` | src/modules/agent-access/internal/oauth-convex-schema.ts | Device-code/authorization-code flows; hashes only (`deviceCodeHash`, `userCodeHash`, `authorizationCodeHash`); `requestedAccess`/`approvedAccess` amounts; `connectionTarget` + `replacement` for credential rotation; `consequenceReservation` (agentAccessConsentReservationValue) |
| `authorityDelegationGrants`, `authorityDelegationSnapshots`, `authorityDelegationSnapshotAncestors`, `consequenceProofUses` | src/modules/authority/internal/convex-schema.ts:55-93 | Delegation graph with ancestor chains (`by_snapshotRef_and_position`); proof uses bind `commandDigest` + `reverificationId` (strict factor evidence) |
| `secretPointers`, `secretPointerCommands`, `secretLifecycleJournal` | src/modules/secrets/internal/convex-schema.ts | Generational secret pointers (`activeGeneration`, `revision`); commands index `by_accountRef_and_idempotencyRef` on `action.idempotencyRef`; journal records provision/rotate with state `prepared|active|failed_validation|external_effect_unknown|pointer_conflict` |
| `recoveryBreakGlassApprovals`, `recoveryBreakGlassAdmissions` | src/modules/authority/recovery/convex-schema.ts:56-65 | Break-glass recovery approvals/admissions |

### 2.2 Supply (capability-supply + contract registry)

| Table | Defined at | Notes |
|---|---|---|
| `capabilityPublications` | src/modules/capability-supply/internal/convex-schema.ts:~120 | One admitted publication revision: `contractRefFields` (capabilityId/version/contractDigest), `sourceKind` (ae_envelope/openapi_http/mcp/agent_plugin_mcp/x402), `sourceDigest`, `sourceSelector`, `priceDigest`, `authorityMode` (provider_owned/ae_curated_external/third_party_gateway/observed_external), `provenanceDigest`, `disposition` (current/withdrawn/incompatible/superseded), embedded `connectionAuthority` snapshot, readiness fields (`readinessOutcome` healthy…response_invalid, `readinessValidUntil`, `readinessResponseDigest`, evidence ref arrays) |
| `capabilityOfferings` | same file | Marketplace offering: `presentation` (label/summary/price fixed|range|on_request/materialTerms/commercialRelationship), `searchTerms`, `registrationHash`, `eligibilityHash`, `status` inactive|active, `origin` (catalog_offering with offeringRef/revision/sourceHash — the W1 origin seam — or standalone) |
| `capabilityTransportBindings` | same file:~200 | Transport execution: `endpointUrl`, `authority` (public_upstream or provider_connection{connectionRef,providerRef}), `adapterId`, `configJson`+`configDigest`, `admission` not_admitted|admitted, `conformance` not_conformant|conformant, continuation/cancellation kinds |
| `capabilityProviderConnections` | same file:~250 | Credential-bearing connections: `authorityGeneration`+`authorityDigest`, `grantedScopes`/`grantedResources`, `lifecycle` (active/reauthorization_required/revocation_pending/revoked/cleanup_required), `x402Method`/`x402Payee`, health observation fields, cleanup fields (`cleanupWorkId`, `cleanupCallbackGraceUntil`), `lastCommandId`/`lastCommandDigest` |
| `capabilityProviderConnectionLeases` | same file | Lease-gated execution: `invocationRef`, `operationRef`, `authorityGeneration`/`authorityDigest`, `approvalDecisionRef`/`approvalDecisionDigest`, `readinessValidUntil`/`readinessDigest`, state active/consumed/expired/invalidated |
| `capabilityProviderApprovals` | same file | Owner approve/refuse/partial decisions: `commandId`, `commandDigest`, requested vs granted scopes/resources, `decisionDigest`, `decisionMakerAuthorityRef` |
| `registeredOperationMappings` | same file | Cross-contract mapping material: identity/field/array_project/registered_transform with source↔target contract refs and pointer/cardinality bounds |
| `capabilityContractDocuments` | src/modules/capability-contract-registry/internal/convex-schema.ts:5 | Canonical contract JSON (`documentJson`) keyed capabilityId+version+contractDigest, status active/retired |

### 2.3 Execution

| Table | Defined at | Notes |
|---|---|---|
| `capabilityOperationInvocations` | src/modules/capability-execution/internal/convex-schema.ts:~190 | Durable invocation: `invocationRef`, `principalId`/`ownerId`/`credentialId`/`applicationRef`, `grantRef`+`grantGeneration`+`policyDigest`+`grantExpiresAt`, `operationJson` (published snapshot), `inputJson`+`inputDigest`+`requestDigest`, optional `authority` (`operation-invoke-authority:v1`), `state` (pending/completed/refused/reconciliation_required/cancelled), `workId` (dispatch generation), `dispatchState`, `result` (`operationResultValue`: completed/pending/needs_authority/reconciliation_required/refused), `usage`, `receipt` (x402 eip155:8453 Base USDC / eip155:84532 Sepolia), `reconciliation` (attemptCount/nextAttemptAt/lease/disposition/reason) |
| `sellerOnboardingCanaryRearmAudits` | same file:~240 | Append-only canary re-arm proof with structured `refusalProvenance` (pre_claim or safe_before_release phases) |
| `providerConsequenceJournal` | same file:~300 | Authority-provenance-only journal for external effects: `commandId`, `state` pending/started/completed/aborted, `effectGeneration`, `leaseRef`, `connectionRef`, `authorityDigest`, secret refs/generations (no secret material), observation digests; indexes `by_commandId`, `by_state_and_expiresAt` |
| `actionInvocationControls` | src/modules/action-invocation/internal/convex-schema.ts:152 | Durable lifecycle control: `control` = `durableControlProjectionValue` (origin, owner, desired, `acceptedAuthority`, freshness, `control` state machine gathering_information→awaiting_authority→authorized→leased→in_progress→retryable→reconciliation_required→terminal/cancelled/invalidated), `authorityBinding`, `currentAttemptRef`/`currentEffectGeneration`/lease fields, `preparedMaterialDigest`/`preparedTargetDigest` |
| `actionInvocationAttempts` | same file:178 | Per-attempt: `attemptNumber`+`effectGeneration`, idempotency triple (`operationKey`, `materialInputDigest`, `effectIdentity`), `release` not_released/released/possibly_released, `outcome` (`durableAttemptOutcomeValue`: running/returned/failed safe_before_release/uncertain+timed_out reconcile_before_retry/reconciled_not_released/reconciled_released) |
| `actionInvocationHistory` | same file:196 | Append-only command log: `commandId`+`commandDigest`+`commandResult` applied|duplicate, `attemptTransition` (prior/next digest + release/outcome state), optional release `observation` |

### 2.4 Money

| Table | Defined at | Notes |
|---|---|---|
| `moneyAccounts` | src/modules/money/internal/convex-schema.ts:~55 | accountKind operator_credit/provider_earnings/ae_rake/ae_external_loss; balanceUnits/heldUnits/recoveryDueUnits + `version` (OCC) |
| `moneyLedgerEntries` | same file | Append-only ledger: entryType topup/charge/refund/payout_accrual/rake/external_loss/promo_grant/topup_bonus, direction credit/debit, `transactionRef`, `invocationRef`/`attemptRef`/`payoutRef`/`allocationRef`, `sourceDigest`, `reversalOf` |
| `moneyTransactions` | same file | Transaction head rows: kind, `idempotencyKey`, `inputDigest`, `journalDigest`, budget reservation fields (`budgetPolicyRef`, `budgetState` reserved/settled/released/unknown), `state` pending/applied/outcome_unknown/reversed, `expectedAccountVersion`, `reversalOf` |
| `moneyUsageEvents` | same file | Per-call usage: `usageRef`, `serviceRef`/`offeringRef`/`businessId`, `invocationRef`+`attemptRef`+`operationKey`, `priceDigest`, `chargeState` (free_tier/paid/insufficient_credit/outcome_unknown/refunded), `transactionRef` |
| `moneyCredentialBudgetStates` | same file | Budget windows: (principalId, credentialId, environment, generation, windowKind day|month|concurrency, windowStart) with settled/reserved units |
| `moneyExternalSpendReservations` | same file | x402 spend reservations: `invocationRef`+`attemptRef`+`effectGeneration`, `paymentIdentifier`+`challengeDigest`, `idempotencyDigest`+`identityDigest`, custody fields, `executionContext` (market base-usdc-exact / seller_onboarding_canary base-sepolia), `submissionStatus` (not_submitted/possibly_submitted/observed/unknown), reconciliation/reversal evidence digests |
| `moneyX402PaymentAttempts` | same file | Payment attempt ledger: challenge/requirement JSON, `authorizationDigest`, unsigned-material + signing fields (non-secret), `authorizationFailureCode`/`Detail`, transport/payment observation digests, quarantine fields |
| `moneyCredentialUsageSummaries` | same file | Rollup per (principal, credential, currency) |
| `qualifiedUseReceipts` | same file | ADR-034 insert-once delivery evidence: `materialDigest`, invocation/attempt/effectGeneration, businessId, pinned authority refs, `publicationRef`+`publicationRevision`+`contractDigest`+`bindingDigest`, principalClass, request/response digests, `usageRef`/`transactionRef` |
| `moneyTopupCommands`, `moneyConnectAccountCommands`, `moneyStripeEvents` | same file | Stripe intake command/SAGA rows with providerRecoveryDeadlineAt + evidence digests |
| `moneyPayoutAccounts`, `moneyPayouts`, `moneyPayoutAllocations` | same file | Payout lifecycle (review/held_kyc/held_threshold/transfer_pending/paid/reversed/failed/outcome_unknown; cadence daily), allocations per qualifiedUse with grossAccrual/rake/providerNet |

### 2.5 Market

| Table | Defined at | Notes |
|---|---|---|
| `businesses` | src/modules/business/internal/schema.ts:12 | slug, category, businessContext, publicStatus, trustTier, `sourceHash` |
| `businessOfferings`, `businessOfferingRevisions`, `offeringAccessPaths` | src/modules/catalog/internal/schema.ts:128-160 | Catalog offering with revisioned immutable rows (`sourceHash` per revision); access paths human_request (phone/website) or external_operation (with provenance business_declared/publicly_observed) |
| `registrySearchDocuments` | src/modules/registry/internal/schema.ts:33 | Denormalized public search doc (searchText/keywords/placeKeys/firstRequestMode) + Convex searchIndex `search_searchText_by_publicStatus` |
| `marketExternalSnapshots`, `marketExternalRegistryState`, `marketExternalRegistryGenerations`, `marketExternalRegistryEntries` | src/modules/market/internal/convex-schema.ts:5-102 | Federated external marketplace (agentic_market/treg) generationed ingest; entries carry sourceDigest, exactPrice, probeRequest, source latency/call stats, `authority: 'source_metadata_only'` |
| `marketEvidenceFacts` | same file:109 | kind ae_invocation/ae_invocation_completed/ae_settlement/ae_qualified_use/ae_reconciliation_required, `sourceRef`, operationRef, durationMs |
| `marketOperationCategories`, `marketOperationRatings`, `marketActiveOperations`, `marketActiveSuppliers` | same file:128-156 | Curation overlays |
| `marketDemandSignals` | src/modules/market-demand/internal/convex-schema.ts:5 | Unmet-demand capture: query + `queryDigest`, idempotency per credential |

### 2.6 Chat, Security, Observability

| Table | Defined at | Notes |
|---|---|---|
| `chatThreads` | src/modules/chat/internal/convex-schema.ts:5 | Thread metadata only (threadId/ownerId/title/activePromptMessageId) + searchIndex on title; **no message table exists in the schema** — message content is not persisted in Convex tables (chatMessages.ts:59 inserts only `chatThreads`) |
| `chatThreadShares` | src/modules/chat-sharing/internal/convex-schema.ts:5 | Share links with `verifier`/`keyId` + generation, status active/revoked |
| `auditEvents` | src/modules/observability/internal/schema.ts:16 | eventType/actorKind/actorRef/activeAccountRef, targetType/targetRef, beforeState/afterState, idempotencyKey+correlationId, `redactedPayloadJson`+`payloadHash` |
| `operationKeys` | same file:48 | Generic idempotency/dedup keys: scope, actor, operationName, key, requestHash, resultHash, effectRefs |
| `adminMemberships`, `adminMembershipAuditEvents`, `disputes`, `sourceWriteNonces` | src/modules/security/internal/schema.ts:15-66 | Admin RBAC; disputes with evidence hashes; replay-nonce ledger purged via `by_expiresAt` |

## 3. Key Index Definitions (verbatim)

`capabilityPublications` (src/modules/capability-supply/internal/convex-schema.ts):
```
.index('by_publicationRef_and_revision', ['publicationRef', 'revision'])
.index('by_operationRef_and_disposition', ['operationRef', 'disposition'])
.index('by_networkId_and_disposition', ['networkId', 'disposition'])
.index('by_businessId_and_disposition', ['businessId', 'disposition'])
.index('by_disposition_and_readinessValidUntil', ['disposition', 'readinessValidUntil'])
.index('by_bindingId_and_disposition', ['bindingId', 'disposition'])
```
`capabilityOperationInvocations` (src/modules/capability-execution/internal/convex-schema.ts):
```
.index('by_invocationRef', ['invocationRef'])
.index('by_credentialId_and_idempotencyKey', ['credentialId', 'idempotencyKey'])
.index('by_credentialId_and_state_and_grantExpiresAt', ['credentialId', 'state', 'grantExpiresAt'])
.index('by_principalId_and_invocationRef', ['principalId', 'invocationRef'])
.index('by_ownerId_and_state_and_createdAt', ['ownerId', 'state', 'createdAt'])
.index('by_state_and_reconciliation_nextAttemptAt', ['state', 'reconciliation.nextAttemptAt'])
```
`moneyExternalSpendReservations` (src/modules/money/internal/convex-schema.ts):
```
.index('by_reservationRef', ['reservationRef'])
.index('by_idempotencyDigest', ['idempotencyDigest'])
.index('by_identityDigest', ['identityDigest'])
.index('by_invocationRef_and_attemptRef_and_effectGeneration', ['invocationRef', 'attemptRef', 'effectGeneration'])
.index('by_paymentIdentifier_and_challengeDigest', ['paymentIdentifier', 'challengeDigest'])
.index('by_state_and_updatedAt', ['state', 'updatedAt'])
.index('by_grantRef_and_generation_and_environment', ['grantRef', 'grantGeneration', 'environment'])
```
`moneyPayouts`: `by_businessId_and_currency_and_state`, `by_periodStart_and_state`, `by_stripeTransferId`, `by_payoutRef`, plus cadence/updatedAt variants (src/modules/money/internal/convex-schema.ts).
`agentAccessGrants`: `by_grantRef`, `by_principalId`, `by_credentialId_and_environment_and_generation`, `by_credentialId_and_environment_and_lifecycle`, `by_ownerId_and_updatedAt` (src/modules/agent-access/internal/convex-schema.ts).
`capabilityProviderConnections`: `by_connectionRef`, `by_businessId_and_lifecycle`, `by_providerRef_and_lifecycle`, `by_connectionRef_and_authorityGeneration` (src/modules/capability-supply/internal/convex-schema.ts).
`actionInvocationAttempts`: `by_invocationRef_and_attemptNumber`, `by_invocationRef_and_attemptRef`, `by_idempotency_effectIdentity_and_attemptRef` (src/modules/action-invocation/internal/convex-schema.ts:191-194).
`capabilityProviderConnectionLeases`: `by_leaseRef`, `by_connectionRef_and_state`, `by_invocationRef`, `by_connectionRef_and_authorityGeneration` (src/modules/capability-supply/internal/convex-schema.ts).

## 4. Write Paths (Convex host files own mutations per domain)

|Domain|Convex host files (mutating owners)|
|---|---|
|Identity/principal-account|`agentAccessPrincipals.ts` (recordAgentPrincipal internalMutation :1655; inserts principals/memberships/externalIdentityBindings/credentials at :504-545), `agentAccessOAuth.ts` (grant/client upsert :229/:518, cleanupExpiredOAuthGrants :164), `agentAccessPolicy.ts` (upsertGrant :196, revokeGrant :309 — comment: agent lifecycle commands, never the grant-shaped seam directly), `authorityBoundary.ts`, `interactiveAuthority.ts`, `recoveryBreakGlass.ts`|
|Supply|`capabilitySupply.ts` (readiness probes/observeCapabilityReadiness :109, recordCapabilityCallEvent :181), `capabilitySupplyPublish.ts` + `capabilitySupplyPublicationPorts.ts` (capabilityPublications insert :95), `capabilitySupplyWriterPorts.ts` (capabilityOfferings :66 / capabilityTransportBindings :101), `capabilitySupplyOwnerStaging.ts`/`OwnerFunnelCommands.ts`/`OwnerSupply.ts`, `capabilitySupplyReadiness.ts`/`Probes.ts`, `capabilityProviderConnections.ts` (create :92, reauthorize :98, beginRevocation :104, lease issue/consume/expire/invalidate :158-206), `capabilityProviderApprovals.ts` (issue :145), `capabilityProviderConsequenceJournal.ts` (issue/claim/complete/abort tickets :574-824), `capabilityContractDocuments.ts` (contract doc insert :190), `catalogOfferingMutations.ts` (businesses/businessOfferings/businessOfferingRevisions/offeringAccessPaths :230,1606-1642), `facilitatorDiscovery.ts` (reconcile :184, keyless x402 admission)|
|Execution|`capabilityOperationInvocations.ts` — façade whose handlers live in convex/lib/operationInvocations/: `admission.ts` (admit/reserve/abandon; admitHandler :157 reads current published operation via capabilitySupplyOperations.ts), `dispatch.ts` (dispatch/claimDispatch/finalizeDispatch; marketDispatchWorkpool enqueue), `reconciliation.ts` (record/projectRecovery/completeWork wrappers), `invokeActions.ts` (canonicalAgentInvokeHandler etc.), `authorityHandlers.ts`; plus `capabilityOperationInvocationProjection.ts` (transacts actionInvocationControl, finalizes dispatch, records qualified use :649), `capabilityOperationInvocationWorker.ts` (Workpool worker: reconcileInvocationWorkloadAuthority ref :66, completeWork), `actionInvocationControl.ts` (transact :183 — the only writer of controls/attempts/history inserts :164-171), `capabilityOperationPreSubmissionRecovery.ts`, `capabilityOperationX402AuthorizationExpiry.ts`|
|Money|`moneyLedger.ts` (facade exporting internalMutations: authorizeInvocationCharge :223 → handler from moneyChargeAuthorize.ts:369; reconcileInvocationCharge :507 → moneyChargeReconcile.ts:252; reserveExternalInvocationSpend :146), `moneyChargeAdmission.ts` (admitInvocationCharge :97 — the single charge-admission gate), `moneyChargeAuthorize.ts` (prepareMoneyUsageEvent :70 / applyPreparedMoneyUsageEvent :147 inserts moneyUsageEvents + summaries :152-155), `moneyChargeBrokered.ts` (buyer/provider/rake pair writes; admitInvocationCharge callers :164/:560/:717/:774), `moneyChargeJournal.ts` (journal digest validation :169), `moneyExternalSpendReserve/Finalize/Reconcile/Reverse/Shared.ts`, `moneyX402PaymentAuthorization/Observation/Attempts.ts`, `moneyCreditTopup.ts`/`moneyCreditPromotions.ts`/`moneyCreditReads.ts`, `moneyStripeEvents.ts`, `moneyConnect.ts`, `moneyPayoutTransfer*.ts` (begin/settlement/complete/reconcile), `moneyProviderEarnings.ts`, `moneyRefund.ts`, `qualifiedUse.ts` (recordQualifiedUse), `moneyBudgetPersist.ts`, `moneyCanonicalAccounts.ts`|
|Market|`registry.ts` / `capabilitySupplyProjection.ts` (registrySearchDocuments upsert :145-146), `marketEvidence.ts` / `marketListingEvidence.ts` (recordMarketEvidenceFact called from admission.ts:30/dispatch.ts:19), `marketExternalRegistry.ts` + `marketExternalRegistryRefresh.ts` + `marketExternalRefresh.ts` (generationed ingest), `marketExternalSnapshots.ts`, `marketDemandSignals.ts`, `marketRegistryGraduation.ts`, `marketPresence.ts`, `marketDispatchWorkpool.ts`|
|Chat|`chatMessages.ts` (thread ensure :59), `chatGenerate.ts`, `chatShares.ts`, `chatTools.ts`|
|Security/observability|`securityAdminMembership.ts`, `securityRemovalDisputes.ts`, `securityAccountHistory.ts`, `sourceWriteAdmission.ts` (nonce consume), `auditEvents` writers via src/modules/observability/public (createPackage3AuditEvent, used e.g. ownerConsequence.ts:23)|

## 5. Read Paths

- **Catalog/public registry**: `convex/catalogPublicReads.ts` — resolves business actor (authz), loads offering source state (`loadOfferingSourceState` from catalogOfferingMutations.ts), reads `businessSupplyProjectionSnapshot` + live supply projection (`readLiveBusinessSupplyProjection`, `deriveBusinessOfferingSupportFromCapabilitySupply` from capabilitySupplyProjection.ts :19-20), then projects to the public API via `projectBusinessSupplyToPublicApi` (src/modules/registry/public).
- **Operations surface**: `convex/capabilitySupplyOperationQueries.ts` builds search/detail/compare/inspectPlan from `CapabilityOperationSourcePort` (src/modules/capability-supply/public) — serializers serializeOperation*Result; mappers in `capabilitySupplyRowMappers.ts` (toRegisteredOperationMapping) and shared DTO validators in `capabilitySupplyOperationShared.ts`. Client-side adapters: `src/modules/capability-supply/operation-source.ts:11-16` wraps `capabilitySupplyOperations:search|detail|compare|inspectPlan|offeringOperationMap` via `sourceQuery` + deserializers; `readCatalogOfferingOperationMap` returns only uniquely-resolved offering→operation links (W1 origin seam, operation-source.ts:48-52).
- **Registry projections**: `src/modules/registry/internal/service-projection.ts` — `/api/v1/services` Service DTO with `ServiceEndpointDto` carrying `ae.operationRef`, execution (`operation_call|request_route|catalog_only`), authorityMode, sourceKind, settlementSupport (service-projection.ts:22-67); built by `projectServiceFromBusinessDto` (services-api-projection.ts).
- **Money reads**: `moneyCreditReads.ts:114-118` (usage by principalId/credentialId/currency/observedAt), `agentMoneyReads.ts:138`, `moneyPayoutTransferRead.ts`, `moneyX402PaymentRead.ts`.
- **Invocation reads**: `readReplay`/`readRecovery`/`listInvocations`/`readInvocationStatus` actions on capabilityOperationInvocations.ts:170-312; owner status/cancel/reconcile :297-312.

## 6. Digests & Integrity

- **Canonical digest boundary**: `canonicalDigest(value)` — SHA-256 over `stableStringify` of bounded JSON, branded `sha256:<64hex>` as `SourceHash`; rejects non-bounded JSON with `canonical_digest_value_invalid` (src/modules/common/canonical-digest.ts:9-33). `isCanonicalDigest` regex :35.
- **commandId formats** (replay protection keys):
  - Action-invocation claims: `action-invocation-claim:v1:{invocationRef}:{attemptRef}` (src/modules/action-invocation/canonical-claim.ts:189); release fence `action-invocation-release-fence:v1:{invocationRef}:{attemptRef}:{effectGeneration}` (:286); terminal `action-invocation-terminal:v1:{invocationRef}:{attemptRef}:{effectGeneration}` (:360); control commands `${invocationRef}:{beforeVersion|'create'}:${kind}` or `${invocationRef}:reconciliation-evidence:${evidenceRef}` (durable.ts:224-226); cancel `${invocationRef}:cancel` (:416).
  - Leases: `operation-lease:{invocationRef}:{durableAttemptRef}` as commandId; leaseRef adds `:{effectGeneration}` (src/modules/capability-execution/invocation-worker/lease.ts:53-55); consume/expire/invalidate suffix the command prefix (:113,:124,:142).
  - Provider consequence tickets: `provider-effect:{invocationRef}:{attemptRef}:{effectGeneration}` (providerConsequenceBridge.ts:146).
  - Payout commands: `canonicalDigest({format:'money-payout-command:v1', businessId, payoutRef, …})` (src/modules/money/internal/payout-transfer-command.ts:52).
  - UI commands: `crypto.randomUUID()` per action key (src/components/ae/supply/AeOwnerProviderConnections.tsx:113-116).
- **Price digest**: computed as `canonicalDigest(operation.identity.price)` into the current-operation projection (`priceDigest`, `priceAuthorityDigest`, `materialTermsDigest` — src/modules/capability-supply/current-operation.ts:246-249); at publication, `pricingConfigDigest(pricingConfig)` derives the stored `capabilityPublications.priceDigest` (convex/facilitatorDiscovery.ts:320; pricing-port.ts:46). The invocation receipt must repeat the canary/operation `priceDigest` exactly (dispatch.ts:508).
- **Source/material digests**: publication `sourceDigest = publicationSourceDigest({sourceKind, selector, descriptorJson, …})` (src/modules/capability-supply/internal/publication/source.ts:236; used draft.ts:175). Published-operation `materialDigest = canonicalDigest(identity)` binds the full operation identity (published-operation.ts:270); the current-operation gate refuses unless `operation.materialDigest === canonicalDigest(operation.identity)` (current-operation.ts:226 — `current_operation_not_exact`). The invocation's `operationJson` snapshot must match current commitments (`currentOperationCommitmentsMatch`, admission.ts:29).
- **Ledger integrity**: every money row carries `sourceDigest`; `reconcilePreReleaseFailure` derives `sourceDigest` from the snapshot `materialDigest` or falls back to `canonicalDigest({format:'operation-money-source:v1', invocationRef, operationRef, requestDigest})`, and builds reconciliation/refund digests (`operation-money-reconciliation:v1`, `operation-money-refund:v1`) (convex/lib/operationInvocations/workComplete.ts:74-91). Charge journal digests validated in moneyChargeJournal.ts:169.

## 7. Cross-Plane Linkage (execution ↔ money ↔ evidence ↔ authority)

- **Invocation → charge**: buyer charge transactionRef is deterministic: `operation-money:{invocationRef}:{durableAttemptRef}:1`, and it is also the charge `idempotencyKey` (moneyChargeAdmission.ts:416-424). Usage row: `usageRef = {invocationRef}:{durableAttemptRef}:{operationRef}` (moneyChargeAdmission.ts:429). `admitInvocationCharge` refuses `billing_identity_mismatch` when operationKey/inputDigest/transactionRef don't equal the invocation's (moneyChargeAdmission.ts:426-431) and detects `ledger_idempotency_conflict` against prior moneyTransactions/entries (:445-470).
- **Charge → ledger**: `moneyChargeAuthorize.applyPreparedMoneyUsageEvent` inserts moneyUsageEvents + moneyCredentialUsageSummaries (moneyChargeAuthorize.ts:152-155); ledger entries reference `transactionRef`, `invocationRef`, `attemptRef` (moneyLedgerEntries fields). Pre-release failures settle through `internal.moneyLedger.reconcileInvocationCharge` with outcome `not_released` (workComplete.ts:101-113).
- **Invocation → evidence**: completion writes `qualifiedUseReceipts` via `internal.qualifiedUse.recordQualifiedUse` with the usage's `usageRef`/`transactionRef` and pinned authority fields (capabilityOperationInvocationProjection.ts:649-667); x402 paid usage may be synthesized as `usageRef: 'operation-x402-payment:{invocationRef}:{attemptRef}'` (:602). `marketEvidenceFacts` rows (ae_invocation/ae_settlement/…) are written from admit/dispatch with `sourceRef` and operationRef (recordMarketEvidenceFact, admission.ts:30, dispatch.ts:19).
- **Invocation → authority snapshot**: at reserve, the invocation embeds `authority: operation-invoke-authority:v1` (`invocationRef, operationRef, inputDigest, grantRef, grantGeneration, grantDigest, decisionDigest, targetDigest, consequence, limits, expiresAt, acceptedBasis` — src/modules/capability-execution/internal/convex-schema.ts:32-43) derived from `buildOperationInvokeAuthority` (admission.ts:24-27); concurrently `actionInvocationControls.authorityBinding` stamps the same `acceptedBasis` (acceptedAuthorityValue: approve_each/standing_mandate_use/customer_request_mandate_use/public_capability_use, action-invocation/internal/convex-schema.ts:105-140). Cold resumes reconcile against `grantRef+grantGeneration` on the row (reconcileInvocationWorkloadAuthority, capabilityOperationInvocations.ts:104-107).
- **Invocation → provider consequence**: dispatch claims a lease (`capabilityProviderConnectionLeases`) whose `invocationRef`/`authorityGeneration`/`authorityDigest` must match the connection's current generation (lease.ts:53-116); the `providerConsequenceJournal` ticket pins `leaseRef`, `connectionRef`, `commandId`, `invocationDigest`, secret generations — no secret material (capability-execution/internal/convex-schema.ts:~300; journal insert capabilityProviderConsequenceJournal.ts:514).
- **Money → payout**: qualifiedUseReceipts feed `moneyPayoutAllocations` (`qualifiedUseRef`, `usageRef`, `transactionRef`, grossAccrual/rake/providerNet, `materialDigest`) which roll into `moneyPayouts` per business/currency/day (allocation.ts:245-249); paid-charge validation cross-checks usage↔receipt↔transaction↔entries before payout (qualifiedUsePayout/journal.ts:72-133).
- **Evidence classes are separated**: `evidenceRefs` arrays on publications/connections/attempts, `evidenceHash` on invocation results/receipts, and `reconciliationEvidenceValue` (`kind: 'action_invocation_reconciliation'`, resolution not_released/released, `digest` — capability-execution/internal/convex-schema.ts:~95) are distinct from the immutable `actionInvocationHistory` command log and the insert-once `qualifiedUseReceipts` (ADR-034 comment, money/internal/convex-schema.ts).
