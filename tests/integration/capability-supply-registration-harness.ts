import type { FunctionArgs } from 'convex/server'

import { api, internal } from '../../convex/_generated/api'
import {
  rebuildCapabilityOriginSupplyProjection,
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
  quarantineCapabilityBindingCommand,
  setCapabilitySupplyEligibilityCommand,
} from '../../convex/capabilitySupply'
import type { Id } from '../../convex/_generated/dataModel'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import {
  type listIntegratedCapabilitySupply,
  type CapabilityOfferingRegistration,
  type CapabilityTransportAuthority,
  type CapabilityTransportBindingRegistration,
  type EligibilityInput,
  type RegistrationContext,
} from '@/modules/capability-supply/public'
import {
  prepareCapabilityPublicationMutation,
  type ConvexFixtureAdmin,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'

type PublishPreparedCapabilityArgs = FunctionArgs<typeof api.capabilitySupply.publishPreparedCapability>
type PublicationFixtureInput = Parameters<typeof prepareCapabilityPublicationMutation>[1]

export async function preparedPublicationArgs(
  backend: ConvexFixtureBackend,
  input: PublicationFixtureInput,
): Promise<PublishPreparedCapabilityArgs> {
  return await withSourceWrite('catalog_publish', await prepareCapabilityPublicationMutation(backend, input))
}

type IntegratedSupply = Extract<Awaited<ReturnType<typeof listIntegratedCapabilitySupply>>, { kind: 'available' }>['supplies'][number]
export type IntegratedSupplyBinding = Pick<IntegratedSupply, 'binding'>

export function missingRef() {
  return { capabilityId: 'reference.lookup', version: 1, contractDigest: `sha256:${'0'.repeat(64)}` }
}

export function offeringRegistration(businessId: Id<'businesses'>, contractRef: ReturnType<typeof missingRef>) {
  return {
    offeringId: 'offering:supply-one:lookup',
    businessId,
    networkId: 'ae:public',
    contractRef,
    origin: {
      kind: 'catalog_offering' as const,
      offeringRef: `catalog-offering:${String(businessId)}`,
      offeringRevision: 1,
      offeringSourceHash: `catalog-source:${String(businessId)}`,
    },
    presentation: {
      label: 'Reference lookup', summary: 'A registered capability offering.',
      price: { kind: 'fixed' as const, amount: { currency: 'AUD', units: '1200', exponent: 2 } },
      materialTerms: [{ termId: 'delivery', label: 'Delivery', value: 'One structured response' }],
      commercialRelationship: {
        kind: 'none' as const, summary: 'No commercial influence.',
        influencesEligibility: false, influencesInclusion: false, influencesOrder: false,
        evidenceRefs: ['business:no-commercial-influence'],
      },
    },
    searchTerms: ['reference', 'lookup'], registrationEvidenceRefs: ['business:published-registration'],
  } satisfies CapabilityOfferingRegistration
}

export function providerAuthority(name: string): CapabilityTransportAuthority {
  return {
    kind: 'provider_connection',
    connectionRef: `connection:ae-supply:${name}`,
    providerRef: `provider:ae-supply:${name}`,
  }
}

export function bindingRegistration(contractRef: ReturnType<typeof missingRef>) {
  return {
    bindingId: 'binding:supply-one:http', offeringId: 'offering:supply-one:lookup', networkId: 'ae:public', contractRef,
    endpointUrl: 'https://example.test/capability', authority: providerAuthority('default'),
    continuation: { kind: 'single_response' as const, evidenceRefs: ['adapter:single-response'] },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: ['adapter:no-cancellation'] },
    adapter: { adapterId: 'http-json:v1', config: { method: 'POST' as const, requestTimeoutMs: 5_000 } },
    registrationEvidenceRefs: ['adapter:production-registration'],
  } satisfies CapabilityTransportBindingRegistration
}

export async function publishAndObserveCapability(
  backend: ConvexFixtureBackend,
  owner: ConvexFixtureAdmin,
  businessId: Id<'businesses'>,
  offering: ReturnType<typeof offeringRegistration>,
  binding: ReturnType<typeof bindingRegistration>,
  suffix: string,
) {
  const origin = offering.origin
  if (origin === undefined || origin.kind !== 'catalog_offering') {
    throw new Error('registration_fixture_catalog_origin_missing')
  }
  const catalogOfferingRef = origin.offeringRef
  const catalogOfferingRevision = origin.offeringRevision
  const catalogSourceHash = origin.offeringSourceHash
  await backend.run(async (ctx) => {
    const existing = await ctx.db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', catalogOfferingRef)).unique()
    if (existing !== null) return
    await ctx.db.insert('businessOfferings', {
      offeringRef: catalogOfferingRef, businessId, currentRevision: catalogOfferingRevision,
      status: 'published', createdAt: 1, updatedAt: 1,
    })
    await ctx.db.insert('businessOfferingRevisions', {
      offeringRef: catalogOfferingRef, businessId, revision: catalogOfferingRevision,
      name: offering.presentation.label, category: 'Data', summary: offering.presentation.summary,
      sourceHash: catalogSourceHash, createdAt: 1,
    })
  })
  const input = {
    businessId,
    source: { kind: 'ae_envelope' as const, documentJson: JSON.stringify(capabilityContractV2()) },
    offering: {
      offeringId: offering.offeringId,
      networkId: offering.networkId,
      origin: offering.origin,
      presentation: offering.presentation,
      searchTerms: offering.searchTerms,
      registrationEvidenceRefs: offering.registrationEvidenceRefs,
    },
    binding: {
      bindingId: binding.bindingId,
      endpointUrl: binding.endpointUrl,
      authority: binding.authority,
      continuation: binding.continuation,
      cancellation: binding.cancellation,
      adapter: binding.adapter,
      registrationEvidenceRefs: binding.registrationEvidenceRefs,
    },
    ...operationContext(`publication:${suffix}`),
  }
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await preparedPublicationArgs(backend, input),
  )
  if ('reason' in published) throw new Error(`publication failed: ${published.reason}`)
  await backend.finishInProgressScheduledFunctions()
  const publications = await backend.run(async (ctx) => (
    await ctx.db.query('capabilityPublications').collect()
  ))
  for (const publication of publications) {
    await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
      publicationRef: publication.publicationRef,
      expectedRevision: publication.revision,
      credentialState: 'ready',
      healthState: 'healthy',
      evidenceRefs: ['test:capability-supply-readiness'],
      operationKey: `readiness:${publication.publicationRef}`,
      correlationId: `readiness:${publication.publicationRef}`,
      reasonCode: 'source_test_readiness',
      validUntil: Date.now() + 3_600_000,
    })
  }
  if (publications.length === 0) throw new Error('publication readiness missing')
  return published
}

