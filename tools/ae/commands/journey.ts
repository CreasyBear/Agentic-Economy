import type { CliOptions } from '../lib/args'
import { isRecord } from '@/modules/common/is-record'
import { CliFailure, callJson, heading, line, printJson } from '../lib/output'

/**
 * The agent-legibility litmus. A cold agent must be able to derive each next
 * call from the previous response body alone. Every step records whether it
 * could, so "an agent can use AE" becomes an observation rather than a claim.
 */
type JourneyStep = {
  step: string
  path: string
  status: number
  durationMs: number
  nextMoveDerivable: boolean
  note: string
}

export async function runJourneyCommand(args: readonly string[], options: CliOptions): Promise<void> {
  const query = args.join(' ').trim()
  if (query.length === 0) throw new CliFailure('Usage: ae journey "<query>"')

  const steps: JourneyStep[] = []

  const searchPath = `/api/businesses/search?q=${encodeURIComponent(query)}`
  const search = await callJson(options.baseUrl, searchPath)
  const firstSlug = readFirstSlug(search.body)
  steps.push({
    step: 'find',
    path: searchPath,
    status: search.status,
    durationMs: search.durationMs,
    nextMoveDerivable: firstSlug !== undefined,
    note: firstSlug === undefined
      ? 'No slug in the response, so the next call is not derivable from this body.'
      : `Next call derivable: slug "${firstSlug}".`,
  })

  if (firstSlug !== undefined) {
    const detailPath = `/api/businesses/${encodeURIComponent(firstSlug)}`
    const detail = await callJson(options.baseUrl, detailPath)
    const business = readBusiness(detail.body)
    // The search page names these "services"; the detail record names them
    // "offerings". Same concept, two public vocabularies.
    const services = business === undefined
      ? []
      : [business.services, business.offerings].find(Array.isArray) ?? []
    const hasNextStep = services.length > 0
    steps.push({
      step: 'understand',
      path: detailPath,
      status: detail.status,
      durationMs: detail.durationMs,
      nextMoveDerivable: hasNextStep,
      note: hasNextStep
        ? 'Services carry a first-request mode and channel, so the request path is derivable.'
        : 'No services on the record, so there is no derivable request path.',
    })
  }

  const discoverPath = '/api/discovery/schema'
  const discover = await callJson(options.baseUrl, discoverPath)
  steps.push({
    step: 'learn the contract',
    path: discoverPath,
    status: discover.status,
    durationMs: discover.durationMs,
    nextMoveDerivable: discover.ok && isRecord(discover.body),
    note: discover.ok ? 'Discovery document returned.' : 'Discovery document unavailable.',
  })

  const requestSchemaPath = '/api/v1/requests/schema'
  const requestSchema = await callJson(options.baseUrl, requestSchemaPath)
  steps.push({
    step: 'learn the request contract',
    path: requestSchemaPath,
    status: requestSchema.status,
    durationMs: requestSchema.durationMs,
    nextMoveDerivable: requestSchema.ok,
    note: requestSchema.ok ? 'Request contract schema returned.' : 'Request contract schema unavailable.',
  })

  if (options.json) {
    printJson({ query, steps })
    return
  }

  heading(`Journey "${query}"`)
  for (const step of steps) {
    line('')
    line(`${step.step}  ${step.path}`)
    line(`  status ${step.status}  ${step.durationMs}ms  next-move-derivable=${String(step.nextMoveDerivable)}`)
    line(`  ${step.note}`)
  }

  const stalls = steps.filter((step) => !step.nextMoveDerivable || step.status >= 400)
  line('')
  line(`${steps.length} steps, ${stalls.length} stall points.`)
  for (const stall of stalls) line(`  stalled at: ${stall.step} (${stall.status})`)
}

function readFirstSlug(body: unknown): string | undefined {
  if (!isRecord(body) || !Array.isArray(body.items)) return undefined
  const first: unknown = body.items[0]
  if (!isRecord(first)) return undefined
  return typeof first.slug === 'string' ? first.slug : undefined
}

function readBusiness(body: unknown): Record<string, unknown> | undefined {
  if (!isRecord(body)) return undefined
  if (isRecord(body.business)) return body.business
  return body
}
