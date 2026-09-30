import { open, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  createFormanceContext, executeFormanceMoneyCommand, validateFormanceMoneyCommand,
  type FormanceConfiguration, type FormanceMoneyCommand,
} from '../../src/modules/money/formance'
import {
  readFormanceRestoreSnapshot, type FormanceRestoreSnapshot,
} from '../../src/modules/money/formance-restore'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u)
const identifier = z.string().regex(/^(?:0|[1-9]\d{0,15})$/u)
const count = z.number().int().min(0).max(100_000)
const summarySchema = z.strictObject({
  ledger: z.string().regex(/^[a-z][a-z0-9-]{2,62}$/u),
  counts: z.strictObject({ transactions: count, accounts: count, schemas: count.max(1_000) }),
  digests: z.strictObject({ ledger: digest, transactions: digest, accounts: digest, schemas: digest }),
})
const baselineSchema = z.strictObject({
  version: z.literal('ae.formance-restore-baseline:v1'),
  sourceGateway: z.string(),
  restoreTime: z.iso.datetime(),
  summary: summarySchema,
  commandDigest: digest,
  transactionId: identifier,
  commandRef: z.string().max(100),
})
const commandSchema = z.strictObject({
  commandRef: z.string().max(100),
  idempotencyKey: z.string().max(64),
  schemaVersion: z.string().max(100),
  template: z.string().max(100),
  variables: z.record(z.string().max(64), z.string().max(500)),
  metadata: z.record(z.string().max(100), z.string().max(64)),
})

export type FormanceRestoreBaseline = z.infer<typeof baselineSchema>
type RestoreCategory = 'ledger' | 'transactions' | 'accounts' | 'schemas'

export class FormanceRestoreError extends Error {
  readonly code: string
  readonly mismatches: readonly RestoreCategory[]
  constructor(code: string, mismatches: readonly RestoreCategory[] = []) {
    super(code)
    this.name = 'FormanceRestoreError'
    this.code = code
    this.mismatches = mismatches
  }
}

/** Original command comes from the durable command record, never inferred from postings. */
export function parseFormanceRestoreCommand(input: unknown): FormanceMoneyCommand {
  const parsed = commandSchema.safeParse(input)
  if (!parsed.success) throw new FormanceRestoreError('formance_restore_command_invalid')
  // The maintained validator checks the schema-specific template set as well as
  // references, all variables and immutable command/idempotency metadata.
  const command = parsed.data as FormanceMoneyCommand
  if (validateFormanceMoneyCommand(command) !== undefined) {
    throw new FormanceRestoreError('formance_restore_command_invalid')
  }
  return command
}

/**
 * Requires: writers quiesced and drained externally; retained original command.
 * Ensures: complete matching reads surround a recorded cutoff and bind that
 * command to one existing unreverted transaction. It only observes stability;
 * no flag or pair of reads is represented as proof that writers were stopped.
 * On violation: no baseline is emitted. This function never writes to a ledger.
 */
export async function captureFormanceRestoreBaseline(
  configuration: FormanceConfiguration,
  originalCommand: FormanceMoneyCommand,
): Promise<FormanceRestoreBaseline> {
  const sourceGateway = loopbackGateway(configuration.gatewayUrl)
  const command = parseFormanceRestoreCommand(originalCommand)
  const before = await snapshot(configuration)
  const restoreTime = new Date().toISOString()
  const after = await snapshot(configuration)
  assertSameSummary(before.summary, after.summary, 'formance_restore_source_changed')
  const transactionId = originalTransaction(after, command)
  return {
    version: 'ae.formance-restore-baseline:v1', sourceGateway, restoreTime,
    summary: after.summary, commandDigest: canonicalDigest(command),
    transactionId, commandRef: command.commandRef,
  }
}

/**
 * Requires: isolated restored database, matching saved baseline and original command.
 * Ensures: application replay AND two native retries return the original fact;
 * all accounts, schemas and transactions remain identical to the saved baseline.
 * Invariant: only the existing command is submitted, with its original native
 * idempotency key and schema. No force, fresh probe, 409-as-success or source write.
 * On violation: fail the proof; leave the isolated target available for diagnosis.
 */
