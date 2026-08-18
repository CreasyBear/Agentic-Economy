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
import type * as answerThreads from "../answerThreads.js";
import type * as authz from "../authz.js";
import type * as business from "../business.js";
import type * as businessSupplyProjectionSnapshot from "../businessSupplyProjectionSnapshot.js";
import type * as capabilityContractDocuments from "../capabilityContractDocuments.js";
import type * as capabilityOperationInvocationWorker from "../capabilityOperationInvocationWorker.js";
import type * as capabilityOperationInvocations from "../capabilityOperationInvocations.js";
import type * as capabilityProviderApprovals from "../capabilityProviderApprovals.js";
import type * as capabilityProviderConnectionCleanup from "../capabilityProviderConnectionCleanup.js";
import type * as capabilityProviderConnections from "../capabilityProviderConnections.js";
import type * as capabilitySupply from "../capabilitySupply.js";
import type * as capabilitySupplyEligiblePorts from "../capabilitySupplyEligiblePorts.js";
import type * as capabilitySupplyGraphPorts from "../capabilitySupplyGraphPorts.js";
import type * as capabilitySupplyOperationPorts from "../capabilitySupplyOperationPorts.js";
import type * as capabilitySupplyOperations from "../capabilitySupplyOperations.js";
import type * as capabilitySupplyOwnerFunnel from "../capabilitySupplyOwnerFunnel.js";
import type * as capabilitySupplyOwnerSupply from "../capabilitySupplyOwnerSupply.js";
import type * as capabilitySupplyProjection from "../capabilitySupplyProjection.js";
import type * as capabilitySupplyPublicationPorts from "../capabilitySupplyPublicationPorts.js";
import type * as capabilitySupplyReadiness from "../capabilitySupplyReadiness.js";
import type * as capabilitySupplyRowMappers from "../capabilitySupplyRowMappers.js";
import type * as capabilitySupplyValues from "../capabilitySupplyValues.js";
import type * as capabilitySupplyWriterPorts from "../capabilitySupplyWriterPorts.js";
import type * as catalog from "../catalog.js";
import type * as catalogRuntimeQueries from "../catalogRuntimeQueries.js";
import type * as crons from "../crons.js";
import type * as curatedProviders from "../curatedProviders.js";
import type * as customerRequestUnlisted from "../customerRequestUnlisted.js";
import type * as demand from "../demand.js";
import type * as devSeed from "../devSeed.js";
import type * as devSeedStore from "../devSeedStore.js";
import type * as discovery from "../discovery.js";
import type * as externalRuns from "../externalRuns.js";
import type * as harnessSessions from "../harnessSessions.js";
import type * as http from "../http.js";
import type * as inquiries from "../inquiries.js";
import type * as inquiryNotificationBridge from "../inquiryNotificationBridge.js";
import type * as inquirySerializeOperator from "../inquirySerializeOperator.js";
import type * as inquirySourceStateLoad from "../inquirySourceStateLoad.js";
import type * as inquirySourceStateMappers from "../inquirySourceStateMappers.js";
import type * as inquirySourceStatePersist from "../inquirySourceStatePersist.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as marketDispatchWorkpool from "../marketDispatchWorkpool.js";
import type * as migrations from "../migrations.js";
import type * as moneyLedger from "../moneyLedger.js";
import type * as moneyX402PaymentAttempts from "../moneyX402PaymentAttempts.js";
import type * as notificationOutbox from "../notificationOutbox.js";
import type * as notificationOutboxPersistence from "../notificationOutboxPersistence.js";
import type * as notificationOutboxReconstruction from "../notificationOutboxReconstruction.js";
import type * as notificationOutboxSourceState from "../notificationOutboxSourceState.js";
import type * as observability from "../observability.js";
import type * as projectSpine from "../projectSpine.js";
import type * as qualifiedUse from "../qualifiedUse.js";
import type * as rateLimit from "../rateLimit.js";
import type * as registry from "../registry.js";
import type * as retiredListedUnlisted from "../retiredListedUnlisted.js";
import type * as routingKernelV1History from "../routingKernelV1History.js";
import type * as searchGap from "../searchGap.js";
import type * as security from "../security.js";
import type * as serviceAssertion from "../serviceAssertion.js";
import type * as settings from "../settings.js";
import type * as sourceWriteAdmission from "../sourceWriteAdmission.js";
import type * as studies from "../studies.js";
import type * as workTreeApprovals from "../workTreeApprovals.js";
import type * as workTreeRepeatLedger from "../workTreeRepeatLedger.js";
import type * as workTrees from "../workTrees.js";

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
  answerThreads: typeof answerThreads;
  authz: typeof authz;
  business: typeof business;
  businessSupplyProjectionSnapshot: typeof businessSupplyProjectionSnapshot;
  capabilityContractDocuments: typeof capabilityContractDocuments;
  capabilityOperationInvocationWorker: typeof capabilityOperationInvocationWorker;
  capabilityOperationInvocations: typeof capabilityOperationInvocations;
  capabilityProviderApprovals: typeof capabilityProviderApprovals;
  capabilityProviderConnectionCleanup: typeof capabilityProviderConnectionCleanup;
  capabilityProviderConnections: typeof capabilityProviderConnections;
  capabilitySupply: typeof capabilitySupply;
  capabilitySupplyEligiblePorts: typeof capabilitySupplyEligiblePorts;
  capabilitySupplyGraphPorts: typeof capabilitySupplyGraphPorts;
  capabilitySupplyOperationPorts: typeof capabilitySupplyOperationPorts;
  capabilitySupplyOperations: typeof capabilitySupplyOperations;
  capabilitySupplyOwnerFunnel: typeof capabilitySupplyOwnerFunnel;
  capabilitySupplyOwnerSupply: typeof capabilitySupplyOwnerSupply;
  capabilitySupplyProjection: typeof capabilitySupplyProjection;
  capabilitySupplyPublicationPorts: typeof capabilitySupplyPublicationPorts;
  capabilitySupplyReadiness: typeof capabilitySupplyReadiness;
  capabilitySupplyRowMappers: typeof capabilitySupplyRowMappers;
  capabilitySupplyValues: typeof capabilitySupplyValues;
  capabilitySupplyWriterPorts: typeof capabilitySupplyWriterPorts;
  catalog: typeof catalog;
  catalogRuntimeQueries: typeof catalogRuntimeQueries;
  crons: typeof crons;
  curatedProviders: typeof curatedProviders;
  customerRequestUnlisted: typeof customerRequestUnlisted;
  demand: typeof demand;
  devSeed: typeof devSeed;
  devSeedStore: typeof devSeedStore;
  discovery: typeof discovery;
  externalRuns: typeof externalRuns;
  harnessSessions: typeof harnessSessions;
  http: typeof http;
  inquiries: typeof inquiries;
  inquiryNotificationBridge: typeof inquiryNotificationBridge;
  inquirySerializeOperator: typeof inquirySerializeOperator;
  inquirySourceStateLoad: typeof inquirySourceStateLoad;
  inquirySourceStateMappers: typeof inquirySourceStateMappers;
  inquirySourceStatePersist: typeof inquirySourceStatePersist;
  "lib/rateLimit": typeof lib_rateLimit;
  marketDispatchWorkpool: typeof marketDispatchWorkpool;
  migrations: typeof migrations;
  moneyLedger: typeof moneyLedger;
  moneyX402PaymentAttempts: typeof moneyX402PaymentAttempts;
  notificationOutbox: typeof notificationOutbox;
  notificationOutboxPersistence: typeof notificationOutboxPersistence;
  notificationOutboxReconstruction: typeof notificationOutboxReconstruction;
  notificationOutboxSourceState: typeof notificationOutboxSourceState;
  observability: typeof observability;
  projectSpine: typeof projectSpine;
  qualifiedUse: typeof qualifiedUse;
  rateLimit: typeof rateLimit;
  registry: typeof registry;
  retiredListedUnlisted: typeof retiredListedUnlisted;
  routingKernelV1History: typeof routingKernelV1History;
  searchGap: typeof searchGap;
  security: typeof security;
  serviceAssertion: typeof serviceAssertion;
  settings: typeof settings;
  sourceWriteAdmission: typeof sourceWriteAdmission;
  studies: typeof studies;
  workTreeApprovals: typeof workTreeApprovals;
  workTreeRepeatLedger: typeof workTreeRepeatLedger;
  workTrees: typeof workTrees;
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
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  workpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  ownerActivationByStage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"ownerActivationByStage">;
};
