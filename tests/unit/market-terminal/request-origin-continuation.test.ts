import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { runRequestCommand } from '../../../tools/ae/commands/request'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CLI_BUNDLE_PATH } from './cli-errors-harness'

type ListInput = Readonly<{
  cursor?: string
  limit: number
}>

type ObservedRequest = Readonly<{
  authorization?: string
  body: ListInput
  host?: string
  method?: string
  path?: string
}>

const temporaryDirectories: string[] = []
const servers: Server[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  await Promise.all(servers.splice(0).map(async (server) => new Promise<void>((resolveClose, reject) => {
    server.close((error) => error === undefined ? resolveClose() : reject(error))
  })))
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('request list origin continuations', () => {
  it('executes an opaque pagination continuation against the same resolved IPv6 origin in JSON mode', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ae-request-origin-'))
    temporaryDirectories.push(directory)
    const cursorInjectionMarker = join(directory, 'cursor-was-executed')
    const privateQueryMarker = join(directory, 'private-query-was-executed')
    const nextCursor = `opaque'; touch ${cursorInjectionMarker}; #`
    const privateQuery = `private acquisition; touch ${privateQueryMarker}`
    const bearer = 'FAKE_PRIVATE_REQUEST_BEARER_7182'
    const idempotency = 'private-idempotency-material-9184'
    const requests: ObservedRequest[] = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as ListInput
        requests.push({
          ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
          body,
          ...(request.headers.host === undefined ? {} : { host: request.headers.host }),
          ...(request.method === undefined ? {} : { method: request.method }),
          ...(request.url === undefined ? {} : { path: request.url }),
        })
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          kind: 'available',
          items: [{
            requestRef: `market-request:v1:${body.cursor === undefined ? 'a' : 'b'}`,
            query: privateQuery,
            createdAt: 10,
            updatedAt: 20,
          }],
          hasMore: body.cursor === undefined,
          ...(body.cursor === undefined ? { nextCursor } : {}),
        }))
      })
    })
    servers.push(server)
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '::1', resolveListen)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Expected an IPv6 test server address')
    const origin = `http://[::1]:${address.port}`
    const environment = {
      ...process.env,
      AE_API_KEY: bearer,
      AE_API_KEY_ORIGIN: origin,
      AE_CONFIG_DIR: directory,
    }

    const first = await runCli(['request', 'list', '--limit', '5', '--base-url', origin, '--json'], environment)
    expect(first.status).toBe(0)
    expect(first.stderr).toBe('')
    const firstJson = JSON.parse(first.stdout) as { nextCommand: string }
    expect(firstJson.nextCommand).toContain(`--base-url '${origin}' --json`)
    expect(firstJson.nextCommand).not.toContain(bearer)
    expect(firstJson.nextCommand).not.toContain(idempotency)
    expect(firstJson.nextCommand).not.toContain(privateQuery)

    installAeShim(directory)
    const continued = await runShell(firstJson.nextCommand, {
      ...environment,
      AE_TEST_CLI: CLI_BUNDLE_PATH,
      AE_TEST_NODE: process.execPath,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
    })

    expect(continued.status).toBe(0)
    expect(continued.stderr).toBe('')
    expect(JSON.parse(continued.stdout)).toMatchObject({ kind: 'available', hasMore: false })
    expect(requests).toEqual([
      {
        authorization: `Bearer ${bearer}`,
        body: { limit: 5 },
        host: `[::1]:${address.port}`,
        method: 'POST',
        path: '/api/v1/market-requests/list',
      },
      {
        authorization: `Bearer ${bearer}`,
        body: { limit: 5, cursor: nextCursor },
        host: `[::1]:${address.port}`,
        method: 'POST',
        path: '/api/v1/market-requests/list',
      },
    ])
    expect(existsSync(cursorInjectionMarker)).toBe(false)
    expect(existsSync(privateQueryMarker)).toBe(false)
  })

  it('follows a created request status command in a fresh shell without executing a hostile opaque reference', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ae-request-create-origin-'))
    temporaryDirectories.push(directory)
    const requestRefMarker = join(directory, 'request-ref-was-executed')
    const requestRef = `market-request:v1:opaque'; touch ${requestRefMarker}; #`
    const bearer = 'FAKE_CREATE_REQUEST_BEARER_3821'
    const originRequests: Array<{ body: unknown; path: string }> = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
        originRequests.push({ body, path: request.url ?? '' })
        response.writeHead(200, { 'content-type': 'application/json' })
        if (request.url === '/api/v1/market-requests') {
          response.end(JSON.stringify({
            kind: 'recorded',
            requestRef,
            query: 'private acquisition',
            createdAt: 10,
          }))
          return
        }
        if (request.url === '/api/v1/market-requests/status') {
          response.end(JSON.stringify({ kind: 'not_found' }))
          return
        }
        response.end(JSON.stringify({ kind: 'unexpected' }))
      })
    })
    servers.push(server)
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '::1', resolveListen)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Expected an IPv6 test server address')
    const origin = `http://[::1]:${address.port}`
    const environment = {
      ...process.env,
      AE_API_KEY: bearer,
      AE_API_KEY_ORIGIN: origin,
      AE_CONFIG_DIR: directory,
    }

    const first = await runCli(['request', 'create', 'private', 'acquisition', '--base-url', origin, '--json'], environment)
    expect(first.status).toBe(0)
    expect(first.stderr).toBe('')
    const firstJson = JSON.parse(first.stdout) as { nextCommand: string }
    expect(firstJson.nextCommand).toContain(`--base-url '${origin}' --json`)
    expect(firstJson.nextCommand).toContain(`'market-request:v1:opaque'"'"'; touch ${requestRefMarker}; #'`)
    expect(firstJson.nextCommand.match(/--base-url/gu)).toHaveLength(1)

    installAeShim(directory)
    const continued = await runShell(firstJson.nextCommand, {
      ...environment,
      AE_TEST_CLI: CLI_BUNDLE_PATH,
      AE_TEST_NODE: process.execPath,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
    })

    expect(continued.status).toBe(0)
    expect(continued.stderr).toBe('')
    expect(JSON.parse(continued.stdout)).toEqual({ kind: 'not_found' })
    expect(originRequests).toEqual([
      {
        body: expect.objectContaining({ query: 'private acquisition' }),
        path: '/api/v1/market-requests',
      },
      { body: { requestRef }, path: '/api/v1/market-requests/status' },
    ])
    expect(existsSync(requestRefMarker)).toBe(false)
  })

  it('preserves a selected origin for human output without inventing JSON mode', async () => {
    const origin = 'http://[::1]:3024'
    const output = await renderRequestList({
      baseUrl: origin,
      baseUrlSource: 'flag',
      json: false,
    })

    expect(output).toContain(`Next: ae request list --limit 5 --cursor 'opaque cursor' --base-url '${origin}'`)
    expect(output).not.toContain('--json')
    expect(output).not.toMatch(/Bearer|idempotency|private lookup/iu)
  })

  it('keeps hosted-default continuations free of redundant origin and output noise', async () => {
    const hostedOrigin = 'https://agentic-economy-phi.vercel.app'
    const human = await renderRequestList({
      baseUrl: hostedOrigin,
      baseUrlSource: 'hosted_default',
      json: false,
    })
    const json = JSON.parse(await renderRequestList({
      baseUrl: hostedOrigin,
      baseUrlSource: 'hosted_default',
      json: true,
    })) as { nextCommand: string }

    expect(human).toContain("Next: ae request list --limit 5 --cursor 'opaque cursor'")
    expect(human).not.toContain('--base-url')
    expect(human).not.toContain('--json')
    expect(json.nextCommand).toBe("ae request list --limit 5 --cursor 'opaque cursor' --json")
    expect(json.nextCommand).not.toContain('--base-url')
    expect(json.nextCommand).not.toMatch(/Bearer|idempotency|private lookup/iu)
  })
})

async function renderRequestList(input: Pick<CliOptions, 'baseUrl' | 'baseUrlSource' | 'json'>): Promise<string> {
  process.env.AE_API_KEY = 'FAKE_DIRECT_REQUEST_BEARER_4123'
  process.env.AE_API_KEY_ORIGIN = input.baseUrl
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    kind: 'available',
    items: [{
      requestRef: `market-request:v1:${'c'.repeat(64)}`,
      query: 'remembered job',
      createdAt: 10,
      updatedAt: 20,
    }],
    hasMore: true,
    nextCursor: 'opaque cursor',
  }), { status: 200, headers: { 'content-type': 'application/json' } })))
  const output = captureStdout()
  try {
    await runRequestCommand(['list'], {
      ...input,
      help: false,
      allowWrite: false,
      limit: '5',
    })
    return output.read()
  } finally {
    output.restore()
  }
}

function captureStdout(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return { read: () => writes.join(''), restore: () => spy.mockRestore() }
}

function installAeShim(directory: string): void {
  const executable = join(directory, 'ae')
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
