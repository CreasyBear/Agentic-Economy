import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPublicSourceTransport, setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { CURRENT_TOOL_PROJECTION_NAVIGATION } from '@/modules/actions/contract'
import { isRecord } from '@/modules/common/is-record'
import {
  searchCapabilityTools,
  serializeToolSearchResult,
  toolSearchInputSchema,
  type CapabilityToolSourcePort,
  type CapabilityToolSourceRecord,
} from '@/modules/capability-supply/public'
import { handleMarketToolSearchRequest } from '@/routes/api.v1.market-tools.search'
import { runSearchCommand } from '../../../tools/ae/commands/search'
import type { CliOptions } from '../../../tools/ae/lib/args'

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

describe('search health-filter continuation', () => {
  it('follows the real producer cursor through an empty filtered page', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ae-search-health-'))
    temporaryDirectories.push(directory)
    const degraded = sourceRecord(
      'capability:reference.lookup.degraded',
      'Reference lookup stale degraded',
      { observedAt: 1, validUntil: 1, lastHealthyAt: 1 },
    )
    const routeable = sourceRecord(
      'capability:reference.lookup.routeable',
      'Reference lookup ready',
      { observedAt: 1, validUntil: Number.MAX_SAFE_INTEGER },
    )
    const records = [degraded, routeable] as const
    const sourcePort: CapabilityToolSourcePort = {
      navigation: CURRENT_TOOL_PROJECTION_NAVIGATION,
      listCurrent: async () => ({
        tools: records,
        sourceCount: records.length,
        snapshotKey: 'snapshot:c07-health-filter',
      }),
      loadCurrent: async () => null,
    }
    const rawResults: unknown[] = []
    const restoreSourceTransport = setPublicSourceTransportForTests(createPublicSourceTransport({
      env: { CONVEX_URL: 'http://local-tool-search.test' },
      fetch: async (_input, init) => {
        const payload: unknown = JSON.parse(String(init?.body ?? '{}'))
        if (
          !isRecord(payload)
          || payload.path !== 'capabilityToolCatalog:search'
          || !Array.isArray(payload.args)
          || !isRecord(payload.args[0])
        ) {
          throw new Error('health_filter_source_request_invalid')
        }
        const result = await searchCapabilityTools(
          sourcePort,
          toolSearchInputSchema.parse(payload.args[0]),
          Date.now(),
        )
        rawResults.push(result)
        return Response.json({ status: 'success', value: serializeToolSearchResult(result) })
      },
    }))

    try {
      const requests: SearchInput[] = []
      const server = createServer((request, response) => {
        void (async () => {
          const chunks: Buffer[] = []
          for await (const chunk of request) chunks.push(Buffer.from(chunk))
          const body = Buffer.concat(chunks).toString('utf8')
          requests.push(JSON.parse(body) as SearchInput)
          const routeResponse = await handleMarketToolSearchRequest(new Request(
            'http://market.test/api/v1/market-tools/search',
            {
              method: request.method ?? 'POST',
              headers: { 'content-type': 'application/json' },
              body,
            },
          ))
          response.writeHead(routeResponse.status, Object.fromEntries(routeResponse.headers.entries()))
          response.end(Buffer.from(await routeResponse.arrayBuffer()))
        })().catch((error: unknown) => {
          response.writeHead(500, { 'content-type': 'text/plain' })
          response.end(String(error))
        })
      })
      servers.push(server)
      await new Promise<void>((resolveListen, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => resolveListen())
      })
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('health_filter_test_server_missing')
      const origin = `http://127.0.0.1:${address.port}`
      const query = 'reference lookup stale ready degraded'
      const filters = JSON.stringify({ healthStatus: ['operational'] })

      const first = await runCli([
        'search', query,
        '--limit', '1',
        '--filters', filters,
        '--base-url', origin,
        '--json',
      ])
      expect(first.status).toBe(0)
      expect(first.stderr).toBe('')
      const firstResult = JSON.parse(first.stdout) as Readonly<{
        kind: string
        note: string
        nextCommand?: string
        nextPageCommand?: string
        pagination: Readonly<{ hasMore: boolean; nextCursor?: string }>
      }>
      expect(rawResults[0]).toMatchObject({
        kind: 'ok',
        items: [{ availability: { posture: 'setup_required' } }],
        pagination: { hasMore: true, nextCursor: expect.any(String) },
      })
      expect(firstResult).toMatchObject({
        kind: 'no_candidates',
        note: 'No Tools match this search on this page.',
        pagination: { hasMore: true, nextCursor: expect.any(String) },
      })
      expect(firstResult.nextPageCommand).toBeTypeOf('string')
      expect(firstResult.nextCommand).toBe(firstResult.nextPageCommand)
      expect(first.stdout).not.toContain('request create')
      const nextPageCommand = firstResult.nextPageCommand
      const nextCursor = firstResult.pagination.nextCursor
      if (nextPageCommand === undefined || nextCursor === undefined) throw new Error('health_filter_continuation_missing')
      expect(nextPageCommand).toContain(`--base-url ${origin}`)
      expect(nextPageCommand).toContain(`--filters '${filters}'`)
      expect(nextPageCommand).toContain(`--cursor ${nextCursor}`)
      expect(nextPageCommand).toContain('--json')

      installAeShim(directory)
      const continued = await runShell(nextPageCommand, {
        ...process.env,
        AE_TEST_CLI: resolve('tools/ae/cli.ts'),
        AE_TEST_NODE: process.execPath,
        PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
      })

      expect(continued.status).toBe(0)
      expect(continued.stderr).toBe('')
      expect(JSON.parse(continued.stdout)).toMatchObject({
        kind: 'ok',
        count: 1,
        items: [{ healthStatus: 'operational' }],
        pagination: { hasMore: false },
      })
      expect(rawResults[1]).toMatchObject({
        kind: 'ok',
        items: [{ availability: { posture: 'routeable' } }],
        pagination: { hasMore: false },
      })
      expect(requests).toEqual([
        { query, limit: 1, filters: { healthStatus: ['operational'] } },
        { query, limit: 1, cursor: nextCursor, filters: { healthStatus: ['operational'] } },
      ])
    } finally {
      restoreSourceTransport()
    }
  })
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
          kind: 'ok',
          schemaVersion: 'registry-tools:v3',
          query: input.query,
          count: 0,
          items: [],
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
      AE_TEST_CLI: resolve('tools/ae/cli.ts'),
      AE_TEST_NODE: process.execPath,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
    })

    expect(continued.status).toBe(0)
    expect(continued.stderr).toBe('')
    expect(JSON.parse(continued.stdout)).toMatchObject({
      kind: 'ok',
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

  it('pins browse and private request recovery to the selected origin without adding the query to browse', async () => {
    const origin = 'http://[::1]:3024'
    const query = "supplier's private lookup"
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'no_candidates',
      schemaVersion: 'registry-tools:v3',
      query,
      count: 0,
      items: [],
      note: 'No operational Tools matched this search.',
      pagination: { limit: 10, hasMore: false },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
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

    const result = JSON.parse(output.read()) as { browseCommand: string; nextCommand: string }
    expect(result.nextCommand).toBe(`ae request create 'supplier'\"'\"'s private lookup' --base-url '${origin}' --json`)
    expect(result.browseCommand).toBe(`ae list --base-url '${origin}' --json`)
    expect(result.browseCommand).not.toContain(query)
    expect(result.nextCommand).not.toMatch(/AE_API_KEY|AE_SUPPLIER_API_KEY|credential|password/iu)
  })

  it('does not add JSON mode to continuations from a human invocation', async () => {
    const origin = 'http://[::1]:3024'
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      kind: 'no_candidates',
      schemaVersion: 'registry-tools:v3',
      query: 'private lookup',
      count: 0,
      items: [],
      note: 'No operational Tools matched this search.',
      pagination: { limit: 10, hasMore: false },
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

    expect(output.read()).toContain(`Remember this missing job: ae request create 'private lookup' --base-url '${origin}'`)
    expect(output.read()).toContain(`Browse all: ae list --base-url '${origin}'`)
    expect(output.read()).not.toContain('--json')
  })
})

