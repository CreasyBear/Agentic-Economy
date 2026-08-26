import { httpActionGeneric } from 'convex/server'

import { internal } from './_generated/api'

const MAX_BODY_BYTES = 128 * 1024
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u
const SNAPSHOT_PATTERN = /^das_[0-9a-f]{32}$/u
const ACCOUNT_PATTERN = /^acc_[0-9a-f]{32}$/u
const PRINCIPAL_PATTERN = /^prn_[0-9a-f]{32}$/u
const GRANT_PATTERN = /^grt_[0-9a-f]{32}$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u

type JsonRecord = Record<string, unknown>

const JOURNAL_FIELDS = [
  'operationRef', 'idempotencyRef', 'operation', 'secretRef', 'targetGeneration',
  'previousGeneration', 'previousRevision', 'state', 'createdAt', 'updatedAt',
] as const

function response(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

async function readBody(request: Request): Promise<JsonRecord | undefined> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return undefined
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return undefined
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return undefined
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function bearer(request: Request): string | undefined {
  const value = request.headers.get('authorization')
  if (value === null || !value.startsWith('Bearer ')) return undefined
  const token = value.slice('Bearer '.length)
  return TOKEN_PATTERN.test(token) ? token : undefined
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

async function channelAuthenticated(request: Request): Promise<boolean> {
  const supplied = bearer(request)
  const configured = process.env.AE_SECRET_LIFECYCLE_RPC_TOKEN?.trim()
  if (supplied === undefined || configured === undefined || !TOKEN_PATTERN.test(configured)) return false
  const [left, right] = await Promise.all([digest(supplied), digest(configured)])
  let mismatch = left.byteLength ^ right.byteLength
  for (let index = 0; index < left.byteLength; index += 1) mismatch |= left[index]! ^ right[index]!
  return mismatch === 0
}

function authority(value: unknown) {
  if (!isRecord(value) || !exactKeys(value, [
    'operation', 'snapshotRef', 'accountRef', 'actorPrincipalRef', 'grantRef',
    'grantGeneration', 'correlationRef', 'idempotencyRef', 'occurredAt',
  ])) throw new TypeError('secret_lifecycle_rpc_invalid')
  if (!['provision', 'rotate', 'reconcile'].includes(String(value.operation))
    || typeof value.snapshotRef !== 'string' || !SNAPSHOT_PATTERN.test(value.snapshotRef)
    || typeof value.accountRef !== 'string' || !ACCOUNT_PATTERN.test(value.accountRef)
    || typeof value.actorPrincipalRef !== 'string' || !PRINCIPAL_PATTERN.test(value.actorPrincipalRef)
    || typeof value.grantRef !== 'string' || !GRANT_PATTERN.test(value.grantRef)
    || !Number.isSafeInteger(value.grantGeneration) || Number(value.grantGeneration) < 1
    || typeof value.correlationRef !== 'string' || !OPAQUE_REF_PATTERN.test(value.correlationRef)
    || typeof value.idempotencyRef !== 'string' || !OPAQUE_REF_PATTERN.test(value.idempotencyRef)
    || !Number.isSafeInteger(value.occurredAt) || Number(value.occurredAt) < 0) {
    throw new TypeError('secret_lifecycle_rpc_invalid')
  }
  return value as {
    operation: 'provision' | 'rotate' | 'reconcile'
    snapshotRef: string
    accountRef: string
    actorPrincipalRef: string
    grantRef: string
    grantGeneration: number
    correlationRef: string
    idempotencyRef: string
    occurredAt: number
  }
}

function requireExactArgs(args: JsonRecord, fields: readonly string[]): void {
  if (!exactKeys(args, ['authority', ...fields])) throw new TypeError('secret_lifecycle_rpc_invalid')
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('secret_lifecycle_rpc_invalid')
  return value
}

function requireInteger(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new TypeError('secret_lifecycle_rpc_invalid')
  }
  return Number(value)
}

function journalRecord(value: unknown): never {
  if (!isRecord(value)) throw new TypeError('secret_lifecycle_rpc_invalid')
  const fields = value.previousGeneration === undefined
    ? JOURNAL_FIELDS.filter((field) => field !== 'previousGeneration')
    : JOURNAL_FIELDS
  if (!exactKeys(value, fields)
    || (value.operation !== 'provision' && value.operation !== 'rotate')
    || !['prepared', 'active', 'failed_validation', 'external_effect_unknown', 'pointer_conflict'].includes(String(value.state))) {
    throw new TypeError('secret_lifecycle_rpc_invalid')
  }
  requireString(value.operationRef)
  requireString(value.idempotencyRef)
  requireString(value.secretRef)
  requireString(value.targetGeneration)
  if (value.previousGeneration !== undefined) requireString(value.previousGeneration)
  requireInteger(value.previousRevision, 0)
  requireInteger(value.createdAt, 0)
  requireInteger(value.updatedAt, 0)
  return value as never
}

export const secretLifecycleRpc = httpActionGeneric(async (ctx, request) => {
  if (!await channelAuthenticated(request)) return response({ kind: 'unavailable' }, 401)
  const body = await readBody(request)
  if (body === undefined || !exactKeys(body, ['operation', 'args'])
    || typeof body.operation !== 'string' || !isRecord(body.args)) {
    return response({ kind: 'unavailable' }, 400)
  }
  try {
    const auth = authority(body.args.authority)
    const args = body.args
    let result: unknown
    switch (body.operation) {
      case 'journal_read':
        requireExactArgs(args, ['idempotencyRef'])
        result = await ctx.runMutation(internal.secretLifecycleOperations.readLifecycleJournal, {
          authority: auth,
          idempotencyRef: requireString(args.idempotencyRef),
        })
        break
      case 'journal_insert':
        requireExactArgs(args, ['record'])
        result = await ctx.runMutation(internal.secretLifecycleOperations.insertLifecyclePrepared, {
          authority: auth,
          record: journalRecord(args.record),
        })
        break
      case 'journal_replace':
        requireExactArgs(args, ['record', 'expectedState'])
        if (!['prepared', 'active', 'failed_validation', 'external_effect_unknown', 'pointer_conflict']
          .includes(requireString(args.expectedState))) throw new TypeError('secret_lifecycle_rpc_invalid')
        result = await ctx.runMutation(internal.secretLifecycleOperations.replaceLifecycleJournal, {
          authority: auth,
          record: journalRecord(args.record),
          expectedState: args.expectedState as never,
        })
        break
      case 'pointer_read':
        requireExactArgs(args, ['secretRef'])
        result = await ctx.runMutation(internal.secretLifecycleOperations.readSecretPointer, {
          authority: auth,
          secretRef: requireString(args.secretRef),
        })
        break
      case 'pointer_initialize':
        requireExactArgs(args, ['secretRef', 'activeGeneration'])
        result = await ctx.runMutation(internal.secretLifecycleOperations.initializeSecretPointer, {
          authority: auth,
          secretRef: requireString(args.secretRef),
          activeGeneration: requireString(args.activeGeneration),
        })
        break
      case 'pointer_advance':
        requireExactArgs(args, [
          'secretRef', 'expectedActiveGeneration', 'expectedRevision', 'newGeneration',
        ])
        result = await ctx.runMutation(internal.secretLifecycleOperations.advanceSecretPointer, {
          authority: auth,
          secretRef: requireString(args.secretRef),
          expectedActiveGeneration: requireString(args.expectedActiveGeneration),
          expectedRevision: requireInteger(args.expectedRevision, 1),
          newGeneration: requireString(args.newGeneration),
        })
        break
      default:
        return response({ kind: 'unavailable' }, 400)
    }
    return response({ kind: 'ok', result }, 200)
  } catch (error) {
    return response(
      { kind: 'unavailable' },
      error instanceof TypeError && error.message === 'secret_lifecycle_rpc_invalid' ? 400 : 409,
    )
  }
})
