import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

import { AeSiteBody, AeSiteEyebrow, AeSiteHeading, type AeSiteHeadingLevel } from './AeSiteType'

const desktopAutofocusInputSelector =
  'input:not([type=hidden]):not([type=checkbox]):not([disabled])'

function focusFirstAuthInput(well: HTMLElement): boolean {
  const active = document.activeElement
  if (active !== null && active !== document.body && active !== document.documentElement) {
    return true
  }

  const input = well.querySelector<HTMLInputElement>(desktopAutofocusInputSelector)
  if (input === null) {
    return false
  }

  input.focus()
  return document.activeElement === input
}

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
  const clerkWellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const isDesktop = window.matchMedia('(min-width: 768px)').matches
    if (!isDesktop) {
      return undefined
    }

    const well = clerkWellRef.current
    if (well === null) {
      return undefined
    }

    if (focusFirstAuthInput(well)) {
      return undefined
    }

    const observer = new MutationObserver(() => {
      if (focusFirstAuthInput(well)) {
        observer.disconnect()
      }
    })

    observer.observe(well, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div data-slot="ae-site-auth-panel" className="grid gap-section bg-container px-5 py-6 sm:px-6">
      <div className="grid gap-related">
        <AeSiteEyebrow>{eyebrow}</AeSiteEyebrow>
        <AeSiteHeading as={titleAs} size="md" id={titleId}>
          {title}
        </AeSiteHeading>
        <AeSiteBody muted size="sm">
          {body}
        </AeSiteBody>
      </div>
      <div
        ref={clerkWellRef}
        data-slot="ae-site-auth-clerk-well"
        className="min-h-96 w-full overflow-visible"
      >
        {children}
      </div>
      {footer === undefined ? null : <div className="text-sm text-muted-foreground">{footer}</div>}
    </div>
  )
}

/** Ink submit matching the Opensource UI login button. Forwards props so Clerk can clone it. */
export function AeSiteAuthSubmit({
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const submitClasses = cn(
    'inline-flex min-h-touch w-full items-center justify-center bg-foreground px-4 text-sm font-medium text-background shadow-none hover:bg-foreground/90 enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60',
    className,
  )

  if (type === 'submit') {
    return (
      <button {...props} type="submit" className={submitClasses}>
        {children}
      </button>
    )
  }

  if (type === 'reset') {
    return (
      <button {...props} type="reset" className={submitClasses}>
        {children}
      </button>
    )
  }

  return (
    <button {...props} type="button" className={submitClasses}>
      {children}
    </button>
  )
}
