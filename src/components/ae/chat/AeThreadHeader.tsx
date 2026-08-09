import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CopyIcon, Link2OffIcon, PanelLeftIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { neutralizeBidiFormattingControls } from '@/modules/answer/public'
import { toast } from '@/lib/ui/toast'
import { announceShareFailure, copyAnswerThreadShareLink, revokeAnswerThreadShare } from './copy-thread-link'

export type AeThreadHeaderProps = {
  title: string
  threadId: string
  showSidebarButton?: boolean
  sidebarOpen?: boolean
  onOpenSidebar?: () => void
  onNewQuestion?: () => void
}

export function AeThreadHeader({ title, threadId, showSidebarButton = false, sidebarOpen = false, onOpenSidebar, onNewQuestion }: AeThreadHeaderProps) {
  const [shareBusy, setShareBusy] = useState<'copy' | 'revoke' | null>(null)
  const [shareRevoked, setShareRevoked] = useState(false)
  const displayTitle = neutralizeBidiFormattingControls(title)

  async function copyShareLink(): Promise<void> {
    if (shareBusy !== null) return
    setShareBusy('copy')
    const result = await copyAnswerThreadShareLink(threadId)
    if (result.kind === 'copied') setShareRevoked(false)
    setShareBusy(null)
  }

  async function revokeShareLink(): Promise<void> {
    if (shareBusy !== null) return
    setShareBusy('revoke')
    const result = await revokeAnswerThreadShare(threadId)
    if (result.kind === 'revoked') {
      setShareRevoked(true)
      toast.success('Share link revoked.')
    } else if (result.kind === 'already_revoked') {
      setShareRevoked(true)
      toast.info('Share link already revoked.')
    } else {
      announceShareFailure(result, 'revoke')
    }
    setShareBusy(null)
  }

  return (
    <header className="sticky top-0 z-20 grid min-w-0 grid-cols-1 gap-2 border-b border-border bg-background px-4 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:px-6">
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
      <h1 dir="auto" style={{ unicodeBidi: 'isolate' }} className="col-start-1 row-start-2 min-w-0 truncate font-heading text-sm text-foreground md:col-start-2 md:col-span-1 md:row-start-1 md:text-lg">{displayTitle}</h1>
      <div className="col-start-1 row-start-3 flex min-w-0 flex-wrap items-center gap-2 md:col-start-3 md:row-start-1 md:flex-nowrap">
        {onNewQuestion === undefined ? (
          <Button asChild variant="secondary" size="sm" className="min-h-11">
            <a href="/">Ask another</a>
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" className="min-h-11" onClick={onNewQuestion}>
            Ask another
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => void copyShareLink()}
          disabled={shareBusy !== null}
          aria-busy={shareBusy === 'copy'}
        >
          <CopyIcon aria-hidden="true" />
          {shareBusy === 'copy' ? 'Preparing…' : 'Copy share link'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => void revokeShareLink()}
          disabled={shareBusy !== null || shareRevoked}
          aria-busy={shareBusy === 'revoke'}
        >
          <Link2OffIcon aria-hidden="true" />
          {shareBusy === 'revoke' ? 'Revoking…' : shareRevoked ? 'Share link revoked' : 'Revoke share link'}
        </Button>
      </div>
    </header>
  )
}
