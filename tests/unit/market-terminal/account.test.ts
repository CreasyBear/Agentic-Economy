import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runAccountCommand } from '../../../tools/ae/commands/account'
import { parseArgs, type CliOptions } from '../../../tools/ae/lib/args'
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
  it('explains anonymous use and gives one exact connect continuation when no buyer credential exists', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], { ...options, json: false })

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(output).toContain('No stored connections for any origin.')
    expect(output).toContain('Anonymous search and description remain available.')
    expect(output.match(/^Next: /gmu)).toHaveLength(1)
    expect(output).toContain('Next: ae connect --base-url https://market.example')
  })

  it('returns one JSON value with the exact connect continuation when no buyer credential exists', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], options)

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(JSON.parse(output)).toEqual({
      kind: 'connections',
      selectedOrigin: 'https://market.example',
      credentialSource: 'none',
      items: [],
      nextCommand: 'ae connect --base-url https://market.example',
    })
  })

  it('shell-quotes the canonical selected origin in the connect continuation', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], {
      ...options,
      baseUrl: 'http://[::1]:3024',
    })

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      selectedOrigin: 'http://[::1]:3024',
      nextCommand: "ae connect --base-url 'http://[::1]:3024'",
    })
  })

  it('uses one other-origin buyer profile and returns an executable exact status command', async () => {
    const identityOrigin = 'https://identity.example'
    storeConnection({
      baseUrl: identityOrigin,
      accessToken: 'hidden-identity-secret',
      scope: 'market_tools:call',
      profile: 'market',
    })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], options)

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    const result = JSON.parse(output) as {
      items: Array<{ origin: string; profile: string; state: string; statusCommand?: string }>
      nextCommand: string
    }
    expect(result).toMatchObject({
      items: [{
        origin: identityOrigin,
        profile: 'market',
        state: 'stored_for_other_origin',
        statusCommand: `ae account status market --base-url ${identityOrigin}`,
      }],
      nextCommand: `ae account status market --base-url ${identityOrigin}`,
    })
    expect(output).not.toContain('hidden-identity-secret')

    const parsed = parseArgs(result.nextCommand.split(' ').slice(1))
    expect(parsed).toMatchObject({
      command: 'account',
      positionals: ['status', 'market'],
      options: { baseUrl: identityOrigin },
    })
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer hidden-identity-secret')
      return Response.json({
        kind: 'authenticated', principalRef: 'prn_identity', accountRef: 'acc_identity',
        credentialId: 'key_identity', applicationRef: 'agentic-economy', environment: 'sandbox',
        scopes: ['market_tools:call'], authorityMode: 'read_only',
      })
    })
    vi.stubGlobal('fetch', fetch)
    write.mockClear()

    await runAccountCommand(parsed.positionals, { ...parsed.options, json: true })

    expect(fetch).toHaveBeenCalledOnce()
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${identityOrigin}/api/v1/account`)
    expect(write.mock.calls.map(([value]) => String(value)).join('')).not.toContain('hidden-identity-secret')
  })

  it('prints the one other-origin status command for humans', async () => {
    storeConnection({ baseUrl: 'https://identity.example', accessToken: 'hidden-identity-secret' })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], { ...options, json: false })

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    const statusCommand = 'ae account status market --base-url https://identity.example'
    expect(output).toContain(`  status command  ${statusCommand}`)
    expect(output).toContain(`Next: ${statusCommand}`)
    expect(output.match(/^Next: /gmu)).toHaveLength(1)
    expect(output).not.toContain('hidden-identity-secret')
  })

  it('lists deterministic commands but makes no arbitrary choice across multiple profiles', async () => {
    storeConnection({ baseUrl: 'https://z.example', accessToken: 'hidden-z-secret' })
    storeConnection({ baseUrl: 'https://a.example', accessToken: 'hidden-a-secret' })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], options)

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    const result = JSON.parse(output) as {
      items: Array<{ origin: string; statusCommand: string }>
      nextCommand?: string
    }
    expect(result.items.map(({ origin, statusCommand }) => ({ origin, statusCommand }))).toEqual([
      { origin: 'https://a.example', statusCommand: 'ae account status market --base-url https://a.example' },
      { origin: 'https://z.example', statusCommand: 'ae account status market --base-url https://z.example' },
    ])
    expect(result).not.toHaveProperty('nextCommand')
    expect(output).not.toContain('hidden-a-secret')
    expect(output).not.toContain('hidden-z-secret')
  })

  it('uses the provider status form when provider is the only other-origin profile', async () => {
    storeConnection({
      baseUrl: 'https://supplier.example',
      accessToken: 'hidden-supplier-secret',
      scope: 'market_supply:manage',
      profile: 'provider',
    })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], options)

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    const result = JSON.parse(output) as {
      items: Array<{ statusCommand: string }>
      nextCommand: string
    }
    const expected = 'ae account status provider --base-url https://supplier.example'
    expect(result.nextCommand).toBe(expected)
    expect(result.items[0]?.statusCommand).toBe(expected)
    expect(output).not.toContain('hidden-supplier-secret')
  })

  it('shell-quotes an other-origin IPv6 status command', async () => {
    storeConnection({ baseUrl: 'http://[::1]:3024', accessToken: 'hidden-ipv6-secret' })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], options)

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    const result = JSON.parse(output) as {
      items: Array<{ statusCommand: string }>
      nextCommand: string
    }
    const expected = "ae account status market --base-url 'http://[::1]:3024'"
    expect(result.nextCommand).toBe(expected)
    expect(result.items[0]?.statusCommand).toBe(expected)
    expect(output).not.toContain('hidden-ipv6-secret')
  })

  it('keeps the buyer connect continuation when only a selected provider profile exists', async () => {
    storeConnection({
      baseUrl: options.baseUrl,
      accessToken: 'hidden-selected-supplier-secret',
      scope: 'market_supply:manage',
      profile: 'provider',
    })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], options)

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(JSON.parse(output)).toMatchObject({
      credentialSource: 'none',
      items: [expect.objectContaining({ profile: 'provider', state: 'selected_active' })],
      nextCommand: 'ae connect --base-url https://market.example',
    })
    expect(output).not.toContain('hidden-selected-supplier-secret')
  })

  it('omits the connect continuation when an environment buyer credential is active for the selected origin', async () => {
    process.env.AE_API_KEY = 'hidden-buyer-secret'
    process.env.AE_API_KEY_ORIGIN = options.baseUrl
    storeConnection({
      baseUrl: options.baseUrl,
      accessToken: 'hidden-supplier-secret',
      scope: 'market_supply:manage',
      profile: 'provider',
    })
    storeConnection({ baseUrl: 'https://other.example', accessToken: 'hidden-other-secret' })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], options)

    const result = JSON.parse(write.mock.calls.map(([value]) => String(value)).join('')) as Record<string, unknown>
    expect(result).toMatchObject({
      credentialSource: 'environment',
      items: [
        expect.objectContaining({ origin: 'https://market.example', profile: 'provider' }),
        expect.objectContaining({ origin: 'https://other.example', profile: 'market' }),
      ],
    })
    expect(result).not.toHaveProperty('nextCommand')
    expect(JSON.stringify(result)).not.toContain('hidden-')
  })

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
        scopes: ['market_tools:call'],
        authorityMode: 'read_only',
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

  it('selects the independently stored provider profile for self-inspection', async () => {
    storeConnection({
      baseUrl: options.baseUrl,
      accessToken: 'hidden-supplier-secret',
      scope: 'market_supply:manage',
      profile: 'provider',
    })
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer hidden-supplier-secret')
      return Response.json({
        kind: 'authenticated', principalRef: 'prn_supplier', accountRef: 'acc_owner',
        credentialId: 'key_supplier', applicationRef: 'agentic-economy', environment: 'sandbox',
        scopes: ['market_supply:manage'], authorityMode: 'spending_policy',
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['status', 'provider'], options)

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      credentialId: 'key_supplier', scopes: ['market_supply:manage'],
    })
  })

  it('lists sanitized local connections and disconnects only the selected stored origin', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'hidden-secret', scope: 'market_tools:call' })
    storeConnection({ baseUrl: 'https://other.example', accessToken: 'other-secret' })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['connections'], options)
    const listedOutput = write.mock.calls.map(([value]) => String(value)).join('')
    expect(JSON.parse(listedOutput)).toMatchObject({
      kind: 'connections',
      selectedOrigin: 'https://market.example',
      credentialSource: 'stored',
      items: expect.arrayContaining([
        expect.objectContaining({ origin: 'https://market.example', state: 'selected_active' }),
        expect.objectContaining({ origin: 'https://other.example', state: 'stored_for_other_origin' }),
      ]),
    })
    expect(JSON.parse(listedOutput)).not.toHaveProperty('nextCommand')
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

  it('defaults disconnect to the buyer profile and preserves provider authority', async () => {
    storeConnection({
      baseUrl: options.baseUrl,
      accessToken: 'hidden-market-secret',
      scope: 'market_tools:call',
      profile: 'market',
    })
    storeConnection({
      baseUrl: options.baseUrl,
      accessToken: 'hidden-supplier-secret',
      scope: 'market_supply:manage',
      profile: 'provider',
    })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['disconnect'], options)

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(JSON.parse(output)).toEqual({
      kind: 'disconnected',
      origin: 'https://market.example',
      profile: 'market',
      removed: true,
      nextAction: 'Run ae connect to authorize a new credential for this origin.',
    })
    expect(output).not.toContain('hidden-market-secret')
    expect(output).not.toContain('hidden-supplier-secret')
    expect(readStoredConnection(options.baseUrl, 'market')).toBeUndefined()
    expect(readStoredConnection(options.baseUrl, 'provider')?.accessToken).toBe('hidden-supplier-secret')
  })

  it('disconnects only an explicit provider profile and names it in human output', async () => {
    storeConnection({
      baseUrl: options.baseUrl,
      accessToken: 'hidden-market-secret',
      scope: 'market_tools:call',
      profile: 'market',
    })
    storeConnection({
      baseUrl: options.baseUrl,
      accessToken: 'hidden-supplier-secret',
      scope: 'market_supply:manage',
      profile: 'provider',
    })
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['disconnect', 'provider'], { ...options, json: false })

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(output).toBe([
      '',
      'Disconnect AE',
      '-------------',
      '  origin   https://market.example',
      '  profile  provider',
      '  removed  yes',
      'Run ae connect --provider to authorize a new provider credential for this origin.',
      '',
    ].join('\n'))
    expect(output).not.toContain('hidden-market-secret')
    expect(output).not.toContain('hidden-supplier-secret')
    expect(readStoredConnection(options.baseUrl, 'market')?.accessToken).toBe('hidden-market-secret')
    expect(readStoredConnection(options.baseUrl, 'provider')).toBeUndefined()
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
        accountState: 'active', version: 2, updatedAt: 10,
        funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['balance', 'AUD'], options)

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      kind: 'available', balance: { currency: 'AUD', units: '4200' },
      funding: { kind: 'agent_funding_handoff' },
    })
  })

  it('lists the current credential charge activity with bounded pagination', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'hidden-secret' })
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ currency: 'AUD', limit: 5, cursor: 'cursor:one' })
      return Response.json({ kind: 'available', items: [], hasMore: false })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['activity'], { ...options, limit: '5', cursor: 'cursor:one' })

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toEqual({
      kind: 'available', items: [], hasMore: false,
    })
  })

  it('returns the exact account activity continuation command', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'hidden-secret' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      kind: 'available', items: [], hasMore: true, nextCursor: 'cursor:two',
    })))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['activity', 'AUD'], { ...options, limit: '5', cursor: 'cursor:one' })

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      nextCommand: 'ae account activity AUD --limit 5 --cursor cursor:two --json',
    })
  })

  it('executes account activity continuation against the same origin with the same query and JSON mode', async () => {
    const cursorInjectionMarker = join(directory, 'activity-cursor-was-executed')
    const nextCursor = `opaque'; touch ${cursorInjectionMarker}; #`
    const bearer = 'FAKE_PRIVATE_ACTIVITY_BEARER_5173'
    const requests: Array<Readonly<{ authorization?: string; body: unknown; path?: string }>> = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { cursor?: string }
        requests.push({
          ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
          body,
          ...(request.url === undefined ? {} : { path: request.url }),
        })
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          kind: 'available',
          items: [],
          hasMore: body.cursor === undefined,
          ...(body.cursor === undefined ? { nextCursor } : {}),
        }))
      })
    })
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '::1', resolveListen)
    })
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('Expected an IPv6 activity server address')
      const origin = `http://[::1]:${address.port}`
      const environment = {
        ...process.env,
        AE_API_KEY: bearer,
        AE_API_KEY_ORIGIN: origin,
        AE_CONFIG_DIR: directory,
      }
      const first = await runCliProcess([
        'account', 'activity', 'AUD', '--limit', '5', '--base-url', origin, '--json',
      ], environment)
      expect(first.status).toBe(0)
      expect(first.stderr).toBe('')
      const firstPage = JSON.parse(first.stdout) as { nextCommand: string }
      expect(firstPage.nextCommand).toContain(`--base-url '${origin}' --json`)
      expect(firstPage.nextCommand).not.toContain(bearer)

      installAeShim(directory)
      const continued = await runProcess('/bin/sh', ['-c', firstPage.nextCommand], {
        ...environment,
        AE_TEST_CLI: resolve('tools/ae/cli.ts'),
        AE_TEST_NODE: process.execPath,
        PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
      })

      expect(continued.status).toBe(0)
      expect(continued.stderr).toBe('')
      expect(JSON.parse(continued.stdout)).toEqual({ kind: 'available', items: [], hasMore: false })
      expect(requests).toEqual([
        {
          authorization: `Bearer ${bearer}`,
          body: { currency: 'AUD', limit: 5 },
          path: '/api/v1/account/activity',
        },
        {
          authorization: `Bearer ${bearer}`,
          body: { currency: 'AUD', limit: 5, cursor: nextCursor },
          path: '/api/v1/account/activity',
        },
      ])
      expect(existsSync(cursorInjectionMarker)).toBe(false)
    } finally {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => error === undefined ? resolveClose() : reject(error))
      })
    }
  })

  it('preserves a selected account activity origin for humans without inventing JSON mode', async () => {
    const origin = 'http://[::1]:3024'
    storeConnection({ baseUrl: origin, accessToken: 'hidden-activity-secret' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      kind: 'available', items: [], hasMore: true, nextCursor: 'opaque cursor',
    })))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runAccountCommand(['activity', 'AUD'], {
      ...options,
      baseUrl: origin,
      baseUrlSource: 'flag',
      json: false,
      limit: '5',
    })

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(output).toContain("Next: ae account activity AUD --limit 5 --cursor 'opaque cursor' --base-url 'http://[::1]:3024'")
    expect(output).not.toContain('--json')
    expect(output).not.toContain('hidden-activity-secret')
  })

  it('refuses account activity cursor controls before printing a continuation', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'hidden-secret' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      kind: 'available', items: [], hasMore: true, nextCursor: 'opaque\n\u001b[31mred',
    })))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await expect(runAccountCommand(['activity'], options)).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'account-activity-result-invalid',
    } satisfies Partial<CliFailure>)
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses an environment-managed buyer without blocking explicit provider disconnect', async () => {
    process.env.AE_API_KEY = 'environment-secret'
    process.env.AE_API_KEY_ORIGIN = options.baseUrl
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'hidden-market-secret', profile: 'market' })
    storeConnection({
      baseUrl: options.baseUrl,
      accessToken: 'hidden-supplier-secret',
      scope: 'market_supply:manage',
      profile: 'provider',
    })

    await expect(runAccountCommand(['disconnect'], options)).rejects.toMatchObject({
      kind: 'FAILED_PRECONDITION',
      code: 'environment_credential_cannot_be_removed',
    } satisfies Partial<CliFailure>)
    expect(readStoredConnection(options.baseUrl, 'market')?.accessToken).toBe('hidden-market-secret')
    expect(readStoredConnection(options.baseUrl, 'provider')?.accessToken).toBe('hidden-supplier-secret')

    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await runAccountCommand(['disconnect', 'provider'], options)

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(JSON.parse(output)).toMatchObject({ profile: 'provider', removed: true })
    expect(output).not.toContain('environment-secret')
    expect(output).not.toContain('hidden-market-secret')
    expect(output).not.toContain('hidden-supplier-secret')
    expect(readStoredConnection(options.baseUrl, 'market')?.accessToken).toBe('hidden-market-secret')
    expect(readStoredConnection(options.baseUrl, 'provider')).toBeUndefined()
  })
})

function installAeShim(targetDirectory: string): void {
  writeFileSync(
    join(targetDirectory, 'ae'),
    '#!/bin/sh\nexec "$AE_TEST_NODE" --import tsx "$AE_TEST_CLI" "$@"\n',
    { mode: 0o755 },
  )
}

async function runCliProcess(args: readonly string[], environment: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return runProcess(process.execPath, ['--import', 'tsx', 'tools/ae/cli.ts', ...args], environment)
}

type ProcessResult = Readonly<{
  status: number | null
  stderr: string
  stdout: string
}>

async function runProcess(
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  const { promise, resolve: resolveResult, reject } = Promise.withResolvers<ProcessResult>()
  const child = spawn(executable, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  child.once('error', reject)
  child.once('close', (status) => resolveResult({
    status,
    stderr: Buffer.concat(stderr).toString('utf8'),
    stdout: Buffer.concat(stdout).toString('utf8'),
  }))
  return promise
}
