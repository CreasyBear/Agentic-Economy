import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import type { ToolCompareResolution } from '../tool-choice-contracts'

/** Resolve independently so one missing Tool does not erase valid comparisons. */
export async function resolveToolCompare(toolRefs: readonly string[]): Promise<ToolCompareResolution> {
  if (new Set(toolRefs).size !== toolRefs.length) return { kind: 'unavailable', reason: 'query_invalid' }
  const details = await Promise.all(toolRefs.map((toolRef) => readCapabilityToolDetail({ toolRef })))
  const tools: PublicToolDescriptor[] = []
  const missing: string[] = []
  for (const detail of details) {
    if (detail.kind === 'found') tools.push(detail.tool)
    else missing.push(detail.toolRef)
  }
  if (tools.length === 0) {
    return {
      kind: 'unavailable',
      reason: details.every((detail) => detail.kind === 'unavailable') ? 'tool_unavailable' : 'tool_not_found',
    }
  }
  return missing.length === 0 ? { kind: 'ok', tools } : { kind: 'ok', tools, missing }
}
