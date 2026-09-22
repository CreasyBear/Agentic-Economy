import type {
  AdminCommandAction,
  AdminCommandReceipt,
} from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'

import type { MutationCtx } from '../../_generated/server'

type AdminOperationKeyRead =
  | { kind: 'absent' }
  | {
      kind: 'replay'
      requestHash: string
      status: string
      resultJson: string | null
      resultHash: string | null
    }

type AdminOperationKeyWrite = Readonly<{
  actorRef: string
  operationName: string
  key: string
  requestHash: string
  status: 'succeeded' | 'failed_terminal'
  resultJson: string
  resultHash: string
}>

export async function readAdminOperationKey(
  ctx: Pick<MutationCtx, 'db'>,
  actorRef: string,
  operationName: string,
  key: string,
): Promise<AdminOperationKeyRead> {
  const row = await ctx.db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => query
      .eq('actorRef', actorRef)
      .eq('operationName', operationName)
      .eq('key', key))
    .unique()
  if (row === null) return { kind: 'absent' }
  return {
    kind: 'replay',
    requestHash: row.requestHash,
    status: row.status,
    resultJson: row.resultJson ?? null,
    resultHash: row.resultHash ?? null,
  }
}

export async function writeAdminOperationKey(
  ctx: Pick<MutationCtx, 'db'>,
  input: AdminOperationKeyWrite,
): Promise<void> {
  const now = Date.now()
  await ctx.db.insert('operationKeys', {
    scope: 'admin_operator',
    actorKind: 'admin',
    actorRef: input.actorRef,
    operationName: input.operationName,
    key: input.key,
    requestHash: input.requestHash,
    status: input.status,
    resultHash: input.resultHash,
    resultJson: input.resultJson,
    effectRefs: [],
    createdAt: now,
    updatedAt: now,
  })
}

export function parseAdminOperationReceipt<A extends AdminCommandAction>(
  resultJson: string,
  resultHash: string | null,
  action: A,
): AdminCommandReceipt<A> {
  const value: unknown = JSON.parse(resultJson)
  if (
    !isAdminCommandReceipt(value, action)
    || resultHash !== canonicalDigest(value)
  ) throw new Error('admin_operation_receipt_integrity_failure')
  return value
}

function isAdminCommandReceipt<A extends AdminCommandAction>(
  value: unknown,
  action: A,
): value is AdminCommandReceipt<A> {
  if (!isRecord(value) || value.action !== action || typeof value.correlationId !== 'string') return false
  if (value.kind === 'completed') {
    return typeof value.code === 'string'
      && typeof value.auditEventRef === 'string'
      && Array.isArray(value.effectRefs)
      && value.effectRefs.every((ref) => typeof ref === 'string')
  }
  if (value.kind === 'proposed') {
    return typeof value.proposalRef === 'string' && typeof value.expiresAt === 'number'
  }
  return value.kind === 'refused' && typeof value.code === 'string'
}
