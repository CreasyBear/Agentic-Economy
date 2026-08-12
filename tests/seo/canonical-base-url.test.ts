import { describe, expect, it } from 'vitest'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { getDefaultPublicOwnerStatusReadback } from '@/modules/catalog/public'
import { buildPublicBusinessRouteSeo } from '@/modules/seo/public-route'
import { handleUcpManifestRequest, handleLlmsTxtRequest, handleSitemapXmlRequest } from '../helpers/discovery-fixture-routes'
import { createFixtureDiscoverySourceState } from '../helpers/discovery-fixture-source-state'
import { handleDeveloperDiscoverySchemaRequest } from '@/routes/api.discovery.schema'
import { handleRobotsTxtRequest } from '@/routes/robots[.]txt'

describe('canonical base URL resolution', () => {
  it('prefers configured canonical base URL over an allowlisted request origin', async () => {
    await withCanonicalEnv(
      {
        AE_CANONICAL_BASE_URL: 'https://agentic.example/',
        AE_CANONICAL_HOST_ALLOWLIST: 'proxy.agentic.test',
      },
      () => {
        const result = resolveCanonicalBaseUrl(new Request('https://proxy.agentic.test/llms.txt'))

        expect(result).toEqual({ kind: 'configured', baseUrl: 'https://agentic.example' })
      }
    )
  })

  it('uses the request origin only when the host is allowlisted', async () => {
    await withCanonicalEnv({ AE_CANONICAL_HOST_ALLOWLIST: 'public.agentic.test, partner.agentic.test:8443' }, () => {
      const result = resolveCanonicalBaseUrl(new Request('https://partner.agentic.test:8443/sitemap.xml'))

      expect(result).toEqual({ kind: 'allowlisted-origin', baseUrl: 'https://partner.agentic.test:8443' })
    })
  })

  it('uses a localhost request origin on a dynamic port outside production', async () => {
    await withCanonicalEnv({ NODE_ENV: 'development' }, () => {
      expect(resolveCanonicalBaseUrl(new Request('http://localhost:5173/llms.txt'))).toEqual({
        kind: 'loopback-origin',
        baseUrl: 'http://localhost:5173',
      })
    })
  })

  it('uses a 127.0.0.1 request origin on a dynamic port outside production', async () => {
    await withCanonicalEnv({ NODE_ENV: 'development' }, () => {
      expect(resolveCanonicalBaseUrl(new Request('http://127.0.0.1:4173/sitemap.xml'))).toEqual({
        kind: 'loopback-origin',
        baseUrl: 'http://127.0.0.1:4173',
      })
    })
  })

  it('uses the IPv6 loopback request origin on a dynamic port outside production', async () => {
    await withCanonicalEnv({ NODE_ENV: 'development' }, () => {
      expect(resolveCanonicalBaseUrl(new Request('http://[::1]:5174/robots.txt'))).toEqual({
        kind: 'loopback-origin',
        baseUrl: 'http://[::1]:5174',
      })
    })
  })

  it('rejects unlisted request hosts and falls back without using the placeholder domain', async () => {
    await withCanonicalEnv({}, () => {
      const result = resolveCanonicalBaseUrl(new Request('https://spoofed.example/robots.txt'))

      expect(result.kind).toBe('fallback')
      expect(result.baseUrl).not.toBe('https://spoofed.example')
      expect(result.baseUrl).not.toBe('https://ae.example')
    })
  })

  it('uses the localhost fallback outside production when no canonical config exists', async () => {
    await withCanonicalEnv({ NODE_ENV: 'development' }, () => {
      expect(resolveCanonicalBaseUrl()).toEqual({ kind: 'fallback', baseUrl: 'http://localhost:3000' })
    })
  })

  it('fails closed in production when no canonical config or allowlisted request exists', async () => {
    await withCanonicalEnv({ NODE_ENV: 'production' }, () => {
      expect(() => resolveCanonicalBaseUrl()).toThrow('canonical_base_url_configuration_required')
    })
  })

  it('fails closed in production even for a loopback request origin', async () => {
    await withCanonicalEnv({ NODE_ENV: 'production' }, () => {
      expect(() => resolveCanonicalBaseUrl(new Request('http://localhost:5173/llms.txt'))).toThrow(
        'canonical_base_url_configuration_required'
      )
    })
  })

  it('fails closed in production for an unlisted request host', async () => {
    await withCanonicalEnv({ NODE_ENV: 'production' }, () => {
      expect(() => resolveCanonicalBaseUrl(new Request('https://spoofed.example/robots.txt'))).toThrow(
        'canonical_base_url_configuration_required'
      )
    })
  })
})

