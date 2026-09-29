import { type ReactNode } from 'react'

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
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
        aria-label="Shared chat"
      >
        {props.header}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{props.children}</div>
      </main>
    )
  }

  return (
    <main
      id="main-content"
      data-shell-mode="chat"
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
      aria-label="Chat"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {props.header}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-busy={props.busy === true}>
          {props.children}
        </div>
        {props.dock}
      </div>
    </main>
  )
}
