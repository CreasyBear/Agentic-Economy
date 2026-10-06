import { type ReactNode } from 'react'
import { ArcAiChatPage } from '@/components/ae/shared/arc-pro/ai-chat/ai-chat'
import './ChatPageComposition.css'

type AeChatAskPageProps = {
  kind?: 'ask'
  header: ReactNode
  children: ReactNode
  dock: ReactNode
  busy?: boolean
}

type AeChatSharedPageProps = {
  kind: 'shared'
  header: ReactNode
  children: ReactNode
}

/**
 * The chat page seam. Interactive and shared threads wrap with this, not a
 * one-off grid. History opens from the header sheet. Shared threads have no composer.
 */
export function AeChatPage(props: AeChatAskPageProps | AeChatSharedPageProps) {
  return props.kind === 'shared'
    ? <ArcAiChatPage kind="shared" header={props.header}>{props.children}</ArcAiChatPage>
    : <ArcAiChatPage kind="ask" header={props.header} dock={props.dock} busy={props.busy === true}>{props.children}</ArcAiChatPage>
}
