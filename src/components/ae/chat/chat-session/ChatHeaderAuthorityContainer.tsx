import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import type { ChatHeaderProps } from './chat-session.contracts'
import { ChatHeaderAuthority } from './components/ChatHeaderAuthority'

export function ChatHeaderAuthorityContainer(props: ChatHeaderProps) {
  const shareState = useQuery(api.chatShares.getShareState,
    props.authenticated && props.threadId !== null ? { threadId: props.threadId } : 'skip')
  return <ChatHeaderAuthority {...props}
    {...(shareState === undefined ? {} : { shareState: shareState.state })}
  />
}
