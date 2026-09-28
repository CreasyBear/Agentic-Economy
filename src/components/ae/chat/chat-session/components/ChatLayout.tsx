// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/shell.tsx and components/chat/app-sidebar.tsx, Apache-2.0.
import { ErrorBoundary } from '@sentry/react'
import { useEffect, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AeChatPage } from '@/components/ae/layout/AeChatPage'

import { ChatTranscript } from '../../ChatTranscript'
import type { ChatSessionModel } from '../chat-session.contracts'
import { ChatSuggestedActions } from './ChatSuggestedActions'
import { ChatComposer } from './ChatComposer'
import { ChatHeader } from './ChatHeader'
import { ChatHeaderAuthorityContainer } from '../ChatHeaderAuthorityContainer'

export type ChatLayoutProps = Readonly<{
  model: ChatSessionModel
}>

export function ChatLayout({ model }: ChatLayoutProps) {
  const [historyOpen, setHistoryOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
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
  const { onEnableSpending: _onEnableSpending, ...fallbackHeader } = model.header
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      {model.showHistoryRail ? (
        <aside aria-label="Conversation history" className={`hidden h-full shrink-0 flex-col border-r border-border bg-card text-foreground md:flex ${historyOpen ? 'w-64' : 'w-12'}`}>
          {historyOpen
            ? <ErrorBoundary key={model.header.threadId} fallback={<a href="/market" className="m-3 text-sm underline">Browse Tools</a>}>
                {model.createHistoryPanel('rail')}
              </ErrorBoundary>
            : <Button type="button" variant="ghost" size="icon" className="m-1 min-h-10 min-w-10" aria-label="New chat" onClick={model.header.onNewChat}><PlusIcon aria-hidden="true" /></Button>}
        </aside>
      ) : null}
      <AeChatPage
        header={
          <ErrorBoundary key={model.header.threadId} fallback={<ChatHeader {...fallbackHeader}
            mobileHistory={null} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} onToggleHistory={toggleHistory} />}>
            <ChatHeaderAuthorityContainer
              {...model.header}
              mobileHistory={model.showHistoryRail ? (
                <ErrorBoundary key={model.header.threadId} fallback={<a href="/market" className="m-3 text-sm underline">Browse Tools</a>}>
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
          <ChatTranscript {...model.transcript} />
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
