import { validate } from '@scalar/openapi-parser'
import { describe, expect, it } from 'vitest'

import {
  buildOpenApiDocumentWithMetrics,
  listOpenApiOperationIds,
} from '@/modules/discovery/public'

/**
 * The OpenAPI document is a pure projection of the same contract lists that
 * govern the Call gateway, the Tool market reads, funding preflight, and the
 * business/utility routes. If any of those silently dropped out of the
 * document, an agent reading `/openapi.json` (or a human on
 * `/developers/api`) would see an API surface that has quietly drifted from
 * what the platform actually serves.
 */

const origin = 'https://ae.test'
const result = buildOpenApiDocumentWithMetrics({ canonicalBaseUrl: `${origin}/` })
const document = result.document as Readonly<{
  openapi: string
  servers: readonly Readonly<{ url: string }>[]
  paths: Readonly<Record<string, Readonly<Record<string, Readonly<{ operationId: string }>>>>>
}>

function collectOperationIds(): readonly string[] {
  const ids: string[] = []
  for (const methods of Object.values(document.paths)) {
    for (const operation of Object.values(methods)) ids.push(operation.operationId)
  }
  return ids
}

describe('openapi document', () => {
  it('validates as a well-formed OpenAPI 3.1 document', async () => {
    const validated = await validate(document)
    expect(validated.errors ?? [], JSON.stringify(validated.errors)).toEqual([])
    expect(validated.valid).toBe(true)
  })

  it('declares the canonical version and one server anchored to the caller-supplied origin', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.servers).toEqual([{ url: origin }])
  })

  it('exposes exactly the declared operations, once each (parity guard)', () => {
    const expected = listOpenApiOperationIds()
    const actual = collectOperationIds()
    expect(new Set(actual).size).toBe(actual.length)
    expect([...actual].sort()).toEqual([...expected].sort())
  })

  it('measures the document both inline and by $ref, and records which shape it serves', () => {
    expect(result.refBytes).toBeGreaterThan(0)
    expect(result.inlineBytes).toBeGreaterThan(0)
    expect(result.inlineBytes).toBeGreaterThanOrEqual(result.refBytes)
    expect(['ref', 'inline']).toContain(result.chosen)
    expect(result.chosen).toBe(result.inlineBytes > 300_000 ? 'ref' : 'inline')
  })

  it('is deterministic given the same origin', () => {
    const again = buildOpenApiDocumentWithMetrics({ canonicalBaseUrl: `${origin}/` })
    expect(again.document).toEqual(result.document)
  })
})
