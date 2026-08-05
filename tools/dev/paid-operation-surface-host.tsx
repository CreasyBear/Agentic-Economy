'use client'

import { useRef, useState } from 'react'


import { AePaidOperationCard } from '../../src/components/ae/action-invocation/AePaidOperationCard'
import type {
  PaidOperationApplicationResult,
  PaidOperationApplicationService,
  PaidOperationCommand,
  PaidOperationProjection,
} from '../../src/modules/action-invocation/paid-operation-application-service'
import type {
  PaidOperationContinuation,
  StructuredPaidOperationProjection,
} from '../../src/modules/action-invocation/paid-operation-semantics'
import type {
  ReconciliationEvidence,
  X402PaymentReconciliationEvidence,
} from '../../src/modules/action-invocation'

export const PAID_OPERATION_DEVELOPMENT_SURFACE = Object.freeze({
  environment: 'local-development',
  evidenceClass: 'labelled_local_development',
  claimCeiling: 'mechanism_and_projection_parity_only',
  humanComprehension:
    'Source and automated accessibility checks do not prove that people understand the operation, consequence, or recovery choice.',
})

export type PaidOperationSurfaceRef = Readonly<{
  invocationRef: string
  expectedInvocationVersion: number
}>

export type StructuredPaidOperationCommandContract = Readonly<{
  command: PaidOperationCommand['kind']
  requiredInput: readonly string[]
  inputTemplate?: Readonly<Record<string, unknown>>
  expectedInvocationVersion: number
}>

export type StructuredPaidOperationDevelopmentResponse =
  | Readonly<{
      kind: 'accepted'
      projection: StructuredPaidOperationProjection
      semanticDigest: string
      commands: readonly StructuredPaidOperationCommandContract[]
      claimBoundary: typeof PAID_OPERATION_DEVELOPMENT_SURFACE
    }>
  | Extract<PaidOperationApplicationResult<never>, { kind: 'refused' }>

export function createStructuredPaidOperationDevelopmentHost(
  service: PaidOperationApplicationService,
) {
  return Object.freeze({
    inspect(ref: PaidOperationSurfaceRef): StructuredPaidOperationDevelopmentResponse {
      return structuredResponse(service.inspect(ref))
    },
    async command(input: PaidOperationSurfaceRef & Readonly<{ command: PaidOperationCommand }>) {
      return structuredResponse(await service.command(input))
    },
  })
}

export function AePaidOperationDevelopmentSurface({
  service,
  initialRef,
  resolveReconciliationEvidence,
}: Readonly<{
  service: PaidOperationApplicationService
  initialRef: PaidOperationSurfaceRef
  resolveReconciliationEvidence?: (
    ref: PaidOperationSurfaceRef,
  ) => Promise<Readonly<{
    reconciliationEvidence: ReconciliationEvidence
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence
  }>> | Readonly<{
    reconciliationEvidence: ReconciliationEvidence
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence
  }>
}>) {
  const initial = service.inspect(initialRef)
  const [result, setResult] = useState(initial)
  const [pending, setPending] = useState(false)
  const statusRef = useRef<HTMLParagraphElement>(null)

  const projection = result.kind === 'accepted' ? result.value : null

  async function dispatch(continuation: PaidOperationContinuation) {
    const ref = {
      invocationRef: projection?.semantics.identity.invocationRef ?? initialRef.invocationRef,
      expectedInvocationVersion: continuation.expectedInvocationVersion,
    }
    const reconciliationEvidence = continuation.kind === 'reconcile'
      ? await resolveReconciliationEvidence?.(ref)
      : undefined
    const command = continuationCommand(continuation, reconciliationEvidence)
    if (command === null) {
      setResult({ kind: 'refused', code: 'continuation_not_allowed' })
      return
    }
    setPending(true)
    try {
      const next = await service.command({
        ...ref,
        command,
      })
      setResult(next)
      queueMicrotask(() => statusRef.current?.focus())
    } finally {
      setPending(false)
    }
  }

  return (
    <main
      className="mx-auto grid min-h-screen w-full max-w-4xl content-start gap-5 px-4 py-8 sm:px-6"
      data-development-only="true"
    >
      <header className="grid gap-2">
        <h1 className="block text-lg font-semibold text-foreground">
          Local development paid operation
        </h1>
        <p className="block text-muted-foreground">
          Labelled local mechanism demonstration. No provider fulfilment, deployment, or customer-value claim.
        </p>
      </header>

      <p
        ref={statusRef}
        tabIndex={-1}
        className="rounded-md border border-border bg-card p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {pending
          ? 'Applying the selected continuation…'
          : result.kind === 'refused'
            ? `The operation could not continue: ${result.code.replaceAll('_', ' ')}.`
            : 'Development projection ready.'}
      </p>

      {projection === null
        ? null
        : (
            <div
              aria-busy={pending}
              className="[&_button]:min-h-[44px] [&_summary]:min-h-[44px]"
            >
              <AePaidOperationCard
                semantics={projection.human.semantics}
                {...(pending ? {} : { onContinue: dispatch })}
              />
            </div>
          )}

      <p className="block text-sm text-muted-foreground">
        Human comprehension boundary: {PAID_OPERATION_DEVELOPMENT_SURFACE.humanComprehension}
      </p>
    </main>
  )
}

function continuationCommand(
  continuation: PaidOperationContinuation,
  reconciliationEvidence?: Readonly<{
    reconciliationEvidence: ReconciliationEvidence
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence
  }>,
): PaidOperationCommand | null {
  switch (continuation.kind) {
    case 'authorize':
      return { kind: 'authorize', accept: true }
    case 'execute':
      return { kind: 'execute' }
    case 'inspect':
      return { kind: 'inspect' }
    case 'reconcile':
      return reconciliationEvidence === undefined
        ? null
        : { kind: 'reconcile', ...reconciliationEvidence }
    case 'retry':
      return null
  }
}

function structuredResponse(
  result: PaidOperationApplicationResult<PaidOperationProjection>,
): StructuredPaidOperationDevelopmentResponse {
  if (result.kind === 'refused') return result
  return {
    kind: 'accepted',
    projection: result.value.agent,
    semanticDigest: result.value.agent.semanticDigest,
    commands: result.value.semantics.continuations.flatMap((continuation) => {
      if (continuation.kind === 'reconcile') {
        return [{
          command: continuation.kind,
          requiredInput: ['reconciliationEvidence', 'paymentReconciliationEvidence'],
          inputTemplate: {
            kind: 'reconcile',
            reconciliationEvidence: null,
            paymentReconciliationEvidence: null,
          },
          expectedInvocationVersion: continuation.expectedInvocationVersion,
        }]
      }
      const command = continuationCommand(continuation)
      return command === null ? [] : [{
        command: command.kind,
        requiredInput: continuation.requiredInput,
        expectedInvocationVersion: continuation.expectedInvocationVersion,
      }]
    }),
    claimBoundary: PAID_OPERATION_DEVELOPMENT_SURFACE,
  }
}
