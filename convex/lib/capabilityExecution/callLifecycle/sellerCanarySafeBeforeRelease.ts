import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { parsePublishedToolSnapshot } from '@/modules/capability-supply/public'
import { withoutSystemFields } from './callIdentity'

type CallRow = Doc<'capabilityCalls'>

export const SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION =
  'Route call signing is unavailable.' as const

export type SafeBeforeReleaseSellerCanaryProof = Readonly<{
  refusalCode: 'pre_release_failed'
  attemptRef: string
  attemptNumber: number
  effectGeneration: number
  controlDigest: string
  attemptDigest: string
}>

function exactSellerCanaryAttemptIdentityMatches(
  row: CallRow,
  attempt: Doc<'actionExecutionAttempts'>,
  attemptNumber: number,
): boolean {
  return [
      attempt.executionRef === row.callRef,
      attempt.attemptNumber === attemptNumber,
      attempt.attemptRef === `operation-attempt:${row.callRef}:${attemptNumber}`,
      attempt.effectGeneration === attemptNumber,
      attempt.actor.callerRef === row.credentialId,
      attempt.actor.principalRef === row.principalId,
      attempt.idempotency.operationKey === row.toolRef,
      attempt.idempotency.materialInputDigest === row.inputDigest,
    ].every(Boolean)
}

function safelyClosedSellerCanaryAttempt(
  row: CallRow,
  attempt: Doc<'actionExecutionAttempts'>,
  attemptNumber: number,
): boolean {
  if (
    !exactSellerCanaryAttemptIdentityMatches(row, attempt, attemptNumber)
    || attempt.release.state !== 'not_released'
  ) return false
  const outcome = attempt.outcome
  return (outcome.state === 'failed' && outcome.retry === 'safe_before_release')
    || (outcome.state === 'reconciled_not_released'
      && outcome.retry === 'safe_after_reconciliation')
}

function exactSafeBeforeReleaseAttemptHistory(
  row: CallRow,
  attempts: Doc<'actionExecutionAttempts'>[],
  currentAttemptRef: string,
): Doc<'actionExecutionAttempts'> | undefined {
  const ordered = [...attempts].sort((left, right) => left.attemptNumber - right.attemptNumber)
  if (ordered.length === 0) return undefined
  const current = ordered.at(-1)
  if (
    current === undefined
    || current.attemptRef !== currentAttemptRef
    || current.outcome.state !== 'failed'
    || current.outcome.retry !== 'safe_before_release'
  ) return undefined
  return ordered.every((attempt, index) => (
    safelyClosedSellerCanaryAttempt(row, attempt, index + 1)
  )) ? current : undefined
}

function isGenericSafeBeforeReleaseRefusal(row: CallRow): boolean {
  const canary = row.sellerOnboardingCanary
  const result = row.result
  if (canary === undefined || result?.kind !== 'refused') return false
  return [
    row.state === 'refused',
    row.dispatchState === 'failed',
    row.workId !== undefined,
    row.attemptRef !== undefined,
    row.usage === undefined,
    row.reconciliation === undefined,
    result.toolRef === row.toolRef,
    canary.callRef === row.callRef,
    canary.toolRef === row.toolRef,
    canary.inputDigest === row.inputDigest,
    canary.idempotencyKey === row.idempotencyKey,
    row.evidenceHash === undefined,
    result.code === 'pre_release_failed',
    result.retryable === false,
    result.nextAction === SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION,
    result.receipt === undefined,
  ].every(Boolean)
}

function safeBeforeReleaseCanonicalControlMatches(
  row: CallRow,
  control: Doc<'actionExecutionControls'>,
): boolean {
  const canonical = control.control.control
  const binding = control.authorityBinding
  const operation = parsePublishedToolSnapshot(row.toolJson ?? '')
  if (canonical.state !== 'retryable') return false
  if (binding === undefined || operation === undefined || row.authority === undefined) return false
  return [
      canonical.reason === 'pre_release_failure',
      control.executionRef === row.callRef,
      control.currentAttemptRef === row.attemptRef,
      control.sourceRef === `operation-invocation-source:${row.callRef}`,
      control.preparedMaterialDigest === row.inputDigest,
      control.control.owner.callerRef === row.credentialId,
      control.control.owner.principalRef === row.principalId,
      control.control.action.id === operation.operationId,
      binding.executionRef === row.callRef,
      binding.digest === row.authority.decisionDigest,
      binding.targetDigest === row.authority.targetDigest,
      binding.expiresAt === row.authority.expiresAt,
    ].every(Boolean)
}

function currentSafeBeforeReleaseAttempt(
  row: CallRow,
  control: Doc<'actionExecutionControls'>,
  attempts: Doc<'actionExecutionAttempts'>[],
): Doc<'actionExecutionAttempts'> | undefined {
  const currentAttemptRef = control.currentAttemptRef
  if (currentAttemptRef === undefined) return undefined
  const attempt = exactSafeBeforeReleaseAttemptHistory(row, attempts, currentAttemptRef)
  if (attempt === undefined) return undefined
  if (control.currentEffectGeneration !== attempt.effectGeneration) return undefined
  return attempt
}

/**
 * Proves that the current seller-canary attempt stopped before any financial,
 * transport, usage, or provider effect. Managed seller-canary payment retries
 * were retired by the Formance cutover.
 */
export async function safeBeforeReleaseSellerCanaryRefusal(
  ctx: MutationCtx | QueryCtx,
  row: CallRow,
): Promise<SafeBeforeReleaseSellerCanaryProof | undefined> {
  if (!isGenericSafeBeforeReleaseRefusal(row)) return undefined

  const [control, attempts, paymentAttempts, usage, providerJournals] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', row.callRef))
      .unique(),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', row.callRef))
      .collect(),
    ctx.db.query('moneyX402PaymentAttempts')
      .filter((query) => query.eq(query.field('dispatchRef'), row.callRef))
      .take(1),
    ctx.db.query('moneyUsageEvents')
      .withIndex('by_callRef', (query) => query.eq('callRef', row.callRef))
      .take(1),
    ctx.db.query('providerConsequenceJournal')
      .filter((query) => query.eq(query.field('callRef'), row.callRef))
      .take(1),
  ])
  if (control === null) return undefined
  if (!safeBeforeReleaseCanonicalControlMatches(row, control)) return undefined
  const attempt = currentSafeBeforeReleaseAttempt(row, control, attempts)
  if (attempt === undefined) return undefined
  if ([paymentAttempts, usage, providerJournals].some((rows) => rows.length > 0)) {
    return undefined
  }
  return {
    refusalCode: 'pre_release_failed',
    attemptRef: attempt.attemptRef,
    attemptNumber: attempt.attemptNumber,
    effectGeneration: attempt.effectGeneration,
    controlDigest: canonicalDigest(withoutSystemFields(control) as never),
    attemptDigest: canonicalDigest(withoutSystemFields(attempt) as never),
  }
}
