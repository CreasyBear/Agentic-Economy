import { createContext, useContext, type ReactNode } from 'react'
import { activityReturnScopeSchema, type ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
const ChatBuyerReturnContext = createContext<ActivityReturnScope | undefined>(undefined)
export function ChatBuyerReturnProvider({ threadId, children }: Readonly<{ threadId?: string; children: ReactNode }>) {
  const scope = threadId === undefined ? undefined : activityReturnScopeSchema.parse({ returnTo: 'chat', returnThread: threadId })
  return <ChatBuyerReturnContext.Provider value={scope}>{children}</ChatBuyerReturnContext.Provider>
}
export function useChatBuyerReturnScope() { return useContext(ChatBuyerReturnContext) }
