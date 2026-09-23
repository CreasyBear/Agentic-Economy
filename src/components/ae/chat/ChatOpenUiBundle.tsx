import { ChatAssistantText } from '@/components/ae/chat/ChatAssistantText'
import { ToolCard } from '@/components/ae/chat/ToolCard'
import type { BoundOpenUiNode } from '@/modules/chat/openui-bundle'
import type { ToolCardProjection } from '@/modules/chat/tool-card'

export type ChatOpenUiBundleProps = Readonly<{
  node: BoundOpenUiNode
  tools: readonly ToolCardProjection[]
}>

export function ChatOpenUiBundle({ node, tools }: ChatOpenUiBundleProps) {
  switch (node.kind) {
    case 'text':
      return <ChatAssistantText text={node.text} />
    case 'tool': {
      const projection = tools[node.toolIndex]
      return projection === undefined ? null : <ToolCard projection={projection} />
    }
    case 'stack':
      return (
        <div className="grid gap-related">
          {node.children.map((child, index) => (
            <ChatOpenUiBundle key={index} node={child} tools={tools} />
          ))}
        </div>
      )
    default: {
      const exhaustive: never = node
      return exhaustive
    }
  }
}
