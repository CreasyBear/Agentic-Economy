import type { CliOptions } from '../lib/args'
import { isRecord } from '@/modules/common/is-record'
import { callJson, heading, line, printJson, table } from '../lib/output'

/**
 * What a cold agent can learn about AE without a human. Each probe reports
 * independently so one unavailable surface does not hide the others.
 */
const discoveryRoutes = [
  '/api/discovery/schema',
  '/api/discovery/examples',
  '/api/v1/requests/schema',
] as const

export async function runDiscoverCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const probes = await Promise.all(
    discoveryRoutes.map(async (path) => ({ path, outcome: await callJson(options.baseUrl, path) })),
  )

  if (options.json) {
    printJson(probes.map(({ path, outcome }) => ({ path, status: outcome.status, durationMs: outcome.durationMs, body: outcome.body })))
    return
  }

  heading('Discovery surfaces')
  for (const { path, outcome } of probes) {
    table([
      ['route', path],
      ['status', `${outcome.status} (${outcome.durationMs}ms)`],
      ['summary', summarize(outcome.body)],
    ])
    line('')
  }
}

function summarize(body: unknown): string {
  if (!isRecord(body)) return 'no JSON body'
  const keys = Object.keys(body)
  const version = body.schemaVersion ?? body.version
  const versionNote = typeof version === 'string' ? `schemaVersion=${version}; ` : ''
  return `${versionNote}keys: ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', ...' : ''}`
}
