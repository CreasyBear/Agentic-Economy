import { describe, expect, it } from 'vitest'

import { MCP_HTTP_ENDPOINT_PATH } from '@/lib/mcp-protocol'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  ApiCatalogManifestPath,
  buildApiCatalogDocument,
  DiscoveryPublicSurfacePaths,
} from '@/modules/discovery/public'

/**
 * The api-catalog linkset must be a projection: if any anchor stopped matching
 * the route lists that govern llms.txt, SKILL.md, and the site manifest, an
 * agent would be promised an API that drifted away underneath it.
 */

const origin = 'https://ae.test'

const document = buildApiCatalogDocument({ canonicalBaseUrl: `${origin}/` })

function collectLinks(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectLinks(item, into)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'href') into.add(String(item))
      else collectLinks(item, into)
    }
  }
}

describe('api-catalog document projection', () => {
  it('anchors exactly the market-operation reads, the invoke gateway, and MCP', () => {
    const anchors = document.linkset.map((entry) => entry.anchor)
    expect(anchors).toEqual([
      `${origin}/api/v1/market-operations/search`,
      `${origin}/api/v1/market-operations/detail`,
      `${origin}/api/v1/market-operations/compare`,
      `${origin}/api/v1/market-operations/inspect-plan`,
      `${origin}${OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path}`,
      `${origin}${MCP_HTTP_ENDPOINT_PATH}`,
    ])
    // Guard the projection inputs themselves so an emptied surface list fails here first.
    expect(DiscoveryPublicSurfacePaths.filter((path) => path.startsWith('/api/v1/market-operations/'))).toHaveLength(4)
  })

  it('is projection-pure: every href resolves against the served origin alone', () => {
    const hrefs = new Set<string>()
    collectLinks(document, hrefs)
    expect(hrefs.size).toBeGreaterThan(0)
    for (const href of hrefs) {
      expect(href.startsWith(`${origin}/`)).toBe(true)
    }
    expect(JSON.stringify(document).replaceAll(`${origin}`, '')).not.toContain('://')
  })

  it('invents no OpenAPI or spec document that this app does not serve', () => {
    const serialized = JSON.stringify(document)
    expect(serialized.toLowerCase()).not.toContain('openapi')
    expect(serialized).not.toContain('swagger')
    for (const entry of document.linkset) {
      expect('service-desc' in entry).toBe(false)
    }
  })

  it('documents each anchor through llms.txt, SKILL.md, and the agent guide', () => {
    for (const entry of document.linkset) {
      expect(entry['service-doc']).toEqual([
        { href: `${origin}/llms.txt`, type: 'text/plain' },
        { href: `${origin}/SKILL.md`, type: 'text/markdown' },
        { href: `${origin}/for-agents`, type: 'text/html' },
      ])
    }
  })

  it('points the machine descriptor relation at the site manifest', () => {
    for (const entry of document.linkset) {
      expect(entry.describedby).toEqual([{ href: `${origin}/.well-known/ucp`, type: 'application/json' }])
    }
  })

  it('lives under the machine-answered .well-known reserved prefix', () => {
    expect(ApiCatalogManifestPath.startsWith('/.well-known/')).toBe(true)
  })
})
