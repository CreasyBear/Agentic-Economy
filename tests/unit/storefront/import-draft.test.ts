import type { LookupAddress, LookupOptions } from 'node:dns'
import { describe, expect, it, vi } from 'vitest'

const dnsLookupMock = vi.hoisted(() =>
  vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
)

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}))

import {
  confirmStorefrontImportDraft,
  extractStorefrontDraftFromHtml,
} from '@/modules/storefront/public'
import { importStorefrontDraftFromWebsite } from '@/modules/storefront/server'
import { createGuardedLookup, isPublicHttpTarget } from '@/modules/network-guard/public'
import { handleImportStorefrontDraftRequest } from '@/routes/api.storefront.import-draft'

const fixtureHtml = `<!doctype html>
<html>
<head>
  <title>Northside Plumbing | Emergency Plumber in Preston</title>
  <meta name="description" content="Burst pipe repairs, blocked drains, and hot water help for Preston homes." />
  <meta property="og:image" content="https://northside.example/work-van.jpg" />
</head>
<body>
  <h1>Emergency plumbing repairs</h1>
  <p>Call 03 9000 0000 or email help@northside.example for plumbing help.</p>
</body>
</html>`

type ImportOptions = NonNullable<Parameters<typeof importStorefrontDraftFromWebsite>[1]>
type ImportDnsResolver = NonNullable<ImportOptions['dns']>

const publicDns: ImportDnsResolver = {
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}

function privateDns(address: string): ImportDnsResolver {
  return {
    lookup: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
  }
}

type GuardedLookupCallbackResult = {
  err: NodeJS.ErrnoException | null
  address: string | LookupAddress[]
  family: number | undefined
}

async function runGuardedLookup(
  dns: ImportDnsResolver,
  options: LookupOptions = {},
  hostname = 'northside.example'
): Promise<GuardedLookupCallbackResult> {
  const { promise, resolve } = Promise.withResolvers<GuardedLookupCallbackResult>()
  createGuardedLookup(dns)(hostname, options, (err, address, family) => {
    resolve({ err, address, family })
  })
  return promise
}

async function expectFetchRejected(websiteUrl: string, options: ImportOptions = {}) {
  const defaultFetch = async () => new Response(fixtureHtml, { status: 200, headers: { 'content-type': 'text/html' } })
  const importOptions: ImportOptions = {
    dns: options.dns ?? publicDns,
    fetch: options.fetch ?? defaultFetch,
  }
  if (options.maxRedirects !== undefined) {
    importOptions.maxRedirects = options.maxRedirects
  }
  if (options.maxResponseBytes !== undefined) {
    importOptions.maxResponseBytes = options.maxResponseBytes
  }
  if (options.timeoutMs !== undefined) {
    importOptions.timeoutMs = options.timeoutMs
  }

  const result = await importStorefrontDraftFromWebsite({ websiteUrl }, importOptions)

  expect(result).toMatchObject({
    kind: 'error',
    code: 'storefront_import_fetch_failed',
  })
  if (result.kind === 'error') {
    expect(result.reason).not.toMatch(/localhost|127\\.0\\.0\\.1|10\\.0\\.0\\.1|172\\.16\\.0\\.1|192\\.168\\.0\\.1|169\\.254\\.169\\.254|::1|fc00/i)
  }
}


const literalNonPublicUrls = [
  'http://localhost/',
  'http://127.0.0.1/',
  'http://10.0.0.1/',
  'http://172.16.0.1/',
  'http://192.168.0.1/',
  'http://169.254.169.254/latest/meta-data/',
  'http://[::1]/',
  'http://[fc00::1]/',
  'http://[::ffff:192.168.0.1]/',
  'http://printer.local/',
] as const


