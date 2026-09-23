import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { validate } from '@scalar/openapi-parser'
import { describe, expect, it } from 'vitest'

import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT } from '@/modules/agent-access/account.actions'
import { createDevelopersApiViewModel } from '@/components/ae/developers/api-reference/developers-api.view-model'

import { buildOpenApiDocumentWithMetrics } from '@/modules/discovery/public'

/** Route source, not OpenAPI declarations, is the parity authority. */

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
function actualRouteMethods(): string[] {
  const routesDirectory = fileURLToPath(new URL('../../../src/routes/', import.meta.url))
  return readdirSync(routesDirectory)
    .filter((name) => /^api\.v1\..+\.ts$/u.test(name) || /^api\.businesses(?:\..+)?\.ts$/u.test(name))
    .flatMap((name) => {
      const source = readFileSync(`${routesDirectory}/${name}`, 'utf8')
      const routerPath = /createFileRoute\('([^']+)'\)/u.exec(source)?.[1]
      if (routerPath === undefined) throw new Error(`Missing route path in ${name}`)
      const methods = [...source.matchAll(/\b(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|TRACE|CONNECT):[^\n]*/gu)]
        .filter(([handler]) => !handler.includes('methodNotAllowed('))
        .map((match) => match[1])
      if (source.includes('postOnlyRoute(')) methods.push('POST')
      if (source.includes('[routeContract.method]')) {
        const contract = /const routeContract = CALL_ROUTE_CONTRACT\.(\w+)/u.exec(source)?.[1]
        if (contract === undefined) {
          if (!source.includes('AGENT_ACCOUNT_SELF_ROUTE_CONTRACT')) throw new Error(`Unknown route contract: ${name}`)
          methods.push(AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.method)
        } else {
          const callContracts = CALL_ROUTE_CONTRACT as Record<string, unknown>
          const entry = callContracts[contract]
          if (typeof entry !== 'object' || entry === null || !('method' in entry) || typeof entry.method !== 'string') {
            throw new Error(`Unknown call route contract: ${name}`)
          }
          methods.push(entry.method)
        }
      }
      if (methods.length === 0) throw new Error(`Missing handler method in ${name}`)
      const path = routerPath.replace(/\$([^/]+)/gu, '{$1}')
      return methods.map((method) => `${method} ${path}`)
    }).sort()
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

  it('matches every live v1 route method and has no orphan paths', () => {
    const documented = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`)).sort()
    expect(documented).toEqual(actualRouteMethods())
    expect(document.paths['/api/v1/account/funding-sessions']?.post).toBeDefined()
  })
  it('documents funding header idempotency and complete Call/procure body contracts', () => {
    const paths = document.paths as unknown as Record<string, Record<string, {
      requestBody?: { content: { 'application/json': { schema: { $ref?: string; properties?: Record<string, unknown>; oneOf?: readonly unknown[] } } } }
      parameters?: readonly { name: string; in: string; required: boolean }[]
      responses: Record<string, { content?: Record<string, unknown> }>
      security: readonly Record<string, readonly string[]>[]
    }>>
    const schemaDocument = result.document as { components: { schemas: Record<string, { properties?: Record<string, unknown>; oneOf?: readonly unknown[] }> } }
    const schemas = schemaDocument.components.schemas
    const resolveBody = (path: string) => {
      const body = paths[path]?.post?.requestBody?.content['application/json'].schema
      if (body === undefined) throw new Error(`Missing JSON request body: ${path}`)
      return body.$ref === undefined ? body : schemas[body.$ref.slice('#/components/schemas/'.length)]
    }
    const funding = paths['/api/v1/account/funding-sessions']?.post
    if (funding === undefined) throw new Error('Missing funding create')
    expect(funding.parameters).toContainEqual(expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }))
    expect(Object.keys(resolveBody('/api/v1/account/funding-sessions')?.properties ?? {})).toEqual(['principalAmount'])
    expect(funding.responses['201']?.content?.['application/json']).toBeDefined()
    expect(funding.responses['400']?.content?.['application/problem+json']).toBeDefined()
    expect(funding.security).toEqual([{ agentAccessKey: [] }])
    expect(resolveBody('/api/v1/tools/call')?.properties).toHaveProperty('idempotencyKey')
    expect(resolveBody('/api/v1/tools/procure')?.oneOf).toHaveLength(2)
    expect(paths['/api/v1/account/funding-sessions/public/{fundingSessionId}']?.get?.security).toEqual([])
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
      const wire = document.paths[operation.path]?.[operation.method.toLowerCase()] as { security?: unknown[] }
      if (wire.security?.length) expect(operation.curl).toContain('Authorization: Bearer <your key>')
      else expect(operation.curl).not.toContain('Authorization: Bearer')
      if (operation.method === 'POST') {
        expect(operation.curl).toContain('Content-Type: application/json')
        expect(operation.curl).toContain('--data ')
      }
    }
    expect(pageOperations.find((operation) => operation.path === '/api/v1/account/funding-sessions')?.curl).toContain('Idempotency-Key: <stable-key>')
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
