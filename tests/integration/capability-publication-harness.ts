import type { FunctionArgs } from 'convex/server'
import { convexTest } from 'convex-test'
import { expect } from 'vitest'

import {
  publicationPorts,
  rebuildCapabilityOriginSupplyProjection,
  quarantineCapabilityBindingCommand,
  setCapabilitySupplyEligibilityCommand,
} from '../../convex/capabilitySupply'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type {
  CapabilityContract,
  CapabilityContractDocument,
} from '@/modules/capability-contract/public'
import {
  refreshCapabilityCommand,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type CapabilityTransportAuthority,
  type EligibilityInput,
  type RegistrationContext,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import {
  prepareCapabilityPublicationMutation,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'

type PublishPreparedCapabilityArgs = FunctionArgs<
  typeof api.capabilitySupply.publishPreparedCapability
>
type PublicationFixtureInput = Parameters<
  typeof prepareCapabilityPublicationMutation
>[1]

export async function preparedPublicationArgs(
  backend: ConvexFixtureBackend,
  input: PublicationFixtureInput,
): Promise<PublishPreparedCapabilityArgs> {
  const args = await prepareCapabilityPublicationMutation(backend, input)
  const origin = args.prepared.offering.origin
  if (origin?.kind !== 'catalog_offering')
    return await withSourceWrite('catalog_publish', args)
  const accessPath = await backend.run(
    async (ctx) =>
      await ctx.db
        .query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) =>
          query.eq('offeringRef', args.offeringRef).eq('status', 'published'),
        )
        .unique(),
  )
  if (accessPath === null) return await withSourceWrite('catalog_publish', args)
  const bound = await prepareCapabilityPublicationMutation(backend, {
    ...input,
    offering: {
      ...args.prepared.offering,
      origin: {
        ...origin,
        declaredAccessPathRef: accessPath.accessPathRef,
        accessPathSourceHash: accessPath.sourceHash,
      },
    },
  })
  return await withSourceWrite('catalog_publish', bound)
}

type CapabilityContractAnnotation = Omit<
  CapabilityContractDocument['customerAnnotations'][number],
  'semanticIdentity' | 'prompt' | 'inference'
> & {
  semanticIdentity?: string
  prompt?: string
  inference?: 'allowed' | 'customer_required'
}

type CapabilityContractMetadata = Omit<
  CapabilityContractDocument,
  'contractFormat' | 'inputSchema' | 'outputSchema' | 'customerAnnotations'
> & {
  customerAnnotations: CapabilityContractAnnotation[]
}

export function contractMetadata(
  document: CapabilityContract,
): CapabilityContractMetadata {
  return {
    capabilityId: document.capabilityId,
    version: document.version,
    name: document.name,
    description: document.description,
    customerAnnotations: document.customerAnnotations.map(
      (annotation): CapabilityContractAnnotation => ({
        annotationId: annotation.annotationId,
        document: annotation.document,
        pointer: annotation.pointer,
        label: annotation.label,
        role: annotation.role,
        ...(annotation.semanticIdentity === undefined
          ? {}
          : { semanticIdentity: annotation.semanticIdentity }),
        ...(annotation.prompt === undefined
          ? {}
          : { prompt: annotation.prompt }),
        ...(annotation.inference === undefined
          ? {}
          : { inference: annotation.inference }),
      }),
    ),
    dataUse: document.dataUse.map((declaration) => ({
      effectId: declaration.effectId,
      inputPointer: declaration.inputPointer,
      classification: declaration.classification,
      phase: declaration.phase,
      recipient: declaration.recipient,
      purposes: declaration.purposes,
    })),
    effects: document.effects.map((effect) => ({
      effectId: effect.effectId,
      class: effect.class,
      authority: effect.authority,
      reversibility: effect.reversibility,
    })),
    evidence: document.evidence.map((item) => ({
      evidenceId: item.evidenceId,
      outputPointer: item.outputPointer,
      purpose: item.purpose,
    })),
    lifecycle: {
      idempotency: document.lifecycle.idempotency,
      recovery: document.lifecycle.recovery,
    },
  }
}

export type PublicationOperationContext = Readonly<{
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: string[]
}>

export function operationContext(suffix: string): PublicationOperationContext {
  return {
    operationKey: `op:capability-publication:${suffix}`,
    correlationId: `corr:capability-publication:${suffix}`,
    reasonCode: 'business_capability_publication',
    evidenceRefs: ['test:capability-publication'],
  }
}

