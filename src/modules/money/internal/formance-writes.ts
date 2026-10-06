"use node"

import {
  NO_RETRY,
  errorName,
  formanceSafeUnitsFromSdk,
  recordMetric,
  statusCode,
  validateFormanceMoneyCommand,
  type FormanceContext,
  type FormanceMoneyBulkCommand,
  type FormanceMoneyCommand,
  type FormanceReferenceReadResult,
} from './formance-config'
import {
  readFormanceTransactionByReference,
  readSchema,
  type SupportedFormanceSchemaVersion,
} from './formance-reads'
import {
  completed,
  completedMany,
  refused,
  unavailable,
  unknown,
  type FormanceMoneyResult,
} from '../formance-result'

export async function executeFormanceMoneyCommand(
  context: FormanceContext,
  command: FormanceMoneyCommand,
): Promise<FormanceMoneyResult> {
  const startedAt = Date.now()
  const invalid = validateFormanceMoneyCommand(command)
  if (invalid !== undefined) return refused(invalid)
  const schema = await readSchema(context, command.schemaVersion as SupportedFormanceSchemaVersion)
  if (schema.kind !== 'ready') {
    return schema.kind === 'setup_required'
      ? refused(schema.code)
      : unavailable(schema.code)
  }
  const existing = await readFormanceTransactionByReference(context, command.commandRef)
  if (existing.kind === 'found') {
    if (!matchingCommand(existing, command)) {
      return refused('formance_reference_conflict')
    }
    recordMetric('write', 'replayed', startedAt)
    return completed(command.commandRef, true)
  }
  if (existing.kind === 'setup_required') return refused(existing.code)
  if (existing.kind === 'unavailable') return unavailable(existing.code)

  try {
    const response = await context.sdk.ledger.v2.createTransaction({
      idempotencyKey: command.idempotencyKey,
      ledger: context.configuration.ledger,
      schemaVersion: command.schemaVersion,
      v2PostTransaction: {
        metadata: command.metadata,
        reference: command.commandRef,
        runtime: 'machine',
        script: { template: command.template, vars: command.variables },
      },
    }, NO_RETRY)
    const transaction = response.v2CreateTransactionResponse?.data
    if (transaction === undefined || transaction.reference !== command.commandRef) {
      return unknown(command.commandRef)
    }
    for (const posting of transaction.postings) {
      if (formanceSafeUnitsFromSdk(posting.amount) === undefined) {
        recordMetric('write', 'unsafe_integer', startedAt)
        return Object.freeze({ kind: 'refused', code: 'formance_unsafe_integer', retryable: false })
      }
    }
    recordMetric('write', 'completed', startedAt)
    return completed(command.commandRef, false)
  } catch (error) {
    const reconciled = await readFormanceTransactionByReference(context, command.commandRef)
    const result = reconciled.kind === 'found'
      ? matchingCommand(reconciled, command)
        ? completed(command.commandRef, true)
        : refused('formance_reference_conflict')
      : reconciled.kind === 'setup_required'
        ? refused(reconciled.code)
        : reconciled.kind === 'unavailable'
          ? unknown(command.commandRef)
          : mapFormanceWriteError(error, command.commandRef)
    recordMetric('write', result.kind, startedAt)
    return result
  }
}

