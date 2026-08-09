import type { CliOptions } from '../lib/args'
import { isRecord } from '@/modules/common/is-record'
import { CliFailure, callJson, heading, line, printJson, requireOk } from '../lib/output'
import { printDraftOutcome } from './import'

/**
 * POST /api/storefront/enrich is Clerk gated because it spends model budget.
 * Against a plain local server expect 401; see tools/ae/README.md for the
 * local bypass env var.
 */
export async function runEnrichCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const businessName = args.join(' ').trim()
  if (businessName.length === 0) throw new CliFailure('Usage: ae enrich "<business name>" [--suburb X]', { kind: 'INVALID_ARGUMENT', code: 'enrich-usage' })

  const outcome = await callJson(options.baseUrl, '/api/storefront/enrich', {
    method: 'POST',
    body: JSON.stringify({
      businessName,
      ...(options.suburb === undefined ? {} : { suburb: options.suburb }),
    }),
  })
  // Non-2xx (e.g. the 401 this route returns when not signed in) throws a typed
  // CliFailure with exit 1 instead of being printed as a successful body.
  const body = requireOk(outcome, '/api/storefront/enrich')

  if (options.json) {
    printJson({ status: outcome.status, body })
    return
  }

  heading(`Gather public details for "${businessName}" (${outcome.status}, ${outcome.durationMs}ms)`)

  if (isRecord(body) && body.kind === 'unavailable') {
    line('Enrichment is not configured on this server (no OPENROUTER_API_KEY).')
    return
  }

  printDraftOutcome(body, outcome.bodyText)
  line('')
  line('These facts are unconfirmed until the owner reviews and submits them.')
}
