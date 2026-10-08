/* Adapted from licensed ReUI ai-chat-3, base-nova, retrieved 2026-10-07.
 * Registry SHA-256: c64800b8fc671b83430ffd8a9475f1efd14fce54c13394597d2547236227b11d.
 * The upstream flex shell occupies its parent's allocated space. AE supplies
 * history and live content; no demo message, model or reply state is retained.
 */
import { SquarePen } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ReuiChatFrame({ sidebar, sidebarOpen, onNewChat, children }: Readonly<{
  sidebar: ReactNode; sidebarOpen: boolean; onNewChat(): void; children: ReactNode
}>) {
  return <div className="reui-chat flex min-h-0 w-full flex-1 overflow-hidden bg-background text-foreground">
    {sidebar == null ? null : <aside aria-label="Conversation history" data-expanded={sidebarOpen}
      className={cn('hidden min-h-0 shrink-0 border-r border-border md:flex', sidebarOpen ? 'w-66' : 'w-11')}>
      <div className={cn('min-h-0 w-66', !sidebarOpen && 'hidden')} aria-hidden={!sidebarOpen} inert={!sidebarOpen || undefined}>
        {sidebar}
      </div>
      {sidebarOpen ? null : <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="New chat" onClick={onNewChat}>
        <SquarePen aria-hidden="true" />
      </Button>}
    </aside>}
    <div key="chat-main" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
  </div>
}

export function ReuiChatPage({ kind = 'ask', header, children, dock, busy = false }: Readonly<{
  kind?: 'ask' | 'shared'; header: ReactNode; children: ReactNode; dock?: ReactNode; busy?: boolean
}>) {
  return <main id="main-content" tabIndex={-1} data-shell-mode="chat" aria-label={kind === 'shared' ? 'Shared chat' : 'Chat'}
    className="reui-chat relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
    {header}
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-busy={busy}>{children}</div>
    {kind === 'ask' ? dock : null}
  </main>
}

export function ReuiChatHeader({ title, description, leading, actions }: Readonly<{
  title: string; description: string; leading: ReactNode; actions: ReactNode
}>) {
  const descriptionId = useId()
  return <div className="flex h-11 w-full min-w-0 items-center gap-2 text-foreground">
    <div className="flex shrink-0 items-center">{leading}</div>
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-sm font-medium" title={title} aria-describedby={descriptionId}>{title}</h1>
      <p id={descriptionId} className="sr-only">{description}</p>
    </div>
    <div className="flex shrink-0 items-center gap-1">{actions}</div>
  </div>
}

export function ReuiChatDock({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3 sm:px-6">
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">{children}</div>
  </div>
}