export async function installCanonicalProviderConnectionFixture(
  backend: ConvexFixtureBackend,
  input: Readonly<{
    businessId: Id<'businesses'>
    connectionRef: string
    providerRef: string
    providerAccountRef: string
    adapterId: string
    secretRef: string | null
    scopes: readonly string[]
    resources: readonly string[]
    evidenceRefs: readonly string[]
    commandId: string
  }>,
) {
  const owner = await backend.run(async (ctx) => {
    const business = await ctx.db.get(input.businessId)
    if (business === null) throw new Error('provider_connection_fixture_business_missing')
    const row = await ctx.db.get(business.ownerId)
    if (row?.canonicalPrincipalRef === undefined || row.canonicalAccountRef === undefined) {
      throw new Error('provider_connection_fixture_canonical_owner_missing')
    }
    return {
      principalRef: row.canonicalPrincipalRef,
      accountRef: row.canonicalAccountRef,
    }
  })
  const providerNamespace = `capability-provider/${input.adapterId}`
  const installResources = [
    `connection-provider:${providerNamespace}`,
    `connection-provider:${providerNamespace}:${input.providerAccountRef}`,
    ...(input.secretRef === null ? [] : [`secret:${input.secretRef}`]),
  ].sort()
  const suffix = canonicalDigest({
    kind: 'canonical-provider-connection-fixture:v1',
    commandId: input.commandId,
    principalRef: owner.principalRef,
    accountRef: owner.accountRef,
    installResources,
  }).slice('sha256:'.length, 'sha256:'.length + 32)
  const grantRef = `grt_${suffix}`
  const expiresAt = Date.now() + 300_000
  await backend.run(async (ctx) => {
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: owner.accountRef,
      actorPrincipalRef: owner.principalRef,
      subjectPrincipalRef: owner.principalRef,
      scopes: ['connection:install'],
      resourceRefs: installResources,
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: 1,
      createdBy: {
        actorPrincipalRef: owner.principalRef,
        activeAccountRef: owner.accountRef,
        correlationRef: `fixture:${grantRef}`,
        idempotencyRef: `fixture:${grantRef}`,
      },
    })
  })
  return await backend.mutation(internal.capabilityProviderConnections.create, {
    connectionRef: input.connectionRef,
    businessId: input.businessId,
    providerRef: input.providerRef,
    providerAccountRef: input.providerAccountRef,
    adapterId: input.adapterId,
    credentialRef: input.secretRef,
    requestedScopes: [...input.scopes],
    grantedScopes: [...input.scopes],
    requestedResources: [...input.resources],
    grantedResources: [...input.resources],
    evidenceRefs: [...input.evidenceRefs],
    commandId: input.commandId,
    now: Date.now(),
  })
}

export async function runEligibilityThroughCommand(
  backend: ConvexFixtureBackend,
  args: EligibilityInput & RegistrationContext,
  actorRef = 'user_capability_publication_observer',
) {
  return await backend.run(async (ctx) => {
    const now = Date.now()
    const result = await setCapabilitySupplyEligibilityCommand(
      ctx.db,
      {
        actor: { kind: 'admin', ref: actorRef },
        eligibility: args,
        context: args,
      },
      now,
    )
    if (result.kind === 'eligible' || result.kind === 'ineligible') {
      const offering = await ctx.db
        .query('capabilityOfferings')
        .withIndex('by_offeringId', (index) =>
          index.eq('offeringId', args.offeringId),
        )
        .unique()
      if (offering !== null)
        await rebuildCapabilityOriginSupplyProjection(
          ctx,
          offering.businessId,
          now,
        )
    }
    return result
  })
}

