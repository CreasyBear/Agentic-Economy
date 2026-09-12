import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { buildPublicPageHead } from '@/modules/seo/public'
import { readStatusProbesServer, type ProbeId, type ProbeOutcome } from '@/routes/-status.functions'

type CheckState = 'checking' | ProbeOutcome['state']
type StatusCheck = Readonly<{ id: ProbeId; label: string; state: CheckState; detail: string; requestRef?: string }>

const probeLabels: Readonly<Record<ProbeId, string>> = {
  site: 'Website',
  market: 'Tool API',
  discovery: 'Machine discovery',
  release: 'Release identity',
  catalogue: 'Catalogue freshness',
}
const probeOrder: readonly ProbeId[] = ['site', 'market', 'discovery', 'release', 'catalogue']

export const Route = createFileRoute('/status')({
  staticData: {
    nav: {
      label: 'System status',
      footer: { column: 'Help', order: 1 },
    },
  },
  head: () => buildPublicPageHead({
    path: '/status',
    title: 'System status | Agentic Economy',
    description: 'Current Agentic Economy website, Tool API, machine discovery, release identity, and catalogue freshness status.',
  }),
  loader: () => readStatusProbesServer(),
  component: StatusRoute,
})

function StatusRoute() {
  const { checks: outcomes, checkedAt } = Route.useLoaderData()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)

  const checks: readonly StatusCheck[] = probeOrder.map((id) => {
    const outcome = outcomes.find((candidate) => candidate.id === id)
    return isChecking || outcome === undefined
      ? { id, label: probeLabels[id], state: 'checking', detail: 'Checking now…' }
      : { id, label: probeLabels[id], state: outcome.state, detail: outcome.detail, ...(outcome.requestRef === undefined ? {} : { requestRef: outcome.requestRef }) }
  })

  const refresh = () => {
    if (isChecking) return
    setIsChecking(true)
    void router.invalidate()
      .catch((cause) => captureClientExceptionOnClient(cause))
      .finally(() => setIsChecking(false))
  }

  const degradedChecks = checks.filter((check) => check.state === 'degraded')
  const degraded = degradedChecks.length > 0
  const recovery = degraded ? recoveryGuidance(degradedChecks) : undefined
  const statusAnnouncement = isChecking
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
      description="Live checks for the public site and shared agent interfaces. Individual Tool readiness is shown in the catalogue and on each Tool page."
      actions={
        <Button
          type="button"
          variant="outline"
          className="min-h-touch"
          disabled={isChecking}
          aria-busy={isChecking}
          onClick={refresh}
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
            Help
          </Link>
        </div>
      </div>
    </AePublicPage>
  )
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
        description: 'Do not repeat an uncertain Call. Open Calls to inspect its current status or receipt.',
        href: '/activity',
        label: 'Open Calls',
      }
    : {
        title: 'Retry after the affected system recovers',
        description: 'Refresh status first. If the problem continues, report it with any request reference shown above.',
        href: '/support',
        label: 'Help',
      }
}
