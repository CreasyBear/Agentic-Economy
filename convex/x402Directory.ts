"use node"

import { v } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { admitFacilitatorDiscoveryItems, inspectX402SellerEndpoint } from '@/modules/capability-supply/server'
import { projectX402DirectoryEntry } from '@/modules/market/x402-directory-projection'
import { readX402DirectoryRawPage } from '@/modules/market/x402-directory-source.server'
import { x402DirectoryResolveInputSchema, type X402DirectoryResolution, type X402DirectoryResolutionReason } from '@/modules/market/x402-directory'
import { directoryEntryMatchesFilters } from '@/modules/market/x402-directory-index'
import { directoryNetwork } from '@/modules/market/x402-directory-index'
import { parseCallableRef } from '@/modules/common/tool-ref'
import { deploymentPaymentEnvironment, type PaymentEnvironment } from '@/lib/deployment/environment'
import { x402PaymentProfileForEnvironment } from '@/modules/capability-supply/convex'
import { api, internal } from './_generated/api'
import { env, internalAction } from './_generated/server'
import { reconcileReadyItems } from './lib/capabilitySupply/facilitatorDiscovery/readyItems'
import { bindWorkloadCronActionContext } from './lib/platform/workloadCron/consequence'


function boundedResolutionReason(reason: string): X402DirectoryResolutionReason {
  switch (reason) {
    case 'query_invalid':
    case 'resource_filters_mismatch':
    case 'resource_not_found':
    case 'resource_not_payable':
    case 'source_unavailable':
    case 'admission_unavailable':
    case 'tool_unavailable':
    case 'bazaar_discovery_invalid':
    case 'schema_missing':
    case 'transport_unsupported':
    case 'scheme_unsupported':
    case 'chain_unsupported':
    case 'asset_unsupported':
    case 'amount_invalid':
    case 'payment_terms_invalid':
    case 'resource_invalid':
    case 'source_invalid':
      return reason
    default:
      return 'source_unavailable'
  }
}

/**
 * An https URL no directory lists is admitted from its own unpaid 402, read through the SSRF
 * guard (public target, no redirects) with an unpaid GET. Only Quote reaches this, and only for
 * a caller whose signed agent-key admission verified.
 */
async function liveResource(url: string, environment: PaymentEnvironment): Promise<Readonly<{ kind: 'found'; item: unknown }> | Extract<X402DirectoryResolution, { kind: 'unavailable' }>> {
  const observation = await inspectX402SellerEndpoint({ endpointUrl: url, method: 'GET', aeEnvironment: environment })
  if (observation.kind === 'refused') return { kind: 'unavailable', reason: liveRefusalReason(observation.reason) }
  return { kind: 'found', item: JSON.parse(observation.paymentRequiredJson) as unknown }
}

function liveRefusalReason(reason: Extract<Awaited<ReturnType<typeof inspectX402SellerEndpoint>>, { kind: 'refused' }>['reason']): X402DirectoryResolutionReason {
  switch (reason) {
    case 'request_failed': return 'source_unavailable'
    case 'payment_not_required': return 'resource_not_payable'
    case 'challenge_conflict': case 'challenge_missing': case 'challenge_too_large': case 'challenge_malformed': case 'challenge_resource_mismatch': return 'payment_terms_invalid'
    case 'target_invalid': case 'target_not_public': case 'request_invalid': case 'redirect_refused': return 'resource_invalid'
  }
}

/**
 * Resolve a directory resource, named by URL or `registry:<hex>` listing id, to the Tool Quote
 * keys on. Internal: Quote is the only caller and gates it on a signed agent-key admission.
 */
