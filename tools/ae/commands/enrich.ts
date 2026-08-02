import type { CliOptions } from '../lib/args'
import { isRecord } from '@/modules/common/is-record'
import { CliFailure, callJson, heading, line, printJson } from '../lib/output'
import { printDraftOutcome } from './import'

/**
 * POST /api/storefront/enrich is Clerk gated because it spends model budget.
 * Against a plain local server expect 401; see tools/ae/README.md for the
 * local bypass env var.
 */
export async function runEnrichCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const businessName = args.join(' ').trim()
  if (businessName.length === 0) throw new CliFailure('Usage: ae enrich "<business name>" [--suburb X]')

  const outcome = await callJson(options.baseUrl, '/api/storefront/enrich', {
    method: 'POST',
    body: JSON.stringify({
      businessName,
      ...(options.suburb === undefined ? {} : { suburb: options.suburb }),
    }),
  })

  if (options.json) {
    printJson({ status: outcome.status, body: outcome.body ?? outcome.bodyText })
    return
  }

  heading(`Gather public details for "${businessName}" (${outcome.status}, ${outcome.durationMs}ms)`)

  if (outcome.status === 401) {
    line('Sign in required. This route spends model budget, so it is never open.')
    line('For local testing set VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true (never in production).')
    line(outcome.bodyText.slice(0, 400))
    return
  }

  if (isRecord(outcome.body) && outcome.body.kind === 'unavailable') {
    line('Enrichment is not configured on this server (no OPENROUTER_API_KEY).')
    return
  }

  printDraftOutcome(outcome.body, outcome.bodyText)
  line('')
  line('These facts are unconfirmed until the owner reviews and submits them.')
}
