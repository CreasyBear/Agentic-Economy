import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnCli } from './cli-errors-harness'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const exact = { kind: 'exact', toolRef, input: { privateValue: 'RETAINED_EXACT_INPUT' }, maxSpendAud: '0.50', idempotencyKey: 'purchase-key-0001' }
const planRef = 'plan:v1:retained'
const progress = { kind: 'available', planRef, planDigest: 'digest', state: 'quoted', approvedTotalAudUnits: '1000001',
  currency: 'AUD', exponent: 6, expiresAt: 2_000_000_000_000, runDeadlineAt: 2_000_000_100_000, maximumConcurrentNodes: 1,
  stages: [], nodes: [], dataFlows: [], hold: { status: 'none', settledAudUnits: '0', releasedAudUnits: '0' } }
let directory: string
let origin: string
let close: () => Promise<void>
let purchases: { path: string; body: Record<string, unknown> }[]
let statuses: number
let account: string
let principal: string
let onPurchase: (path: string, body: Record<string, unknown>, response: ServerResponse) => void
let planStatus: Record<string, unknown>
let callStatus: Record<string, unknown>
function json(response: ServerResponse, value: unknown) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
async function body(request: IncomingMessage): Promise<Record<string, unknown>> { let raw = ''; for await (const chunk of request) raw += String(chunk); return JSON.parse(raw) }
function files(): string[] { return readdirSync(join(directory, 'calls')).filter(name => name.startsWith('call-')) }
function stored(ref: string) { return JSON.parse(readFileSync(join(directory, 'calls', `call-${ref}.json`), 'utf8')) }
function run(args: string[], credential = 'AUTH_CREDENTIAL_MUST_NOT_BE_STORED', baseUrl = origin) {
  return spawnCli([...args, '--base-url', baseUrl, '--json'], { env: { ...process.env, AE_CONFIG_DIR: directory, AE_API_KEY: credential, AE_API_KEY_ORIGIN: baseUrl } })
}
function procure(input = exact) { return run(['procure', '--input', JSON.stringify(input)]) }
function plan(key = 'plan-key-0001', total = '1000001') { return run(['plan', 'run', planRef, total, '--idempotency-key', key]) }
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ae-purchase-recovery-'))
  purchases = []; statuses = 0; account = 'account:test'; principal = 'principal:test'; planStatus = { ...progress }
  callStatus = { kind: 'found', callRef: 'call:original', toolRef, version: 1, state: 'reconciliation_required' }
  onPurchase = (path, request, response) => json(response, path.endsWith('/plans/run')
    ? { kind: 'running', planRef, state: 'running' }
    : { schemaVersion: 'tool.procure:v1', kind: 'pending', status: 'pending', idempotencyKey: request.idempotencyKey, quoteRef: 'quote:original', callRef: 'call:original' })
  const server = createServer(async (request, response) => {
    if (request.url === '/api/v1/account') return json(response, { kind: 'authenticated', accountRef: account, principalRef: principal,
      credentialId: 'credential:NEVER_RETAIN', applicationRef: 'application:test', environment: 'sandbox', scopes: ['market_tools:call'], authorityMode: 'spending_policy' })
    if (request.url === '/api/v1/tools/plans/run' || request.url === '/api/v1/tools/procure') {
      const parsed = await body(request)
      purchases.push({ path: request.url, body: parsed })
      return onPurchase(request.url, parsed, response)
    }
    if (request.url === `/api/v1/tools/plans/${encodeURIComponent(planRef)}`) { statuses++; return json(response, planStatus) }
    if (request.url === '/api/v1/calls/call%3Aoriginal') { statuses++; return json(response, callStatus) }
    response.writeHead(404); response.end()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture_address_invalid')
  origin = `http://127.0.0.1:${address.port}`
  close = () => new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
})
afterEach(async () => { await close(); rmSync(directory, { recursive: true, force: true }) })

