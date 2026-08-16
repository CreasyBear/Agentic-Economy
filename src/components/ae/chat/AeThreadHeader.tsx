import { useState } from 'react'
import { CopyIcon, EllipsisVerticalIcon, Link2OffIcon, PanelLeftIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { neutralizeBidiFormattingControls } from '@/modules/answer/public'
import { toast } from '@/lib/ui/toast'
import { announceShareFailure, copyAnswerThreadShareLink, revokeAnswerThreadShare } from './copy-thread-link'

export type AeThreadHeaderProps = {
  title: string
  threadId?: string
  showSidebarButton?: boolean
  mobileSidebarOpen?: boolean
  desktopSidebarExpanded?: boolean
  onOpenMobileSidebar?: () => void
  onToggleDesktopSidebar?: () => void
  onNewQuestion?: () => void
}

export function AeThreadHeader({
  title,
  threadId,
  showSidebarButton = false,
  mobileSidebarOpen = false,
  desktopSidebarExpanded = false,
  onOpenMobileSidebar,
  onToggleDesktopSidebar,
  onNewQuestion,
}: AeThreadHeaderProps) {
  const displayTitle = neutralizeBidiFormattingControls(title)


  return (
    <header className="h-14 border-b border-border bg-background">
      <div className="flex h-full w-full min-w-0 items-center gap-2 px-4 md:px-6">
        {showSidebarButton && onOpenMobileSidebar !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11 lg:hidden"
            aria-label="Open recent chats"
            onClick={onOpenMobileSidebar}
            aria-controls="ae-thread-mobile-sidebar"
            aria-expanded={mobileSidebarOpen}
          >
            <PanelLeftIcon aria-hidden="true" />
          </Button>
        ) : null}
        {showSidebarButton && onToggleDesktopSidebar !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden min-h-11 min-w-11 lg:inline-flex"
            aria-label={desktopSidebarExpanded ? 'Hide recent chats' : 'Show recent chats'}
            onClick={onToggleDesktopSidebar}
            aria-controls="ae-thread-sidebar"
            aria-expanded={desktopSidebarExpanded}
          >
            <PanelLeftIcon aria-hidden="true" />
          </Button>
        ) : null}
        {threadId === undefined ? (
          <p
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
            className="min-w-0 flex-1 truncate font-heading text-sm text-foreground md:text-lg"
          >
            {displayTitle}
          </p>
        ) : (
          <h1
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
            className="min-w-0 flex-1 truncate font-heading text-sm text-foreground md:text-lg"
          >
            {displayTitle}
          </h1>
        )}
        {onNewQuestion === undefined ? (
          <Button asChild variant="secondary" size="sm">
            <a href="/">New chat</a>
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={onNewQuestion}>
            New chat
          </Button>
        )}
        {threadId === undefined ? null : <AeThreadShareActions key={threadId} threadId={threadId} />}
      </div>
    </header>
  )
}

function AeThreadShareActions({ threadId }: { threadId: string }) {
  const [shareBusy, setShareBusy] = useState<'copy' | 'revoke' | null>(null)
  const [shareRevoked, setShareRevoked] = useState(false)

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Chat actions"
          aria-busy={shareBusy !== null}
        >
          <EllipsisVerticalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="whitespace-normal text-xs font-normal leading-relaxed text-muted-foreground">
          This chat is private unless you share it. Shared links are read-only until you revoke the link or delete the chat.
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => void copyShareLink()} disabled={shareBusy !== null}>
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
  )
}
