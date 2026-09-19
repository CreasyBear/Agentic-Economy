import { useChatSession } from './useChatSession'
import { ChatLayout } from './components/ChatLayout'
import type { ChatProps } from './chat-session.contracts'

export function Chat(props: ChatProps) {
  const model = useChatSession(props)
  return <ChatLayout model={model} />
}
