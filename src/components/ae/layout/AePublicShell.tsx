import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { MenuIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { emitFunnelEventOnce } from '@/lib/observability/funnel-client'

function AeFunnelAttributionBoot() {
  useEffect(() => {
    emitFunnelEventOnce({ eventType: 'visitor_attributed', stage: 'visitor', correlationPrefix: 'visitor' })
  }, [])

  return null
}

type AePublicShellProps = {
  children: ReactNode
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

export function AePublicShell({ children }: AePublicShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="relative flex min-h-dvh flex-col">
      <AeFunnelAttributionBoot />
      <AeSkipFocusBridge />
      <a
        data-testid="skip-to-content"
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-container focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 pt-3">
        <div className="ae-nav flex min-h-13 items-center gap-related rounded-nav border border-border bg-container px-3 shadow-float sm:px-gutter">
          <PublicBrandLink />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <PublicNavActions mobileNavOpen={mobileNavOpen} onMobileNavOpenChange={setMobileNavOpen} />
          </div>
        </div>
      </header>
      <div id="ae-app-shell-main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col">
        <main id="main-content" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <PublicFooter />
      </div>
    </div>
  )
}

function PublicMobileNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav aria-label="Public navigation" className="grid gap-2 p-4">
      <Link to="/t/new" onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ask</Link>
      <Link to="/market" search={{ window: '30d' }} onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Discover</Link>
      <Link to="/for-agents" onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Connections</Link>
      <Link to="/activity" onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Activity</Link>
      <Separator className="my-1" aria-hidden="true" />
      <Link to="/sign-in/$" params={{ _splat: '' }} onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground underline-offset-4 hover:bg-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Sign in</Link>
      <Button asChild className="min-h-11"><Link to="/sign-up/$" params={{ _splat: '' }} onClick={onNavigate}>Create account</Link></Button>
    </nav>
  )
}

function PublicNavActions({
  mobileNavOpen,
  onMobileNavOpenChange,
}: {
  mobileNavOpen: boolean
  onMobileNavOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={mobileNavOpen} onOpenChange={onMobileNavOpenChange}>
      <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
        <Link to="/t/new" className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ask</Link>
        <Link to="/market" search={{ window: '30d' }} className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Discover</Link>
        <Link to="/for-agents" className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Connections</Link>
        <Link to="/activity" className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Activity</Link>
      </nav>
      <Link to="/sign-in/$" params={{ _splat: '' }} className="hidden min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex">
        Sign in
      </Link>
      <Button asChild size="sm" className="hidden md:inline-flex">
        <Link to="/sign-up/$" params={{ _splat: '' }}>Create account</Link>
      </Button>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" className="min-h-11 min-w-11 px-2 sm:min-w-20 sm:px-3 md:hidden" aria-label="Open public menu">
          <MenuIcon data-icon="inline-start" aria-hidden="true" />
          <span className="hidden sm:inline">Menu</span>
        </Button>
      </SheetTrigger>
      {mobileNavOpen ? (
      <SheetContent side="left" className="w-80 max-w-[calc(100vw-2rem)] p-0" showCloseButton={false}>
        <SheetHeader className="border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>Public navigation</SheetTitle>
            <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label="Close public menu" onClick={() => onMobileNavOpenChange(false)}>
              <XIcon data-icon="inline-start" aria-hidden="true" />
            </Button>
          </div>
          <SheetDescription className="sr-only">Choose where to go on Agentic Economy.</SheetDescription>
        </SheetHeader>
        <PublicMobileNav onNavigate={() => onMobileNavOpenChange(false)} />
      </SheetContent>
      ) : null}
    </Sheet>
  )
}

function PublicBrandLink() {
  return (
    <Link to="/" aria-label="Agentic Economy home" className="flex min-h-11 min-w-11 items-center gap-2.5 no-underline">
      <img src="/brand/logo/ae-favicon.svg" alt="" aria-hidden="true" className="size-8 shrink-0" />
      <span className="hidden min-w-0 sm:block">
        <span className="font-mono text-sm font-medium tracking-[-0.02em] text-foreground">agentic economy</span>
      </span>
    </Link>
  )
}

function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-container">
      <div className="ae-rail flex flex-col gap-related py-section text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:text-sm">
        <div className="flex items-center gap-2 font-mono text-foreground"><img src="/brand/logo/ae-favicon.svg" alt="" aria-hidden="true" className="size-7" /><span>agentic economy</span></div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link to="/t/new" className="inline-flex items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ask</Link>
          <Link to="/market" search={{ window: '30d' }} className="inline-flex items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Discover</Link>
          <Link to="/for-agents" className="inline-flex items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Connections</Link>
          <Link to="/activity" className="inline-flex items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Activity</Link>
          <Link to="/for-providers" className="inline-flex items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">List a capability</Link>
          <a href="/llms.txt" className="inline-flex items-center font-mono text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">llms.txt</a>
          <a href="/SKILL.md" className="inline-flex items-center font-mono text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">SKILL.md</a>
          <Link to="/privacy" className="inline-flex items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Privacy</Link>
          <Link to="/terms" className="inline-flex items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Terms</Link>
        </nav>
      </div>
    </footer>
  )
}
