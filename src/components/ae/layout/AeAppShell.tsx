import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Link, useMatches, useMatchRoute } from '@tanstack/react-router'
import { Show, UserButton } from '@clerk/tanstack-react-start'
import { ArrowLeftIcon, MenuIcon, XIcon } from 'lucide-react'

import { AeCommandPanel, CommandPanelProvider } from '@/components/ae/command-panel'
import {
  KeyboardShortcutsDialog,
  useGlobalShortcuts,
} from '@/components/ae/shortcuts/KeyboardShortcutsDialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { emitFunnelEventOnce } from '@/lib/observability/funnel-client'
import { buttonVariants } from '@/components/ui/button-variants'
import { AeOrganizationSwitcher } from '@/components/ae/layout/AeOrganizationSwitcher'
import {
  AeSiteDrawerNav,
  AeSiteIconButton,
  useHeaderNavItems,
  type HeaderNavItem,
} from '@/components/ae/website/AeSiteNav'
import { AeVerticalHairline } from '@/components/ae/website/AeSiteMarks'
import { AECON_MARK_SRC, AECON_MOBILE_LOCKUP_SRC, aeconMarkClassName } from '@/content/brand-assets'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ae/layout/ThemeToggle'
import {
  AeNetworkHealthBanner,
  AeNetworkHealthIndicator,
} from '@/components/ae/layout/AeNetworkHealthIndicator'

function AeFunnelAttributionBoot() {
  useEffect(() => {
    emitFunnelEventOnce({ eventType: 'visitor_attributed', stage: 'visitor', correlationPrefix: 'visitor' })
  }, [])

  return null
}

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

/**
 * The one persistent app frame, owned by the root route. Renders the sticky
 * header (brand, primary nav, command search, auth actions, mobile drawer)
 * exactly once so it never remounts between public market pages and the
 * owner console. Public pages render their own `<main>`/footer via
 * `AePublicPage`; the operator layout renders its `Sidebar` + `SidebarInset`
 * inside the flex row below the header.
 */
const subscribeNever = () => () => {}

