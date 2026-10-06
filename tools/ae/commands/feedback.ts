import { feedbackSubmitAction, FEEDBACK_ROUTE_CONTRACT } from '@/modules/actions/feedback.actions'
import { isObservabilityDisabled, isProductAnalyticsDisabled } from '@/lib/observability/config'
import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'

import type { CliOptions } from '../lib/args'
import { usageFailure } from '../lib/help'
import { callJson, CliFailure, line, printJson, requireOk } from '../lib/output'
import { requireAgentAccessKey } from './status'

export const feedbackCommandDescriptor = {
  actionId: FEEDBACK_ROUTE_CONTRACT.actionId, command: 'feedback',
  method: FEEDBACK_ROUTE_CONTRACT.method, path: FEEDBACK_ROUTE_CONTRACT.path,
} as const

export async function runFeedbackCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const input = feedbackSubmitAction.schema.safeParse({ message: args[0] })
  if (args.length !== 1 || !input.success) throw usageFailure('feedback', 'feedback-input-invalid')
  if (isProductAnalyticsDisabled(process.env) || isObservabilityDisabled(process.env)) {
    throw new CliFailure('Product feedback is disabled. Skip feedback and continue your task.', {
      kind: 'FAILED_PRECONDITION', code: 'feedback_disabled', retryable: false,
    })
  }
  let key: string
  try {
    key = requireAgentAccessKey('feedback', options)
  } catch (error) {
    if (!(error instanceof CliFailure) || error.code !== 'agent_access_key_required') throw error
    key = requireAgentAccessKey('feedback', options, MARKET_SUPPLY_MANAGE_SCOPE)
  }
  let outcome
  try {
    outcome = await callJson(options.baseUrl, feedbackCommandDescriptor.path, {
      method: feedbackCommandDescriptor.method,
      headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(input.data),
    })
  } catch (error) {
    if (!(error instanceof TypeError) && !(error instanceof CliFailure && error.code === 'request-timeout')) throw error
    throw new CliFailure('Feedback ingestion was not confirmed. Do not automatically retry; continue your task.', {
      kind: 'UNAVAILABLE', code: 'feedback_unavailable', retryable: false,
    })
  }
  const parsed = feedbackSubmitAction.outputSchema.safeParse(requireOk(outcome, feedbackCommandDescriptor.path))
  if (!parsed.success || parsed.data.kind !== 'accepted') {
    throw new CliFailure('Feedback ingestion was not confirmed. Do not automatically retry; continue your task.', {
      kind: 'UNAVAILABLE', code: 'feedback_unavailable', retryable: false,
    })
  }
  if (options.json) printJson(parsed.data)
  else line('Feedback sent to the Agentic Economy team.')
}
