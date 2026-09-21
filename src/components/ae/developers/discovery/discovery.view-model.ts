import { formatRelativeTime } from '@/lib/ui/format-time'
import { aeStatusToneVariants, getStatusPresentation } from '@/lib/ui/status-presentation'
import type { DeveloperDiscoveryArtifactState } from '@/modules/discovery/developer-discovery'
import type { DeveloperDiscoveryRoutePageReadback } from '@/modules/discovery/developer-discovery-route'
import { DEVELOPER_DISCOVERY_UI_COPY } from './discovery.contracts'
import type { DeveloperDiscoveryViewModel } from './discovery.contracts'


export function buildDeveloperDiscoveryViewModel(
  readback: DeveloperDiscoveryRoutePageReadback,
): DeveloperDiscoveryViewModel {
  return {
    copy: readback.copy,
    summaryFacts: [
      { label: DEVELOPER_DISCOVERY_UI_COPY.summary.freshness, value: readback.freshness.label },
      { label: DEVELOPER_DISCOVERY_UI_COPY.summary.publishedCatalogs, value: String(readback.catalogCount) },
      { label: DEVELOPER_DISCOVERY_UI_COPY.summary.schemaVersion, value: readback.schemaVersion },
    ],
    artifacts: readback.artifacts.map((artifact) => {
      const url = new URL(artifact.route, readback.canonicalBaseUrl)
      const status = artifactStatus(artifact.state)
      return {
        kind: artifact.kind,
        label: artifact.label,
        actionLabel: DEVELOPER_DISCOVERY_UI_COPY.actions[artifact.kind],
        href: url.href,
        origin: url.origin,
        statusLabel: status.label,
        statusVariant: aeStatusToneVariants[status.presentation.tone],
        checkedLabel: `${DEVELOPER_DISCOVERY_UI_COPY.checkedPrefix} ${formatRelativeTime(artifact.checkedAt, readback.generatedAt)}`,
        code: JSON.stringify({ route: url.href, fields: artifact.schemaFields.slice(0, 8) }, null, 2),
      }
    }),
    publicFacts: readback.publicFacts.map((fact) => ({
      id: fact.slug,
      label: fact.name,
      state: discoveryRowStateLabel(fact.disposition),
      description: fact.businessContext.kind === 'local_human'
        ? `${fact.category} in ${fact.businessContext.suburb}, ${fact.businessContext.stateTerritory}`
        : `${fact.category} from ${fact.businessContext.providerIdentifier}`,
    })),
    routeHealth: readback.routeHealth.map((health) => ({
      id: health.route,
      label: health.label,
      state: discoveryRowStateLabel(health.status),
      description: health.route,
    })),
  }
}

export function discoveryRowStateLabel(state: string): string {
  if (state === '') return state
  return `${state.charAt(0).toUpperCase()}${state.slice(1)}`
}

function artifactStatus(state: DeveloperDiscoveryArtifactState) {
  const presentation = getStatusPresentation(
    state === 'available' ? 'available' : state === 'degraded' ? 'stale' : 'unavailable',
  )
  return {
    label: state === 'available' ? DEVELOPER_DISCOVERY_UI_COPY.freshStatus : presentation.compactLabel,
    presentation,
  }
}
