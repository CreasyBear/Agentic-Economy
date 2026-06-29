import * as React from 'react'

import { cn } from '@/lib/utils'

function Empty({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty"
      className={cn('grid gap-4 rounded-lg bg-card p-6 text-card-foreground shadow-[var(--ae-shadow-border)]', className)}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-header" className={cn('grid gap-2', className)} {...props} />
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 data-slot="empty-title" className={cn('text-balance font-heading text-lg font-medium text-foreground', className)} {...props} />
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="empty-description" className={cn('max-w-2xl text-pretty text-sm leading-6 text-muted-foreground', className)} {...props} />
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-content" className={cn('flex flex-wrap gap-2', className)} {...props} />
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle }
