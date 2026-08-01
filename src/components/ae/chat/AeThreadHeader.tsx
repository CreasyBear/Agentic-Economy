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
    <header className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border bg-background px-4 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:px-6">
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
      </div>
      <h1 className="col-span-2 row-start-2 min-w-0 truncate font-heading text-sm text-foreground md:col-start-2 md:col-span-1 md:row-start-1 md:text-lg">{title}</h1>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild variant="secondary" size="sm" className="min-h-11">
          <a href="/">Ask another</a>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => void copyThreadLink(threadId)}>
          <CopyIcon aria-hidden="true" />
          Copy link
        </Button>
      </div>
    </header>
  )
}
