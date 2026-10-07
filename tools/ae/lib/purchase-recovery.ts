import { AGENT_ACCOUNT_SELF_ROUTE_CONTRACT, agentAccountSelfResultSchema } from '@/modules/agent-access/account.actions'
import { parseCallRef, parseQuoteRef } from '@/modules/capability-execution/call-contracts'
import type { CliOptions } from './args'
import type { PurchaseRecoveryRecord } from './call-recovery-journal'
import { cliContinuation } from './continuation-command'
import { CliFailure, callJson, requireOk } from './output'
import { requireAgentAccessKey } from '../commands/status'

/** Read identity only; credentials and the account response never enter the journal. */
export async function readPurchasePrincipal(options: CliOptions): Promise<{ accountRef: string; principalRef: string }> {
  const apiKey = requireAgentAccessKey('purchase', options)
  const outcome = await callJson(options.baseUrl, AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.path, {
    method: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.method, headers: { Authorization: `Bearer ${apiKey}` },
  })
  const parsed = agentAccountSelfResultSchema.safeParse(requireOk(outcome, 'account status'))
  if (!parsed.success) throw new CliFailure('The gateway returned an invalid Agent identity.', { kind: 'UNAVAILABLE', code: 'account-result-invalid' })
  return { accountRef: parsed.data.accountRef, principalRef: parsed.data.principalRef }
}
export async function requirePurchasePrincipal(record: PurchaseRecoveryRecord, options: CliOptions): Promise<void> {
  const self = await readPurchasePrincipal(options)
  if (self.accountRef !== record.accountRef || self.principalRef !== record.principalRef) {
    throw new CliFailure('This purchase belongs to a different Account or Agent. Reconnect the original Agent before resuming.', {
      kind: 'PERMISSION_DENIED', code: 'purchase-recovery-owner-mismatch',
    })
  }
}
export function purchaseResumeCommand(record: PurchaseRecoveryRecord, options: CliOptions): string {
  return cliContinuation({ ...options, baseUrl: record.origin, baseUrlSource: 'flag' }, ['ae', record.intent === 'plan_run' ? 'plan' : 'procure', 'resume', record.recoveryRef])
}
export function purchaseNextCommand(record: PurchaseRecoveryRecord, options: CliOptions): string {
  return record.intent === 'procure_exact' && record.callRef !== undefined
    ? cliContinuation({ ...options, baseUrl: record.origin, baseUrlSource: 'flag' }, ['ae', 'status', record.callRef])
    : purchaseResumeCommand(record, options)
}
export function purchaseRecoveryRequired(record: PurchaseRecoveryRecord, options: CliOptions): CliFailure {
  return new CliFailure('This request already has a retained purchase. Check it before creating another purchase.', {
    kind: 'FAILED_PRECONDITION', code: 'purchase-recovery-required',
    detail: { recoveryRef: record.recoveryRef, identityPreserved: true }, nextCommand: purchaseResumeCommand(record, options),
  })
}
export function attachPurchaseRecovery(error: unknown, record: PurchaseRecoveryRecord, options: CliOptions): CliFailure {
  const failure = error instanceof CliFailure ? error : undefined
  return new CliFailure(failure?.message ?? 'Purchase transport is unknown. Resume the retained purchase.', {
    kind: failure?.kind ?? 'UNAVAILABLE', code: failure?.code ?? 'purchase-transport-unknown',
    ...(failure === undefined ? {} : {
      exitCode: failure.exitCode,
      ...(failure.status === undefined ? {} : { status: failure.status }),
      ...(failure.requestId === undefined ? {} : { requestId: failure.requestId }),
      ...(failure.retryable === undefined ? {} : { retryable: failure.retryable }),
      ...(failure.retryAfter === undefined ? {} : { retryAfter: failure.retryAfter }),
      ...(failure.suggestion === undefined ? {} : { suggestion: failure.suggestion }),
    }),
    detail: { recoveryRef: record.recoveryRef, identityPreserved: true,
      ...(record.intent === 'plan_run' ? { planRef: record.command.planRef } : {
        toolRef: record.command.toolRef, ...(record.quoteRef === undefined || parseQuoteRef(record.quoteRef).kind !== 'valid' ? {} : { quoteRef: record.quoteRef }),
        ...(record.callRef === undefined || parseCallRef(record.callRef).kind !== 'valid' ? {} : { callRef: record.callRef }),
      }), ...(failure?.detail === undefined ? {} : { cause: failure.detail }) },
    nextCommand: purchaseNextCommand(record, options),
  })
}
