import type { ActionExecutionOrigin, ExecutionActor } from '../../../../src/modules/action-execution'
import type {
  DevelopmentProviderToolCancellationInput,
  DevelopmentProviderToolInput,
} from './development-provider-tool.actions'
import type { DevelopmentAvailabilityObservation } from './development-provider-tool-provider'

export const developmentProviderToolNowMs = Date.parse('2026-07-19T04:00:00.000Z')
export const developmentProviderToolNow = () => new Date(developmentProviderToolNowMs).toISOString()

export function providerToolActor(origin: ActionExecutionOrigin): ExecutionActor {
  return origin.kind === 'standalone'
    ? { callerRef: origin.callerRef, principalRef: origin.principalRef }
    : { callerRef: `request:${origin.requestRef}`, principalRef: `request-owner:${origin.requestRef}` }
}

export function providerToolInput(
  slot: DevelopmentAvailabilityObservation,
  principalRef: string,
  operationKey: string,
  email = 'development@example.test',
): DevelopmentProviderToolInput {
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
}>): DevelopmentProviderToolCancellationInput {
  return {
    environment: 'MOCK/DEVELOPMENT ONLY',
    effectRef: input.effectRef,
    providerRef: input.providerRef,
    principalRef: input.principalRef,
    reason: input.reason ?? 'Development customer requested cancellation.',
    operationKey: input.operationKey,
  }
}
