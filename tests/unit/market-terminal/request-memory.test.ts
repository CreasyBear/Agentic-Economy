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
      nextCommand: `ae request status ${requestRef}`,
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
      nextCommand: "ae request list --limit 5 --cursor 'opaque cursor'",
    })
  })

  it('points a matched request directly at the first current Operation', async () => {
    const requestRef = `market-request:v1:${'c'.repeat(64)}`
    const operationRef = `operation:v1:${'d'.repeat(64)}`
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(responseJson({
      kind: 'matched',
      requestRef,
      query: 'missing job',
      createdAt: 10,
      matchedCount: 1,
      operations: [{
        operationRef,
        capabilityId: 'invoice.translate',
        title: 'Invoice translation',
        summary: 'Translate invoices.',
        supplier: { name: 'Reference Services', slug: 'reference' },
        price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } },
        authentication: { kind: 'ae_api_key' },
        availability: { posture: 'integrated' },
        navigation: [],
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
      nextCommand: `ae inspect ${operationRef}`,
    })
  })
})
