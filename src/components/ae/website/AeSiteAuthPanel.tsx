import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { AeSiteBody, AeSiteEyebrow, AeSiteHeading, type AeSiteHeadingLevel } from './AeSiteType'

type AeSiteAuthPanelProps = {
  eyebrow: string
  title: string
  titleId: string
  titleAs?: AeSiteHeadingLevel
  body: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * Login / signup / session panel — Opensource UI form composition, AE tokens.
 * Clerk (or a local-preview stand-in) renders as `children`.
 */
export function AeSiteAuthPanel({
  eyebrow,
  title,
  titleId,
  titleAs = 'h1',
  body,
  children,
  footer,
}: AeSiteAuthPanelProps) {
  return (
    <div data-slot="ae-site-auth-panel" className="grid gap-section bg-container p-page">
      <div className="grid gap-related">
        <AeSiteEyebrow>{eyebrow}</AeSiteEyebrow>
        <AeSiteHeading as={titleAs} size="sm" id={titleId}>
          {title}
        </AeSiteHeading>
        <AeSiteBody muted size="sm">
          {body}
        </AeSiteBody>
      </div>
      {children}
      {footer === undefined ? null : <div className="text-sm text-muted-foreground">{footer}</div>}
    </div>
  )
}

/** Ink submit matching the Opensource UI login button. Forwards props so Clerk can clone it. */
export function AeSiteAuthSubmit({
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>) {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        'inline-flex min-h-touch w-full items-center justify-center bg-foreground px-4 text-sm font-medium text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
        className,
      )}
    >
      {children}
    </button>
  )
}
