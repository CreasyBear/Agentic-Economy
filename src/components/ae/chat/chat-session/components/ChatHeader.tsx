// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/chat-header.tsx and components/chat/app-sidebar.tsx, Apache-2.0.
import { CheckIcon, CopyIcon, MenuIcon, PlusIcon, Share2Icon, UnlinkIcon } from 'lucide-react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/arc/drawer/Drawer'
import { Field, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { chatHistory, chatStageDetail, chatStageTitle } from '@/lib/public/chat-ia'

import type { ChatHeaderProps } from '../chat-session.contracts'
import { useChatHeaderSlot } from '../useChatHeaderSlot'
import '@/components/arc/chat/ChatNavigation.css'

export function ChatHeader({
  authenticated,
  threadId,
  threadTitle,
  busy,
  shareState,
  sharePath,
  copied,
  ownerChatEnabled,
  balanceLabel,
  balanceDescription,
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
    <div className="arc-market arc-chat arc-chat-header-controls">
      <Button type="button" variant="ghost" size="sm" className="arc-chat-nav-icon"
        aria-label="Toggle conversation history"
        onClick={() => { if (window.innerWidth >= 768 && authenticated) onToggleHistory(); else onMobileOpenChange(true) }}>
        <MenuIcon aria-hidden="true" />
      </Button>
      <Drawer open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DrawerContent side="left" title={chatHistory.sheetTitle} description={chatHistory.sheetDescription} className="arc-chat-history-drawer">
          {authenticated ? (
            <>
              <div className="arc-chat-history-sheet-main">{mobileHistory}</div>
              {((onEnableSpending !== undefined && !ownerChatEnabled) || threadId !== null) ? (
                <div className="arc-chat-history-sheet-actions">
                  {onEnableSpending !== undefined && !ownerChatEnabled ? (
                    <Button type="button" variant="ghost" labelLayout="wrap" className="arc-chat-history-sheet-action" disabled={busy}
                      onClick={onEnableSpending}>Enable approval-only chat spending</Button>
                  ) : null}
                  {threadId !== null ? (
                    <>
                      <Button type="button" variant="ghost" labelLayout="start" className="arc-chat-history-sheet-action" disabled={busy} onClick={onIssueShare}>{shareState === 'active' ? chatHistory.shareGet : chatHistory.shareCreate}</Button>
                      {shareState === 'active' ? <Button type="button" variant="ghost" labelLayout="start" className="arc-chat-history-sheet-action" disabled={busy} onClick={onRevokeShare}>{chatHistory.shareRevoke}</Button> : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="arc-chat-history-sign-in">
              Sign in to keep your chats. <a href="/sign-in" className="text-brand underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Sign in</a>
            </p>
          )}
        </DrawerContent>
      </Drawer>
      <h1 className="arc-chat-header-title" title={title}>{title}</h1>
      <p className="sr-only">{chatStageDetail(authenticated)}</p>
      <Button type="button" variant="ghost" size="sm" className="arc-chat-nav-icon" aria-label={chatHistory.newChat} onClick={onNewChat}>
        <PlusIcon aria-hidden="true" />
      </Button>
      {balanceLabel === undefined ? null : (
        <a href="/owner/credit" aria-label={`Available credit ${balanceLabel}`}
          aria-describedby={balanceDescription === undefined ? undefined : 'chat-credit-balance-description'}
          className="arc-chat-header-balance">
          {balanceLabel}
        </a>
      )}
      {balanceLabel === undefined || balanceDescription === undefined ? null : (
        <span id="chat-credit-balance-description" className="sr-only">{balanceDescription}</span>
      )}
      {authenticated && threadId !== null ? (
        <div className="arc-chat-header-sharing">
          <Button type="button" variant="ghost" size="sm" className="arc-chat-nav-icon" aria-label={shareState === 'active' ? chatHistory.shareGet : chatHistory.shareCreate} disabled={busy} onClick={onIssueShare}>
            <Share2Icon aria-hidden="true" />
          </Button>
          {shareState === 'active' ? (
            <Button type="button" variant="ghost" size="sm" className="arc-chat-nav-icon" aria-label={chatHistory.shareRevoke} disabled={busy} onClick={onRevokeShare}>
              <UnlinkIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
  return (
    <>
      {slot === null ? (
        <header className="arc-market arc-chat arc-chat-header">
          {controls}
        </header>
      ) : createPortal(controls, slot)}
      {enableProblem ? (
        <p className="arc-market arc-chat arc-chat-header-problem" role="alert">
          {enableProblem}{' '}
          <a href="/owner/settings/account/security" className="underline underline-offset-4 focus-visible:outline-2">Verify it is you</a>
        </p>
      ) : null}
      {sharePath === null ? null : (
        <Field className="arc-market arc-chat arc-chat-share-field" role="status">
          <FieldLabel htmlFor="tool-chat-share-link">{chatHistory.shareLabel}</FieldLabel>
          <InputGroup>
            <InputGroupInput id="tool-chat-share-link" value={sharePath} readOnly className="min-h-touch font-mono" />
            <InputGroupAddon align="inline-end">
              <Button type="button" variant="secondary" size="sm" onClick={onCopyShare}>
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
