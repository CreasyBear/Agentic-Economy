import { AeChatPage } from '@/components/ae/layout/AeChatPage'

import { ChatTranscript } from '../../ChatTranscript'
import type { ChatSessionModel } from '../chat-session.contracts'
import { ChatComposer } from './ChatComposer'
import { ChatHeader } from './ChatHeader'

export type ChatLayoutProps = Readonly<{
  model: ChatSessionModel
}>

export function ChatLayout({ model }: ChatLayoutProps) {
  return (
    <AeChatPage
      header={
        <ChatHeader
          {...model.header}
          mobileHistory={model.showHistoryRail ? model.createHistoryPanel('history') : null}
        />
      }
      dock={
        <ChatComposer {...model.composer} />
      }
      {...model.pageBusy ? { busy: true } : {}}
    >
      <ChatTranscript {...model.transcript} />
    </AeChatPage>
  )
}
