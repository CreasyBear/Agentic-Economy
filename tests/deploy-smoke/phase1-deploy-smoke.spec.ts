import { expect, request, test } from '@playwright/test'
import { existsSync } from 'node:fs'

type SmokeConfig = {
  baseUrl: URL
  convexUrl: URL
  adminStorageState: string
  ownerStorageState: string
  businessSlug: string
}

type RouteExpectation = {
  path: string
  status: number
  contentType: RegExp
  cache?: 'no-store'
  cors?: '*'
  mustContain?: readonly string[]
  mustNotMatch?: RegExp
}

const config = readSmokeConfig()

const privateSurfacePattern =
  /\/admin\/|\/owner\/status|ownerId|adminId|clerkUserId|sourceHash|rawContact|private:evidence|MCP|OpenAPI|paymentRequired=true|callable=true/i

const publicRoutes: readonly RouteExpectation[] = [
  {
    path: '/',
    status: 200,
    contentType: /text\/html/i,
    mustContain: ['Claim and publish a truthful service page'],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: '/claim',
    status: 200,
    contentType: /text\/html/i,
    mustContain: ['Business name', 'Publish service page'],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: `/claim/success?slug=${config.businessSlug}`,
    status: 200,
    contentType: /text\/html/i,
    mustContain: ['Your service page is published', `/${config.businessSlug}`],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: '/privacy/remove-business',
    status: 200,
    contentType: /text\/html/i,
    mustContain: ['Request removal or correction', 'Contact email'],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: '/registry',
    status: 200,
    contentType: /text\/html/i,
    mustContain: ['Search published service catalog facts', config.businessSlug],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: '/api/businesses',
    status: 200,
    contentType: /application\/json/i,
    cache: 'no-store',
    mustContain: ['public-business-catalog-api:v1', config.businessSlug],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: '/api/businesses/search?q=',
    status: 200,
    contentType: /application\/json/i,
    cache: 'no-store',
    mustContain: ['"kind":"ok"', '"query":""'],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: `/api/businesses/${config.businessSlug}`,
    status: 200,
    contentType: /application\/json/i,
    cache: 'no-store',
    mustContain: ['public-business-catalog-api:v1', config.businessSlug],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: `/${config.businessSlug}`,
    status: 200,
    contentType: /text\/html/i,
    mustContain: ['Public service facts', 'First request not available yet'],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: `/${config.businessSlug}/ucp`,
    status: 200,
    contentType: /application\/json/i,
    cache: 'no-store',
    cors: '*',
    mustContain: ['ae-ucp-fallback:v1', config.businessSlug, '"callable":false', '"paymentRequired":false'],
    mustNotMatch: privateSurfacePattern,
  },
  {
    path: '/llms.txt',
    status: 200,
    contentType: /text\/plain/i,
    cache: 'no-store',
    cors: '*',
    mustContain: [`/${config.businessSlug}/ucp`, 'callable=false', 'paymentRequired=false'],
    mustNotMatch: /Ignore previous instructions|<script|ownerId|clerk|rawContact|paymentRequired=true|callable=true/i,
  },
  {
    path: '/sitemap.xml',
    status: 200,
    contentType: /application\/xml/i,
    cache: 'no-store',
    cors: '*',
    mustContain: ['<urlset', `/${config.businessSlug}</loc>`],
    mustNotMatch: /\/admin\/|\/claim\/success|\/owner\/status|\/ucp<\/loc>|suppressed/i,
  },
  {
    path: '/robots.txt',
    status: 200,
    contentType: /text\/plain/i,
    cache: 'no-store',
    cors: '*',
    mustContain: ['User-agent: *', 'Disallow: /admin/', 'Disallow: /claim/success', 'Sitemap:'],
    mustNotMatch: /Allow: \/admin\//i,
  },
]

