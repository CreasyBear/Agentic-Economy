import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { runSearchCommand } from '../../../tools/ae/commands/search'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { CLI_BUNDLE_PATH } from './cli-errors-harness'

type SearchInput = Readonly<{
  cursor?: string
  filters?: Readonly<Record<string, unknown>>
  limit?: number
  query: string
}>

const temporaryDirectories: string[] = []
const servers: Server[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.all(servers.splice(0).map(async (server) => new Promise<void>((resolveClose, reject) => {
    server.close((error) => error === undefined ? resolveClose() : reject(error))
  })))
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('search origin continuations', () => {
  it('executes a pagination continuation against the same resolved odd origin', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ae-search-origin-'))
    temporaryDirectories.push(directory)
    const injectionMarker = join(directory, 'cursor-was-executed')
    const query = "supplier's $(touch query-was-executed)"
    const nextCursor = `next'; touch ${injectionMarker}; #`
    const requests: SearchInput[] = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SearchInput
        requests.push(input)
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          kind: input.cursor === undefined ? 'scoped' : 'noMatch',
          reason: input.cursor === undefined ? 'More supply remains to assess.' : 'No suitable Tools found.',
          schemaVersion: 'registry-tools:v3',
          query: input.query,
          results: [],
          assessed: input.cursor === undefined
            ? { source: 'all', scope: 'page', examined: 1, coverage: 'partial' }
            : { source: 'all', scope: 'complete', examined: 2, coverage: 'complete' },
          partialResults: input.cursor === undefined,
          next: input.cursor === undefined
            ? [{ action: 'next-page', authority: 'public', args: { query: input.query, cursor: nextCursor } }]
            : [{ action: 'broaden', authority: 'public', args: { query: input.query } }],
          pagination: input.cursor === undefined
            ? { limit: 1, hasMore: true, nextCursor }
            : { limit: 1, hasMore: false },
        }))
      })
    })
    servers.push(server)
    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '::1', () => resolveListen())
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Expected an IPv6 test server address')
    const origin = `http://[::1]:${address.port}`

    const first = await runCli(['search', query, '--limit', '1', '--base-url', origin, '--json'])
    expect(first.status).toBe(0)
    expect(first.stderr).toBe('')
    const result = JSON.parse(first.stdout) as { nextPageCommand: string }
    expect(result.nextPageCommand).toContain(`--base-url '${origin}'`)

    installAeShim(directory)
    const continued = await runShell(result.nextPageCommand, {
      ...process.env,
      AE_TEST_CLI: CLI_BUNDLE_PATH,
      AE_TEST_NODE: process.execPath,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
    })

    expect(continued.status).toBe(0)
    expect(continued.stderr).toBe('')
    expect(JSON.parse(continued.stdout)).toMatchObject({
      kind: 'noMatch',
      query,
      pagination: { hasMore: false },
    })
    expect(requests).toEqual([
      { query, limit: 1 },
      { query, limit: 1, cursor: nextCursor },
    ])
    expect(existsSync(injectionMarker)).toBe(false)
    expect(existsSync(resolve('query-was-executed'))).toBe(false)
  })

  it('does not invent a private request for a public no-match result', async () => {
    const origin = 'http://[::1]:3024'
    const query = "supplier's private lookup"
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'noMatch',
      reason: 'No suitable Tools found.',
      schemaVersion: 'registry-tools:v3',
      query,
      results: [],
      assessed: { source: 'all', scope: 'complete', examined: 1, coverage: 'complete' },
      partialResults: false,
      next: [{ action: 'broaden', authority: 'public', args: { query } }],
      pagination: { limit: 8, hasMore: false },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const output = captureStdout()
    const options: CliOptions = {
      baseUrl: origin,
      baseUrlSource: 'flag',
      json: true,
      help: false,
      allowWrite: false,
      apply: false,
    }

    try {
      await runSearchCommand([query], options)
    } finally {
      output.restore()
    }

    const result = JSON.parse(output.read()) as { kind: string; nextCommand?: string; browseCommand?: string }
    expect(result.kind).toBe('noMatch')
    expect(result.nextCommand).toBeUndefined()
    expect(result.browseCommand).toBeUndefined()
    expect(JSON.stringify(result)).not.toMatch(/AE_API_KEY|AE_SUPPLIER_API_KEY|credential|password/iu)
    expect(fetchMock.mock.calls[0]?.[0]).toContain(origin)
  })

  it('does not add JSON mode to continuations from a human invocation', async () => {
    const origin = 'http://[::1]:3024'
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'noMatch',
      reason: 'No suitable Tools found.',
      schemaVersion: 'registry-tools:v3',
      query: 'private lookup',
      results: [],
      assessed: { source: 'all', scope: 'complete', examined: 1, coverage: 'complete' },
      partialResults: false,
      next: [{ action: 'broaden', authority: 'public', args: { query: 'private lookup' } }],
      pagination: { limit: 8, hasMore: false },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const output = captureStdout()

    try {
      await runSearchCommand(['private lookup'], {
        baseUrl: origin,
        baseUrlSource: 'flag',
        json: false,
        help: false,
        allowWrite: false,
        apply: false,
      })
    } finally {
      output.restore()
    }

    expect(output.read()).not.toContain('request create')
    expect(output.read()).not.toContain('Browse all')
    expect(output.read()).not.toContain('--json')
  })
})

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

async function runCli(args: readonly string[]): Promise<Readonly<{
  status: number | null
  stderr: string
  stdout: string
}>> {
  return runProcess(process.execPath, [CLI_BUNDLE_PATH, ...args], process.env)
}

async function runShell(command: string, environment: NodeJS.ProcessEnv): Promise<Readonly<{
  status: number | null
  stderr: string
  stdout: string
}>> {
  return runProcess('/bin/sh', ['-c', command], environment)
}

async function runProcess(
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<Readonly<{ status: number | null; stderr: string; stdout: string }>> {
  const { promise, resolve: resolveResult, reject } = Promise.withResolvers<Readonly<{
    status: number | null
    stderr: string
    stdout: string
  }>>()
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
