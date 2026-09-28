import type { ChatHeaderProps } from '../chat-session.contracts'
import { ChatHeader } from './ChatHeader'

export function ChatHeaderAuthority(props: ChatHeaderProps) {
  return <ChatHeader {...props} />
}