export function AeAppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const elevated = useHeaderElevated(sentinelRef)
  const matches = useMatches()
  const operatorWorkspace = matches.some(match => match.staticData.shell === 'operator')
  const isMinimalShell = matches.some(match => match.staticData?.shellMode === 'minimal')

  useEffect(() => {
    if (operatorWorkspace) setMobileNavOpen(false)
  }, [operatorWorkspace])

  function handleCommandOpenChange(open: boolean) {
    if (open) setMobileNavOpen(false)
    setCommandOpen(open)
  }

  useGlobalShortcuts({
    onOpenShortcuts: () => setShortcutsOpen(true),
    isShortcutsOpen: shortcutsOpen,
  })

  // False during SSR and hydration, true once React runs on the client: lets
  // browser specs probe the frame only after the DOM is React's.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false)

  return (
    <div className="flex min-h-svh flex-col" style={{ '--header-height': '4rem' } as CSSProperties}>
      <AeFunnelAttributionBoot />
      <AeSkipFocusBridge />
      <a
        data-testid="skip-to-content"
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-gutter focus:top-gutter focus:z-20 focus:rounded-md focus:bg-container focus:px-gutter focus:py-intra focus:text-sm focus:font-medium focus:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Skip to content
      </a>
      <div ref={sentinelRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2" />
      <CommandPanelProvider open={commandOpen} onOpenChange={handleCommandOpenChange}>
        <header
          data-hydrated={hydrated ? 'true' : undefined}
          data-shell="app-header"
          className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
        >
          {isMinimalShell ? (
            <div className="flex h-(--header-height) min-h-touch items-center justify-between px-gutter">
              <BrandLink />
              <div className="flex items-center gap-intra">
                <AeNetworkHealthIndicator />
                <ThemeToggle />
                <Link
                  to="/market"
                  className="inline-flex min-h-touch items-center gap-1 font-sans text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
                  Back to market
                </Link>
              </div>
            </div>
          ) : (
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <CloseDrawerOnDesktop onClose={setMobileNavOpen} />
              <div
                data-elevated={elevated ? '' : undefined}
                className="ae-nav flex h-(--header-height) min-h-(--header-height) items-center gap-related px-1 shadow-none transition-shadow duration-200 ease-out data-[elevated]:shadow-soft motion-reduce:transition-none sm:px-2"
              >
                <BrandLink />
                <AppHeaderNav />
                <div className="ms-auto flex items-center gap-intra">
                  <AeNetworkHealthIndicator />
                  <AeCommandPanel />
                  <Show when="signed-in">
                    <div className="hidden max-w-[12rem] min-w-0 md:block">
                      <AeOrganizationSwitcher />
                    </div>
                  </Show>
                  <ThemeToggle />
                  <Show when="signed-out" fallback={<UserButton userProfileMode="modal" />}>
                    <Link
                      to="/sign-in/$"
                      params={{ _splat: '' }}
                      className={cn(buttonVariants({ variant: 'ghost' }), 'hidden md:inline-flex')}
                    >
                      Sign in
                    </Link>
                  </Show>
                  <SheetTrigger
                    render={
                      <AeSiteIconButton
                        ariaLabel={mobileNavOpen ? 'Close menu' : 'Open menu'}
                        className="md:hidden"
                      >
                        <MenuIcon aria-hidden="true" />
                      </AeSiteIconButton>
                    }
                  />
                </div>
              </div>
              <SheetContent side="left" className="w-80 max-w-[calc(100vw-2rem)] p-0" showCloseButton={false}>
                <SheetHeader className="border-b border-border">
                  <div className="flex items-center justify-between gap-3">
                    <SheetTitle>Menu</SheetTitle>
                    <AeSiteIconButton ariaLabel="Close menu" onClick={() => setMobileNavOpen(false)}>
                      <XIcon aria-hidden="true" />
                    </AeSiteIconButton>
                  </div>
                  <SheetDescription className="sr-only">Choose where to go on Agentic Economy.</SheetDescription>
                </SheetHeader>
                <AeSiteDrawerNav onNavigate={() => setMobileNavOpen(false)} />
                <div className="flex flex-col gap-related border-t border-border p-gutter">
                  <Show when="signed-in">
                    <div className="min-w-0 md:hidden">
                      <AeOrganizationSwitcher />
                    </div>
                  </Show>
                  <div className="flex items-center justify-between">
                    <Show when="signed-out">
                      <Link
                        to="/sign-in/$"
                        params={{ _splat: '' }}
                        onClick={() => setMobileNavOpen(false)}
                        className={buttonVariants({ variant: 'outline' })}
                      >
                        Sign in
                      </Link>
                    </Show>
                    <ThemeToggle />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}
          <AeNetworkHealthBanner />
        </header>
        <div className="flex flex-1 flex-col md:flex-row">{children}</div>
        <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </CommandPanelProvider>
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

function BrandLink() {
  return (
    <Link
      to="/"
      aria-label="Agentic Economy home"
      className="flex min-h-touch min-w-touch items-center gap-related no-underline active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={cn(aeconMarkClassName.light, 'hidden sm:block')} />
      <img src={AECON_MOBILE_LOCKUP_SRC} alt="" aria-hidden="true" className="h-7 w-auto max-w-32 sm:hidden" />
    </Link>
  )
}

function AppHeaderNav() {
  const items = useHeaderNavItems()

  return (
    <nav aria-label="Primary" className="hidden items-center md:flex">
      {items.map((item, index) => (
        <Fragment key={item.to}>
          {index > 0 ? <AeVerticalHairline /> : null}
          <AppHeaderNavLink item={item} />
        </Fragment>
      ))}
    </nav>
  )
}

function AppHeaderNavLink({ item }: { item: HeaderNavItem }) {
  const matchRoute = useMatchRoute()
  const active = matchRoute({ to: item.to, fuzzy: true, includeSearch: false }) !== false

  return (
    <Link
      to={item.to}
      {...(item.search === undefined ? {} : { search: item.search })}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative inline-flex min-h-touch items-center px-related font-sans text-sm font-medium tracking-tight text-foreground no-underline transition-[color,transform] duration-100 ease-out hover:text-info active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:active:scale-100',
        active ? 'text-info after:absolute after:bottom-1 after:start-[40%] after:h-0.5 after:w-[20%] after:bg-info' : null,
      )}
    >
      {item.label}
    </Link>
  )
}