describe('storefront import draft', () => {
  it('returns a public single address from the guarded connect lookup', async () => {
    const result = await runGuardedLookup(publicDns)

    expect(result).toEqual({
      err: null,
      address: '93.184.216.34',
      family: 4,
    })
  })

  it('accepts a public IPv4-mapped IPv6 address in the guarded lookup', async () => {
    const mappedDns: ImportDnsResolver = {
      lookup: async () => [{ address: '::ffff:93.184.216.34', family: 6 }],
    }

    await expect(isPublicHttpTarget(new URL('https://[::ffff:93.184.216.34]/'), mappedDns)).resolves.toBe(true)
    await expect(isPublicHttpTarget(new URL('https://mapped.example/'), mappedDns)).resolves.toBe(true)
    await expect(runGuardedLookup(mappedDns, { all: true })).resolves.toEqual({
      err: null,
      address: [{ address: '::ffff:93.184.216.34', family: 6 }],
      family: undefined,
    })
  })

  it('accepts zoned global IPv6 answers and preserves their callback family', async () => {
    const zonedDns: ImportDnsResolver = {
      lookup: async () => [{ address: '2001:db8::1%eth0', family: 6 }],
    }

    await expect(isPublicHttpTarget(new URL('https://zoned.example/'), zonedDns)).resolves.toBe(true)
    await expect(runGuardedLookup(zonedDns, { all: true })).resolves.toEqual({
      err: null,
      address: [{ address: '2001:db8::1%eth0', family: 6 }],
      family: undefined,
    })
  })

  it.each(['999.1.1.1', '2001:db8:::1', '::ffff:999.1.1.1'])(
    'refuses malformed resolved address %s',
    async (address) => {
      const malformedDns: ImportDnsResolver = {
        lookup: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
      }

      await expect(isPublicHttpTarget(new URL('https://malformed.example/'), malformedDns)).resolves.toBe(false)
      const result = await runGuardedLookup(malformedDns)
      expect(result.err).toMatchObject({ code: 'ECONNREFUSED' })
      expect(result.address).toBe('')
    }
  )

  it('refuses a private address in the guarded connect lookup', async () => {
    const result = await runGuardedLookup(privateDns('10.0.0.5'))

    expect(result.err).toMatchObject({ code: 'ECONNREFUSED' })
    expect(result.address).toBe('')
  })

  it('refuses mixed public and private DNS answers in the guarded connect lookup', async () => {
    const mixedDns: ImportDnsResolver = {
      lookup: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ],
    }

    const result = await runGuardedLookup(mixedDns, { all: true })

    expect(result.err).toMatchObject({ code: 'ECONNREFUSED' })
    expect(result.address).toBe('')
  })

  it('refuses DNS rebinding at the guarded connect-time lookup', async () => {
    let resolution = 0
    const rebindingDns: ImportDnsResolver = {
      lookup: async () => {
        resolution += 1
        return resolution === 1
          ? [{ address: '93.184.216.34', family: 4 }]
          : [{ address: '10.0.0.5', family: 4 }]
      },
    }

    await expect(isPublicHttpTarget(new URL('https://rebind.example/'), rebindingDns)).resolves.toBe(true)
    const result = await runGuardedLookup(rebindingDns, {}, 'rebind.example')

    expect(result.err).toMatchObject({ code: 'ECONNREFUSED' })
    expect(result.address).toBe('')
    expect(resolution).toBe(2)
  })
  it('extracts website HTML into an unconfirmed source-labeled draft profile', () => {
    const result = extractStorefrontDraftFromHtml({
      websiteUrl: 'https://northside.example/services?ref=ae#top',
      abn: '12 345 678 901',
      html: fixtureHtml,
    })

    expect(result).toMatchObject({
      kind: 'ok',
      draft: {
        status: 'draft_unconfirmed',
        source: {
          url: 'https://northside.example/services?ref=ae',
          label: 'imported-from-website',
          confirmation: 'unconfirmed',
        },
        profile: {
          businessName: 'Northside Plumbing',
          category: 'Plumbing',
          requestedSlug: 'northside-plumbing',
          serviceName: 'Emergency plumbing repairs',
          serviceSummary: 'Burst pipe repairs, blocked drains, and hot water help for Preston homes.',
          firstRequestMode: 'not_available_yet',
        },
      },
    })

    if (result.kind !== 'ok') {
      throw new Error('Expected fixture import to succeed.')
    }

    expect(result.draft.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'businessName', sourceLabel: 'imported-from-website', confirmation: 'unconfirmed' }),
        expect.objectContaining({ field: 'serviceSummary', sourceLabel: 'imported-from-website', confirmation: 'unconfirmed' }),
        expect.objectContaining({ field: 'contactHint', sourceLabel: 'imported-from-website', confirmation: 'unconfirmed' }),
        expect.objectContaining({ field: 'abn', sourceLabel: 'imported-from-website', confirmation: 'unconfirmed' }),
      ])
    )
    expect(result.draft.boundaryStatement).toMatch(/not published until the owner confirms/i)
    expect(result.draft.boundaryStatement).toMatch(/does not book, charge, dispatch, or auto-fulfil/i)
  })

  it('keeps imported drafts out of the publish path until owner confirmation', () => {
    const result = extractStorefrontDraftFromHtml({
      websiteUrl: 'https://northside.example/',
      html: fixtureHtml,
    })

    if (result.kind !== 'ok') {
      throw new Error('Expected fixture import to succeed.')
    }

    expect(confirmStorefrontImportDraft(result.draft, false)).toEqual({
      kind: 'error',
      code: 'storefront_import_unconfirmed',
      retryable: false,
      reason: 'Review and confirm imported facts before publishing this service page.',
    })
    expect(confirmStorefrontImportDraft(result.draft, true)).toMatchObject({
      kind: 'confirmed',
      input: {
        businessName: 'Northside Plumbing',
        sourceLabel: 'Website import reviewed by owner: https://northside.example',
      },
    })
  })

  it('fetches small HTML with the server-side importer and preserves extraction', async () => {
    const fetchMock = vi.fn(async () => new Response(fixtureHtml, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }))

    const result = await importStorefrontDraftFromWebsite(
      { websiteUrl: 'https://northside.example/' },
      { dns: publicDns, fetch: fetchMock }
    )

    expect(result).toMatchObject({
      kind: 'ok',
      draft: {
        status: 'draft_unconfirmed',
        profile: {
          businessName: 'Northside Plumbing',
          serviceName: 'Emergency plumbing repairs',
        },
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) })
    )
  })

  it.each(literalNonPublicUrls)('rejects non-public literal target %s before fetching', async (websiteUrl) => {
    const fetchMock = vi.fn(async () => new Response(fixtureHtml, { status: 200, headers: { 'content-type': 'text/html' } }))

    await expectFetchRejected(websiteUrl, { fetch: fetchMock })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a public hostname that resolves to a private address', async () => {
    const fetchMock = vi.fn(async () => new Response(fixtureHtml, { status: 200, headers: { 'content-type': 'text/html' } }))

    await expectFetchRejected('https://rebind.example/', {
      dns: privateDns('10.0.0.5'),
      fetch: fetchMock,
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects redirects from public hosts to private targets before fetching the second hop', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    }))

    await expectFetchRejected('https://northside.example/', { fetch: fetchMock })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects redirect chains that exceed the hop cap', async () => {
    let hop = 0
    const fetchMock = vi.fn(async () => {
      hop += 1
      return new Response(null, {
        status: 302,
        headers: { location: `https://redirect-${hop}.example/` },
      })
    })

    await expectFetchRejected('https://northside.example/', { fetch: fetchMock })

    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('rejects responses that exceed the byte cap', async () => {
    await expectFetchRejected('https://northside.example/', {
      fetch: async () => new Response(fixtureHtml, { status: 200, headers: { 'content-type': 'text/html' } }),
      maxResponseBytes: 8,
    })
  })

  it('rejects requests that time out', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const { promise, reject } = Promise.withResolvers<Response>()
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      return promise
    })

    await expectFetchRejected('https://northside.example/', {
      fetch: fetchMock,
      timeoutMs: 1,
    })
  })

  it('rejects non-HTML content types', async () => {
    await expectFetchRejected('https://northside.example/', {
      fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    })
  })

  it('exposes the owner-gated HTTP import handler without adding an agent tool', async () => {
    const previousBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    vi.stubGlobal('fetch', async () => new Response(fixtureHtml, { status: 200, headers: { 'content-type': 'text/html' } }))

    try {
      const response = await handleImportStorefrontDraftRequest(new Request('https://ae.example/api/storefront/import-draft', {
        method: 'POST',
        body: JSON.stringify({ websiteUrl: 'https://northside.example/' }),
      }))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({ kind: 'ok', draft: { status: 'draft_unconfirmed' } })
    } finally {
      vi.unstubAllGlobals()
      if (previousBypass === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousBypass
      }
    }
  })
})
