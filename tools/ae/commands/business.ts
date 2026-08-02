import type { CliOptions } from '../lib/args'
import { isRecord } from '@/modules/common/is-record'
import { CliFailure, callJson, heading, line, printJson, requireOk, table } from '../lib/output'

export async function runBusinessCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const slug = args[0]?.trim()
  if (slug === undefined || slug.length === 0) throw new CliFailure('Usage: ae business <slug>')

  const path = `/api/businesses/${encodeURIComponent(slug)}`
  const outcome = await callJson(options.baseUrl, path)
  const body = requireOk(outcome, path)

  if (options.json) {
    printJson(body)
    return
  }

  heading(`Business "${slug}" (${outcome.durationMs}ms)`)
  if (!isRecord(body)) {
    line('Unreadable response body.')
    return
  }

  if (body.kind === 'not_found') {
    line(`Not found: ${String(body.reason ?? '')}`)
    return
  }

  const business = isRecord(body.business) ? body.business : body
  table([
    ['name', String(business.name ?? '')],
    ['category', String(business.category ?? '')],
    ['where', `${String(business.suburb ?? '')} ${String(business.stateTerritory ?? '')}`.trim()],
    ['page', String(business.publicUrl ?? `/${slug}`)],
    ['phone', String(business.publishedPhone ?? 'not published')],
  ])

  // Search results call these "services"; the detail record calls them
  // "offerings". Read both so the CLI is not hostage to that inconsistency.
  const services = [business.services, business.offerings].find(Array.isArray) ?? []
  line(`\nServices: ${services.length}`)
  for (const service of services) {
    if (!isRecord(service)) continue
    const firstRequest = isRecord(service.firstRequest) ? service.firstRequest : {}
    line(`  - ${String(service.name ?? '')} [${String(service.category ?? '')}]`)
    line(`    area: ${String(service.serviceArea ?? service.serviceAreaSummary ?? 'not supplied')}`)
    line(`    hours: ${String(service.hoursOrUnknown ?? service.availabilitySummary ?? 'not supplied')}`)
    line(`    what to do now: ${String(firstRequest.mode ?? 'see access paths')} via ${String(firstRequest.publicChannel ?? 'unknown')}`)
  }
}
