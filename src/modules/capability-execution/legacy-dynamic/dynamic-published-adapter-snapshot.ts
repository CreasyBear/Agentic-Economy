import type { PublishedOperation } from '@/modules/capability-supply/public'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { InMemoryControlSnapshot } from '@/modules/action-invocation/runtime'
import type {
  DynamicPublishedInvocationResult,
} from './dynamic-published-contract'
import type {
  DynamicPublishedSemanticClaim,
  DynamicPublishedSourceRow,
} from './dynamic-published-source'
import {
  verifyDynamicPublishedSnapshot,
  type DynamicPublishedSnapshotAnchors,
} from './dynamic-published-snapshot-verifier'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  type DevelopmentDurableState,
} from '@/modules/action-invocation/runtime'
import type {
  DurableActionInvocationPort,
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
  PersistControlResult,
} from '@/modules/action-invocation/runtime'
import { restoreDurableAttempt } from '@/modules/action-invocation/runtime'
import type {
  InvocationInputHistory,
  InvocationInputWork,
} from './input-work'
import type {
  X402PaymentAttempt,
  X402PaymentAuthorizationEvent,
} from '@/modules/action-invocation/runtime'

export type DynamicPublishedAdapterSnapshot = Readonly<{
  format: 'dynamic-published-action-invocation:development:v4'
  sourceRows: readonly DynamicPublishedSourceRow[]
  semanticClaims: readonly DynamicPublishedSemanticClaim[]
  controls: readonly DurableControlRow<DynamicPublishedInvocationResult>[]
  attempts: readonly Readonly<{ invocationRef: string; rows: readonly DurableAttemptRow[] }>[]
  history: readonly Readonly<{ invocationRef: string; rows: readonly DurableHistoryRow[] }>[]
  commands: readonly Readonly<{
    commandId: string
    value: Readonly<{
      digest: string
      result: PersistControlResult
      material: StableHashValue
    }>
  }>[]
  inputWork?: readonly InvocationInputWork[]
  inputHistory?: readonly InvocationInputHistory[]
  operations?: readonly PublishedOperation[]
  paymentAttempts: readonly X402PaymentAttempt[]
  paymentAuthorizationEvents: readonly X402PaymentAuthorizationEvent[]
}>

export function loadDynamicPublishedAdapterSnapshot(
  snapshot: unknown,
  anchors: DynamicPublishedSnapshotAnchors,
): Readonly<{
  durablePort: DurableActionInvocationPort<DynamicPublishedInvocationResult>
  developmentSnapshot: DevelopmentDurableState<DynamicPublishedInvocationResult>
  initialSnapshot: InMemoryControlSnapshot<DynamicPublishedInvocationResult>
  sourceRows: Map<string, DynamicPublishedSourceRow>
  semanticClaims: readonly DynamicPublishedSemanticClaim[]
  inputWork: readonly InvocationInputWork[]
  inputHistory: readonly InvocationInputHistory[]
  paymentAttempts: readonly X402PaymentAttempt[]
  paymentAuthorizationEvents: readonly X402PaymentAuthorizationEvent[]
}> {
  const verified = verifyDynamicPublishedSnapshot({ snapshot, anchors })
  const durableState = createDevelopmentDurableState<DynamicPublishedInvocationResult>()
  for (const row of verified.controls) durableState.controls.set(row.invocationRef, row)
  for (const group of verified.attempts) {
    durableState.attempts.set(group.invocationRef, new Map(group.rows.map((row) => [row.attemptRef, row])))
  }
  for (const group of verified.history) durableState.history.set(group.invocationRef, [...group.rows])
  for (const command of verified.commands) {
    durableState.commands.set(command.commandId, {
      digest: command.value.digest,
      result: command.value.result,
    })
    durableState.commandMaterials.set(command.commandId, command.value.material)
  }
  const initialSnapshot: InMemoryControlSnapshot<DynamicPublishedInvocationResult> = {
    format: 'action-invocation-control:development:v1',
    records: verified.controls.map((row) => ({
      sourceRef: row.sourceRef,
      control: {
        ...row.control,
        attempts: [...(durableState.attempts.get(row.invocationRef)?.values() ?? [])]
          .sort((left, right) => left.attemptNumber - right.attemptNumber)
          .map(restoreDurableAttempt),
      },
      ...(row.authorityBinding === undefined ? {} : { authorityBinding: row.authorityBinding }),
    })),
  }
  return {
    durablePort: createDevelopmentDurablePort(durableState),
    developmentSnapshot: durableState,
    initialSnapshot,
    sourceRows: new Map(verified.sourceRows.map((row) => [row.invocationRef, row])),
    semanticClaims: verified.semanticClaims,
    inputWork: verified.inputWork ?? [],
    inputHistory: verified.inputHistory ?? [],
    paymentAttempts: verified.paymentAttempts,
    paymentAuthorizationEvents: verified.paymentAuthorizationEvents,
  }
}
