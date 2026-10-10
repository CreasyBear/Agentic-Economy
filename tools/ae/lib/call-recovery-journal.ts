import { randomUUID } from 'node:crypto'
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as lockfile from 'proper-lockfile'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { JsonValue } from '@/modules/capability-contract/public'
import { continuationCommand } from './continuation-command'
import { configPath } from './config'
import { CliFailure } from './output'

const recoveryRefSchema = z.string().uuid()
const journalSchema = z.strictObject({
  version: z.literal(1),
  recoveryRef: recoveryRefSchema,
  origin: z.string().url(),
  requestDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  toolRef: z.string().min(1),
  accountRef: z.string().min(1),
  principalRef: z.string().min(1),
  // Freeze historical admission: an action-schema uprev cannot invalidate saved work.
  command: z.strictObject({ quoteRef: z.string().regex(/^operation-commitment:v1:[0-9a-f]{64}$/u), idempotencyKey: z.string().min(8).max(200) }),
  createdAt: z.number().int().nonnegative(),
  callRef: z.string().min(1).optional(),
  terminal: z.boolean(),
})

export type CallRecoveryRecord = z.infer<typeof journalSchema>
export type CallRecoveryRequest = Readonly<{
  origin: string
  toolRef: string
  /** The listing id or URL the caller named; the request is keyed on it so a rerun resumes before any Quote. */
  requestedRef?: string
  input: Record<string, unknown>
  idempotencyKey?: string
}>

function directory(): string { return join(dirname(configPath()), 'calls') }
function recordPath(ref: string): string { return join(directory(), `call-${ref}.json`) }
function requestDigest(request: CallRecoveryRequest): string {
  return canonicalDigest({ origin: new URL(request.origin).origin, toolRef: request.requestedRef ?? request.toolRef, input: request.input }).slice('sha256:'.length)
}
function requestIndex(request: CallRecoveryRequest): string { return join(directory(), `request-${requestDigest(request)}.json`) }
function identityIndex(request: CallRecoveryRequest): string | undefined {
  return request.idempotencyKey === undefined ? undefined : join(directory(), `identity-${canonicalDigest({ origin: new URL(request.origin).origin, identity: request.idempotencyKey })}.json`)
}

function storageFailure(): CliFailure {
  return new CliFailure('The local Call recovery journal could not be read or saved. No new Call was submitted.', {
    kind: 'FAILED_PRECONDITION', code: 'call-recovery-storage-unavailable',
    suggestion: 'Restore access to the AE configuration directory and preserve its calls folder before retrying.',
  })
}

