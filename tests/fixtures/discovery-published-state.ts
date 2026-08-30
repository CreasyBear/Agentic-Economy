import { reconcilePublishedOfferings, validateServiceCatalogInput } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import { emptyDiscoverySourceState } from './source-state'

export function createDurablePublishedDiscoveryState(input: {
  businessName: string
  requestedSlug: string
  serviceName: string
  serviceQuery: string
  suburb: string
  idPrefix: string
}): DiscoverySourceState {
  const state = emptyDiscoverySourceState()
  const owningAccountRef = `account:test-owner:${input.requestedSlug}`
  const businessId = brandNonEmpty(`business:${input.requestedSlug}`, 'BusinessId')
  const slug = brandNonEmpty(input.requestedSlug, 'Slug')
  const businessContext = { kind: 'local_human' as const, suburb: input.suburb, stateTerritory: 'WA' }
  const sourceHash = canonicalDigest({ input, businessContext })
  state.businesses.push({
    businessId,
    slug,
    name: input.businessName,
    normalizedName: input.businessName.toLowerCase(),
    category: 'Heat pump repair',
    businessContext,
    publicStatus: 'published',
    trustTier: 'claimed',
    sourceHash,
    createdAt: 10_000,
    updatedAt: 11_000,
  })
  state.businessContexts.push({
    businessId,
    category: 'Heat pump repair',
    businessContext,
    ownerMessage: 'Owner supplied durable source facts.',
    sourceRefs: [{
      label: `${input.businessName} service card`,
      evidenceRef: `private:evidence:${input.requestedSlug}`,
      sourceHash,
    }],
    sourceHash,
    approvedAt: 10_000,
  })

  const services = validateServiceCatalogInput([{
    name: input.serviceName,
    category: 'Heat pump repair',
    summary: `${input.serviceName} for ${input.suburb} homes.`,
    serviceArea: `${input.serviceQuery} and nearby suburbs`,
    hoursOrUnknown: 'Weekdays by appointment',
    firstRequest: {
      mode: 'not_available_yet',
      publicChannel: 'not_available',
      publicDisclosure: 'This business has not published a request path.',
      noContactReason: 'Owner has not supplied public contact instructions.',
    },
  }])
  if (services.kind === 'invalid') throw new Error(`Invalid discovery fixture: ${services.reason}`)
  const reconciled = reconcilePublishedOfferings({
    offerings: [],
    revisions: [],
    accessPaths: [],
    operations: [],
  }, {
    businessId,
    authority: { actorRef: owningAccountRef, ownerRef: owningAccountRef, businessOwnerRef: owningAccountRef },
    services: services.services,
    operationKey: `op:${input.idPrefix}:publish`,
    now: 11_000,
  })
  if (reconciled.kind === 'error') throw new Error(`Discovery fixture publish failed: ${reconciled.reason}`)
  state.offerings.push(...reconciled.state.offerings)
  state.revisions.push(...reconciled.state.revisions)
  state.accessPaths.push(...reconciled.state.accessPaths)
  return state
}
