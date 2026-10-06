import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { storeConnection } from '../../../tools/ae/lib/config'
import { runCliInProcess } from './cli-errors-harness'

const origin = 'https://market.example'
const message = 'Search returned no usable next page instruction.'
const args = ['feedback', message, '--base-url', origin, '--json']
const fetchMock = vi.fn()
let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ae-feedback-'))
  vi.stubEnv('AE_CONFIG_DIR', directory)
  vi.stubEnv('AE_API_KEY', 'test-private-key')
  vi.stubEnv('AE_API_KEY_ORIGIN', origin)
  for (const name of ['DO_NOT_TRACK', 'AE_DISABLE_ANALYTICS', 'VITE_AE_DISABLE_ANALYTICS', 'AE_DISABLE_OBSERVABILITY', 'VITE_AE_DISABLE_OBSERVABILITY']) vi.stubEnv(name, '')
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ kind: 'accepted' }), { status: 200, headers: { 'content-type': 'application/json' } }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  rmSync(directory, { recursive: true, force: true })
})

describe('ae feedback', () => {
  it('sends one explicit authenticated message and returns only acceptance', async () => {
    const result = await runCliInProcess(args)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ kind: 'accepted' })
    expect(result.stdout + result.stderr).not.toContain(message)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe(`${origin}/api/v1/feedback`)
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ message }) })
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-private-key')
  })

  it('uses an existing provider-only connection', async () => {
    vi.stubEnv('AE_API_KEY', '')
    storeConnection({ baseUrl: origin, accessToken: 'provider-test-key', scope: 'market_supply:manage', profile: 'provider' })
    expect((await runCliInProcess(args)).status).toBe(0)
    expect(new Headers(fetchMock.mock.calls[0]![1].headers).get('authorization')).toBe('Bearer provider-test-key')
  })

  it.each(['DO_NOT_TRACK', 'AE_DISABLE_ANALYTICS'])('honors %s before requiring a connection or sending', async name => {
    vi.stubEnv(name, '1')
    vi.stubEnv('AE_API_KEY', '')
    const result = await runCliInProcess(args)
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ code: 'feedback_disabled', retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an origin mismatch before sending the credential', async () => {
    vi.stubEnv('AE_API_KEY_ORIGIN', 'https://other.example')
    const result = await runCliInProcess(args)
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ code: 'agent_access_key_origin_mismatch' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([{ positionals: [] }, { positionals: [' '] }, { positionals: ['x'.repeat(10_001)] }, { positionals: ['first', 'second'] }])('rejects invalid arguments before sending', async ({ positionals }) => {
    expect((await runCliInProcess(['feedback', ...positionals, '--json'])).status).not.toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports transport uncertainty without exposing the message or retrying', async () => {
    fetchMock.mockRejectedValue(new TypeError(`transport error: ${message}`))
    const result = await runCliInProcess(args)
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ kind: 'UNAVAILABLE', code: 'feedback_unavailable', retryable: false })
    expect(result.stdout + result.stderr).not.toContain(message)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([{}, { kind: 'refused', code: 'feedback_unavailable', retryable: false }])('does not turn malformed success into acceptance: %j', async body => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const result = await runCliInProcess(args)
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ code: 'feedback_unavailable', retryable: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([['feedback_disabled', 409], ['feedback_unavailable', 503]] as const)('preserves %s without retrying', async (code, status) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ type: 'about:blank', title: 'Feedback unavailable', status, kind: 'FAILED_PRECONDITION', code, retryable: false, detail: 'Skip feedback and continue your task.' }), { status, headers: { 'content-type': 'application/problem+json' } }))
    const result = await runCliInProcess(args)
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ code, retryable: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('makes optional disclosure and opt-out discoverable without a network request', async () => {
    const result = await runCliInProcess(['help', 'feedback'])
    expect(result.status).toBe(0)
    for (const text of ['PostHog', 'DO_NOT_TRACK', 'Optional', 'credentials', 'market_tools:call or market_supply:manage']) expect(result.stdout).toContain(text)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
