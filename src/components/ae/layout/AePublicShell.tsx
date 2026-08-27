import { useEffect, useRef, useState, type RefObject, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { MenuIcon, XIcon } from 'lucide-react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { emitFunnelEventOnce } from '@/lib/observability/funnel-client'
import {
  AeSiteButton,
} from '@/components/ae/website/AeSiteButton'
import { AeSiteDrawerNav, AeSiteIconButton, AeSitePrimaryNav } from '@/components/ae/website/AeSiteNav'
import { AeSiteFooter } from '@/components/ae/website/AeSiteFooter'
import { AECON_MARK_SRC, aeconMarkClassName } from '@/content/brand-assets'

function AeFunnelAttributionBoot() {
  useEffect(() => {
    emitFunnelEventOnce({ eventType: 'visitor_attributed', stage: 'visitor', correlationPrefix: 'visitor' })
  }, [])

  return null
}

type AePublicShellProps = {
  children: ReactNode
}

/**
 * Public chrome implementation (nav, skip link, footer). Routes and page
 * states wrap with `AePublicPage`, not this file.
 */

function AeSkipFocusBridge() {
  useEffect(() => {
    const focusTarget = () => {
      const targetId = window.location.hash === '#ae-app-shell-main'
        ? 'ae-app-shell-main'
        : window.location.hash === '#main-content'
          ? 'main-content'
          : undefined
      if (targetId === undefined) return

      const main = document.getElementById(targetId)
      if (main === null) return

      main.setAttribute('tabindex', '-1')
      main.focus({ preventScroll: true })
    }

    window.addEventListener('hashchange', focusTarget)
    focusTarget()
    return () => window.removeEventListener('hashchange', focusTarget)
  }, [])

  return null
}

function useHeaderElevated(sentinelRef: RefObject<HTMLDivElement | null>): boolean {
  const [elevated, setElevated] = useState(false)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (typeof IntersectionObserver === 'undefined' || sentinel === null) return

    // useState(false) is the synchronous at-rest init; the observer's own
    // initial callback reconciles restored scroll positions against the
    // same 8px threshold via the h-2 sentinel strip.
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) setElevated(!entry.isIntersecting)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [sentinelRef])

  return elevated
}

export function AePublicShell({ children }: AePublicShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const elevated = useHeaderElevated(sentinelRef)

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AeFunnelAttributionBoot />
      <AeSkipFocusBridge />
      <a
        data-testid="skip-to-content"
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-gutter focus:top-gutter focus:z-20 focus:rounded-md focus:bg-container focus:px-gutter focus:py-intra focus:text-sm focus:font-medium focus:text-foreground"
      >
        Skip to content
      </a>
      <div ref={sentinelRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2" />
      <header className="sticky top-0 z-30 pt-3">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <CloseDrawerOnDesktop onClose={setMobileNavOpen} />
          <div
            data-elevated={elevated ? '' : undefined}
            className="ae-nav flex min-h-13 items-center gap-related rounded-nav border border-border bg-container px-3 shadow-none transition-shadow duration-200 ease-out data-[elevated]:shadow-float motion-reduce:transition-none sm:px-gutter"
          >
            <PublicBrandLink />
            <AeSitePrimaryNav />
            <div className="ms-auto flex items-center gap-intra">
              <AeSiteButton asChild variant="outlined" className="hidden md:inline-flex">
                <Link to="/sign-in/$" params={{ _splat: '' }}>Sign in</Link>
              </AeSiteButton>
              <AeSiteButton asChild>
                <Link to="/sign-up/$" params={{ _splat: '' }}>Create account</Link>
              </AeSiteButton>
              <AeSiteIconButton
                ariaLabel="Open public menu"
                className="md:hidden"
                onClick={() => setMobileNavOpen(true)}
              >
                <MenuIcon aria-hidden="true" />
              </AeSiteIconButton>
            </div>
          </div>
          <SheetContent side="left" className="w-80 max-w-[calc(100vw-2rem)] p-0" showCloseButton={false}>
            <SheetHeader className="border-b border-border">
              <div className="flex items-center justify-between gap-3">
                <SheetTitle>Public navigation</SheetTitle>
                <AeSiteIconButton ariaLabel="Close public menu" onClick={() => setMobileNavOpen(false)}>
                  <XIcon aria-hidden="true" />
                </AeSiteIconButton>
              </div>
              <SheetDescription className="sr-only">Choose where to go on Agentic Economy.</SheetDescription>
            </SheetHeader>
            <AeSiteDrawerNav onNavigate={() => setMobileNavOpen(false)} />
            <div className="grid gap-intra border-t border-border p-gutter">
              <AeSiteButton asChild variant="outlined">
                <Link to="/sign-in/$" params={{ _splat: '' }} onClick={() => setMobileNavOpen(false)}>Sign in</Link>
              </AeSiteButton>
              <AeSiteButton asChild>
                <Link to="/sign-up/$" params={{ _splat: '' }} onClick={() => setMobileNavOpen(false)}>Create account</Link>
              </AeSiteButton>
            </div>
          </SheetContent>
        </Sheet>
      </header>
      <div id="ae-app-shell-main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col">
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <AeSiteFooter />
      </div>
    </div>
  )
}

function CloseDrawerOnDesktop({ onClose }: { onClose: (open: boolean) => void }) {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)')
    const handleChange = () => {
      if (mediaQuery.matches) onClose(false)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [onClose])

  return null
}

function PublicBrandLink() {
  return (
    <Link to="/" aria-label="Agentic Economy home" className="flex min-h-touch min-w-touch items-center gap-related no-underline">
      <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={aeconMarkClassName.light} />
      <span className="hidden min-w-0 sm:block">
        <span className="text-sm font-semibold tracking-tight text-foreground">AECON</span>
      </span>
    </Link>
  )
}
