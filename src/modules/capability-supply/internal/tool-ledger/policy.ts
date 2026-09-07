import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { type StableHashValue } from '@/modules/common/stable-hash'

import type { CapabilityBindingRow } from '../binding/registration'
import {
  contractRefFromRow,
  type CapabilityOfferingRow,
} from '../offering/registration'
import { offeringIntegrityIsValid } from '../offering/integrity'
import type { RegistrationContext, SupplyCommandActor } from '../shared/command-envelope'
import type { OperationBeginResult, OperationLedgerPorts } from './types'

export function isTrustedQuarantineParent(
  offering: CapabilityOfferingRow,
  binding: CapabilityBindingRow,
): boolean {
  return offeringIntegrityIsValid(offering)
    && offering.networkId === binding.networkId
    && sameCapabilityContractRef(contractRefFromRow(offering), contractRefFromRow(binding))
}

export async function beginOperation(
  ports: OperationLedgerPorts,
  actor: SupplyCommandActor,
  operationName: string,
  context: RegistrationContext,
  requestMaterial: StableHashValue,
  now: number,
): Promise<OperationBeginResult> {
  const requestHash = canonicalDigest({
    requestMaterial, correlationId: context.correlationId,
    reasonCode: context.reasonCode, evidenceRefs: context.evidenceRefs,
  })
  const existing = await ports.findOperationKey({
    actorRef: actor.ref, operationName, key: context.operationKey,
  })
  if (existing !== null) {
    if (existing.requestHash !== requestHash || existing.status === 'in_progress') {
      return { kind: 'conflict' as const }
    }
    if (existing.status === 'succeeded') {
      return {
        kind: 'replay' as const,
        operationId: existing.operationId,
        resultHash: existing.resultHash,
        effectRefs: existing.effectRefs,
      }
    }
    if (existing.status === 'failed_terminal') {
      await ports.markOperationInProgress(existing.operationId, now)
    }
    return { kind: 'ready' as const, operationId: existing.operationId }
  }
  const operationId = await ports.insertOperationKey({
    scope: 'capability_supply',
    actorKind: actor.kind,
    actorRef: actor.ref,
    operationName,
    key: context.operationKey,
    requestHash,
    now,
  })
  return { kind: 'ready' as const, operationId }
}

export function replayOperationResult<T extends StableHashValue>(
  replay: Readonly<{ resultHash: string | undefined }>,
  expected: T,
): T {
  if (replay.resultHash !== canonicalDigest(expected)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return expected
}

export async function failOperation(
  ports: OperationLedgerPorts,
  operationId: string,
  reason: string,
  now: number,
): Promise<void> {
  await ports.markOperationFailed(operationId, canonicalDigest({ reason }), now)
}

export async function succeedOperation(
  ports: OperationLedgerPorts,
  operationId: string,
  result: StableHashValue,
  effectRefs: readonly string[],
  now: number,
): Promise<void> {
  await ports.markOperationSucceeded(operationId, canonicalDigest(result), effectRefs, now)
}
