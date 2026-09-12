import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as lockfile from 'proper-lockfile'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
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
