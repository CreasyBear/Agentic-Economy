import * as childProcess from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { callResultSchema, projectCallMachineResult } from '@/modules/capability-execution/call-contracts'
import { REASON_COPY } from '@/content/reason-copy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const childProcessMockState = vi.hoisted(() => ({
  realSpawn: undefined as typeof import('node:child_process').spawn | undefined,
}))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  childProcessMockState.realSpawn = actual.spawn
  return { ...actual, spawn: vi.fn(actual.spawn) }
})

import { runConnectCommand } from '../../../tools/ae/commands/connect'
import { runCompareCommand } from '../../../tools/ae/commands/compare'
import { runDescribeCommand } from '../../../tools/ae/commands/describe'
import { runListCommand } from '../../../tools/ae/commands/list'
import { runSearchCommand } from '../../../tools/ae/commands/search'
import { runStatusCommand } from '../../../tools/ae/commands/status'
import { runCallCommand } from '../../../tools/ae/commands/call'
import { parseArgs, type CliOptions } from '../../../tools/ae/lib/args'
import { CliFailure } from '../../../tools/ae/lib/output'
import { withPendingConnect } from '../../../tools/ae/lib/pending-connect'
import { readStoredConnection, storeConnection } from '../../../tools/ae/lib/config'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { TOOL_QUOTE_PATH } from '@/modules/capability-execution/quote'
import { toolChoiceSearchOutputSchema } from '@/modules/registry/tool-choice-contracts'
import { CLI_BUNDLE_PATH } from './cli-errors-harness'
import {
  connectedAccount,
  operationDescriptor,
  operationDetailResult,
  operationInspection,
  operationListResult,
  operationSearchResult,
  SEARCH_ITEM_NAVIGATION,
} from './cold-loop-fixtures'
import {
  captureStderr,
  captureStdout,
  commitmentRef,
  connectFlowFetch,
  expectAnonymousPost,
  expectCliFailure,
  forceStdoutTTY,
  mockStandardOAuthConnect,
  oauthDeviceResponse,
  oauthRegisterResponse,
  oauthTokenSuccess,
  stubOAuthThroughToken,
  stubOAuthTokenTerminalError,
  operationRef,
  parseJson,
  pendingConnectionsDir,
  responseJson,
  stubFetchJsonResponse,
  stubFetchResolved,
  stdoutJson,
  withAeDisableBrowserOpen,
  withStdout,
  withStdoutStderr,
} from './cold-loop-harness'

const CURRENT_OPERATION_REF = operationRef('d')
const CURRENT_CALL_REF = `operation-invocation:v1:${'c'.repeat(64)}`
const options: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
  apply: false,
}

function restoreBrowserOpenMock(): void {
  const browserOpen = vi.mocked(childProcess.spawn)
  browserOpen.mockClear()
  if (childProcessMockState.realSpawn !== undefined) {
    browserOpen.mockImplementation(childProcessMockState.realSpawn)
  }
}

function runFreshShell(
  command: string,
  env: NodeJS.ProcessEnv,
): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const child = childProcess.spawn('/bin/sh', ['-c', command], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer | string) => {
    stdout += String(chunk)
  })
  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderr += String(chunk)
  })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }))
  })
}
function setApiKey(value: string, origin = options.baseUrl): void {
  process.env.AE_API_KEY = value
  process.env.AE_API_KEY_ORIGIN = new URL(origin).origin
}

let testConfigDirectory = ''

beforeEach(() => {
  testConfigDirectory = mkdtempSync(join(tmpdir(), 'ae-cli-cold-loop-'))
  process.env.AE_CONFIG_DIR = testConfigDirectory
})


afterEach(() => {
  vi.restoreAllMocks()
  if (childProcessMockState.realSpawn !== undefined) {
    vi.mocked(childProcess.spawn).mockImplementation(childProcessMockState.realSpawn)
  }
  vi.unstubAllGlobals()
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  delete process.env.AE_CONFIG_DIR
  rmSync(testConfigDirectory, { recursive: true, force: true })
})

