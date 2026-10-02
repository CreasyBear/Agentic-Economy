import { type ReactNode } from 'react'
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
  if (props.kind === 'shared') {
    return (
      <main
        id="main-content"
        data-shell-mode="chat"
        tabIndex={-1}
        className="arc-market arc-chat arc-chat-page"
        aria-label="Shared chat"
      >
        {props.header}
        <div className="arc-chat-page-content">{props.children}</div>
      </main>
    )
  }

  return (
    <main
      id="main-content"
      data-shell-mode="chat"
      tabIndex={-1}
      className="arc-market arc-chat arc-chat-page"
      aria-label="Chat"
    >
      <div className="arc-chat-page-main">
        {props.header}
        <div className="arc-chat-page-content" aria-busy={props.busy === true}>
          {props.children}
        </div>
        {props.dock}
      </div>
    </main>
  )
}
