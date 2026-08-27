import { ChevronRightIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AeSectionProps = {
  title: string
  description?: string
  children?: ReactNode
  id?: string
  className?: string
}

export function AeSection({ title, description, children, id, className }: AeSectionProps) {
  const generatedTitleId = useId()
  const titleId = `${generatedTitleId}-title`

  return (
    <section
      aria-labelledby={titleId}
      className={cn('grid scroll-mt-6 gap-related', className)}
      {...(id === undefined ? {} : { id })}
    >
      <div className="grid gap-intra">
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="text-pretty text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

export function AeSettingsStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto grid w-full max-w-3xl gap-section pb-hero', className)}>{children}</div>
}

type AeSettingsRowProps = {
  title: string
  description?: string
  href?: string
  action?: ReactNode
}

export function AeSettingsRow({ title, description, href, action }: AeSettingsRowProps) {
  const content = (
    <>
      <span className="grid min-w-0 flex-1 gap-intra">
        <span className="font-medium text-foreground">{title}</span>
        {description === undefined ? null : (
          <span className="text-pretty text-sm text-muted-foreground">{description}</span>
        )}
      </span>
      {action === undefined ? (
        href === undefined ? null : <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        action
      )}
    </>
  )
  const className = 'flex min-h-touch items-center gap-related rounded-md border border-border px-gutter py-intra transition-colors hover:bg-muted/40'

  if (href === undefined) {
    return <div className={className}>{content}</div>
  }

  return (
    <a href={href} className={className}>
      {content}
    </a>
  )
}
