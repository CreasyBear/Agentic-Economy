import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import type { PublicToolChoice } from '@/modules/registry/tool-choice-contracts'

type ToolIdentity = PublicToolDescriptor | PublicToolChoice

export function toolLabel(tool: ToolIdentity): string {
  const provider = ('business' in tool ? tool.business.name : tool.provider.name).trim()
  const offering = ('offering' in tool ? tool.offering.label : tool.title).trim()
  return [provider, offering]
    .filter((value) => value.length > 0)
    .join(' — ') || tool.toolRef
}