export async function executeFormanceMoneyBulk(
  context: FormanceContext,
  bulk: FormanceMoneyBulkCommand,
): Promise<FormanceMoneyResult> {
  const startedAt = Date.now()
  const commands = [...bulk.commands]
  if (commands.length === 0 || commands.length > 103
    || new Set(commands.map(({ commandRef }) => commandRef)).size !== commands.length
    || new Set(commands.map(({ idempotencyKey }) => idempotencyKey)).size !== commands.length) {
    return refused('formance_bulk_invalid')
  }
  for (const command of commands) {
    const invalid = validateFormanceMoneyCommand(command)
    if (invalid !== undefined) return refused(invalid)
  }
  const schemaVersions = new Set(commands.map(({ schemaVersion }) => schemaVersion))
  if (schemaVersions.size !== 1) return refused('formance_bulk_schema_mismatch')
  const schemaVersion = commands[0]!.schemaVersion
  const schema = await readSchema(context, schemaVersion as SupportedFormanceSchemaVersion)
  if (schema.kind !== 'ready') {
    return schema.kind === 'setup_required'
      ? refused(schema.code)
      : unavailable(schema.code)
  }
  const before = await readBulkReferences(context, commands)
  if (before.kind === 'completed') return before.result
  if (before.kind === 'refused') return refused(before.code)
  if (before.kind === 'unavailable' || before.kind === 'unknown') {
    return unknown(commands[0]!.commandRef)
  }

  try {
    const response = await context.sdk.ledger.v2.createBulk({
      atomic: true,
      continueOnFailure: false,
      ledger: context.configuration.ledger,
      parallel: false,
      requestBody: commands.map((command) => ({
        action: 'CREATE_TRANSACTION' as const,
        data: {
          metadata: command.metadata,
          reference: command.commandRef,
          runtime: 'machine' as const,
          script: { template: command.template, vars: command.variables },
        },
        ik: command.idempotencyKey,
      })),
      schemaVersion,
    }, NO_RETRY)
    const rows = response.v2BulkResponse?.data
    if (rows === undefined) return unknown(commands[0]!.commandRef)
    // Native atomic responses may include staged successes before a later error.
    // The SDK validates response shape; final reference readback decides whether
    // those staged entries were committed or rolled back.
    if (rows.some((row) => row.responseType === 'ERROR')) {
      const reconciled = await readBulkReferences(context, commands)
      const result = reconciled.kind === 'absent'
        ? refused('formance_bulk_refused')
        : reconciled.kind === 'completed'
          ? reconciled.result
          : unknown(commands[0]!.commandRef)
      recordMetric('write_bulk', result.kind, startedAt)
      return result
    }
    if (rows.length !== commands.length) return unknown(commands[0]!.commandRef)
    if (!rows.every((row, index) => row.responseType === 'CREATE_TRANSACTION'
      && row.data.reference === commands[index]!.commandRef
      && row.data.postings.every(({ amount }) => formanceSafeUnitsFromSdk(amount) !== undefined))) {
      return unknown(commands[0]!.commandRef)
    }
    recordMetric('write_bulk', 'completed', startedAt)
    return completedMany(commands.map(({ commandRef }) => commandRef), false)
  } catch (error) {
    if (statusCode(error) === 401 || statusCode(error) === 403) {
      recordMetric('write_bulk', 'unavailable', startedAt)
      return unavailable('formance_access_unavailable')
    }
    const reconciled = await readBulkReferences(context, commands)
    const result = reconciled.kind === 'completed'
      ? reconciled.result
      : reconciled.kind === 'absent'
        ? errorName(error) === 'SDKValidationError'
          ? unknown(commands[0]!.commandRef)
          : mapFormanceWriteError(error, commands[0]!.commandRef)
        : unknown(commands[0]!.commandRef)
    recordMetric('write_bulk', result.kind, startedAt)
    return result
  }
}

type BulkReadback =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'completed'; result: FormanceMoneyResult }>
  | Readonly<{ kind: 'refused'; code: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>
  | Readonly<{ kind: 'unknown' }>

async function readBulkReferences(
  context: FormanceContext,
  commands: readonly FormanceMoneyCommand[],
): Promise<BulkReadback> {
  const reads = await Promise.all(
    commands.map(async ({ commandRef }) => await readFormanceTransactionByReference(context, commandRef)),
  )
  const unavailableRead = reads.find((read) => read.kind === 'unavailable')
  if (unavailableRead?.kind === 'unavailable') return unavailableRead
  const invalidRead = reads.find((read) => read.kind === 'setup_required')
  if (invalidRead?.kind === 'setup_required') return Object.freeze({ kind: 'refused', code: invalidRead.code })
  if (reads.every((read) => read.kind === 'absent')) return Object.freeze({ kind: 'absent' })
  if (commands.every((command, index) => {
    const read = reads[index]
    return read !== undefined && read.kind === 'found' && matchingCommand(read, command)
  })) {
    return Object.freeze({
      kind: 'completed',
      result: completedMany(commands.map(({ commandRef }) => commandRef), true),
    })
  }
  if (reads.every((read) => read.kind === 'found')) {
    return Object.freeze({ kind: 'refused', code: 'formance_reference_conflict' })
  }
  return Object.freeze({ kind: 'unknown' })
}

function matchingCommand(
  existing: Extract<FormanceReferenceReadResult, { kind: 'found' }>,
  command: FormanceMoneyCommand,
): boolean {
  return existing.metadata.command_digest === command.metadata.command_digest
    && existing.metadata.idempotency_digest === command.idempotencyKey
    && existing.template === command.template
}

export function mapFormanceWriteError(error: unknown, reference: string): FormanceMoneyResult {
  const status = statusCode(error)
  if (status === 401 || status === 403) return unavailable('formance_access_unavailable')
  if (status === 400 || status === 404 || status === 409 || status === 422
    || errorName(error) === 'SDKValidationError') {
    return refused(status === 409 ? 'formance_idempotency_conflict' : 'formance_request_refused')
  }
  return unknown(reference)
}
