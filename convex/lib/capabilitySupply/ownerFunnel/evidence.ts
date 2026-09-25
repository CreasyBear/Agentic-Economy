import type { Doc } from '../../../_generated/dataModel'
import type { OwnerSupplyOffering, OwnerSupplyPublication } from './contracts'

type OwnerToolEvidence = NonNullable<OwnerSupplyOffering['toolEvidence']>

export function projectToolEvidence(input: Readonly<{
  toolRef: string
  windowStartAt: number
  windowEndAt: number
  callsOverflow: boolean
  qualifiedUsesOverflow: boolean
  calls: readonly Doc<'capabilityCallProjections'>[]
  qualifiedUses: readonly Doc<'qualifiedUseReceipts'>[]
}>): OwnerToolEvidence {
  const operationCalls = input.calls.filter((row) => row.toolRef === input.toolRef)
  const operationQualifiedUses = input.qualifiedUses.filter((row) => row.toolRef === input.toolRef)
  const delivery: OwnerToolEvidence['delivery'] = input.callsOverflow
    ? { kind: 'unavailable', reason: 'window_too_large', provenance: 'canonical_call_receipts' }
    : operationCalls.length === 0
      ? { kind: 'unobserved', provenance: 'canonical_call_receipts' }
      : {
          kind: 'observed',
          deliveredCount: operationCalls.filter((row) => row.deliveryState === 'delivered').length,
          notDeliveredCount: operationCalls.filter((row) => row.deliveryState === 'not_delivered').length,
          unknownCount: operationCalls.filter((row) => row.deliveryState === 'unknown').length,
          sampleSize: operationCalls.length,
          lastObservedAt: Math.max(...operationCalls.map((row) => row.updatedAt)),
          provenance: 'canonical_call_receipts',
        }
  const usefulOutcome: OwnerToolEvidence['usefulOutcome'] = input.qualifiedUsesOverflow
    ? { kind: 'unavailable', reason: 'window_too_large', provenance: 'qualified_use_receipts' }
    : operationQualifiedUses.length === 0
      ? { kind: 'unobserved', provenance: 'qualified_use_receipts' }
      : {
          kind: 'observed',
          qualifiedUseCount: operationQualifiedUses.length,
          lastObservedAt: Math.max(...operationQualifiedUses.map((row) => row.qualifiedAt)),
          provenance: 'qualified_use_receipts',
        }
  return {
    windowStartAt: input.windowStartAt,
    windowEndAt: input.windowEndAt,
    delivery,
    usefulOutcome,
  }
}

export function providerTestCompleted(
  sourceKind: OwnerSupplyPublication['source']['kind'] | undefined,
  x402ChallengeObserved: boolean,
  testObserved: boolean,
): boolean {
  if (sourceKind === 'x402') return x402ChallengeObserved
  return testObserved
}
