import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as lockfile from 'proper-lockfile'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  acknowledgePurchaseRecovery, findPurchaseRecovery, readPurchaseRecovery, retainPurchaseRecovery,
  acknowledgeCallRecovery,
  findCallRecovery,
  readCallRecovery,
  retainCallRecovery,
  type CallRecoveryRequest,
} from '../../../tools/ae/lib/call-recovery-journal'
import { CliFailure } from '../../../tools/ae/lib/output'

const origin = 'https://market.example'
const quote = { quoteRef: `operation-commitment:v1:${'b'.repeat(64)}`, accountRef: 'account:test', principalRef: 'principal:test' }

let configDirectory: string

function callsDirectory(): string { return join(configDirectory, 'calls') }
function lockPath(): string { return `${callsDirectory()}.lock` }
function recordFiles(): string[] { return readdirSync(callsDirectory()).filter((name) => name.startsWith('call-')) }
function request(overrides: Partial<CallRecoveryRequest> = {}): CallRecoveryRequest {
  return { origin, toolRef: 'operation:v1:test', input: { value: 1 }, ...overrides }
}

beforeEach(() => {
  configDirectory = mkdtempSync(join(tmpdir(), 'ae-call-recovery-journal-'))
  vi.stubEnv('AE_CONFIG_DIR', configDirectory)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(configDirectory, { recursive: true, force: true })
})

describe('durable write and read back', () => {
  it('persists a retained Call and reads it back by recovery reference', async () => {
    const { record, created } = await retainCallRecovery(request(), quote, 'idempotency-key-1')
    expect(created).toBe(true)
    const reread = readCallRecovery(record.recoveryRef, origin)
    expect(reread).toEqual(record)
    expect(recordFiles()).toHaveLength(1)
    // durableWrite must never leave its temporary file behind
    expect(readdirSync(callsDirectory()).some((name) => name.endsWith('.tmp'))).toBe(false)
  })
})

describe('findCallRecovery', () => {
  it('finds an unresolved request by requestDigest when no idempotency key was supplied', async () => {
    const { record } = await retainCallRecovery(request(), quote, 'idempotency-key-2')
    const found = findCallRecovery(request())
    expect(found).toEqual(record)
  })

  it('finds a saved record by explicit idempotency identity even after it becomes terminal', async () => {
    const withKey = request({ idempotencyKey: 'stable-key' })
    const { record } = await retainCallRecovery(withKey, quote, 'idempotency-key-3')
    await acknowledgeCallRecovery(record, { callRef: 'call:one', terminal: true })
    const found = findCallRecovery(withKey)
    expect(found?.recoveryRef).toBe(record.recoveryRef)
    expect(found?.terminal).toBe(true)
  })

  it('returns undefined once a digest-only request has resolved to a terminal state', async () => {
    const { record } = await retainCallRecovery(request(), quote, 'idempotency-key-4')
    await acknowledgeCallRecovery(record, { callRef: 'call:one', terminal: true })
    expect(findCallRecovery(request())).toBeUndefined()
  })
})

describe('acknowledgeCallRecovery', () => {
  it('moves the record to a callRef and terminal state and persists it', async () => {
    const { record } = await retainCallRecovery(request(), quote, 'idempotency-key-5')
    expect(record.callRef).toBeUndefined()
    expect(record.terminal).toBe(false)
    const updated = await acknowledgeCallRecovery(record, { callRef: 'call:two', terminal: true })
    expect(updated.callRef).toBe('call:two')
    expect(updated.terminal).toBe(true)
    const reread = readCallRecovery(record.recoveryRef, origin)
    expect(reread.callRef).toBe('call:two')
    expect(reread.terminal).toBe(true)
  })
})

describe('corrupt journal storage', () => {
  it('fails closed on a corrupt record while leaving other records intact', async () => {
    const { record: corrupted } = await retainCallRecovery(request(), quote, 'idempotency-key-6')
    const { record: healthy } = await retainCallRecovery(request({ toolRef: 'operation:v1:other' }), quote, 'idempotency-key-7')
    writeFileSync(join(callsDirectory(), `call-${corrupted.recoveryRef}.json`), '{corrupted', 'utf8')

    expect(() => readCallRecovery(corrupted.recoveryRef, origin)).toThrow(CliFailure)
    try {
      readCallRecovery(corrupted.recoveryRef, origin)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(CliFailure)
      expect((error as CliFailure).code).toBe('call-recovery-storage-unavailable')
    }

    const stillHealthy = readCallRecovery(healthy.recoveryRef, origin)
    expect(stillHealthy).toEqual(healthy)
  })
})

describe('write lock recovery', () => {
  it('reclaims a stale lock directory older than 30s and lets the write succeed', async () => {
    mkdirSync(lockPath(), { recursive: true, mode: 0o700 })
    const staleMtime = new Date(Date.now() - 31_000)
    utimesSync(lockPath(), staleMtime, staleMtime)
    const { record, created } = await retainCallRecovery(request(), quote, 'idempotency-key-8')
    expect(created).toBe(true)
    expect(readCallRecovery(record.recoveryRef, origin)).toEqual(record)
  })

  it('respects a fresh lock held by another lockSync call and fails closed after retries without writing', async () => {
    mkdirSync(callsDirectory(), { recursive: true, mode: 0o700 })
    const release = lockfile.lockSync(callsDirectory(), { realpath: false })
    try {
      try {
        await retainCallRecovery(request(), quote, 'idempotency-key-11')
        expect.unreachable()
      } catch (error) {
        expect(error).toBeInstanceOf(CliFailure)
        const failure = error as CliFailure
        expect(failure.code).toBe('call-recovery-storage-unavailable')
        expect(failure.message).toContain(lockPath())
      }
      expect(recordFiles()).toHaveLength(0)
    } finally {
      release()
    }
  }, 10_000)
})

