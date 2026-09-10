import { createServerFn } from '@tanstack/react-start'
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
} from './internal/supply-funnel/connections'
import {
  recheckOwnerCapability,
  republishOwnerCapability,
  ownerSupplyMaintenanceInputSchema,
  withdrawOwnerCapability,
} from './internal/supply-funnel/funnel-owner'
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
} from './source-first-owner'
import {
  cancelOwnerProviderConnectionAttemptInputSchema,
  completeOwnerMcpProviderConnectionInputSchema,
  completeOwnerHttpProviderConnectionInputSchema,
  ownerProviderConnectionAttemptInputSchema,
  startOwnerMcpProviderConnectionInputSchema,
} from './internal/supply-funnel/provider-connection-handoff-contract'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { package5RolloutDecision } from '@/lib/server/package5-rollout'

export type { OwnerProviderConnectionAttemptReadback } from './internal/supply-funnel/provider-connection-handoff-contract'
export type {
  OwnerProviderConnection,
  OwnerProviderConnectionCommandResult,
} from './internal/supply-funnel/connections'
export type {
  OwnerProviderEarningsAccountReadback,
  OwnerProviderEarningsReadback,
} from './internal/supply-funnel/earnings-readback'
export type { SupplyLandingPorts, SupplyLandingReadback, SupplyLandingTool } from './internal/supply-funnel/landing'
export type { PricingStepResult } from './internal/supply-funnel/pricing-port'
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
} from './internal/supply-funnel/types'

export {
  filterOwnerSupplyAuthorityOptions,
  readOwnerProviderConnections,
  readOwnerProviderEarnings,
} from './internal/supply-funnel/connections'
export { checkOwnerX402, connectOwnerX402, inspectOwnerX402 } from './internal/supply-funnel/connections'
export { loadSupplyLandingReadback } from './internal/supply-funnel/landing'
export { ownerSupplyActionContext } from './internal/supply-funnel/types'

export const readOwnerProviderConnectionsServer = createServerFn().handler(readOwnerProviderConnections)

export const readOwnerProviderConnectionAttemptServer = createServerFn()
  .validator((data) => ownerProviderConnectionAttemptInputSchema.parse(data))
  .handler(async (input) => {
    setResponseHeader('cache-control', 'no-store')
    const { readOwnerProviderConnectionAttempt } = await import('./internal/supply-funnel/provider-connection-handoff')
    return await readOwnerProviderConnectionAttempt(input)
  })

export const completeOwnerHttpProviderConnectionServer = createServerFn({
  method: 'POST',
})
  .validator((data) => completeOwnerHttpProviderConnectionInputSchema.parse(data))
  .handler(async (input) => {
    setResponseHeader('cache-control', 'no-store')
    const { completeOwnerHttpProviderConnection } = await import('./internal/supply-funnel/provider-connection-handoff')
    return await completeOwnerHttpProviderConnection(input)
  })

export const cancelOwnerProviderConnectionAttemptServer = createServerFn({ method: 'POST' })
  .validator((data) => cancelOwnerProviderConnectionAttemptInputSchema.parse(data))
  .handler(async (input) => {
    setResponseHeader('cache-control', 'no-store')
    const { cancelOwnerProviderConnectionAttempt } = await import('./internal/supply-funnel/provider-connection-handoff')
    return await cancelOwnerProviderConnectionAttempt(input)
  })

export const startOwnerMcpProviderConnectionServer = createServerFn({
  method: 'POST',
})
  .validator((data) => startOwnerMcpProviderConnectionInputSchema.omit({ callbackUrl: true }).parse(data))
  .handler(async (input) => {
    setResponseHeader('cache-control', 'no-store')
    const { startOwnerMcpProviderConnection } = await import('./internal/supply-funnel/provider-connection-handoff')
    const baseUrl = resolveCanonicalBaseUrl(getRequest()).baseUrl
    const callback = new URL('/owner/supply/connections/oauth/callback', baseUrl)
    callback.searchParams.set('attempt', input.data.attemptRef)
    return await startOwnerMcpProviderConnection({
      ...input,
      data: { ...input.data, callbackUrl: callback.toString() },
    })
  })

