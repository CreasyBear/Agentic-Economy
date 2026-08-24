import type { ActionResult } from '@/modules/common/action'

import type {
  ActionInvocationView,
  InvocationActor,
} from '@/modules/action-invocation/runtime'
import type { DynamicPublishedInvocationResult } from './dynamic-published-contract'
import type { InvocationHost } from './application-service'
import {
  derivePaidOperationSemantics,
  projectRichPaidOperation,
  projectStructuredPaidOperation,
  type PaidOperationContinuation,
  type PaidOperationPaymentAttemptSnapshot,
  type PaidOperationResultDelivery,
  type PaidOperationSemantics,
  type RichPaidOperationProjection,
  type StructuredPaidOperationProjection,
} from './paid-operation-semantics'
import type { X402PaymentAttempt } from '@/modules/action-invocation/runtime'
import type { ReconciliationEvidence } from '@/modules/action-invocation/runtime'
import type { X402PaymentReconciliationEvidence } from '@/modules/action-invocation/runtime'

export type PaidOperationReadPort<Result extends ActionResult> = Readonly<{
  loadInvocation(invocationRef: string): ActionInvocationView<Result> | undefined
  loadPaymentAttempt(input: Readonly<{
    invocationRef: string
    attemptRef: string
    effectGeneration: number
  }>): PaidOperationPaymentAttemptSnapshot | undefined
}>

export type PaidOperationInterpretation = Readonly<{
  operation: PaidOperationSemantics['operation']
  presentation: PaidOperationSemantics['presentation']
  maximumAuthorizedCharge: PaidOperationSemantics['maximumAuthorizedCharge']
  queryRecipient: string
  resultDelivery: PaidOperationResultDelivery
  environment: PaidOperationSemantics['environment']
}>

export type PaidOperationInterpreter<Result extends ActionResult> = Readonly<{
  interpret(view: ActionInvocationView<Result>): PaidOperationInterpretation
}>

export type PaidOperationProjection = Readonly<{
  semantics: PaidOperationSemantics
  human: RichPaidOperationProjection
  agent: StructuredPaidOperationProjection
}>

export type PaidOperationApplicationRefusalCode =
  | 'invocation_not_found'
  | 'cross_principal_refused'
  | 'stale_invocation_version'
  | 'continuation_not_allowed'

export type PaidOperationApplicationResult<Value> =
  | Readonly<{ kind: 'accepted'; value: Value }>
  | Readonly<{ kind: 'refused'; code: PaidOperationApplicationRefusalCode }>

export type PaidOperationCommand =
  | Readonly<{ kind: 'authorize'; accept: boolean }>
  | Readonly<{ kind: 'execute' }>
  | Readonly<{
      kind: 'reconcile'
      reconciliationEvidence: ReconciliationEvidence
      paymentReconciliationEvidence: X402PaymentReconciliationEvidence
    }>
  | Readonly<{ kind: 'inspect' }>

export type PaidOperationCommandPort<Result extends ActionResult> = Readonly<{
  authorize(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    accept: boolean
  }>): Promise<ActionInvocationView<Result> | undefined> | ActionInvocationView<Result> | undefined
  execute(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
  }>): Promise<ActionInvocationView<Result> | undefined> | ActionInvocationView<Result> | undefined
  reconcile(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    reconciliationEvidence: ReconciliationEvidence
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence
  }>): Promise<ActionInvocationView<Result> | undefined> | ActionInvocationView<Result> | undefined
}>

export type PaidOperationApplicationService = Readonly<{
  inspect(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
  }>): PaidOperationApplicationResult<PaidOperationProjection>
  command(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    command: PaidOperationCommand
  }>): Promise<PaidOperationApplicationResult<PaidOperationProjection>>
}>

