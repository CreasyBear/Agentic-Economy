import { createContext, useContext, useState, type ReactNode, type RefCallback } from 'react'
import { chatHeaderActionsId } from '@/lib/public/chat-ia'

export const ChatHeaderTargetContext = createContext<HTMLDivElement | null>(null)
const ChatHeaderRefContext = createContext<RefCallback<HTMLDivElement> | undefined>(undefined)

/** The shell registers its current node, including replacements after auth resolves. */
export function ChatHeaderSlotProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  return <ChatHeaderRefContext.Provider value={setTarget}>
    <ChatHeaderTargetContext.Provider value={target}>{children}</ChatHeaderTargetContext.Provider>
  </ChatHeaderRefContext.Provider>
}

export function ChatHeaderSlot() {
  const ref = useContext(ChatHeaderRefContext)
  return <div ref={ref} id={chatHeaderActionsId} className="flex min-w-0 flex-1 items-center gap-1" />
}