export async function verifyFormanceRestore(
  configuration: FormanceConfiguration,
  baselineInput: FormanceRestoreBaseline,
  originalCommand: FormanceMoneyCommand,
) {
  const parsed = baselineSchema.safeParse(baselineInput)
  if (!parsed.success) throw new FormanceRestoreError('formance_restore_baseline_invalid')
  const baseline = parsed.data
  const targetGateway = loopbackGateway(configuration.gatewayUrl)
  if (targetGateway === loopbackGateway(baseline.sourceGateway)) {
    throw new FormanceRestoreError('formance_restore_source_target_same')
  }
  if (configuration.ledger !== baseline.summary.ledger) {
    throw new FormanceRestoreError('formance_restore_ledger_mismatch')
  }
  const command = parseFormanceRestoreCommand(originalCommand)
  if (canonicalDigest(command) !== baseline.commandDigest || command.commandRef !== baseline.commandRef) {
    throw new FormanceRestoreError('formance_restore_original_command_mismatch')
  }
  const before = await snapshot(configuration)
  assertSameSummary(baseline.summary, before.summary)
  if (originalTransaction(before, command) !== baseline.transactionId) {
    throw new FormanceRestoreError('formance_restore_original_transaction_mismatch')
  }
  const stable = await snapshot(configuration)
  assertSameSummary(baseline.summary, stable.summary)

  const context = createFormanceContext(configuration, { signal: AbortSignal.timeout(30_000) })
  const application = await executeFormanceMoneyCommand(context, command)
  if (application.kind !== 'completed' || application.replayed !== true) {
    throw new FormanceRestoreError('formance_restore_application_replay_failed')
  }
  // The application adapter intentionally pre-reads an existing reference. Its
  // replay alone cannot establish restoration of native idempotency-key state.
  try {
    const replies = await Promise.allSettled([0, 1].map(async () =>
      await context.sdk.ledger.v2.createTransaction({
        ledger: configuration.ledger, idempotencyKey: command.idempotencyKey,
        schemaVersion: command.schemaVersion,
        v2PostTransaction: {
          reference: command.commandRef, metadata: command.metadata, runtime: 'machine',
          script: { template: command.template, vars: command.variables },
        },
      }, { retries: { strategy: 'none' }, timeoutMs: 5_000 }),
    ))
    if (replies.some(reply => {
      if (reply.status !== 'fulfilled') return true
      const transaction = reply.value.v2CreateTransactionResponse?.data
      return transaction === undefined || String(transaction.id) !== baseline.transactionId
        || transaction.reference !== baseline.commandRef
    })) throw new FormanceRestoreError('formance_restore_native_replay_failed')
  } catch {
    // SDK errors can contain raw response bodies. Retain only this category.
    throw new FormanceRestoreError('formance_restore_native_replay_failed')
  }
  const after = await snapshot(configuration)
  assertSameSummary(baseline.summary, after.summary)
  const final = await snapshot(configuration)
  assertSameSummary(baseline.summary, final.summary)
  return {
    verification: 'PASS' as const, evidenceClass: 'formance-ledger-restore' as const,
    transactionId: baseline.transactionId, summary: final.summary,
    restoreTime: baseline.restoreTime,
  }
}

async function snapshot(configuration: FormanceConfiguration): Promise<FormanceRestoreSnapshot> {
  const result = await readFormanceRestoreSnapshot(configuration)
  if (result.kind !== 'available') throw new FormanceRestoreError(result.code)
  return result.snapshot
}

function assertSameSummary(
  expected: FormanceRestoreSnapshot['summary'],
  actual: FormanceRestoreSnapshot['summary'],
  code = 'formance_restore_state_mismatch',
): void {
  const categories = ['ledger', 'transactions', 'accounts', 'schemas'] as const
  const mismatches = categories.filter(category =>
    expected.digests[category] !== actual.digests[category]
      || (category === 'ledger' ? expected.ledger !== actual.ledger
        : expected.counts[category] !== actual.counts[category]),
  )
  if (mismatches.length > 0) throw new FormanceRestoreError(code, mismatches)
}

