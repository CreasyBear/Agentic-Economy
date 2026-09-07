import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runRequestCommand } from '../../../tools/ae/commands/request'
import type { CliOptions } from '../../../tools/ae/lib/args'

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

  it('uses a shell-safe idempotency replacement command with selected origin and JSON mode', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(responseJson({
      kind: 'refused',
      code: 'idempotency_conflict',
    })))

    await expect(runRequestCommand(['create', 'missing', 'job'], {
      ...options,
      baseUrlSource: 'flag',
    })).rejects.toMatchObject({
      code: 'idempotency_conflict',
      nextCommand: "ae request create '<job>' --idempotency-key '<new-key>' --base-url https://market.example --json",
    })
  })
})