function durableWrite(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const descriptor = openSync(temporary, 'wx', 0o600)
    try {
      writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8')
      fsyncSync(descriptor)
    } finally { closeSync(descriptor) }
    renameSync(temporary, path)
    const parent = openSync(dirname(path), 'r')
    try { fsyncSync(parent) } finally { closeSync(parent) }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

function lockFailure(lockPath: string): CliFailure {
  return new CliFailure(
    `The local Call recovery journal is locked by another process (lock ${lockPath}). No new Call was submitted.`,
    {
      kind: 'FAILED_PRECONDITION', code: 'call-recovery-storage-unavailable',
      suggestion: 'Wait for the other ae process to finish, or remove the lock directory if you are certain no process is using it.',
    },
  )
}

/**
 * Only journal mutations hold this lock; network requests never do.
 *
 * The calls directory holds every record, request-index, and identity-index
 * file for the journal, so the lock guards that whole directory rather than
 * any single file: proper-lockfile creates `${directory()}.lock` next to it
 * and reclaims it itself once it is older than `stale`, so a crashed owner's
 * lock is never left stuck.
 */
async function writeLocked<T>(write: () => T): Promise<T> {
  const root = directory()
  mkdirSync(root, { recursive: true, mode: 0o700 })
  chmodSync(root, 0o700)
  let release: () => Promise<void>
  try {
    // The async API retries the mkdir-based acquisition with backoff, so a
    // concurrent `ae call` process waits out the lock instead of racing it.
    // The lock-failure error is still thrown once retries are exhausted.
    release = await lockfile.lock(root, {
      stale: 30_000, realpath: false,
      retries: { retries: 20, minTimeout: 25, maxTimeout: 250, factor: 1.5 },
    })
  } catch {
    throw lockFailure(`${root}.lock`)
  }
  try { return write() } finally { await release() }
}

function readRecord(ref: string): CallRecoveryRecord {
  const valid = recoveryRefSchema.safeParse(ref)
  if (!valid.success) throw new CliFailure('Use the recovery reference returned by ae call.', { kind: 'INVALID_ARGUMENT', code: 'call-recovery-reference-invalid' })
  const record = journalSchema.parse(JSON.parse(readFileSync(recordPath(ref), 'utf8')))
  if (record.recoveryRef !== ref) throw new Error('call_recovery_record_identity_mismatch')
  return record
}

export function readCallRecovery(ref: string, origin: string): CallRecoveryRecord {
  try {
    const record = readRecord(ref)
    if (record.origin !== new URL(origin).origin) throw new CliFailure('This Call recovery reference belongs to a different server origin.', {
      kind: 'FAILED_PRECONDITION', code: 'call-recovery-origin-mismatch',
    })
    return record
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw storageFailure()
  }
}

function indexedRecord(path: string | undefined): CallRecoveryRecord | undefined {
  if (path === undefined || !existsSync(path)) return undefined
  return readRecord(recoveryRefSchema.parse(JSON.parse(readFileSync(path, 'utf8'))))
}

/** A saved explicit identity is permanent; an unresolved request blocks a new purchase. */
export function findCallRecovery(request: CallRecoveryRequest): CallRecoveryRecord | undefined {
  try {
    const explicit = indexedRecord(identityIndex(request))
    if (explicit !== undefined) {
      if (explicit.origin !== new URL(request.origin).origin) throw storageFailure()
      if (explicit.requestDigest !== requestDigest(request)) throw new CliFailure('This idempotency identity was already used with a different Tool or input.', {
        kind: 'FAILED_PRECONDITION', code: 'call-recovery-input-conflict',
      })
      return explicit
    }
    const previous = indexedRecord(requestIndex(request))
    if (previous !== undefined && (previous.origin !== new URL(request.origin).origin || previous.requestDigest !== requestDigest(request))) throw storageFailure()
    return previous?.terminal === false ? previous : undefined
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw storageFailure()
  }
}

export async function retainCallRecovery(
  request: CallRecoveryRequest,
  quote: Readonly<{ quoteRef: string; accountRef: string; principalRef: string }>,
  idempotencyKey: string,
): Promise<Readonly<{ record: CallRecoveryRecord; created: boolean }>> {
  try {
    return await writeLocked(() => {
      // Recheck after quoting: another CLI process may have won this request.
      const previous = findCallRecovery(request)
      if (previous !== undefined) return { record: previous, created: false }
      const record: CallRecoveryRecord = journalSchema.parse({
        version: 1, recoveryRef: randomUUID(), origin: new URL(request.origin).origin,
        requestDigest: requestDigest(request), toolRef: request.toolRef,
        accountRef: quote.accountRef, principalRef: quote.principalRef,
        command: { quoteRef: quote.quoteRef, idempotencyKey }, createdAt: Date.now(), terminal: false,
      })
      durableWrite(recordPath(record.recoveryRef), record)
      durableWrite(requestIndex(request), record.recoveryRef)
      const identity = identityIndex(request)
      if (identity !== undefined) durableWrite(identity, record.recoveryRef)
      return { record, created: true }
    })
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw storageFailure()
  }
}

export async function acknowledgeCallRecovery(record: CallRecoveryRecord, observation: Readonly<{ callRef?: string; terminal: boolean }>): Promise<CallRecoveryRecord> {
  try {
    return await writeLocked(() => {
      const current = readRecord(record.recoveryRef)
      if (current.callRef !== undefined && observation.callRef !== undefined && current.callRef !== observation.callRef) {
        throw new CliFailure('The gateway changed the identity of this purchase. Preserve the recovery reference and contact support.', {
          kind: 'UNAVAILABLE', code: 'call-recovery-identity-conflict',
        })
      }
      const updated = { ...current, ...(observation.callRef === undefined ? {} : { callRef: observation.callRef }), terminal: current.terminal || observation.terminal }
      durableWrite(recordPath(record.recoveryRef), updated)
      return updated
    })
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw new CliFailure('The Call was submitted, but its latest acknowledgement could not be saved. Resume using the retained recovery reference.', {
      kind: 'UNAVAILABLE', code: 'call-recovery-acknowledgement-unavailable', detail: { recoveryRef: record.recoveryRef },
    })
  }
}


// These local records preserve exact purchase commands. They add no execution
// queue or authority; existing HTTP/Call/Plan admission owns every effect.
const purchaseFields = {
  version: z.literal(2), recoveryRef: recoveryRefSchema, origin: z.string().url(),
  accountRef: z.string().min(1), principalRef: z.string().min(1),
  requestDigest: z.string().regex(/^[a-f0-9]{64}$/u), createdAt: z.number().int().nonnegative(), terminal: z.boolean(),
} as const
// Frozen persistence schemas deliberately do not trim or strengthen previously
// admitted material when a future public action schema changes.
const retainedPlanCommandSchema = z.strictObject({
  planRef: z.string().min(1).max(300), approvedTotalAudUnits: z.string().regex(/^(?:0|[1-9]\d{0,30})$/u),
  idempotencyKey: z.string().min(1).max(200),
})
const retainedJsonSchema: z.ZodType<JsonValue> = z.json()
const retainedProcureCommandSchema = z.strictObject({
  kind: z.literal('exact'), toolRef: z.string().min(1), input: z.record(z.string(), retainedJsonSchema),
  maxSpendAud: z.string().regex(/^\d+(?:\.\d{1,6})?$/u), idempotencyKey: z.string().min(1).max(200),
})
const purchaseJournalSchema = z.discriminatedUnion('intent', [
  z.strictObject({ ...purchaseFields, intent: z.literal('plan_run'), command: retainedPlanCommandSchema }),
  z.strictObject({ ...purchaseFields, intent: z.literal('procure_exact'), command: retainedProcureCommandSchema,
    quoteRef: z.string().min(1).optional(), callRef: z.string().min(1).optional() }),
])
export type PurchaseRecoveryRecord = z.infer<typeof purchaseJournalSchema>
export type PlanRecoveryRecord = Extract<PurchaseRecoveryRecord, { intent: 'plan_run' }>
export type ProcureRecoveryRecord = Extract<PurchaseRecoveryRecord, { intent: 'procure_exact' }>
export type PurchaseRecoveryRequest = Pick<PurchaseRecoveryRecord, 'intent' | 'command' | 'origin' | 'accountRef' | 'principalRef'>

function purchaseDigest(request: PurchaseRecoveryRequest): string {
  const { idempotencyKey: _key, ...material } = request.command
  return canonicalDigest({ version: 2, intent: request.intent, origin: new URL(request.origin).origin,
    accountRef: request.accountRef, principalRef: request.principalRef, material }).slice('sha256:'.length)
}
function purchaseRequestIndex(request: PurchaseRecoveryRequest): string {
  const { idempotencyKey: _key, ...material } = request.command
  // A changed local Agent profile must not hide unresolved purchase material.
  const digest = canonicalDigest({ version: 2, intent: request.intent, origin: new URL(request.origin).origin, material }).slice('sha256:'.length)
  return join(directory(), `request-${digest}.json`)
}
function purchaseIdentityIndex(request: PurchaseRecoveryRequest): string {
  return join(directory(), `identity-${canonicalDigest({ version: 2, intent: request.intent, origin: new URL(request.origin).origin,
    identity: request.command.idempotencyKey })}.json`)
}
function purchaseStorageFailure(): CliFailure {
  return new CliFailure('The local purchase recovery journal could not be read or saved. No new purchase was submitted.', {
    kind: 'FAILED_PRECONDITION', code: 'purchase-recovery-storage-unavailable',
    suggestion: 'Restore access to the AE configuration directory and preserve its calls folder before retrying.',
  })
}
function readPurchaseRecord(ref: string): PurchaseRecoveryRecord {
  const valid = recoveryRefSchema.safeParse(ref)
  if (!valid.success) throw new CliFailure('Use the recovery reference returned by the purchase command.', { kind: 'INVALID_ARGUMENT', code: 'purchase-recovery-reference-invalid' })
  const record = purchaseJournalSchema.parse(JSON.parse(readFileSync(recordPath(ref), 'utf8')))
  if (record.recoveryRef !== ref || record.requestDigest !== purchaseDigest(record)) throw purchaseStorageFailure()
  return record
}
export function readPurchaseRecovery(ref: string, origin: string, intent: PurchaseRecoveryRecord['intent']): PurchaseRecoveryRecord {
  try {
    const record = readPurchaseRecord(ref)
    if (record.origin !== new URL(origin).origin) throw new CliFailure('This purchase recovery reference belongs to a different server origin.', {
      kind: 'FAILED_PRECONDITION', code: 'purchase-recovery-origin-mismatch',
    })
    if (record.intent !== intent) throw new CliFailure('Use the resume command for the original purchase type.', {
      kind: 'INVALID_ARGUMENT', code: 'purchase-recovery-intent-mismatch',
    })
    return record
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw purchaseStorageFailure()
  }
}
function indexedPurchase(path: string): PurchaseRecoveryRecord | undefined {
  return existsSync(path) ? readPurchaseRecord(recoveryRefSchema.parse(JSON.parse(readFileSync(path, 'utf8')))) : undefined
}
function requireIndexedPurchaseOwner(record: PurchaseRecoveryRecord, request: PurchaseRecoveryRequest, output?: Readonly<{ json: boolean }>): void {
  if (record.origin !== new URL(request.origin).origin || record.intent !== request.intent) throw purchaseStorageFailure()
  if (record.accountRef !== request.accountRef || record.principalRef !== request.principalRef) {
    throw new CliFailure('This retained purchase belongs to a different Account or Agent. Reconnect the original Agent before continuing.', {
      kind: 'PERMISSION_DENIED', code: 'purchase-recovery-owner-mismatch',
      detail: { recoveryRef: record.recoveryRef, identityPreserved: true },
      nextCommand: continuationCommand(['ae', record.intent === 'plan_run' ? 'plan' : 'procure', 'resume', record.recoveryRef,
        '--base-url', record.origin, ...(output?.json ? ['--json'] : [])]),
    })
  }
}
export function findPurchaseRecovery(request: PurchaseRecoveryRequest, output?: Readonly<{ json: boolean }>): PurchaseRecoveryRecord | undefined {
  try {
    const explicit = indexedPurchase(purchaseIdentityIndex(request))
    if (explicit !== undefined) {
      requireIndexedPurchaseOwner(explicit, request, output)
      if (explicit.requestDigest !== purchaseDigest(request)) throw new CliFailure('This purchase key was already used with different material.', {
        kind: 'FAILED_PRECONDITION', code: 'purchase-recovery-input-conflict',
      })
      return explicit
    }
    const previous = indexedPurchase(purchaseRequestIndex(request))
    if (previous !== undefined && !previous.terminal) requireIndexedPurchaseOwner(previous, request, output)
    if (previous !== undefined && !previous.terminal && previous.requestDigest !== purchaseDigest(request)) throw purchaseStorageFailure()
    return previous?.terminal === false ? previous : undefined
  } catch (error) {
    if (error instanceof CliFailure) throw error
    throw purchaseStorageFailure()
  }
}
export async function retainPurchaseRecovery(request: PurchaseRecoveryRequest, output?: Readonly<{ json: boolean }>): Promise<Readonly<{ record: PurchaseRecoveryRecord; created: boolean }>> {
  try {
    return await writeLocked(() => {
      const previous = findPurchaseRecovery(request, output)
      if (previous !== undefined) return { record: previous, created: false }
      const record = purchaseJournalSchema.parse({ ...request, origin: new URL(request.origin).origin,
        version: 2, recoveryRef: randomUUID(), requestDigest: purchaseDigest(request), createdAt: Date.now(), terminal: false })
      durableWrite(recordPath(record.recoveryRef), record)
      durableWrite(purchaseRequestIndex(request), record.recoveryRef)
      durableWrite(purchaseIdentityIndex(request), record.recoveryRef)
      return { record, created: true }
    })
  } catch (error) {
    if (error instanceof CliFailure && error.code !== 'call-recovery-storage-unavailable') throw error
    throw purchaseStorageFailure()
  }
}
export async function acknowledgePurchaseRecovery(record: PurchaseRecoveryRecord,
  observation: Readonly<{ terminal: boolean; quoteRef?: string; callRef?: string }>,
): Promise<PurchaseRecoveryRecord> {
  try {
    return await writeLocked(() => {
      const current = readPurchaseRecord(record.recoveryRef)
      if (current.intent !== record.intent) throw purchaseStorageFailure()
      if (current.intent === 'procure_exact') {
        for (const field of ['quoteRef', 'callRef'] as const) {
          if (current[field] !== undefined && observation[field] !== undefined && current[field] !== observation[field]) {
            throw new CliFailure('The gateway changed this purchase identity. Preserve the recovery reference and contact support.', {
              kind: 'UNAVAILABLE', code: 'purchase-recovery-identity-conflict',
            })
          }
        }
      }
      const updated = purchaseJournalSchema.parse({ ...current,
        ...(current.intent === 'procure_exact' ? {
          ...(observation.quoteRef === undefined ? {} : { quoteRef: observation.quoteRef }),
          ...(observation.callRef === undefined ? {} : { callRef: observation.callRef }),
        } : {}), terminal: current.terminal || observation.terminal })
      durableWrite(recordPath(record.recoveryRef), updated)
      return updated
    })
  } catch (error) {
    if (error instanceof CliFailure && error.code === 'purchase-recovery-identity-conflict') throw error
    throw new CliFailure('The purchase was submitted, but its latest acknowledgement could not be saved. Resume using the retained recovery reference.', {
      kind: 'UNAVAILABLE', code: 'purchase-recovery-acknowledgement-unavailable', detail: { recoveryRef: record.recoveryRef },
    })
  }
}
