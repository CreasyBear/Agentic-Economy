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
import type * as billing from "../billing.js";
import type * as billingStore from "../billingStore.js";
import type * as business from "../business.js";
import type * as businessActionStore from "../businessActionStore.js";
import type * as businessActions from "../businessActions.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as devSeed from "../devSeed.js";
import type * as devSeedStore from "../devSeedStore.js";
import type * as discovery from "../discovery.js";
import type * as inquiries from "../inquiries.js";
import type * as notificationOutbox from "../notificationOutbox.js";
import type * as observability from "../observability.js";
import type * as protectedActionStore from "../protectedActionStore.js";
import type * as protectedActions from "../protectedActions.js";
import type * as registry from "../registry.js";
import type * as security from "../security.js";
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
  billing: typeof billing;
  billingStore: typeof billingStore;
  business: typeof business;
  businessActionStore: typeof businessActionStore;
  businessActions: typeof businessActions;
  catalog: typeof catalog;
  crons: typeof crons;
  devSeed: typeof devSeed;
  devSeedStore: typeof devSeedStore;
  discovery: typeof discovery;
  inquiries: typeof inquiries;
  notificationOutbox: typeof notificationOutbox;
  observability: typeof observability;
  protectedActionStore: typeof protectedActionStore;
  protectedActions: typeof protectedActions;
  registry: typeof registry;
  security: typeof security;
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