export async function runQuarantineThroughCommand(
  backend: ConvexFixtureBackend,
  args: RegistrationContext &
    Readonly<{
      bindingId: string
      expectedObservedRowDigest: string
    }>,
  actorRef = 'user_capability_publication_observer',
) {
  return await backend.run(async (ctx) => {
    const now = Date.now()
    const result = await quarantineCapabilityBindingCommand(
      ctx.db,
      {
        actor: { kind: 'admin', ref: actorRef },
        bindingId: args.bindingId,
        expectedObservedRowDigest: args.expectedObservedRowDigest,
        context: args,
      },
      now,
    )
    if (result.kind === 'quarantined') {
      const binding = await ctx.db
        .query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) =>
          index.eq('bindingId', args.bindingId),
        )
        .unique()
      if (binding !== null) {
        const offering = await ctx.db
          .query('capabilityOfferings')
          .withIndex('by_offeringId', (index) =>
            index.eq('offeringId', binding.offeringId),
          )
          .unique()
        if (offering !== null)
          await rebuildCapabilityOriginSupplyProjection(
            ctx,
            offering.businessId,
            now,
          )
      }
    }
    return result
  })
}

export async function ownerMaintenanceArgs(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  offeringId: string,
  publicationRef: string,
  publicationRevision: number,
  suffix: string,
) {
  const catalog = await backend.run(async (ctx) => {
    const capabilityOffering = await ctx.db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', offeringId))
      .unique()
    if (capabilityOffering === null)
      throw new Error('owner_maintenance_offering_missing')
    const origin = capabilityOffering.origin
    if (origin?.kind !== 'catalog_offering') {
      throw new Error('owner_maintenance_catalog_origin_missing')
    }
    const revision = await ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) =>
        query
          .eq('offeringRef', origin.offeringRef)
          .eq('revision', origin.offeringRevision),
      )
      .unique()
    if (revision === null)
      throw new Error('owner_maintenance_catalog_revision_missing')
    return {
      offeringRef: origin.offeringRef,
      offeringRevision: origin.offeringRevision,
      offeringSourceHash: revision.sourceHash,
    }
  })
  return await withSourceWrite('catalog_publish', {
    businessId,
    ...catalog,
    publicationRef,
    publicationRevision,
    ...operationContext(suffix),
  })
}

export async function refreshCapabilityThroughTestSeam(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  publicationRef: string,
  expectedRevision: number,
  source: CapabilityPublicationImport,
  offering: CapabilityPublicationOfferingDraft | undefined,
  binding: CapabilityPublicationBindingDraft | undefined,
  context: PublicationOperationContext,
) {
  return await backend.run(async (ctx) => {
    const ports = publicationPorts(ctx)
    const publication = await ports.loadPublicationAtRevision(
      publicationRef,
      expectedRevision,
    )
    if (publication === null)
      throw new Error('refresh_test_publication_missing')
    const result = await refreshCapabilityCommand(
      {
        publication,
        source,
        offering,
        binding,
        ...context,
        now: Date.now(),
      },
      ports,
    )
    if (result.kind === 'refreshed') {
      if (publication.businessId !== businessId)
        throw new Error('refresh_test_business_mismatch')
      await rebuildCapabilityOriginSupplyProjection(ctx, businessId, Date.now())
    }
    return result
  })
}

export function providerAuthority(
  name: string,
): Extract<CapabilityTransportAuthority, { kind: 'provider_connection' }> {
  return {
    kind: 'provider_connection',
    connectionRef: `connection:capability-publication:${name}`,
    providerRef: `provider:capability-publication:${name}`,
  }
}

export async function registerProviderConnection(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  suffix: string,
  adapterId = 'http-json:v1',
) {
  const { connectionRef, providerRef } = providerAuthority(suffix)
  const result = await backend.mutation(
    internal.capabilityProviderConnections.create,
    {
      commandId: `command:create:capability-publication:${suffix}`,
      connectionRef,
      businessId,
      providerRef,
      providerAccountRef: `account:capability-publication:${suffix}`,
      adapterId,
      credentialRef: null,
      requestedScopes: [`capability:capability-publication:${suffix}`],
      grantedScopes: [`capability:capability-publication:${suffix}`],
      requestedResources: [`resource:capability-publication:${suffix}`],
      grantedResources: [`resource:capability-publication:${suffix}`],
      evidenceRefs: [`test:provider-connection:${suffix}`],
      now: 1,
    },
  )
  if (result.kind !== 'applied') {
    throw new Error(`provider_connection_fixture_${result.kind}`)
  }
  return result.connection
}

