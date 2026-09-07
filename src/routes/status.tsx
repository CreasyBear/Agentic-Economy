'use client'

import { createFileRoute, Link } from '@tanstack/react-router'
import { RefreshCwIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SiteDiscoveryManifestSchemaVersion } from '@/modules/discovery/public'
import { buildPublicPageHead } from '@/modules/seo/public'

type CheckState = 'checking' | 'operational' | 'degraded'
type ProbeId = 'site' | 'market' | 'discovery' | 'release'
type StatusCheck = Readonly<{
  id: ProbeId
  label: string
  path: string
  state: CheckState
  detail: string
  requestRef?: string
}>

const probes = [
  { id: 'site', label: 'Website', path: '/api/health', operationalDetail: 'Public pages are responding.' },
  { id: 'market', label: 'Operation API', path: '/api/ready', operationalDetail: 'Search and new Operation calls are ready.' },
  { id: 'discovery', label: 'Machine discovery', path: '/.well-known/ucp', operationalDetail: 'Agents can discover the current AE interfaces.' },
  { id: 'release', label: 'Release identity', path: '/api/v1/release', operationalDetail: 'Deployment identity is available.' },
] as const

export const Route = createFileRoute('/status')({
  head: () => buildPublicPageHead({
    path: '/status',
    title: 'System status | Agentic Economy',
    description: 'Current Agentic Economy website, Operation API, machine discovery, and release identity status.',
  }),
  component: StatusRoute,
})

