import { afterEach, describe, expect, it, vi } from 'vitest'

import { runWaitCommand } from '../../../tools/ae/commands/wait'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'

const options: CliOptions = {
  baseUrl: 'https://market.example',
  baseUrlSource: 'flag',
  json: true,
  help: false,
  allowWrite: false,
}
const callRef = 'call:one'
const toolRef = `operation:v1:${'a'.repeat(64)}`

function setApiKey(): void {
  process.env.AE_API_KEY = 'ae-test-caller-key'
  process.env.AE_API_KEY_ORIGIN = options.baseUrl
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

describe('AE CLI recorded Call wait', () => {
  it.each([false, true])('stops at 60 seconds without a late status request (last request stalled: %s)', async (stall) => {
    setApiKey()
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const startedAt = Date.now()
    let finalSignal: AbortSignal | undefined
    const requestTimes: number[] = []
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((_url, init) => {
      requestTimes.push(Date.now() - startedAt)
      if (stall && Date.now() - startedAt >= 50_000) {
        finalSignal = init!.signal!
        return Promise.resolve(new Response(new ReadableStream({
          start(controller) {
            finalSignal!.addEventListener('abort', () => controller.error(finalSignal!.reason), { once: true })
          },
        })))
      }
      return Promise.resolve(Response.json({ kind: 'found', callRef, version: 1, toolRef, state: 'in_progress' }))
    })
    vi.stubGlobal('fetch', fetch)
    const failure = expect(runWaitCommand([callRef], options)).rejects.toMatchObject({
      code: 'call-wait-timeout', nextCommand: 'ae wait call:one --base-url https://market.example --json', detail: { identityPreserved: true },
    })
    await vi.advanceTimersByTimeAsync(59_999)
    if (stall) expect(finalSignal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await failure
    expect(requestTimes.every(time => time < 60_000)).toBe(true)
    expect(requestTimes.at(-1)).toBe(stall ? 50_000 : 59_000)
    expect(fetch.mock.calls.every(([url, init]) => String(url).endsWith('/api/v1/calls/call%3Aone') && init?.method === 'GET')).toBe(true)
    if (stall) expect(finalSignal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns an already completed recorded result without creating a Call', async () => {
    setApiKey()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      kind: 'found',
      callRef,
      version: 1,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'completed',
        callRef,
        toolRef,
        output: { answer: 42 },
        evidenceHash: 'sha256:evidence',
        usage: {
          usageRef: 'usage:one',
          observedAt: 100,
          chargeState: 'free_tier',
          amount: { currency: 'USD', units: '0', exponent: 2 },
          priceDigest: 'sha256:price',
        },
      },
    }))
    vi.stubGlobal('fetch', fetch)

    await runWaitCommand([callRef], options)

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/calls/call%3Aone')
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(JSON.parse(stdout.mock.calls.flat().join(''))).toMatchObject({
      kind: 'found',
      callRef,
      result: { kind: 'completed', callRef, output: { answer: 42 } },
    })
  })

  it('retains a terminal result already received at the exact wait boundary', async () => {
    setApiKey()
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() => {
      vi.setSystemTime(Date.now() + 60_000)
      return Promise.resolve(Response.json({ kind: 'found', callRef, version: 1, toolRef, state: 'cancelled' }))
    })
    vi.stubGlobal('fetch', fetch)
    await runWaitCommand([callRef], options)
    expect(JSON.parse(stdout.mock.calls.flat().join(''))).toMatchObject({ kind: 'found', callRef, state: 'cancelled' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('polls the same recorded identity until its durable result exists', async () => {
    setApiKey()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({
        kind: 'found',
        callRef,
        version: 1,
        toolRef,
        state: 'in_progress',
      }))
      .mockResolvedValueOnce(Response.json({
        kind: 'found',
        callRef,
        version: 2,
        toolRef,
        state: 'reconciliation_required',
      }))
    vi.stubGlobal('fetch', fetch)

    await runWaitCommand([callRef], options)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls.every(([url]) => String(url).endsWith('/api/v1/calls/call%3Aone'))).toBe(true)
    expect(JSON.parse(stdout.mock.calls.flat().join(''))).toMatchObject({
      kind: 'found',
      callRef,
      state: 'reconciliation_required',
    })
  })

  it('does not authorize a new identity when the credential is missing', async () => {
    await expect(runWaitCommand([callRef], options)).rejects.toMatchObject({
      kind: 'UNAUTHENTICATED',
      code: 'agent_access_key_required',
      message: 'No matching credential is selected for wait on this origin.',
      nextCommand: 'ae account connections',
    } satisfies Partial<CliFailure>)
  })

  it('continues the same wait identity after an unknown observation transport', async () => {
    setApiKey()
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('socket closed')))

    await expect(runWaitCommand([callRef], options)).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'call-wait-transport-unknown',
      nextCommand: 'ae wait call:one --base-url https://market.example --json',
      detail: { identityPreserved: true },
    } satisfies Partial<CliFailure>)
  })
})
