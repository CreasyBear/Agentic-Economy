import { useContext } from 'react'
import { ChatHeaderTargetContext } from '@/components/ae/layout/app-shell/ChatHeaderSlot'

export function useChatHeaderSlot(): HTMLElement | null {
  return useContext(ChatHeaderTargetContext)
}