export const completeOwnerMcpProviderConnectionServer = createServerFn({
  method: 'POST',
})
  .validator((data) => completeOwnerMcpProviderConnectionInputSchema.parse(data))
  .handler(async (input) => {
    setResponseHeader('cache-control', 'no-store')
    const { completeOwnerMcpProviderConnection } = await import('./internal/supply-funnel/provider-connection-handoff')
    return await completeOwnerMcpProviderConnection(input)
  })

export const connectOwnerX402Server = createServerFn({ method: 'POST' })
  .validator((data) => connectOwnerX402InputSchema.parse(data))
  .handler(connectOwnerX402)

export const inspectOwnerX402Server = createServerFn({ method: 'POST' })
  .validator((data) => inspectOwnerX402InputSchema.parse(data))
  .handler(inspectOwnerX402)

export const checkOwnerX402Server = createServerFn({ method: 'POST' })
  .validator((data) => checkOwnerX402InputSchema.parse(data))
  .handler(checkOwnerX402)

export const reconnectOwnerProviderConnectionServer = createServerFn({
  method: 'POST',
})
  .validator((data) => ownerConnectionCommandSchema.parse(data))
  .handler(reconnectOwnerProviderConnection)

export const revokeOwnerProviderConnectionServer = createServerFn({
  method: 'POST',
})
  .validator((data) => ownerConnectionCommandSchema.parse(data))
  .handler(revokeOwnerProviderConnection)

export const readOwnerProviderEarningsServer = createServerFn().handler(readOwnerProviderEarnings)

export const previewOwnerSupplySourceServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerSourcePreviewInputSchema.parse(data))
  .handler(previewOwnerSupplySource)

export const startOwnerSupplySourceConnectionServer = createServerFn({
  method: 'POST',
})
  .validator((data) => ownerSourceConnectionInputSchema.parse(data))
  .handler(async (input) => input.data.source.kind === 'x402' || package5RolloutDecision('httpCredentials').enabled
    ? await startOwnerSupplySourceConnection(input)
    : disabledProviderConnectionPreview())

export const resumeOwnerSupplySourceDraftServer = createServerFn()
  .validator((data) =>
    z
      .strictObject({
        businessId: z.string().trim().min(1),
        draftRef: z.string().trim().min(1).max(300),
        connectionRef: z.string().trim().min(1).max(300).optional(),
        environment: z.enum(['sandbox', 'production']).optional(),
      })
      .parse(data),
  )
  .handler(resumeOwnerSupplySourceDraft)

export const saveOwnerSupplySourceDraftServer = createServerFn({
  method: 'POST',
})
  .validator((data) => ownerSourceDraftInputSchema.parse(data))
  .handler(saveOwnerSupplySourceDraft)

export const publishOwnerSupplySourceServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerSourcePublishInputSchema.parse(data))
  .handler(publishOwnerSupplySource)

export const recheckOwnerCapabilityServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerSupplyMaintenanceInputSchema.parse(data))
  .handler(recheckOwnerCapability)

export const withdrawOwnerCapabilityServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerSupplyMaintenanceInputSchema.parse(data))
  .handler(withdrawOwnerCapability)

export const republishOwnerCapabilityServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerSupplyMaintenanceInputSchema.parse(data))
  .handler(republishOwnerCapability)

function disabledProviderConnectionPreview() {
  return {
    kind: 'action_required' as const,
    requiredAction: {
      action: 'supply.source.preview' as const,
      blockedCapabilities: ['supply.publish'] as const,
      cta: '/owner/offerings',
      ctaLabel: 'Return to Tools',
      description: 'Provider connections are not enabled for this deployment.',
      iconUrl: null,
      status: 'required' as const,
      title: 'Provider connections unavailable',
    },
  }
}
