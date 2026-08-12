import { LOCAL_E2E_BUSINESS_FIXTURES } from './local-e2e-business-fixtures'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import { brandNonEmpty, type BusinessId, type OfferingRef } from '../../src/modules/common/ids'
import { matchingCsrf } from '../../src/modules/common/matching-csrf'
import { claimBusiness } from '../../src/modules/business/public'
import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  resolvePublishedInquiryTarget,
  searchPublicBusinessOfferingSupply,
  createDefaultRegistrySourceState,
  type RegistrySourceState,
} from '../../src/modules/registry/public'
import {
  setPublicRegistrySourcePortForTests,
  type PublicRegistrySourcePort,
} from '../../src/modules/registry/registry.functions'
import { createPublicSourceTransport, setPublicSourceTransportForTests } from '../../src/lib/server/convex-source'
import { isRecord } from '../../src/modules/common/is-record'
import { createLocalE2eInquiryServerBackend } from './inquiry-local-e2e-adapter'

export function createLocalE2eRegistrySourceState(): RegistrySourceState {
  const state = createDefaultRegistrySourceState()

  for (const fixture of LOCAL_E2E_BUSINESS_FIXTURES) {
    const offering = fixture.offerings[0]
    if (offering === undefined) {
      throw new Error(`Local e2e fixture offering missing for ${fixture.requestedSlug}`)
    }
    const publishedAt = Date.now()
    const claim = claimBusiness(state, {
      actor: {
        kind: 'authenticated_owner',
        clerkUserId: `owner:${fixture.requestedSlug}`,
        displayName: `${fixture.businessName} Owner`,
      },
      facts: {
        name: fixture.businessName,
        category: fixture.category,
        businessContext: {
          kind: 'local_human',
          suburb: fixture.suburb,
          stateTerritory: fixture.stateTerritory,
          ...(fixture.publishedPhone === undefined ? {} : { publishedPhone: fixture.publishedPhone }),
        },
        requestedSlug: fixture.requestedSlug,
        ...(fixture.responseTimeMinutes === undefined ? {} : { responseTimeMinutes: fixture.responseTimeMinutes }),
        ownerMessage: 'Local e2e owner-supplied Offering facts.',
        sourceRefs: [{
          label: 'Local e2e Offering facts',
          evidenceRef: `private:evidence:${fixture.requestedSlug}`,
          sourceHash: canonicalDigest(`source:${fixture.requestedSlug}`),
        }],
      },
      security: { csrf: matchingCsrf(`local-e2e-claim:${fixture.requestedSlug}`) },
      operationKey: brandNonEmpty(`op:registry-default:local-e2e-claim:${fixture.requestedSlug}`, 'OperationKey'),
      correlationId: brandNonEmpty(`corr:registry-default:local-e2e-claim:${fixture.requestedSlug}`, 'CorrelationId'),
      now: publishedAt - 1,
    })
    if (claim.kind === 'error') {
      throw new Error(`Local e2e registry claim failed for ${fixture.requestedSlug}: ${claim.reason}`)
    }

    claim.business.publicStatus = 'published'
    claim.business.claimStatus = 'published'
    claim.business.updatedAt = publishedAt
    claim.claim.status = 'published'
    claim.claim.updatedAt = publishedAt

    const offeringSlug = offering.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    appendPublishedOffering(state, {
      businessId: claim.business.businessId,
      offeringRef: brandNonEmpty(`offering:${fixture.requestedSlug}:${offeringSlug}`, 'OfferingRef'),
      facts: {
        name: offering.name,
        category: offering.category,
        summary: offering.summary,
        serviceAreaSummary: offering.serviceAreaSummary,
        ...(offering.availabilitySummary === undefined ? {} : { availabilitySummary: offering.availabilitySummary }),
        ...(offering.pricingSummary === undefined ? {} : { pricingSummary: offering.pricingSummary }),
      },
      accessPaths: offering.accessPaths,
      now: publishedAt,
    })
  }

  return state

}

/** Builds a source port from the real local-e2e registry projection. */
export function createLocalE2eRegistrySourcePort(): PublicRegistrySourcePort {
  const state = createLocalE2eRegistrySourceState()
  return {
    list: (input) => Promise.resolve(listPublicBusinessOfferingSupply(state, input)),
    search: (input) => Promise.resolve(searchPublicBusinessOfferingSupply(state, input)),
    detail: (input) => Promise.resolve(getPublicBusinessOfferingSupplyBySlug(state, input)),
    resolveInquiryTarget: (input) => Promise.resolve(resolvePublishedInquiryTarget(state, input)),
  }
}

