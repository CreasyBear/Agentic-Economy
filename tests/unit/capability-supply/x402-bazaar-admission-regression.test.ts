import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
  type DiscoveryExtension,
} from '@x402/extensions/bazaar'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  admitOfficialBazaarFromPaymentRequired,
  materializeOfficialBazaarX402Import,
} from '@/modules/capability-supply/server'
import { isBoundedJsonValue } from '@/modules/common/bounded-json'

function declaredBazaar() {
  const declared = declareDiscoveryExtension({
    bodyType: 'json',
    input: { text: 'Agentic Economy', mode: 'strict' },
    inputSchema: z.toJSONSchema(z.object({
      text: z.string().min(1).max(128),
      mode: z.enum(['strict', 'loose']).optional(),
    })),
    output: {
      example: {
        schemaVersion: 'fixture.v1',
        count: 1,
        tags: ['normalized'],
      },
      schema: z.toJSONSchema(z.object({
        schemaVersion: z.literal('fixture.v1'),
        count: z.number().int().min(0).max(10),
        tags: z.array(z.enum(['normalized', 'trimmed'])),
        note: z.string().optional(),
      })),
    },
  })
  const enriched = bazaarResourceServerExtension.enrichDeclaration?.(
    declared.bazaar,
    {
      method: 'POST',
      routePattern: '/normalize',
      adapter: { getPath: () => '/normalize' },
    } as never,
  ) as DiscoveryExtension | undefined
  if (enriched === undefined) throw new Error('expected official Bazaar enrichment')
  return { bazaar: enriched }
}

describe('official Bazaar admission regressions', () => {
  it('distinguishes absent metadata from malformed metadata', () => {
    expect(admitOfficialBazaarFromPaymentRequired({})).toEqual({ kind: 'absent' })
    expect(admitOfficialBazaarFromPaymentRequired({
      extensions: { bazaar: 'not-an-extension' },
    })).toEqual({ kind: 'refused', reason: 'bazaar_discovery_invalid' })
  })

  it('preserves the seller-declared input and output constraints', () => {
    const admitted = admitOfficialBazaarFromPaymentRequired({
      extensions: declaredBazaar(),
    })

    expect(admitted).toMatchObject({
      kind: 'admitted',
      method: 'POST',
      inputSchema: {
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 128 },
          mode: { type: 'string', enum: ['strict', 'loose'] },
        },
        required: ['text'],
      },
      outputSchema: {
        properties: {
          schemaVersion: { type: 'string', const: 'fixture.v1' },
          count: { type: 'integer', minimum: 0, maximum: 10 },
          tags: { type: 'array', items: { type: 'string', enum: ['normalized', 'trimmed'] } },
          note: { type: 'string' },
        },
        required: ['schemaVersion', 'count', 'tags'],
      },
    })
    expect(isBoundedJsonValue(admitted)).toBe(true)
    expect(Object.hasOwn(admitted, 'query')).toBe(false)
  })

  it('keeps a declared request schema callable when the SDK body example is empty', () => {
    const extension = structuredClone(declaredBazaar())
    const bazaar = extension.bazaar
    if (bazaar === undefined) throw new Error('expected Bazaar extension')
    Object.assign(bazaar.info.input, { body: {} })
    const admitted = admitOfficialBazaarFromPaymentRequired({ extensions: extension })
    expect(admitted).toMatchObject({ kind: 'admitted', inputSchema: { required: ['text'] } })
    expect(admitted).not.toHaveProperty('inputExample')
  })

  it('refuses a declared output schema that contradicts the published example', () => {
    const extension = structuredClone(declaredBazaar())
    const bazaar = extension.bazaar
    if (bazaar === undefined) throw new Error('expected Bazaar extension')
    const output = bazaar.info.output
    if (output === undefined || output.type !== 'json') throw new Error('expected JSON output')
    ;(output as { example: unknown }).example = {
      schemaVersion: 'fixture.v1',
      count: 11,
      tags: ['normalized'],
    }

    expect(admitOfficialBazaarFromPaymentRequired({ extensions: extension })).toEqual({
      kind: 'refused',
      reason: 'bazaar_discovery_invalid',
    })
  })

  it('strips raw Bazaar only after admitting the declaration embedded in that exact source', () => {
    const admitted = materializeOfficialBazaarX402Import({
      kind: 'x402',
      resource: {
        paymentRequired: {
          extensions: {
            ...declaredBazaar(),
            other: { retained: true },
          },
        },
      },
    } as never)
    expect(admitted).toMatchObject({
      kind: 'admitted',
      discovery: { kind: 'admitted', method: 'POST' },
      source: {
        resource: {
          paymentRequired: { extensions: { other: { retained: true } } },
        },
      },
    })

    expect(materializeOfficialBazaarX402Import({
      kind: 'x402',
      resource: { paymentRequired: { extensions: {} } },
    } as never)).toEqual({
      kind: 'refused',
      discovery: { kind: 'absent' },
    })
  })
})
