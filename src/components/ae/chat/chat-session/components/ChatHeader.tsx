// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/chat-header.tsx and components/chat/app-sidebar.tsx, Apache-2.0.
import { CheckIcon, CopyIcon, MenuIcon, PlusIcon, Share2Icon, UnlinkIcon } from 'lucide-react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
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
  mobileOpen,
  onMobileOpenChange,
  onToggleHistory,
  onNewChat,
  onIssueShare,
  onRevokeShare,
  onCopyShare,
}: ChatHeaderProps) {
  const slot = useChatHeaderSlot()
  const title = chatStageTitle(threadTitle)
  const controls = (
    <>
      <Button type="button" variant="ghost" size="icon" className="min-h-touch min-w-touch max-sm:!size-8 max-sm:!min-h-8 max-sm:!min-w-8 [&_svg]:size-5"
        aria-label="Toggle conversation history"
        onClick={() => { if (window.innerWidth >= 768 && authenticated) onToggleHistory(); else onMobileOpenChange(true) }}>
        <MenuIcon aria-hidden="true" />
      </Button>
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-[min(90vw,18rem)] gap-0 p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>{chatHistory.sheetTitle}</SheetTitle>
            <SheetDescription className="sr-only">{chatHistory.sheetDescription}</SheetDescription>
          </SheetHeader>
          {authenticated ? (
            <>
              <div className="min-h-0 flex-1">{mobileHistory}</div>
              {((onEnableSpending !== undefined && !ownerChatEnabled) || threadId !== null) ? (
                <div className="grid shrink-0 border-t border-border px-3 py-2">
                  {onEnableSpending !== undefined && !ownerChatEnabled ? (
                    <Button type="button" variant="ghost" className="h-auto justify-start whitespace-normal px-3 py-2 text-left text-xs" disabled={busy}
                      onClick={onEnableSpending}>Enable approval-only chat spending</Button>
                  ) : null}
                  {threadId !== null ? (
                    <>
                      <Button type="button" variant="ghost" className="justify-start" disabled={busy} onClick={onIssueShare}>{shareState === 'active' ? chatHistory.shareGet : chatHistory.shareCreate}</Button>
                      {shareState === 'active' ? <Button type="button" variant="ghost" className="justify-start" disabled={busy} onClick={onRevokeShare}>{chatHistory.shareRevoke}</Button> : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              Sign in to keep your chats. <a href="/sign-in" className="text-brand underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand">Sign in</a>
            </p>
          )}
        </SheetContent>
      </Sheet>
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
