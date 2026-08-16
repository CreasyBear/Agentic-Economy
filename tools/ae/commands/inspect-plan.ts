import {
  operationInspectPlanInputSchema,
  operationInspectPlanOutputSchema,
} from '@/modules/capability-supply/public'
import { formatCurrencyAmount } from '@/modules/money/public'
import { OPERATION_MARKET_INSPECT_PLAN_PATH } from '@/modules/registry/operation-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { throwOperationReadFailure } from '../lib/operation-read-failure'

/** Inspect a bounded composition of exact current Operation references anonymously. */
export async function runInspectPlanCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length < 1 || args.length > 4) {
    throw new CliFailure('Usage: npm run -s ae -- inspect-plan <operation-ref> [operation-ref ...]', {
      kind: 'INVALID_ARGUMENT',
      code: 'inspect-plan-usage',
    })
  }

  const parsedInput = operationInspectPlanInputSchema.safeParse({
    operationRefs: args.map((arg) => arg.trim()),
  })
  if (!parsedInput.success) {
    throw new CliFailure('Inspect-plan requires one to four exact operation references.', {
      kind: 'INVALID_ARGUMENT',
      code: 'inspect-plan-input',
    })
  }

  const path = OPERATION_MARKET_INSPECT_PLAN_PATH
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify(parsedInput.data),
  })
  const parsedResult = operationInspectPlanOutputSchema.safeParse(requireOk(outcome, path))
  if (!parsedResult.success) {
    throw new CliFailure('The market returned an invalid operation inspection plan result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-inspect-plan-result-invalid',
    })
  }

  const result = parsedResult.data
  if (result.kind === 'unavailable') {
    throwOperationReadFailure({ reason: result.reason })
  }
  if (options.json) {
    printJson(result)
    return
  }
  heading(`Operation plan inspection (${parsedInput.data.operationRefs.length} exact references)`)
  line(`  operations: ${result.operationRefs.length}`)
  for (const operationRef of result.operationRefs) {
    line(`    ${operationRef}`)
  }
  line(
    `  maximum cost: ${result.summary.maximumCost.kind === 'known'
      ? formatCurrencyAmount(result.summary.maximumCost.amount)
      : 'requires preparation'}`,
  )
  line(
    `  data use: ${result.summary.dataUse.length === 0
      ? 'none'
      : [...new Set(result.summary.dataUse.map((entry) => entry.classification))].join(', ')}`,
  )
  line(
    `  effects: ${result.summary.effects.length === 0
      ? 'none'
      : [...new Set(result.summary.effects.map((entry) => entry.class.replace(/_/gu, ' ')))].join(', ')}`,
  )
  line(`  expires: ${new Date(result.summary.expiry).toISOString()}`)
  line('  This is a read-only aggregate preview, not an execution handoff.')
}