export async function registerProviderConnection(
  admin: ConvexFixtureAdmin,
  businessId: Id<'businesses'>,
  binding: CapabilityTransportBindingRegistration,
) {
  if (binding.authority.kind !== 'provider_connection') return
  const suffix = binding.authority.connectionRef.split(':').at(-1) ?? 'default'
  const result = await admin.mutation(internal.capabilityProviderConnections.create, {
    commandId: `command:capability-supply:connection:${binding.authority.connectionRef}`,
    connectionRef: binding.authority.connectionRef,
    businessId,
    providerRef: binding.authority.providerRef,
    providerAccountRef: `account:ae-supply:${suffix}`,
    adapterId: binding.adapter.adapterId,
    credentialRef: `env:AE_SUPPLY_${suffix.toUpperCase()}_SECRET`,
    requestedScopes: ['capability:invoke'],
    grantedScopes: ['capability:invoke'],
    requestedResources: [`endpoint:${binding.endpointUrl}`],
    grantedResources: [`endpoint:${binding.endpointUrl}`],
    reasonCode: 'source_test_provider_connection',
    evidenceRefs: ['test:capability-supply-provider-connection'],
    now: Date.now(),
  })
  if (result.kind === 'refused') {
    throw new Error(`provider connection fixture failed: ${result.code}`)
  }
}

export function operationContext(suffix: string) {
  return {
    operationKey: `op:capability-supply:${suffix}`,
    correlationId: `corr:capability-supply:${suffix}`,
    reasonCode: 'source_test_registration',
    evidenceRefs: ['test:capability-supply'],
  }
}

type RegistrationCommandArgs = RegistrationContext & Readonly<{ registration: unknown }>
type EligibilityCommandArgs = EligibilityInput & RegistrationContext
type QuarantineCommandArgs = RegistrationContext & Readonly<{
  bindingId: string
  expectedObservedRowDigest: string
}>

export async function runOfferingRegistration(
  backend: ConvexFixtureBackend,
  args: RegistrationCommandArgs,
  actorRef = 'user_capability_supply_admin',
) {
  return await backend.run(async (ctx) => registerCapabilityOfferingCommand(ctx.db, {
    actor: { kind: 'admin', ref: actorRef },
    registration: args.registration,
    context: args,
  }, Date.now()))
}

export async function runBindingRegistration(
  backend: ConvexFixtureBackend,
  args: RegistrationCommandArgs,
  actorRef = 'user_capability_supply_admin',
) {
  return await backend.run(async (ctx) => registerCapabilityBindingCommand(ctx.db, {
    actor: { kind: 'admin', ref: actorRef },
    registration: args.registration,
    context: args,
  }, Date.now()))
}

export async function runEligibility(
  backend: ConvexFixtureBackend,
  args: EligibilityCommandArgs,
  actorRef = 'user_capability_supply_admin',
) {
  return await backend.run(async (ctx) => {
    const now = Date.now()
    const result = await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'admin', ref: actorRef },
      eligibility: args,
      context: args,
    }, now)
    if (result.kind === 'eligible' || result.kind === 'ineligible') {
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (index) => index.eq('offeringId', args.offeringId)).unique()
      if (offering !== null) await rebuildCapabilityOriginSupplyProjection(ctx, offering.businessId, now)
    }
    return result
  })
}

export async function runQuarantine(
  backend: ConvexFixtureBackend,
  args: QuarantineCommandArgs,
  actorRef = 'user_capability_supply_admin',
) {
  return await backend.run(async (ctx) => {
    const now = Date.now()
    const result = await quarantineCapabilityBindingCommand(ctx.db, {
      actor: { kind: 'admin', ref: actorRef },
      bindingId: args.bindingId,
      expectedObservedRowDigest: args.expectedObservedRowDigest,
      context: args,
    }, now)
    if (result.kind === 'quarantined') {
      const binding = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) => index.eq('bindingId', args.bindingId)).unique()
      if (binding !== null) {
        const offering = await ctx.db.query('capabilityOfferings')
          .withIndex('by_offeringId', (index) => index.eq('offeringId', binding.offeringId)).unique()
        if (offering !== null) await rebuildCapabilityOriginSupplyProjection(ctx, offering.businessId, now)
      }
    }
    return result
  })
}

export async function registerContract(admin: ConvexFixtureAdmin) {
  const result = await admin.mutation(api.capabilityContractDocuments.register, {
    documentJson: JSON.stringify(capabilityContractV2()),
    operationKey: 'op:contract:supply', correlationId: 'corr:contract:supply',
    reasonCode: 'source_test_registration', evidenceRefs: ['test:capability-supply'],
  })
  if (result.kind !== 'registered') throw new Error(`contract registration failed: ${result.reason}`)
  return result.ref
}
