import type { CliOptions } from '../lib/args'
import { isRecord } from '@/modules/common/is-record'
import { CliFailure, callJson, heading, line, printJson, table } from '../lib/output'

/**
 * The API also accepts an optional `abn`, deliberately not exposed here:
 * registry-number autofill was ruled a gimmick for the owner-facing flow.
 */
export async function runImportCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const websiteUrl = args[0]?.trim()
  if (websiteUrl === undefined || websiteUrl.length === 0) throw new CliFailure('Usage: ae import <websiteUrl>')

  const outcome = await callJson(options.baseUrl, '/api/storefront/import-draft', {
    method: 'POST',
    body: JSON.stringify({ websiteUrl }),
  })

  if (options.json) {
    printJson({ status: outcome.status, body: outcome.body ?? outcome.bodyText })
    return
  }

  heading(`Import draft from ${websiteUrl} (${outcome.status}, ${outcome.durationMs}ms)`)
  printDraftOutcome(outcome.body, outcome.bodyText)
}

export function printDraftOutcome(body: unknown, bodyText: string): void {
  if (!isRecord(body)) {
    line(bodyText.slice(0, 600))
    return
  }

  if (body.kind === 'error') {
    line(`Refused: ${String(body.code ?? 'unknown')} (retryable=${String(body.retryable ?? false)})`)
    line(String(body.reason ?? ''))
    return
  }

  if (body.kind === 'unavailable') {
    line(`Not configured on this server: ${String(body.reason ?? '')}`)
    return
  }

  const draft = isRecord(body.draft) ? body.draft : undefined
  if (draft === undefined) {
    line(bodyText.slice(0, 600))
    return
  }

  const source = isRecord(draft.source) ? draft.source : {}
  line(`status: ${String(draft.status ?? '')}   source: ${String(source.label ?? '')} (${String(source.kind ?? '')})`)
  line('')

  const facts = Array.isArray(draft.facts) ? draft.facts : []
  line(`Drafted facts: ${facts.length}`)
  for (const fact of facts) {
    if (!isRecord(fact)) continue
    table([
      [String(fact.label ?? fact.field ?? ''), String(fact.value ?? '')],
      ['  from', `${String(fact.sourceLabel ?? '')} ${String(fact.evidenceRef ?? '')}`.trim()],
    ])
  }

  line('')
  line(String(draft.boundaryStatement ?? 'Unconfirmed until owner review.'))
}
