import { isRecord } from '@/modules/common/is-record'
import { callStatusStateSchema } from '@/modules/capability-execution/call-recovery-contracts'
import type { CliOptions } from '../lib/args'
import { heading, line, printJson, table } from '../lib/output'
import { continuationCommand, continuationFlags } from '../lib/continuation-command'
import { creditContinuationForCli, callNextActionForCli } from '../lib/suggested-continuation-adapter'

type StatusContinuation = Readonly<{ command?: string; warning?: string }>

/** A refused status is a failure like every other refusal, so it must not exit 0. */
export const STATUS_REFUSED_EXIT_CODE = 1

export function renderStatusResult(
  title: string,
  callRef: string,
  body: unknown,
  options: CliOptions,
): number {
  const record = isRecord(body) ? body : undefined
  let continuation: StatusContinuation | undefined
  if (record?.kind === 'found' || record?.kind === 'refused') {
    const parsedState = callStatusStateSchema.safeParse(record.state)
    const usage = isRecord(record.usage) ? record.usage : undefined
    continuation = record.code === 'invocation_not_found'
      // An unknown Call cannot become known by asking again for it.
      ? { command: 'ae history' }
      : usage?.chargeState === 'insufficient_credit'
        ? creditContinuationForCli()
        : callNextActionForCli({
            kind: record.kind,
            callRef,
            ...(parsedState.success ? { state: parsedState.data } : {}),
            ...(typeof record.retryable === 'boolean' ? { retryable: record.retryable } : {}),
          })
  }
  const continuationSuffix = continuationCommand(continuationFlags(options))
  const nextCommand = continuation?.command === undefined
    ? undefined
    : continuationSuffix.length === 0
      ? continuation.command
      : `${continuation.command} ${continuationSuffix}`
  const warning = continuation?.warning
  const exitCode = record?.kind === 'refused' ? STATUS_REFUSED_EXIT_CODE : 0
  if (options.json) {
    printJson(record === undefined || nextCommand === undefined
      ? body
      : {
          ...record,
          nextCommand,
          ...(warning === undefined ? {} : { warning }),
        })
    return exitCode
  }
  heading(`${title} ${callRef}`)
  table([
    ['status', typeof record?.state === 'string' ? record.state : typeof record?.kind === 'string' ? record.kind : 'unknown'],
    ['tool', typeof record?.toolRef === 'string' ? record.toolRef : 'unknown'],
  ])
  if (nextCommand !== undefined) line(`  next: ${nextCommand}`)
  if (continuation?.warning !== undefined) line(`  warning: ${continuation.warning}`)
  line(JSON.stringify(body, undefined, 2))
  return exitCode
}
