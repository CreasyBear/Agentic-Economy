import { claimBusiness } from '@/modules/business/public'
import { publishBusinessCatalog } from '@/modules/catalog/public'
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
  const claim = claimBusiness(state, {
    actor: {
      kind: 'authenticated_owner',
      clerkUserId: `owner:${input.requestedSlug}`,
      displayName: input.businessName,
    },
    facts: {
      name: input.businessName,
      category: 'Heat pump repair',
      businessContext: {
        kind: 'local_human',
        suburb: input.suburb,
        stateTerritory: 'WA',
      },
      requestedSlug: input.requestedSlug,
      ownerMessage: 'Owner supplied durable source facts.',
      sourceRefs: [
        {
          label: `${input.businessName} service card`,
          evidenceRef: `private:evidence:${input.requestedSlug}`,
          sourceHash: canonicalDigest(`source:${input.requestedSlug}`),
        },
      ],
    },
    security: {
      csrf: matchingCsrf('claim'),
    },
    operationKey: operationKey(input.idPrefix, `claim:${input.requestedSlug}`),
    correlationId: correlationId(input.idPrefix, `claim:${input.requestedSlug}`),
    now: 10_000,
  })

  if (claim.kind === 'error') {
    throw new Error(`Expected durable claim fixture to publish: ${claim.reason}`)
  }

  const publish = publishBusinessCatalog(state, {
    actor: {
      kind: 'authenticated_owner',
      clerkUserId: `owner:${input.requestedSlug}`,
      displayName: input.businessName,
    },
    claimId: claim.claim.claimId,
    services: [
      {
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
      },
    ],
    security: { csrf: matchingCsrf('publish') },
    operationKey: operationKey(input.idPrefix, `publish:${input.requestedSlug}`),
    correlationId: correlationId(input.idPrefix, `publish:${input.requestedSlug}`),
    now: 11_000,
  })

  if (publish.kind === 'error') {
    throw new Error(`Expected durable publish fixture to publish: ${publish.reason}`)
  }

  return state
}


export function matchingCsrf(key: string) {
  return {
    csrfToken: `csrf-${key}`,
    csrfCookie: `csrf-${key}`,
    allowedOrigins: ['https://ae.example'],
  }
}

export function operationKey(prefix: string, value: string) {
  return brandNonEmpty(`op:${prefix}:${value}`, 'OperationKey')
}

export function correlationId(prefix: string, value: string) {
  return brandNonEmpty(`corr:${prefix}:${value}`, 'CorrelationId')
}
