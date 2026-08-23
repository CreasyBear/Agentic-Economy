import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { validatePaymentRequired } from '@x402/core/schemas'

import { api } from '../../convex/_generated/api'
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
  providerAuthority,
  registerProviderConnection,
  seedCatalogOffering,
} from './capability-publication-harness'

describe('capability publication publish', () => {
  it('lets the source-bound business owner publish one canonical inactive AE capability', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'independent-one',
    )
    await seedCatalogOffering(backend, businessId, 'independent-one')
    await registerProviderConnection(backend, businessId, 'independent-one')

    const input = {
      businessId,
      source: {
        kind: 'ae_envelope' as const,
        documentJson: JSON.stringify(
          capabilityContractV2({
            capabilityId: 'independent.reference.lookup',
            name: 'Independent reference lookup',
          }),
        ),
      },
      offering: {
        offeringId: 'offering:independent-one:reference-lookup',
        networkId: 'ae:public',
        presentation: {
          label: 'Independent reference lookup',
          summary:
            'Looks up one public reference and returns structured evidence.',
          price: {
            kind: 'fixed' as const,
            amount: { currency: 'AUD', units: '1200', exponent: 2 },
          },
          materialTerms: [
            {
              termId: 'response',
              label: 'Response',
              value: 'One structured response',
            },
          ],
          commercialRelationship: {
            kind: 'none' as const,
            summary: 'No commercial influence.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['business:commercial-neutrality'],
          },
        },
        searchTerms: ['reference', 'lookup'],
        registrationEvidenceRefs: ['business:capability-publication'],
      },
      binding: {
        bindingId: 'binding:independent-one:http',
        endpointUrl:
          'https://independent-one.example.test/capabilities/reference-lookup',
        authority: providerAuthority('independent-one'),
        continuation: {
          kind: 'single_response' as const,
          evidenceRefs: ['business:http-response'],
        },
        cancellation: {
          kind: 'unsupported' as const,
          evidenceRefs: ['business:no-cancellation'],
        },
        adapter: {
          adapterId: 'http-json:v1',
          config: { method: 'POST' as const, requestTimeoutMs: 5_000 },
        },
        registrationEvidenceRefs: ['business:http-binding'],
      },
      ...operationContext('publish'),
    }
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(backend, input),
    )

    expect(published).toMatchObject({
      kind: 'published',
      publicationRef: 'offering:independent-one:reference-lookup',
      publicationRevision: 1,
      contractRef: {
        capabilityId: 'independent.reference.lookup',
        version: 1,
        contractDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
      offeringId: 'offering:independent-one:reference-lookup',
      bindingId: 'binding:independent-one:http',
      lifecycle: {
        state: 'inactive',
        reasons: [
          'admission_unproven',
          'conformance_unproven',
          'credential_readiness_unobserved',
          'health_unobserved',
        ],
      },
    })
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)

    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toEqual({
      kind: 'published',
      publicationRef: published.publicationRef,
      contractRef: published.contractRef,
      offeringId: published.offeringId,
      bindingId: published.bindingId,
      lifecycle: {
        state: 'inactive',
        reasons: ['credential_readiness_unobserved', 'health_unobserved'],
      },
    })

    const persisted = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').collect(),
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
    }))
    expect(persisted).toMatchObject({
      contracts: [
        {
          capabilityId: 'independent.reference.lookup',
          version: 1,
          status: 'active',
        },
      ],
      offerings: [
        { offeringId: published.offeringId, businessId, status: 'active' },
      ],
      bindings: [
        {
          bindingId: published.bindingId,
          offeringId: published.offeringId,
          admission: 'admitted',
          conformance: 'conformant',
        },
      ],
    })
  })

  it.each(['mcp', 'x402'] as const)(
    'publishes a generic %s description through the production command',
    async (kind) => {
      const backend = convexTest(schema, modules)
      const { businessId, owner } = await publishedBusinessOwner(
        backend,
        `${kind}-one`,
      )
      await seedCatalogOffering(backend, businessId, `${kind}-one`)
      const direct = capabilityPublicationInput(businessId, `${kind}-one`)
      await registerProviderConnection(
        backend,
        businessId,
        `${kind}-one`,
        kind === 'mcp' ? 'mcp-jsonrpc:v1' : 'x402-fetch:v2',
      )
      const document = defineCapabilityContract(
        capabilityContractV2({
          capabilityId: `independent.${kind}.lookup`,
          name: `${kind} lookup`,
        }),
      )
      const { inputSchema, outputSchema } = document
      const contract = contractMetadata(document)
      const commercial = {
        offering: direct.offering,
        bindingId: direct.binding.bindingId,
        authority: direct.binding.authority,
        registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
        requestTimeoutMs: 5_000,
      }
      const source =
        kind === 'mcp'
          ? {
              kind,
              serverUrl: 'https://mcp-one.example.test/rpc',
              tool: { name: 'reference_lookup', inputSchema, outputSchema },
              protocolVersion: '2025-06-18',
              contract,
              commercial,
              evidenceRefs: ['business:mcp-description'],
            }
          : {
              kind,
              resource: {
                resourceUrl: 'https://x402-one.example.test/lookup',
                inputSchema,
                outputSchema,
                price: { currency: 'AUD', units: '1200', exponent: 2 },
                scheme: 'exact',
                network: 'eip155:84532',
                asset: '0x0000000000000000000000000000000000000001',
                payTo: '0x0000000000000000000000000000000000000002',
                routeAmountExponent: 2,
                assetAmountExponent: 6,
                paymentRequired: validatePaymentRequired({
                  x402Version: 2,
                  resource: {
                    url: 'https://x402-one.example.test/lookup',
                  },
                  accepts: [
                    {
                      scheme: 'exact',
                      network: 'eip155:84532',
                      amount: '12000000',
                      asset: '0x0000000000000000000000000000000000000001',
                      payTo: '0x0000000000000000000000000000000000000002',
                      maxTimeoutSeconds: 60,
                      extra: { name: 'USDC', version: '2' },
                    },
                  ],
                }),
              },
              contract,
              commercial: {
                ...commercial,
                offering: {
                  ...commercial.offering,
                  presentation: {
                    ...commercial.offering.presentation,
                    price: {
                      kind: 'fixed' as const,
                      amount: { currency: 'AUD', units: '1200', exponent: 2 },
                    },
                  },
                },
              },
              evidenceRefs: ['business:x402-description'],
            }
      await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(backend, {
          businessId,
          source,
          ...operationContext(`publish-${kind}`),
        }),
      )
    },
  )
})
