/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actionInvocationControl from "../actionInvocationControl.js";
import type * as agentAccessOAuth from "../agentAccessOAuth.js";
import type * as agentAccessPolicy from "../agentAccessPolicy.js";
import type * as agentAccessPrincipals from "../agentAccessPrincipals.js";
import type * as agentMoneyReads from "../agentMoneyReads.js";
import type * as authorityBoundary from "../authorityBoundary.js";
import type * as authz from "../authz.js";
import type * as businessSupplyProjectionSnapshot from "../businessSupplyProjectionSnapshot.js";
import type * as capabilityContractDocuments from "../capabilityContractDocuments.js";
import type * as capabilityOperationInvocationIdentity from "../capabilityOperationInvocationIdentity.js";
import type * as capabilityOperationInvocationProjection from "../capabilityOperationInvocationProjection.js";
import type * as capabilityOperationInvocationWorker from "../capabilityOperationInvocationWorker.js";
import type * as capabilityOperationInvocations from "../capabilityOperationInvocations.js";
import type * as capabilityOperationX402AuthorizationExpiry from "../capabilityOperationX402AuthorizationExpiry.js";
import type * as capabilityProviderApprovals from "../capabilityProviderApprovals.js";
import type * as capabilityProviderConnectionAgents from "../capabilityProviderConnectionAgents.js";
import type * as capabilityProviderConnectionCleanup from "../capabilityProviderConnectionCleanup.js";
import type * as capabilityProviderConnections from "../capabilityProviderConnections.js";
import type * as capabilityProviderConsequenceJournal from "../capabilityProviderConsequenceJournal.js";
import type * as capabilitySupply from "../capabilitySupply.js";
import type * as capabilitySupplyCommands from "../capabilitySupplyCommands.js";
import type * as capabilitySupplyEligiblePorts from "../capabilitySupplyEligiblePorts.js";
import type * as capabilitySupplyGraph from "../capabilitySupplyGraph.js";
import type * as capabilitySupplyGraphPorts from "../capabilitySupplyGraphPorts.js";
import type * as capabilitySupplyLists from "../capabilitySupplyLists.js";
import type * as capabilitySupplyOperationOriginMap from "../capabilitySupplyOperationOriginMap.js";
import type * as capabilitySupplyOperationPorts from "../capabilitySupplyOperationPorts.js";
import type * as capabilitySupplyOperationProjection from "../capabilitySupplyOperationProjection.js";
import type * as capabilitySupplyOperationProjection_contracts from "../capabilitySupplyOperationProjection/contracts.js";
import type * as capabilitySupplyOperationProjection_read_control from "../capabilitySupplyOperationProjection/read_control.js";
import type * as capabilitySupplyOperationProjection_staging_snapshot from "../capabilitySupplyOperationProjection/staging_snapshot.js";
import type * as capabilitySupplyOperationQueries from "../capabilitySupplyOperationQueries.js";
import type * as capabilitySupplyOperationShared from "../capabilitySupplyOperationShared.js";
import type * as capabilitySupplyOperations from "../capabilitySupplyOperations.js";
import type * as capabilitySupplyOwnerFunnel from "../capabilitySupplyOwnerFunnel.js";
import type * as capabilitySupplyOwnerFunnelAgentRead from "../capabilitySupplyOwnerFunnelAgentRead.js";
import type * as capabilitySupplyOwnerFunnelCommands from "../capabilitySupplyOwnerFunnelCommands.js";
import type * as capabilitySupplyOwnerFunnelProjection from "../capabilitySupplyOwnerFunnelProjection.js";
import type * as capabilitySupplyOwnerFunnelProjection_contracts from "../capabilitySupplyOwnerFunnelProjection/contracts.js";
import type * as capabilitySupplyOwnerFunnelProjection_offering_projection from "../capabilitySupplyOwnerFunnelProjection/offering_projection.js";
import type * as capabilitySupplyOwnerFunnelRead from "../capabilitySupplyOwnerFunnelRead.js";
import type * as capabilitySupplyOwnerSupply from "../capabilitySupplyOwnerSupply.js";
import type * as capabilitySupplyProbes from "../capabilitySupplyProbes.js";
import type * as capabilitySupplyProjection from "../capabilitySupplyProjection.js";
import type * as capabilitySupplyPublicationPorts from "../capabilitySupplyPublicationPorts.js";
import type * as capabilitySupplyPublish from "../capabilitySupplyPublish.js";
import type * as capabilitySupplyReadiness from "../capabilitySupplyReadiness.js";
import type * as capabilitySupplyRowMappers from "../capabilitySupplyRowMappers.js";
import type * as capabilitySupplyShared from "../capabilitySupplyShared.js";
import type * as capabilitySupplyValues from "../capabilitySupplyValues.js";
import type * as capabilitySupplyWriterPorts from "../capabilitySupplyWriterPorts.js";
import type * as catalog from "../catalog.js";
import type * as catalogOfferingMutations from "../catalogOfferingMutations.js";
import type * as catalogPublicReads from "../catalogPublicReads.js";
import type * as chatAdmission from "../chatAdmission.js";
import type * as chatAnonymous from "../chatAnonymous.js";
import type * as chatGenerate from "../chatGenerate.js";
import type * as chatMessages from "../chatMessages.js";
import type * as chatShares from "../chatShares.js";
import type * as chatThreads from "../chatThreads.js";
import type * as chatTools from "../chatTools.js";
import type * as crons from "../crons.js";
import type * as devSeed from "../devSeed.js";
import type * as devSeedStore from "../devSeedStore.js";
import type * as discovery from "../discovery.js";
import type * as facilitatorDiscovery from "../facilitatorDiscovery.js";
import type * as facilitatorDiscoveryAction from "../facilitatorDiscoveryAction.js";
import type * as http from "../http.js";
import type * as interactiveAuthority from "../interactiveAuthority.js";
import type * as interactiveCredentialLifecycle from "../interactiveCredentialLifecycle.js";
import type * as lib_agentMoneyReads from "../lib/agentMoneyReads.js";
import type * as lib_authorityRegistrars from "../lib/authorityRegistrars.js";
import type * as lib_brokeredDisputeEvidence_contracts from "../lib/brokeredDisputeEvidence/contracts.js";
import type * as lib_brokeredDisputeEvidence_validation from "../lib/brokeredDisputeEvidence/validation.js";
import type * as lib_canonicalAgentAuthority from "../lib/canonicalAgentAuthority.js";
import type * as lib_connectionLifecyclePersistence from "../lib/connectionLifecyclePersistence.js";
import type * as lib_delegationPersistence from "../lib/delegationPersistence.js";
import type * as lib_marketExternalRegistry_contracts from "../lib/marketExternalRegistry/contracts.js";
import type * as lib_marketExternalRegistry_validation from "../lib/marketExternalRegistry/validation.js";
import type * as lib_operationInvocations_admission from "../lib/operationInvocations/admission.js";
import type * as lib_operationInvocations_authorityHandlers from "../lib/operationInvocations/authorityHandlers.js";
import type * as lib_operationInvocations_contracts from "../lib/operationInvocations/contracts.js";
import type * as lib_operationInvocations_dispatch from "../lib/operationInvocations/dispatch.js";
import type * as lib_operationInvocations_invokeActions from "../lib/operationInvocations/invokeActions.js";
import type * as lib_operationInvocations_reconciliation from "../lib/operationInvocations/reconciliation.js";
import type * as lib_operationInvocations_workComplete from "../lib/operationInvocations/workComplete.js";
import type * as lib_providerConnections_agent from "../lib/providerConnections/agent.js";
import type * as lib_providerConnections_authority from "../lib/providerConnections/authority.js";
import type * as lib_providerConnections_cleanup from "../lib/providerConnections/cleanup.js";
import type * as lib_providerConnections_codecs from "../lib/providerConnections/codecs.js";
import type * as lib_providerConnections_contracts from "../lib/providerConnections/contracts.js";
import type * as lib_providerConnections_leases from "../lib/providerConnections/leases.js";
import type * as lib_providerConnections_lifecycle from "../lib/providerConnections/lifecycle.js";
import type * as lib_providerConnections_owner from "../lib/providerConnections/owner.js";
import type * as lib_providerConnections_persistence from "../lib/providerConnections/persistence.js";
import type * as lib_qualifiedUsePayout_allocation from "../lib/qualifiedUsePayout/allocation.js";
import type * as lib_qualifiedUsePayout_authority from "../lib/qualifiedUsePayout/authority.js";
import type * as lib_qualifiedUsePayout_composition from "../lib/qualifiedUsePayout/composition.js";
import type * as lib_qualifiedUsePayout_contracts from "../lib/qualifiedUsePayout/contracts.js";
import type * as lib_qualifiedUsePayout_identity from "../lib/qualifiedUsePayout/identity.js";
import type * as lib_qualifiedUsePayout_index from "../lib/qualifiedUsePayout/index.js";
import type * as lib_qualifiedUsePayout_journal from "../lib/qualifiedUsePayout/journal.js";
import type * as lib_qualifiedUsePayout_replay from "../lib/qualifiedUsePayout/replay.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_secretLifecyclePersistence from "../lib/secretLifecyclePersistence.js";
import type * as lib_secretPointerPersistence from "../lib/secretPointerPersistence.js";
import type * as lib_workloadCron_context from "../lib/workloadCron/context.js";
import type * as marketAggregateBackfill from "../marketAggregateBackfill.js";
import type * as marketDispatchWorkpool from "../marketDispatchWorkpool.js";
import type * as marketEvidence from "../marketEvidence.js";
import type * as marketExternalRefresh from "../marketExternalRefresh.js";
import type * as marketExternalRegistry from "../marketExternalRegistry.js";
import type * as marketExternalRegistryRefresh from "../marketExternalRegistryRefresh.js";
import type * as marketExternalSnapshots from "../marketExternalSnapshots.js";
import type * as marketListingEvidence from "../marketListingEvidence.js";
import type * as marketPresence from "../marketPresence.js";
import type * as marketRegistryGraduation from "../marketRegistryGraduation.js";
import type * as moneyBillingAuthorization from "../moneyBillingAuthorization.js";
import type * as moneyBrokeredDisputeEvidence from "../moneyBrokeredDisputeEvidence.js";
import type * as moneyBrokeredDisputeLoss from "../moneyBrokeredDisputeLoss.js";
import type * as moneyBrokeredInvalidOutputLoss from "../moneyBrokeredInvalidOutputLoss.js";
import type * as moneyBudgetPersist from "../moneyBudgetPersist.js";
import type * as moneyCanonicalAccounts from "../moneyCanonicalAccounts.js";
import type * as moneyChargeAdmission from "../moneyChargeAdmission.js";
import type * as moneyChargeAuthorize from "../moneyChargeAuthorize.js";
import type * as moneyChargeBrokered from "../moneyChargeBrokered.js";
import type * as moneyChargeJournal from "../moneyChargeJournal.js";
import type * as moneyChargeReconcile from "../moneyChargeReconcile.js";
import type * as moneyConnect from "../moneyConnect.js";
import type * as moneyCreditPromotions from "../moneyCreditPromotions.js";
import type * as moneyCreditReads from "../moneyCreditReads.js";
import type * as moneyCreditTopup from "../moneyCreditTopup.js";
import type * as moneyCreditTopup_apply from "../moneyCreditTopup/apply.js";
import type * as moneyCreditTopup_command_view from "../moneyCreditTopup/command_view.js";
import type * as moneyCreditTopup_contracts from "../moneyCreditTopup/contracts.js";
import type * as moneyExternalSpend from "../moneyExternalSpend.js";
import type * as moneyExternalSpendFinalize from "../moneyExternalSpendFinalize.js";
import type * as moneyExternalSpendReconcile from "../moneyExternalSpendReconcile.js";
import type * as moneyExternalSpendReserve from "../moneyExternalSpendReserve.js";
import type * as moneyExternalSpendReverse from "../moneyExternalSpendReverse.js";
import type * as moneyExternalSpendShared from "../moneyExternalSpendShared.js";
import type * as moneyLedger from "../moneyLedger.js";
import type * as moneyLedgerValues from "../moneyLedgerValues.js";
import type * as moneyPayoutTransferBegin from "../moneyPayoutTransferBegin.js";
import type * as moneyPayoutTransferComplete from "../moneyPayoutTransferComplete.js";
import type * as moneyPayoutTransferCompleteApply from "../moneyPayoutTransferCompleteApply.js";
import type * as moneyPayoutTransferRead from "../moneyPayoutTransferRead.js";
import type * as moneyPayoutTransferReconcile from "../moneyPayoutTransferReconcile.js";
import type * as moneyPayoutTransferSettlement from "../moneyPayoutTransferSettlement.js";
import type * as moneyPayoutTransferShared from "../moneyPayoutTransferShared.js";
import type * as moneyPayoutTransferShared_reservation_journal from "../moneyPayoutTransferShared/reservation_journal.js";
import type * as moneyPayoutTransferShared_row_projection from "../moneyPayoutTransferShared/row_projection.js";
import type * as moneyProviderEarnings from "../moneyProviderEarnings.js";
import type * as moneyRefund from "../moneyRefund.js";
import type * as moneyStripeEvents from "../moneyStripeEvents.js";
import type * as moneyX402PaymentAttempts from "../moneyX402PaymentAttempts.js";
import type * as moneyX402PaymentAttemptsShared from "../moneyX402PaymentAttemptsShared.js";
import type * as moneyX402PaymentAuthorization from "../moneyX402PaymentAuthorization.js";
import type * as moneyX402PaymentObservation from "../moneyX402PaymentObservation.js";
import type * as moneyX402PaymentRead from "../moneyX402PaymentRead.js";
import type * as providerConsequenceHttp from "../providerConsequenceHttp.js";
import type * as qualifiedUse from "../qualifiedUse.js";
import type * as rateLimit from "../rateLimit.js";
import type * as recoveryBreakGlass from "../recoveryBreakGlass.js";
import type * as registry from "../registry.js";
import type * as secretLifecycleHttp from "../secretLifecycleHttp.js";
import type * as secretLifecycleOperations from "../secretLifecycleOperations.js";
import type * as security from "../security.js";
import type * as securityAdminMembership from "../securityAdminMembership.js";
import type * as securityAdminReadbacks from "../securityAdminReadbacks.js";
import type * as securityRemovalDisputes from "../securityRemovalDisputes.js";
import type * as securityShared from "../securityShared.js";
import type * as serviceAssertion from "../serviceAssertion.js";
import type * as sourceWriteAdmission from "../sourceWriteAdmission.js";
import type * as workloadCron from "../workloadCron.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actionInvocationControl: typeof actionInvocationControl;
  agentAccessOAuth: typeof agentAccessOAuth;
  agentAccessPolicy: typeof agentAccessPolicy;
  agentAccessPrincipals: typeof agentAccessPrincipals;
  agentMoneyReads: typeof agentMoneyReads;
  authorityBoundary: typeof authorityBoundary;
  authz: typeof authz;
  businessSupplyProjectionSnapshot: typeof businessSupplyProjectionSnapshot;
  capabilityContractDocuments: typeof capabilityContractDocuments;
  capabilityOperationInvocationIdentity: typeof capabilityOperationInvocationIdentity;
  capabilityOperationInvocationProjection: typeof capabilityOperationInvocationProjection;
  capabilityOperationInvocationWorker: typeof capabilityOperationInvocationWorker;
  capabilityOperationInvocations: typeof capabilityOperationInvocations;
  capabilityOperationX402AuthorizationExpiry: typeof capabilityOperationX402AuthorizationExpiry;
  capabilityProviderApprovals: typeof capabilityProviderApprovals;
  capabilityProviderConnectionAgents: typeof capabilityProviderConnectionAgents;
  capabilityProviderConnectionCleanup: typeof capabilityProviderConnectionCleanup;
  capabilityProviderConnections: typeof capabilityProviderConnections;
  capabilityProviderConsequenceJournal: typeof capabilityProviderConsequenceJournal;
  capabilitySupply: typeof capabilitySupply;
  capabilitySupplyCommands: typeof capabilitySupplyCommands;
  capabilitySupplyEligiblePorts: typeof capabilitySupplyEligiblePorts;
  capabilitySupplyGraph: typeof capabilitySupplyGraph;
  capabilitySupplyGraphPorts: typeof capabilitySupplyGraphPorts;
  capabilitySupplyLists: typeof capabilitySupplyLists;
  capabilitySupplyOperationOriginMap: typeof capabilitySupplyOperationOriginMap;
  capabilitySupplyOperationPorts: typeof capabilitySupplyOperationPorts;
  capabilitySupplyOperationProjection: typeof capabilitySupplyOperationProjection;
  "capabilitySupplyOperationProjection/contracts": typeof capabilitySupplyOperationProjection_contracts;
  "capabilitySupplyOperationProjection/read_control": typeof capabilitySupplyOperationProjection_read_control;
  "capabilitySupplyOperationProjection/staging_snapshot": typeof capabilitySupplyOperationProjection_staging_snapshot;
  capabilitySupplyOperationQueries: typeof capabilitySupplyOperationQueries;
  capabilitySupplyOperationShared: typeof capabilitySupplyOperationShared;
  capabilitySupplyOperations: typeof capabilitySupplyOperations;
  capabilitySupplyOwnerFunnel: typeof capabilitySupplyOwnerFunnel;
  capabilitySupplyOwnerFunnelAgentRead: typeof capabilitySupplyOwnerFunnelAgentRead;
  capabilitySupplyOwnerFunnelCommands: typeof capabilitySupplyOwnerFunnelCommands;
  capabilitySupplyOwnerFunnelProjection: typeof capabilitySupplyOwnerFunnelProjection;
  "capabilitySupplyOwnerFunnelProjection/contracts": typeof capabilitySupplyOwnerFunnelProjection_contracts;
  "capabilitySupplyOwnerFunnelProjection/offering_projection": typeof capabilitySupplyOwnerFunnelProjection_offering_projection;
  capabilitySupplyOwnerFunnelRead: typeof capabilitySupplyOwnerFunnelRead;
  capabilitySupplyOwnerSupply: typeof capabilitySupplyOwnerSupply;
  capabilitySupplyProbes: typeof capabilitySupplyProbes;
  capabilitySupplyProjection: typeof capabilitySupplyProjection;
  capabilitySupplyPublicationPorts: typeof capabilitySupplyPublicationPorts;
  capabilitySupplyPublish: typeof capabilitySupplyPublish;
  capabilitySupplyReadiness: typeof capabilitySupplyReadiness;
  capabilitySupplyRowMappers: typeof capabilitySupplyRowMappers;
  capabilitySupplyShared: typeof capabilitySupplyShared;
  capabilitySupplyValues: typeof capabilitySupplyValues;
  capabilitySupplyWriterPorts: typeof capabilitySupplyWriterPorts;
  catalog: typeof catalog;
  catalogOfferingMutations: typeof catalogOfferingMutations;
  catalogPublicReads: typeof catalogPublicReads;
  chatAdmission: typeof chatAdmission;
  chatAnonymous: typeof chatAnonymous;
  chatGenerate: typeof chatGenerate;
  chatMessages: typeof chatMessages;
  chatShares: typeof chatShares;
  chatThreads: typeof chatThreads;
  chatTools: typeof chatTools;
  crons: typeof crons;
  devSeed: typeof devSeed;
  devSeedStore: typeof devSeedStore;
  discovery: typeof discovery;
  facilitatorDiscovery: typeof facilitatorDiscovery;
  facilitatorDiscoveryAction: typeof facilitatorDiscoveryAction;
  http: typeof http;
  interactiveAuthority: typeof interactiveAuthority;
  interactiveCredentialLifecycle: typeof interactiveCredentialLifecycle;
  "lib/agentMoneyReads": typeof lib_agentMoneyReads;
  "lib/authorityRegistrars": typeof lib_authorityRegistrars;
  "lib/brokeredDisputeEvidence/contracts": typeof lib_brokeredDisputeEvidence_contracts;
  "lib/brokeredDisputeEvidence/validation": typeof lib_brokeredDisputeEvidence_validation;
  "lib/canonicalAgentAuthority": typeof lib_canonicalAgentAuthority;
  "lib/connectionLifecyclePersistence": typeof lib_connectionLifecyclePersistence;
  "lib/delegationPersistence": typeof lib_delegationPersistence;
  "lib/marketExternalRegistry/contracts": typeof lib_marketExternalRegistry_contracts;
  "lib/marketExternalRegistry/validation": typeof lib_marketExternalRegistry_validation;
  "lib/operationInvocations/admission": typeof lib_operationInvocations_admission;
  "lib/operationInvocations/authorityHandlers": typeof lib_operationInvocations_authorityHandlers;
  "lib/operationInvocations/contracts": typeof lib_operationInvocations_contracts;
  "lib/operationInvocations/dispatch": typeof lib_operationInvocations_dispatch;
  "lib/operationInvocations/invokeActions": typeof lib_operationInvocations_invokeActions;
  "lib/operationInvocations/reconciliation": typeof lib_operationInvocations_reconciliation;
  "lib/operationInvocations/workComplete": typeof lib_operationInvocations_workComplete;
  "lib/providerConnections/agent": typeof lib_providerConnections_agent;
  "lib/providerConnections/authority": typeof lib_providerConnections_authority;
  "lib/providerConnections/cleanup": typeof lib_providerConnections_cleanup;
  "lib/providerConnections/codecs": typeof lib_providerConnections_codecs;
  "lib/providerConnections/contracts": typeof lib_providerConnections_contracts;
  "lib/providerConnections/leases": typeof lib_providerConnections_leases;
  "lib/providerConnections/lifecycle": typeof lib_providerConnections_lifecycle;
  "lib/providerConnections/owner": typeof lib_providerConnections_owner;
  "lib/providerConnections/persistence": typeof lib_providerConnections_persistence;
  "lib/qualifiedUsePayout/allocation": typeof lib_qualifiedUsePayout_allocation;
  "lib/qualifiedUsePayout/authority": typeof lib_qualifiedUsePayout_authority;
  "lib/qualifiedUsePayout/composition": typeof lib_qualifiedUsePayout_composition;
  "lib/qualifiedUsePayout/contracts": typeof lib_qualifiedUsePayout_contracts;
  "lib/qualifiedUsePayout/identity": typeof lib_qualifiedUsePayout_identity;
  "lib/qualifiedUsePayout/index": typeof lib_qualifiedUsePayout_index;
  "lib/qualifiedUsePayout/journal": typeof lib_qualifiedUsePayout_journal;
  "lib/qualifiedUsePayout/replay": typeof lib_qualifiedUsePayout_replay;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/secretLifecyclePersistence": typeof lib_secretLifecyclePersistence;
  "lib/secretPointerPersistence": typeof lib_secretPointerPersistence;
  "lib/workloadCron/context": typeof lib_workloadCron_context;
  marketAggregateBackfill: typeof marketAggregateBackfill;
  marketDispatchWorkpool: typeof marketDispatchWorkpool;
  marketEvidence: typeof marketEvidence;
  marketExternalRefresh: typeof marketExternalRefresh;
  marketExternalRegistry: typeof marketExternalRegistry;
  marketExternalRegistryRefresh: typeof marketExternalRegistryRefresh;
  marketExternalSnapshots: typeof marketExternalSnapshots;
  marketListingEvidence: typeof marketListingEvidence;
  marketPresence: typeof marketPresence;
  marketRegistryGraduation: typeof marketRegistryGraduation;
  moneyBillingAuthorization: typeof moneyBillingAuthorization;
  moneyBrokeredDisputeEvidence: typeof moneyBrokeredDisputeEvidence;
  moneyBrokeredDisputeLoss: typeof moneyBrokeredDisputeLoss;
  moneyBrokeredInvalidOutputLoss: typeof moneyBrokeredInvalidOutputLoss;
  moneyBudgetPersist: typeof moneyBudgetPersist;
  moneyCanonicalAccounts: typeof moneyCanonicalAccounts;
  moneyChargeAdmission: typeof moneyChargeAdmission;
  moneyChargeAuthorize: typeof moneyChargeAuthorize;
  moneyChargeBrokered: typeof moneyChargeBrokered;
  moneyChargeJournal: typeof moneyChargeJournal;
  moneyChargeReconcile: typeof moneyChargeReconcile;
  moneyConnect: typeof moneyConnect;
  moneyCreditPromotions: typeof moneyCreditPromotions;
  moneyCreditReads: typeof moneyCreditReads;
  moneyCreditTopup: typeof moneyCreditTopup;
  "moneyCreditTopup/apply": typeof moneyCreditTopup_apply;
  "moneyCreditTopup/command_view": typeof moneyCreditTopup_command_view;
  "moneyCreditTopup/contracts": typeof moneyCreditTopup_contracts;
  moneyExternalSpend: typeof moneyExternalSpend;
  moneyExternalSpendFinalize: typeof moneyExternalSpendFinalize;
  moneyExternalSpendReconcile: typeof moneyExternalSpendReconcile;
  moneyExternalSpendReserve: typeof moneyExternalSpendReserve;
  moneyExternalSpendReverse: typeof moneyExternalSpendReverse;
  moneyExternalSpendShared: typeof moneyExternalSpendShared;
  moneyLedger: typeof moneyLedger;
  moneyLedgerValues: typeof moneyLedgerValues;
  moneyPayoutTransferBegin: typeof moneyPayoutTransferBegin;
  moneyPayoutTransferComplete: typeof moneyPayoutTransferComplete;
  moneyPayoutTransferCompleteApply: typeof moneyPayoutTransferCompleteApply;
  moneyPayoutTransferRead: typeof moneyPayoutTransferRead;
  moneyPayoutTransferReconcile: typeof moneyPayoutTransferReconcile;
  moneyPayoutTransferSettlement: typeof moneyPayoutTransferSettlement;
  moneyPayoutTransferShared: typeof moneyPayoutTransferShared;
  "moneyPayoutTransferShared/reservation_journal": typeof moneyPayoutTransferShared_reservation_journal;
  "moneyPayoutTransferShared/row_projection": typeof moneyPayoutTransferShared_row_projection;
  moneyProviderEarnings: typeof moneyProviderEarnings;
  moneyRefund: typeof moneyRefund;
  moneyStripeEvents: typeof moneyStripeEvents;
  moneyX402PaymentAttempts: typeof moneyX402PaymentAttempts;
  moneyX402PaymentAttemptsShared: typeof moneyX402PaymentAttemptsShared;
  moneyX402PaymentAuthorization: typeof moneyX402PaymentAuthorization;
  moneyX402PaymentObservation: typeof moneyX402PaymentObservation;
  moneyX402PaymentRead: typeof moneyX402PaymentRead;
  providerConsequenceHttp: typeof providerConsequenceHttp;
  qualifiedUse: typeof qualifiedUse;
  rateLimit: typeof rateLimit;
  recoveryBreakGlass: typeof recoveryBreakGlass;
  registry: typeof registry;
  secretLifecycleHttp: typeof secretLifecycleHttp;
  secretLifecycleOperations: typeof secretLifecycleOperations;
  security: typeof security;
  securityAdminMembership: typeof securityAdminMembership;
  securityAdminReadbacks: typeof securityAdminReadbacks;
  securityRemovalDisputes: typeof securityRemovalDisputes;
  securityShared: typeof securityShared;
  serviceAssertion: typeof serviceAssertion;
  sourceWriteAdmission: typeof sourceWriteAdmission;
  workloadCron: typeof workloadCron;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  ownerActivationByStage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"ownerActivationByStage">;
  marketEvidence: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"marketEvidence">;
  marketOperationEvidence: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"marketOperationEvidence">;
  marketOperationRatings: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"marketOperationRatings">;
  marketActiveOperations: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"marketActiveOperations">;
  marketActiveSuppliers: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"marketActiveSuppliers">;
};
