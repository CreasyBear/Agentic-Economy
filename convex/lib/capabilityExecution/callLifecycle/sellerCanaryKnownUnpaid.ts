import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  admitRegisteredTransport,
  parsePublishedToolSnapshot,
} from '@/modules/capability-supply/public'

type CallRow = Doc<'capabilityCalls'>
type KnownUnpaidSellerCanaryRefusalCode =
  | 'grant_not_found'
  | 'grant_generation_stale'
  | 'operation_not_current'
  | 'provider_refused'

const LEGACY_SELLER_CANARY_PROVIDER_APPROVAL_NEXT_ACTION =
  'Provider approval is not current.'

function persistedOperationIsCanonicalCredentiallessX402(
  row: CallRow,
): boolean {
  if (row.toolJson === undefined || row.environment !== 'sandbox') return false
  const operation = parsePublishedToolSnapshot(row.toolJson)
  if (operation === undefined) return false
  const admitted = admitRegisteredTransport({
    adapterId: operation.binding.adapter.adapterId,
    endpointUrl: operation.binding.endpointUrl,
    authority: operation.binding.authority,
    continuation: operation.binding.continuation,
    cancellation: operation.binding.cancellation,
    config: operation.binding.adapter.config,
  })
  if (admitted.kind !== 'admitted') return false
  const authority = operation.binding.authority
  const connectionAuthority = operation.connectionAuthority
  const identityAuthority = operation.identity.connectionAuthority
  if (
    authority.kind !== 'provider_connection'
    || connectionAuthority === undefined
    || identityAuthority === undefined
  ) return false
  return [
    operation.runtimeEnvironment === 'sandbox',
    operation.identity.adapterId === 'x402-fetch:v2',
    operation.binding.adapter.adapterId === 'x402-fetch:v2',
    operation.identity.payment.kind === 'x402',
    connectionAuthority.connectionRef === authority.connectionRef,
    connectionAuthority.providerRef === authority.providerRef,
    connectionAuthority.adapterId === 'x402-fetch:v2',
    canonicalDigest(connectionAuthority as never) === canonicalDigest(identityAuthority as never),
    admitted.transport.adapterId === 'x402-fetch:v2',
    admitted.transport.configJson === operation.transport.configJson,
    admitted.transport.configDigest === operation.transport.configDigest,
    operation.identity.transportConfigDigest === operation.transport.configDigest,
  ].every(Boolean)
}

function isExactLegacySellerCanaryProviderApprovalRefusal(
  row: CallRow,
): boolean {
  const result = row.result
  return result?.kind === 'refused'
    && result.code === 'provider_refused'
    && result.toolRef === row.toolRef
    && result.retryable === false
    && result.nextAction === LEGACY_SELLER_CANARY_PROVIDER_APPROVAL_NEXT_ACTION
    && result.receipt === undefined
    && persistedOperationIsCanonicalCredentiallessX402(row)
}

function preClaimKnownUnpaidRefusalCode(
  row: CallRow,
): KnownUnpaidSellerCanaryRefusalCode | undefined {
  const result = row.result
  const knownPreClaimProjection = [
    row.state === 'refused',
    row.dispatchState === 'failed',
    result?.kind === 'refused',
    row.workId !== undefined,
    row.attemptRef === undefined,
    row.evidenceHash === undefined,
    row.usage === undefined,
    row.reconciliation === undefined,
  ].every(Boolean)
  if (!knownPreClaimProjection || result?.kind !== 'refused') return undefined
  return result.code === 'grant_not_found'
    || result.code === 'grant_generation_stale'
    || result.code === 'operation_not_current'
    ? result.code
    : isExactLegacySellerCanaryProviderApprovalRefusal(row)
      ? 'provider_refused'
    : undefined
}

async function sellerCanaryHasNoEffectEvidence(
  ctx: MutationCtx | QueryCtx,
  callRef: string,
): Promise<boolean> {
  const [control, attempts, paymentAttempts, usage, providerJournals] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', callRef))
      .take(1),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', callRef))
      .take(1),
    ctx.db.query('moneyX402PaymentAttempts')
      // Payment attempts are keyed by attemptRef, but dispatchRef is the
      // invocation identity. Scan for that exact dispatch so a malformed or
      // legacy non-canonical attemptRef can never evade the no-effect fence.
      .filter((query) => query.eq(query.field('dispatchRef'), callRef))
      .take(1),
    ctx.db.query('moneyUsageEvents')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
      .take(1),
    ctx.db.query('providerConsequenceJournal')
      .filter((query) => query.eq(query.field('callRef'), callRef))
      .take(1),
  ])
  return [control, attempts, paymentAttempts, usage, providerJournals]
    .every((rows) => rows.length === 0)
}

export async function knownUnpaidSellerCanaryRefusal(
  ctx: MutationCtx | QueryCtx,
  row: CallRow,
): Promise<KnownUnpaidSellerCanaryRefusalCode | undefined> {
  const code = preClaimKnownUnpaidRefusalCode(row)
  if (code === undefined) return undefined
  return await sellerCanaryHasNoEffectEvidence(ctx, row.callRef) ? code : undefined
}