export function capabilityPublicationInput(
  businessId: Id<'businesses'>,
  suffix: string,
) {
  return {
    businessId,
    source: {
      kind: 'ae_envelope' as const,
      documentJson: JSON.stringify(
        capabilityContractV2({
          capabilityId: `independent.${suffix}.lookup`,
          name: `${suffix} lookup`,
        }),
      ),
    },
    offering: {
      offeringId: `offering:${suffix}:lookup`,
      networkId: 'ae:public',
      presentation: {
        label: `${suffix} lookup`,
        summary: 'Returns one structured result.',
        price: {
          kind: 'fixed' as const,
          amount: { currency: 'AUD' as const, units: '1200', exponent: 2 },
        },
        materialTerms: [],
        commercialRelationship: {
          kind: 'none' as const,
          summary: 'No commercial influence.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: ['business:neutral'],
        },
      },
      searchTerms: ['lookup'],
      registrationEvidenceRefs: ['business:publication'],
    },
    binding: {
      bindingId: `binding:${suffix}:http`,
      endpointUrl: `https://${suffix}.example.test/lookup`,
      authority: providerAuthority(suffix),
      continuation: {
        kind: 'single_response' as const,
        evidenceRefs: ['business:response'],
      },
      cancellation: {
        kind: 'unsupported' as const,
        evidenceRefs: ['business:no-cancellation'],
      },
      adapter: {
        adapterId: 'http-json:v1',
        config: { method: 'POST' as const, requestTimeoutMs: 5_000 },
      },
      registrationEvidenceRefs: ['business:binding'],
    },
    ...operationContext(`publish-${suffix}`),
  }
}

export async function seedCatalogOffering(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  suffix: string,
  endpointPath = '/lookup',
  endpointMethod: 'GET' | 'POST' = 'POST',
): Promise<void> {
  await backend.run(async (ctx) => {
    const offeringRef = `catalog-offering:${suffix}`
    const offeringSourceHash = `catalog-source:${suffix}`
    const accessPathRef = `access:${suffix}:lookup`
    const descriptor = {
      kind: 'external_operation' as const,
      name: `${suffix} lookup`,
      summary: 'Returns one structured result.',
      url: `https://${suffix}.example.test${endpointPath}`,
      method: endpointMethod,
      provenance: 'business_declared' as const,
    }
    await ctx.db.insert('businessOfferings', {
      offeringRef,
      businessId,
      currentRevision: 1,
      status: 'published',
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('businessOfferingRevisions', {
      offeringRef,
      businessId,
      revision: 1,
      name: `${suffix} lookup`,
      category: 'Data',
      summary: 'Returns one structured result.',
      sourceHash: offeringSourceHash,
      createdAt: 1,
    })
    await ctx.db.insert('offeringAccessPaths', {
      accessPathRef,
      businessId,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash,
      status: 'published',
      descriptor,
      sourceHash: canonicalDigest({
        accessPathRef,
        offeringSourceHash,
        descriptor,
      }),
      createdAt: 1,
      updatedAt: 1,
    })
  })
}

export async function admitPublication(
  backend: ReturnType<typeof convexTest>,
  publication: Readonly<{
    offeringId: string
    bindingId: string
    contractRef: {
      capabilityId: string
      version: number
      contractDigest: string
    }
  }>,
  suffix: string,
) {
  const hashes = await publicationRegistrationHashes(backend, publication)
  const admitted = await runEligibilityThroughCommand(backend, {
    offeringId: publication.offeringId,
    bindingId: publication.bindingId,
    contractRef: publication.contractRef,
    decision: 'admit',
    expectedOfferingRegistrationHash: hashes.offering,
    expectedBindingRegistrationHash: hashes.binding,
    admissionEvidenceRefs: [`test:admission:${suffix}`],
    conformanceEvidenceRefs: [`test:conformance:${suffix}`],
    ...operationContext(`admit-${suffix}`),
  })
  expect(admitted.kind).toBe('eligible')
}

export async function publicationRegistrationHashes(
  backend: ReturnType<typeof convexTest>,
  publication: Readonly<{ offeringId: string; bindingId: string }>,
) {
  return backend.run(async (ctx) => {
    const offering =
      (await ctx.db.query('capabilityOfferings').collect()).find(
        (row) => row.offeringId === publication.offeringId,
      ) ?? null
    const binding =
      (await ctx.db.query('capabilityTransportBindings').collect()).find(
        (row) => row.bindingId === publication.bindingId,
      ) ?? null
    if (offering === null || binding === null)
      throw new Error('publication_supply_missing')
    return {
      offering: offering.registrationHash,
      binding: binding.registrationHash,
    }
  })
}
