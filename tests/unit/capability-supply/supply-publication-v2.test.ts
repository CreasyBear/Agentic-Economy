import { describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  prepareSupplyPublicationV2,
  selectSupplyProviderAuthority,
  type PublishSupplyOperationV2Input,
} from '@/modules/capability-supply/supply-publication-v2'

const JSON_SCHEMA = 'https://json-schema.org/draft/2020-12/schema'

function sourceDocument() {
  return {
    openapi: '3.0.3',
    info: { title: 'Reference Provider', version: '1.0.0' },
    servers: [{ url: 'https://provider.example/api/' }],
    paths: {
      '/lookup': {
        post: {
          operationId: 'lookup',
          summary: 'Reference lookup',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $schema: JSON_SCHEMA,
                  type: 'object',
                  properties: { query: { type: 'string', description: 'Reference query' } },
                  required: ['query'],
                  additionalProperties: false,
                },
                example: { query: 'example' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Lookup result',
              content: {
                'application/json': {
                  schema: {
                    $schema: JSON_SCHEMA,
                    type: 'object',
                    properties: { result: { type: 'string' } },
                    required: ['result'],
                    additionalProperties: false,
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

function publicationInput(document = sourceDocument()): PublishSupplyOperationV2Input {
  const sourceDigest = canonicalDigest(document)
  const selector = {
    serverUrl: 'https://provider.example/api/',
    path: '/lookup',
    method: 'post',
  }
  return {
    businessRef: 'business:reference',
    source: {
      kind: 'openapi',
      definitionUrl: 'https://provider.example/openapi.yaml',
      environment: 'sandbox',
    },
    candidateRef: canonicalDigest({ sourceDigest, selector }),
    expectedSourceDigest: sourceDigest,
    presentation: {
      name: 'Reference lookup',
      description: 'Looks up one reference through the Provider API.',
      category: 'Research',
      serviceArea: 'Australia',
    },
    consequences: {
      effects: [{ class: 'data_release', authority: 'explicit', reversibility: 'irreversible' }],
      dataUse: [{ inputPointer: '/query', classification: 'public', phase: 'execution', purposes: ['reference_lookup'] }],
      evidence: [{ outputPointer: '/result', purpose: 'completion' }],
    },
    pricing: { kind: 'fixed_aud', amount: { currency: 'AUD', units: '2500000', exponent: 6 } },
    validationInput: { query: 'example' },
    environment: 'sandbox',
    idempotencyKey: 'publish-reference-v2',
    attestation: {
      authorisedToPublish: true,
      informationAccurate: true,
      publishAfterSuccessfulValidation: true,
    },
  }
}

describe('supply.publish:v2 preparation', () => {
  it('uses only the selected active connection owned by the same Business', () => {
    const available = {
      connectionRef: 'connection:one',
      businessId: 'business:reference',
      providerRef: 'provider:reference',
      lifecycle: 'active' as const,
      available: true,
    }
    expect(selectSupplyProviderAuthority(
      'business:reference',
      'connection:one',
      [available],
    )).toEqual({
      kind: 'provider_connection',
      connectionRef: 'connection:one',
      providerRef: 'provider:reference',
    })
    expect(selectSupplyProviderAuthority(
      'business:other',
      'connection:one',
      [available],
    )).toBeUndefined()
    expect(selectSupplyProviderAuthority(
      'business:reference',
      'connection:one',
      [{ ...available, lifecycle: 'revoked' as const, available: false }],
    )).toBeUndefined()
  })

  it('re-fetches the selected native source and derives exact publication material without manual protocol JSON', async () => {
    const document = sourceDocument()
    const loadOpenApi = vi.fn().mockResolvedValue(document)

    const result = await prepareSupplyPublicationV2(publicationInput(document), { loadOpenApi })

    expect(result).toMatchObject({
      kind: 'prepared',
      sourceRevision: expect.stringMatching(/^openapi:sha256:/u),
      sourceAuthorityState: 'review_required',
      candidate: {
        title: 'Reference lookup',
        sourceSelector: {
          serverUrl: 'https://provider.example/api/',
          path: '/lookup',
          method: 'post',
        },
      },
      prepared: {
        sourceKind: 'openapi_http',
        sourceRouteRef: expect.stringMatching(/^sha256:/u),
        binding: { endpointUrl: 'https://provider.example/api/lookup' },
        offering: {
          presentation: {
            label: 'Reference lookup',
            price: { kind: 'fixed', amount: { currency: 'AUD', units: '2500000', exponent: 6 } },
          },
        },
      },
    })
    expect(loadOpenApi).toHaveBeenCalledOnce()
    expect(JSON.stringify(result)).not.toContain('Bearer ')
    expect(JSON.stringify(result)).not.toContain('apiKeyValue')
  })

  it('fails before durable publication when the source digest changes after preview', async () => {
    const original = sourceDocument()
    const changed = { ...original, info: { ...original.info, version: '2.0.0' } }

    await expect(prepareSupplyPublicationV2(publicationInput(original), {
      loadOpenApi: vi.fn().mockResolvedValue(changed),
    })).resolves.toEqual({ kind: 'refused', reason: 'source_changed' })
  })

  it('preserves the canonical Offering identity when the same source route is revised', async () => {
    const firstDocument = sourceDocument()
    const revisedDocument = {
      ...sourceDocument(),
      info: { title: 'Reference Provider', version: '2.0.0' },
      paths: {
        '/lookup': {
          ...sourceDocument().paths['/lookup'],
          post: {
            ...sourceDocument().paths['/lookup'].post,
            summary: 'Revised reference lookup',
          },
        },
      },
    }
    const first = await prepareSupplyPublicationV2(publicationInput(firstDocument), {
      loadOpenApi: vi.fn().mockResolvedValue(firstDocument),
    })
    const revisedInput = publicationInput(revisedDocument)
    const revised = await prepareSupplyPublicationV2(revisedInput, {
      loadOpenApi: vi.fn().mockResolvedValue(revisedDocument),
    })

    expect(first.kind).toBe('prepared')
    expect(revised.kind).toBe('prepared')
    if (first.kind !== 'prepared' || revised.kind !== 'prepared') return
    expect(revised.prepared.offering.offeringId).toBe(first.prepared.offering.offeringId)
    expect(revised.prepared.binding.bindingId).toBe(first.prepared.binding.bindingId)
    expect(revised.sourceDigest).not.toBe(first.sourceDigest)
  })
})
