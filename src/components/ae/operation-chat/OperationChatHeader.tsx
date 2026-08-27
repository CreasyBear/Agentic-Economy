import { SignInButton } from '@clerk/tanstack-react-start'
import { CheckIcon, CopyIcon, MenuIcon, PlusIcon, Share2Icon, UnlinkIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { chatHistory, chatStageDetail, chatStageTitle } from '@/lib/public/chat-ia'
import { AECON_MARK_SRC, aeconMarkClassName } from '@/content/brand-assets'

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
      <header className="flex min-h-14 items-center gap-related border-b border-border px-gutter">
        {authenticated ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="min-h-touch min-w-touch lg:hidden" aria-label={chatHistory.openHistory}>
                <MenuIcon aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(90vw,20rem)] p-0">
              <SheetHeader className="px-gutter pt-related">
                <SheetTitle>{chatHistory.sheetTitle}</SheetTitle>
                <SheetDescription>{chatHistory.sheetDescription}</SheetDescription>
              </SheetHeader>
              {mobileHistory}
            </SheetContent>
          </Sheet>
        ) : null}
        <a
          href="/"
          aria-label={chatHistory.home}
          className="flex min-h-touch min-w-touch shrink-0 items-center justify-center no-underline"
        >
          <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={aeconMarkClassName.chat} />
        </a>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{chatStageTitle(threadId)}</p>
          <p className="text-xs text-muted-foreground">{chatStageDetail(authenticated)}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="min-h-touch min-w-touch" aria-label={chatHistory.newChat} onClick={onNewChat}>
          <PlusIcon aria-hidden="true" />
        </Button>
        {!authenticated ? (
          <SignInButton mode="modal">
            <Button type="button" variant="outline" className="min-h-touch">{chatHistory.signIn}</Button>
          </SignInButton>
        ) : null}
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
          <FieldLabel htmlFor="operation-chat-share-link">{chatHistory.shareLabel}</FieldLabel>
          <InputGroup>
            <InputGroupInput id="operation-chat-share-link" value={sharePath} readOnly className="min-h-touch font-mono text-xs" />
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
