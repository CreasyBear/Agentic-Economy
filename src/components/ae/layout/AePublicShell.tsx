import { useEffect, useRef, useState, type RefObject, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { MenuIcon, XIcon } from 'lucide-react'

import { AeCommandPanel, CommandPanelProvider } from '@/components/ae/command-panel'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { emitFunnelEventOnce } from '@/lib/observability/funnel-client'
import { Button } from '@/components/ui/button'
import { AeSiteDrawerNav, AeSiteIconButton, AeSitePrimaryNav } from '@/components/ae/website/AeSiteNav'
import { AeSiteFooter } from '@/components/ae/website/AeSiteFooter'
import { AECON_MARK_SRC, AECON_MOBILE_LOCKUP_SRC, aeconMarkClassName } from '@/content/brand-assets'
import { cn } from '@/lib/utils'

function AeFunnelAttributionBoot() {
  useEffect(() => {
    emitFunnelEventOnce({ eventType: 'visitor_attributed', stage: 'visitor', correlationPrefix: 'visitor' })
  }, [])

  return null
}

type AePublicShellProps = {
  children: ReactNode
  mode?: 'page' | 'workspace'
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

export function AePublicShell({ children, mode = 'page' }: AePublicShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const elevated = useHeaderElevated(sentinelRef)

  function handleCommandOpenChange(open: boolean) {
    if (open) setMobileNavOpen(false)
    setCommandOpen(open)
  }

  return (
    <div
      data-shell-mode={mode}
      className={cn(
        'relative flex flex-col',
        mode === 'workspace' ? 'h-dvh min-h-0 overflow-hidden' : 'min-h-dvh',
      )}
    >
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
      <header className={cn('z-30 shrink-0 border-b border-border bg-background', mode === 'page' && 'sticky top-0')}>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <CloseDrawerOnDesktop onClose={setMobileNavOpen} />
          <div
            data-elevated={elevated ? '' : undefined}
            className="ae-nav flex min-h-20 items-center gap-related px-1 shadow-none transition-shadow duration-200 ease-out data-[elevated]:shadow-soft motion-reduce:transition-none sm:px-2"
          >
            <PublicBrandLink />
            <AeSitePrimaryNav />
            <div className="ms-auto flex items-center gap-intra">
              <CommandPanelProvider open={commandOpen} onOpenChange={handleCommandOpenChange}>
                <AeCommandPanel />
              </CommandPanelProvider>
              <Button asChild variant="ghost" className="hidden lg:inline-flex">
                <Link to="/sign-in/$" params={{ _splat: '' }}>Sign in</Link>
              </Button>
              <Button asChild variant="outline" className="hidden sm:inline-flex">
                <Link to="/for-providers">Publish</Link>
              </Button>
              <SheetTrigger asChild>
                <AeSiteIconButton
                  ariaLabel={mobileNavOpen ? 'Close public menu' : 'Open public menu'}
                  className="lg:hidden"
                >
                  <MenuIcon aria-hidden="true" />
                </AeSiteIconButton>
              </SheetTrigger>
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
              <Button asChild variant="outline">
                <Link to="/sign-in/$" params={{ _splat: '' }} onClick={() => setMobileNavOpen(false)}>Sign in</Link>
              </Button>
              <Button asChild>
                <Link to="/for-providers" onClick={() => setMobileNavOpen(false)}>Publish</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </header>
      <div
        id="ae-app-shell-main"
        tabIndex={-1}
        className={cn('flex min-h-0 flex-1 flex-col', mode === 'workspace' && 'overflow-hidden')}
      >
        <main
          id="main-content"
          tabIndex={-1}
          className={cn('flex-1', mode === 'workspace' && 'flex min-h-0 flex-col overflow-hidden')}
        >
          {children}
        </main>
        {mode === 'page' ? <AeSiteFooter /> : null}
      </div>
    </div>
  )
}

function CloseDrawerOnDesktop({ onClose }: { onClose: (open: boolean) => void }) {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
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
      <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={cn(aeconMarkClassName.light, 'hidden sm:block')} />
      <img src={AECON_MOBILE_LOCKUP_SRC} alt="" aria-hidden="true" className="h-7 w-auto max-w-32 sm:hidden" />
    </Link>
  )
}
