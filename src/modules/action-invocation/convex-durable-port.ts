import type { ActionResult } from '@/modules/common/action'
import {
  createPublicSourceTransport,
  sourceMutation,
  sourceQuery,
  type ConvexSourceTransport,
} from '@/lib/server/convex-source'
import {
  createSourceWriteAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

import type { InvocationActor } from './contracts'
import type {
  DurableActionInvocationPort,
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
  PersistControlCommand,
  PersistControlResult,
} from './internal/durable-contracts'


type SourceWriteFields = Readonly<{
  operationKey: string
  correlationId: string
  sourceWrite: SourceWriteAdmission
}>

export type ConvexActionInvocationDurablePortOptions = Readonly<{
  owner: InvocationActor
  request: SourceWriteAdmissionRequest
  transport?: ConvexSourceTransport
  env?: Record<string, string | undefined>
}>

function sourceContext(kind: string, invocationRef: string, commandId = kind) {
  return {
    operationKey: `action-invocation:${kind}:${commandId}`,
    correlationId: `action-invocation:${invocationRef}`,
  }
}

export async function createConvexActionInvocationDurablePort<Result extends ActionResult>(
  options: ConvexActionInvocationDurablePortOptions,
): Promise<DurableActionInvocationPort<Result>> {
  const envOptions = options.env === undefined ? {} : { env: options.env }
  const transport = options.transport ?? createPublicSourceTransport(envOptions)
  const request = options.request
  const sourceWrite = (operationKey: string, correlationId: string): SourceWriteAdmission => (
    createSourceWriteAdmission({
      ...envOptions,
      request,
      scope: 'protected_action',
      operationKey,
      correlationId,
    })
  )
  const transactMutation = sourceMutation<
    Omit<PersistControlCommand<Result>, 'canonicalCommandMaterial'> & SourceWriteFields,
    PersistControlResult
  >('actionInvocationControl:transactSource')
  const lateObservationMutation = sourceMutation<
    Parameters<DurableActionInvocationPort<Result>['recordLateObservation']>[0] & SourceWriteFields,
    PersistControlResult
  >('actionInvocationControl:recordLateObservationSource')
  const readControlQuery = sourceQuery<
    SourceWriteFields & Readonly<{ invocationRef: string; callerRef: string; principalRef: string }>,
    DurableControlRow<Result> | null
  >('actionInvocationControl:readControlSource')
  const readAttemptsQuery = sourceQuery<
    SourceWriteFields & Readonly<{ invocationRef: string; callerRef: string; principalRef: string; limit: number }>,
    readonly DurableAttemptRow[]
  >('actionInvocationControl:readAttemptsSource')
  const readAttemptQuery = sourceQuery<
    SourceWriteFields & Readonly<{ invocationRef: string; callerRef: string; principalRef: string; attemptRef: string }>,
    DurableAttemptRow | null
  >('actionInvocationControl:readAttemptSource')
  const readHistoryQuery = sourceQuery<
    SourceWriteFields & Readonly<{ invocationRef: string; callerRef: string; principalRef: string; afterVersion: number; limit: number }>,
    readonly DurableHistoryRow[]
  >('actionInvocationControl:readHistorySource')
  const readHistoryCommandQuery = sourceQuery<
    SourceWriteFields & Readonly<{ invocationRef: string; callerRef: string; principalRef: string; commandId: string }>,
    DurableHistoryRow | null
  >('actionInvocationControl:readHistoryCommandSource')

  return {
    async transact(command) {
      const context = sourceContext('transact', command.row.invocationRef, command.commandId)
      const {
        commandId,
        commandDigest,
        expectedInvocationVersion,
        expectedEffectGeneration,
        row,
        currentAttemptWrite,
        history,
      } = command
      return transport.mutation(transactMutation, {
        commandId,
        commandDigest,
        expectedInvocationVersion,
        ...(expectedEffectGeneration === undefined ? {} : { expectedEffectGeneration }),
        row,
        ...(currentAttemptWrite === undefined ? {} : { currentAttemptWrite }),
        history,
        ...context,
        sourceWrite: sourceWrite(context.operationKey, context.correlationId),
      })
    },
    async readControl(invocationRef) {
      const context = sourceContext('read-control', invocationRef)
      const row = await transport.query(readControlQuery, {
        invocationRef,
        callerRef: options.owner.callerRef,
        principalRef: options.owner.principalRef,
        ...context,
        sourceWrite: sourceWrite(context.operationKey, context.correlationId),
      })
      return row ?? undefined
    },
    async readAttempts(invocationRef, limit) {
      const context = sourceContext('read-attempts', invocationRef)
      return transport.query(readAttemptsQuery, {
        invocationRef,
        callerRef: options.owner.callerRef,
        principalRef: options.owner.principalRef,
        limit,
        ...context,
        sourceWrite: sourceWrite(context.operationKey, context.correlationId),
      })
    },
    async readAttempt(invocationRef, attemptRef) {
      const context = sourceContext('read-attempt', invocationRef, attemptRef)
      const row = await transport.query(readAttemptQuery, {
        invocationRef,
        attemptRef,
        callerRef: options.owner.callerRef,
        principalRef: options.owner.principalRef,
        ...context,
        sourceWrite: sourceWrite(context.operationKey, context.correlationId),
      })
      return row ?? undefined
    },
    async readHistory(invocationRef, afterVersion, limit) {
      const context = sourceContext('read-history', invocationRef, `${afterVersion}:${limit}`)
      return transport.query(readHistoryQuery, {
        invocationRef,
        afterVersion,
        limit,
        callerRef: options.owner.callerRef,
        principalRef: options.owner.principalRef,
        ...context,
        sourceWrite: sourceWrite(context.operationKey, context.correlationId),
      })
    },
    async readHistoryCommand(invocationRef, commandId) {
      const context = sourceContext('read-history-command', invocationRef, commandId)
      const row = await transport.query(readHistoryCommandQuery, {
        invocationRef,
        commandId,
        callerRef: options.owner.callerRef,
        principalRef: options.owner.principalRef,
        ...context,
        sourceWrite: sourceWrite(context.operationKey, context.correlationId),
      })
      return row ?? undefined
    },
    async recordLateObservation(input) {
      const context = sourceContext('late-observation', input.invocationRef, input.commandId)
      return transport.mutation(lateObservationMutation, {
        ...input,
        ...context,
        sourceWrite: sourceWrite(context.operationKey, context.correlationId),
      })
    },
  }
}
