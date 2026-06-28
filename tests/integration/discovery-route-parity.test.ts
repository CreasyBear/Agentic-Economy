import { describe, expect, it } from 'vitest'

import { getPublicBusinessPageReadback } from '@/modules/catalog/public'
import {
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  createDefaultDiscoverySourceState,
} from '@/modules/discovery/public'
import { handleBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import { handleListBusinessesRequest } from '@/routes/api.businesses'
import { handleSearchBusinessesRequest } from '@/routes/api.businesses.search'
import { handleLlmsTxtRequest } from '@/routes/llms[.]txt'
import { handleRobotsTxtRequest } from '@/routes/robots[.]txt'
import { handleSitemapXmlRequest } from '@/routes/sitemap[.]xml'
import { handleUcpManifestRequest } from '@/routes/$slug.ucp'

describe('discovery route parity', () => {
  it('resolves every URL advertised by manifest, llms, sitemap, and robots outputs', async () => {
    const origin = 'https://ae.example'
    const state = createDefaultDiscoverySourceState()
    const manifestResponse = handleUcpManifestRequest(
      new Request(`${origin}/parramatta-emergency-plumbing/ucp`),
      'parramatta-emergency-plumbing'
    )
    const manifest = await manifestResponse.json()
    const llms = buildLlmsTxt(state, { canonicalBaseUrl: origin })
    const sitemap = buildSitemapXml(state, { canonicalBaseUrl: origin, now: 0 })
    const robots = buildRobotsTxt({ canonicalBaseUrl: origin })
    const urls = uniqueUrls([
      ...manifest.routes.map((route: { url: string }) => route.url),
      ...llms.urls,
      ...sitemap.urls,
      ...sitemapLocs(sitemap.body),
      ...robots.urls,
    ])

    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      const resolved = await resolveAdvertisedUrl(url)
      expect(resolved, url).toBe(true)
    }
  })

  it('keeps llms API routes aligned with public API response schemas', async () => {
    const origin = 'https://ae.example'
    const llms = buildLlmsTxt(createDefaultDiscoverySourceState(), { canonicalBaseUrl: origin })
    const listUrl = llms.urls.find((url) => new URL(url).pathname === '/api/businesses')
    const searchUrl = llms.urls.find((url) => new URL(url).pathname === '/api/businesses/search')
    const detailUrl = llms.urls.find((url) => new URL(url).pathname === '/api/businesses/parramatta-emergency-plumbing')

    if (listUrl === undefined || searchUrl === undefined || detailUrl === undefined) {
      throw new Error('Expected llms API URLs to be present.')
    }

    const listBody = await handleListBusinessesRequest(new Request(listUrl)).json()
    const searchBody = await handleSearchBusinessesRequest(new Request(searchUrl)).json()
    const detailBody = await handleBusinessDetailRequest('parramatta-emergency-plumbing').json()

    expect(listBody).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v1',
      items: [{ slug: 'parramatta-emergency-plumbing' }],
    })
    expect(searchBody).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v1',
      query: '',
      items: [],
    })
    expect(detailBody).toMatchObject({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v1',
      business: { slug: 'parramatta-emergency-plumbing' },
    })
  })
})

async function resolveAdvertisedUrl(url: string): Promise<boolean> {
  const parsed = new URL(url)
  const path = parsed.pathname

  if (path === '/') {
    return true
  }

  if (path === '/claim' || path === '/registry' || path === '/privacy/remove-business') {
    return true
  }

  if (path === '/llms.txt') {
    return handleLlmsTxtRequest(new Request(url)).status === 200
  }

  if (path === '/sitemap.xml') {
    return handleSitemapXmlRequest(new Request(url)).status === 200
  }

  if (path === '/robots.txt') {
    return handleRobotsTxtRequest(new Request(url)).status === 200
  }

  if (path === '/api/businesses') {
    return handleListBusinessesRequest(new Request(url)).status === 200
  }

  if (path === '/api/businesses/search') {
    return handleSearchBusinessesRequest(new Request(url)).status === 200
  }

  const detailMatch = /^\/api\/businesses\/([^/]+)$/u.exec(path)
  if (detailMatch?.[1] !== undefined) {
    return handleBusinessDetailRequest(detailMatch[1]).status === 200
  }

  const ucpMatch = /^\/([^/]+)\/ucp$/u.exec(path)
  if (ucpMatch?.[1] !== undefined) {
    return handleUcpManifestRequest(new Request(url), ucpMatch[1]).status === 200
  }

  const pageMatch = /^\/([^/]+)$/u.exec(path)
  if (pageMatch?.[1] !== undefined) {
    return getPublicBusinessPageReadback(pageMatch[1]).kind === 'available'
  }

  return false
}

function sitemapLocs(body: string): readonly string[] {
  return Array.from(body.matchAll(/<loc>([^<]+)<\/loc>/gu), (match) => match[1] ?? '')
    .filter((url) => url.length > 0)
}

function uniqueUrls(urls: readonly string[]): readonly string[] {
  return Array.from(new Set(urls))
}
