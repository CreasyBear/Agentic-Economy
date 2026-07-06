import { BookOpenIcon, ChevronDownIcon } from 'lucide-react'
import type { ComponentProps } from 'react'

import {
  AeCollapsible as Collapsible,
  AeCollapsibleContent as CollapsibleContent,
  AeCollapsibleTrigger as CollapsibleTrigger,
} from '@/components/ae/primitives/AeCollapsible'
import { RouterLink } from '@/components/astryx/RouterLink'
import { cn } from '@/lib/utils'

export type SourcesProps = ComponentProps<typeof Collapsible>

export function Sources({ className, ...props }: SourcesProps) {
  return (
    <Collapsible
      data-slot="ai-sources"
      className={cn('not-prose text-xs text-secondary', className)}
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
        'group/ai-sources-trigger flex items-center gap-2 rounded-sm text-xs font-medium text-secondary transition-colors hover:text-primary',
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
        'mt-2 flex w-full flex-col gap-2 text-secondary outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200',
        className,
      )}
      {...props}
    />
  )
}

export type SourceProps = ComponentProps<'a'>

export function Source({ className, href, title, children, ...props }: SourceProps) {
  const external = typeof href === 'string' && /^https?:\/\//i.test(href)
  const appRoute = isInternalAppHref(href)
  const content = children ?? (
    <>
      <BookOpenIcon data-icon="inline-start" aria-hidden="true" />
      <span className="truncate font-medium">{title ?? href}</span>
    </>
  )
  const sourceClassName = cn(
    'flex min-w-0 items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-primary transition-colors hover:border-border-strong hover:bg-muted',
    className,
  )

  if (appRoute) {
    return (
      <RouterLink className={sourceClassName} href={href} {...props}>
        {content}
      </RouterLink>
    )
  }

  return (
    <a
      className={sourceClassName}
      href={href}
      {...(external ? { rel: 'noreferrer', target: '_blank' } : {})}
      {...props}
    >
      {content}
    </a>
  )
}

function isInternalAppHref(href: SourceProps['href']): href is string {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) {
    return false
  }

  const [pathname = ''] = href.split(/[?#]/, 1)
  return pathname !== '/llms.txt' && pathname !== '/robots.txt' && pathname !== '/sitemap.xml' && pathname !== '/api' && !pathname.startsWith('/api/')
}
