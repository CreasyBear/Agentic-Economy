import { useState } from 'react'
import { CopyIcon, EllipsisVerticalIcon, Link2OffIcon, PanelLeftIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    <header className="sticky top-0 z-20 h-14 border-b border-border bg-background">
      <div className="mx-auto flex h-full w-full max-w-2xl min-w-0 items-center gap-2 px-4 md:px-6">
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
        <h1
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
          className="min-w-0 flex-1 truncate font-heading text-sm text-foreground md:text-lg"
        >
          {displayTitle}
        </h1>
        {onNewQuestion === undefined ? (
          <Button asChild variant="secondary" size="sm">
            <a href="/">Ask another</a>
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={onNewQuestion}>
            Ask another
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Thread actions"
              aria-busy={shareBusy !== null}
            >
              <EllipsisVerticalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => void copyShareLink()}
                disabled={shareBusy !== null}
              >
                <CopyIcon aria-hidden="true" />
                {shareBusy === 'copy' ? 'Preparing share link…' : 'Copy share link'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void revokeShareLink()}
                disabled={shareBusy !== null || shareRevoked}
              >
                <Link2OffIcon aria-hidden="true" />
                {shareBusy === 'revoke' ? 'Revoking share link…' : shareRevoked ? 'Share link revoked' : 'Revoke share link'}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
