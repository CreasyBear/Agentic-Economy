import { ChatAssistantText } from '@/components/ae/chat/ChatAssistantText'
import { ToolCard } from '@/components/ae/chat/ToolCard'
import type { BoundOpenUiNode } from '@/modules/chat/openui-bundle'
import type { ToolCardProjection } from '@/modules/chat/tool-card'
import type { SearchNextProps } from './presentation'
import './TranscriptComposition.css'

export type ChatOpenUiBundleProps = Readonly<{
  node: BoundOpenUiNode
  tools: readonly ToolCardProjection[]
  onContinueSearch?: SearchNextProps['onContinueSearch']
  cursorToRedact?: string
  signedThread?: boolean
  onRepeatSearch?: SearchNextProps['onRepeatSearch']
}>

export function ChatOpenUiBundle({ node, tools, onContinueSearch, onRepeatSearch, signedThread, cursorToRedact }: ChatOpenUiBundleProps) {
  switch (node.kind) {
    case 'text':
      return <ChatAssistantText text={cursorToRedact === undefined ? node.text : node.text.replaceAll(cursorToRedact, '[cursor hidden]')} />
    case 'tool': {
      const projection = tools[node.toolIndex]
      return projection === undefined ? null : <ToolCard projection={projection}
        {...(onContinueSearch === undefined ? {} : { onContinueSearch })}
        {...(onRepeatSearch === undefined ? {} : { onRepeatSearch })}
        {...(signedThread === undefined ? {} : { signedThread })} />
    }
    case 'stack':
      return (
        <div className="arc-market arc-chat arc-openui-stack">
          {node.children.map((child, index) => (
            <ChatOpenUiBundle key={index} node={child} tools={tools}
              {...(onContinueSearch === undefined ? {} : { onContinueSearch })}
              {...(onRepeatSearch === undefined ? {} : { onRepeatSearch })}
              {...(signedThread === undefined ? {} : { signedThread })}
              {...(cursorToRedact === undefined ? {} : { cursorToRedact })} />
          ))}
        </div>
      )
    default: {
      const exhaustive: never = node
      return exhaustive
    }
  }
}