describe('durable Plan run recovery', () => {
  it('retains exact micro-units and key before response loss; reads quoted Plan before same-command replay', async () => {
    onPurchase = (_path, request, response) => { expect(stored(files()[0]!.slice(5, -5)).command).toEqual(request); response.destroy() }
    const first = await plan()
    const failure = JSON.parse(first.stdout)
    expect(failure.code).toBe('purchase-transport-unknown')
    const ref = failure.refs.recoveryRef
    expect(failure.nextCommand).toBe(`ae plan resume ${ref} --base-url ${origin} --json`)
    onPurchase = (_path, _request, response) => json(response, { kind: 'running', planRef, state: 'running' })
    const resumed = await run(['plan', 'resume', ref], 'ROTATED_CREDENTIAL')
    expect(resumed.status, resumed.stdout + resumed.stderr).toBe(0)
    expect(statuses).toBe(1)
    expect(purchases).toHaveLength(2)
    expect(purchases[1]!.body).toEqual(purchases[0]!.body)
  })
  it('observes accepted, refused or missing Plan status without another run', async () => {
    const first = await plan()
    const ref = JSON.parse(first.stdout).recoveryRef
    for (const status of [{ ...progress, state: 'awaiting_approval' }, { kind: 'refused', code: 'plan_not_found' }]) {
      planStatus = status
      const resumed = await run(['plan', 'resume', ref])
      expect(resumed.status, resumed.stdout + resumed.stderr).toBe(0)
      expect(JSON.parse(resumed.stdout)).toMatchObject({ ...status, recoveryRef: ref })
    }
    expect(purchases).toHaveLength(1)
  })
  it('blocks fresh Plan repetition after the local Agent profile changes', async () => {
    const first = await plan()
    const ref = JSON.parse(first.stdout).recoveryRef
    principal = 'principal:other'
    for (const key of ['plan-key-0001', 'another-plan-key']) {
      const repeated = await plan(key)
      expect(JSON.parse(repeated.stdout)).toMatchObject({ code: 'purchase-recovery-owner-mismatch', refs: { recoveryRef: ref, identityPreserved: true } })
    }
    expect(purchases).toHaveLength(1)
    expect(statuses).toBe(0)
  })
  it('blocks changed key/material and checks Account, principal and origin before replay', async () => {
    const first = await plan()
    const ref = JSON.parse(first.stdout).recoveryRef
    expect(JSON.parse((await plan('new-plan-key')).stdout).code).toBe('purchase-recovery-required')
    expect(JSON.parse((await plan('plan-key-0001', '1000002')).stdout).code).toBe('purchase-recovery-input-conflict')
    account = 'account:other'
    expect(JSON.parse((await run(['plan', 'resume', ref])).stdout).code).toBe('purchase-recovery-owner-mismatch')
    account = 'account:test'; principal = 'principal:other'
    expect(JSON.parse((await run(['plan', 'resume', ref])).stdout).code).toBe('purchase-recovery-owner-mismatch')
    expect(JSON.parse((await run(['plan', 'resume', ref], 'OTHER_KEY', 'http://127.0.0.1:1')).stdout).code).toBe('purchase-recovery-origin-mismatch')
    expect(statuses).toBe(0)
    expect(purchases).toHaveLength(1)
  })
})

