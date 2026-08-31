import {
  operationDetailInputSchema,
  operationDetailOutputSchema,
} from '@/modules/capability-supply/public'
import {
  AGENT_ACCOUNT_SELF_ROUTE_CONTRACT,
  agentAccountSelfResultSchema,
} from '@/modules/agent-access/account.actions'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'

import type { CliOptions } from '../lib/args'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { usageFailure } from '../lib/help'
import { OPERATION_MARKET_DETAIL_PATH } from '@/modules/registry/operation-entry'
import {
  formatOperationAuthentication,
  formatOperationAvailability,
  formatOperationInputs,
  formatOperationPaymentNetwork,
  formatOperationTotalPrice,
  formatOperationVerification,
  operationLabel,
} from '../lib/operation-format'
import { throwOperationReadFailure } from '../lib/operation-read-failure'
import { resolveAgentAccessCredential } from '../lib/config'
import { operationContinuationForCli } from '../lib/suggested-continuation-adapter'
import { continuationCommand } from '../lib/continuation-command'
/** Read one exact current Market Operation without a caller credential. */
export async function runInspectCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const operationRef = args[0]?.trim()
  if (operationRef === undefined || operationRef.length === 0 || args.length > 1) {
    throw usageFailure('inspect', 'inspect-usage')
  }
  const parsedInput = inspectCommandDescriptor.inputSchema.safeParse({ operationRef })
  if (!parsedInput.success) {
    throw new CliFailure('Operation reference must match operation:v1:<64 lowercase hex characters>.', {
      kind: 'INVALID_ARGUMENT',
      code: 'operation-ref-invalid',
    })
  }

  const path = inspectCommandDescriptor.path
  const outcome = await callJson(options.baseUrl, path, {
    method: 'POST',
    body: JSON.stringify(parsedInput.data),
  })
  const parsedResult = inspectCommandDescriptor.outputSchema.safeParse(requireOk(outcome, path))
  if (!parsedResult.success) {
    throw new CliFailure('The market returned an invalid operation detail result.', {
      kind: 'UNAVAILABLE',
      code: 'operation-detail-result-invalid',
    })
  }

  const result = parsedResult.data
  if (result.kind === 'not_found') {
    throwOperationReadFailure({ reason: 'operation_not_found' })
  }
  if (result.kind === 'unavailable') {
    throwOperationReadFailure({ reason: result.reason })
  }
  const operation = result.operation
  const invokeNavigation = operation.navigation.find(({ relation }) => relation === 'invoke')
  const callable = operation.availability.posture === 'routeable' && invokeNavigation !== undefined
  // The installed CLI calls the brokered invoke route, whose canonical
  // contract requires buyer access even when the upstream provider is public.
  const requiresBuyerCredential = invokeNavigation !== undefined
  const hasBuyerCredential = requiresBuyerCredential
    ? await hasCurrentBuyerInvokeCredential(options.baseUrl)
    : false
  const continuation = operationContinuationForCli({
    operationRef: operation.operationRef,
    searchQuery: operation.summary,
    availabilityPosture: operation.availability.posture === 'routeable' && !callable
      ? 'setup_required'
      : operation.availability.posture,
    requiresBuyerCredential,
    hasBuyerCredential,
  })
  const originContinuation = options.baseUrlSource === undefined || options.baseUrlSource === 'hosted_default'
    ? []
    : ['--base-url', options.baseUrl]
  const outputContinuation = options.json ? ['--json'] : []
  const technicalContinuation = options.technical
    && continuation.command?.startsWith('ae search ') === true
    ? ['--technical']
    : []
  const continuationSuffix = continuationCommand([
    ...originContinuation,
    ...outputContinuation,
    ...technicalContinuation,
  ])
  const inputExample = operation.contract.inputExamples?.[0]?.input
  const callCommand = callable
    ? continuationCommand([
        'ae', 'call', operation.operationRef,
        '--input', inputExample === undefined ? '<json>' : JSON.stringify(inputExample),
        ...originContinuation,
        ...outputContinuation,
      ])
    : undefined
  const nextCommand = continuation.kind === 'copy_command' && callCommand !== undefined
    ? callCommand
    : continuation.command === undefined
      ? undefined
      : continuationSuffix.length === 0
        ? continuation.command
        : `${continuation.command} ${continuationSuffix}`
  const renderedContinuation = nextCommand === undefined
    ? continuation
    : { ...continuation, command: nextCommand }

  if (options.json) {
    const jsonResult = options.technical
      ? result
      : {
          ...result,
          operation: withoutNavigation(operation),
        }
    printJson({
      ...jsonResult,
      continuation: renderedContinuation,
      ...(nextCommand === undefined ? {} : { nextCommand }),
      ...(callCommand === undefined ? {} : { callCommand }),
    })
    return
  }

  heading(`Market Operation ${operationRef} (${outcome.durationMs}ms)`)
  line(`  ${operationLabel(operation)}`)
  line(`  ${operation.summary}`)
  line('')
  line(`  provider: ${operation.business.name}`)
  line(`  availability: ${formatOperationAvailability(operation.availability)}`)
  line(`  total price: ${formatOperationTotalPrice(operation)}`)
  line(`  authentication: ${formatOperationAuthentication(operation)}`)
  line(`  payment network: ${formatOperationPaymentNetwork(operation)}`)
  line(`  last verified: ${formatOperationVerification(operation)}`)
  line(`  inputs: ${formatOperationInputs(operation)}`)
  line(
    `  effects: ${operation.effects.length === 0
      ? 'none'
      : operation.effects.map((effect) => effect.class.replace(/_/gu, ' ')).join(', ')}`,
  )
  line(`  next: ${nextCommand ?? continuation.label}`)
  if (callCommand !== undefined && callCommand !== nextCommand) {
    line(`  after authorization: ${callCommand}`)
  }
  if (callCommand !== undefined) {
    line('  safeguard: AE rechecks the current total price and buyer authority before dispatch.')
  }
  if (continuation.warning !== undefined) line(`  warning: ${continuation.warning}`)
  if (operation.contract.inputExamples?.[0] !== undefined) {
    line(`  example input: ${JSON.stringify(operation.contract.inputExamples[0].input)}`)
  }
}

function withoutNavigation<T extends Readonly<{ navigation: unknown }>>(
  operation: T,
): Omit<T, 'navigation'> {
  const { navigation: _navigation, ...compact } = operation
  return compact
}

async function hasCurrentBuyerInvokeCredential(baseUrl: string): Promise<boolean> {
  const credential = resolveAgentAccessCredential(baseUrl, MARKET_OPERATIONS_INVOKE_SCOPE)
  if (credential === undefined) return false
  const configuredOrigin = credential.origin.trim()
  if (configuredOrigin !== '' && configuredOrigin !== new URL(baseUrl).origin) return false
  try {
    const outcome = await callJson(baseUrl, AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.path, {
      method: AGENT_ACCOUNT_SELF_ROUTE_CONTRACT.method,
      headers: { Authorization: `Bearer ${credential.accessToken}` },
    })
    if (!outcome.ok) return false
    const account = agentAccountSelfResultSchema.safeParse(outcome.body)
    return account.success && account.data.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
  } catch {
    return false
  }
}

export const inspectCommandDescriptor = {
  command: 'inspect',
  actionId: 'registry.operations.detail',
  path: OPERATION_MARKET_DETAIL_PATH,
  inputSchema: operationDetailInputSchema,
  outputSchema: operationDetailOutputSchema,
  run: runInspectCommand,
} as const
