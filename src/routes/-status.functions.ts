import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { degrade } from '@/lib/observability/degrade'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { readServerReadiness } from '@/lib/server/readiness'
import { readRequestCorrelationId } from '@/lib/server/request-correlation'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { buildSiteDiscoveryManifest, SiteDiscoveryManifestSchemaVersion } from '@/modules/discovery/public'
import { readCatalogueFreshness } from '@/modules/market/x402-directory-index.server'

/**
 * `/status` reads every probe in-process instead of round-tripping through
 * `/api/health`, `/api/ready`, `/.well-known/ucp`, and `/api/v1/catalogue-status`
 * over HTTP: it calls the same server-side readers those routes use. Release
 * identity has no exported reader (`api.v1.release.ts` keeps it route-local),
 * so it is re-derived here from the same environment contract.
 */

export type ProbeId = 'site' | 'market' | 'discovery' | 'release' | 'catalogue'
export type ProbeState = 'operational' | 'degraded'
export type ProbeOutcome = Readonly<{ id: ProbeId; state: ProbeState; detail: string; requestRef?: string }>
export type StatusProbesResult = Readonly<{ checks: readonly ProbeOutcome[]; checkedAt: string }>

const PROBE_TIMEOUT_MS = 2_000

export const readStatusProbesServer = createServerFn().handler(async (): Promise<StatusProbesResult> => {
  const request = getRequest()
  const requestRef = readRequestCorrelationId(request)
  const now = Date.now()
  const checks = await Promise.all([
    runProbe('site', requestRef, probeSite),
    runProbe('market', requestRef, probeMarket),
    runProbe('discovery', requestRef, () => probeDiscovery(request)),
    runProbe('release', requestRef, probeRelease),
    runProbe('catalogue', requestRef, () => probeCatalogue(now)),
  ])
  return { checks, checkedAt: `${formatUtcTimestamp(now)} UTC` }
})

type ProbeAssessment = Readonly<{ state: ProbeState; detail: string }>

async function runProbe(
  id: ProbeId,
  requestRef: string,
  task: () => Promise<ProbeAssessment>,
): Promise<ProbeOutcome> {
  const assessment = await withTimeout(task, PROBE_TIMEOUT_MS).catch(
    (): ProbeAssessment => ({ state: 'degraded', detail: unreachableDetail(id) }),
  )
  return assessment.state === 'operational'
    ? { id, state: 'operational', detail: assessment.detail }
    : { id, state: 'degraded', detail: assessment.detail, requestRef }
}

function withTimeout<T>(task: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    AbortSignal.timeout(timeoutMs).addEventListener('abort', () => reject(new Error('probe_timeout')), { once: true })
    task().then(resolve, reject)
  })
}

async function probeSite(): Promise<ProbeAssessment> {
  return { state: 'operational', detail: 'Public pages are responding.' }
}

async function probeMarket(): Promise<ProbeAssessment> {
  const readiness = await readServerReadiness()
  return readiness.status === 'ready'
    ? { state: 'operational', detail: 'Tool search and new Calls are ready.' }
    : { state: 'degraded', detail: 'New Calls may fail. Check existing Calls before retrying.' }
}

async function probeDiscovery(request: Request): Promise<ProbeAssessment> {
  const canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl
  const manifest = buildSiteDiscoveryManifest({ canonicalBaseUrl, now: Date.now() })
  const valid = manifest.schemaVersion === SiteDiscoveryManifestSchemaVersion
    && manifest.name === 'Agentic Economy'
    && isHttpOrigin(manifest.origin)
  return valid
    ? { state: 'operational', detail: 'Agents can discover the current AE interfaces.' }
    : { state: 'degraded', detail: 'The machine-discovery contract is invalid. Agent setup may fail.' }
}

async function probeRelease(): Promise<ProbeAssessment> {
  const sourceRevision = process.env.AE_RELEASE_SOURCE_REVISION?.trim()
  return sourceRevision !== undefined && /^[a-f0-9]{40}$/u.test(sourceRevision)
    ? { state: 'operational', detail: 'Deployment identity is available.' }
    : { state: 'degraded', detail: 'Release identity is unavailable. New Calls should wait.' }
}

async function probeCatalogue(now: number): Promise<ProbeAssessment> {
  const freshness = await readCatalogueFreshness(now)
  return freshness.status === 'fresh'
    ? { state: 'operational', detail: 'The Tool catalogue was refreshed within the last 36 hours.' }
    : { state: 'degraded', detail: 'The catalogue is stale, absent, or its last refresh failed. Tool listings may be out of date.' }
}

function unreachableDetail(id: ProbeId): string {
  switch (id) {
    case 'site':
      return 'The website could not be reached.'
    case 'market':
      return 'The Tool API could not be reached. Check existing Calls before retrying.'
    case 'discovery':
      return 'Machine discovery could not be reached. Agent setup may fail.'
    case 'release':
      return 'Release identity could not be reached. New Calls should wait.'
    case 'catalogue':
      return 'Catalogue freshness could not be checked. Tool listings may be out of date.'
  }
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && url.origin === value.replace(/\/$/u, '')
  } catch (cause) {
    return degrade(cause, false, { site: 'isHttpOrigin', reason: 'invalid_response' })
  }
}