describe('durable exact procurement recovery', () => {
  it('retains complete exact input before response loss and resumes the same body without original stdin', async () => {
    onPurchase = (_path, request, response) => { expect(stored(files()[0]!.slice(5, -5)).command).toEqual(request); response.destroy() }
    const first = await procure()
    const ref = JSON.parse(first.stdout).refs.recoveryRef
    onPurchase = (_path, request, response) => json(response, { schemaVersion: 'tool.procure:v1', kind: 'pending', status: 'pending',
      idempotencyKey: request.idempotencyKey, quoteRef: 'quote:original', callRef: 'call:original' })
    const resumed = await run(['procure', 'resume', ref], 'ROTATED_CREDENTIAL')
    expect(resumed.status, resumed.stdout + resumed.stderr).toBe(0)
    expect(purchases).toHaveLength(2)
    expect(purchases[1]!.body).toEqual(exact)
    const saved = readdirSync(join(directory, 'calls')).map(name => readFileSync(join(directory, 'calls', name), 'utf8')).join('')
    expect(saved).toContain('RETAINED_EXACT_INPUT')
    expect(saved).not.toMatch(/AUTH_CREDENTIAL_MUST_NOT_BE_STORED|ROTATED_CREDENTIAL|NEVER_RETAIN|Authorization/u)
    expect(statSync(join(directory, 'calls')).mode & 0o777).toBe(0o700)
    for (const name of readdirSync(join(directory, 'calls'))) expect(statSync(join(directory, 'calls', name)).mode & 0o777).toBe(0o600)
  })
  it('observes a known Call only, and never treats reconciliation or denial as terminal', async () => {
    const first = await procure()
    const ref = JSON.parse(first.stdout).recoveryRef
    const resumed = await run(['procure', 'resume', ref])
    expect(resumed.status, resumed.stdout + resumed.stderr).toBe(0)
    expect(JSON.parse(resumed.stdout)).toMatchObject({ kind: 'found', state: 'reconciliation_required', recoveryRef: ref })
    expect(stored(ref).terminal).toBe(false)
    callStatus = { kind: 'refused', callRef: 'call:original', code: 'call_not_found', retryable: false }
    await run(['procure', 'resume', ref])
    expect(stored(ref).terminal).toBe(false)
    expect(purchases).toHaveLength(1)
  })
  it('keeps delivered work open until the original Call confirms financial resolution', async () => {
    onPurchase = (_path, request, response) => json(response, { schemaVersion: 'tool.procure:v1', kind: 'delivered', status: 'delivered',
      idempotencyKey: request.idempotencyKey, quoteRef: 'quote:original', callRef: 'call:original', toolRef,
      input: exact.input, output: { answer: 42 }, money: { kind: 'recorded', price: { currency: 'AUD', units: '100', exponent: 6 },
        usage: { usageRef: 'usage:test', observedAt: 100, chargeState: 'outcome_unknown', priceDigest: 'sha256:price', amount: { currency: 'AUD', units: '100', exponent: 6 } } },
      audit: { routingLatencyMs: 0, executionLatencyMs: 1, totalLatencyMs: 1, jevDecisionsCostAud: 'unknown' } })
    const first = await procure()
    expect(first.status, first.stdout + first.stderr).toBe(0)
    const ref = JSON.parse(first.stdout).recoveryRef
    expect(stored(ref).terminal).toBe(false)
    expect(JSON.parse((await procure({ ...exact, idempotencyKey: 'new-purchase-key' })).stdout).code).toBe('purchase-recovery-required')
    await run(['procure', 'resume', ref])
    expect(stored(ref).terminal).toBe(false)
    callStatus = { kind: 'found', callRef: 'call:original', toolRef, version: 2, state: 'cancelled' }
    await run(['procure', 'resume', ref])
    expect(stored(ref).terminal).toBe(true)
    expect(purchases).toHaveLength(1)
  })
  it('retains plain refusal and RFC budget failure as unresolved even when retryable=false', async () => {
    onPurchase = (_path, request, response) => json(response, { schemaVersion: 'tool.procure:v1', kind: 'refused', status: 'refused',
      idempotencyKey: request.idempotencyKey, quoteRef: 'quote:original', code: 'budget_exceeded', retryable: false, detail: 'Original Call must be checked.' })
    const first = await procure()
    const ref = JSON.parse(first.stdout).recoveryRef
    expect(stored(ref).terminal).toBe(false)
    expect(JSON.parse((await procure({ ...exact, idempotencyKey: 'new-purchase-key' })).stdout).code).toBe('purchase-recovery-required')
    onPurchase = (_path, _request, response) => { response.writeHead(429, { 'content-type': 'application/problem+json' }); response.end(JSON.stringify({ type: 'about:blank', title: 'Budget', status: 429, kind: 'RESOURCE_EXHAUSTED', code: 'budget_exceeded', detail: 'Budget not conclusive', retryable: false })) }
    const resumed = await run(['procure', 'resume', ref])
    expect(JSON.parse(resumed.stdout)).toMatchObject({ code: 'budget_exceeded', refs: { recoveryRef: ref, identityPreserved: true } })
    expect(stored(ref).terminal).toBe(false)
  })
  it('rejects changed Tool/input/ceiling on the same key before sending another purchase', async () => {
    await procure()
    for (const changed of [{ ...exact, maxSpendAud: '0.51' }, { ...exact, input: { privateValue: 'different' } }, { ...exact, toolRef: `operation:v1:${'b'.repeat(64)}` }]) {
      expect(JSON.parse((await procure(changed)).stdout).code).toBe('purchase-recovery-input-conflict')
    }
    expect(purchases).toHaveLength(1)
  })
  it('rejects intent drift, corrupt/future records and changed Call identity without fallback submission', async () => {
    const first = await procure()
    const ref = JSON.parse(first.stdout).recoveryRef
    expect(JSON.parse((await run(['plan', 'resume', ref])).stdout).code).toBe('purchase-recovery-intent-mismatch')
    callStatus = { ...callStatus, callRef: 'call:other' }
    expect(JSON.parse((await run(['procure', 'resume', ref])).stdout).code).toBe('purchase-recovery-identity-conflict')
    writeFileSync(join(directory, 'calls', `call-${ref}.json`), JSON.stringify({ ...stored(ref), version: 3 }))
    expect(JSON.parse((await run(['procure', 'resume', ref])).stdout).code).toBe('purchase-recovery-storage-unavailable')
    expect(purchases).toHaveLength(1)
  })
  it('blocks fresh repetition after a local Account or Agent profile change before any purchase', async () => {
    const first = await procure()
    const ref = JSON.parse(first.stdout).recoveryRef
    for (const changed of [{ account: 'account:other', principal: 'principal:test' }, { account: 'account:test', principal: 'principal:other' }]) {
      account = changed.account; principal = changed.principal
      for (const request of [exact, { ...exact, idempotencyKey: 'another-purchase-key' }]) {
        const repeated = await procure(request)
        expect(JSON.parse(repeated.stdout)).toMatchObject({ code: 'purchase-recovery-owner-mismatch', refs: { recoveryRef: ref, identityPreserved: true },
          nextCommand: `ae procure resume ${ref} --base-url ${origin} --json` })
      }
    }
    expect(purchases).toHaveLength(1)
    expect(statuses).toBe(0)
  })
  it('enforces 64KiB serialized procurement limit and storage failure before purchase', async () => {
    expect(JSON.parse((await procure({ ...exact, input: { privateValue: 'x'.repeat(65536) } })).stdout).code).toBe('payload_too_large')
    writeFileSync(join(directory, 'calls'), 'not a directory')
    expect(JSON.parse((await procure()).stdout).code).toBe('purchase-recovery-storage-unavailable')
    expect(purchases).toHaveLength(0)
  })
  it('retains one purchase identity across concurrent attempts and refuses caller fields on resume', async () => {
    const [left, right] = await Promise.all([procure(), procure()])
    // An overlapping process may replay the same command before acknowledgement,
    // or observe the Call afterwards. HTTP submissions are not purchase effects.
    expect([[0, 0], [0, 1]]).toContainEqual([left.status, right.status].sort())
    expect([1, 2]).toContain(purchases.length)
    for (const request of purchases) expect(request).toEqual({ path: '/api/v1/tools/procure', body: exact })
    expect(files()).toHaveLength(1)
    const accepted = left.status === 0 ? left : right
    const ref = JSON.parse(accepted.stdout).recoveryRef
    expect(stored(ref)).toMatchObject({ command: exact, quoteRef: 'quote:original', callRef: 'call:original' })
    for (const result of [left, right]) {
      if (result.status === 0) expect(JSON.parse(result.stdout)).toMatchObject({ recoveryRef: ref, callRef: 'call:original' })
      else expect(JSON.parse(result.stdout)).toMatchObject({
        code: 'purchase-recovery-required', refs: { recoveryRef: ref, identityPreserved: true },
      })
    }
    const submitted = purchases.length
    const invalid = await run(['procure', 'resume', ref, '--input', JSON.stringify(exact)])
    expect(invalid.status).toBe(1)
    expect(purchases).toHaveLength(submitted)
  })
})
