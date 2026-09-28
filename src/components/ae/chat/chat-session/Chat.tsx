import { useChatNeedActions, useChatSession } from './useChatSession'
import { ChatNeedActionsContext } from '../ToolCard'
import { ChatLayout } from './components/ChatLayout'
import type { ChatProps } from './chat-session.contracts'

export function Chat(props: ChatProps) {
  const model = useChatSession(props)
  const needActions = useChatNeedActions()
  return <ChatNeedActionsContext.Provider value={needActions}><ChatLayout model={model} /></ChatNeedActionsContext.Provider>
}