export function createPaidOperationApplicationService<Result extends ActionResult>(input: Readonly<{
  actor: InvocationActor
  reads: PaidOperationReadPort<Result>
  commands: PaidOperationCommandPort<Result>
  interpreter: PaidOperationInterpreter<Result>
}>): PaidOperationApplicationService {
  const reconstruct = (
    invocationRef: string,
    expectedInvocationVersion: number,
  ): PaidOperationApplicationResult<PaidOperationProjection> => {
    const view = input.reads.loadInvocation(invocationRef)
    if (view === undefined) return { kind: 'refused', code: 'invocation_not_found' }
    if (view.owner.principalRef !== input.actor.principalRef
      || view.owner.callerRef !== input.actor.callerRef) {
      return { kind: 'refused', code: 'cross_principal_refused' }
    }
    if (view.invocationVersion !== expectedInvocationVersion) {
      return { kind: 'refused', code: 'stale_invocation_version' }
    }
    const attempt = view.attempts.at(-1)
    const paymentAttempt = attempt === undefined
      ? undefined
      : input.reads.loadPaymentAttempt({
          invocationRef,
          attemptRef: attempt.attemptRef,
          effectGeneration: attempt.effectGeneration,
        })
    const semantics = derivePaidOperationSemantics({
      view,
      ...(paymentAttempt === undefined ? {} : { paymentAttempt }),
      ...input.interpreter.interpret(view),
    })
    return {
      kind: 'accepted',
      value: {
        semantics,
        human: projectRichPaidOperation(semantics),
        agent: projectStructuredPaidOperation(semantics),
      },
    }
  }

  return Object.freeze({
    inspect: ({ invocationRef, expectedInvocationVersion }) =>
      reconstruct(invocationRef, expectedInvocationVersion),
    command: async ({ invocationRef, expectedInvocationVersion, command }) => {
      const current = reconstruct(invocationRef, expectedInvocationVersion)
      if (current.kind === 'refused') return current
      if (!continuationAllowed(current.value.semantics.continuations, command.kind)) {
        return { kind: 'refused', code: 'continuation_not_allowed' }
      }
      if (command.kind === 'inspect') return current
      const updated = command.kind === 'authorize'
        ? await input.commands.authorize({
            invocationRef,
            expectedInvocationVersion,
            accept: command.accept,
          })
        : command.kind === 'execute'
          ? await input.commands.execute({ invocationRef, expectedInvocationVersion })
          : await input.commands.reconcile({
              invocationRef,
              expectedInvocationVersion,
              reconciliationEvidence: command.reconciliationEvidence,
              paymentReconciliationEvidence: command.paymentReconciliationEvidence,
            })
      if (updated === undefined) return { kind: 'refused', code: 'continuation_not_allowed' }
      return reconstruct(invocationRef, updated.invocationVersion)
    },
  })
}

export function createDevelopmentPaidOperationApplicationService(input: Readonly<{
  host: InvocationHost
  interpreter: PaidOperationInterpreter<DynamicPublishedInvocationResult>
}>): PaidOperationApplicationService {
  const paymentAttempts = () => input.host.exportSnapshot().paymentAttempts
  return createPaidOperationApplicationService({
    actor: input.host.actor,
    interpreter: input.interpreter,
    reads: {
      loadInvocation: input.host.inspect,
      loadPaymentAttempt: (key) => {
        const attempt = paymentAttempts().find((candidate) =>
          candidate.invocationRef === key.invocationRef
          && candidate.attemptRef === key.attemptRef
          && candidate.effectGeneration === key.effectGeneration)
        return attempt === undefined ? undefined : paymentAttemptSnapshot(attempt)
      },
    },
    commands: {
      authorize: async ({ invocationRef, expectedInvocationVersion, accept }) => {
        if (input.host.inspect(invocationRef)?.invocationVersion !== expectedInvocationVersion) {
          return undefined
        }
        const decision = await input.host.decide(invocationRef, accept)
        return decision.kind === 'accepted' ? decision.view : undefined
      },
      execute: async ({ invocationRef, expectedInvocationVersion }) => {
        if (input.host.inspect(invocationRef)?.invocationVersion !== expectedInvocationVersion) {
          return undefined
        }
        const result = await input.host.continue(invocationRef)
        return 'view' in result ? result.view : undefined
      },
      reconcile: async ({
        invocationRef,
        expectedInvocationVersion,
        reconciliationEvidence,
        paymentReconciliationEvidence,
      }) => {
        if (input.host.inspect(invocationRef)?.invocationVersion !== expectedInvocationVersion) {
          return undefined
        }
        const result = await input.host.recoverPaidOperation(
          invocationRef,
          reconciliationEvidence,
          paymentReconciliationEvidence,
        )
        return 'view' in result ? result.view : undefined
      },
    },
  })
}

function continuationAllowed(
  continuations: readonly PaidOperationContinuation[],
  kind: PaidOperationCommand['kind'],
): boolean {
  return continuations.some((continuation) => continuation.kind === kind)
}

function paymentAttemptSnapshot(attempt: X402PaymentAttempt): PaidOperationPaymentAttemptSnapshot {
  return {
    paymentIdentifier: attempt.paymentIdentifier,
    custodyRef: attempt.custodyRef,
    ...(attempt.settledAmount === undefined ? {} : { settledAmount: attempt.settledAmount }),
    state: attempt.state,
    evidenceRefs: attempt.evidenceRefs,
  }
}
