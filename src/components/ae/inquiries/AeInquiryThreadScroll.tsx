import type { ReactNode } from 'react'


export type AeInquiryThreadScrollProps = {
  children: ReactNode
  className?: string
}

export function AeInquiryThreadScroll({ children, className }: AeInquiryThreadScrollProps) {
  return (
    <div className={`max-h-[min(32rem,60vh)] overflow-auto pr-3 ${className ?? ''}`}>
      <div className="grid gap-3 pb-1">{children}</div>
    </div>
  )
}
