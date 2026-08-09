import { globSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildSiteDiscoveryManifest } from '@/modules/discovery/public'

/**
 * `/.well-known/ucp` is the only document a cold agent reads before it knows
 * anything about AE. An advertised path that 404s is worse than no document at
 * all: the agent burns its one entry point and concludes AE is broken. So the
 * central contract here is that every URL the document publishes resolves to a
 * route this app actually serves.
 */

const routesDir = path.resolve(__dirname, '../../../src/routes')
const origin = 'https://ae.test'
const dotEscape = '\u0000'

function readRoutePaths(dir: string, prefix: string, into: Set<string>): void {
  for (const route of globSync(path.join(dir, '**/*.{ts,tsx}')).sort()) {
    const relative = path.relative(dir, route).split(path.sep).join('/')
    const entryName = relative.slice(relative.lastIndexOf('/') + 1)
    if (entryName.startsWith('__root')) continue

    const withoutExtension = `${prefix}${relative}`.replace(/\.tsx?$/u, '')
    const segments = withoutExtension
      .replaceAll('[.]', dotEscape)
      .replaceAll('/', '.')
      .split('.')
      // `_operator` and friends are pathless layout segments.
      .filter((segment) => segment.length > 0 && !segment.startsWith('_'))
      .map((segment) => segment.replaceAll(dotEscape, '.'))
    const last = segments.at(-1)
    const pathSegments = last === 'index' ? segments.slice(0, -1) : segments
    into.add(`/${pathSegments.join('/')}`.replace(/\/$/u, '') || '/')
  }
}

const routePaths = new Set<string>()
readRoutePaths(routesDir, '', routePaths)

function collectAdvertisedUrls(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith(origin)) into.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAdvertisedUrls(item, into)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectAdvertisedUrls(item, into)
  }
}

const manifest = buildSiteDiscoveryManifest({ canonicalBaseUrl: `${origin}/`, now: 1_700_000_000_000 })

describe('Site discovery manifest', () => {
  it('resolves the route-file scan it depends on', () => {
    // Guards the helper itself: a broken scan would make every path "missing".
    expect(routePaths.has('/.well-known/http-message-signatures-directory')).toBe(true)
    expect(routePaths.has('/$slug/ucp')).toBe(true)
    expect(routePaths.has('/$slug/tools/$toolId')).toBe(true)
    expect(routePaths.has('/$slug/tools/$toolId/prepare')).toBe(true)
    expect(routePaths.has('/llms.txt')).toBe(true)
    expect(routePaths.has('/agent-access')).toBe(true)
    expect(routePaths.has('/')).toBe(true)
  })

  it('advertises only URLs this app serves', () => {
    const advertised = new Set<string>()
    collectAdvertisedUrls(manifest, advertised)

    const missing = [...advertised].filter((url) => {
      const withoutQuery = url.slice(origin.length).split('?')[0] || '/'
      // Any `{name}` placeholder maps to the router's `$name` segment, so a
      // templated endpoint is still checked against a real route file.
      return !routePaths.has(withoutQuery.replace(/\{(\w+)\}/gu, '$$$1'))
    })

    expect(missing).toEqual([])
    expect(advertised.size).toBeGreaterThan(10)
  })

  it('gives a cold agent the catalog, search, manifest, and request entry points', () => {
    const pathsByKind = new Map<string, readonly string[]>(
      manifest.endpoints.map((endpoint) => [
        endpoint.kind,
        manifest.endpoints.filter((other) => other.kind === endpoint.kind).map((other) => other.path),
      ])
    )

    expect(pathsByKind.get('catalog_list')).toEqual(['/api/businesses'])
    expect(pathsByKind.get('catalog_search')).toEqual(['/api/businesses/search?q='])
    expect(pathsByKind.get('business_manifest')).toEqual(['/{slug}/ucp'])
    expect(pathsByKind.get('customer_request_submit')).toEqual(['/api/v1/requests'])
    expect(pathsByKind.get('answer_turn')).toEqual(['/api/answer/turn'])
    expect(pathsByKind.get('customer_request_schema')).toEqual(['/api/v1/requests/schema'])
    expect(pathsByKind.get('discovery_artifact')).toEqual([
      '/api/discovery/schema',
      '/api/discovery/examples',
      '/api/discovery/fixtures',
    ])
    expect(manifest.businessManifestUrlTemplate).toBe(`${origin}/{slug}/ucp`)
    expect(pathsByKind.get('site_entry_point')).toEqual(['/.well-known/ucp'])
  })

  it('states the authentication each endpoint actually enforces', () => {
    const submit = manifest.endpoints.find((endpoint) => endpoint.kind === 'customer_request_submit')
    const answerTurn = manifest.endpoints.find((endpoint) => endpoint.kind === 'answer_turn')

    // An agent that reads this as an open GET would fail its first real call.
    expect(submit).toMatchObject({
      method: 'POST',
      authentication: 'clerk_api_key',
      requiredScope: 'customer_requests:create',
    })
    expect(manifest.customerRequest.requiredScope).toBe('customer_requests:create')
    expect(answerTurn).toMatchObject({
      method: 'POST',
      authentication: 'none',
      mediaType: 'text/event-stream',
      requiredHeaders: {
        'Content-Type': 'application/json',
        'X-AE-Turn-Key': expect.stringContaining('not a credential'),
      },
    })

    const publicReads = manifest.endpoints.filter(
      (endpoint) => endpoint.kind !== 'customer_request_submit' && endpoint.kind !== 'answer_turn',
    )
    expect(publicReads.every((endpoint) => endpoint.method === 'GET')).toBe(true)
    expect(publicReads.every((endpoint) => endpoint.authentication === 'none')).toBe(true)
  })

  it('marks exactly the templated paths as templated', () => {
    const templated = manifest.endpoints.filter((endpoint) => endpoint.templated).map((endpoint) => endpoint.path)

    expect([...templated].sort()).toEqual(['/api/businesses/{slug}', '/{slug}/ucp'])
  })

  it('publishes each path once', () => {
    const paths = manifest.endpoints.map((endpoint) => endpoint.path)

    expect(paths).toEqual([...new Set(paths)])
  })

  it('carries the listing boundary and claims no capability AE withholds', () => {
    expect(manifest.boundary).toContain('do not select or execute routes')
    expect(manifest.unsupportedCapabilities.map((capability) => capability.label)).toContain(
      'Commercial or owner-action authority'
    )
  })
})