describe('external-agent Market Tool cold loop', () => {
  it('searches anonymously over the public Operation route', async () => {
    const toolRef = operationRef('c')
    const fetchMock = stubFetchJsonResponse(
      operationSearchResult('extract invoices', [operationDescriptor(toolRef)]),
    )
    await runSearchCommand(['extract invoices'], options)
    expectAnonymousPost(fetchMock, options.baseUrl, '/api/v1/market-tools/search', { query: 'extract invoices', limit: 8 })
  })
  it('returns a noMatch envelope without inventing a purchase or demand continuation', async () => {
    const result = operationSearchResult('invoice extraction', [])
    stubFetchResolved(result)
    const output = parseJson(await withStdout(() => runSearchCommand(['invoice extraction'], options)))
    expect(output).toMatchObject({ kind: 'noMatch', results: [], assessed: { scope: 'complete' },
      next: [] })
    expect(output).not.toHaveProperty('nextCommand')
    const human = await withStdout(() => runSearchCommand(['invoice extraction'], { ...options, json: false }))
    expect(human).toContain('No suitable Tools found')
    expect(human).not.toContain('Next:')
    expect(human).not.toContain('request create')
  })
  it('keeps scoped page and exhausted no-match distinct when supply is not assessed', async () => {
    const query = 'reference lookup'
    const page = toolChoiceSearchOutputSchema.parse({
      ...operationSearchResult(query, []),
      kind: 'scoped',
      assessed: { source: 'current', scope: 'page', examined: 1, coverage: 'partial' },
      pagination: { limit: 1, nextCursor: 'opaque-page-cursor', hasMore: true },
      next: [{ action: 'registry.tools.search', authority: 'public', args: { query, cursor: 'opaque-page-cursor' } }],
    })
    expect(page).toMatchObject({ kind: 'scoped', results: [], next: [
      { action: 'registry.tools.search', args: { cursor: 'opaque-page-cursor' } },
    ] })
    const exhausted = operationSearchResult(query, [])
    expect(exhausted).toMatchObject({ kind: 'noMatch', assessed: { scope: 'complete' }, results: [] })
    stubFetchResolved(page)
    const output = parseJson(await withStdout(() => runSearchCommand(['reference lookup'], {
      ...options, filters: JSON.stringify({ healthStatus: ['degraded'] }),
    })))
    expect(output.nextPageCommand).toContain('--cursor opaque-page-cursor')
    const human = await withStdout(() => runSearchCommand(['reference lookup'], {
      ...options, json: false, filters: JSON.stringify({ healthStatus: ['degraded'] }),
    }))
    expect(human).toContain('Next: registry.tools.search {"query":"reference lookup","cursor":"opaque-page-cursor"}')
    expect(human).toContain('--cursor opaque-page-cursor')
  })

  it('browses all current Tools when no job is supplied', async () => {
    const toolRef = operationRef('b')
    const result = operationListResult([operationDescriptor(toolRef)])
    const fetchMock = stubFetchResolved(result)
    const outputText = await withStdout(() => runListCommand([], { ...options, json: false }))
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://market.example/api/v1/market-tools/list')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ limit: 50 })
    expect(outputText).toContain('Current Tools')
  })
  it('preserves source and filters when continuing an empty list page', async () => {
    const result = { ...operationListResult([]), pagination: { limit: 1, nextCursor: '1', hasMore: true } }
    const fetchMock = stubFetchResolved(result)
    const parsed = parseArgs(['list', '--source', 'payai', '--limit', '1', '--filters', '{"location":"NO MATCH"}', '--json'])
    const outputText = await withStdout(() =>
      runListCommand([], { ...parsed.options, baseUrl: options.baseUrl }))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ source: 'payai', limit: 1, filters: { location: 'NO MATCH' } })
    const { nextPageCommand } = parseJson(outputText)
    expect(nextPageCommand).toContain('--source payai')
    expect(nextPageCommand).toContain(`--filters '{"location":"NO MATCH"}'`)
    expect(nextPageCommand).toContain('--cursor 1')
  })

  it('rejects a malformed successful search body with a safe CLI error', async () => {
    stubFetchJsonResponse({ kind: 'ok', query: 'extract invoices', items: [] })
    await expectCliFailure(
      () => runSearchCommand(['extract invoices'], options),
      { kind: 'UNAVAILABLE', code: 'tool-search-result-invalid' },
    )
  })

  it('sends pagination inputs, then derives a page command from validated next[]', async () => {
    const toolRef = operationRef('d')
    const result = {
      ...operationSearchResult('reference lookup', [operationDescriptor(toolRef)]),
      pagination: { limit: 3, nextCursor: 'opaque-next-cursor', hasMore: true },
      next: [{ action: 'registry.tools.search', authority: 'public', args: { query: 'reference lookup', cursor: 'opaque-next-cursor' } }],
    }
    const fetchMock = stubFetchJsonResponse(result)
    const output = parseJson(await withStdout(() => runSearchCommand(['reference lookup'], {
      ...options, source: 'current', limit: '3', cursor: 'opaque-prior-cursor',
      filters: JSON.stringify({ healthStatus: ['operational'] }),
    })))
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      query: 'reference lookup', source: 'current', limit: 3,
      cursor: 'opaque-prior-cursor', filters: { healthStatus: ['operational'] },
    })
    expect(output).toMatchObject({ kind: 'match', results: [{ toolRef }],
      nextPageCommand: `ae search 'reference lookup' --limit 3 --source current --filters '{"healthStatus":["operational"]}' --cursor opaque-next-cursor --json` })
    expect(output).not.toHaveProperty('nextCommand')
  })

  it('prints completed calls, p50 latency, last verified and payers on each human search row', async () => {
    const toolRef = operationRef('e')
    const base = operationSearchResult('reference lookup', [operationDescriptor(toolRef)])
    stubFetchJsonResponse({ ...base, results: base.results.map(row => ({ ...row,
      signals: { calls: 9, successRate: 8 / 9, latencyP50Ms: 850, payers30d: 1 } })) })
    const human = await withStdout(() => runSearchCommand(['reference lookup'], { ...options, json: false }))
    expect(human).toContain('     8 of 9 AE calls completed · p50 850 ms · new')
  })

  it('rejects --technical on compact search before requesting full metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await expectCliFailure(
      () => runSearchCommand(['reference lookup'], { ...options, technical: true }),
      { kind: 'INVALID_ARGUMENT', code: 'search-technical-unsupported',
        message: 'Search returns compact results. Run ae describe <ToolRef> to inspect full Tool metadata.' },
      fetchMock,
    )
  })

  it('returns a concise match envelope with typed describe next[]', async () => {
    const refs = [operationRef('e'), operationRef('f')]
    const result = operationSearchResult('reference lookup', refs.map((ref) => operationDescriptor(ref)))
    stubFetchJsonResponse(result)
    const output = parseJson(await withStdout(() => runSearchCommand(['reference lookup'], options)))
    expect(output).toMatchObject({ kind: 'match', results: [
      { toolRef: refs[0], next: [{ action: 'registry.tools.describe', args: { toolRef: refs[0] } }] },
      { toolRef: refs[1], next: [{ action: 'registry.tools.describe', args: { toolRef: refs[1] } }] },
    ] })
    expect(output).not.toHaveProperty('nextCommand')
  })
  it('renders every mixed inspection action and assessed scope in plain output', async () => {
    const toolRef = operationRef('e')
    const listingRef = `registry:${'f'.repeat(64)}`
    const matched = operationSearchResult('lookup', [operationDescriptor(toolRef)])
    if (matched.kind !== 'match') throw new Error('fixture_expected_match')
    const result = toolChoiceSearchOutputSchema.parse({
      ...matched,
      results: [...matched.results, {
        id: listingRef, source: 'coinbase', access: 'ae_callable', toolRef: listingRef,
        title: 'External lookup', summary: 'Unpublished search', provider: 'Outside',
        actionClass: 'retrieve', objectClass: 'data', readiness: 'unverified',
        price: { kind: 'unavailable' }, detailRef: `/api/v1/registry/detail?id=${listingRef}`,
        next: [],
      }, {
        id: 'opaque-2', source: 'coinbase', access: 'unavailable', reason: 'chain_unsupported',
        title: 'Solana lookup', summary: 'Other chain', provider: 'Outside',
        actionClass: 'retrieve', objectClass: 'data', readiness: 'unavailable',
        price: { kind: 'unavailable' }, detailRef: '/api/v1/registry/detail?id=opaque-2',
        next: [],
      }],
    })
    stubFetchJsonResponse(result)
    const human = await withStdout(() => runSearchCommand(['lookup'], { ...options, json: false }))
    expect(human).toContain('scope: all/complete')
    expect(human).toContain(`describe {"toolRef":"${toolRef}"} · ae describe ${toolRef}`)
    expect(human).not.toContain('describe-external')
    expect(human).toContain(`External lookup · AE callable`)
    expect(human).toContain(`quote · ae call ${listingRef} --input '<json>'`)
    expect(human).toContain(`Solana lookup · Unavailable: ${REASON_COPY.chain_unsupported}`)
    expect(human).toContain('ref: /api/v1/registry/detail?id=opaque-2')
    expect(human).not.toContain('Next:')
  })

  it('returns unavailable as a retryable classified outcome, not a thrown CLI failure', async () => {
    const result = toolChoiceSearchOutputSchema.parse({
      ...operationSearchResult('lookup', []),
      kind: 'unavailable',
      reason: 'source_unavailable',
      assessed: { source: 'all', scope: 'page', examined: 0, coverage: 'partial' },
      next: [{ action: 'registry.tools.search', authority: 'public', args: { query: 'lookup' } }],
    })
    stubFetchJsonResponse(result)
    const json = parseJson(await withStdout(() => runSearchCommand(['lookup'], options)))
    expect(json).toMatchObject({ kind: 'unavailable', next: [
      { action: 'registry.tools.search', args: { query: 'lookup' } },
    ] })
    const human = await withStdout(() => runSearchCommand(['lookup'], { ...options, json: false }))
    expect(human).toContain('scope: all/page')
    expect(human).toContain('Next: registry.tools.search {"query":"lookup"} · ae search lookup')
  })

  it('rejects an out-of-range search limit before network work', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await expectCliFailure(
      () => runSearchCommand(['reference lookup'], { ...options, limit: '21' }),
      { kind: 'INVALID_ARGUMENT', code: 'search-limit-invalid' },
      fetchMock,
    )
  })
  it.each([['x'.repeat(201)], ['']])('rejects an out-of-bounds search query before network work', async (query) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await expectCliFailure(
      () => runSearchCommand([query], options),
      {
        kind: 'INVALID_ARGUMENT',
        code: 'query_invalid',
        message: 'Search requires a capability phrase from 1 to 200 characters.',
      },
      fetchMock,
    )
  })

  it('parses search pagination and filter flags through the existing argument model', () => {
    const parsed = parseArgs([
      'search',
      'reference lookup',
      '--limit',
      '3',
      '--cursor',
      'opaque-cursor',
      '--filters',
      '{"healthStatus":["operational"]}',
    ])

    expect(parsed).toMatchObject({
      command: 'search',
      positionals: ['reference lookup'],
      options: {
        limit: '3',
        cursor: 'opaque-cursor',
        filters: '{"healthStatus":["operational"]}',
      },
    })
  })

  it('describes one exact Tool anonymously', async () => {
    const toolRef = operationRef('a')
    const fetchMock = stubFetchJsonResponse(operationDetailResult(operationDescriptor(toolRef, 'Extract invoices')))
    const outputText = await withStdout(() => runDescribeCommand([toolRef], options))
    const parsed = parseJson(outputText)
    expect(parsed).toMatchObject({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: {
        toolRef,
        capabilityId: 'reference.lookup',
        description: 'Extract invoices',
        provider: { name: 'Reference Services', slug: 'reference' },
        healthStatus: 'operational',
      },
    })
    expect(parsed).not.toHaveProperty('nextCommand')
    expectAnonymousPost(fetchMock, options.baseUrl, '/api/v1/market-tools/describe', { toolRef, includeLatency: true })
  })

  it('inspects a directory reference without presenting its metadata as a published contract', async () => {
    const toolRef = `registry:${'a'.repeat(64)}`
    const detail = { kind: 'external', schemaVersion: 'registry-tools:v3', tool: {
      id: toolRef, toolRef, source: 'coinbase', access: 'ae_callable', readiness: 'unverified',
      verification: 'not_verified', claimSource: 'provider', title: 'Web search', description: 'Search public pages',
      provider: 'search.test', resource: 'https://search.test/search', prices: [],
      input: { fields: [], schemaJson: '{"type":"object"}' },
    } }
    const fetchMock = stubFetchJsonResponse(detail)
    const human = await withStdout(() => runDescribeCommand([toolRef], { ...options, json: false }))
    expect(human).toContain('unverified · Provider-declared metadata')
    expect(human).toContain('price: confirmed by Quote')
    expect(human).toContain('ae_tool_quote with this directory reference and input')
    expectAnonymousPost(fetchMock, options.baseUrl, '/api/v1/market-tools/describe', { toolRef, includeLatency: true })
    stubFetchJsonResponse(detail)
    expect(parseJson(await withStdout(() => runDescribeCommand([toolRef], options)))).toEqual(detail)
  })

  it('keeps describe output canonical and free of duplicated source navigation', async () => {
    const toolRef = operationRef('9')
    const repeatedInputSchema = {
      type: 'object',
      properties: Object.fromEntries(Array.from({ length: 24 }, (_, index) => [
        `field${index}`,
        { type: 'string', description: `Bounded input field ${index}` },
      ])),
    }
    const navigation = SEARCH_ITEM_NAVIGATION.map((relation) => ({
      ...relation,
      inputSchema: repeatedInputSchema,
    }))
    const operation = {
      ...operationDescriptor(toolRef, 'Detailed reference lookup'),
      navigation,
    }
    stubFetchResolved(operationDetailResult(operation))

    const defaultSerialized = await withStdout(() => runDescribeCommand([toolRef], options))
    const defaultResult = parseJson(defaultSerialized) as { tool: Record<string, unknown> }
    expect(defaultResult.tool).not.toHaveProperty('navigation')
    expect(defaultResult.tool).toHaveProperty('inputJsonSchema')
    expect(defaultResult).not.toHaveProperty('nextCommand')

    const technicalSerialized = await withStdout(() =>
      runDescribeCommand([toolRef], { ...options, technical: true }))
    expect(parseJson(technicalSerialized)).toEqual(defaultResult)
  })

  it('preserves time-to-result evidence in JSON and explains it in human describe output', async () => {
    const toolRef = operationRef('a')
    const detail = operationDetailResult(operationDescriptor(toolRef, 'Extract invoices'))
    if (detail.kind !== 'found') throw new Error('Expected a found Tool fixture.')
    const latency = {
      kind: 'measured', measurement: 'admitted_to_completed', medianMs: 40_000, p95Ms: 42_000,
      sampleSize: 5, display: '40 s', window: { from: 1_788_608_000_000, to: 1_791_200_000_000 },
      definition: 'AE admission to recorded completion, including recovery; not network time to first byte or an SLA.',
    }
    stubFetchJsonResponse({ ...detail, tool: { ...detail.tool, latency } })
    expect(parseJson(await withStdout(() => runDescribeCommand([toolRef], options)))).toMatchObject({ tool: { latency } })
    const human = await withStdout(() => runDescribeCommand([toolRef], { ...options, json: false }))
    expect(human).toContain('time to result: median 40 s, p95 42 s · 5 completed Calls · last 30 days')
    expect(human).toContain('not network time to first byte')
  })

  it('keeps anonymous describe factual and names the runnable CLI purchase path', async () => {
    const toolRef = operationRef('b')
    const operation = { ...operationDescriptor(toolRef, 'Inspect-only continuation') }
    const fetchMock = stubFetchResolved(operationDetailResult(operation))
    const outputText = await withStdout(() => runDescribeCommand([toolRef], { ...options, json: false }))
    expect(outputText).toContain('health: operational')
    expect(outputText).toContain(`Next: ae call ${toolRef} --input '<json>'`)
    expect(outputText).toContain('From an MCP client: ae_tool_quote')
    expect(outputText).not.toContain('tool.quote from your connected agent client')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a malformed successful detail body with a safe CLI error', async () => {
    const toolRef = operationRef('e')
    stubFetchJsonResponse({ kind: 'found', tool: { toolRef } })
    await expectCliFailure(
      () => runDescribeCommand([toolRef], options),
      { kind: 'UNAVAILABLE', code: 'tool-describe-result-invalid' },
    )
  })

  it('rejects a non-canonical Tool reference before network work', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await expectCliFailure(
      () => runDescribeCommand(['operation:v1:current'], options),
      {
        kind: 'INVALID_ARGUMENT',
        code: 'tool-ref-invalid',
        message: 'Tool reference must match operation:v1:<64 lowercase hex characters>.',
      },
      fetchMock,
    )
  })
  it('completes the anonymous-to-authenticated Tool lifecycle with durable replay', async () => {
    const toolRef = operationRef('a')
    const comparisonToolRef = operationRef('b')
    const callRef = CURRENT_CALL_REF
    const idempotencyKey = 'cold-loop-idempotency'
    const initialInput = { query: 'bitcoin price' }
    const changedInput = { query: 'ethereum price' }
    const completedResult = {
      kind: 'completed' as const,
      callRef,
      toolRef,
      output: { value: 42, currency: 'USD' },
      evidenceHash: 'sha256:cold-loop-effect',
      usage: {
        usageRef: 'usage:cold-loop',
        observedAt: 1,
        chargeState: 'free_tier' as const,
        amount: { currency: 'USD', units: '0', exponent: 2 },
        priceDigest: 'sha256:cold-loop-price',
      },
    }
    const unavailableRead = {
      kind: 'unavailable' as const,
      schemaVersion: 'registry-tools:v3' as const,
      reason: 'tool_not_found' as const,
    }
    const requests: Array<{
      url: string
      method: string
      authorization: string | null
      body: unknown
    }> = []
    const durableCalls = new Map<string, {
      toolRef: string
      input: Record<string, unknown>
      result: typeof completedResult
    }>()
    const quotes = new Map<string, {
      toolRef: string
      input: Record<string, unknown>
    }>()
    let providerEffects = 0
    const jsonResponse = (body: unknown, status = 200, contentType = 'application/json') => (
      new Response(JSON.stringify(callResultSchema.safeParse(body).success ? projectCallMachineResult(callResultSchema.parse(body)) : body), { status, headers: { 'content-type': contentType } })
    )
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const authorization = new Headers(init?.headers).get('Authorization')
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))
      requests.push({ url, method, authorization, body })
      const route = new URL(url).pathname

      if (route === '/api/v1/market-tools/search') {
        return jsonResponse(operationSearchResult('bitcoin price', [
          operationDescriptor(toolRef, 'Current bitcoin price'),
          operationDescriptor(comparisonToolRef, 'Comparison bitcoin price'),
        ]))
      }
      if (route === '/api/v1/market-tools/describe') {
        return jsonResponse(operationDetailResult(operationDescriptor(toolRef, 'Current bitcoin price')))
      }
      if (route === '/api/v1/market-tools/compare') {
        return jsonResponse(unavailableRead)
      }
      if (route === '/api/v1/account') {
        return jsonResponse({ ...connectedAccount(), accountRef: 'account:cold-loop', principalRef: 'principal:cold-loop' })
      }
      if (route === TOOL_QUOTE_PATH) {
        if (authorization !== 'Bearer ae-test-caller-key') {
          throw new Error('quote must be authenticated')
        }
        const request = body as { toolRef: string; input: Record<string, unknown> }
        const quoteCommitmentRef = JSON.stringify(request.input) === JSON.stringify(initialInput)
          ? commitmentRef('1')
          : commitmentRef('2')
        quotes.set(quoteCommitmentRef, request)
        return jsonResponse(operationInspection(request.toolRef, request.input, quoteCommitmentRef))
      }
      if (route === CALL_ROUTE_CONTRACT.call.path) {
        if (authorization !== 'Bearer ae-test-caller-key') {
          throw new Error('call must be authenticated')
        }
        const request = body as {
          quoteRef: string
          idempotencyKey: string
        }
        const committed = quotes.get(request.quoteRef)
        if (committed === undefined) throw new Error('call without quote')
        const existing = durableCalls.get(request.idempotencyKey)
        if (existing !== undefined) {
          if (
            existing.toolRef !== committed.toolRef
            || JSON.stringify(existing.input) !== JSON.stringify(committed.input)
          ) {
            return jsonResponse({
              type: 'about:blank',
              title: 'Already exists',
              status: 409,
              kind: 'ALREADY_EXISTS',
              code: 'idempotency_conflict',
              detail: 'The idempotency key is already bound to different operation input.',
              retryable: false,
            }, 409, 'application/problem+json')
          }
          return jsonResponse(existing.result)
        }

        providerEffects += 1
        durableCalls.set(request.idempotencyKey, {
          toolRef: committed.toolRef,
          input: committed.input,
          result: completedResult,
        })
        return jsonResponse({
          kind: 'pending',
          callRef,
          toolRef: committed.toolRef,
          retryAfterMs: 100,
        })
      }
      if (route === `/api/v1/status/${encodeURIComponent(callRef)}` ||
        route === `/api/v1/calls/${encodeURIComponent(callRef)}`) {
        if (authorization !== 'Bearer ae-test-caller-key') {
          throw new Error('status must be authenticated')
        }
        const existing = durableCalls.get(idempotencyKey)
        if (existing === undefined) throw new Error('status read before call')
        const recovery = {
          kind: 'found',
          callRef,
          version: 1,
          toolRef,
          state: 'terminal',
          evidenceHash: existing.result.evidenceHash,
          result: existing.result,
        }
        if (route.startsWith('/api/v1/calls/')) return jsonResponse(recovery)
        return jsonResponse({
          kind: 'call',
          ref: callRef,
          principalRef: `prn_${'b'.repeat(32)}`,
          recovery,
          workState: 'completed',
          next: [],
        })
      }
      throw new Error(`Unexpected CLI route: ${method} ${url}`)
    })
    const writes: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
    vi.stubGlobal('fetch', fetchMock)

    await runSearchCommand(['bitcoin', 'price'], options)
    await runDescribeCommand([toolRef], options)
    await expect(
      runCompareCommand([toolRef, comparisonToolRef], options),
    ).rejects.toMatchObject({
      kind: 'NOT_FOUND',
      code: 'tool_not_found',
      exitCode: 1,
    } satisfies Partial<CliFailure>)
    setApiKey('ae-test-caller-key')
    const invokeOptions = { ...options, idempotencyKey, wait: false }
    const readJsonOutput = async (run: () => Promise<unknown>): Promise<Record<string, unknown>> => {
      const start = writes.length
      await run()
      return JSON.parse(writes.slice(start).join('')) as Record<string, unknown>
    }
    const pending = await readJsonOutput(() => runCallCommand(
      [toolRef],
      { ...invokeOptions, input: JSON.stringify(initialInput) },
    ))
    expect(pending).toMatchObject({ kind: 'pending', callRef, toolRef })
    expect(pending).not.toHaveProperty('idempotencyKey')

    const status = await readJsonOutput(() => runStatusCommand([callRef], invokeOptions))
    expect(status).toMatchObject({
      kind: 'call',
      ref: callRef,
      principalRef: `prn_${'b'.repeat(32)}`,
      workState: 'completed',
      next: [],
      recovery: { kind: 'found', callRef, toolRef, state: 'terminal', result: completedResult },
    })

    const replay = await readJsonOutput(() => runCallCommand(
      [toolRef],
      { ...invokeOptions, input: JSON.stringify(initialInput) },
    ))
    expect(replay).toEqual({ ...completedResult, recoveryRef: pending.recoveryRef })

    await expect(runCallCommand(
      [toolRef],
      { ...invokeOptions, input: JSON.stringify(changedInput) },
    )).rejects.toMatchObject({
      kind: 'FAILED_PRECONDITION',
      code: 'call-recovery-input-conflict',
    } satisfies Partial<CliFailure>)

    expect(providerEffects).toBe(1)
    expect(requests.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'POST', url: 'https://market.example/api/v1/market-tools/search' },
      { method: 'POST', url: 'https://market.example/api/v1/market-tools/describe' },
      { method: 'POST', url: 'https://market.example/api/v1/market-tools/compare' },
      { method: 'POST', url: `https://market.example${TOOL_QUOTE_PATH}` },
      { method: 'POST', url: 'https://market.example/api/v1/tools/call' },
      { method: 'GET', url: `https://market.example/api/v1/status/${encodeURIComponent(callRef)}` },
      { method: 'GET', url: 'https://market.example/api/v1/account' },
      { method: 'GET', url: `https://market.example/api/v1/calls/${encodeURIComponent(callRef)}` },
    ])
    expect(requests.map(({ authorization }) => authorization)).toEqual([
      null,
      null,
      null,
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
      'Bearer ae-test-caller-key',
    ])
    expect(requests.map(({ body }) => body)).toEqual([
      { query: 'bitcoin price', limit: 8 },
      { toolRef, includeLatency: true },
      { toolRefs: [toolRef, comparisonToolRef], includeLatency: true },
      { toolRef, input: initialInput },
      { quoteRef: commitmentRef('1'), idempotencyKey },
      undefined,
      undefined,
      undefined,
    ])
  })

  it('generates a durable idempotency key when call omits one', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseJson(operationInspection(CURRENT_OPERATION_REF, {})))
      .mockResolvedValueOnce(responseJson({
        kind: 'pending', callRef: CURRENT_CALL_REF, toolRef: CURRENT_OPERATION_REF, retryAfterMs: 100,
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await stdoutJson(() => runCallCommand([CURRENT_OPERATION_REF], { ...options, input: '{}' }))
    expect(result).not.toHaveProperty('idempotencyKey')
    const [, init] = fetchMock.mock.calls[1]!
    const request = JSON.parse(String(init?.body)) as { idempotencyKey: string }
    expect(request.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns pending with a reusable key and status continuation without --wait', async () => {
    setApiKey('ae-test-caller-key')
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseJson(operationInspection(CURRENT_OPERATION_REF, {})))
      .mockResolvedValueOnce(responseJson({
        kind: 'pending',
        callRef: CURRENT_CALL_REF,
        toolRef: CURRENT_OPERATION_REF,
        retryAfterMs: 100,
      }))
    vi.stubGlobal('fetch', fetchMock)

    const outputText = await withStdout(() => runCallCommand([CURRENT_OPERATION_REF], {
      ...options,
      baseUrlSource: 'flag',
      input: '{}',
      idempotencyKey: 'idem-stable',
    }))

    const printed = parseJson(outputText) as {
      kind: string
      callRef: string
      toolRef: string
      retryAfterMs: number
      nextCommand: string
    }
    expect(printed).toEqual({
      kind: 'pending',
      callRef: CURRENT_CALL_REF,
      toolRef: CURRENT_OPERATION_REF,
      retryAfterMs: 100,
      next: [{ action: 'call.status', args: { callRef: CURRENT_CALL_REF }, authority: 'same_principal', retryAfterMs: 100 }],
      nextCommand: `ae status ${CURRENT_CALL_REF} --base-url https://market.example --json`,
      recoveryRef: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    })
    expect(outputText).not.toContain('idem-stable')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reads status through the authenticated canonical route', async () => {
    setApiKey('ae-test-caller-key')
    const statusBody = {
      kind: 'call',
      ref: CURRENT_CALL_REF,
      principalRef: `prn_${'b'.repeat(32)}`,
      recovery: {
        kind: 'found',
        callRef: CURRENT_CALL_REF,
        version: 1,
        toolRef: CURRENT_OPERATION_REF,
        state: 'in_progress',
      },
      workState: 'working',
      next: [{ action: 'call.status', args: { callRef: CURRENT_CALL_REF }, authority: 'same_principal' }],
    }
    const fetchMock = stubFetchJsonResponse(statusBody)
    const outputText = await withStdout(async () => { await runStatusCommand([CURRENT_CALL_REF], options) })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`https://market.example/api/v1/status/${encodeURIComponent(CURRENT_CALL_REF)}`)
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(parseJson(outputText)).toEqual(statusBody)
  })

  it('refuses a missing API key origin before any credentialed fetch', async () => {
    setApiKey('ae-test-caller-key')
    delete process.env.AE_API_KEY_ORIGIN
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await expectCliFailure(
      () => runStatusCommand([CURRENT_CALL_REF], options),
      { kind: 'INVALID_ARGUMENT', code: 'agent_access_key_origin_required' },
      fetchMock,
    )
  })

  it('refuses HTTPS and HTTP attacker base-url overrides before any credentialed fetch', async () => {
    process.env.AE_API_KEY = 'ae-test-caller-key'
    process.env.AE_API_KEY_ORIGIN = 'https://market.example'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    for (const baseUrl of ['https://attacker.example', 'http://attacker.example']) {
      await expectCliFailure(
        () => runStatusCommand([CURRENT_CALL_REF], { ...options, baseUrl }),
        { kind: 'INVALID_ARGUMENT', code: 'agent_access_key_origin_mismatch' },
      )
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows matching loopback HTTP development credentials', async () => {
    const loopbackOptions = { ...options, baseUrl: 'http://127.0.0.1:3210', baseUrlSource: 'flag' as const }
    setApiKey('ae-test-caller-key', loopbackOptions.baseUrl)
    const statusBody = {
      kind: 'call',
      ref: CURRENT_CALL_REF,
      principalRef: `prn_${'b'.repeat(32)}`,
      recovery: {
        kind: 'found',
        callRef: CURRENT_CALL_REF,
        version: 1,
        toolRef: CURRENT_OPERATION_REF,
        state: 'in_progress',
      },
      workState: 'working',
      next: [{ action: 'call.status', args: { callRef: CURRENT_CALL_REF }, authority: 'same_principal' }],
    }
    const fetchMock = stubFetchJsonResponse(statusBody)
    const outputText = await withStdout(async () => { await runStatusCommand([CURRENT_CALL_REF], loopbackOptions) })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`http://127.0.0.1:3210/api/v1/status/${encodeURIComponent(CURRENT_CALL_REF)}`)
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-test-caller-key')
    expect(parseJson(outputText)).toEqual(statusBody)
  })

  it.each([false, true])('resumes an approval after the CLI wait; expired=%s creates a fresh request', async (expired) => {
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const output = captureStdout()
    const diagnostics = captureStderr()
    let registrations = 0
    let polls = 0
    const polledCodes: string[] = []
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).endsWith('/oauth/register')) {
        registrations += 1
        return responseJson({ client_id: `client-${registrations}` })
      }
      if (String(url).endsWith('/oauth/device_authorization')) return responseJson({
        device_code: `private-device-${registrations}`, user_code: `CODE-${registrations}`,
        verification_uri: 'https://market.example/agent-access/authorize', expires_in: 600, interval: 5,
      })
      if (String(url).endsWith('/oauth/token')) {
        polledCodes.push(new URLSearchParams(String(init?.body)).get('device_code')!)
        polls += 1
        if (polls === 1) {
          now += 61_000
          return Response.json({ error: 'authorization_pending' }, { status: 400 })
        }
        return responseJson({ access_token: 'private-issued-key', scope: 'market_tools:call customer_requests:spending_policy' })
      }
      return responseJson(connectedAccount())
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await runConnectCommand([], options)
      expect(JSON.parse(output.read())).toMatchObject({ kind: 'pending', ownerHandoff: { actor: 'account_owner', reason: 'device_authorization_required', destination: 'https://market.example/agent-access/authorize' } })
      const pendingDirectory = pendingConnectionsDir(testConfigDirectory)
      const files = readdirSync(pendingDirectory)
      expect(files).toHaveLength(1)
      expect(statSync(join(pendingDirectory, files[0]!)).mode & 0o777).toBe(0o600)
      expect(statSync(pendingDirectory).mode & 0o777).toBe(0o700)
      now += expired ? 600_000 : 5_000
      await runConnectCommand([], options)
      expect(registrations).toBe(expired ? 2 : 1)
      expect(polledCodes).toEqual(['private-device-1', expired ? 'private-device-2' : 'private-device-1'])
      expect(output.read()).toContain('"kind": "connected"')
      expect(readdirSync(pendingDirectory)).toHaveLength(0)
      expect(output.read() + diagnostics.read()).not.toMatch(/private-device|private-issued-key/)
    } finally { output.restore(); diagnostics.restore() }
  })

  it.each(['access_denied', 'expired_token', 'invalid_grant', 'invalid_client'] as const)(
    'clears pending approval on terminal OAuth token error: %s',
    async (oauthError) => {
      const diagnostics = captureStderr()
      const fetchMock = stubOAuthTokenTerminalError(oauthError)
      try {
        await expect(runConnectCommand([], options)).rejects.toMatchObject({
          kind: 'UNAVAILABLE',
          code: oauthError,
        } satisfies Partial<CliFailure>)
        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(readdirSync(pendingConnectionsDir(testConfigDirectory))).toHaveLength(0)
        expect(readStoredConnection(options.baseUrl)).toBeUndefined()
      } finally {
        diagnostics.restore()
      }
    },
  )

  it.each([
    ['missing buyer scope', { ...connectedAccount(), scopes: ['customer_requests:spending_policy'] }, {}],
    ['requested environment mismatch', { ...connectedAccount(), environment: 'production' }, { environment: 'sandbox' }],
  ] as const)('rejects a newly issued credential before storage when account validation fails: %s', async (_label, account, overrides) => {
    const diagnostics = captureStderr()
    const fetchMock = stubOAuthThroughToken(account)
    try {
      await expect(runConnectCommand([], { ...options, ...overrides })).rejects.toMatchObject({
        kind: 'UNAUTHENTICATED',
        code: 'api_key_invalid',
      } satisfies Partial<CliFailure>)
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/v1/account'))).toHaveLength(21)
      expect(readdirSync(pendingConnectionsDir(testConfigDirectory))).toHaveLength(0)
      expect(readStoredConnection(options.baseUrl)).toBeUndefined()
    } finally {
      diagnostics.restore()
    }
  }, 15_000)

  it('does not resume a consumed device code when issued-key validation fails', async () => {
    const output = captureStdout()
    const diagnostics = captureStderr()
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseJson({ client_id: 'client' }))
      .mockResolvedValueOnce(responseJson({ device_code: 'private-device', user_code: 'CODE',
        verification_uri: 'https://market.example/agent-access/authorize', expires_in: 600, interval: 5 }))
      .mockResolvedValueOnce(responseJson({ access_token: 'private-issued-key' }))
      .mockResolvedValueOnce(Response.json({ error: 'temporarily_unavailable' }, { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(runConnectCommand([], options)).rejects.toMatchObject({ code: 'connect_validation_unavailable' })
      expect(readdirSync(pendingConnectionsDir(testConfigDirectory))).toHaveLength(0)
      expect(output.read() + diagnostics.read()).not.toMatch(/private-device|private-issued-key/)
    } finally { output.restore(); diagnostics.restore() }
  })

  it('isolates pending approvals by origin, role and environment and excludes concurrent pollers', async () => {
    const sandbox = { ...options, environment: 'sandbox' }
    await withPendingConnect(sandbox, async (store) => {
      store.write({ clientId: 'client', deviceCode: 'private-device', userCode: 'CODE',
        verificationUri: 'https://market.example/agent-access/authorize', expiresAt: Date.now() + 600_000,
        intervalMs: 5_000, nextPollAt: 0, provider: false })
      await expect(withPendingConnect(sandbox, async () => undefined)).rejects.toMatchObject({ code: 'connect_in_progress' })
    })
    for (const other of [{ ...sandbox, baseUrl: 'https://other.example' }, { ...sandbox, provider: true },
      { ...sandbox, environment: 'production' }, options]) {
      await withPendingConnect(other, async (store) => expect(store.read()).toBeUndefined())
    }
    await withPendingConnect(sandbox, async (store) => expect(store.read()?.userCode).toBe('CODE'))
  })

  it('uses the existing OAuth device flow and returns the one-time AE credential', async () => {
    const fetchMock = mockStandardOAuthConnect(connectedAccount(), 'ae-issued-secret', { expires_in: 604800 })
    vi.stubGlobal('fetch', fetchMock)
    const outputText = await withStdout(() => runConnectCommand([], options))

    const registration = fetchMock.mock.calls[0]!
    expect(registration[0]).toBe('https://market.example/oauth/register')
    expect(JSON.parse(String(registration[1]?.body))).toMatchObject({
      grant_types: ['urn:ietf:params:oauth:grant-type:device_code'],
      token_endpoint_auth_method: 'none',
      scope: 'market_tools:call customer_requests:spending_policy',
    })
    const deviceAuthorization = fetchMock.mock.calls[1]!
    expect(deviceAuthorization[0]).toBe('https://market.example/oauth/device_authorization')
    expect(String(deviceAuthorization[1]?.body)).toContain('client_id=ae_client')
    const token = fetchMock.mock.calls[2]!
    expect(token[0]).toBe('https://market.example/oauth/token')
    expect(String(token[1]?.body)).toContain('device_code=device-code')
    expect(parseJson(outputText)).toMatchObject({
      kind: 'connected',
      credential: 'origin_bound_agent_key',
      credentialStored: true,
      apiKeyOrigin: 'https://market.example',
    })
    expect(outputText).not.toContain('ae-issued-secret')
  })

  it('hands a non-TTY JSON caller the safe approval details before polling completes', async () => {
    const output = captureStdout()
    const diagnostics = captureStderr()
    const browserOpen = vi.mocked(childProcess.spawn)
    browserOpen.mockImplementation(() => {
      throw new Error('browser opener should be suppressed')
    })
    let resolveToken: ((response: Response) => void) | undefined
    const deferredToken = new Promise<Response>((resolve) => {
      resolveToken = resolve
    })
    let stderrAtFirstPoll = ''
    let stdoutAtFirstPoll = ''
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ client_id: 'private-client-id' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        device_code: 'private-device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
        expires_in: 600,
        interval: 5,
      }))
      .mockImplementationOnce(async () => {
        stderrAtFirstPoll = diagnostics.read()
        stdoutAtFirstPoll = output.read()
        return await deferredToken
      })
      .mockResolvedValueOnce(Response.json(connectedAccount()))
    vi.stubGlobal('fetch', fetchMock)

    const connect = runConnectCommand([], options)
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
    const expectedHandoff = [
      'Approve: https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
      'User code: ABCD-EFGH',
      'Waiting for authorization…',
      '',
    ].join('\n')
    const stderrBeforeApproval = diagnostics.read()
    const stdoutBeforeApproval = output.read()

    resolveToken?.(Response.json({
      access_token: 'private-access-token',
      token_type: 'Bearer',
      scope: 'market_tools:call customer_requests:spending_policy',
    }))
    await connect

    try {
      expect(stderrAtFirstPoll).toBe(expectedHandoff)
      expect(stdoutAtFirstPoll).toBe('')
      expect(stderrBeforeApproval).toBe(expectedHandoff)
      expect(stdoutBeforeApproval).toBe('')

      const finalOutput = output.read()
      const result = JSON.parse(finalOutput) as Record<string, unknown>
      expect(finalOutput).toBe(`${JSON.stringify(result, undefined, 2)}\n`)
      expect(result).toMatchObject({
        kind: 'connected',
        credential: 'origin_bound_agent_key',
        credentialStored: true,
        apiKeyOrigin: 'https://market.example',
      })
      expect(diagnostics.read()).toBe(expectedHandoff)
      expect(browserOpen).not.toHaveBeenCalled()
      for (const forbidden of [
        'private-client-id',
        'private-device-code',
        'private-access-token',
        testConfigDirectory,
        'client_id=',
        'device_code=',
      ]) {
        expect(diagnostics.read()).not.toContain(forbidden)
      }
    } finally {
      output.restore()
      diagnostics.restore()
    }
  })

  it('keeps the immediate human approval and success output unchanged', async () => {
    const fetchMock = mockStandardOAuthConnect(connectedAccount())
    vi.stubGlobal('fetch', fetchMock)
    const { stdout, stderr } = await withStdoutStderr(() =>
      runConnectCommand([], { ...options, json: false }))
    expect(stdout).toContain('Connect AE')
    expect(stdout).toContain('verification  https://market.example/agent-access/authorize?user_code=ABCD-EFGH')
    expect(stdout).toContain('user code     ABCD-EFGH')
    expect(stdout).toContain('Approve the request, then this command will poll for the one-time credential.')
    expect(stdout).toContain('Your agent is connected.')
    expect(stdout).toContain('Next: ae search \'what you need\'\n')
    expect(stdout).not.toContain('Next: ae search \'what you need\'.')
    expect(stdout).toContain('ready_to_buy')
    expect(stdout).toContain('https://market.example/agent-access?caller=principal%3Abuyer')
    expect(stdout).not.toContain('ae-issued-secret')
    expect(stderr).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('prints the exact selected IPv6 origin in the human continuation', async () => {
    const selectedOrigin = 'http://[::1]:3210'
    const expectedCommand = "ae search 'what you need' --base-url 'http://[::1]:3210'"
    const output = captureStdout()
    const diagnostics = captureStderr()
    const restoreTTY = forceStdoutTTY(false)
    const browserOpen = vi.mocked(childProcess.spawn)
    browserOpen.mockImplementation(() => {
      throw new Error('non-TTY human guidance should not open a browser')
    })
    vi.stubGlobal('fetch', connectFlowFetch(connectedAccount(), 'https://auth.example/authorize?flow=connect'))

    try {
      await runConnectCommand([], {
        ...options,
        baseUrl: selectedOrigin,
        baseUrlSource: 'flag',
        json: false,
      })
      const stdoutText = output.read()
      expect(stdoutText).toContain('Next: ' + expectedCommand + '\n')
      expect(stdoutText).not.toContain('Next: ' + expectedCommand + '.')
      expect(browserOpen).not.toHaveBeenCalled()
    } finally {
      output.restore()
      diagnostics.restore()
      restoreTTY()
      vi.unstubAllGlobals()
      restoreBrowserOpenMock()
    }
  })

  it.each([
    ['valid HTTPS verification URI', 'https://auth.example/authorize?flow=connect'],
    ['valid loopback HTTP verification URI', 'http://127.0.0.1:4321/authorize'],
  ] as const)('accepts %s without imposing a same-origin rule', async (_label, uri) => {
    vi.stubGlobal('fetch', connectFlowFetch(connectedAccount(), uri))
    const outputText = await withStdout(() => runConnectCommand([], options))
    expect(parseJson(outputText)).toMatchObject({ kind: 'connected', verificationUri: uri })
  })

  it.each([
    ['missing verification_uri', undefined],
    ['malformed verification_uri', 'not-a-url'],
    ['relative verification_uri', '/authorize'],
    ['opaque HTTPS verification_uri', 'https:opaque'],
    ['empty-authority HTTPS verification_uri', 'https:///authorize'],
    ['non-web verification_uri', 'file:///tmp/authorize'],
  ] as const)('rejects %s before attempting to open a browser', async (_label, uri) => {
    const restoreTTY = forceStdoutTTY(true)
    const browserOpen = vi.mocked(childProcess.spawn)
    browserOpen.mockImplementation(() => {
      throw new Error('invalid verification URI must not open a browser')
    })
    vi.stubGlobal('fetch', connectFlowFetch(connectedAccount(), uri))
    try {
      await withAeDisableBrowserOpen(undefined, async () => {
        const outputText = await withStdout(async () => {
          await expect(runConnectCommand([], { ...options, json: false })).rejects.toMatchObject({
            kind: 'UNAVAILABLE',
            code: 'connect-response-invalid',
          } satisfies Partial<CliFailure>)
        })
        expect(outputText).toBe('')
      })
      expect(browserOpen).not.toHaveBeenCalled()
    } finally {
      restoreTTY()
      restoreBrowserOpenMock()
    }
  })

  it.each([
    ['JSON + TTY + browser enabled', true, true, undefined],
    ['human + non-TTY + browser enabled', false, false, undefined],
    ['human + TTY + browser disabled', false, true, '1'],
  ] as const)('suppresses validated browser opening for %s', async (_label, json, tty, disableOpen) => {
    const restoreTTY = forceStdoutTTY(tty)
    const browserOpen = vi.mocked(childProcess.spawn)
    browserOpen.mockImplementation(() => {
      throw new Error('browser opening should be suppressed')
    })
    vi.stubGlobal('fetch', connectFlowFetch(connectedAccount(), 'https://auth.example/authorize?flow=connect'))
    try {
      const stdoutText = await withStdout(async () => {
        await withAeDisableBrowserOpen(disableOpen, async () => {
          await runConnectCommand([], { ...options, json })
        })
      })
      expect(browserOpen).not.toHaveBeenCalled()
      if (json) expect(parseJson(stdoutText)).toMatchObject({ kind: 'connected' })
      else expect(stdoutText).toContain('Your agent is connected.')
    } finally {
      restoreTTY()
      vi.unstubAllGlobals()
      restoreBrowserOpenMock()
    }
  })

  it('waits for a newly issued Clerk key to reach the authentication edge', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(oauthRegisterResponse())
      .mockResolvedValueOnce(oauthDeviceResponse({ interval: 1 }))
      .mockResolvedValueOnce(oauthTokenSuccess('ae-issued-secret'))
      .mockResolvedValueOnce(Response.json({
        type: 'about:blank',
        title: 'Unauthenticated',
        status: 401,
        kind: 'UNAUTHENTICATED',
        code: 'authentication_required',
      }, { status: 401 }))
      .mockResolvedValueOnce(responseJson(connectedAccount()))
    vi.stubGlobal('fetch', fetchMock)
    const result = await stdoutJson(() => runConnectCommand([], options))
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(result).toMatchObject({ kind: 'connected', credentialStored: true })
  })

  it('replaces a rejected stored key through the device flow', async () => {
    storeConnection({ baseUrl: options.baseUrl, accessToken: 'stale-stored-key' })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        type: 'about:blank',
        title: 'Unauthenticated',
        status: 401,
        kind: 'UNAUTHENTICATED',
        code: 'authentication_required',
      }, { status: 401 }))
      .mockResolvedValueOnce(oauthRegisterResponse())
      .mockResolvedValueOnce(oauthDeviceResponse({ interval: 1 }))
      .mockResolvedValueOnce(oauthTokenSuccess('replacement-key'))
      .mockResolvedValueOnce(responseJson(connectedAccount()))
    vi.stubGlobal('fetch', fetchMock)
    const result = await stdoutJson(() => runConnectCommand([], options))
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(result).toMatchObject({ kind: 'connected', credentialStored: true })
  })

  it('refuses an existing key origin mismatch before connect validation fetch', async () => {
    process.env.AE_API_KEY = 'ae-existing-secret'
    process.env.AE_API_KEY_ORIGIN = 'https://attacker.example'
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    await expectCliFailure(
      () => runConnectCommand([], options),
      { kind: 'INVALID_ARGUMENT', code: 'agent_access_key_origin_mismatch' },
      fetchMock,
    )
  })

  it('validates an existing AE_API_KEY before reporting connected', async () => {
    setApiKey('ae-existing-secret')
    const fetchMock = stubFetchResolved(connectedAccount())
    const outputText = await withStdout(() => runConnectCommand([], options))
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://market.example/api/v1/account')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer ae-existing-secret')
    expect(parseJson(outputText)).toMatchObject({
      kind: 'connected',
      credential: 'origin_bound_agent_key',
      source: 'validated_environment',
      connectionState: 'ready_to_buy',
      principalRef: 'principal:buyer',
      accountRef: 'account:buyer',
      apiKeyOrigin: 'https://market.example',
    })
  })

  it.each([
    [false, "ae search 'what you need' --base-url 'http://[::1]:3210' --json"],
    [true, "ae supply tools '<businessRef>' --base-url 'http://[::1]:3210' --json"],
  ] as const)('emits a shell-safe origin-preserving %s continuation for an existing key', async (provider, expectedCommand) => {
    const selectedOrigin = 'http://[::1]:3210'
    setApiKey('ae-existing-secret', selectedOrigin)
    const account = provider ? { ...connectedAccount(), scopes: ['market_supply:manage'] } : connectedAccount()
    stubFetchResolved(account)
    const result = await stdoutJson(() => runConnectCommand([], {
      ...options,
      baseUrl: selectedOrigin,
      baseUrlSource: 'flag',
      provider,
    }))
    expect(result).toMatchObject({
      kind: 'connected',
      nextCommand: expectedCommand,
    })
    expect(result.nextAction).toBe('Run ' + expectedCommand + '.')
  })

  it('clears an expired approval and returns an origin-preserving restart command', async () => {
    const selectedOrigin = 'http://[::1]:3210'
    const output = captureStdout()
    const diagnostics = captureStderr()
    let tokenFetchReached: (() => void) | undefined
    const tokenFetch = new Promise<void>((resolveTokenFetch) => {
      tokenFetchReached = resolveTokenFetch
    })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ client_id: 'ae_client' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        device_code: 'device-code',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://auth.example/authorize?flow=connect',
        expires_in: 1,
        interval: 1,
      }))
      .mockImplementationOnce(async () => {
        tokenFetchReached?.()
        return Response.json({ error: 'authorization_pending' }, { status: 400 })
      })
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    vi.setSystemTime(0)

    try {
      const connect = runConnectCommand([], {
        ...options,
        baseUrl: selectedOrigin,
        baseUrlSource: 'flag',
        provider: true,
      })
      const expired = expect(connect).rejects.toMatchObject({
        code: 'expired_token',
        nextCommand: "ae connect --provider --base-url 'http://[::1]:3210' --json",
      })
      await tokenFetch
      await vi.advanceTimersByTimeAsync(1_000)
      await expired
    } finally {
      vi.useRealTimers()
      output.restore()
      diagnostics.restore()
      vi.unstubAllGlobals()
    }

    expect(output.read()).toBe('')
    expect(readdirSync(pendingConnectionsDir(testConfigDirectory))).toHaveLength(0)
  })

  it('connects, searches, selects one returned Tool, and obtains its first Quote in fresh processes', async () => {
    const toolRef = operationRef('7')
    const input = { query: 'what you need' }
    const serverAccount = {
      ...connectedAccount(),
      principalRef: 'principal:server-derived',
      accountRef: 'account:server-derived',
    }
    const searchResult = operationSearchResult('what you need', [
      operationDescriptor(toolRef, 'Server-derived lookup'),
    ])
    const quoteRef = commitmentRef('8')
    const quoteResult = operationInspection(toolRef, input, quoteRef)
    quoteResult.account.accountRef = serverAccount.accountRef
    quoteResult.budget.principalRef = serverAccount.principalRef
    const requests: Array<{
      method: string
      url: string
      authorization: string | null
      body: string
    }> = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        requests.push({
          method: request.method ?? '',
          url: request.url ?? '',
          authorization: request.headers.authorization ?? null,
          body,
        })
        const route = request.url ?? ''
        const sendJson = (value: unknown, status = 200) => {
          response.writeHead(status, { 'content-type': 'application/json' })
          response.end(JSON.stringify(value))
        }
        if (route === '/oauth/register') {
          sendJson({ client_id: 'server-client' }, 201)
          return
        }
        if (route === '/oauth/device_authorization') {
          sendJson({
            device_code: 'server-device-code',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://auth.example/authorize?flow=server',
            expires_in: 600,
            interval: 1,
          })
          return
        }
        if (route === '/oauth/token') {
          sendJson({
            access_token: 'server-issued-key',
            token_type: 'Bearer',
            scope: serverAccount.scopes.join(' '),
          })
          return
        }
        if (route === '/api/v1/account') {
          sendJson(serverAccount)
          return
        }
        if (route === '/api/v1/market-tools/search') {
          sendJson(searchResult)
          return
        }
        if (route === TOOL_QUOTE_PATH) {
          if (request.headers.authorization !== 'Bearer server-issued-key') {
            sendJson({ kind: 'unauthenticated' }, 401)
            return
          }
          sendJson(quoteResult)
          return
        }
        sendJson({ kind: 'not_found' }, 404)
      })
    })
    let listening = false

    await new Promise<void>((resolveListen, reject) => {
      server.once('error', reject)
      server.listen(0, '::1', () => {
        server.off('error', reject)
        resolveListen()
      })
    })
    listening = true

    try {
      const address = server.address()
      if (typeof address !== 'object' || address === null) throw new Error('fresh connect server did not expose an address')
      const selectedOrigin = `http://[::1]:${address.port}`
      writeFileSync(
        join(testConfigDirectory, 'ae'),
        '#!/bin/sh\nexec "$AE_TEST_NODE" "$AE_TEST_CLI" "$@"\n',
        { mode: 0o755 },
      )
      const childEnvironment: NodeJS.ProcessEnv = {
        ...process.env,
        AE_API_KEY: '',
        AE_API_KEY_ORIGIN: '',
        AE_CONFIG_DIR: testConfigDirectory,
        AE_DISABLE_BROWSER_OPEN: '1',
        AE_TEST_CLI: process.env.AE_TEST_INSTALLED_CLI ?? CLI_BUNDLE_PATH,
        AE_TEST_NODE: process.execPath,
        PATH: testConfigDirectory + delimiter + (process.env.PATH ?? ''),
      }
      const connectCommand = `ae connect --base-url '${selectedOrigin}' --environment sandbox --json`
      const connect = await runFreshShell(connectCommand, childEnvironment)
      expect(connect).toMatchObject({ exitCode: 0, signal: null })
      expect(connect.stderr).toContain('Approve: https://auth.example/authorize?flow=server')
      expect(connect.stdout).not.toContain('server-issued-key')
      const connected = JSON.parse(connect.stdout) as Record<string, unknown> & { nextCommand: string }
      expect(connected).toMatchObject({
        kind: 'connected',
        credentialStored: true,
        connectionState: 'ready_to_buy',
        principalRef: serverAccount.principalRef,
        accountRef: serverAccount.accountRef,
        scope: serverAccount.scopes.join(' '),
        apiKeyOrigin: selectedOrigin,
      })
      expect(connected.ownerConnectionHref).toBe(`${selectedOrigin}/agent-access?caller=${encodeURIComponent(serverAccount.principalRef)}`)
      expect(connected.nextCommand).toBe(`ae search 'what you need' --base-url '${selectedOrigin}' --json`)

      expect(readStoredConnection(selectedOrigin)).toMatchObject({
        accessToken: 'server-issued-key',
        tokenType: 'Bearer',
        profile: 'market',
        scope: serverAccount.scopes.join(' '),
      })

      const deviceRequest = requests.find(({ url }) => url === '/oauth/device_authorization')
      expect(deviceRequest).toBeDefined()
      const deviceParams = new URLSearchParams(deviceRequest?.body)
      expect(JSON.parse(deviceParams.get('authorization_details') ?? 'null')).toEqual([{
        type: 'agentic_economy_market_tools',
        environment: serverAccount.environment,
        tool_access: 'all_admitted',
        tool_refs: [],
        expires_in_seconds: 604800,
      }])

      const searchCommand = connected.nextCommand
      const search = await runFreshShell(searchCommand, childEnvironment)
      expect(search).toMatchObject({ exitCode: 0, signal: null, stderr: '' })
      const searched = JSON.parse(search.stdout) as { kind: string; query: string; results: Array<{ toolRef: string }> }
      expect(searched).toMatchObject({ kind: 'match', query: 'what you need' })
      expect(searched.results).toHaveLength(1)
      const selectedToolRef = searched.results[0]?.toolRef
      expect(selectedToolRef).toBe(toolRef)

      const quoteCommand = `ae quote ${selectedToolRef} --input '${JSON.stringify(input)}' --base-url '${selectedOrigin}' --json`
      const quote = await runFreshShell(quoteCommand, childEnvironment)
      expect(quote).toMatchObject({ exitCode: 0, signal: null, stderr: '' })
      const quoted = JSON.parse(quote.stdout) as Record<string, unknown>
      expect(quoted).toMatchObject({
        kind: 'committed',
        quoteRef,
        toolRef,
        account: { accountRef: serverAccount.accountRef },
        budget: { principalRef: serverAccount.principalRef },
      })

      const searchRequest = requests.find(({ url }) => url === '/api/v1/market-tools/search')
      expect(JSON.parse(searchRequest?.body ?? 'null')).toEqual({ query: 'what you need', limit: 8 })
      const quoteRequest = requests.find(({ url }) => url === TOOL_QUOTE_PATH)
      expect(quoteRequest).toMatchObject({
        method: 'POST',
        authorization: 'Bearer server-issued-key',
      })
      expect(JSON.parse(quoteRequest?.body ?? 'null')).toEqual({ toolRef, input })
      for (const command of [connectCommand, searchCommand, quoteCommand]) {
        expect(command).not.toContain(serverAccount.accountRef)
        expect(command).not.toContain(serverAccount.principalRef)
      }
      expect(requests.some(({ url }) => url === CALL_ROUTE_CONTRACT.call.path)).toBe(false)
      expect(requests.map(({ url }) => url)).toEqual([
        '/oauth/register',
        '/oauth/device_authorization',
        '/oauth/token',
        '/api/v1/account',
        '/api/v1/market-tools/search',
        TOOL_QUOTE_PATH,
      ])
    } finally {
      if (listening) {
        await new Promise<void>((resolveClose, reject) => {
          server.close((error) => error === undefined ? resolveClose() : reject(error))
        })
      }
    }
  })

  it('refuses a fake configured key instead of claiming connected', async () => {
    setApiKey('fake-key')
    stubFetchJsonResponse({
      type: 'about:blank',
      title: 'Unauthenticated',
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'authentication_required',
    }, 401, 'application/problem+json')
    await expectCliFailure(
      () => runConnectCommand([], options),
      { kind: 'UNAUTHENTICATED', code: 'api_key_invalid' },
    )
  })
})
