import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnCli } from './cli-errors-harness'

const plan = { nodes: [{ id: 'first', toolRef: `operation:v1:${'a'.repeat(64)}`, input: { name: 'Perth' }, dependsOn: [] }] }
const quote = {
  kind: 'quoted', planRef: 'plan:v1:cli', planDigest: 'digest', nodes: [{
    nodeId: 'first', toolRef: plan.nodes[0]!.toolRef, inputMode: 'literal', priceClass: 'fixed',
    pricingDigest: 'price', ceilingAudUnits: '1000001', validation: 'typed', dependsOn: [],
  }], stages: [['first']], approvedTotalAudUnits: '1000001', currency: 'AUD', exponent: 6,
  expiresAt: 2_000_000_000_000, dataFlows: [],
}
let directory: string
let origin: string
let close: () => Promise<void>
let responses: unknown[]
let requests: { path: string | undefined; body: unknown; authorization: string | undefined }[]
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ae-plan-cli-'))
  requests = []
  responses = [quote]
  const server = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += String(chunk)
    requests.push({ path: request.url, body: raw === '' ? undefined : JSON.parse(raw), authorization: request.headers.authorization })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(responses.length > 1 ? responses.shift() : responses[0]))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('address_invalid')
  origin = `http://127.0.0.1:${address.port}`
  close = () => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)))
})
afterEach(async () => { await close(); rmSync(directory, { recursive: true, force: true }) })
function run(file: string) {
  return spawnCli(['plan', 'quote', file, '--json', '--base-url', origin], {
    env: { ...process.env, AE_API_KEY: 'test-key', AE_API_KEY_ORIGIN: origin, AE_CONFIG_DIR: directory },
  })
}
describe('ae plan quote', () => {
  it('reads the Plan file, submits only a quote and preserves exact server evidence', async () => {
    const file = join(directory, 'plan.json')
    writeFileSync(file, JSON.stringify(plan))
    const result = await run(file)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(quote)
    expect(requests).toEqual([{ path: '/api/v1/tools/plans/quote', body: { plan }, authorization: 'Bearer test-key' }])
  })
  it.each(['{}', '{invalid', JSON.stringify({ nodes: [] }), ' '.repeat(262_145)])('refuses invalid input before making any request', async (content) => {
    const file = join(directory, 'plan.json')
    writeFileSync(file, content)
    const result = await run(file)
    expect(result.status).toBe(1)
    expect(requests).toEqual([])
  })
})

const progress = {
  kind: 'available', planRef: 'plan:v1:cli', planDigest: 'digest', state: 'running', approvedTotalAudUnits: '1000001',
  currency: 'AUD', exponent: 6, expiresAt: 2_000_000_000_000, runDeadlineAt: 2_000_000_100_000, maximumConcurrentNodes: 1,
  stages: [['first']], nodes: [], dataFlows: [], hold: { status: 'reserved', settledAudUnits: '0', releasedAudUnits: '0', heldAudUnits: '1000001' },
}
function command(args: readonly string[]) {
  return spawnCli(['plan', ...args, '--json', '--base-url', origin], {
    env: { ...process.env, AE_API_KEY: 'test-key', AE_API_KEY_ORIGIN: origin, AE_CONFIG_DIR: directory },
  })
}
describe('ae plan lifecycle', () => {
  it('requires an explicit retry key and exact micro-units, and posts the unchanged command', async () => {
    responses = [{ kind: 'running', planRef: progress.planRef, state: 'running' }]
    expect((await command(['run', progress.planRef, '1000001'])).status).toBe(1)
    expect((await command(['run', progress.planRef, '1.000001', '--idempotency-key', 'retry-one'])).status).toBe(1)
    expect(requests).toHaveLength(0)
    const result = await command(['run', progress.planRef, '1000001', '--idempotency-key', 'retry-one'])
    expect(result.status, result.stderr).toBe(0)
    expect(requests).toEqual([{ path: '/api/v1/tools/plans/run', authorization: 'Bearer test-key',
      body: { planRef: progress.planRef, approvedTotalAudUnits: '1000001', idempotencyKey: 'retry-one' } }])
  })
  it('watches the same Plan using reads only until a terminal result', async () => {
    responses = [progress, { ...progress, state: 'succeeded', hold: { status: 'released', settledAudUnits: '1000001', releasedAudUnits: '0' } }]
    const result = await command(['watch', progress.planRef])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ state: 'succeeded', planRef: progress.planRef })
    expect(requests.map(request => [request.path, request.body])).toEqual([
      ['/api/v1/tools/plans/plan%3Av1%3Acli', undefined], ['/api/v1/tools/plans/plan%3Av1%3Acli', undefined],
    ])
  })
  it.each(['awaiting_approval', 'reconciliation_required'])('stops watching when %s needs attention', async state => {
    responses = [{ ...progress, state }]
    const result = await command(['watch', progress.planRef])
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).state).toBe(state)
    expect(requests).toHaveLength(1)
  })
  it('refuses a readback for another Plan', async () => {
    responses = [{ ...progress, planRef: 'plan:other' }]
    const result = await command(['get', progress.planRef])
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('plan-status-invalid')
  })
  it('cancels the same Plan without submitting a run or a new identity', async () => {
    responses = [{ kind: 'replayed', planRef: progress.planRef, state: 'cancelled' }]
    const result = await command(['cancel', progress.planRef])
    expect(result.status, result.stderr).toBe(0)
    expect(requests).toEqual([{ path: '/api/v1/tools/plans/cancel', authorization: 'Bearer test-key', body: { planRef: progress.planRef } }])
  })
})
