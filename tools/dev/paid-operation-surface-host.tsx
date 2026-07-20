'use client'

import { useRef, useState } from 'react'

import { Text } from '@astryxdesign/core/Text'

import { AePaidOperationCard } from '../../src/components/ae/action-invocation/AePaidOperationCard'
import {
  projectHostedPaidOperationCardInput,
  type HostedPaidOperationCardInput,
  type HostedPaidOperationCommandDescriptor,
} from '../../src/modules/action-invocation/paid-operation-card-contract'
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
  environment: 'Local labelled sandbox',
  provenance: 'Labelled mock provider',
  evidenceClass: 'local_labelled_sandbox_fixture',
  claimCeiling: 'Local browser mechanics and projection parity only.',
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
  expectedInvocationVersion: number
}>

export type StructuredPaidOperationPublicCommand =
  | Readonly<{ kind: 'authorize'; accept: boolean }>
  | Readonly<{ kind: 'execute' }>
  | Readonly<{ kind: 'inspect' }>
  | Readonly<{ kind: 'reconcile' }>

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
  resolveReconciliationEvidence?: (
    ref: PaidOperationSurfaceRef,
  ) => Promise<Readonly<{
    reconciliationEvidence: ReconciliationEvidence
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence
  }>> | Readonly<{
    reconciliationEvidence: ReconciliationEvidence
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence
  }>,
) {
  return Object.freeze({
    inspect(ref: PaidOperationSurfaceRef): StructuredPaidOperationDevelopmentResponse {
      return structuredResponse(service.inspect(ref))
    },
    async command(input: PaidOperationSurfaceRef & Readonly<{
      command: StructuredPaidOperationPublicCommand
    }>) {
      const command = await publicDevelopmentCommand(
        input,
        resolveReconciliationEvidence,
      )
      return command === null
        ? { kind: 'refused', code: 'continuation_not_allowed' } as const
        : structuredResponse(await service.command({ ...input, command }))
    },
  })
}

export function AePaidOperationDevelopmentSurface({
  service,
  initialRef,
  resolveReconciliationEvidence,
  transportRescue = null,
  onReadOnlyInspect,
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
  transportRescue?: HostedPaidOperationCardInput['transportRescue']
  onReadOnlyInspect?: (relation: string) => void
}>) {
  const initial = service.inspect(initialRef)
  const [result, setResult] = useState(initial)
  const [pendingCommand, setPendingCommand] = useState<
    HostedPaidOperationCardInput['pendingCommand']
  >(null)
  const statusRef = useRef<HTMLParagraphElement>(null)

  const projection = result.kind === 'accepted' ? result.value : null
  const pending = pendingCommand !== null

  async function dispatch(descriptor: HostedPaidOperationCommandDescriptor) {
    const continuation = projection?.semantics.continuations.find(({ kind }) =>
      kind === descriptor.command)
    if (continuation === undefined) {
      setResult({ kind: 'refused', code: 'continuation_not_allowed' })
      return
    }
    const ref = {
      invocationRef: projection?.semantics.identity.invocationRef ?? initialRef.invocationRef,
      expectedInvocationVersion: descriptor.expectedInvocationVersion,
    }
    const reconciliationEvidence = continuation.kind === 'reconcile'
      ? await resolveReconciliationEvidence?.(ref)
      : undefined
    const command = continuationCommand(
      continuation,
      reconciliationEvidence,
      descriptor.accept,
    )
    if (command === null) {
      setResult({ kind: 'refused', code: 'continuation_not_allowed' })
      return
    }
    setPendingCommand({
      pendingCommandId: crypto.randomUUID(),
      kind: descriptor.command,
    })
    const next = await service.command({
      ...ref,
      command,
    })
    setResult(next)
    setPendingCommand(null)
    queueMicrotask(() => statusRef.current?.focus())
  }

  return (
    <main
      className="mx-auto grid min-h-screen w-full max-w-4xl content-start gap-5 px-4 py-8 sm:px-6"
      data-development-only="true"
    >
      <header className="grid gap-2">
        <Text as="h1" type="large" weight="semibold" color="primary" display="block">
          Local development paid operation
        </Text>
        <Text color="secondary" display="block">
          Labelled local mechanism demonstration. No provider fulfilment, deployment, or customer-value claim.
        </Text>
      </header>

      <p
        ref={statusRef}
        tabIndex={-1}
        className="rounded-md border border-border bg-surface p-3 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2"
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
                card={{
                  ...projectHostedPaidOperationCardInput(
                    projection,
                    PAID_OPERATION_DEVELOPMENT_SURFACE.provenance,
                  ),
                  pendingCommand,
                  transportRescue,
                }}
                onCommand={dispatch}
                {...(onReadOnlyInspect === undefined ? {} : { onReadOnlyInspect })}
              />
            </div>
          )}

      <Text type="supporting" color="secondary" display="block">
        Human comprehension boundary: {PAID_OPERATION_DEVELOPMENT_SURFACE.humanComprehension}
      </Text>
    </main>
  )
}

function continuationCommand(
  continuation: PaidOperationContinuation,
  reconciliationEvidence?: Readonly<{
    reconciliationEvidence: ReconciliationEvidence
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence
  }>,
  accept?: boolean,
): PaidOperationCommand | null {
  switch (continuation.kind) {
    case 'authorize':
      return typeof accept === 'boolean' ? { kind: 'authorize', accept } : null
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
      const descriptor = structuredCommandContract(continuation)
      return descriptor === null ? [] : [descriptor]
    }),
    claimBoundary: PAID_OPERATION_DEVELOPMENT_SURFACE,
  }
}

function structuredCommandContract(
  continuation: PaidOperationContinuation,
): StructuredPaidOperationCommandContract | null {
  if (continuation.kind === 'retry') return null
  return {
    command: continuation.kind,
    requiredInput: continuation.kind === 'reconcile'
      ? []
      : continuation.kind === 'authorize'
        ? ['accept']
        : continuation.requiredInput,
    expectedInvocationVersion: continuation.expectedInvocationVersion,
  }
}

async function publicDevelopmentCommand(
  input: PaidOperationSurfaceRef & Readonly<{
    command: StructuredPaidOperationPublicCommand
  }>,
  resolveReconciliationEvidence?: (
    ref: PaidOperationSurfaceRef,
  ) => Promise<Readonly<{
    reconciliationEvidence: ReconciliationEvidence
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence
  }>> | Readonly<{
    reconciliationEvidence: ReconciliationEvidence
    paymentReconciliationEvidence: X402PaymentReconciliationEvidence
  }>,
): Promise<PaidOperationCommand | null> {
  switch (input.command.kind) {
    case 'authorize':
      return input.command
    case 'execute':
      return { kind: 'execute' }
    case 'inspect':
      return { kind: 'inspect' }
    case 'reconcile': {
      const evidence = await resolveReconciliationEvidence?.(input)
      return evidence === undefined ? null : { kind: 'reconcile', ...evidence }
    }
  }
}
