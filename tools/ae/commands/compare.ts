import {
  operationCompareInputSchema,
  operationCompareOutputSchema,
  type OperationCompareResult,
} from '@/modules/capability-supply/public'
import { isRecord } from '@/modules/common/is-record'
import { OPERATION_MARKET_COMPARE_PATH } from '@/modules/registry/operation-entry'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import {
  formatOperationAvailability,
  formatOperationPrice,
  operationLabel,
} from '../lib/operation-format'
import { throwOperationReadFailure } from '../lib/operation-read-failure'

const FACT_LABELS: Record<string, string> = {
  summary: 'Summary',
  price: 'Price',
  effects: 'Effects',
  dataUse: 'Data use',
  availability: 'Availability',
  provenance: 'Provenance',
  recovery: 'Recovery',
}

/** Compare exact current Operation references through the anonymous market route. */
export async function runCompareCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length < 1 || args.length > 4) {
    throw new CliFailure('Usage: npm run -s ae -- compare <operation-ref> [operation-ref ...]', {
      kind: 'INVALID_ARGUMENT',
      code: 'compare-usage',
    })
  }

  const parsedInput = compareCommandDescriptor.inputSchema.safeParse({
    operationRefs: args.map((arg) => arg.trim()),
  })
  if (!parsedInput.success) {
    throw new CliFailure('Compare requires one to four exact operation references.', {
      kind: 'INVALID_ARGUMENT',
      code: 'compare-input',
    })
  }

  const path = compareCommandDescriptor.path
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify(parsedInput.data),
  })
  const parsedResult = compareCommandDescriptor.outputSchema.safeParse(requireOk(outcome, path))
  if (!parsedResult.success) {
    throw new CliFailure('The market returned an invalid operation comparison result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-compare-result-invalid',
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

  printHumanComparison(result, parsedInput.data.operationRefs.length, options.technical === true)
}

type AvailableComparison = Extract<OperationCompareResult, { kind: 'ok' }>

function printHumanComparison(result: AvailableComparison, requestedCount: number, technical: boolean): void {
  heading(`Operation comparison (${requestedCount} exact references)`)
  const operationsByRef = new Map(result.operations.map((operation) => [operation.operationRef, operation]))
  line('  operations:')
  for (const [index, operation] of result.operations.entries()) {
    line(`    ${index + 1}. ${operationLabel(operation)}`)
    line(`       ${operation.summary}`)
    line(`       price: ${formatOperationPrice(operation.commercial.price)}`)
    line(`       availability: ${formatOperationAvailability(operation.availability)}`)
  }
  if (result.facts.length > 0) {
    line('  facts:')
    for (const fact of result.facts) {
      line(`    ${FACT_LABELS[fact.field] ?? fact.field}:`)
      for (const value of fact.values) {
        const operation = operationsByRef.get(value.operationRef)
        const label = operation === undefined ? value.operationRef : operationLabel(operation)
        line(`      ${label}: ${formatComparisonValue(fact.field, value.value)}`)
      }
    }
  }
  if (technical) printTechnicalComparison(result)
}

function printTechnicalComparison(result: AvailableComparison): void {
  line('  technical:')
  line(`    schema: ${result.schemaVersion}`)
  line(`    navigation: ${JSON.stringify(result.navigation)}`)
  for (const operation of result.operations) {
    line(`    ${operation.operationRef} · operationId=${operation.operationId} · capability=${operation.contract.capabilityId}@v${operation.contract.version}`)
  }
  for (const fact of result.facts) {
    for (const value of fact.values) {
      const observedAt = value.observedAt === undefined ? '' : ` observedAt=${value.observedAt}`
      const validUntil = value.validUntil === undefined ? '' : ` validUntil=${value.validUntil}`
      line(`    fact=${fact.field} ref=${value.operationRef} source=${value.source}${observedAt}${validUntil}`)
    }
  }
}

function formatComparisonValue(field: string, value: unknown): string {
  if (field === 'price') return formatOperationPrice(value)
  if (field === 'availability') return formatOperationAvailability(value)
  if (field === 'provenance' && isRecord(value)) {
    return [value.publisher, value.sourceKind].filter((part): part is string => typeof part === 'string').join(' via ')
  }
  if (field === 'recovery' && isRecord(value)) {
    return `${String(value.recovery).replace(/_/gu, ' ')} (idempotency ${String(value.idempotency).replace(/_/gu, ' ')})`
  }
  if (field === 'effects' || field === 'dataUse') {
    if (!Array.isArray(value) || value.length === 0) return 'none'
    return value.map((entry) => {
      if (!isRecord(entry)) return String(entry)
      const primary = field === 'effects' ? entry.class : entry.classification
      const secondary = field === 'effects' ? entry.authority : entry.phase
      return [primary, secondary].filter((part): part is string => typeof part === 'string')
        .map((part) => part.replace(/_/gu, ' ')).join(' · ')
    }).join(', ')
  }
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export const compareCommandDescriptor = {
  command: 'compare',
  actionId: 'registry.operations.compare',
  path: OPERATION_MARKET_COMPARE_PATH,
  inputSchema: operationCompareInputSchema,
  outputSchema: operationCompareOutputSchema,
  run: runCompareCommand,
} as const