describe('canonical base URL route outputs', () => {
  it('emits the configured canonical base URL across public SEO and discovery outputs', async () => {
    await withCanonicalEnv(
      {
        AE_CANONICAL_BASE_URL: 'https://canonical.agentic.test/',
        AE_CANONICAL_HOST_ALLOWLIST: 'untrusted.agentic.test',
      },
      async () => {
        const serialized = await readSerializedPublicOutputs('https://untrusted.agentic.test')

        expect(serialized).toContain('https://canonical.agentic.test/')
        expect(serialized).toContain('<loc>https://canonical.agentic.test/parramatta-emergency-plumbing</loc>')
        expect(serialized).toContain('Sitemap: https://canonical.agentic.test/sitemap.xml')
        expect(serialized).toContain('https://canonical.agentic.test/parramatta-emergency-plumbing/ucp')
        expect(serialized).toContain('https://canonical.agentic.test/api/businesses')
        expect(serialized).toContain('https://canonical.agentic.test/parramatta-emergency-plumbing')
        expect(serialized).not.toContain('https://untrusted.agentic.test')
        expect(serialized).not.toContain('https://ae.example')
      }
    )
  })

  it('emits an allowlisted request origin across public SEO and discovery outputs', async () => {
    await withCanonicalEnv({ AE_CANONICAL_HOST_ALLOWLIST: 'public.agentic.test' }, async () => {
      const serialized = await readSerializedPublicOutputs('https://public.agentic.test')

      expect(serialized).toContain('https://public.agentic.test/')
      expect(serialized).toContain('<loc>https://public.agentic.test/parramatta-emergency-plumbing</loc>')
      expect(serialized).toContain('Sitemap: https://public.agentic.test/sitemap.xml')
      expect(serialized).toContain('https://public.agentic.test/parramatta-emergency-plumbing/ucp')
      expect(serialized).toContain('https://public.agentic.test/api/businesses')
      expect(serialized).not.toContain('https://ae.example')
    })
  })

  it('does not emit an unlisted forwarded host from public SEO or discovery outputs', async () => {
    await withCanonicalEnv({}, async () => {
      const serialized = await readSerializedPublicOutputs('https://forwarded-spoof.agentic.test')

      expect(serialized).not.toContain('https://forwarded-spoof.agentic.test')
      expect(serialized).not.toContain('https://ae.example')
    })
  })
})

async function readSerializedPublicOutputs(origin: string): Promise<string> {
  const state = createFixtureDiscoverySourceState()
  const catalog = getDefaultPublicOwnerStatusReadback().catalog

  const llms = handleLlmsTxtRequest(new Request(`${origin}/llms.txt`))
  const sitemap = handleSitemapXmlRequest(new Request(`${origin}/sitemap.xml`))
  const robots = handleRobotsTxtRequest(new Request(`${origin}/robots.txt`))
  const ucp = handleUcpManifestRequest(new Request(`${origin}/${catalog.slug}/ucp`), catalog.slug, state)
  const schema = await handleDeveloperDiscoverySchemaRequest(new Request(`${origin}/api/discovery/schema`), state, {
    now: 0,
  })
  const canonicalBaseUrl = resolveCanonicalBaseUrl(new Request(`${origin}/${catalog.slug}`)).baseUrl
  const seo = buildPublicBusinessRouteSeo(catalog, canonicalBaseUrl)

  const serialized = [
    await llms.text(),
    await sitemap.text(),
    await robots.text(),
    await ucp.text(),
    await schema.text(),
    seo.canonicalUrl,
    JSON.stringify(seo.jsonLd),
  ].join('\n')

  return serialized
}

type CanonicalEnv = {
  AE_CANONICAL_BASE_URL?: string
  AE_CANONICAL_HOST_ALLOWLIST?: string
  NODE_ENV?: string
}

async function withCanonicalEnv<T>(env: CanonicalEnv, run: () => T | Promise<T>): Promise<T> {
  const previousBaseUrl = process.env.AE_CANONICAL_BASE_URL
  const previousAllowlist = process.env.AE_CANONICAL_HOST_ALLOWLIST
  const previousNodeEnv = process.env.NODE_ENV
  setOptionalEnv('AE_CANONICAL_BASE_URL', env.AE_CANONICAL_BASE_URL)
  setOptionalEnv('AE_CANONICAL_HOST_ALLOWLIST', env.AE_CANONICAL_HOST_ALLOWLIST)
  setOptionalEnv('NODE_ENV', env.NODE_ENV ?? previousNodeEnv)

  try {
    return await run()
  } finally {
    setOptionalEnv('AE_CANONICAL_BASE_URL', previousBaseUrl)
    setOptionalEnv('AE_CANONICAL_HOST_ALLOWLIST', previousAllowlist)
    setOptionalEnv('NODE_ENV', previousNodeEnv)
  }
}

function setOptionalEnv(name: keyof CanonicalEnv, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}
