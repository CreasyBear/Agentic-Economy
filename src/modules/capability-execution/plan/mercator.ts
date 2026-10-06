import type { MercatorNode, PlanJson, PlanValidationRefusal } from './contracts'
import { parsePlan } from './parse'

type MercatorRouteSelector = Readonly<{
  providerHost: string
  method: MercatorNode['method']
  path: string
}>

export type MercatorToolRefResolver = (selector: MercatorRouteSelector) => Promise<string | undefined>

/**
 * Resolve every Mercator service through its supplied provider host, never
 * treating serviceId as a local Tool identity. Input expressions are preserved
 * as-authored and validated by the canonical Plan parser after resolution.
 */
export async function mercatorFlowPlanToPlanJson(
  flowPlan: Readonly<{ nodes: readonly MercatorNode[] }>,
  providerHostByServiceId: Readonly<Record<string, string>>,
  resolveToolRef: MercatorToolRefResolver,
): Promise<PlanJson | PlanValidationRefusal> {
  const nodes: unknown[] = []
  for (const node of flowPlan.nodes) {
    const providerHost = Object.hasOwn(providerHostByServiceId, node.serviceId)
      ? providerHostByServiceId[node.serviceId]
      : undefined
    if (providerHost === undefined || providerHost.trim().length === 0) {
      return { kind: 'refused', code: 'tool_not_admitted', nodeId: node.id }
    }
    const toolRef = await resolveToolRef({ providerHost, method: node.method, path: node.path })
    if (toolRef === undefined) return { kind: 'refused', code: 'tool_not_admitted', nodeId: node.id }
    nodes.push({ id: node.id, toolRef, input: node.input, dependsOn: node.dependsOn })
  }
  return parsePlan({ nodes })
}
