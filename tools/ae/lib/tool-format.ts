import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import type { PublicToolChoice } from '@/modules/registry/tool-choice-contracts'

type ToolIdentity = PublicToolDescriptor | PublicToolChoice

export function toolLabel(tool: ToolIdentity): string {
  const provider = ('business' in tool ? tool.business.name : tool.provider.name).trim()
  const listing = ('listing' in tool ? tool.listing.label : tool.title).trim()
  return [provider, listing]
    .filter((value) => value.length > 0)
    .join(' — ') || tool.toolRef
}

/**
 * The one CLI purchase path for a Tool. `ae call` performs the quote and the
 * call, so it is the runnable next step after discovery; the manifest and the
 * describe hint must not diverge from it.
 */
export function toolCallCommand(toolRef = '<tool-ref>'): string {
  return `ae call ${toolRef} --input '<json>'`
}
