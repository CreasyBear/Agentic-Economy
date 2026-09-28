import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runRequestCommand } from '../../../tools/ae/commands/request'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'

const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  idempotencyKey: 'missing-job:one',
}

function responseJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function captureStdout(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return { read: () => writes.join(''), restore: () => spy.mockRestore() }
}

beforeEach(() => {
  process.env.AE_API_KEY = 'hidden-buyer-key'
  process.env.AE_API_KEY_ORIGIN = options.baseUrl
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

describe('private market request CLI', () => {
  it('withdraws only the specified private request and reports the receipt', async () => {
    const requestRef = `market-request:v1:${'e'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseJson({ kind: 'withdrawn', requestRef }))
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()
    try { await runRequestCommand(['withdraw', requestRef], options) } finally { output.restore() }
    expect(JSON.parse(output.read())).toEqual({ kind: 'withdrawn', requestRef })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/market-requests/withdraw')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ requestRef })
    expect(output.read()).not.toContain('hidden-buyer-key')
  })
  it('explains the active matching window without suggesting a purchase for a missing or expired request', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(responseJson({ kind: 'not_found' })))
    const output = captureStdout()
    try {
      await runRequestCommand(['status', 'market-request:expired'], { ...options, json: false })
    } finally {
      output.restore()
    }
    expect(output.read()).toContain('Matching ends 30 days after creation.')
    expect(output.read()).not.toContain('ae describe')
    expect(output.read()).not.toContain('ae call')
  })

  it('records a missing job and returns an exact status continuation without echoing retry identity', async () => {
    const requestRef = `market-request:v1:${'a'.repeat(64)}`
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(responseJson({
      kind: 'recorded',
      requestRef,
      query: 'translate a handwritten invoice',
      createdAt: 1_700_000_000_000,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()
    try {
      await runRequestCommand(['create', 'translate', 'a', 'handwritten', 'invoice'], options)
    } finally {
      output.restore()
    }

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://market.example/api/v1/market-requests')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer hidden-buyer-key')
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'translate a handwritten invoice',
      idempotencyKey: 'missing-job:one',
    })
    expect(JSON.parse(output.read())).toEqual({
      kind: 'recorded',
      requestRef,
      query: 'translate a handwritten invoice',
      createdAt: 1_700_000_000_000,
      nextCommand: `ae request status ${requestRef} --json`,
    })
    expect(output.read()).not.toContain('missing-job:one')
    expect(output.read()).not.toContain('hidden-buyer-key')
  })

  it('returns one executable pagination command for private request history', async () => {
    const requestRef = `market-request:v1:${'b'.repeat(64)}`
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(responseJson({
      kind: 'available',
      items: [{ requestRef, query: 'missing job', createdAt: 10, updatedAt: 10 }],
      hasMore: true,
      nextCursor: 'opaque cursor',
    })))
    const output = captureStdout()
    try {
      await runRequestCommand(['list'], { ...options, limit: '5' })
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'available',
      nextCommand: "ae request list --limit 5 --cursor 'opaque cursor' --json",
    })
  })

  it('points a matched request directly at the first current Tool', async () => {
    const requestRef = `market-request:v1:${'c'.repeat(64)}`
    const toolRef = `operation:v1:${'d'.repeat(64)}`
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(responseJson({
      kind: 'matched',
      requestRef,
      query: 'missing job',
      createdAt: 10,
      matchedCount: 1,
      tools: [{
        toolRef,
        capabilityId: 'invoice.translate',
        title: 'Invoice translation',
        description: 'Translate invoices.',
        provider: { name: 'Reference Services', slug: 'reference' },
        priceLabel: 'USD 0.50',
        healthStatus: 'operational',
        verification: 'verified',
        network: 'unknown',
        claimSource: 'provider',
        listingTier: 'reviewed',
      }],
    })))
    const output = captureStdout()
    try {
      await runRequestCommand(['status', requestRef], options)
    } finally {
      output.restore()
    }

    expect(JSON.parse(output.read())).toMatchObject({
      kind: 'matched',
      nextCommand: `ae describe ${toolRef} --json`,
    })
  })

  it('quotes a hostile current-match query and preserves selected origin and JSON mode', async () => {
    const query = 'private lookup; touch request-refusal-marker; #'
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(responseJson({
      kind: 'refused',
      code: 'current_match_exists',
    })))

    await expect(runRequestCommand(['create', 'private', 'lookup;', 'touch', 'request-refusal-marker;', '#'], {
      ...options,
      baseUrlSource: 'flag',
    })).rejects.toMatchObject({
      code: 'current_match_exists',
      nextCommand: `ae search '${query}' --base-url ${options.baseUrl} --json`,
    })
  })

  it('offers a shell-safe new Save intent after an idempotency conflict, preserving exact scope and origin', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(responseJson({
      kind: 'refused',
      code: 'idempotency_conflict',
    })))
    const query = 'missing job; touch request-conflict-marker; #'
    const failure: unknown = await runRequestCommand(['create', query], {
      ...options,
      source: 'current',
      filters: '{"provider":"local"}',
      baseUrlSource: 'flag',
    }).then(() => undefined, (error: unknown) => error)

    expect(failure).toBeInstanceOf(CliFailure)
    if (!(failure instanceof CliFailure)) return
    expect(failure.code).toBe('idempotency_conflict')
    const command = failure.nextCommand
    expect(command).toContain(`ae request create '${query}'`)
    expect(command).toContain('--source current')
    expect(command).toContain(`--filters '{"provider":"local"}'`)
    expect(command).toContain('--base-url https://market.example --json')
    const newKey = command?.match(/--idempotency-key ([0-9a-f-]{36})/u)?.[1]
    expect(newKey).toMatch(/^[0-9a-f-]{36}$/u)
    expect(newKey).not.toBe(options.idempotencyKey)
  })

  it('preserves the exact Save intent key and scope when the network outcome is ambiguous', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)
    const failure: unknown = await runRequestCommand(['create', 'missing', 'job'], {
      ...options,
      source: 'current',
      filters: '{"provider":"local"}',
      baseUrlSource: 'flag',
    }).then(() => undefined, (error: unknown) => error)

    expect(failure).toBeInstanceOf(CliFailure)
    if (!(failure instanceof CliFailure)) return
    expect(failure).toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'market-request-network-unavailable',
      retryable: true,
    })
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(request).toMatchObject({ query: 'missing job', idempotencyKey: options.idempotencyKey, source: 'current', filters: { provider: 'local' } })
    expect(failure.nextCommand).toContain(`--idempotency-key ${request.idempotencyKey}`)
    expect(failure.nextCommand).toContain(`--filters '{"provider":"local"}'`)
    expect(failure.nextCommand).toContain('--base-url https://market.example --json')
  })
})
