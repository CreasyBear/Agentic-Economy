import type { ProbeId, ProbeOutcome, StatusProbesResult } from '@/routes/-status.functions'
import { aeStatusPresentation, getStatusPresentation } from '@/lib/ui/status-presentation'


export type StatusCheckState = 'checking' | ProbeOutcome['state']

export type StatusCheckView = Readonly<{
  id: ProbeId
  label: string
  state: StatusCheckState
  detail: string
  checkedAtLabel: string
  badgeLabel:
    | typeof aeStatusPresentation.operational.label
    | typeof aeStatusPresentation.degraded.label
    | 'Checking'
  badgeVariant: 'success' | 'danger' | 'neutral'
  requestRef?: string
}>

export type StatusRecoveryGuidance = Readonly<{
  title: string
  description: string
  href: '/activity' | '/support'
  label: string
}>

export type AeSystemStatusProps = Readonly<{
  loaded: StatusProbesResult
}>

export type UseSystemStatusInput = AeSystemStatusProps

export type UseSystemStatusResult = Readonly<{
  isChecking: boolean
  title: string
  refreshLabel: string
  checks: readonly StatusCheckView[]
  statusAnnouncement: string
  lastUpdated: string
  onRefresh: () => void
  recovery?: StatusRecoveryGuidance
}>

export type StatusCheckListProps = Readonly<{
  checks: readonly StatusCheckView[]
  isChecking: boolean
}>

export type StatusRecoveryPanelProps = Readonly<{
  recovery: StatusRecoveryGuidance
}>

export type StatusPageFooterProps = Readonly<{
  statusAnnouncement: string
}>

export const probeLabels: Readonly<Record<ProbeId, string>> = {
  site: 'Website',
  market: 'Tool API',
  discovery: 'Machine discovery',
  release: 'Release identity',
  catalogue: 'Catalogue freshness',
  payments: 'Paid calls',
}

export const probeOrder: readonly ProbeId[] = [
  'site',
  'market',
  'discovery',
  'release',
  'catalogue',
  'payments',
]

export const statusPageDescription =
  'Whether the platform is up. Tool readiness stays on Market and each Tool page.'

export const statusCheckTimeLabel = 'Last checked'
export const statusLastUpdatedLabel = 'Last checked'

export function projectStatusChecks(
  outcomes: readonly ProbeOutcome[],
  isChecking: boolean,
  relativeCheckedAt: string,
): readonly StatusCheckView[] {
  return probeOrder.map((id) => {
    const outcome = outcomes.find((candidate) => candidate.id === id)
    if (isChecking || outcome === undefined) {
      return {
        id,
        label: probeLabels[id],
        state: 'checking',
        detail: '',
        badgeLabel: 'Checking',
        checkedAtLabel: '',
        badgeVariant: 'neutral',
      }
    }
    return {
      id,
      label: probeLabels[id],
      state: outcome.state,
      detail: outcome.detail,
      checkedAtLabel: `${statusCheckTimeLabel} ${relativeCheckedAt}`,
      badgeLabel: getStatusPresentation(outcome.state === 'operational' ? 'operational' : 'degraded').label,
      badgeVariant: outcome.state === 'operational' ? 'success' : 'danger',
      ...(outcome.requestRef === undefined ? {} : { requestRef: outcome.requestRef }),
    }
  })
}

export function recoveryGuidance(
  _checks: readonly StatusCheckView[],
): StatusRecoveryGuidance {
  return {
    title: 'Retry after the affected system recovers',
    description:
      'Refresh status to retry the check. If the problem continues, report it with any request reference shown above.',
    href: '/support',
    label: 'Help',
  }
}

export function statusPageTitle(isChecking: boolean, degraded: boolean): string {
  return isChecking
    ? 'Checking system status.'
    : degraded
      ? 'Some systems are degraded.'
      : 'All systems operational'
}

export function statusAnnouncementText(
  isChecking: boolean,
  checks: readonly StatusCheckView[],
  degradedChecks: readonly StatusCheckView[],
  checkedAt: string,
): string {
  if (isChecking) return 'Checking all systems…'
  if (degradedChecks.length > 0) {
    return `Status checked. ${degradedChecks.length} of ${checks.length} systems ${
      degradedChecks.length === 1 ? 'needs' : 'need'
    } attention: ${degradedChecks.map((check) => check.label).join(', ')}. Last checked ${checkedAt}.`
  }
  return `Status checked. All ${checks.length} systems are operational. Last checked ${checkedAt}.`
}
