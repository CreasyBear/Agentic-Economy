import { z } from 'zod'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import type {
  PublishedOperation,
  RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import type { ExactAmount, MoneyAcceptedInvocationCharge } from '@/modules/money/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { uniqueSorted } from '@/modules/common/unique-sorted'

export type InvocationMaterialInput = Readonly<{
  operationKey: string
  input: StableHashValue
  inputDigest: string
  sourceSnapshotDigest: string
  target: StableHashValue
}>

export type RecoveryControlResult = ActionResult & Readonly<{
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
  usage?: Pick<MoneyAcceptedInvocationCharge, 'usageRef' | 'observedAt' | 'chargeState' | 'amount' | 'priceDigest' | 'transactionRef'>
}>
export function buildInvocationMaterial(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  value: StableHashValue
}>): InvocationMaterialInput {
  if (!input.descriptor.validateInput(input.value)) {
    throw new Error('published_operation_input_invalid')
  }
  assertExactDescriptor(input.operation, input.descriptor)
  const inputDigest = canonicalDigest(input.value)
  const target: StableHashValue = Object.assign(
    {
      operationId: input.operation.operationId,
      operationVersion: input.descriptor.version,
      invocationGeneration: 1,
      materialDigest: input.operation.materialDigest,
    },
    stablePublishedOperationIdentity(input.operation.identity),
    {
      readiness: {
        observedAt: input.operation.readiness.observedAt,
        validUntil: input.operation.readiness.validUntil,
        qualificationDigest: input.operation.readiness.qualificationDigest,
        evidenceRefs: [...input.operation.readiness.evidenceRefs],
      },
      effect: {
        amount: { ...executableFixedPrice(input.operation) },
        payment: stablePayment(input.operation.identity.payment),
        data: input.descriptor.dataUse.map((use) => ({
          inputPointer: use.inputPointer,
          recipient: use.recipient.kind,
          purposes: [...use.purposes],
        })),
      },
    },
  )
  const sourceSnapshotDigest = invocationMaterialSourceDigest(input.operation, input.descriptor)
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
    target,
  }
}

export function invocationMaterialSourceDigest(
  operation: PublishedOperation,
  descriptor: RuntimePublishedOperationDescriptor,
): string {
  const descriptorMaterial = Object.fromEntries(
    Object.entries(descriptor).filter(([key]) => key !== 'validateInput' && key !== 'validateOutput'),
  )
  return canonicalDigest({
    operation,
    descriptor: descriptorMaterial,
  })
}

export function assertExactDescriptor(
  operation: PublishedOperation,
  descriptor: RuntimePublishedOperationDescriptor,
): void {
  if (
    descriptor.id !== operation.operationId
    || descriptor.version !== `published:v1:${operation.materialDigest}`
    || canonicalDigest(descriptor.target)
      !== canonicalDigest(operation.identity)
  ) throw new Error('published_operation_descriptor_not_exact')
  executableFixedPrice(operation)
}

export function createRecoveryControlAction(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  now: () => number
  run: (
    value: InvocationMaterialInput,
    context: ActionContext,
  ) => Promise<RecoveryControlResult>
  preReleaseCheck: (
    value: InvocationMaterialInput,
    context: ActionContext,
  ) => Promise<RecoveryControlResult | undefined>
}>): Action<InvocationMaterialInput, RecoveryControlResult> {
  const { operation, descriptor } = input
  assertExactDescriptor(operation, descriptor)
  const classes = new Set(descriptor.effects.map(({ class: effectClass }) => effectClass))
  const effect = {
    class: classes.has('financial_exposure')
      ? 'payment' as const
      : classes.has('external_state_change')
        ? 'external_state_change' as const
        : classes.has('data_release')
          ? 'disclosure' as const
          : 'observation' as const,
    reversible: descriptor.effects.every(({ reversibility }) =>
      reversibility === 'not_applicable' || reversibility === 'reversible'),
    recipientKind: descriptor.effects.length === 0 ? 'none' as const : 'provider_system' as const,
    dataClasses: uniqueSorted(descriptor.dataUse.map(({ classification }) => classification)),
    spendExposure: classes.has('financial_exposure') ? 'bounded' as const : 'none' as const,
    approval: descriptor.effects.length === 0
      ? 'none' as const
      : descriptor.effects.some(({ authority }) => authority === 'mandate_or_explicit')
        ? 'mandate_eligible' as const
        : 'approve_each' as const,
  }
  return {
    id: descriptor.id,
    name: descriptor.name,
    summary: descriptor.summary,
    boundaries: ['Exact admitted publication only.', 'No host or static action registration.'],
    schema: z.unknown() as z.ZodType<InvocationMaterialInput>,
    parameters: [],
    readOnly: false,
    effect,
    surfaces: [],
    outputSchema: z.unknown() as z.ZodType<RecoveryControlResult>,
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
      project: (_value: InvocationMaterialInput) => ({
        dataUse: {
          fields: descriptor.dataUse.map(({ inputPointer }) => inputPointer),
          limits: {
            amount: executableFixedPrice(operation),
            publicationRevision: operation.identity.publicationRevision,
            contractVersion: operation.identity.contractVersion,
          },
        },
      }),
    }.project,
    classifyInvocationResult: {
      classify: (result: RecoveryControlResult) => ({
        outcome: result.kind,
        referenceable: result.kind === 'published_operation_succeeded',
      }),
    }.classify,
    preReleaseCheck: {
      check: async ({ data, context }: { data: InvocationMaterialInput; context: ActionContext }) =>
        await input.preReleaseCheck(data, context),
    }.check,
    run: async ({ data, context }) => await input.run(data, context),
  }
}

