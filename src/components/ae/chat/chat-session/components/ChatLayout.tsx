// Adapted from vercel/ai-chatbot, c2f8235e1f3ea903ad8b7f61447c4f74164b5c58, components/chat/shell.tsx (formerly chat.tsx), Apache-2.0.
import { AeChatPage } from '@/components/ae/layout/AeChatPage'

import { ChatTranscript } from '../../ChatTranscript'
import type { ChatSessionModel } from '../chat-session.contracts'
import { ChatSuggestedActions } from './ChatSuggestedActions'
import { ChatComposer } from './ChatComposer'
import { ChatHeader } from './ChatHeader'

export type ChatLayoutProps = Readonly<{
  model: ChatSessionModel
}>

export function ChatLayout({ model }: ChatLayoutProps) {
  const empty = !model.pageBusy && !model.transcript.pending && model.transcript.messages.length === 0
  return (
    <AeChatPage
      header={
        <ChatHeader
          {...model.header}
          mobileHistory={model.showHistoryRail ? model.createHistoryPanel('history') : null}
        />
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
  )
}
