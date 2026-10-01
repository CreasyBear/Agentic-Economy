// Preserves the shadcn ScrollArea API expected by AI Elements using installed Base UI primitives.
import { Children, isValidElement, type ReactNode } from 'react'
import { ScrollArea as Primitive } from '@base-ui/react/scroll-area'
import { cn } from '@/lib/utils'
import type { ScrollAreaProps, ScrollBarProps } from './scroll-area.contracts'

export function ScrollArea({ children, className, ...props }: ScrollAreaProps) {
  const content: ReactNode[] = []
  const scrollbars: ReactNode[] = []
  Children.forEach(children, child => {
    if (isValidElement(child) && child.type === ScrollBar) scrollbars.push(child)
    else content.push(child)
  })
  return (
    <Primitive.Root className={cn('relative min-w-0 overflow-hidden', className)} {...props}>
      <Primitive.Viewport className="h-full w-full focus-visible:outline-2 focus-visible:outline-ring">
        <Primitive.Content className="w-max min-w-full">{content}</Primitive.Content>
      </Primitive.Viewport>
      {scrollbars}
      <Primitive.Corner />
    </Primitive.Root>
  )
}

export function ScrollBar({ className, orientation = 'vertical', ...props }: ScrollBarProps) {
  return (
    <Primitive.Scrollbar
      className={cn('relative flex touch-none select-none', className)}
      orientation={orientation}
      {...props}
    >
      <Primitive.Thumb className="flex-1 rounded-full bg-muted-foreground/40" />
    </Primitive.Scrollbar>
  )
}
