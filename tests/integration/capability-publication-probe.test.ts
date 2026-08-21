import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { defineCapabilityContract } from '@/modules/capability-contract/public'
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
