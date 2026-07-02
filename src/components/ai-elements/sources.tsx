import { BookOpenIcon, ChevronDownIcon } from 'lucide-react'
import type { ComponentProps } from 'react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export type SourcesProps = ComponentProps<typeof Collapsible>

export function Sources({ className, ...props }: SourcesProps) {
  return (
    <Collapsible
      data-slot="ai-sources"
      className={cn('not-prose text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number
}

export function SourcesTrigger({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        'ae-ai-sources-trigger group/ai-sources-trigger flex items-center gap-2 rounded-[var(--ae-radius-sm)] text-xs font-medium',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <span>{count === 1 ? '1 published source' : `${count} published sources`}</span>
          <ChevronDownIcon
            data-icon="inline-end"
            className="transition-transform group-data-[state=open]/ai-sources-trigger:rotate-180"
            aria-hidden="true"
          />
        </>
      )}
    </CollapsibleTrigger>
  )
}

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>

export function SourcesContent({ className, ...props }: SourcesContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        'ae-ai-collapsible-content ae-ai-sources-content mt-2 flex w-full flex-col gap-2 outline-none',
        className,
      )}
      {...props}
    />
  )
}

export type SourceProps = ComponentProps<'a'>

export function Source({ className, href, title, children, ...props }: SourceProps) {
  const external = typeof href === 'string' && /^https?:\/\//i.test(href)

  return (
    <a
      className={cn(
        'ae-ai-source-link flex min-w-0 items-center gap-2 rounded-[var(--ae-radius-sm)] px-3 py-2',
        className,
      )}
      href={href}
      {...(external ? { rel: 'noreferrer', target: '_blank' } : {})}
      {...props}
    >
      {children ?? (
        <>
          <BookOpenIcon data-icon="inline-start" aria-hidden="true" />
          <span className="truncate font-medium">{title ?? href}</span>
        </>
      )}
    </a>
  )
}