export function executableFixedPrice(
  operation: PublishedOperation,
): ExactAmount {
  return operation.pricingConfig.paidAmount
}
function stablePublishedOperationIdentity(
  identity: PublishedOperation['identity'],
): Readonly<Record<string, StableHashValue>> {
  const connectionAuthority = identity.connectionAuthority
  return {
    businessId: identity.businessId,
    publicationRef: identity.publicationRef,
    publicationRevision: identity.publicationRevision,
    publicationDigest: identity.publicationDigest,
    contractId: identity.contractId,
    contractVersion: identity.contractVersion,
    contractDigest: identity.contractDigest,
    offeringId: identity.offeringId,
    offeringDigest: identity.offeringDigest,
    bindingId: identity.bindingId,
    bindingDigest: identity.bindingDigest,
    adapterId: identity.adapterId,
    transportConfigDigest: identity.transportConfigDigest,
    endpoint: { ...identity.endpoint },
    payment: stablePayment(identity.payment),
    paymentRecipient: identity.paymentRecipient,
    pricingConfig: stablePricingConfig(identity.pricingConfig),
    priceDigest: identity.priceDigest,
    price: stablePrice(identity.price),
    materialTerms: identity.materialTerms.map((term) => ({ ...term })),
    evidenceDigest: identity.evidenceDigest,
    ...(connectionAuthority === undefined ? {} : {
      connectionAuthority: {
        connectionRef: connectionAuthority.connectionRef,
        providerRef: connectionAuthority.providerRef,
        adapterId: connectionAuthority.adapterId,
        authorityGeneration: connectionAuthority.authorityGeneration,
        authorityDigest: connectionAuthority.authorityDigest,
        operationRef: connectionAuthority.operationRef,
        grantedScopes: [...connectionAuthority.grantedScopes],
        grantedResources: [...connectionAuthority.grantedResources],
      },
    }),
  }
}

function stablePayment(payment: PublishedOperation['identity']['payment']): StableHashValue {
  return payment.kind === 'none'
    ? { kind: 'none' }
    : {
        kind: 'x402',
        network: payment.network,
        asset: payment.asset,
        payTo: payment.payTo,
        currency: payment.currency,
        routeAmountExponent: payment.routeAmountExponent,
        assetAmountExponent: payment.assetAmountExponent,
      }
}

function stablePricingConfig(config: PublishedOperation['pricingConfig']): StableHashValue {
  return {
    version: config.version,
    unit: config.unit,
    paidAmount: { ...config.paidAmount },
    ...(config.freeTier === undefined ? {} : { freeTier: { ...config.freeTier } }),
  }
}

function stablePrice(price: PublishedOperation['identity']['price']): StableHashValue {
  return price.kind === 'fixed'
    ? { kind: 'fixed', amount: { ...price.amount } }
    : price.kind === 'range'
      ? { kind: 'range', minimum: { ...price.minimum }, maximum: { ...price.maximum } }
      : { kind: 'on_request' }
}