/** Builds the explicit local public-source transport used by route tests. */
export function createLocalE2ePublicSourceTransport(
  registry: PublicRegistrySourcePort = createLocalE2eRegistrySourcePort(),
) {
  const inquiry = createLocalE2eInquiryServerBackend()
  return createPublicSourceTransport({
    env: { CONVEX_URL: 'http://local-registry-source.test' },
    fetch: async (_input, init) => {
      const payload: unknown = JSON.parse(String(init?.body ?? '{}'))
      if (
        !isRecord(payload)
        || typeof payload.path !== 'string'
        || !Array.isArray(payload.args)
        || !isRecord(payload.args[0])
      ) {
        throw new Error('local_registry_source_request_invalid')
      }
      const args = payload.args[0]
      switch (payload.path) {
        case 'registry:listPublicBusinessOfferingSupply':
          return sourceSuccess(await registry.list(
            args as Parameters<PublicRegistrySourcePort['list']>[0],
          ))
        case 'registry:searchPublicBusinessOfferingSupply':
          return sourceSuccess(await registry.search(
            args as Parameters<PublicRegistrySourcePort['search']>[0],
          ))
        case 'registry:getPublicBusinessOfferingSupplyBySlug':
          return sourceSuccess(await registry.detail(
            args as Parameters<PublicRegistrySourcePort['detail']>[0],
          ))
        case 'registry:resolvePublishedInquiryTargetBySlug':
          return sourceSuccess(await registry.resolveInquiryTarget(
            args as Parameters<PublicRegistrySourcePort['resolveInquiryTarget']>[0],
          ))
        case 'inquiries:readPublicTargetAdmission': {
          if (typeof args.businessId !== 'string' || typeof args.offeringRef !== 'string') {
            throw new Error('local_registry_source_inquiry_target_invalid')
          }
          const result = inquiry.readPublicTargetAdmission({
            businessId: args.businessId,
            offeringRef: args.offeringRef,
          })
          if (result.kind !== 'ok') {
            throw new Error(`local_registry_source_inquiry_unavailable:${result.code}`)
          }
          return sourceSuccess(result.admission)
        }
        case 'capabilitySupplyOperations:offeringOperationMap':
          return sourceSuccess([])
        default:
          throw new Error(`local_registry_source_function_unconfigured:${payload.path}`)
      }
    },
  })
}

export function installLocalE2eRegistrySourceForTests(): () => void {
  const registry = createLocalE2eRegistrySourcePort()
  const restoreRegistry = setPublicRegistrySourcePortForTests(registry)
  const restoreTransport = setPublicSourceTransportForTests(
    createLocalE2ePublicSourceTransport(registry),
  )
  return () => {
    restoreTransport()
    restoreRegistry()
  }
}

function sourceSuccess(value: unknown): Response {
  return Response.json({ status: 'success', value })
}

function appendPublishedOffering(
  state: RegistrySourceState,
  input: {
    businessId: BusinessId
    offeringRef: OfferingRef
    facts: {
      name: string
      category: string
      summary: string
      serviceAreaSummary?: string
      availabilitySummary?: string
      pricingSummary?: string
    }
    accessPaths?: readonly {
      channel: 'phone' | 'website' | 'ae_inquiry'
      disclosure: string
    }[]
    now: number
  },
): void {
  const sourceHash = canonicalDigest({
    businessId: input.businessId,
    offeringRef: input.offeringRef,
    revision: 1,
    ...input.facts,
  })
  state.offerings.push({
    offeringRef: input.offeringRef,
    businessId: input.businessId,
    currentRevision: 1,
    status: 'published',
    createdAt: input.now,
    updatedAt: input.now,
  })
  state.revisions.push({
    offeringRef: input.offeringRef,
    businessId: input.businessId,
    revision: 1,
    ...input.facts,
    sourceHash,
    createdAt: input.now,
  })
  for (const [index, accessPath] of (input.accessPaths ?? []).entries()) {
    const descriptor = {
      kind: 'human_request' as const,
      channel: accessPath.channel,
      disclosure: accessPath.disclosure,
    }
    const accessPathRef = `access:${input.offeringRef}:human:${index + 1}`
    state.accessPaths.push({
      accessPathRef: brandNonEmpty(accessPathRef, 'AccessPathRef'),
      businessId: input.businessId,
      offeringRef: input.offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
      status: 'published',
      descriptor,
      sourceHash: canonicalDigest({ accessPathRef, offeringSourceHash: sourceHash, descriptor }),
      createdAt: input.now,
      updatedAt: input.now,
    })
  }
}
