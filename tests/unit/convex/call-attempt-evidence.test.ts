/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import schema from '../../../convex/schema'
import { readCallAttemptEvidence } from '../../../convex/lib/capabilityExecution/callLifecycle/attemptEvidence'
const modules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}')).map(([path, load]) => [path.replace('../../../convex/', './'), load]))
const callRef = `operation-invocation:v1:${'a'.repeat(64)}`, hash = `sha256:${'b'.repeat(64)}`, sentinel = 'sk-SENTINEL-PRIVATE-ATTEMPT'
async function fixture() {
  const backend = convexTest(schema, modules), now = Date.UTC(2026, 8, 2), recordedAt = new Date(now).toISOString()
  const id = await backend.run(async ctx => await ctx.db.insert('capabilityCalls', {callRef, ownerId: 'account:one', principalId: 'principal:one', credentialId: 'credential:one', applicationRef: 'application:one', toolRef: 'tool:one',
    idempotencyKey: sentinel, environment: 'sandbox', grantRef: 'grant:one', grantGeneration: 1, policyDigest: hash, grantExpiresAt: now + 1000, inputDigest: hash, requestDigest: hash, state: 'completed', createdAt: now, updatedAt: now}))
  const read = () => backend.run(async ctx => { const call = await ctx.db.get(id); if (!call) throw new Error('missing_call'); return await readCallAttemptEvidence(ctx, call) })
  return {backend, recordedAt, read}
}
describe('bounded durable attempt evidence', () => {
  it('reuses attempt/history rows while excluding private payloads, keys, errors and lease owners', async () => {
    const f = await fixture(), attemptRef = `operation-attempt:${callRef}:1`
    await f.backend.run(async ctx => {
      await ctx.db.insert('actionExecutionAttempts', {executionRef: callRef, attemptRef, attemptNumber: 1, effectGeneration: 1, actor: {callerRef: sentinel, principalRef: 'principal:one'},
        idempotency: {operationKey: sentinel, materialInputDigest: hash, effectIdentity: sentinel}, lease: {owner: sentinel, expiresAt: f.recordedAt}, release: {state: 'released', observedAt: f.recordedAt}, outcome: {state: 'returned', businessOutcome: sentinel}, recordedAt: f.recordedAt})
      for (const [index,kind] of ['terminal_returned', 'late_observation', sentinel].entries()) await ctx.db.insert('actionExecutionHistory', {executionRef: callRef, commandId: sentinel, commandDigest: index === 0 ? hash : sentinel,
        commandResult: 'applied', executionVersion: index + 1, kind, current: true, sourceEvidenceRef: sentinel, recordedAt: f.recordedAt})
    })
    const evidence = await f.read()
    expect(evidence).toMatchObject({kind: 'available', attempts: [{outcome: 'returned', release: 'released'}], history: [{kind: 'terminal_returned'}, {kind: 'late_observation'}, {kind: 'other', commandDigest: null}]})
    expect(JSON.stringify(evidence)).not.toContain(sentinel)
  })
  it('fails closed on identity drift and an over-limit history without a partial success', async () => {
    const f = await fixture()
    expect(await f.read()).toEqual({kind: 'not_recorded'})
    await f.backend.run(async ctx => await ctx.db.insert('actionExecutionAttempts', {executionRef: callRef, attemptRef: `operation-attempt:${callRef}:1`, attemptNumber: 1, effectGeneration: 1,
      actor: {callerRef: 'caller:other', principalRef: 'principal:other'}, idempotency: {operationKey: 'key', materialInputDigest: hash, effectIdentity: 'effect'}, lease: {owner: 'owner', expiresAt: f.recordedAt},
      release: {state: 'not_released'}, outcome: {state: 'running'}, recordedAt: f.recordedAt}))
    expect(await f.read()).toEqual({kind: 'unavailable', code: 'attempt_evidence_identity_conflict'})
    await f.backend.run(async ctx => {
      for (const row of await ctx.db.query('actionExecutionAttempts').collect()) await ctx.db.delete(row._id)
      for (let index = 0; index < 201; index += 1) await ctx.db.insert('actionExecutionHistory', {executionRef: callRef, commandId: `command:${index}`, commandDigest: hash, commandResult: 'applied', executionVersion: index + 1, kind: 'begin_release', current: true, recordedAt: f.recordedAt})
    })
    expect(await f.read()).toEqual({kind: 'unavailable', code: 'attempt_evidence_window_too_large'})
  })
})
