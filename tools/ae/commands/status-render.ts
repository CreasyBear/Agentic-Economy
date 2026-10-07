import { isRecord } from '@/modules/common/is-record'
import type { CliOptions } from '../lib/args'
import { heading, line, printJson, table } from '../lib/output'
import { journeyNextCommand } from '../lib/journey-next-command'

/** A refused status is a failure like every other refusal, so it must not exit 0. */
export const STATUS_REFUSED_EXIT_CODE = 1

export function renderStatusResult(
  title: string,
  callRef: string,
  body: unknown,
  options: CliOptions,
): number {
  const record = isRecord(body) ? body : undefined
  const nextCommand = record !== undefined && Array.isArray(record.next)
    ? journeyNextCommand(record.next[0], options) : undefined
  const exitCode = record?.kind === 'refused' ? STATUS_REFUSED_EXIT_CODE : 0
  if (options.json) {
    printJson(record === undefined || nextCommand === undefined
      ? body
      : {
          ...record,
          nextCommand,
        })
    return exitCode
  }
  heading(`${title} ${callRef}`)
  table([
    ['status', typeof record?.state === 'string' ? record.state : typeof record?.kind === 'string' ? record.kind : 'unknown'],
    ['tool', typeof record?.toolRef === 'string' ? record.toolRef : 'unknown'],
  ])
  if (nextCommand !== undefined) line(`  next: ${nextCommand}`)
  line(JSON.stringify(body, undefined, 2))
  return exitCode
}