export const resolve = internalAction({
  args: { resource: v.string(), query: v.optional(v.string()), offset: v.optional(v.number()), network: v.optional(v.string()), provider: v.optional(v.string()), maxUsdPrice: v.optional(v.number()) },
  returns: v.union(v.object({ kind: v.literal('ready'), toolRef: v.string() }), v.object({ kind: v.literal('unavailable'), reason: v.string() })),
  handler: async (ctx, args): Promise<X402DirectoryResolution> => {
    const parsed = x402DirectoryResolveInputSchema.safeParse(args)
    if (!parsed.success) return { kind: 'unavailable', reason: 'query_invalid' }
    const environment = deploymentPaymentEnvironment(env)
    const network = x402PaymentProfileForEnvironment(environment)?.network
    if (environment === undefined || network === undefined) return { kind: 'unavailable', reason: 'source_unavailable' }
    if (parsed.data.network !== undefined && directoryNetwork(parsed.data.network) !== network) {
      return { kind: 'unavailable', reason: 'resource_filters_mismatch' }
    }
    const { resource: ref, ...context } = parsed.data
    let resource = ref
    const callable = parseCallableRef(ref)
    if (callable?.kind === 'listing') {
      const listing = await ctx.runQuery(api.x402DirectoryIndex.detailById, { id: ref })
      if (listing.kind === 'not_found') return { kind: 'unavailable', reason: 'resource_not_found' }
      if (listing.kind !== 'found') return { kind: 'unavailable', reason: 'source_unavailable' }
      resource = listing.item.entry.resource
    }
    const indexed = await ctx.runQuery(internal.x402DirectoryIndex.selectedSource, {
      resource, ...(context.network === undefined ? {} : { network: context.network }),
      ...(context.provider === undefined ? {} : { provider: context.provider }),
      ...(context.maxUsdPrice === undefined ? {} : { maxUsdPrice: context.maxUsdPrice }),
    })
    let selected: unknown
    if (indexed.kind === 'found') {
      selected = JSON.parse(indexed.sourceJson) as unknown
    }
    else if (indexed.kind === 'not_found') {
      if (callable?.kind !== 'url') return { kind: 'unavailable', reason: 'resource_not_found' }
      const live = await liveResource(ref, environment)
      if (live.kind === 'unavailable') return live
      selected = live.item
    }
    else if (indexed.reason !== 'index_unavailable') {
      return { kind: 'unavailable', reason: boundedResolutionReason(indexed.reason) }
    }
    else {
      const page = await readX402DirectoryRawPage(context)
      if (page.kind === 'unavailable') return page
      const candidate = page.items.find(item => item.resource === resource)
      if (candidate === undefined) {
        if (callable?.kind !== 'url') return { kind: 'unavailable', reason: 'resource_not_found' }
        const live = await liveResource(ref, environment)
        if (live.kind === 'unavailable') return live
        selected = live.item
      } else {
        const candidateEntry = projectX402DirectoryEntry(candidate)
        if (!directoryEntryMatchesFilters(candidateEntry, { ...context, network })) return { kind: 'unavailable', reason: 'resource_filters_mismatch' }
        selected = candidate
      }
    }
    try {
      const admission = await admitFacilitatorDiscoveryItems([selected])
      if (admission.admitted.length === 0) return { kind: 'unavailable', reason: admission.skipped[0]?.reason ?? 'admission_unavailable' }
      const workload = await ctx.runQuery(internal.workloadCron.admit, { name: 'refresh facilitator discovery' })
      const authorized = bindWorkloadCronActionContext(ctx, { name: 'refresh facilitator discovery', snapshot: workload })
      const result = await authorized.runMutation(internal.facilitatorDiscovery.reconcile, { items: [...structuredClone(reconcileReadyItems(admission.admitted))], complete: false, deadlineAt: Date.now() + 10_000, workload })
      const toolRef = result.toolRefs[0]
      if (toolRef === undefined) return { kind: 'unavailable', reason: 'admission_unavailable' }
      const detail = await ctx.runQuery(api.capabilitySupplyTools.detail, { toolRef })
      return detail.kind === 'found' ? { kind: 'ready', toolRef } : { kind: 'unavailable', reason: 'tool_unavailable' }
    } catch (cause) {
      return degradeBackend(cause, { kind: 'unavailable', reason: 'admission_unavailable' }, { site: 'resolve', reason: 'source_unavailable' })
    }
  },
})
