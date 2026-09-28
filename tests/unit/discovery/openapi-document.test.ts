import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { validate } from '@scalar/openapi-parser'
import { describe, expect, it } from 'vitest'

import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT } from '@/modules/agent-access/account.actions'
import { createDevelopersApiViewModel } from '@/components/ae/developers/api-reference/developers-api.view-model'
import { toolCatalogSearchInputSchema } from '@/modules/registry/tool-choice-contracts'

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

  it('projects OpenAPI metadata, errors, price, and version copy', () => {
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

  })
  it('copies a schema-valid POST Search but only displays required schema and authority for consequential requests', () => {
    const page = createDevelopersApiViewModel(result.document)
    const operations = page.operationGroups.flatMap((group) => group.operations)
    const search = operations.find((operation) => operation.operationId === 'registry.tools.search')
    expect(search?.curl).toContain('curl --request POST')
    expect(search?.curl).toContain(`${origin}/api/v1/market-tools/search`)
    const body = /--data '([^']+)'/u.exec(search?.curl ?? '')?.[1]
    const searchDocument = result.document as {
      paths: Record<string, { post?: { requestBody?: { content?: { 'application/json'?: { schema?: unknown; example?: unknown } } } } }>
    }
    const media = searchDocument.paths['/api/v1/market-tools/search']?.post?.requestBody?.content?.['application/json']
    expect(media?.schema).toBeDefined()
    expect(media?.example).toEqual(JSON.parse(body ?? 'null'))
    expect(toolCatalogSearchInputSchema.parse(JSON.parse(body ?? 'null')).query).toBe('convert a time between time zones')

    const call = operations.find((operation) => operation.path === '/api/v1/tools/call')
    expect(call?.curl).toBeUndefined()
    expect(call?.template).toContain('idempotencyKey')
    expect(call?.authority).toContain('market_tools:call')
    const withWriteExample = structuredClone(result.document) as {
      paths: Record<string, { post?: { requestBody?: { content?: { 'application/json'?: { example?: unknown } } } } }>
    }
    const callMedia = withWriteExample.paths['/api/v1/tools/call']?.post?.requestBody?.content?.['application/json']
    if (callMedia === undefined) throw new Error('Missing Call request body')
    callMedia.example = { idempotencyKey: 'example' }
    expect(createDevelopersApiViewModel(withWriteExample).operationGroups
      .flatMap((group) => group.operations)
      .find((operation) => operation.path === '/api/v1/tools/call')?.curl).toBeUndefined()
    const funding = operations.find((operation) => operation.path === '/api/v1/account/funding-sessions')
    expect(funding?.curl).toBeUndefined()
    expect(funding?.template).toContain('principalAmount')
    expect(funding?.authority).toContain('Agent access key')
  })
})
