import { z } from 'zod'

import type {
  PublishedOperation,
  RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export type DynamicPublishedInvocationInput = Readonly<{
  operationKey: string
  input: StableHashValue
  inputDigest: string
  sourceSnapshotDigest: string
  target: StableHashValue
}>

export type DynamicPublishedInvocationResult = ActionResult & Readonly<{
  kind:
    | 'published_operation_succeeded'
    | 'published_operation_refused'
    | 'published_operation_invalid_evidence'
  sourceDisposition: 'succeeded' | 'refused'
  operationId: string
  operationVersion: string
  requestDigest: string
  responseDigest?: string
  output?: StableHashValue
  providerReceipt?: string
  paymentProof?: string
  paymentChallengeDigest?: string
  failureCode?: string
}>

export type DynamicPublishedAuthorityTarget = Readonly<{
  operationId: string
  operationVersion: string
  invocationGeneration: number
  source: PublishedOperation['identity'] & Readonly<{
    materialDigest: string
    readiness: PublishedOperation['readiness']
  }>
  effect: Readonly<{
      amount: Readonly<{ currency: string; amountMinor: number }>
    payment: PublishedOperation['identity']['payment']
    data: readonly Readonly<{ inputPointer: string; recipient: string; purposes: readonly string[] }>[]
  }>
}>

export function buildDynamicPublishedInput(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  value: StableHashValue
}>): DynamicPublishedInvocationInput {
  if (!input.descriptor.validateInput(input.value)) {
    throw new Error('published_operation_input_invalid')
  }
  assertExactDescriptor(input.operation, input.descriptor)
  const inputDigest = canonicalDigest(input.value)
  const target: DynamicPublishedAuthorityTarget = {
    operationId: input.operation.operationId,
    operationVersion: input.descriptor.version,
    invocationGeneration: 1,
    source: {
      ...input.operation.identity,
      materialDigest: input.operation.materialDigest,
      readiness: input.operation.readiness,
    },
    effect: {
      amount: executableFixedPrice(input.operation),
      payment: input.operation.identity.payment,
      data: input.descriptor.dataUse.map((use) => ({
        inputPointer: use.inputPointer,
        recipient: use.recipient.kind,
        purposes: [...use.purposes],
      })),
    },
  }
  const sourceSnapshotDigest = dynamicPublishedSourceDigest(input.operation, input.descriptor)
  const operationKey = canonicalDigest({
    operationId: input.operation.operationId,
    operationVersion: input.descriptor.version,
    sourceSnapshotDigest,
    inputDigest,
  })
  return {
    operationKey,
    input: input.value,
    inputDigest,
    sourceSnapshotDigest,
    target: target as unknown as StableHashValue,
  }
}

export function dynamicPublishedSourceDigest(
  operation: PublishedOperation,
  descriptor: RuntimePublishedOperationDescriptor,
): string {
  return canonicalDigest({
    operation,
    descriptor: {
      id: descriptor.id,
      version: descriptor.version,
      name: descriptor.name,
      summary: descriptor.summary,
      inputSchema: descriptor.inputSchema,
      outputSchema: descriptor.outputSchema,
      consequenceClass: descriptor.consequenceClass,
      authorityRequirement: descriptor.authorityRequirement,
      retryClass: descriptor.retryClass,
      materialInputPointers: descriptor.materialInputPointers,
      dataUse: descriptor.dataUse,
      effects: descriptor.effects,
      evidence: descriptor.evidence,
      safeContinuations: descriptor.safeContinuations,
      price: descriptor.price,
      target: descriptor.target,
    },
  } as StableHashValue)
}

export function assertExactDescriptor(
  operation: PublishedOperation,
  descriptor: RuntimePublishedOperationDescriptor,
): void {
  if (
    descriptor.id !== operation.operationId
    || descriptor.version !== `published:v1:${operation.materialDigest}`
    || canonicalDigest(descriptor.target as unknown as StableHashValue)
      !== canonicalDigest(operation.identity as unknown as StableHashValue)
  ) throw new Error('published_operation_descriptor_not_exact')
  executableFixedPrice(operation)
}

export function createDynamicPublishedAction(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  now: () => number
  run: (
    value: DynamicPublishedInvocationInput,
    context: ActionContext,
  ) => Promise<DynamicPublishedInvocationResult>
  preReleaseCheck: (
    value: DynamicPublishedInvocationInput,
    context: ActionContext,
  ) => Promise<DynamicPublishedInvocationResult | undefined>
}>): Action<DynamicPublishedInvocationInput, DynamicPublishedInvocationResult> {
  const { operation, descriptor } = input
  assertExactDescriptor(operation, descriptor)
  return {
    id: descriptor.id,
    name: descriptor.name,
    summary: descriptor.summary,
    boundaries: ['Exact admitted publication only.', 'No host or static action registration.'],
    schema: z.unknown() as z.ZodType<DynamicPublishedInvocationInput>,
    parameters: [],
    readOnly: false,
    surfaces: [],
    outputSchema: z.unknown() as z.ZodType<DynamicPublishedInvocationResult>,
    invocationContract: {
      version: descriptor.version,
      consequenceClass: descriptor.consequenceClass,
      materialInputPaths: ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
      authorityRequirement: descriptor.authorityRequirement,
      retryClass: descriptor.retryClass,
      expectedEvidence: descriptor.evidence.map(({ evidenceId }) => evidenceId),
      safeContinuations: descriptor.safeContinuations,
      invalidationConditions: [
        'publication_revision_changed',
        'readiness_stale',
        'operation_material_changed',
        'transport_config_changed',
        'payment_or_price_changed',
        'terms_changed',
        'input_changed',
      ],
      developmentAttemptTimeoutMs: 5_000,
      reconciliationEvidenceSource: `published-operation:${operation.operationId}`,
    },
    projectInvocationPreparation: {
      project: (value: DynamicPublishedInvocationInput) => ({
        dataUse: {
          fields: descriptor.dataUse.map(({ inputPointer }) => inputPointer),
          limits: {
            amountMinor: executableFixedPrice(operation).amountMinor,
            publicationRevision: operation.identity.publicationRevision,
            contractVersion: operation.identity.contractVersion,
          },
        },
      }),
    }.project,
    classifyInvocationResult: {
      classify: (result: DynamicPublishedInvocationResult) => ({
        outcome: result.kind,
        referenceable: result.kind === 'published_operation_succeeded',
      }),
    }.classify,
    preReleaseCheck: {
      check: async ({ data, context }: { data: DynamicPublishedInvocationInput; context: ActionContext }) =>
        await input.preReleaseCheck(data, context),
    }.check,
    run: async ({ data, context }) => await input.run(data, context),
  }
}

export function executableFixedPrice(
  operation: PublishedOperation,
): Readonly<{ currency: string; amountMinor: number }> {
  const price = operation.identity.price
  if (
    price.kind !== 'fixed'
    || price.currency.trim().length === 0
    || !Number.isSafeInteger(price.amountMinor)
    || price.amountMinor < 0
  ) {
    throw new Error('published_operation_price_not_fixed')
  }
  return { currency: price.currency, amountMinor: price.amountMinor }
}