describe('versioned purchase journal in the existing store', () => {
  it('keeps historical Call bytes, hashes, indexes and reader unchanged alongside v2 Plan work', async () => {
    const { record } = await retainCallRecovery(request({ idempotencyKey: 'old-call-key' }), quote, 'old-call-key')
    const path = join(callsDirectory(), `call-${record.recoveryRef}.json`)
    const before = readFileSync(path, 'utf8')
    const { record: plan } = await retainPurchaseRecovery({ intent: 'plan_run', origin, accountRef: quote.accountRef, principalRef: quote.principalRef,
      command: { planRef: 'plan:test', approvedTotalAudUnits: '1000001', idempotencyKey: 'run:one' } })
    expect(plan.version).toBe(2)
    expect(plan.command.idempotencyKey).toBe('run:one')
    expect(readCallRecovery(record.recoveryRef, origin)).toEqual(record)
    expect(findCallRecovery(request({ idempotencyKey: 'old-call-key' }))?.recoveryRef).toBe(record.recoveryRef)
    expect(readFileSync(path, 'utf8')).toBe(before)
  })
  it('keeps action namespaces separate while binding the exact same-key material permanently', async () => {
    const planRequest = { intent: 'plan_run' as const, origin, accountRef: quote.accountRef, principalRef: quote.principalRef,
      command: { planRef: 'plan:test', approvedTotalAudUnits: '1', idempotencyKey: 'shared-key-0001' } }
    const procureRequest = { intent: 'procure_exact' as const, origin, accountRef: quote.accountRef, principalRef: quote.principalRef,
      command: { kind: 'exact' as const, toolRef: 'operation:test', input: { nested: { array: [true, null, 1] } }, maxSpendAud: '0.50', idempotencyKey: 'shared-key-0001' } }
    const { record: plan } = await retainPurchaseRecovery(planRequest)
    const { record: procure } = await retainPurchaseRecovery(procureRequest)
    expect(plan.recoveryRef).not.toBe(procure.recoveryRef)
    await acknowledgePurchaseRecovery(plan, { terminal: true })
    expect(findPurchaseRecovery(planRequest)?.recoveryRef).toBe(plan.recoveryRef)
    expect(() => findPurchaseRecovery({ ...planRequest, command: { ...planRequest.command, approvedTotalAudUnits: '2' } })).toThrow(CliFailure)
    expect(findPurchaseRecovery({ ...procureRequest, command: { ...procureRequest.command, idempotencyKey: 'new-purchase-key' } })?.recoveryRef).toBe(procure.recoveryRef)
  })
  it('rejects conflicting Quote/Call observations and preserves original command and monotonic terminal evidence', async () => {
    const { record } = await retainPurchaseRecovery({ intent: 'procure_exact', origin, accountRef: quote.accountRef, principalRef: quote.principalRef,
      command: { kind: 'exact', toolRef: 'operation:test', input: { private: 'original' }, maxSpendAud: '0.50', idempotencyKey: 'purchase-key' } })
    const known = await acknowledgePurchaseRecovery(record, { quoteRef: 'quote:first', callRef: 'call:first', terminal: true })
    await expect(acknowledgePurchaseRecovery(known, { quoteRef: 'quote:other', terminal: false })).rejects.toMatchObject({ code: 'purchase-recovery-identity-conflict' })
    await expect(acknowledgePurchaseRecovery(known, { callRef: 'call:other', terminal: false })).rejects.toMatchObject({ code: 'purchase-recovery-identity-conflict' })
    const reread = await acknowledgePurchaseRecovery(known, { terminal: false })
    expect(reread.terminal).toBe(true)
    expect(reread.command).toEqual(record.command)
  })
  it('rejects material tampering, future versions, origin changes and wrong resume intent', async () => {
    const { record } = await retainPurchaseRecovery({ intent: 'plan_run', origin, accountRef: quote.accountRef, principalRef: quote.principalRef,
      command: { planRef: 'plan:test', approvedTotalAudUnits: '1', idempotencyKey: 'plan-key' } })
    expect(() => readPurchaseRecovery(record.recoveryRef, 'https://other.example', 'plan_run')).toThrow(CliFailure)
    expect(() => readPurchaseRecovery(record.recoveryRef, origin, 'procure_exact')).toThrow(CliFailure)
    writeFileSync(join(callsDirectory(), `call-${record.recoveryRef}.json`), JSON.stringify({ ...record, command: { ...record.command, approvedTotalAudUnits: '2' } }))
    expect(() => readPurchaseRecovery(record.recoveryRef, origin, 'plan_run')).toThrow(CliFailure)
    writeFileSync(join(callsDirectory(), `call-${record.recoveryRef}.json`), JSON.stringify({ ...record, version: 3 }))
    expect(() => readPurchaseRecovery(record.recoveryRef, origin, 'plan_run')).toThrow(CliFailure)
  })
})
