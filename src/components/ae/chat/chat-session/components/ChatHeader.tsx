import { CheckIcon, CopyIcon, MenuIcon, PlusIcon, Share2Icon, UnlinkIcon } from 'lucide-react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { chatHistory, chatStageDetail, chatStageTitle } from '@/lib/public/chat-ia'

import type { ChatHeaderProps } from '../chat-session.contracts'
import { useChatHeaderSlot } from '../useChatHeaderSlot'

export function ChatHeader({
  authenticated,
  threadId,
  threadTitle,
  busy,
  shareState,
  sharePath,
  copied,
  ownerChatEnabled,
  enableProblem,
  onEnableSpending,
  mobileHistory,
  onNewChat,
  onIssueShare,
  onRevokeShare,
  onCopyShare,
}: ChatHeaderProps) {
  const slot = useChatHeaderSlot()
  const title = chatStageTitle(threadTitle)
  const controls = (
    <>
      {authenticated ? (
        <Sheet>
          <SheetTrigger
            render={
              <Button type="button" variant="ghost" size="icon" className="min-h-touch min-w-touch max-sm:!size-8 max-sm:!min-h-8 max-sm:!min-w-8 [&_svg]:size-5" aria-label={chatHistory.openHistory}>
                <MenuIcon aria-hidden="true" />
              </Button>
            }
          />
          <SheetContent side="left" className="w-[min(90vw,20rem)] p-0">
            <SheetHeader className="px-gutter pt-related">
              <SheetTitle>{chatHistory.sheetTitle}</SheetTitle>
              <SheetDescription>{chatHistory.sheetDescription}</SheetDescription>
            </SheetHeader>
            {authenticated && onEnableSpending !== undefined && !ownerChatEnabled ? (
              <Button type="button" variant="ghost" className="mx-3 h-auto justify-start rounded-md px-3 py-3 text-left text-sm whitespace-normal" disabled={busy}
                onClick={onEnableSpending}>Enable approval-only chat spending</Button>
            ) : null}
            {authenticated && threadId !== null ? (
              <div className="grid px-3">
                <Button type="button" variant="ghost" className="justify-start" disabled={busy} onClick={onIssueShare}>{shareState === 'active' ? chatHistory.shareGet : chatHistory.shareCreate}</Button>
                {shareState === 'active' ? <Button type="button" variant="ghost" className="justify-start" disabled={busy} onClick={onRevokeShare}>{chatHistory.shareRevoke}</Button> : null}
              </div>
            ) : null}
            {mobileHistory}
          </SheetContent>
        </Sheet>
      ) : null}
      <h1 className="order-first min-w-0 flex-1 truncate text-sm font-medium sm:order-none" title={title}>{title}</h1>
      <p className="sr-only">{chatStageDetail(authenticated)}</p>
      <Button type="button" variant="ghost" size="icon" className="min-h-touch min-w-touch max-sm:!size-8 max-sm:!min-h-8 max-sm:!min-w-8 [&_svg]:size-5" aria-label={chatHistory.newChat} onClick={onNewChat}>
        <PlusIcon aria-hidden="true" />
      </Button>
      {authenticated && threadId !== null ? (
        <div className="hidden items-center gap-intra sm:flex">
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
    </>
  )
  return (
    <>
      {slot === null ? (
        <header className="flex min-h-11 shrink-0 items-center gap-1 px-4 sm:min-h-14 sm:gap-2 sm:px-6">
          {controls}
        </header>
      ) : createPortal(controls, slot)}
      {enableProblem ? (
        <p className="bg-card/50 px-gutter py-intra text-sm text-destructive" role="alert">
          {enableProblem}{' '}
          <a href="/owner/settings/account/security" className="underline underline-offset-4 focus-visible:outline-2">Verify it is you</a>
        </p>
      ) : null}
      {sharePath === null ? null : (
        <Field className="bg-card/50 px-gutter py-intra" role="status">
          <FieldLabel htmlFor="tool-chat-share-link">{chatHistory.shareLabel}</FieldLabel>
          <InputGroup>
            <InputGroupInput id="tool-chat-share-link" value={sharePath} readOnly className="min-h-touch font-mono" />
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
