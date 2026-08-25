import { SignInButton } from '@clerk/tanstack-react-start'
import { CheckIcon, CopyIcon, MenuIcon, PlusIcon, Share2Icon, UnlinkIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export function OperationChatHeader({
  authenticated,
  threadId,
  busy,
  shareState,
  sharePath,
  copied,
  mobileHistory,
  onNewChat,
  onIssueShare,
  onRevokeShare,
  onCopyShare,
}: Readonly<{
  authenticated: boolean
  threadId: string | null
  busy: boolean
  shareState?: 'none' | 'active' | 'revoked'
  sharePath: string | null
  copied: boolean
  mobileHistory: ReactNode
  onNewChat(): void
  onIssueShare(): void
  onRevokeShare(): void
  onCopyShare(): void
}>) {
  return (
    <>
      <header className="flex min-h-14 items-center gap-2 border-b border-border px-3 sm:px-4">
        {authenticated ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 lg:hidden" aria-label="Open conversation history">
                <MenuIcon aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(90vw,20rem)] p-0">
              <SheetHeader className="px-4 pt-4">
                <SheetTitle>Conversations</SheetTitle>
                <SheetDescription>Resume or manage your saved chats.</SheetDescription>
              </SheetHeader>
              {mobileHistory}
            </SheetContent>
          </Sheet>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{threadId === null ? 'New operation chat' : 'Operation chat'}</p>
          <p className="text-xs text-muted-foreground">{authenticated ? 'Saved to your account' : 'Private to this browser session'}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="New chat" onClick={onNewChat}>
          <PlusIcon aria-hidden="true" />
        </Button>
        {!authenticated ? (
          <SignInButton mode="modal">
            <Button type="button" variant="outline" className="min-h-11">Sign in</Button>
          </SignInButton>
        ) : null}
        {authenticated && threadId !== null ? (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={shareState === 'active' ? 'Get share link' : 'Create share link'} disabled={busy} onClick={onIssueShare}>
              <Share2Icon aria-hidden="true" />
            </Button>
            {shareState === 'active' ? (
              <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Revoke share link" disabled={busy} onClick={onRevokeShare}>
                <UnlinkIcon aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>
      {sharePath === null ? null : (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-4 py-2" role="status">
          <label htmlFor="operation-chat-share-link" className="text-xs font-medium">Read-only share link</label>
          <Input id="operation-chat-share-link" value={sharePath} readOnly className="min-h-11 min-w-48 flex-1 font-mono text-xs" />
          <Button type="button" variant="outline" className="min-h-11" onClick={onCopyShare}>
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
    </>
  )
}