test.describe('Phase 1 deployed readback smoke', () => {
  test('public routes, APIs, discovery files, and headers match Phase 1 contracts', async ({ request: api }) => {
    for (const route of publicRoutes) {
      const response = await api.get(resolvePath(route.path))
      const body = await response.text()

      expect(response.status(), route.path).toBe(route.status)
      expect(response.headers()['content-type'] ?? '', route.path).toMatch(route.contentType)

      if (route.cache === 'no-store') {
        expect(response.headers()['cache-control'] ?? '', route.path).toContain('no-store')
      }

      if (route.cors !== undefined) {
        expect(response.headers()['access-control-allow-origin'], route.path).toBe(route.cors)
      }

      for (const expected of route.mustContain ?? []) {
        expect(body, route.path).toContain(expected)
      }

      if (route.mustNotMatch !== undefined) {
        expect(body, route.path).not.toMatch(route.mustNotMatch)
      }
    }
  })

  test('published public page is indexable and private/admin pages are not discoverable', async ({ request: api }) => {
    const publicPage = await api.get(resolvePath(`/${config.businessSlug}`))
    const publicBody = await publicPage.text()
    expect(publicPage.status()).toBe(200)
    expect(publicBody).toMatch(/<meta[^>]+name=["']robots["'][^>]+content=["']index["']/i)
    expect(publicBody).toMatch(new RegExp(`rel=["']canonical["'][^>]+/${escapeRegExp(config.businessSlug)}`, 'i'))

    const missingPage = await api.get(resolvePath('/missing-business-smoke-slug'))
    const missingBody = await missingPage.text()
    expect(missingPage.status()).toBe(200)
    expect(missingBody).toMatch(/<meta[^>]+name=["']robots["'][^>]+content=["']noindex["']/i)

    const sitemap = await api.get(resolvePath('/sitemap.xml'))
    const sitemapBody = await sitemap.text()
    expect(sitemapBody).not.toMatch(/\/admin\/|\/claim\/success|\/owner\/status|missing-business-smoke-slug/i)
  })

  test('owner session is denied from admin readback routes', async () => {
    const ownerContext = await request.newContext({ storageState: config.ownerStorageState })

    try {
      for (const route of ['/admin/claims', '/admin/audit-events', '/admin/index-health']) {
        const response = await ownerContext.get(resolvePath(route))
        const body = await response.text()

        expect(response.status(), route).toBe(200)
        expect(body, route).toContain('Access denied')
        expect(body, route).toMatch(/HTTP (401|403)/)
        expect(body, route).toMatch(/Private rows returned[\s\S]*?>0</i)
        expect(body, route).not.toMatch(/private:evidence|rawContact|sourceHash|registry:attempt|adminMembershipAuditEvents/i)
      }
    } finally {
      await ownerContext.dispose()
    }
  })

  test('admin session exposes operator readback and kill-switch/suppression control surfaces', async () => {
    const adminContext = await request.newContext({ storageState: config.adminStorageState })

    try {
      const indexHealth = await adminContext.get(resolvePath('/admin/index-health'))
      const indexBody = await indexHealth.text()
      expect(indexHealth.status()).toBe(200)
      expect(indexBody).toContain('Index readback')
      expect(indexBody).toMatch(/Regenerate projection|No repair available|Source auth required/)
      expect(indexBody).toMatch(/Public surfaces|Readback|Repair result/)
      expect(indexBody).not.toMatch(/Access denied|Private rows returned<\/span>\s*<span[^>]*>0/i)

      const claims = await adminContext.get(resolvePath('/admin/claims'))
      const claimsBody = await claims.text()
      expect(claims.status()).toBe(200)
      expect(claimsBody).toMatch(/Claim recovery readback|Review claim/)

      const audit = await adminContext.get(resolvePath('/admin/audit-events'))
      const auditBody = await audit.text()
      expect(audit.status()).toBe(200)
      expect(auditBody).toMatch(/Audit readback|Inspect audit/)
    } finally {
      await adminContext.dispose()
    }
  })

  test('Convex deployment URL is explicit, HTTPS, and reachable for readback', async () => {
    expect(config.convexUrl.protocol).toBe('https:')
    expect(config.convexUrl.hostname).not.toMatch(/localhost|127\.0\.0\.1|example/i)

    const convexContext = await request.newContext()
    try {
      const response = await convexContext.get(config.convexUrl.toString(), {
        failOnStatusCode: false,
        timeout: 15_000,
      })

      expect(response.status()).toBeLessThan(500)
    } finally {
      await convexContext.dispose()
    }
  })
})

function readSmokeConfig(): SmokeConfig {
  const required = {
    DEPLOY_BASE_URL: process.env.DEPLOY_BASE_URL,
    DEPLOY_CONVEX_URL: process.env.DEPLOY_CONVEX_URL,
    SMOKE_ADMIN_STORAGE_STATE: process.env.SMOKE_ADMIN_STORAGE_STATE,
    SMOKE_OWNER_STORAGE_STATE: process.env.SMOKE_OWNER_STORAGE_STATE,
    SMOKE_BUSINESS_SLUG: process.env.SMOKE_BUSINESS_SLUG,
  }

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value.trim().length === 0)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required deploy smoke env: ${missing.join(', ')}.`,
        'Set DEPLOY_BASE_URL, DEPLOY_CONVEX_URL, SMOKE_ADMIN_STORAGE_STATE, SMOKE_OWNER_STORAGE_STATE, and SMOKE_BUSINESS_SLUG.',
        'Storage-state files are local operator artifacts and must not be committed.',
      ].join(' ')
    )
  }

  const adminStorageState = required.SMOKE_ADMIN_STORAGE_STATE as string
  const ownerStorageState = required.SMOKE_OWNER_STORAGE_STATE as string
  const missingStorageStates = [adminStorageState, ownerStorageState].filter((path) => !existsSync(path))

  if (missingStorageStates.length > 0) {
    throw new Error(
      `Deploy smoke storage-state file(s) not found: ${missingStorageStates.join(', ')}. Generate them locally and keep them out of git.`
    )
  }

  const baseUrl = parseHttpsUrl('DEPLOY_BASE_URL', required.DEPLOY_BASE_URL as string)
  const convexUrl = parseHttpsUrl('DEPLOY_CONVEX_URL', required.DEPLOY_CONVEX_URL as string)
  const businessSlug = (required.SMOKE_BUSINESS_SLUG as string).trim()

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessSlug)) {
    throw new Error('SMOKE_BUSINESS_SLUG must be a lowercase public route slug, such as parramatta-emergency-plumbing.')
  }

  return {
    baseUrl,
    convexUrl,
    adminStorageState,
    ownerStorageState,
    businessSlug,
  }
}

function parseHttpsUrl(name: string, rawValue: string): URL {
  let parsed: URL

  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https:// for deployed readback smoke.`)
  }

  if (/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
    throw new Error(`${name} must point at a deployed environment, not localhost.`)
  }

  return parsed
}

function resolvePath(path: string): string {
  return new URL(path, config.baseUrl).toString()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
