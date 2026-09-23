import { validate } from '@scalar/openapi-parser'
import { describe, expect, it } from 'vitest'

import { createDevelopersApiViewModel } from '@/components/ae/developers/api-reference/developers-api.view-model'

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

  it('projects one runnable request per endpoint with canonical auth, errors, price, and version copy', () => {
    const page = createDevelopersApiViewModel(result.document)
    const rawDocument = result.document as {
      info: { version: string }
      components: {
        schemas: {
          Problem: {
            properties: {
              kind: { enum: readonly string[] }
              title: { enum: readonly string[] }
            }
          }
        }
        securitySchemes: { agentAccessKey: { description: string } }
      }
    }

    const pageOperations = page.operationGroups.flatMap((group) => group.operations)
    expect(pageOperations).toHaveLength(collectOperationIds().length)
    for (const operation of pageOperations) {
      expect(operation.curl).toContain(`curl --request ${operation.method}`)
      expect(operation.curl).toContain(`${origin}${operation.path}`)
      expect(operation.curl).toContain('Authorization: Bearer <your key>')
      if (operation.method === 'POST') {
        expect(operation.curl).toContain('Content-Type: application/json')
        expect(operation.curl).toContain('--data ')
      }
    }
    expect(page.authDescription).toBe(rawDocument.components.securitySchemes.agentAccessKey.description)
    expect(page.problems.map((problem) => problem.kind)).toEqual(
      rawDocument.components.schemas.Problem.properties.kind.enum,
    )
    expect(page.problems.map((problem) => problem.title)).toEqual(
      rawDocument.components.schemas.Problem.properties.title.enum,
    )
    expect(page.problems).toContainEqual({
      kind: 'UNAUTHENTICATED',
      type: 'about:blank',
      title: 'Unauthenticated',
      nextStep: 'Connect again and send a current Agent access key.',
    })
    expect(page.priceExample).toEqual({
      shape: 'ExactAmount { currency, units, exponent }',
      json: '{"currency":"AUD","units":"1250000","exponent":6}',
      formatted: 'A$1.25',
    })
    expect(JSON.stringify(result.document)).not.toMatch(
      /"tool\.procure"|"maxSpendAud"|"totalAud"|"netAud"|"gstAud"|"refundedAmountAud"|"netChargeAud"/u,
    )
    expect(page.versionPolicy).toBe(
      `Breaking changes ship as a new version; current version ${rawDocument.info.version}.`,
    )

    const withExample = structuredClone(result.document) as {
      paths: Record<string, Record<string, {
        operationId: string
        requestBody?: { content?: { 'application/json'?: { example?: unknown } } }
      }>>
    }
    const exampleOperation = Object.values(withExample.paths)
      .flatMap((methods) => Object.values(methods))
      .find((operation) => operation.requestBody?.content?.['application/json'] !== undefined)
    expect(exampleOperation).toBeDefined()
    if (exampleOperation?.requestBody?.content?.['application/json'] !== undefined) {
      exampleOperation.requestBody.content['application/json'].example = { need: 'weather' }
    }
    expect(
      createDevelopersApiViewModel(withExample).operationGroups
        .flatMap((group) => group.operations)
        .find((operation) => operation.operationId === exampleOperation?.operationId)?.curl,
    ).toContain(`--data '{"need":"weather"}'`)
  })
})
