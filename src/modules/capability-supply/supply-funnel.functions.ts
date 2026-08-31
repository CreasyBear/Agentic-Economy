import { createServerFn } from "@tanstack/react-start";

import {
  connectOwnerX402,
  connectOwnerX402InputSchema,
  inspectOwnerX402,
  inspectOwnerX402InputSchema,
  ownerConnectionCommandSchema,
  readOwnerProviderConnections,
  readOwnerProviderEarnings,
  reconnectOwnerProviderConnection,
  retryOwnerProviderConnectionCleanup,
  retryOwnerProviderConnectionCleanupInputSchema,
  revokeOwnerProviderConnection,
} from "./internal/supply-funnel/connections";
import {
  recheckOwnerCapability,
  readOwnerSupplyFunnel,
  republishOwnerCapability,
  runOwnerSupplyReadiness,
  runOwnerSupplyTest,
  readOwnerSellerCanaryStatus,
  promoteOwnerSellerCanary,
  ownerSellerCanaryStatusInputSchema,
  ownerSellerCanaryPromotionInputSchema,
  ownerSupplyActionInputSchema,
  ownerSupplyMaintenanceInputSchema,
  ownerSupplyReadInputSchema,
  withdrawOwnerCapability,
} from "./internal/supply-funnel/funnel-owner";
import {
  admitOwnerCapability,
  ownerOpenApiDocumentPreflightInputSchema,
  ownerSupplyAdmissionInputSchema,
  preflightOwnerCapability,
  preflightOwnerCapabilityInputSchema,
  preflightOwnerOpenApiDocument,
} from "./internal/supply-funnel/publication-admit";

export type {
  OwnerProviderConnection,
  OwnerProviderConnectionCommandResult,
  OwnerProviderEarningsAccountReadback,
  OwnerProviderEarningsReadback,
} from "./internal/supply-funnel/connections";
export type {
  SupplyLandingPorts,
  SupplyLandingReadback,
  SupplyLandingTool,
} from "./internal/supply-funnel/landing";
export type {
  OwnerOpenApiDocumentPreflightResult,
  OwnerSupplyAdmissionResult,
  OwnerSupplyPreflightResult,
} from "./internal/supply-funnel/publication-admit";
export type { PricingStepResult } from "./internal/supply-funnel/pricing-port";
export type {
  OwnerSupplyActionInput,
  OwnerSupplyCommandResult,
  OwnerSupplyFunnelReadback,
  OwnerSupplyMaintenanceInput,
  OwnerSupplyOfferingReadback,
  OwnerSellerCanaryReadback,
  OwnerSellerCanaryPromotionResult,
  OwnerSupplyReadbackSource,
  SupplyCallLogRow,
  SupplyFunnelActionContext,
  SupplyFunnelRefusal,
  SupplyFunnelStep,
  SupplyFunnelStepCompletion,
  SupplyFunnelStepState,
  SupplyLiquiditySummary,
} from "./internal/supply-funnel/types";

export { filterOwnerSupplyAuthorityOptions } from "./internal/supply-funnel/connections";
export { connectOwnerX402, inspectOwnerX402 } from "./internal/supply-funnel/connections";
export { loadSupplyLandingReadback } from "./internal/supply-funnel/landing";
export { ownerPublicationImport } from "./internal/supply-funnel/publication-import";
export { ownerPublicationWithCatalogOrigin } from "./internal/supply-funnel/publication-admit";
export { ownerSupplyActionContext } from "./internal/supply-funnel/types";
export { resolveSupplyPricing } from "./internal/supply-funnel/pricing-port";

export const readOwnerSupplyFunnelServer = createServerFn()
  .validator((data) => ownerSupplyReadInputSchema.parse(data))
  .handler(readOwnerSupplyFunnel);

export const readOwnerProviderConnectionsServer = createServerFn().handler(
  readOwnerProviderConnections,
);

export const connectOwnerX402Server = createServerFn({ method: "POST" })
  .validator((data) => connectOwnerX402InputSchema.parse(data))
  .handler(connectOwnerX402);

export const inspectOwnerX402Server = createServerFn({ method: "POST" })
  .validator((data) => inspectOwnerX402InputSchema.parse(data))
  .handler(inspectOwnerX402);

export const reconnectOwnerProviderConnectionServer = createServerFn({
  method: "POST",
})
  .validator((data) => ownerConnectionCommandSchema.parse(data))
  .handler(reconnectOwnerProviderConnection);

export const revokeOwnerProviderConnectionServer = createServerFn({
  method: "POST",
})
  .validator((data) => ownerConnectionCommandSchema.parse(data))
  .handler(revokeOwnerProviderConnection);

export const retryOwnerProviderConnectionCleanupServer = createServerFn({
  method: "POST",
})
  .validator((data) =>
    retryOwnerProviderConnectionCleanupInputSchema.parse(data),
  )
  .handler(retryOwnerProviderConnectionCleanup);

export const readOwnerProviderEarningsServer = createServerFn().handler(
  readOwnerProviderEarnings,
);

export const preflightOwnerOpenApiDocumentServer = createServerFn({
  method: "POST",
})
  .validator((data) => ownerOpenApiDocumentPreflightInputSchema.parse(data))
  .handler(preflightOwnerOpenApiDocument);

export const preflightOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => preflightOwnerCapabilityInputSchema.parse(data))
  .handler(preflightOwnerCapability);

export const admitOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyAdmissionInputSchema.parse(data))
  .handler(admitOwnerCapability);

export const runOwnerSupplyReadinessServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyActionInputSchema.parse(data))
  .handler(runOwnerSupplyReadiness);

export const runOwnerSupplyTestServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyActionInputSchema.parse(data))
  .handler(runOwnerSupplyTest);

export const readOwnerSellerCanaryStatusServer = createServerFn()
  .validator((data) => ownerSellerCanaryStatusInputSchema.parse(data))
  .handler(readOwnerSellerCanaryStatus);

export const promoteOwnerSellerCanaryServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSellerCanaryPromotionInputSchema.parse(data))
  .handler(promoteOwnerSellerCanary);

export const recheckOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyMaintenanceInputSchema.parse(data))
  .handler(recheckOwnerCapability);

export const withdrawOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyMaintenanceInputSchema.parse(data))
  .handler(withdrawOwnerCapability);

export const republishOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyMaintenanceInputSchema.parse(data))
  .handler(republishOwnerCapability);