function originalTransaction(snapshot: FormanceRestoreSnapshot, command: FormanceMoneyCommand): string {
  const matches = snapshot.transactions.filter(row => row.reference === command.commandRef)
  const transaction = matches[0]
  const metadata = transaction?.metadata
  if (matches.length !== 1 || transaction === undefined || transaction.reverted !== false
    || transaction.template !== command.template || !record(metadata)
    || !Object.entries(command.metadata).every(([key, value]) => metadata[key] === value)
    || (transaction.schemaVersion !== undefined && transaction.schemaVersion !== command.schemaVersion)
    || (typeof transaction.id !== 'number' && typeof transaction.id !== 'string')
    || !identifier.safeParse(String(transaction.id)).success) {
    throw new FormanceRestoreError('formance_restore_original_transaction_missing_or_conflicting')
  }
  return String(transaction.id)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loopbackGateway(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new FormanceRestoreError('formance_restore_gateway_invalid') }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new FormanceRestoreError('formance_restore_gateway_invalid')
  }
  // Normalize aliases so localhost and 127.0.0.1 cannot bypass the source fence.
  url.hostname = '127.0.0.1'
  return url.origin
}

async function boundedJsonFile(path: string, maximumBytes: number): Promise<unknown> {
  const handle = await open(path, 'r')
  try {
    const bytes = Buffer.alloc(maximumBytes + 1)
    let length = 0
    for (;;) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length)
      length += bytesRead
      if (length > maximumBytes) throw new FormanceRestoreError('formance_restore_file_too_large')
      if (bytesRead === 0) break
    }
    try { return JSON.parse(bytes.subarray(0, length).toString('utf8')) as unknown }
    catch { throw new FormanceRestoreError('formance_restore_file_invalid') }
  } finally { await handle.close() }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const [mode, ...args] = argv
  const flags: Record<string, string> = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (key === undefined || value === undefined || Object.hasOwn(flags, key)
      || !['--gateway', '--ledger', '--baseline', '--command-file', '--restore-time'].includes(key)) {
      throw new FormanceRestoreError('formance_restore_arguments_invalid')
    }
    flags[key] = value
  }
  if ((mode !== 'capture' && mode !== 'verify') || flags['--gateway'] === undefined
    || flags['--baseline'] === undefined || flags['--command-file'] === undefined) {
    throw new FormanceRestoreError('formance_restore_arguments_invalid')
  }
  const command = parseFormanceRestoreCommand(await boundedJsonFile(flags['--command-file'], 32_768))
  const baseline = mode === 'verify'
    ? baselineSchema.parse(await boundedJsonFile(flags['--baseline'], 16_384)) : undefined
  const ledger = baseline?.summary.ledger ?? flags['--ledger']
  if (ledger === undefined || !/^[a-z][a-z0-9-]{2,62}$/u.test(ledger)) {
    throw new FormanceRestoreError('formance_restore_ledger_invalid')
  }
  const configuration: FormanceConfiguration = {
    environment: 'sandbox', gatewayUrl: loopbackGateway(flags['--gateway']), ledger, requestTimeoutMs: 5_000,
  }
  if (mode === 'capture') {
    if (flags['--restore-time'] !== undefined) throw new FormanceRestoreError('formance_restore_arguments_invalid')
    const result = await captureFormanceRestoreBaseline(configuration, command)
    // Never overwrite an accepted baseline. Financial identities stay private.
    await writeFile(flags['--baseline'], `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    process.stdout.write(`${JSON.stringify({ baseline: 'CAPTURED', restoreTime: result.restoreTime, summary: result.summary })}\n`)
  } else {
    if (baseline === undefined || flags['--restore-time'] !== baseline.restoreTime
      || flags['--ledger'] !== undefined) throw new FormanceRestoreError('formance_restore_backup_boundary_mismatch')
    process.stdout.write(`${JSON.stringify(await verifyFormanceRestore(configuration, baseline, command))}\n`)
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const failure = error instanceof FormanceRestoreError ? error
      : new FormanceRestoreError('formance_restore_failed')
    process.stderr.write(`${JSON.stringify({ verification: 'FAIL', code: failure.code, mismatches: failure.mismatches })}\n`)
    process.exitCode = 1
  })
}
