import { memo, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: MessageRole
}

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      data-slot="ai-message"
      data-from={from}
      className={cn(
        'group/ai-message flex w-full flex-col gap-2',
        from === 'user' ? 'ml-auto max-w-[min(36rem,92%)] items-end' : 'items-start',
        className,
      )}
      {...props}
    />
  )
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export function MessageContent({ className, ...props }: MessageContentProps) {
  return (
    <div
      data-slot="ai-message-content"
      className={cn(
        'flex w-fit max-w-full min-w-0 flex-col gap-2 break-words text-sm leading-relaxed text-primary group-data-[from=user]/ai-message:rounded-sm group-data-[from=user]/ai-message:border group-data-[from=user]/ai-message:border-border-strong group-data-[from=user]/ai-message:bg-card group-data-[from=user]/ai-message:px-3 group-data-[from=user]/ai-message:py-2 group-data-[from=assistant]/ai-message:w-full',
        className,
      )}
      {...props}
    />
  )
}


export type MessageResponseProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export const MessageResponse = memo(function MessageResponse({
  className,
  children,
  ...props
}: MessageResponseProps) {
  return (
    <div
      className={cn(
        'size-full text-pretty whitespace-pre-wrap break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
})
