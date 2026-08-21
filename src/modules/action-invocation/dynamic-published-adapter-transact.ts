import type {
  PublishedOperation,
  RuntimePublishedOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { RouteTransportRuntime } from '@/modules/capability-supply/route-transport-runtime'
import type { Action } from '@/modules/common/action'
import {
  pricingConfigDigest,
  pricingConfigSchema,
  type MoneyInvocationPort,
} from '@/modules/money/public'

import {
  createDynamicPublishedAction,
  type DynamicPublishedInvocationInput,
  type DynamicPublishedInvocationResult,
} from './dynamic-published-contract'
import {
  executeDynamicPublishedTransport,
  prepareDynamicPublishedTransport,
  type DynamicPublishedExecutionToken,
  type DynamicPublishedPreparedTransport,
} from './dynamic-published-execution'
import {
  requalifyDynamicPublishedSource,
  dynamicPublishedOperationSlot,
  type DynamicPublishedSharedOutcome,
  type DynamicPublishedSourcePort,
  type DynamicPublishedSourceRow,
} from './dynamic-published-source'
import type { DurableActionInvocationPort } from './internal/durable-contracts'
import type { X402PaymentAttemptPort } from './x402-payment-attempt'

export type DynamicPublishedAdapterSemanticClaim = Readonly<{
  kind: 'owner' | 'reuse'
  semanticBaseKey: string
  semanticIdentityDigest: string
  outcome?: DynamicPublishedSharedOutcome
}>

export type DynamicPublishedAdapterRuntime = Readonly<{
  executionTokens: Map<string, DynamicPublishedExecutionToken>
  preparedTransports: Map<string, DynamicPublishedPreparedTransport>
  moneyCharges: Map<string, NonNullable<DynamicPublishedSourceRow['moneyCharge']>>
  semanticClaims: Map<string, DynamicPublishedAdapterSemanticClaim>
}>

export function dynamicPublishedAdapterRuntimeKey(
  invocationRef: string,
  attemptRef: string,
  generation: number,
): string {
  return `${invocationRef}\u0000${attemptRef}\u0000${generation}`
}

export function createDynamicPublishedAdapterTransact(input: Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
  source: DynamicPublishedSourcePort
  runtime: RouteTransportRuntime
  now: () => number
  moneyPort?: MoneyInvocationPort
  paymentAttemptPort: X402PaymentAttemptPort
  durablePort: DurableActionInvocationPort<DynamicPublishedInvocationResult>
  adapterRuntime: DynamicPublishedAdapterRuntime
}>): Action<DynamicPublishedInvocationInput, DynamicPublishedInvocationResult> {
  const { executionTokens, preparedTransports, moneyCharges, semanticClaims } = input.adapterRuntime
  return createDynamicPublishedAction({
    operation: input.operation,
    descriptor: input.descriptor,
    now: input.now,
    preReleaseCheck: async (value, context) => {
      const execution = context.actionInvocationExecution
      if (execution === undefined) return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: input.descriptor.version,
        requestDigest: value.operationKey,
        failureCode: 'published_operation_execution_attribution_missing',
      }
      const key = dynamicPublishedAdapterRuntimeKey(
        execution.invocationRef,
        execution.attemptRef,
        execution.effectGeneration,
      )
      const reason = requalifyDynamicPublishedSource({
        preparedOperation: input.operation,
        descriptor: input.descriptor,
        currentOperation: input.source.current(dynamicPublishedOperationSlot(input.operation)),
        value: value.input,
        now: input.now(),
      })
      if (reason !== undefined) return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: input.descriptor.version,
        requestDigest: value.operationKey,
        failureCode: reason,
      }
      const token = executionTokens.get(key)
      if (token === undefined) return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: input.descriptor.version,
        requestDigest: value.operationKey,
        failureCode: 'published_operation_attempt_not_leased',
      }
      const preparation = await prepareDynamicPublishedTransport({
        operation: input.operation,
        descriptor: input.descriptor,
        invocation: value,
        token,
        runtime: input.runtime,
      })
      if (preparation.kind === 'refused') return preparation.result
      const row = input.source.read(execution.invocationRef)
      if (row === undefined) return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: input.descriptor.version,
        requestDigest: value.operationKey,
        failureCode: 'published_operation_source_missing',
      }
      const persisted = await input.durablePort.readControl(execution.invocationRef)
      const claim = input.source.claimSemanticEffect({
        semanticBaseKey: row.semanticBaseKey,
        semanticIdentityDigest: row.semanticIdentityDigest,
        principalRef: persisted?.control.owner.principalRef ?? '',
        invocationRef: execution.invocationRef,
      })
      if (claim.kind === 'conflict') return {
        kind: 'published_operation_refused',
        sourceDisposition: 'refused',
        operationId: input.operation.operationId,
        operationVersion: input.descriptor.version,
        requestDigest: value.operationKey,
        failureCode: 'semantic_idempotency_conflict',
      }
      const outcome = claim.kind === 'wait' ? await claim.outcome
        : claim.kind === 'reuse' ? claim.outcome
          : undefined
      if (outcome !== undefined) {
        semanticClaims.set(execution.invocationRef, {
          kind: 'reuse',
          semanticBaseKey: row.semanticBaseKey,
          semanticIdentityDigest: row.semanticIdentityDigest,
          outcome,
        })
        if (outcome.observedResolution.state === 'returned') {
          return outcome.observedResolution.result
        }
        return undefined
      }
      semanticClaims.set(execution.invocationRef, {
        kind: 'owner',
        semanticBaseKey: row.semanticBaseKey,
        semanticIdentityDigest: row.semanticIdentityDigest,
      })
      // moneyLedger (authorizeInvocationCharge) is the single durable charging
      // authority for AE-internal per-call billing. Route-transport x402 payment is
      // the external provider-credential path and must never also charge this
      // invocation; the two seams operate on disjoint invocation types by design.
      if (input.moneyPort !== undefined) {
        const principalRef = persisted?.control.owner.principalRef
        if (principalRef === undefined || principalRef.length === 0) {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: input.descriptor.version,
            requestDigest: value.operationKey,
            failureCode: 'billing_identity_missing',
          }
        }
        const parsedPricingConfig = pricingConfigSchema.safeParse(input.operation.pricingConfig)
        if (!parsedPricingConfig.success) {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: input.descriptor.version,
            requestDigest: value.operationKey,
            failureCode: 'pricing_config_invalid',
          }
        }
        const pricingConfig = parsedPricingConfig.data
        const priceDigest = pricingConfigDigest(pricingConfig)
        if (priceDigest !== input.operation.priceDigest) {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: input.descriptor.version,
            requestDigest: value.operationKey,
            failureCode: 'price_changed',
          }
        }
        const existingCharge = row.moneyCharge
        if (existingCharge !== undefined && existingCharge.priceDigest !== input.operation.priceDigest) {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: input.descriptor.version,
            requestDigest: value.operationKey,
            failureCode: 'price_changed',
          }
        }
        const charge = existingCharge === undefined
          ? await input.moneyPort.authorizeInvocationCharge({
              principalId: principalRef,
              operationKey: value.operationKey,
              invocationRef: execution.invocationRef,
              attemptRef: execution.attemptRef,
              effectGeneration: execution.effectGeneration,
              capabilityContractDigest: input.operation.identity.contractDigest,
              businessId: input.operation.identity.businessId,
              offeringRef: input.operation.identity.offeringId,
              pricingConfig,
              priceDigest,
              priceSourceDigest: priceDigest,
              authorityMaximumSpend: pricingConfig.paidAmount,
            })
          : {
              kind: 'accepted' as const,
              chargeState: existingCharge.chargeState,
              amount: existingCharge.amount,
              priceDigest: existingCharge.priceDigest,
              usageRef: existingCharge.usageRef,
              observedAt: existingCharge.observedAt,
              ...(existingCharge.transactionRef === undefined ? {} : { transactionRef: existingCharge.transactionRef }),
            }
        if (charge.kind === 'refused') {
          return {
            kind: 'published_operation_refused',
            sourceDisposition: 'refused',
            operationId: input.operation.operationId,
            operationVersion: input.descriptor.version,
            requestDigest: value.operationKey,
            failureCode: charge.code,
          }
        }
        const moneyCharge = {
          ...(charge.transactionRef === undefined ? {} : { transactionRef: charge.transactionRef }),
          usageRef: charge.usageRef,
          observedAt: charge.observedAt,
          principalId: principalRef,
          chargeState: charge.chargeState,
          amount: charge.amount,
          priceDigest: charge.priceDigest,
        }
        moneyCharges.set(key, moneyCharge)
        input.source.write({ ...row, moneyCharge })
      }
      preparedTransports.set(key, preparation.prepared)
      return undefined
    },
    run: async (value, context) => {
      const execution = context.actionInvocationExecution
      if (execution === undefined) throw new Error('published_operation_execution_attribution_missing')
      const key = dynamicPublishedAdapterRuntimeKey(
        execution.invocationRef,
        execution.attemptRef,
        execution.effectGeneration,
      )
      const token = executionTokens.get(key)
      if (token === undefined) throw new Error('published_operation_attempt_not_leased')
      const claim = semanticClaims.get(execution.invocationRef)
      if (claim?.kind === 'reuse' && claim.outcome !== undefined) {
        if (claim.outcome.observedResolution.state === 'returned') {
          return claim.outcome.observedResolution.result
        }
        throw new Error('published_operation_shared_outcome_uncertain')
      }
      const prepared = preparedTransports.get(key)
      if (prepared === undefined
        || prepared.attemptRef !== token.attemptRef
        || prepared.effectGeneration !== token.effectGeneration) {
        throw new Error('published_operation_transport_not_prepared')
      }
      const charge = moneyCharges.get(key)
      try {
        const result = await executeDynamicPublishedTransport({
          operation: input.operation,
          descriptor: input.descriptor,
          prepared,
          runtime: input.runtime,
          paymentAttemptPort: input.paymentAttemptPort,
          now: input.now,
        })
        if (result.kind === 'published_operation_refused' && charge !== undefined && charge.chargeState === 'paid') {
          if (charge.transactionRef === undefined) throw new Error('published_operation_payment_reconciliation_required:transaction_missing')
          const refund = await input.moneyPort?.refundCharge?.({
            transactionRef: charge.transactionRef,
            principalId: charge.principalId,
            invocationRef: execution.invocationRef,
            attemptRef: execution.attemptRef,
            effectGeneration: execution.effectGeneration,
          })
          if (refund !== undefined && refund.kind === 'refused') {
            throw new Error('published_operation_payment_reconciliation_required:refund_refused')
          }
        }
        return result.kind === 'published_operation_succeeded' && charge !== undefined
          ? {
              ...result,
              usage: {
                usageRef: charge.usageRef,
                observedAt: charge.observedAt,
                chargeState: charge.chargeState,
                amount: charge.amount,
                priceDigest: charge.priceDigest,
                ...(charge.transactionRef === undefined ? {} : { transactionRef: charge.transactionRef }),
              },
            }
          : result
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        const unknown = message.startsWith('published_operation_outcome_unknown:')
          || message.startsWith('published_operation_payment_reconciliation_required:')
        if (unknown && charge !== undefined) {
          if (charge.transactionRef === undefined) throw new Error('published_operation_payment_reconciliation_required:transaction_missing')
          await input.moneyPort?.markChargeOutcomeUnknown?.({
            transactionRef: charge.transactionRef,
            principalId: charge.principalId,
            invocationRef: execution.invocationRef,
            attemptRef: execution.attemptRef,
            effectGeneration: execution.effectGeneration,
          })
        }
        throw error
      }
    },
  })
}
