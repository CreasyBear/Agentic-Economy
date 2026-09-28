import type { ChatHistoryPanelProps } from '../chat-session.contracts'
import { ChatHistory } from './ChatHistory'

export function ChatHistoryPanel(props: ChatHistoryPanelProps) {
  return <ChatHistory {...props} />
}
