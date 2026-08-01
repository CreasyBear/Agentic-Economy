import { Link } from '@tanstack/react-router'
import { CopyIcon, PanelLeftIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { copyThreadLink } from './copy-thread-link'

export type AeThreadHeaderProps = {
  title: string
  threadId: string
  showSidebarButton?: boolean
  sidebarOpen?: boolean
  onOpenSidebar?: () => void
}

export function AeThreadHeader({ title, threadId, showSidebarButton = false, sidebarOpen = false, onOpenSidebar }: AeThreadHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-border bg-background px-4 py-2 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex min-w-0 items-center justify-between gap-2 md:flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {showSidebarButton && onOpenSidebar !== undefined ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 lg:hidden"
              aria-label="Open recent questions"
              onClick={onOpenSidebar}
              aria-controls="ae-thread-mobile-sidebar"
              aria-expanded={sidebarOpen}
            >
              <PanelLeftIcon aria-hidden="true" />
            </Button>
          ) : null}
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center rounded-sm font-heading text-sm font-semibold text-foreground no-underline hover:text-brand"
          >
            Agentic Economy
          </Link>
          <span className="hidden h-4 w-px bg-border md:block" aria-hidden="true" />
          <h1 className="hidden truncate font-heading text-lg text-foreground md:block">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="secondary" size="sm" className="min-h-11">
            <a href="/">Ask another</a>
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => void copyThreadLink(threadId)}>
            <CopyIcon aria-hidden="true" />
            Copy link
          </Button>
        </div>
      </div>
      <h1 className="truncate font-heading text-sm text-foreground md:hidden">{title}</h1>
    </header>
  )
}
