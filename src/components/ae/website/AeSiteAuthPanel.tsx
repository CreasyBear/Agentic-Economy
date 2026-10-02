import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { Button } from '@/components/arc/button/button'
import { cn } from '@/lib/utils'

import type { AeSiteHeadingLevel } from './AeSiteType'
import './AuthComposition.css'

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
  const Title = titleAs

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
    <div data-slot="ae-site-auth-panel" className="arc-market arc-auth-panel">
      <header className="arc-auth-intro">
        <p className="arc-auth-eyebrow">{eyebrow}</p>
        <Title className="arc-auth-title" id={titleId}>
          {title}
        </Title>
        <p className="arc-auth-description">{body}</p>
      </header>
      <div
        ref={clerkWellRef}
        data-slot="ae-site-auth-clerk-well"
        className="arc-auth-clerk-well min-h-96 w-full overflow-visible"
      >
        {children}
      </div>
      {footer === undefined ? null : <footer className="arc-auth-footer">{footer}</footer>}
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
  const buttonType = type === 'submit' || type === 'reset' ? type : 'button'
  return (
    <Button
      {...props}
      type={buttonType}
      variant="primary"
      size="md"
      className={cn('min-h-touch w-full', className)}
    >
      {children}
    </Button>
  )
}
