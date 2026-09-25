import { isRecord } from '@/modules/common/is-record'
import { parseFacilitatorDiscoverySourceImport, sourceRouteRef } from '@/modules/capability-supply/convex'
import { admitFacilitatorDiscoveryItems } from './facilitator-discovery-admission'

/** Derive the indexed identities for an upstream page without writing publications. */
export async function facilitatorDiscoverySnapshotCandidates(items: readonly unknown[]) {
  const candidates: {
    sourceRouteRef: string
    resourceUrl: string
    method: 'GET' | 'POST'
    network: string
    asset: string
    sourceRevision: string
  }[] = []
  for (const candidate of items.slice(0, 20)) {
    const admission = await admitFacilitatorDiscoveryItems([candidate])
    for (const draft of admission.admitted) {
      const source = parseFacilitatorDiscoverySourceImport(draft.sourceImportJson)
      if (source === undefined) continue
      const resource = isRecord(source.resource) ? source.resource : undefined
      const resourceUrl = resource?.resourceUrl
      const method = resource?.method
      const network = resource?.network
      const asset = resource?.asset
      if (typeof resourceUrl !== 'string' || (method !== 'GET' && method !== 'POST')
        || typeof network !== 'string' || typeof asset !== 'string') continue
      const routeRef = sourceRouteRef({
        sourceKind: 'x402', sourceSelector: { resourceUrl },
        sourceDescriptorJson: JSON.stringify(source.resource), endpointUrl: resourceUrl,
      })
      if (routeRef === undefined) continue
      candidates.push({ sourceRouteRef: routeRef, resourceUrl, method, network, asset, sourceRevision: draft.sourceRevision })
    }
  }
  return candidates
}
