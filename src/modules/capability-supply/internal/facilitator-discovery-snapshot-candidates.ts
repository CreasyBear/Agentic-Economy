import { isRecord } from '@/modules/common/is-record'
import { parseFacilitatorDiscoverySourceImport, sourceRouteRef } from '@/modules/capability-supply/convex'
import { admitFacilitatorDiscoveryItems } from './facilitator-discovery-admission'

type AdmittedDraft = Awaited<ReturnType<typeof admitFacilitatorDiscoveryItems>>['admitted'][number]
export type AdmittedSourceRoute = Readonly<{ sourceRouteRef: string; resourceUrl: string; method: 'GET' | 'POST'; network: string; asset: string; sourceRevision: string }>

/** The route identity an admitted draft publishes under, equal to its capabilityPublications.sourceRouteRef. */
export function admittedSourceRoute(draft: AdmittedDraft): AdmittedSourceRoute | undefined {
  const source = parseFacilitatorDiscoverySourceImport(draft.sourceImportJson)
  const resource = source !== undefined && isRecord(source.resource) ? source.resource : undefined
  const resourceUrl = resource?.resourceUrl
  const method = resource?.method
  const network = resource?.network
  const asset = resource?.asset
  if (typeof resourceUrl !== 'string' || (method !== 'GET' && method !== 'POST')
    || typeof network !== 'string' || typeof asset !== 'string') return undefined
  const routeRef = sourceRouteRef({
    sourceKind: 'x402', sourceSelector: { resourceUrl },
    sourceDescriptorJson: JSON.stringify(resource), endpointUrl: resourceUrl,
  })
  return routeRef === undefined ? undefined : { sourceRouteRef: routeRef, resourceUrl, method, network, asset, sourceRevision: draft.sourceRevision }
}

/** Derive the indexed identities for an upstream page without writing publications. */
export async function facilitatorDiscoverySnapshotCandidates(items: readonly unknown[]) {
  const candidates: AdmittedSourceRoute[] = []
  for (const candidate of items.slice(0, 20)) {
    const admission = await admitFacilitatorDiscoveryItems([candidate])
    for (const draft of admission.admitted) {
      const route = admittedSourceRoute(draft)
      if (route !== undefined) candidates.push(route)
    }
  }
  return candidates
}
