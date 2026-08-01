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
import type * as answerThreads from "../answerThreads.js";
import type * as authz from "../authz.js";
import type * as authzMigration from "../authzMigration.js";
import type * as business from "../business.js";
import type * as capabilityContractDocuments from "../capabilityContractDocuments.js";
import type * as capabilitySupply from "../capabilitySupply.js";
import type * as capabilitySupplyEligiblePorts from "../capabilitySupplyEligiblePorts.js";
import type * as capabilitySupplyGraphPorts from "../capabilitySupplyGraphPorts.js";
import type * as capabilitySupplyOperationPorts from "../capabilitySupplyOperationPorts.js";
import type * as capabilitySupplyPublicationPorts from "../capabilitySupplyPublicationPorts.js";
import type * as capabilitySupplyReadiness from "../capabilitySupplyReadiness.js";
import type * as capabilitySupplyWriterPorts from "../capabilitySupplyWriterPorts.js";
import type * as catalog from "../catalog.js";
import type * as catalogSupplyProjection from "../catalogSupplyProjection.js";
import type * as crons from "../crons.js";
import type * as customerRequestAgentOAuth from "../customerRequestAgentOAuth.js";
import type * as customerRequestApplication from "../customerRequestApplication.js";
import type * as customerRequestAuthorizePreparationPorts from "../customerRequestAuthorizePreparationPorts.js";
import type * as customerRequestCompareResumePorts from "../customerRequestCompareResumePorts.js";
import type * as customerRequestConfirmRoutePorts from "../customerRequestConfirmRoutePorts.js";
import type * as customerRequestEvidenceLoadPorts from "../customerRequestEvidenceLoadPorts.js";
import type * as customerRequestPrincipals from "../customerRequestPrincipals.js";
import type * as customerRequestProblemRoutePorts from "../customerRequestProblemRoutePorts.js";
import type * as customerRequestProvideFactsPorts from "../customerRequestProvideFactsPorts.js";
import type * as customerRequestRefinePorts from "../customerRequestRefinePorts.js";
import type * as customerRequestRouteCancellationWorker from "../customerRequestRouteCancellationWorker.js";
import type * as customerRequestRouteExecution from "../customerRequestRouteExecution.js";
import type * as customerRequestRouteExecutionCancelPorts from "../customerRequestRouteExecutionCancelPorts.js";
import type * as customerRequestRouteExecutionDispatchPorts from "../customerRequestRouteExecutionDispatchPorts.js";
import type * as customerRequestRouteExecutionJournalPorts from "../customerRequestRouteExecutionJournalPorts.js";
import type * as customerRequestRouteExecutionProblemPorts from "../customerRequestRouteExecutionProblemPorts.js";
import type * as customerRequestRouteMandate from "../customerRequestRouteMandate.js";
import type * as customerRequestRouteMandateAdmission from "../customerRequestRouteMandateAdmission.js";
import type * as customerRequestRouteMandateIntegrity from "../customerRequestRouteMandateIntegrity.js";
import type * as customerRequestRouteMandateLifecycle from "../customerRequestRouteMandateLifecycle.js";
import type * as customerRequestRouteMandatePorts from "../customerRequestRouteMandatePorts.js";
import type * as customerRequestRouteTransportWorker from "../customerRequestRouteTransportWorker.js";
import type * as customerRequestStandingRoutePolicy from "../customerRequestStandingRoutePolicy.js";
import type * as customerRequestStandingRoutePorts from "../customerRequestStandingRoutePorts.js";
import type * as customerRequestV2 from "../customerRequestV2.js";
import type * as customerRequestV2Preparation from "../customerRequestV2Preparation.js";
import type * as customerRequestV2PreparationEgress from "../customerRequestV2PreparationEgress.js";
import type * as customerRequestV2PreparationEgressActionPorts from "../customerRequestV2PreparationEgressActionPorts.js";
import type * as customerRequestV2PreparationEgressPorts from "../customerRequestV2PreparationEgressPorts.js";
import type * as customerRequestV2PreparationEgressState from "../customerRequestV2PreparationEgressState.js";
import type * as customerRequestV2PreparationPorts from "../customerRequestV2PreparationPorts.js";
import type * as customerRequestV2PreparedAction from "../customerRequestV2PreparedAction.js";
import type * as customerRequestV2PreparedActionPorts from "../customerRequestV2PreparedActionPorts.js";
import type * as customerRequestV2ReadPorts from "../customerRequestV2ReadPorts.js";
import type * as customerRequestV2WritePorts from "../customerRequestV2WritePorts.js";
import type * as decisionMaps from "../decisionMaps.js";
import type * as demand from "../demand.js";
import type * as devSeed from "../devSeed.js";
import type * as devSeedStore from "../devSeedStore.js";
import type * as discovery from "../discovery.js";
import type * as enginePlans from "../enginePlans.js";
import type * as harnessSessions from "../harnessSessions.js";
import type * as http from "../http.js";
import type * as inquiries from "../inquiries.js";
import type * as inquiryNotificationBridge from "../inquiryNotificationBridge.js";
import type * as inquiryNotificationPorts from "../inquiryNotificationPorts.js";
import type * as inquiryRuntimeDbHelpers from "../inquiryRuntimeDbHelpers.js";
import type * as inquirySerializeOperator from "../inquirySerializeOperator.js";
import type * as inquirySourceStateLoad from "../inquirySourceStateLoad.js";
import type * as inquirySourceStateMappers from "../inquirySourceStateMappers.js";
import type * as inquirySourceStatePersist from "../inquirySourceStatePersist.js";
import type * as inquirySourceStatePorts from "../inquirySourceStatePorts.js";
import type * as moneyLedger from "../moneyLedger.js";
import type * as moneyStripe from "../moneyStripe.js";
import type * as notificationOutbox from "../notificationOutbox.js";
import type * as notificationOutboxOperatorPorts from "../notificationOutboxOperatorPorts.js";
import type * as notificationOutboxPersistence from "../notificationOutboxPersistence.js";
import type * as notificationOutboxSourceState from "../notificationOutboxSourceState.js";
import type * as notificationOutboxSourceStatePorts from "../notificationOutboxSourceStatePorts.js";
import type * as observability from "../observability.js";
import type * as projectSpine from "../projectSpine.js";
import type * as registry from "../registry.js";
import type * as routingKernelV1History from "../routingKernelV1History.js";
import type * as sandboxAcceptanceSupply from "../sandboxAcceptanceSupply.js";
import type * as searchGap from "../searchGap.js";
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
  actionInvocationControl: typeof actionInvocationControl;
  answerThreads: typeof answerThreads;
  authz: typeof authz;
  authzMigration: typeof authzMigration;
  business: typeof business;
  capabilityContractDocuments: typeof capabilityContractDocuments;
  capabilitySupply: typeof capabilitySupply;
  capabilitySupplyEligiblePorts: typeof capabilitySupplyEligiblePorts;
  capabilitySupplyGraphPorts: typeof capabilitySupplyGraphPorts;
  capabilitySupplyOperationPorts: typeof capabilitySupplyOperationPorts;
  capabilitySupplyPublicationPorts: typeof capabilitySupplyPublicationPorts;
  capabilitySupplyReadiness: typeof capabilitySupplyReadiness;
  capabilitySupplyWriterPorts: typeof capabilitySupplyWriterPorts;
  catalog: typeof catalog;
  catalogSupplyProjection: typeof catalogSupplyProjection;
  crons: typeof crons;
  customerRequestAgentOAuth: typeof customerRequestAgentOAuth;
  customerRequestApplication: typeof customerRequestApplication;
  customerRequestAuthorizePreparationPorts: typeof customerRequestAuthorizePreparationPorts;
  customerRequestCompareResumePorts: typeof customerRequestCompareResumePorts;
  customerRequestConfirmRoutePorts: typeof customerRequestConfirmRoutePorts;
  customerRequestEvidenceLoadPorts: typeof customerRequestEvidenceLoadPorts;
  customerRequestPrincipals: typeof customerRequestPrincipals;
  customerRequestProblemRoutePorts: typeof customerRequestProblemRoutePorts;
  customerRequestProvideFactsPorts: typeof customerRequestProvideFactsPorts;
  customerRequestRefinePorts: typeof customerRequestRefinePorts;
  customerRequestRouteCancellationWorker: typeof customerRequestRouteCancellationWorker;
  customerRequestRouteExecution: typeof customerRequestRouteExecution;
  customerRequestRouteExecutionCancelPorts: typeof customerRequestRouteExecutionCancelPorts;
  customerRequestRouteExecutionDispatchPorts: typeof customerRequestRouteExecutionDispatchPorts;
  customerRequestRouteExecutionJournalPorts: typeof customerRequestRouteExecutionJournalPorts;
  customerRequestRouteExecutionProblemPorts: typeof customerRequestRouteExecutionProblemPorts;
  customerRequestRouteMandate: typeof customerRequestRouteMandate;
  customerRequestRouteMandateAdmission: typeof customerRequestRouteMandateAdmission;
  customerRequestRouteMandateIntegrity: typeof customerRequestRouteMandateIntegrity;
  customerRequestRouteMandateLifecycle: typeof customerRequestRouteMandateLifecycle;
  customerRequestRouteMandatePorts: typeof customerRequestRouteMandatePorts;
  customerRequestRouteTransportWorker: typeof customerRequestRouteTransportWorker;
  customerRequestStandingRoutePolicy: typeof customerRequestStandingRoutePolicy;
  customerRequestStandingRoutePorts: typeof customerRequestStandingRoutePorts;
  customerRequestV2: typeof customerRequestV2;
  customerRequestV2Preparation: typeof customerRequestV2Preparation;
  customerRequestV2PreparationEgress: typeof customerRequestV2PreparationEgress;
  customerRequestV2PreparationEgressActionPorts: typeof customerRequestV2PreparationEgressActionPorts;
  customerRequestV2PreparationEgressPorts: typeof customerRequestV2PreparationEgressPorts;
  customerRequestV2PreparationEgressState: typeof customerRequestV2PreparationEgressState;
  customerRequestV2PreparationPorts: typeof customerRequestV2PreparationPorts;
  customerRequestV2PreparedAction: typeof customerRequestV2PreparedAction;
  customerRequestV2PreparedActionPorts: typeof customerRequestV2PreparedActionPorts;
  customerRequestV2ReadPorts: typeof customerRequestV2ReadPorts;
  customerRequestV2WritePorts: typeof customerRequestV2WritePorts;
  decisionMaps: typeof decisionMaps;
  demand: typeof demand;
  devSeed: typeof devSeed;
  devSeedStore: typeof devSeedStore;
  discovery: typeof discovery;
  enginePlans: typeof enginePlans;
  harnessSessions: typeof harnessSessions;
  http: typeof http;
  inquiries: typeof inquiries;
  inquiryNotificationBridge: typeof inquiryNotificationBridge;
  inquiryNotificationPorts: typeof inquiryNotificationPorts;
  inquiryRuntimeDbHelpers: typeof inquiryRuntimeDbHelpers;
  inquirySerializeOperator: typeof inquirySerializeOperator;
  inquirySourceStateLoad: typeof inquirySourceStateLoad;
  inquirySourceStateMappers: typeof inquirySourceStateMappers;
  inquirySourceStatePersist: typeof inquirySourceStatePersist;
  inquirySourceStatePorts: typeof inquirySourceStatePorts;
  moneyLedger: typeof moneyLedger;
  moneyStripe: typeof moneyStripe;
  notificationOutbox: typeof notificationOutbox;
  notificationOutboxOperatorPorts: typeof notificationOutboxOperatorPorts;
  notificationOutboxPersistence: typeof notificationOutboxPersistence;
  notificationOutboxSourceState: typeof notificationOutboxSourceState;
  notificationOutboxSourceStatePorts: typeof notificationOutboxSourceStatePorts;
  observability: typeof observability;
  projectSpine: typeof projectSpine;
  registry: typeof registry;
  routingKernelV1History: typeof routingKernelV1History;
  sandboxAcceptanceSupply: typeof sandboxAcceptanceSupply;
  searchGap: typeof searchGap;
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

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  workpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
};
