import { useLayoutEffect, useState } from 'react'

import { chatHeaderActionsId } from '@/lib/public/chat-ia'

export function useChatHeaderSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setSlot(document.getElementById(chatHeaderActionsId))
  }, [])
  return slot
}
