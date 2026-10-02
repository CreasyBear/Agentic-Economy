// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/shell.tsx and components/chat/app-sidebar.tsx, Apache-2.0.
import { ErrorBoundary } from '@sentry/react'
import { useEffect, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AeChatPage } from '@/components/ae/layout/AeChatPage'

import { ChatTranscript } from '../../ChatTranscript'
import type { ChatLayoutProps } from '../chat-session.contracts'
import { ChatSuggestedActions } from './ChatSuggestedActions'
import { ChatComposer } from './ChatComposer'
import { ChatHeader } from './ChatHeader'
import { ChatHeaderAuthorityContainer } from '../ChatHeaderAuthorityContainer'
import { RecoveryNotice } from '../../recovery/RecoveryNotice'


export function ChatLayout({ model, ownerChatEnabled = false, enableSpendingBusy = model.header.busy, onEnableSpending, onAddCredit, balanceLabel, balanceDescription }: ChatLayoutProps) {
  const [historyOpen, setHistoryOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [offline, setOffline] = useState(false)
  const [historyVersion, setHistoryVersion] = useState(0)
  useEffect(() => {
    const syncOffline = () => setOffline(!navigator.onLine)
    syncOffline()
    window.addEventListener('online', syncOffline)
    window.addEventListener('offline', syncOffline)
    return () => {
      window.removeEventListener('online', syncOffline)
      window.removeEventListener('offline', syncOffline)
    }
  }, [])
  const retryHistory = () => setHistoryVersion(version => version + 1)
  const retryConnection = () => setOffline(!navigator.onLine)
  const focusPrompt = () => document.getElementById('tool-chat-prompt')?.focus()
  useEffect(() => {
    if (document.cookie.split('; ').includes('chat_sidebar_state=false')) setHistoryOpen(false)
  }, [])
  const toggleHistory = () => {
    setHistoryOpen(open => {
      document.cookie = `chat_sidebar_state=${!open}; path=/; max-age=604800; SameSite=Lax`
      return !open
    })
  }
  const empty = !model.pageBusy && !model.transcript.pending && model.transcript.messages.length === 0
  const fallbackHeader = { ...model.header }
  delete fallbackHeader.onEnableSpending
  if (model.signInToThread !== undefined) {
    return (
      <AeChatPage header={null} dock={null}>
        <div className="mx-auto flex w-full max-w-prose flex-col gap-4 px-4 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to open this chat</h1>
          <p className="text-muted-foreground">This conversation is private. Sign in to return to this page.</p>
          <a href={model.signInToThread.href} className="inline-flex min-h-10 w-fit items-center rounded-md bg-foreground px-4 text-sm text-background">Sign in</a>
        </div>
      </AeChatPage>
    )
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      {model.showHistoryRail ? (
        <aside aria-label="Conversation history" className={`hidden h-full shrink-0 flex-col border-r border-border bg-card text-foreground md:flex ${historyOpen ? 'w-64' : 'w-12'}`}>
          {historyOpen
            ? <ErrorBoundary key={`${model.header.threadId}:${historyVersion}`}
                fallback={<RecoveryNotice className="m-3" reason="history_unavailable" onRetry={retryHistory} onNewChat={model.header.onNewChat} />}>
                {model.createHistoryPanel('rail')}
              </ErrorBoundary>
            : <Button type="button" variant="ghost" size="icon" className="m-1 min-h-10 min-w-10" aria-label="New chat" onClick={model.header.onNewChat}><PlusIcon aria-hidden="true" /></Button>}
        </aside>
      ) : null}
      <AeChatPage
        header={
          <ErrorBoundary key={model.header.threadId} fallback={<ChatHeader {...fallbackHeader}
            balanceLabel={balanceLabel} balanceDescription={balanceDescription} mobileHistory={null} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} onToggleHistory={toggleHistory} />}>
            <ChatHeaderAuthorityContainer
              {...fallbackHeader}
              balanceLabel={balanceLabel}
              balanceDescription={balanceDescription}
              ownerChatEnabled={ownerChatEnabled}
              mobileHistory={model.showHistoryRail ? (
                <ErrorBoundary key={`${model.header.threadId}:${historyVersion}`}
                  fallback={<RecoveryNotice className="m-3" reason="history_unavailable" onRetry={retryHistory} onNewChat={model.header.onNewChat} />}>
                  {model.createHistoryPanel('history', () => setMobileOpen(false))}
                </ErrorBoundary>
              ) : null}
              mobileOpen={mobileOpen}
              onMobileOpenChange={setMobileOpen}
              onToggleHistory={toggleHistory}
            />
          </ErrorBoundary>
        }
        dock={null}
        {...model.pageBusy ? { busy: true } : {}}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {offline ? (
            <div className="px-4 pt-3">
              <RecoveryNotice reason="network_offline" onRetry={retryConnection} onEdit={focusPrompt} />
            </div>
          ) : null}
          <ChatTranscript {...model.transcript} ownerChatEnabled={ownerChatEnabled}
            onRunTool={model.onRunTool}
            enableSpendingBusy={enableSpendingBusy}
            {...(onAddCredit === undefined ? {} : { onAddCredit })}
            {...(onEnableSpending === undefined ? {} : { onEnableSpending })} />
          <div className="sticky bottom-0 z-10 w-full shrink-0 bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4">
            <div className="mx-auto grid w-full max-w-[1200px] grid-cols-12 gap-x-2 px-[5px] sm:px-0">
              <div className="col-span-12 min-w-0 md:col-start-3 md:col-span-8">
                {empty && model.transcript.onStarter ? (
                  <div className="mb-3"><ChatSuggestedActions onPick={model.transcript.onStarter} /></div>
                ) : null}
                <ChatComposer {...model.composer} />
              </div>
            </div>
          </div>
        </div>
      </AeChatPage>
    </div>
  )
}
