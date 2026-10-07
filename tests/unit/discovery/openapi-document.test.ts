import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { validate } from '@scalar/openapi-parser'
import { Validator, type Schema } from '@cfworker/json-schema'
import { describe, expect, it, vi } from 'vitest'

import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT } from '@/modules/agent-access/account.actions'
import { createDevelopersApiViewModel } from '@/components/ae/developers/api-reference/developers-api.view-model'
import { toolCatalogSearchInputSchema } from '@/modules/registry/tool-choice-contracts'

import { buildOpenApiDocumentWithMetrics } from '@/modules/discovery/public'
import applicationPackage from '../../../package.json'
import { providerToolContinuationSchema } from '@/modules/capability-supply/provider-tool-status'

// App package releases do not determine the public API contract revision.
vi.mock('../../../package.json', async importOriginal => {
  const original = await importOriginal<{ default: Record<string, unknown> }>()
  return { default: { ...original.default, version: '9.9.9-application-test' } }
})

/** Route source, not OpenAPI declarations, is the parity authority. */

const origin = 'https://ae.test'
const result = buildOpenApiDocumentWithMetrics({ canonicalBaseUrl: `${origin}/` })
const document = result.document as Readonly<{
  openapi: string
  info: Readonly<{ version: string }>
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

function atPointer(pointer: string): unknown {
  let value: unknown = result.document
  for (const key of pointer.split('/').slice(1)) {
    if (value === null || typeof value !== 'object') throw new Error(`Missing published contract: ${pointer}`)
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

describe('openapi document', () => {
  it('matches supplemental bounds, exact price constraints and emitted transport errors', () => {
    const paths = result.document.paths as Record<string, Record<string, {
      parameters?: readonly { name: string; schema: Record<string, unknown> }[]
      responses: Record<string, unknown>
    }>>
    const parameter = (path: string, name: string) => paths[path]?.get?.parameters?.find(item => item.name === name)?.schema
    expect(parameter('/api/v1/registry', 'cursor')).toMatchObject({ maxLength: 16384 })
    expect(parameter('/api/businesses/{slug}', 'slug')).toMatchObject({ maxLength: 200 })
    expect(parameter('/api/v1/businesses/{businessId}', 'businessId')).toMatchObject({ maxLength: 200 })
    expect(parameter('/api/businesses/search', 'max_price_currency')).toHaveProperty('pattern')
    expect(parameter('/api/businesses/search', 'max_price_exponent')).toMatchObject({ minimum: 0, maximum: 18 })
    for (const path of ['/api/v1/tools/call', '/api/v1/tools/quote', '/api/v1/tools/procure', '/api/v1/tools/plans/quote', '/api/v1/tools/plans/run', '/api/v1/tools/plans/cancel', '/api/v1/calls/{callRef}/cancel', '/api/v1/calls/{callRef}/reconcile']) {
      expect(paths[path]?.post?.responses).toHaveProperty('413')
      expect(paths[path]?.post?.responses).toHaveProperty('415')
    }
    for (const path of ['/api/v1/calls', '/api/v1/calls/{callRef}']) {
      for (const status of ['400', '500', '503']) expect(paths[path]?.get?.responses).toHaveProperty(status)
    }
    expect(paths['/api/v1/feedback']?.post?.responses).toHaveProperty('415')
    expect(paths['/api/v1/sandbox-reference']?.post?.responses).toHaveProperty('404')
    for (const method of ['get', 'head']) expect(paths['/api/v1/funding/constraints']?.[method]?.responses).toHaveProperty('503')
    for (const status of ['413', '415', '503']) expect(paths['/api/v1/funding/quote']?.post?.responses).toHaveProperty(status)
  })

  it('emits 2020-12 tuple schemas throughout the owner document', () => {
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return
      if (Array.isArray(value)) { value.forEach(visit); return }
      const node = value as Record<string, unknown>
      expect(Array.isArray(node.items)).toBe(false)
      if (Array.isArray(node.prefixItems)) {
        expect(node.minItems).toBe(node.prefixItems.length)
        expect(node.maxItems).toBe(node.prefixItems.length)
      }
      Object.values(node).forEach(visit)
    }
    visit(result.document)
  })

  it('preserves actual Provider continuation tuple literals and arity', () => {
    const tuple = providerToolContinuationSchema.options[0].shape.requiredInput
    const published = atPointer('/components/schemas/SupplyStatusResponse/anyOf/0/properties/status/properties/continuation/oneOf/0/properties/requiredInput')
    const validator = new Validator(published as Schema, '2020-12')
    expect(tuple.safeParse(['resourceUrl']).success).toBe(true)
    for (const value of [['resourceUrl'], [], ['wrong'], ['resourceUrl', 'extra']]) {
      expect(validator.validate(value).valid).toBe(tuple.safeParse(value).success)
    }
  })

  it('retains descriptions beside hoisted price references', () => {
    const published = atPointer('/components/schemas/RegistryToolsDescribeResponse/anyOf/0/properties/tool/properties/commercialPrice/oneOf/0/properties/amount')
    expect(published).toMatchObject({
      $ref: expect.stringMatching(/^#\/components\/schemas\//u),
      description: 'Exact executable price: currency, integer units, and decimal exponent',
    })
  })

  it('validates as a well-formed OpenAPI 3.1 document', async () => {
    const validated = await validate(document)
    expect(validated.errors ?? [], JSON.stringify(validated.errors)).toEqual([])
    expect(validated.valid).toBe(true)
  })

  it('declares the canonical version and one server anchored to the caller-supplied origin', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.info.version).toBe('1.0.0-alpha.2')
    expect(applicationPackage.version).toBe('9.9.9-application-test')
    expect(document.info.version).not.toBe(applicationPackage.version)
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
      requestBody?: { content: { 'application/json': { schema: { $ref?: string; properties?: Record<string, unknown>; additionalProperties?: boolean; oneOf?: readonly unknown[] } } } }
      parameters?: readonly { name: string; in: string; required: boolean }[]
      responses: Record<string, { content?: Record<string, unknown> }>
      security: readonly Record<string, readonly string[]>[]
    }>>
    const schemaDocument = result.document as { components: { schemas: Record<string, { properties?: Record<string, unknown>; additionalProperties?: boolean; oneOf?: readonly unknown[] }> } }
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
    expect(resolveBody('/api/v1/tools/call')?.additionalProperties).toBe(false)
    expect(resolveBody('/api/v1/tools/quote')?.additionalProperties).toBe(false)
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
