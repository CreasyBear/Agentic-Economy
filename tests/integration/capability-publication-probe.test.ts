import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import {
  convexModules as modules,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  capabilityPublicationInput,
  contractMetadata,
  operationContext,
  preparedPublicationArgs,
  registerProviderConnection,
  seedCatalogOffering,
} from './capability-publication-harness'

describe('capability publication probe', () => {
  it.each([
    'owner',
    'member',
    'workload',
    'missing_workload',
    'stranger',
    'wrong_account',
    'stale_generation',
  ] as const)(
    'evaluates readCurrentCapabilityProbeAuthority %s through the registered readiness action',
    async (caseKind) => {
      const backend = convexTest(schema, modules)
      const caseSuffix = {
        owner: 'own', member: 'mem', workload: 'wrk', missing_workload: 'mis',
        stranger: 'str', wrong_account: 'acc', stale_generation: 'stl',
      } as const
      const suffix = `pi-${caseSuffix[caseKind]}`
      const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
      await seedCatalogOffering(backend, businessId, suffix)
      await registerProviderConnection(backend, businessId, suffix)
      const published = await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(
          backend,
          capabilityPublicationInput(businessId, suffix),
        ),
      )
      if (published.kind !== 'published') {
        throw new Error(`probe_isolation_publication_${published.kind}`)
      }
      await backend.run(async (ctx) => {
        const publication = await ctx.db.query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (query) => query
            .eq('publicationRef', published.publicationRef)
            .eq('revision', published.publicationRevision))
          .unique()
        const business = await ctx.db.get(businessId)
        if (publication === null || business === null) {
          throw new Error('probe_isolation_rows_missing')
        }
        const legacyOwner = await ctx.db.get(business.ownerId)
        if (legacyOwner?.canonicalPrincipalRef === undefined
          || legacyOwner.canonicalAccountRef === undefined) {
          throw new Error('probe_isolation_owner_missing')
        }
        const publisher = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', publication.publisherRef))
          .unique()
        if (publisher === null) throw new Error('probe_isolation_publisher_missing')

        if (caseKind === 'member') {
          const replacementRef = `prn_${canonicalDigest({ suffix, role: 'replacement-owner' })
            .slice('sha256:'.length, 'sha256:'.length + 32)}`
          const membershipRef = `mem_${canonicalDigest({ suffix, role: 'former-owner-member' })
            .slice('sha256:'.length, 'sha256:'.length + 32)}`
          await ctx.db.insert('principals', {
            principalRef: replacementRef,
            kind: 'human',
            displayName: 'Replacement probe owner',
            lifecycle: 'active',
            revision: 1,
            createdAt: 2,
            updatedAt: 2,
          })
          const account = await ctx.db.query('accounts')
            .withIndex('by_accountRef', (query) => query.eq('accountRef', legacyOwner.canonicalAccountRef as never))
            .unique()
          if (account === null) throw new Error('probe_isolation_account_missing')
          const ownership = await ctx.db.query('accountOwnerships')
            .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
            .unique()
          if (ownership === null) throw new Error('probe_isolation_ownership_missing')
          await ctx.db.patch(ownership._id, {
            ownerPrincipalRef: replacementRef,
            revision: ownership.revision + 1,
          })
          await ctx.db.patch(legacyOwner._id, {
            canonicalPrincipalRef: replacementRef,
            updatedAt: legacyOwner.updatedAt + 1,
          })
          await ctx.db.insert('memberships', {
            membershipRef,
            accountRef: legacyOwner.canonicalAccountRef,
            memberPrincipalRef: publication.publisherRef,
            lifecycle: 'active',
            revision: 1,
            createdAt: 2,
            createdBy: {
              actorPrincipalRef: replacementRef,
              activeAccountRef: legacyOwner.canonicalAccountRef,
              correlationRef: `create:${membershipRef}`,
              idempotencyRef: `create:${membershipRef}`,
            },
          })
        } else if (caseKind === 'workload') {
          await ctx.db.patch(publisher._id, { kind: 'workload' })
        } else if (caseKind === 'missing_workload') {
          await ctx.db.delete(publisher._id)
        } else if (caseKind === 'stranger') {
          await ctx.db.patch(publication._id, {
            publisherRef: `prn_${'e'.repeat(32)}`,
          })
        } else if (caseKind === 'wrong_account') {
          const foreignAccountRef = `acc_${'f'.repeat(32)}`
          const foreignPrincipalRef = `prn_${'f'.repeat(32)}`
          await ctx.db.insert('principals', {
            principalRef: foreignPrincipalRef,
            kind: 'agent',
            displayName: 'Foreign probe publisher',
            lifecycle: 'active',
            revision: 1,
            createdAt: 2,
            updatedAt: 2,
          })
          await ctx.db.insert('agentAccessPrincipals', {
            principalId: foreignPrincipalRef,
            ownerId: foreignAccountRef,
            credentialId: 'credential:foreign-probe-publisher',
            applicationRef: 'application:foreign-probe-publisher',
            environment: 'production',
            scopes: ['capability_supply:publish'],
            authorityMode: 'bounded_mandate',
            grantGeneration: 1,
            policyDigest: 'sha256:foreign-probe-publisher',
            lifecycle: 'active',
            recordedAt: 2,
            lastSeenAt: 2,
          })
          await ctx.db.patch(publication._id, { publisherRef: foreignPrincipalRef })
        } else if (caseKind === 'stale_generation') {
          const agentRef = `prn_${'d'.repeat(32)}`
          await ctx.db.insert('principals', {
            principalRef: agentRef,
            kind: 'agent',
            displayName: 'Stale probe agent',
            lifecycle: 'active',
            revision: 1,
            createdAt: 2,
            updatedAt: 2,
          })
          await ctx.db.insert('agentAccessPrincipals', {
            principalId: agentRef,
            ownerId: legacyOwner.canonicalAccountRef,
            credentialId: 'credential:stale-probe-agent',
            applicationRef: 'application:stale-probe-agent',
            environment: 'production',
            scopes: ['capability_supply:publish'],
            authorityMode: 'bounded_mandate',
            grantGeneration: 2,
            policyDigest: 'sha256:stale-probe-agent',
            lifecycle: 'active',
            recordedAt: 2,
            lastSeenAt: 2,
          })
          await ctx.db.patch(publication._id, { publisherRef: agentRef })
        }
      })

      const protectedState = async () => await backend.run(async (ctx) => {
        const publication = await ctx.db.query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (query) => query
            .eq('publicationRef', published.publicationRef)
            .eq('revision', published.publicationRevision))
          .unique()
        if (publication === null) throw new Error('probe_isolation_publication_missing')
        return {
          credentialState: publication.credentialState,
          healthState: publication.healthState,
          readinessObservedAt: publication.readinessObservedAt,
          readinessValidUntil: publication.readinessValidUntil,
          readinessEvidenceRefs: publication.readinessEvidenceRefs,
        }
      })
      const before = await protectedState()
      const result = await backend.action(internal.capabilitySupplyReadiness.probe, {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
      })

      if (caseKind === 'owner') {
        expect(result).toMatchObject({ kind: 'observed' })
        await expect(protectedState()).resolves.toMatchObject({
          credentialState: 'unavailable',
          healthState: 'unhealthy',
        })
      } else {
        expect(result).toEqual({
          kind: 'unavailable',
          reason: 'authority_stale',
          evidenceRefs: ['probe-target:authority-stale'],
        })
        await expect(protectedState()).resolves.toEqual(before)
      }
    },
  )

  it.each(['financial_exposure', 'external_state_change'] as const)(
    'refuses automatic readiness for an OpenAPI %s operation before network execution',
    async (effectClass) => {
      const backend = convexTest(schema, modules)
      const suffix = `openapi-${effectClass}`
      const { businessId, owner } = await publishedBusinessOwner(
        backend,
        suffix,
      )
      await seedCatalogOffering(backend, businessId, suffix)
      const direct = capabilityPublicationInput(businessId, suffix)
      await registerProviderConnection(backend, businessId, suffix)
      const contractDocument = defineCapabilityContract(
        capabilityContractV2({
          capabilityId: `independent.openapi.${effectClass.replaceAll('_', '-')}`,
          name: `OpenAPI ${effectClass}`,
          effects: [
            {
              effectId: 'request_release',
              class: 'data_release',
              authority: 'mandate_or_explicit',
              reversibility: 'irreversible',
            },
            {
              effectId: 'unsafe_effect',
              class: effectClass,
              authority:
                effectClass === 'financial_exposure'
                  ? 'mandate_or_explicit'
                  : 'explicit',
              reversibility: 'conditional',
            },
          ],
          lifecycle: {
            idempotency: 'required',
            recovery: 'reconcile_required',
          },
        }),
      )
      const { inputSchema, outputSchema } = contractDocument
      const input = {
        businessId,
        source: {
          kind: 'openapi_http' as const,
          document: {
            openapi: '3.1.0',
            servers: [{ url: `https://${suffix}.example.test` }],
            components: {
              securitySchemes: {
                ProviderKey: {
                  type: 'apiKey',
                  in: 'header',
                  name: 'X-Provider-Key',
                },
              },
            },
            paths: {
              '/lookup': {
                post: {
                  security: [{ ProviderKey: [] }],
                  requestBody: {
                    content: { 'application/json': { schema: inputSchema } },
                  },
                  responses: {
                    200: {
                      content: { 'application/json': { schema: outputSchema } },
                    },
                  },
                },
              },
            },
          },
          operation: { path: '/lookup' as const, method: 'post' as const },
          contract: contractMetadata(contractDocument),
          commercial: {
            offering: direct.offering,
            bindingId: direct.binding.bindingId,
            authority: direct.binding.authority,
            registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
            requestTimeoutMs: 5_000,
          },
          evidenceRefs: ['business:openapi-description'],
        },
        ...operationContext(`publish-${suffix}`),
      }
      const published = await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(backend, input),
      )
      expect(published).toMatchObject({
        kind: 'published',
        publicationRevision: 1,
        offeringId: direct.offering.offeringId,
        bindingId: direct.binding.bindingId,
        lifecycle: { state: 'inactive' },
      })
      if (published.kind !== 'published')
        throw new Error('publication_not_published')
      await expect(
        backend.action(internal.capabilitySupplyReadiness.probe, {
          publicationRef: published.publicationRef,
          expectedRevision: published.publicationRevision,
        }),
      ).resolves.toEqual({
        kind: 'unavailable',
        reason: 'effectful_probe_unsupported',
        evidenceRefs: ['probe-target:effectful_probe_unsupported'],
      })
    },
  )

  it.each(['financial_exposure', 'external_state_change'] as const)(
    'refuses automatic readiness for effectful MCP %s before tools/call',
    async (effectClass) => {
      const backend = convexTest(schema, modules)
      const suffix = `mcp-${effectClass}`
      const { businessId, owner } = await publishedBusinessOwner(
        backend,
        suffix,
      )
      await seedCatalogOffering(backend, businessId, suffix)
      const direct = capabilityPublicationInput(businessId, suffix)
      await registerProviderConnection(
        backend,
        businessId,
        suffix,
        'mcp-jsonrpc:v1',
      )
      const document = defineCapabilityContract(
        capabilityContractV2({
          capabilityId: `independent.mcp.${effectClass.replaceAll('_', '-')}`,
          name: `MCP ${effectClass}`,
          effects: [
            {
              effectId: 'request_release',
              class: 'data_release',
              authority: 'mandate_or_explicit',
              reversibility: 'irreversible',
            },
            {
              effectId: 'unsafe_effect',
              class: effectClass,
              authority:
                effectClass === 'financial_exposure'
                  ? 'mandate_or_explicit'
                  : 'explicit',
              reversibility: 'conditional',
            },
          ],
          lifecycle: {
            idempotency: 'required',
            recovery: 'reconcile_required',
          },
        }),
      )
      const commercial = {
        offering: direct.offering,
        bindingId: direct.binding.bindingId,
        authority: direct.binding.authority,
        registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
        requestTimeoutMs: 5_000,
      }
      const published = await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(backend, {
          businessId,
          source: {
            kind: 'mcp' as const,
            serverUrl: `https://${suffix}.example.test/rpc`,
            tool: {
              name: 'reference_lookup',
              inputSchema: document.inputSchema,
              outputSchema: document.outputSchema,
            },
            protocolVersion: '2025-06-18',
            contract: contractMetadata(document),
            commercial,
            evidenceRefs: ['business:mcp-description'],
          },
          ...operationContext(`publish-${suffix}`),
        }),
      )
      expect(published).toMatchObject({
        kind: 'published',
        publicationRevision: 1,
        lifecycle: { state: 'inactive' },
      })
      if (published.kind !== 'published')
        throw new Error('publication_not_published')

      await expect(
        backend.action(internal.capabilitySupplyReadiness.probe, {
          publicationRef: published.publicationRef,
          expectedRevision: published.publicationRevision,
        }),
      ).resolves.toEqual({
        kind: 'unavailable',
        reason: 'effectful_probe_unsupported',
        evidenceRefs: ['probe-target:effectful_probe_unsupported'],
      })
    },
  )
})
