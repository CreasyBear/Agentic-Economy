import { describe, expect, it } from 'vitest'

import {
  CURATED_PROVIDER_PUBLICATIONS,
  exaContentsPublicationImport,
  exaSearchPublicationImport,
  frankfurterSingleRatePublicationImport,
  normalizeCapabilityPublication,
} from '@/modules/capability-supply/public'

describe('curated provider publications', () => {
  it('normalizes three distinct real-provider operations through the generic import boundary', () => {
    const normalized = CURATED_PROVIDER_PUBLICATIONS.map(({ publication }) => (
      normalizeCapabilityPublication(publication)
    ))

    expect(normalized.every(({ kind }) => kind === 'normalized')).toBe(true)
    expect(normalized.map((result) => (
      result.kind === 'normalized'
        ? JSON.parse(result.draft.documentJson).capabilityId as string
        : result.reason
    ))).toEqual(['exa.search', 'exa.contents', 'frankfurter.single-rate'])
  })

  it('keeps Exa API-key endpoints in source-owned OpenAPI records without payment transport', () => {
    const imports = [exaSearchPublicationImport, exaContentsPublicationImport]
    const normalized = imports.map((publication) => normalizeCapabilityPublication(publication))

    expect(imports.map(({ kind }) => kind)).toEqual(['openapi_http', 'openapi_http'])
    expect(normalized).toMatchObject([
      {
        kind: 'normalized',
        draft: {
          binding: {
            endpointUrl: 'https://api.exa.ai/search',
            credentialRef: 'env:EXA_API_KEY',
            adapter: { adapterId: 'http-json:v1' },
          },
        },
      },
      {
        kind: 'normalized',
        draft: {
          binding: {
            endpointUrl: 'https://api.exa.ai/contents',
            credentialRef: 'env:EXA_API_KEY',
            adapter: { adapterId: 'http-json:v1' },
          },
        },
      },
    ])
  })

  it('pins the Frankfurter provider query while exposing the contract key quote', () => {
    const result = normalizeCapabilityPublication(frankfurterSingleRatePublicationImport)

    expect(result).toMatchObject({
      kind: 'normalized',
      draft: {
        binding: {
          endpointUrl: 'https://api.frankfurter.dev/v2/rates',
          credentialRef: 'none',
          adapter: {
            adapterId: 'http-json:v1',
            config: {
              method: 'GET',
              query: [
                { inputPointer: '/base', parameter: 'base' },
                { inputPointer: '/quote', parameter: 'quotes' },
              ],
              fixedQuery: [{ parameter: 'providers', value: 'ECB' }],
            },
          },
        },
      },
    })
    if (result.kind === 'normalized') {
      expect(JSON.parse(result.draft.documentJson)).toMatchObject({
        inputSchema: {
          required: ['base', 'quote'],
          additionalProperties: false,
        },
      })
    }
  })
})
