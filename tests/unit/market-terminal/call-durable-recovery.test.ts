import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnCli } from './cli-errors-harness'

const toolRef = `operation:v1:${'8'.repeat(64)}`
const quoteRef = `operation-commitment:v1:${'9'.repeat(64)}`
const callRef = 'call:durable-test'
const input = { privateValue: 'RAW_INPUT_MUST_NOT_BE_STORED', order: 1 }
const completed = {
  kind: 'completed', callRef, toolRef, output: { value: 42 }, evidenceHash: 'sha256:test',
  usage: { usageRef: 'usage:test', observedAt: 100, chargeState: 'free_tier', priceDigest: 'sha256:price', amount: { currency: 'AUD', units: '0', exponent: 2 } },
}

let configDirectory: string
let origin: string
let closeServer: () => Promise<void>
let onCall: (response: ServerResponse) => void
let calls: Array<{ quoteRef: string; idempotencyKey: string }>
let quotes: number
let statuses: number
let principal: string
let account: string

function json(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function body(request: IncomingMessage): Promise<unknown> {
  let data = ''
  for await (const chunk of request) data += String(chunk)
  return JSON.parse(data)
}

function run(args: string[], apiKey = 'CREDENTIAL_MUST_NOT_BE_STORED', serverOrigin = origin) {
  return spawnCli([...args, '--base-url', serverOrigin, '--json'], { env: {
    ...process.env, AE_CONFIG_DIR: configDirectory, AE_API_KEY: apiKey, AE_API_KEY_ORIGIN: serverOrigin,
  } })
}
function startCall(extra: string[] = []) { return run(['call', toolRef, '--input', JSON.stringify(input), ...extra]) }
function files(): string[] { return readdirSync(join(configDirectory, 'calls')).filter((name) => name.endsWith('.json')) }

beforeEach(async () => {
  configDirectory = mkdtempSync(join(tmpdir(), 'ae-durable-call-'))
  quotes = 0; statuses = 0; calls = []; principal = 'principal:test'; account = 'account:test'
  onCall = (response) => json(response, completed)
  const server = createServer(async (request, response) => {
    if (request.url === '/api/v1/account') {
      return json(response, { kind: 'authenticated', principalRef: principal, accountRef: account,
        credentialId: `credential:${request.headers.authorization}`, applicationRef: 'application:test', environment: 'sandbox',
        scopes: ['market_tools:call'], authorityMode: 'spending_policy',
      })
    }
    if (request.url === '/api/v1/tools/quote') {
      quotes += 1
      await body(request)
      return json(response, {
        kind: 'committed', quoteRef, toolRef, toolVersion: 1, expiresAt: Date.now() + 60_000, normalizedInput: input,
        price: { currency: 'AUD', units: '0', exponent: 2 }, account: { accountRef: account, available: { currency: 'AUD', units: '10000', exponent: 2 } },
        budget: { principalRef: principal, maximumPerCall: { currency: 'AUD', units: '1000', exponent: 2 } },
        policyRefs: ['commercial-policy:sandbox'], evidenceDigest: 'sha256:test',
        continuation: { action: 'tool.call', method: 'POST', path: '/api/v1/tools/call', input: { quoteRef, idempotencyKey: 'replace-at-call' } },
      })
    }
    if (request.url === '/api/v1/tools/call') {
      calls.push(await body(request) as { quoteRef: string; idempotencyKey: string })
      return onCall(response)
    }
    if (request.url === `/api/v1/calls/${encodeURIComponent(callRef)}`) {
      statuses += 1
      return json(response, { kind: 'found', callRef, toolRef, version: 1, state: 'terminal', evidenceHash: 'sha256:test', result: completed })
    }
    response.writeHead(404); response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('test_server_address_invalid')
  origin = `http://127.0.0.1:${address.port}`
  closeServer = () => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)))
})

afterEach(async () => {
  await closeServer()
  rmSync(configDirectory, { recursive: true, force: true })
})

