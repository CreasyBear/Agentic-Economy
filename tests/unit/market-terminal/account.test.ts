import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runAccountCommand } from '../../../tools/ae/commands/account'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { readStoredConnection, storeConnection } from '../../../tools/ae/lib/config'
import { CliFailure } from '../../../tools/ae/lib/output'

let directory = ''
const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ae-cli-account-'))
  process.env.AE_CONFIG_DIR = directory
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
})

afterEach(() => {
  delete process.env.AE_CONFIG_DIR
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  rmSync(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AE CLI account interface', () => {
  it('reads canonical server identity with the selected origin-bound credential', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'hidden-secret' })
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer hidden-secret')
      return Response.json({
        kind: 'authenticated',
        principalRef: 'prn_current',
        accountRef: 'acc_owner',
        credentialId: 'key_current',
        applicationRef: 'agentic-economy',
        environment: 'sandbox',
        scopes: ['market_operations:invoke'],
        authorityMode: 'inspect_only',
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['status'], options)

    expect(fetch).toHaveBeenCalledOnce()
    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(JSON.parse(output)).toMatchObject({
      kind: 'authenticated',
      principalRef: 'prn_current',
      accountRef: 'acc_owner',
    })
    expect(output).not.toContain('hidden-secret')
  })

  it('selects the independently stored supplier profile for self-inspection', async () => {
    storeConnection({
      baseUrl: options.baseUrl,
      accessToken: 'hidden-supplier-secret',
      scope: 'market_supply:manage',
      profile: 'supplier',
    })
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer hidden-supplier-secret')
      return Response.json({
        kind: 'authenticated', principalRef: 'prn_supplier', accountRef: 'acc_owner',
        credentialId: 'key_supplier', applicationRef: 'agentic-economy', environment: 'sandbox',
        scopes: ['market_supply:manage'], authorityMode: 'bounded_mandate',
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['status', 'supplier'], options)

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      credentialId: 'key_supplier', scopes: ['market_supply:manage'],
    })
  })

  it('lists sanitized local connections and disconnects only the selected stored origin', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'hidden-secret', scope: 'market_operations:invoke' })
    storeConnection({ baseUrl: 'https://other.example', accessToken: 'other-secret' })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], options)
    const listedOutput = write.mock.calls.map(([value]) => String(value)).join('')
    expect(JSON.parse(listedOutput)).toMatchObject({
      kind: 'connections',
      selectedOrigin: 'https://market.example',
      credentialSource: 'stored',
    })
    expect(listedOutput).not.toContain('hidden-secret')
    expect(listedOutput).not.toContain('other-secret')

    write.mockClear()
    await runAccountCommand(['disconnect'], options)
    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      kind: 'disconnected',
      origin: 'https://market.example',
      removed: true,
    })
    expect(readStoredConnection(options.baseUrl)).toBeUndefined()
    expect(readStoredConnection('https://other.example')?.accessToken).toBe('other-secret')
  })

  it('reads exact buyer balance and exposes funding only as an owner-browser continuation', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'hidden-secret' })
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/account/balance')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ currency: 'AUD' })
      return Response.json({
        kind: 'available', principalRef: 'prn_current', accountRef: 'acc_owner',
        balance: { currency: 'AUD', units: '4200', exponent: 2 },
        recoveryDue: { currency: 'AUD', units: '0', exponent: 2 },
        accountState: 'active', version: 2, updatedAt: 10,
        funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['balance', 'AUD'], options)

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      kind: 'available', balance: { currency: 'AUD', units: '4200' },
      funding: { kind: 'owner_browser_required' },
    })
  })

  it('lists the current credential charge activity with bounded pagination', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'hidden-secret' })
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ currency: 'USD', limit: 5, cursor: 'cursor:one' })
      return Response.json({ kind: 'available', items: [], hasMore: false })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['activity'], { ...options, limit: '5', cursor: 'cursor:one' })

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toEqual({
      kind: 'available', items: [], hasMore: false,
    })
  })

  it('does not pretend it can remove an environment-managed credential', async () => {
    process.env.AE_API_KEY = 'environment-secret'
    process.env.AE_API_KEY_ORIGIN = options.baseUrl

    await expect(runAccountCommand(['disconnect'], options)).rejects.toMatchObject({
      kind: 'FAILED_PRECONDITION',
      code: 'environment_credential_cannot_be_removed',
    } satisfies Partial<CliFailure>)
  })
})
