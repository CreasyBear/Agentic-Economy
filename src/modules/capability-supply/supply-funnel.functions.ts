import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import {
  connectOwnerX402,
  connectOwnerX402InputSchema,
  checkOwnerX402,
  checkOwnerX402InputSchema,
  inspectOwnerX402,
  inspectOwnerX402InputSchema,
  ownerConnectionCommandSchema,
  readOwnerProviderConnections,
  readOwnerProviderEarnings,
  reconnectOwnerProviderConnection,
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
import {
  ownerSourcePreviewInputSchema,
  ownerSourceConnectionInputSchema,
  ownerSourceDraftInputSchema,
  ownerSourcePublishInputSchema,
  previewOwnerSupplySource,
  startOwnerSupplySourceConnection,
  resumeOwnerSupplySourceDraft,
  saveOwnerSupplySourceDraft,
  publishOwnerSupplySource,
} from './internal/supply-funnel/source-first-owner'
import {
  completeOwnerMcpProviderConnection,
  completeOwnerMcpProviderConnectionInputSchema,
  completeOwnerHttpProviderConnection,
  completeOwnerHttpProviderConnectionInputSchema,
  ownerProviderConnectionAttemptInputSchema,
  readOwnerProviderConnectionAttempt,
  startOwnerMcpProviderConnection,
  startOwnerMcpProviderConnectionInputSchema,
} from './internal/supply-funnel/provider-connection-handoff'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'

export type {
  OwnerProviderConnectionAttemptReadback,
} from './internal/supply-funnel/provider-connection-handoff'
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

export {
  filterOwnerSupplyAuthorityOptions,
  readOwnerProviderConnections,
  readOwnerProviderEarnings,
} from "./internal/supply-funnel/connections";
export { checkOwnerX402, connectOwnerX402, inspectOwnerX402 } from "./internal/supply-funnel/connections";
export { readOwnerSupplyFunnel } from "./internal/supply-funnel/funnel-owner";
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

export const readOwnerProviderConnectionAttemptServer = createServerFn()
  .validator((data) => ownerProviderConnectionAttemptInputSchema.parse(data))
  .handler(async (input) => {
    setResponseHeader('cache-control', 'no-store')
    return await readOwnerProviderConnectionAttempt(input)
  })

export const completeOwnerHttpProviderConnectionServer = createServerFn({ method: 'POST' })
  .validator((data) => completeOwnerHttpProviderConnectionInputSchema.parse(data))
  .handler(async (input) => {
    setResponseHeader('cache-control', 'no-store')
    return await completeOwnerHttpProviderConnection(input)
  })

export const startOwnerMcpProviderConnectionServer = createServerFn({ method: 'POST' })
  .validator((data) => startOwnerMcpProviderConnectionInputSchema
    .omit({ callbackUrl: true })
    .parse(data))
  .handler(async (input) => {
    setResponseHeader('cache-control', 'no-store')
    const baseUrl = resolveCanonicalBaseUrl(getRequest()).baseUrl
    const callback = new URL('/owner/supply/connections/oauth/callback', baseUrl)
    callback.searchParams.set('attempt', input.data.attemptRef)
    return await startOwnerMcpProviderConnection({
      ...input,
      data: { ...input.data, callbackUrl: callback.toString() },
    })
  })

export const completeOwnerMcpProviderConnectionServer = createServerFn({ method: 'POST' })
  .validator((data) => completeOwnerMcpProviderConnectionInputSchema.parse(data))
  .handler(async (input) => {
    setResponseHeader('cache-control', 'no-store')
    return await completeOwnerMcpProviderConnection(input)
  })

export const connectOwnerX402Server = createServerFn({ method: "POST" })
  .validator((data) => connectOwnerX402InputSchema.parse(data))
  .handler(connectOwnerX402);

export const inspectOwnerX402Server = createServerFn({ method: "POST" })
  .validator((data) => inspectOwnerX402InputSchema.parse(data))
  .handler(inspectOwnerX402);

export const checkOwnerX402Server = createServerFn({ method: "POST" })
  .validator((data) => checkOwnerX402InputSchema.parse(data))
  .handler(checkOwnerX402);

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

export const readOwnerProviderEarningsServer = createServerFn().handler(
  readOwnerProviderEarnings,
);

export const previewOwnerSupplySourceServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerSourcePreviewInputSchema.parse(data))
  .handler(previewOwnerSupplySource)

export const startOwnerSupplySourceConnectionServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerSourceConnectionInputSchema.parse(data))
  .handler(startOwnerSupplySourceConnection)

export const resumeOwnerSupplySourceDraftServer = createServerFn()
  .validator((data) => z.strictObject({
    businessId: z.string().trim().min(1),
    connectionRef: z.string().trim().min(1).max(300).optional(),
  }).parse(data))
  .handler(resumeOwnerSupplySourceDraft)

export const saveOwnerSupplySourceDraftServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerSourceDraftInputSchema.parse(data))
  .handler(saveOwnerSupplySourceDraft)

export const publishOwnerSupplySourceServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerSourcePublishInputSchema.parse(data))
  .handler(publishOwnerSupplySource)

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
