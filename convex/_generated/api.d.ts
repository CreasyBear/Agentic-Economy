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
import type * as capabilitySupplyReadiness from "../capabilitySupplyReadiness.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as customerRequestApplication from "../customerRequestApplication.js";
import type * as customerRequestPrincipals from "../customerRequestPrincipals.js";
import type * as customerRequestRouteExecution from "../customerRequestRouteExecution.js";
import type * as customerRequestRouteMandate from "../customerRequestRouteMandate.js";
import type * as customerRequestRouteMandateAdmission from "../customerRequestRouteMandateAdmission.js";
import type * as customerRequestRouteMandateIntegrity from "../customerRequestRouteMandateIntegrity.js";
import type * as customerRequestRouteMandateLifecycle from "../customerRequestRouteMandateLifecycle.js";
import type * as customerRequestRouteTransportWorker from "../customerRequestRouteTransportWorker.js";
import type * as customerRequestV2 from "../customerRequestV2.js";
import type * as customerRequestV2Preparation from "../customerRequestV2Preparation.js";
import type * as customerRequestV2PreparationEgress from "../customerRequestV2PreparationEgress.js";
import type * as customerRequestV2PreparationEgressState from "../customerRequestV2PreparationEgressState.js";
import type * as customerRequestV2PreparedAction from "../customerRequestV2PreparedAction.js";
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
import type * as routingKernelV1History from "../routingKernelV1History.js";
import type * as sandboxAcceptanceSupply from "../sandboxAcceptanceSupply.js";
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
  capabilitySupplyReadiness: typeof capabilitySupplyReadiness;
  catalog: typeof catalog;
  crons: typeof crons;
  customerRequestApplication: typeof customerRequestApplication;
  customerRequestPrincipals: typeof customerRequestPrincipals;
  customerRequestRouteExecution: typeof customerRequestRouteExecution;
  customerRequestRouteMandate: typeof customerRequestRouteMandate;
  customerRequestRouteMandateAdmission: typeof customerRequestRouteMandateAdmission;
  customerRequestRouteMandateIntegrity: typeof customerRequestRouteMandateIntegrity;
  customerRequestRouteMandateLifecycle: typeof customerRequestRouteMandateLifecycle;
  customerRequestRouteTransportWorker: typeof customerRequestRouteTransportWorker;
  customerRequestV2: typeof customerRequestV2;
  customerRequestV2Preparation: typeof customerRequestV2Preparation;
  customerRequestV2PreparationEgress: typeof customerRequestV2PreparationEgress;
  customerRequestV2PreparationEgressState: typeof customerRequestV2PreparationEgressState;
  customerRequestV2PreparedAction: typeof customerRequestV2PreparedAction;
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
  routingKernelV1History: typeof routingKernelV1History;
  sandboxAcceptanceSupply: typeof sandboxAcceptanceSupply;
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
