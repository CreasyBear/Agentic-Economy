import { CheckIcon, CopyIcon, MenuIcon, PlusIcon, Share2Icon, UnlinkIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { chatHistory, chatStageDetail, chatStageTitle } from '@/lib/public/chat-ia'

import type { ChatHeaderProps } from '../chat-session.contracts'

export function ChatHeader({
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
}: ChatHeaderProps) {
  return (
    <>
      <header className="flex min-h-14 items-center gap-related border-b border-border px-gutter">
        {authenticated ? (
          <Sheet>
            <SheetTrigger
              render={
                <Button type="button" variant="ghost" size="icon" className="min-h-touch min-w-touch lg:hidden" aria-label={chatHistory.openHistory}>
                  <MenuIcon aria-hidden="true" />
                </Button>
              }
            />
            <SheetContent side="left" className="w-[min(90vw,20rem)] p-0">
              <SheetHeader className="px-gutter pt-related">
                <SheetTitle>{chatHistory.sheetTitle}</SheetTitle>
                <SheetDescription>{chatHistory.sheetDescription}</SheetDescription>
              </SheetHeader>
              {mobileHistory}
            </SheetContent>
          </Sheet>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{chatStageTitle(threadId)}</p>
          <p className="text-xs text-muted-foreground">{chatStageDetail(authenticated)}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="min-h-touch min-w-touch" aria-label={chatHistory.newChat} onClick={onNewChat}>
          <PlusIcon aria-hidden="true" />
        </Button>
        {authenticated && threadId !== null ? (
          <div className="flex items-center gap-intra">
            <Button type="button" variant="ghost" size="icon" className="min-h-touch min-w-touch" aria-label={shareState === 'active' ? chatHistory.shareGet : chatHistory.shareCreate} disabled={busy} onClick={onIssueShare}>
              <Share2Icon aria-hidden="true" />
            </Button>
            {shareState === 'active' ? (
              <Button type="button" variant="ghost" size="icon" className="min-h-touch min-w-touch" aria-label={chatHistory.shareRevoke} disabled={busy} onClick={onRevokeShare}>
                <UnlinkIcon aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>
      {sharePath === null ? null : (
        <Field className="border-b border-border bg-muted px-gutter py-intra" role="status">
          <FieldLabel htmlFor="tool-chat-share-link">{chatHistory.shareLabel}</FieldLabel>
          <InputGroup>
            <InputGroupInput id="tool-chat-share-link" value={sharePath} readOnly className="min-h-touch font-mono text-xs" />
            <InputGroupAddon align="inline-end">
              <Button type="button" variant="outline" className="min-h-touch" onClick={onCopyShare}>
                {copied
                  ? <CheckIcon data-icon="inline-start" aria-hidden="true" />
                  : <CopyIcon data-icon="inline-start" aria-hidden="true" />}
                {copied ? chatHistory.copied : chatHistory.copy}
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      )}
    </>
  )
}
