import type { ReactNode } from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'

export type AeInquiryThreadScrollProps = {
  children: ReactNode
  className?: string
}

export function AeInquiryThreadScroll({ children, className }: AeInquiryThreadScrollProps) {
  return (
    <ScrollArea className={`ae-inquiry-thread-scroll max-h-[min(32rem,60vh)] pr-3 ${className ?? ''}`}>
      <div className="grid gap-3 pb-1">{children}</div>
    </ScrollArea>
  )
}
