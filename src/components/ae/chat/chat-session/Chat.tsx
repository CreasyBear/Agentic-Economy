import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { useChatNeedActions, useChatSession } from './useChatSession'
import { ChatNeedActionsContext } from '../ToolCard'
import { ChatLayout } from './components/ChatLayout'
import type { ChatProps } from './chat-session.contracts'

export function Chat(props: ChatProps) {
  const model = useChatSession(props)
  const grantStatus = useQuery(api.chatTurns.ownerChatGrantStatus,
    model.header.authenticated ? {} : 'skip')
  const needActions = useChatNeedActions()
  return (
    <ChatNeedActionsContext.Provider value={needActions}>
      <ChatLayout
        model={model}
        ownerChatEnabled={grantStatus?.enabled === true}
        enableSpendingBusy={model.header.busy}
        {...(grantStatus !== undefined && model.header.onEnableSpending !== undefined
          ? { onEnableSpending: model.header.onEnableSpending }
          : {})}
      />
    </ChatNeedActionsContext.Provider>
  )
}

