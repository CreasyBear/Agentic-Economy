// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/shell.tsx and components/chat/app-sidebar.tsx, Apache-2.0.
import { ErrorBoundary } from '@sentry/react'
import { useEffect, useState } from 'react'
import { ArcAiChatDock, ArcAiChatFrame } from '@/components/arc/blocks/ai-chat/ai-chat'
import buttonStyles from '@/components/arc/button/button.module.css'
import '@/components/arc/chat/ChatComposition.css'
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
        <div className="arc-chat-private">
          <h1>Sign in to open this chat</h1>
          <p>This conversation is private. Sign in to return to this page.</p>
          <a href={model.signInToThread.href} className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>Sign in</a>
        </div>
      </AeChatPage>
    )
  }
  return (
    <ArcAiChatFrame sidebarOpen={historyOpen} onNewChat={model.header.onNewChat}
      sidebar={model.showHistoryRail ? historyOpen ? <ErrorBoundary key={String(model.header.threadId) + ':' + historyVersion}
        fallback={<RecoveryNotice reason="history_unavailable" onRetry={retryHistory} onNewChat={model.header.onNewChat} className="arc-chat-sidebar-recovery" />}>
        {model.createHistoryPanel('rail')}
      </ErrorBoundary> : <></> : null}>
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
                  fallback={<RecoveryNotice className="arc-chat-sidebar-recovery" reason="history_unavailable" onRetry={retryHistory} onNewChat={model.header.onNewChat} />}>
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
        <div className="arc-chat-live-main">
          {offline ? (
            <div className="arc-chat-offline">
              <RecoveryNotice reason="network_offline" onRetry={retryConnection} onEdit={focusPrompt} />
            </div>
          ) : null}
          <ChatTranscript {...model.transcript} ownerChatEnabled={ownerChatEnabled}
            onRunTool={model.onRunTool}
            enableSpendingBusy={enableSpendingBusy}
            {...(onAddCredit === undefined ? {} : { onAddCredit })}
            {...(onEnableSpending === undefined ? {} : { onEnableSpending })} />
          <ArcAiChatDock>
                {empty && model.transcript.onStarter ? (
                  <div className="arc-chat-starters"><ChatSuggestedActions onPick={model.transcript.onStarter} /></div>
                ) : null}
                <ChatComposer {...model.composer} />
          </ArcAiChatDock>
        </div>
      </AeChatPage>
    </ArcAiChatFrame>
  )
}
