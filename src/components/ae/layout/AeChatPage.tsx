import { type ReactNode } from 'react'

type AeChatAskPageProps = {
  kind?: 'ask'
  rail?: ReactNode
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
 * one-off grid. `ask` may take a history rail; `shared` has no composer.
 */
export function AeChatPage(props: AeChatAskPageProps | AeChatSharedPageProps) {
  if (props.kind === 'shared') {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col bg-background"
        aria-label="Shared chat"
      >
        {props.header}
        <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
      </main>
    )
  }

  const hasRail = props.rail !== undefined
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={hasRail
        ? 'grid min-h-0 flex-1 bg-background lg:grid-cols-[16rem_minmax(0,1fr)]'
        : 'flex min-h-0 flex-1 flex-col bg-background'}
      aria-label="Chat"
    >
      {hasRail ? (
        <aside className="hidden min-h-0 border-e border-border bg-container lg:flex lg:flex-col" aria-label="Conversation history">
          {props.rail}
        </aside>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {props.header}
        <div className="flex min-h-0 flex-1 flex-col" aria-busy={props.busy === true}>
          {props.children}
        </div>
        {props.dock}
      </div>
    </main>
  )
}