function sourceRecord(
  operationId: string,
  summary: string,
  readiness: CapabilityToolSourceRecord['readiness'],
): CapabilityToolSourceRecord {
  const capabilityId = operationId.replace(/^capability:/u, '')
  return {
    operationId,
    publicationRef: `publication:${capabilityId}`,
    publicationRevision: 1,
    networkId: 'ae:public',
    contract: {
      contractFormat: 'ae.capability-contract:v2',
      capabilityId,
      version: 1,
      name: summary,
      ref: { capabilityId, version: 1, contractDigest: `digest:${capabilityId}` },
      description: summary,
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
      customerAnnotations: [],
      dataUse: [],
      effects: [],
      evidence: [],
      lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
    },
    business: { businessId: 'business:reference', slug: 'reference', name: 'Reference Services' },
    offering: { offeringRef: `offering:${capabilityId}`, revision: 1, label: summary, summary },
    price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
    priceEvidence: { priceDigest: `digest:price:${capabilityId}`, evidenceRefs: [] },
    materialTerms: [],
    commercialRelationship: { kind: 'none', summary: 'No commercial relationship.' },
    cancellation: { kind: 'unsupported' },
    authentication: { kind: 'ae_api_key' },
    transport: { method: 'GET', pathTemplate: '/lookup', requestTimeoutMs: 5_000 },
    provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
    integrated: true,
    routeable: true,
    readiness,
    searchTerms: ['reference', 'lookup'],
    snapshotKey: `publication:${capabilityId}:1`,
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
  writeFileSync(executable, '#!/bin/sh\nexec "$AE_TEST_NODE" --import tsx "$AE_TEST_CLI" "$@"\n', { mode: 0o755 })
}

async function runCli(args: readonly string[]): Promise<Readonly<{
  status: number | null
  stderr: string
  stdout: string
}>> {
  return runProcess(process.execPath, ['--import', 'tsx', 'tools/ae/cli.ts', ...args], process.env)
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
