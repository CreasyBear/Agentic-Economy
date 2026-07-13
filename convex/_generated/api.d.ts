/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as answerThreads from "../answerThreads.js";
import type * as authz from "../authz.js";
import type * as authzMigration from "../authzMigration.js";
import type * as business from "../business.js";
import type * as capabilityContractDocuments from "../capabilityContractDocuments.js";
import type * as capabilitySupply from "../capabilitySupply.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as customerRequestApplication from "../customerRequestApplication.js";
import type * as customerRequestCapabilityContractRegistryAdapter from "../customerRequestCapabilityContractRegistryAdapter.js";
import type * as customerRequestCapabilityContracts from "../customerRequestCapabilityContracts.js";
import type * as customerRequestCompilationStoreAdapter from "../customerRequestCompilationStoreAdapter.js";
import type * as customerRequestPreparationAuthority from "../customerRequestPreparationAuthority.js";
import type * as customerRequestPreparationAuthorityStoreAdapter from "../customerRequestPreparationAuthorityStoreAdapter.js";
import type * as customerRequestPrincipals from "../customerRequestPrincipals.js";
import type * as customerRequestStoreAdapter from "../customerRequestStoreAdapter.js";
import type * as customerRequestV2 from "../customerRequestV2.js";
import type * as customerRequestV2ActionAttempt from "../customerRequestV2ActionAttempt.js";
import type * as customerRequestV2ApprovalGrant from "../customerRequestV2ApprovalGrant.js";
import type * as customerRequestV2Preparation from "../customerRequestV2Preparation.js";
import type * as customerRequestV2PreparationEgress from "../customerRequestV2PreparationEgress.js";
import type * as customerRequestV2PreparationEgressState from "../customerRequestV2PreparationEgressState.js";
import type * as customerRequestV2PreparedAction from "../customerRequestV2PreparedAction.js";
import type * as customerRequestV2ProviderExecution from "../customerRequestV2ProviderExecution.js";
import type * as customerRequestV2ProviderReconciliation from "../customerRequestV2ProviderReconciliation.js";
import type * as customerRequests from "../customerRequests.js";
import type * as demand from "../demand.js";
import type * as devSeed from "../devSeed.js";
import type * as devSeedStore from "../devSeedStore.js";
import type * as discovery from "../discovery.js";
import type * as harnessSessions from "../harnessSessions.js";
import type * as http from "../http.js";
import type * as inquiries from "../inquiries.js";
import type * as notificationOutbox from "../notificationOutbox.js";
import type * as observability from "../observability.js";
import type * as registry from "../registry.js";
import type * as routingKernel from "../routingKernel.js";
import type * as routingKernelAdmission from "../routingKernelAdmission.js";
import type * as routingKernelAgentGrants from "../routingKernelAgentGrants.js";
import type * as routingKernelBindings from "../routingKernelBindings.js";
import type * as routingKernelEvidence from "../routingKernelEvidence.js";
import type * as routingKernelHostedIncidentProof from "../routingKernelHostedIncidentProof.js";
import type * as routingKernelIncidentControl from "../routingKernelIncidentControl.js";
import type * as routingKernelStore from "../routingKernelStore.js";
import type * as routingKernelStoreAdapter from "../routingKernelStoreAdapter.js";
import type * as routingKernelStructuredPreparation from "../routingKernelStructuredPreparation.js";
import type * as routingKernelStructuredPreparationStoreAdapter from "../routingKernelStructuredPreparationStoreAdapter.js";
import type * as routingKernelTracer from "../routingKernelTracer.js";
import type * as routingKernelTransport from "../routingKernelTransport.js";
import type * as security from "../security.js";
import type * as settings from "../settings.js";
import type * as sourceWriteAdmission from "../sourceWriteAdmission.js";
import type * as source_state from "../source_state.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  answerThreads: typeof answerThreads;
  authz: typeof authz;
  authzMigration: typeof authzMigration;
  business: typeof business;
  capabilityContractDocuments: typeof capabilityContractDocuments;
  capabilitySupply: typeof capabilitySupply;
  catalog: typeof catalog;
  crons: typeof crons;
  customerRequestApplication: typeof customerRequestApplication;
  customerRequestCapabilityContractRegistryAdapter: typeof customerRequestCapabilityContractRegistryAdapter;
  customerRequestCapabilityContracts: typeof customerRequestCapabilityContracts;
  customerRequestCompilationStoreAdapter: typeof customerRequestCompilationStoreAdapter;
  customerRequestPreparationAuthority: typeof customerRequestPreparationAuthority;
  customerRequestPreparationAuthorityStoreAdapter: typeof customerRequestPreparationAuthorityStoreAdapter;
  customerRequestPrincipals: typeof customerRequestPrincipals;
  customerRequestStoreAdapter: typeof customerRequestStoreAdapter;
  customerRequestV2: typeof customerRequestV2;
  customerRequestV2ActionAttempt: typeof customerRequestV2ActionAttempt;
  customerRequestV2ApprovalGrant: typeof customerRequestV2ApprovalGrant;
  customerRequestV2Preparation: typeof customerRequestV2Preparation;
  customerRequestV2PreparationEgress: typeof customerRequestV2PreparationEgress;
  customerRequestV2PreparationEgressState: typeof customerRequestV2PreparationEgressState;
  customerRequestV2PreparedAction: typeof customerRequestV2PreparedAction;
  customerRequestV2ProviderExecution: typeof customerRequestV2ProviderExecution;
  customerRequestV2ProviderReconciliation: typeof customerRequestV2ProviderReconciliation;
  customerRequests: typeof customerRequests;
  demand: typeof demand;
  devSeed: typeof devSeed;
  devSeedStore: typeof devSeedStore;
  discovery: typeof discovery;
  harnessSessions: typeof harnessSessions;
  http: typeof http;
  inquiries: typeof inquiries;
  notificationOutbox: typeof notificationOutbox;
  observability: typeof observability;
  registry: typeof registry;
  routingKernel: typeof routingKernel;
  routingKernelAdmission: typeof routingKernelAdmission;
  routingKernelAgentGrants: typeof routingKernelAgentGrants;
  routingKernelBindings: typeof routingKernelBindings;
  routingKernelEvidence: typeof routingKernelEvidence;
  routingKernelHostedIncidentProof: typeof routingKernelHostedIncidentProof;
  routingKernelIncidentControl: typeof routingKernelIncidentControl;
  routingKernelStore: typeof routingKernelStore;
  routingKernelStoreAdapter: typeof routingKernelStoreAdapter;
  routingKernelStructuredPreparation: typeof routingKernelStructuredPreparation;
  routingKernelStructuredPreparationStoreAdapter: typeof routingKernelStructuredPreparationStoreAdapter;
  routingKernelTracer: typeof routingKernelTracer;
  routingKernelTransport: typeof routingKernelTransport;
  security: typeof security;
  settings: typeof settings;
  sourceWriteAdmission: typeof sourceWriteAdmission;
  source_state: typeof source_state;
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

export declare const components: {};
