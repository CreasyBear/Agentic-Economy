import { Link } from '@tanstack/react-router'
import { CopyIcon, PanelLeftIcon } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
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
    <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-border bg-body px-4 py-2 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex min-w-0 items-center justify-between gap-2 md:flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {showSidebarButton && onOpenSidebar !== undefined ? (
            <Button
              label="Open recent questions"
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 lg:hidden"
              icon={<PanelLeftIcon aria-hidden="true" />}
              isIconOnly
              onClick={onOpenSidebar}
              aria-controls="ae-thread-mobile-sidebar"
              aria-expanded={sidebarOpen}
            />
          ) : null}
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center rounded-sm font-heading text-sm font-semibold text-primary no-underline hover:text-accent"
          >
            Agentic Economy
          </Link>
          <span className="hidden h-4 w-px bg-border md:block" aria-hidden="true" />
          <h1 className="hidden truncate font-heading text-lg text-primary md:block">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            label="Ask another"
            href="/"
            variant="secondary"
            size="sm"
            className="min-h-11"
          />
          <Button
            label="Copy link"
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            icon={<CopyIcon aria-hidden="true" />}
            onClick={() => void copyThreadLink(threadId)}
          />
        </div>
      </div>
      <h1 className="truncate font-heading text-sm text-primary md:hidden">{title}</h1>
    </header>
  )
}
