import type { ActionInvocationOrigin, InvocationActor } from '../../../../src/modules/action-invocation'
import type {
  DevelopmentProviderOperationCancellationInput,
  DevelopmentProviderOperationInput,
} from './development-provider-operation.actions'
import type { DevelopmentAvailabilityObservation } from './development-provider-operation-provider'

export const developmentProviderOperationNowMs = Date.parse('2026-07-19T04:00:00.000Z')
export const developmentProviderOperationNow = () => new Date(developmentProviderOperationNowMs).toISOString()

export function providerOperationActor(origin: ActionInvocationOrigin): InvocationActor {
  return origin.kind === 'standalone'
    ? { callerRef: origin.callerRef, principalRef: origin.principalRef }
    : { callerRef: `request:${origin.requestRef}`, principalRef: `request-owner:${origin.requestRef}` }
}

export function providerOperationInput(
  slot: DevelopmentAvailabilityObservation,
  principalRef: string,
  operationKey: string,
  email = 'development@example.test',
): DevelopmentProviderOperationInput {
  return {
    environment: 'MOCK/DEVELOPMENT ONLY',
    slot,
    customer: { principalRef, name: 'Development Customer', email },
    disclosure: {
      fields: ['customer.name', 'customer.email'],
      recipient: slot.providerRef,
      purpose: 'create_development_effect',
    },
    operationKey,
  }
}

export function cancellationInput(input: Readonly<{
  effectRef: string
  providerRef: string
  principalRef: string
  operationKey: string
  reason?: string
}>): DevelopmentProviderOperationCancellationInput {
  return {
    environment: 'MOCK/DEVELOPMENT ONLY',
    effectRef: input.effectRef,
    providerRef: input.providerRef,
    principalRef: input.principalRef,
    reason: input.reason ?? 'Development customer requested cancellation.',
    operationKey: input.operationKey,
  }
}