function StatusRoute() {
  const [checks, setChecks] = useState<readonly StatusCheck[]>(() => checkingChecks())
  const [checkedAt, setCheckedAt] = useState<string>()
  const [isChecking, setIsChecking] = useState(true)
  const refreshInFlight = useRef(false)
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setIsChecking(true)
    setCheckedAt(undefined)
    setChecks(checkingChecks())
    try {
      const results = await Promise.all(probes.map(async (probe): Promise<StatusCheck> => {
        try {
          const response = await fetch(probe.path, { cache: 'no-store' })
          const result = await assessProbeResponse(probe.id, response)
          const requestRef = result.state === 'degraded'
            ? response.headers.get('X-AE-Request-Id') || undefined
            : undefined
          return {
            ...probe,
            ...result,
            ...(requestRef === undefined ? {} : { requestRef }),
          }
        } catch {
          return { ...probe, state: 'degraded', detail: unreachableDetail(probe.id) }
        }
      }))
      setChecks(results)
      setCheckedAt(new Date().toLocaleTimeString())
    } finally {
      refreshInFlight.current = false
      setIsChecking(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const degradedChecks = checks.filter((check) => check.state === 'degraded')
  const degraded = degradedChecks.length > 0
  const recovery = degraded ? recoveryGuidance(degradedChecks) : undefined
  const statusAnnouncement = isChecking || checkedAt === undefined
    ? 'Checking all systems…'
    : degraded
      ? `Status checked. ${degradedChecks.length} of ${checks.length} systems ${degradedChecks.length === 1 ? 'needs' : 'need'} attention: ${degradedChecks.map((check) => check.label).join(', ')}. Last checked ${checkedAt}.`
      : `Status checked. All ${checks.length} systems are operational. Last checked ${checkedAt}.`
  return (
    <AePublicPage
      kind="document"
      eyebrow="System status"
      title={isChecking
        ? 'Checking system status.'
        : degraded
          ? 'Some systems are degraded.'
          : 'All systems operational.'}
      description="Live checks for the public site and shared agent interfaces. Individual Operation readiness is shown in the catalogue and on each Operation page."
      actions={
        <Button
          type="button"
          variant="outline"
          className="min-h-touch"
          disabled={isChecking}
          aria-busy={isChecking}
          onClick={() => void refresh()}
        >
          <RefreshCwIcon aria-hidden="true" /> {isChecking ? 'Checking status…' : 'Refresh status'}
        </Button>
      }
    >
      <div className="ae-rail pb-page">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border" aria-busy={isChecking}>
            {checks.map((check) => (
              <li key={check.id} className="flex min-h-touch flex-wrap items-center gap-intra px-gutter py-intra">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{check.label}</p>
                  <p className="text-sm text-muted-foreground">{check.detail}</p>
                  {check.requestRef !== undefined && (
                    <div className="mt-intra grid gap-1">
                      <p className="text-xs font-medium text-muted-foreground">Request reference</p>
                      <AeCopyReference label={`${check.label} request reference`} value={check.requestRef} />
                    </div>
                  )}
                </div>
                <Badge variant={check.state === 'operational' ? 'success' : check.state === 'degraded' ? 'destructive' : 'secondary'}>
                  {check.state === 'operational' ? 'Operational' : check.state === 'degraded' ? 'Degraded' : 'Checking'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
        {recovery !== undefined && (
          <section
            aria-labelledby="status-recovery-title"
            className="mt-related grid gap-related rounded-lg border border-border bg-card p-gutter sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div className="grid gap-1">
              <h2 id="status-recovery-title" className="font-medium text-foreground">
                {recovery.title}
              </h2>
              <p className="text-sm text-muted-foreground">{recovery.description}</p>
            </div>
            <Button asChild className="min-h-touch w-full sm:w-auto">
              <Link to={recovery.href}>{recovery.label}</Link>
            </Button>
          </section>
        )}
        <div className="mt-related flex flex-wrap items-center justify-between gap-intra text-sm text-muted-foreground">
          <p role="status" aria-live="polite" aria-atomic="true">
            {statusAnnouncement}
          </p>
          <Link to="/support" className="min-h-touch content-center font-medium text-foreground underline underline-offset-4">
            Get help
          </Link>
        </div>
      </div>
    </AePublicPage>
  )
}

function checkingChecks(): readonly StatusCheck[] {
  return probes.map((probe) => ({ ...probe, state: 'checking', detail: 'Checking now…' }))
}

type ProbeAssessment = Pick<StatusCheck, 'state' | 'detail'>

async function assessProbeResponse(
  id: ProbeId,
  response: Response,
): Promise<ProbeAssessment> {
  if (!response.ok) {
    return { state: 'degraded', detail: failedResponseDetail(id, response.status) }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { state: 'degraded', detail: invalidContractDetail(id) }
  }

  if (!probeContractMatches(id, body)) {
    return { state: 'degraded', detail: invalidContractDetail(id) }
  }

  const probe = probes.find((candidate) => candidate.id === id)
  if (probe === undefined) throw new Error(`Unknown status probe: ${id}`)
  return { state: 'operational', detail: probe.operationalDetail }
}

function probeContractMatches(id: ProbeId, body: unknown): boolean {
  if (!isRecord(body)) return false
  switch (id) {
    case 'site':
      return body.status === 'ok'
    case 'market':
      return body.status === 'ready'
        && isRecord(body.checks)
        && body.checks.config === 'ready'
        && body.checks.convex === 'ready'
    case 'discovery':
      return body.schemaVersion === SiteDiscoveryManifestSchemaVersion
        && body.name === 'Agentic Economy'
        && typeof body.origin === 'string'
        && isHttpOrigin(body.origin)
        && Array.isArray(body.endpoints)
        && isRecord(body.toolGateway)
    case 'release':
      return body.kind === 'ok'
        && typeof body.sourceRevision === 'string'
        && /^[a-f0-9]{40}$/u.test(body.sourceRevision)
  }
}

function failedResponseDetail(id: ProbeId, status: number): string {
  switch (id) {
    case 'site':
      return `Public pages may be unavailable (HTTP ${status}).`
    case 'market':
      return `New Operation calls may fail (HTTP ${status}). Check existing calls before retrying.`
    case 'discovery':
      return `Agent discovery and setup may fail (HTTP ${status}).`
    case 'release':
      return `New Operation calls should wait (HTTP ${status}). Existing calls may still need review.`
  }
}

function invalidContractDetail(id: ProbeId): string {
  switch (id) {
    case 'site':
      return 'The website returned an invalid health result.'
    case 'market':
      return 'The Operation API returned an invalid readiness result. Check existing calls before retrying.'
    case 'discovery':
      return 'The machine-discovery contract is invalid. Agent setup may fail.'
    case 'release':
      return 'The release identity is invalid. New Operation calls should wait.'
  }
}

function unreachableDetail(id: ProbeId): string {
  switch (id) {
    case 'site':
      return 'The website could not be reached.'
    case 'market':
      return 'The Operation API could not be reached. Check existing calls before retrying.'
    case 'discovery':
      return 'Machine discovery could not be reached. Agent setup may fail.'
    case 'release':
      return 'Release identity could not be reached. New Operation calls should wait.'
  }
}

function recoveryGuidance(checks: readonly StatusCheck[]): Readonly<{
  title: string
  description: string
  href: '/activity' | '/support'
  label: string
}> {
  const callSafetyAffected = checks.some((check) => check.id === 'market' || check.id === 'release')
  return callSafetyAffected
    ? {
        title: 'Check existing calls before retrying',
        description: 'Do not repeat an uncertain Operation call. Open Calls to inspect its current status or receipt.',
        href: '/activity',
        label: 'Open Calls',
      }
    : {
        title: 'Retry after the affected system recovers',
        description: 'Refresh status first. If the problem continues, report it with any request reference shown above.',
        href: '/support',
        label: 'Get help',
      }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && url.origin === value.replace(/\/$/u, '')
  } catch {
    return false
  }
}