describe('durable CLI Call recovery across processes', () => {
  it('retains the exact command before a lost acknowledgement and resumes without re-quoting or storing input/credentials', async () => {
    onCall = (response) => {
      const recordName = files().find((name) => name.startsWith('call-'))!
      const stored = JSON.parse(readFileSync(join(configDirectory, 'calls', recordName), 'utf8'))
      expect(stored.command).toEqual(calls[0])
      response.destroy()
    }
    const first = await startCall()
    expect(first.status).toBe(1)
    const failure = JSON.parse(first.stdout)
    expect(failure.code).toBe('call-transport-unknown')
    const recoveryRef = failure.detail.recoveryRef
    expect(failure.nextCommand).toBe(`ae call resume ${recoveryRef} --base-url ${origin} --json`)
    const repeated = await run(['call', toolRef, '--input', JSON.stringify({ order: input.order, privateValue: input.privateValue })])
    expect(JSON.parse(repeated.stdout)).toMatchObject({ code: 'call-recovery-required', detail: { recoveryRef } })
    expect(quotes).toBe(1)
    expect(calls).toHaveLength(1)

    onCall = (response) => json(response, completed)
    const resumed = await run(['call', 'resume', recoveryRef], 'ROTATED_CREDENTIAL')
    expect(resumed.status, resumed.stdout + resumed.stderr).toBe(0)
    expect(JSON.parse(resumed.stdout)).toMatchObject({ kind: 'completed', callRef, recoveryRef })
    expect(quotes).toBe(1)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
    const persisted = files().map((name) => readFileSync(join(configDirectory, 'calls', name), 'utf8')).join('')
    expect(persisted).not.toMatch(/RAW_INPUT_MUST_NOT_BE_STORED|CREDENTIAL_MUST_NOT_BE_STORED|ROTATED_CREDENTIAL|normalizedInput/u)
    expect(statSync(join(configDirectory, 'calls')).mode & 0o777).toBe(0o700)
    for (const name of files()) expect(statSync(join(configDirectory, 'calls', name)).mode & 0o777).toBe(0o600)
  }, 30_000)

  it('reads the acknowledged Call after restart and never reposts it', async () => {
    onCall = (response) => json(response, { kind: 'pending', callRef, toolRef, retryAfterMs: 100 })
    const first = await startCall()
    expect(first.status).toBe(0)
    const { recoveryRef } = JSON.parse(first.stdout)
    const resumed = await run(['call', 'resume', recoveryRef])
    expect(resumed.status, resumed.stdout + resumed.stderr).toBe(0)
    expect(JSON.parse(resumed.stdout)).toMatchObject({ kind: 'completed', callRef })
    expect(statuses).toBe(1)
    expect(quotes).toBe(1)
    expect(calls).toHaveLength(1)
  }, 30_000)

  it('rejects origin, Account and Agent changes before any replay while allowing credential rotation', async () => {
    onCall = (response) => response.destroy()
    const first = await startCall()
    const { recoveryRef } = JSON.parse(first.stdout).detail
    const otherOrigin = await run(['call', 'resume', recoveryRef], 'OTHER_ORIGIN_KEY', 'http://127.0.0.1:1')
    expect(JSON.parse(otherOrigin.stdout).code).toBe('call-recovery-origin-mismatch')
    account = 'account:other'
    const otherAccount = await run(['call', 'resume', recoveryRef])
    expect(JSON.parse(otherAccount.stdout).code).toBe('call-recovery-owner-mismatch')
    account = 'account:test'; principal = 'principal:other'
    const otherAgent = await run(['call', 'resume', recoveryRef])
    expect(JSON.parse(otherAgent.stdout).code).toBe('call-recovery-owner-mismatch')
    expect(calls).toHaveLength(1)
  }, 30_000)

  it('preserves an uncertain purchase after a malformed acknowledgement and fails closed on corrupt storage', async () => {
    onCall = (response) => json(response, { invalid: true })
    const first = await startCall()
    const failure = JSON.parse(first.stdout)
    expect(failure.code).toBe('call-result-invalid')
    expect(failure.nextCommand).toContain(`call resume ${failure.detail.recoveryRef}`)
    writeFileSync(join(configDirectory, 'calls', `call-${failure.detail.recoveryRef}.json`), '{corrupted', 'utf8')
    const repeat = await startCall()
    expect(JSON.parse(repeat.stdout).code).toBe('call-recovery-storage-unavailable')
    expect(quotes).toBe(1)
    expect(calls).toHaveLength(1)
  }, 30_000)

  it('binds an explicit idempotency key to its original Tool/input even after completion', async () => {
    const first = await startCall(['--idempotency-key', 'stable-test-key'])
    expect(first.status).toBe(0)
    const second = await run(['call', toolRef, '--input', '{"different":true}', '--idempotency-key', 'stable-test-key'])
    expect(JSON.parse(second.stdout).code).toBe('call-recovery-input-conflict')
    expect(quotes).toBe(1)
    expect(calls).toHaveLength(1)
  }, 30_000)

  it('does not submit when durable storage is unavailable', async () => {
    writeFileSync(join(configDirectory, 'calls'), 'not-a-directory', 'utf8')
    const first = await startCall()
    expect(JSON.parse(first.stdout).code).toBe('call-recovery-storage-unavailable')
    expect(calls).toHaveLength(0)
  }, 30_000)

  it('does not obtain a new Quote when an uncertain replay encounters an expired Quote', async () => {
    onCall = (response) => response.destroy()
    const first = await startCall()
    const { recoveryRef } = JSON.parse(first.stdout).detail
    onCall = (response) => {
      response.writeHead(410, { 'content-type': 'application/problem+json' })
      response.end(JSON.stringify({ type: 'about:blank', title: 'Quote expired', status: 410, kind: 'FAILED_PRECONDITION', code: 'quote_expired' }))
    }
    const resumed = await run(['call', 'resume', recoveryRef])
    expect(resumed.status).toBe(1)
    expect(JSON.parse(resumed.stdout)).toMatchObject({ code: 'quote_expired', detail: { recoveryRef, identityPreserved: true } })
    const repeated = await startCall()
    expect(JSON.parse(repeated.stdout).code).toBe('call-recovery-required')
    expect(quotes).toBe(1)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(calls[0])
  }, 30_000)

  it('blocks competing fresh processes from submitting duplicate unresolved requests', async () => {
    onCall = (response) => json(response, { kind: 'pending', callRef, toolRef, retryAfterMs: 100 })
    const [left, right] = await Promise.all([startCall(), startCall()])
    expect([left.status, right.status].sort()).toEqual([0, 1])
    const failed = left.status === 1 ? left : right
    expect(['call-recovery-required', 'call-recovery-storage-unavailable']).toContain(JSON.parse(failed.stdout).code)
    expect(calls).toHaveLength(1)
  }, 30_000)
})
