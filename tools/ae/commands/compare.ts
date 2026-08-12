import {
  operationCompareInputSchema,
  operationCompareOutputSchema,
} from '@/modules/capability-supply/public'
import { OPERATION_MARKET_COMPARE_PATH } from '@/modules/registry/operation-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'

/** Compare exact current Operation references through the anonymous market route. */
export async function runCompareCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length < 2 || args.length > 4) {
    throw new CliFailure('Usage: npm run -s ae -- compare <operation-ref> <operation-ref> [operation-ref ...]', {
      kind: 'INVALID_ARGUMENT',
      code: 'compare-usage',
    })
  }

  const parsedInput = operationCompareInputSchema.safeParse({
    operationRefs: args.map((arg) => arg.trim()),
  })
  if (!parsedInput.success) {
    throw new CliFailure('Compare requires two to four exact operation references.', {
      kind: 'INVALID_ARGUMENT',
      code: 'compare-input',
    })
  }

  const path = OPERATION_MARKET_COMPARE_PATH
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify(parsedInput.data),
  })
  const parsedResult = operationCompareOutputSchema.safeParse(requireOk(outcome, path))
  if (!parsedResult.success) {
    throw new CliFailure('The market returned an invalid operation comparison result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-compare-result-invalid',
    })
  }

  if (options.json) {
    printJson(parsedResult.data)
    return
  }

  heading(`Operation comparison (${parsedInput.data.operationRefs.length} exact references)`)
  line(JSON.stringify(parsedResult.data, undefined, 2))
}
