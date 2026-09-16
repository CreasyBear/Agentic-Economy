import { isRecord } from '@/modules/common/is-record'
import type { CallMachineResult } from '@/modules/capability-execution/call-contracts'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { GatewayTelemetryEvent } from '@/lib/server/gateway-telemetry'

export function gatewayTelemetryForResult(
  result: CallMachineResult,
): Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'> {
  if (result.kind === 'completed') {
    return {
      operationRef: result.toolRef,
      pricing: result.usage.chargeState === 'free_tier'
        ? 'free'
        : result.usage.chargeState === 'paid'
          ? 'paid'
          : 'unknown',
      costUnits: result.usage.amount.units,
      outcome: 'completed',
      ...(result.usage.chargeState === 'outcome_unknown' ? { unknown: true } : {}),
    }
  }
  if (result.kind === 'pending') {
    return { operationRef: result.toolRef, outcome: 'pending' }
  }
  if (result.kind === 'outcome_unknown') {
    return { operationRef: result.toolRef, outcome: 'reconciliation_required', unknown: true }
  }
  const code = result.code
  return {
    ...(result.toolRef === undefined ? {} : { operationRef: result.toolRef }),
    outcome: 'refused',
    refusalCode: code,
    retryable: result.retryable,
    ...(code === 'outcome_unknown' ? { unknown: true } : {}),
    ...(code === 'authority_required' ? { approval: 'required' as const } : {}),
    ...(code === 'rate_limited' ? { rateLimited: true } : {}),
    ...(code === 'concurrency_limited' ? { concurrencyLimited: true } : {}),
  }
}

export function principalTelemetry(
  principal: AgentAccessPrincipal,
): Pick<GatewayTelemetryEvent, 'credentialId' | 'principalId' | 'applicationRef'> {
  return {
    credentialId: principal.credentialId,
    principalId: principal.principalId,
    applicationRef: principal.applicationRef,
  }
}

export function recoveryTelemetryForResult(
  result: unknown,
  callRef: string,
): Omit<GatewayTelemetryEvent, 'correlationId' | 'durationMs'> {
  if (!isRecord(result)) return { invocationRef: callRef, outcome: 'failed', refusalCode: 'result_invalid' }
  const operationRef = typeof result.toolRef === 'string' ? result.toolRef : undefined
  if (result.kind === 'reconciliation_required') {
    return {
      invocationRef: callRef,
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'reconciliation_required',
      unknown: true,
    }
  }
  if (result.kind === 'refused') {
    const code = typeof result.code === 'string' ? result.code : 'call_failed'
    return {
      invocationRef: callRef,
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: 'refused',
      refusalCode: code,
      ...(typeof result.retryable === 'boolean' ? { retryable: result.retryable } : {}),
      ...(code === 'outcome_unknown' ? { unknown: true } : {}),
    }
  }
  if (result.kind === 'found') {
    const state = result.state
    return {
      invocationRef: callRef,
      ...(operationRef === undefined ? {} : { operationRef }),
      outcome: state === 'cancelled'
        ? 'cancelled'
        : state === 'reconciliation_required'
          ? 'reconciliation_required'
          : state === 'terminal'
            ? 'completed'
            : 'pending',
    }
  }
  return { invocationRef: callRef, outcome: 'failed', refusalCode: 'result_invalid' }
}

export function gatewayDetail(code: string): string {
  switch (code) {
    case 'authentication_required':
      return 'Authentication required.'
    case 'authority_denied':
      return 'The tool was declined by the owner.'
    case 'scope_required':
      return 'The provided API key does not carry the required scope.'
    case 'source_unavailable':
    case 'call_runtime_unavailable':
    case 'call_unavailable':
    case 'tool_quote_unavailable':
      return 'The Call service is temporarily unavailable.'
    case 'result_invalid':
    case 'call_result_invalid':
      return 'The Call service returned an invalid result.'
    case 'call_not_found':
      return 'The Call was not found.'
    default:
      return 'The Call request could not be completed.'
  }
}
