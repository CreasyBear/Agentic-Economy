import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runHistoryCommand } from '../../../tools/ae/commands/history'
import { storeConnection } from '../../../tools/ae/lib/config'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CLI_BUNDLE_PATH } from './cli-errors-harness'

let directory = ''
const servers: Server[] = []
const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  limit: '5',
  cursor: 'cursor:one',
  state: 'completed',
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ae-cli-history-'))
  process.env.AE_CONFIG_DIR = directory
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  storeConnection({ baseUrl: options.baseUrl, accessToken: 'buyer-secret', scope: 'market_tools:call' })
})

afterEach(async () => {
  delete process.env.AE_CONFIG_DIR
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  await Promise.all(servers.splice(0).map(async (server) => new Promise<void>((resolveClose, reject) => {
    server.close((error) => error === undefined ? resolveClose() : reject(error))
  })))
  rmSync(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AE CLI Call history', () => {
  it('lists exact owned Call summaries with opaque pagination', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/calls?limit=5&cursor=cursor%3Aone&state=completed')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer buyer-secret')
      return Response.json({
        kind: 'available',
        items: [{
          callRef: 'call:one',
          toolRef: 'operation:v1:one',
          state: 'completed',
          createdAt: 10,
          updatedAt: 20,
        }],
        hasMore: true,
        nextCursor: 'cursor:two',
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runHistoryCommand([], options)

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      items: [{ callRef: 'call:one' }],
      nextCursor: 'cursor:two',
      nextCommand: 'ae history --limit 5 --state completed --cursor cursor:two --json',
    })
  })

  it('points an empty Call history at search instead of an empty table, in JSON', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      kind: 'available', items: [], hasMore: false,
    })))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { cursor: _cursor, ...initialOptions } = options

    await runHistoryCommand([], initialOptions)

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      kind: 'available',
      items: [],
      nextCommand: "ae search '<job>' --json",
    })
  })

  it('prints a search continuation instead of an empty table in human output', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      kind: 'available', items: [], hasMore: false,
    })))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { cursor: _cursor, ...initialOptions } = options

    await runHistoryCommand([], { ...initialOptions, json: false })

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(output).toContain('No Calls yet.')
    expect(output).toContain("Next: ae search '<job>'")
  })

  it('executes an opaque continuation against the same IPv6 origin with the same filters and JSON mode', async () => {
    const cursorInjectionMarker = join(directory, 'history-cursor-was-executed')
    const nextCursor = `opaque'; touch ${cursorInjectionMarker}; #`
    const bearer = 'FAKE_PRIVATE_HISTORY_BEARER_7182'
    const idempotency = 'private-history-idempotency-9184'
    const requests: Array<Readonly<{
      authorization?: string
      host?: string
      method?: string
      path?: string
    }>> = []
    const server = createServer((request, response) => {
      requests.push({
        ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
        ...(request.headers.host === undefined ? {} : { host: request.headers.host }),
        ...(request.method === undefined ? {} : { method: request.method }),
        ...(request.url === undefined ? {} : { path: request.url }),
      })
      const cursor = new URL(request.url ?? '/', 'http://localhost').searchParams.get('cursor')
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        kind: 'available',
        items: [{
          callRef: cursor === null ? 'call:first' : 'call:second',
          toolRef: 'operation:v1:history',
          state: 'completed',
          createdAt: 10,
          updatedAt: 20,
        }],
        hasMore: cursor === null,
        ...(cursor === null ? { nextCursor } : {}),
      }))
    })
    servers.push(server)
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '::1', resolveListen)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Expected an IPv6 history server address')
    const origin = `http://[::1]:${address.port}`
    const environment = {
      ...process.env,
      AE_API_KEY: bearer,
      AE_API_KEY_ORIGIN: origin,
      AE_CONFIG_DIR: directory,
      AE_TEST_PRIVATE_IDEMPOTENCY: idempotency,
    }

    const first = await runCli([
      'history', '--limit', '5', '--state', 'completed', '--base-url', origin, '--json',
    ], environment)
    expect(first.status).toBe(0)
    expect(first.stderr).toBe('')
    const firstPage = JSON.parse(first.stdout) as { nextCommand: string }
    expect(firstPage.nextCommand).toContain(`--base-url '${origin}' --json`)
    expect(firstPage.nextCommand).not.toContain(bearer)
    expect(firstPage.nextCommand).not.toContain(idempotency)

    installAeShim(directory)
    const continued = await runShell(firstPage.nextCommand, {
      ...environment,
      AE_TEST_CLI: CLI_BUNDLE_PATH,
      AE_TEST_NODE: process.execPath,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
    })

    expect(continued.status).toBe(0)
    expect(continued.stderr).toBe('')
    expect(JSON.parse(continued.stdout)).toMatchObject({ kind: 'available', hasMore: false })
    const continuedQuery = new URLSearchParams({ limit: '5', cursor: nextCursor, state: 'completed' })
    expect(requests).toEqual([
      {
        authorization: `Bearer ${bearer}`,
        host: `[::1]:${address.port}`,
        method: 'GET',
        path: '/api/v1/calls?limit=5&state=completed',
      },
      {
        authorization: `Bearer ${bearer}`,
        host: `[::1]:${address.port}`,
        method: 'GET',
        path: `/api/v1/calls?${continuedQuery.toString()}`,
      },
    ])
    expect(existsSync(cursorInjectionMarker)).toBe(false)
  })

  it('preserves a selected origin for humans without inventing JSON mode', async () => {
    const origin = 'http://[::1]:3024'
    process.env.AE_API_KEY = 'FAKE_HISTORY_HUMAN_BEARER'
    process.env.AE_API_KEY_ORIGIN = origin
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      kind: 'available', items: [], hasMore: true, nextCursor: 'opaque cursor',
    })))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { cursor: _cursor, ...initialOptions } = options

    await runHistoryCommand([], {
      ...initialOptions,
      baseUrl: origin,
      baseUrlSource: 'flag',
      json: false,
    })

    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(output).toContain(`Next: ae history --limit 5 --state completed --cursor 'opaque cursor' --base-url '${origin}'`)
    expect(output).not.toContain('--json')
    expect(output).not.toContain('FAKE_HISTORY_HUMAN_BEARER')
  })

  it('keeps hosted-default continuations free of redundant origin noise', async () => {
    const hostedOrigin = 'https://agentic-economy-phi.vercel.app'
    process.env.AE_API_KEY = 'FAKE_HISTORY_HOSTED_BEARER'
    process.env.AE_API_KEY_ORIGIN = hostedOrigin
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      kind: 'available', items: [], hasMore: true, nextCursor: 'opaque cursor',
    })))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { cursor: _cursor, ...initialOptions } = options

    await runHistoryCommand([], {
      ...initialOptions,
      baseUrl: hostedOrigin,
      baseUrlSource: 'hosted_default',
    })

    const result = JSON.parse(write.mock.calls.map(([value]) => String(value)).join('')) as { nextCommand: string }
    expect(result.nextCommand).toBe("ae history --limit 5 --state completed --cursor 'opaque cursor' --json")
    expect(result.nextCommand).not.toContain('--base-url')
    expect(result.nextCommand).not.toContain('FAKE_HISTORY_HOSTED_BEARER')
  })

  it('refuses terminal control characters before printing a continuation', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      kind: 'available', items: [], hasMore: true, nextCursor: 'opaque\n\u001b[31mred',
    })))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await expect(runHistoryCommand([], options)).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      code: 'history-result-invalid',
    })

    expect(write).not.toHaveBeenCalled()
  })
})

function installAeShim(targetDirectory: string): void {
  const executable = join(targetDirectory, 'ae')
  writeFileSync(executable, '#!/bin/sh\nexec "$AE_TEST_NODE" "$AE_TEST_CLI" "$@"\n', { mode: 0o755 })
}

async function runCli(args: readonly string[], environment: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return runProcess(process.execPath, [CLI_BUNDLE_PATH, ...args], environment)
}

async function runShell(command: string, environment: NodeJS.ProcessEnv): Promise<ProcessResult> {
  return runProcess('/bin/sh', ['-c', command], environment)
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
