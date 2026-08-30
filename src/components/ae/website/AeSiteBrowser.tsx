import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { AePlusMark } from './AeSiteMarks'

type AeSiteBrowserProps = {
  url: string
  children: ReactNode
  className?: string
}

/** Desktop chrome around a live surface — Opensource UI Browser mockup, AE tokens. */
export function AeSiteBrowser({ url, children, className }: AeSiteBrowserProps) {
  return (
    <div
      data-slot="ae-site-browser"
      className={cn('w-full min-w-0 overflow-hidden border border-border bg-container', className)}
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-1.5">
        <span className="flex shrink-0 text-info" aria-hidden="true">
          <AePlusMark sizePx={10} />
        </span>
        <p className="flex h-7 min-w-0 flex-1 items-center bg-container px-3 font-mono text-xs text-muted-foreground">
          <span className="truncate">{url}</span>
        </p>
      </div>
      <div className="min-w-0 bg-container">{children}</div>
    </div>
  )
}
