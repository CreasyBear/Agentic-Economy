import { ConvexError } from 'convex/values'
import { env } from '../../../_generated/server'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { financialEnvironmentMatches } from '../../money/formance/contracts'
import { type Infer } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { callAuthorityValue, callResultValue } from '@/modules/capability-execution/convex'

type CallRow = Doc<'capabilityCalls'>
type PersistedOperationAuthority = Infer<typeof callAuthorityValue>
type CallResultValue = Infer<typeof callResultValue>

export type OpenDispatchValue = Readonly<{
  committedPaymentRequiredJson?: string
  sourceUsdcUnits?: string
  x402RequirementDigest?: string
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  dispatchedCredentialId?: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  toolRef: string
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantRef: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  toolJson: string
  inputJson: string
  authority?: PersistedOperationAuthority
  workId?: string
  attemptRef?: string
  dispatchState?: 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'
}>

export type DispatchResult =
  | { kind: 'enqueued'; workId: string }
  | { kind: 'replayed'; workId: string }
  | { kind: 'refused' }

export function assertCallResultJson(value: CallResultValue): void {
  if (value.kind === 'completed' && !isBoundedJsonValue(value.output)) {
    throw new Error('operation_invocation_result_json_invalid')
  }
}

export function persistedDispatchMatches(row: CallRow, dispatch: OpenDispatchValue): boolean {
  const outerFieldsMatch = [
    row.callRef === dispatch.callRef,
    row.principalId === dispatch.principalId,
    row.ownerId === dispatch.ownerId,
    row.credentialId === dispatch.credentialId,
    row.applicationRef === dispatch.applicationRef,
    row.environment === dispatch.environment,
    row.toolRef === dispatch.toolRef,
    row.idempotencyKey === dispatch.idempotencyKey,
    row.inputDigest === dispatch.inputDigest,
    row.requestDigest === dispatch.requestDigest,
    row.grantRef === dispatch.grantRef,
    row.grantGeneration === dispatch.grantGeneration,
    row.policyDigest === dispatch.policyDigest,
    row.grantExpiresAt === dispatch.grantExpiresAt,
    row.toolJson === dispatch.toolJson,
    row.inputJson === dispatch.inputJson,
    row.workId === dispatch.workId,
  ].every(Boolean)
  if (!outerFieldsMatch) return false
  if ((row.authority === undefined) !== (dispatch.authority === undefined)) return false
  return row.authority === undefined
    || canonicalDigest(row.authority as never) === canonicalDigest(dispatch.authority as never)
}

export function commandMatchesDispatch(command: unknown, dispatch: OpenDispatchValue): boolean {
  if (!isRecord(command)) return false
  const commandRow = command.row
  const currentAttemptWrite = command.currentAttemptWrite
  if (!isRecord(commandRow) || !isRecord(currentAttemptWrite)) return false
  const operation = parsePublishedToolSnapshot(dispatch.toolJson)
  if (operation === undefined) return false
  const row = commandRow
  const attempt = currentAttemptWrite
  const control = asRecord(row.control)
  const owner = asRecord(field(control, 'owner'))
  const action = asRecord(field(control, 'action'))
  const authorityBinding = asRecord(row.authorityBinding)
  const idempotency = asRecord(attempt.idempotency)
  const attemptActor = asRecord(attempt.actor)
  const authority = dispatch.authority
  const matches = [
    row.executionRef === dispatch.callRef,
    row.sourceRef === `operation-invocation-source:${dispatch.callRef}`,
    row.preparedMaterialDigest === dispatch.inputDigest,
    field(control, 'executionRef') === dispatch.callRef,
    field(owner, 'callerRef') === dispatch.credentialId,
    field(owner, 'principalRef') === dispatch.principalId,
    field(action, 'id') === operation.operationId,
    field(authorityBinding, 'executionRef') === dispatch.callRef,
    field(authorityBinding, 'digest') === field(asRecord(authority), 'decisionDigest'),
    field(authorityBinding, 'targetDigest') === field(asRecord(authority), 'targetDigest'),
    field(authorityBinding, 'expiresAt') === field(asRecord(authority), 'expiresAt'),
    attempt.executionRef === dispatch.callRef,
    field(attemptActor, 'callerRef') === dispatch.credentialId,
    field(attemptActor, 'principalRef') === dispatch.principalId,
    field(idempotency, 'operationKey') === dispatch.toolRef,
    field(idempotency, 'materialInputDigest') === dispatch.inputDigest,
    typeof attempt.attemptRef === 'string',
    typeof attempt.effectGeneration === 'number',
  ]
  return matches.every(Boolean)
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

export function field(record: Record<string, unknown> | undefined, key: string): unknown {
  return record === undefined ? undefined : record[key]
}

export function withoutSystemFields<T extends { _id: unknown; _creationTime: number }>(
  row: T,
): Omit<T, '_id' | '_creationTime'> {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}

export async function canonicalCommandReadbackMatches(ctx: MutationCtx, command: unknown): Promise<boolean> {
  if (!isRecord(command)) return false
  const commandRow = command.row
  const currentAttemptWrite = command.currentAttemptWrite
  if (!isRecord(commandRow) || !isRecord(currentAttemptWrite)) return false
  const expectedAttempt = currentAttemptWrite
  const [control, attempt] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', String(commandRow.executionRef)))
      .unique(),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptRef', (query) => (
        query.eq('executionRef', String(expectedAttempt.executionRef))
          .eq('attemptRef', String(expectedAttempt.attemptRef))
      ))
      .unique(),
  ])
  if (control === null || attempt === null) return false
  return canonicalDigest(withoutSystemFields(control) as never) === canonicalDigest(commandRow as never)
    && canonicalDigest(withoutSystemFields(attempt) as never) === canonicalDigest(expectedAttempt as never)
}

export type CancellationArgs = Readonly<{
  callRef: string
  principalId: string
  credentialId: string
  idempotencyKey: string
}>

export function cancellationIdentityMatches(row: CallRow | null, args: CancellationArgs): row is CallRow {
  if (row === null) return false
  return [
    row.callRef === args.callRef,
    row.principalId === args.principalId,
    row.credentialId === args.credentialId,
  ].every(Boolean)
}

export function purchaseIdentityMatches(
  row: CallRow | null,
  args: CancellationArgs,
): row is CallRow {
  return cancellationIdentityMatches(row, args)
    && row.idempotencyKey === args.idempotencyKey
}

// A Call is identified by the Principal tuple that survives a credential
// rotation. The stored credentialId stays on the row as effect evidence.
export type CallIdentityArgs = Readonly<{
  principalId: string
  ownerId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
}>

export function callIdentity(principal: AgentAccessPrincipal): CallIdentityArgs {
  return {
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    applicationRef: principal.applicationRef,
    environment: principal.environment,
  }
}

export function callIdentityMatches<T extends CallIdentityArgs>(
  row: T | null,
  identity: CallIdentityArgs,
): row is T {
  if (row === null) return false
  return [
    row.principalId === identity.principalId,
    row.ownerId === identity.ownerId,
    row.applicationRef === identity.applicationRef,
    row.environment === identity.environment,
  ].every(Boolean)
}

export function callEnvironmentMatches(row: CallRow): boolean {
  return row.environment === deploymentPaymentEnvironment(env)
    && (row.formanceFinancialState === undefined && row.formanceReservationRefs === undefined
      || financialEnvironmentMatches(row.environment))
}

export function assertCallEnvironment(row: CallRow): void {
  if (!callEnvironmentMatches(row)) throw new ConvexError({ code: 'environment_mismatch' })
}
