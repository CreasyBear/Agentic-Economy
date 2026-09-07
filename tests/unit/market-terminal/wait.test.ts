import { afterEach, describe, expect, it, vi } from 'vitest'

import { runWaitCommand } from '../../../tools/ae/commands/wait'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'

const options: CliOptions = {
  baseUrl: 'https://market.example',
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

describe('AE CLI recorded Call wait', () => {
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
      nextCommand: 'ae wait call:one',
      detail: { identityPreserved: true },
    } satisfies Partial<CliFailure>)
  })
})
