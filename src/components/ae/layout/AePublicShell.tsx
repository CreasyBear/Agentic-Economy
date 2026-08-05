import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { cva } from 'class-variance-authority'
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
import { emitFunnelEventOnce } from '@/lib/observability/funnel-client'

function AeFunnelAttributionBoot() {
  useEffect(() => {
    emitFunnelEventOnce({ eventType: 'visitor_attributed', stage: 'visitor', correlationPrefix: 'visitor' })
  }, [])

  return null
}

type AePublicShellProps = {
  children: ReactNode
  immersive?: boolean
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

export function AePublicShell({ children, immersive = false }: AePublicShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className={immersive ? 'h-dvh overflow-hidden' : 'min-h-dvh'}>
      <AeFunnelAttributionBoot />
      <AeSkipFocusBridge />
      <a
        data-testid="skip-to-content"
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
          <PublicBrandLink />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <PublicNavActions mobileNavOpen={mobileNavOpen} onMobileNavOpenChange={setMobileNavOpen} />
          </div>
        </div>
      </header>
      <div id="ae-app-shell-main" tabIndex={-1}>
        <main id="main-content" tabIndex={-1} className={immersive ? 'h-full min-h-0' : undefined}>
          {children}
        </main>
        <PublicFooter immersive={immersive} />
      </div>
    </div>
  )
}

function PublicMobileNav({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav aria-label="Public navigation" className="grid gap-2 p-4">
      <Link to="/" onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground underline-offset-4 hover:bg-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Home</Link>
      <Link to="/claim" onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground underline-offset-4 hover:bg-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">List your business</Link>
      <Link to="/sign-in/$" params={{ _splat: '' }} onClick={onNavigate} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground underline-offset-4 hover:bg-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Sign in</Link>
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
      <Link to="/claim" className="inline-flex min-h-11 items-center rounded-md px-2 py-2 text-xs font-semibold text-brand hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 sm:text-sm">
        List your business
      </Link>
      <Link to="/sign-in/$" params={{ _splat: '' }} className="hidden min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex">
        Sign in
      </Link>
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
    <Link to="/" aria-label="Agentic Economy home" className="flex min-h-11 min-w-11 items-center gap-3 no-underline">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand font-mono text-sm font-semibold text-on-brand">AE</span>
      <span className="hidden min-w-0 sm:block">
        <span className="font-semibold text-foreground">Agentic Economy</span>
      </span>
    </Link>
  )
}

const publicFooter = cva('', {
  variants: {
    immersive: {
      true: 'fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card',
      false: 'border-t border-border bg-card',
    },
  },
})
const publicFooterInner = cva('mx-auto flex w-full max-w-6xl items-center justify-center gap-3 px-4', {
  variants: {
    immersive: {
      true: 'py-2 text-xs leading-5 text-muted-foreground md:px-6',
      false: 'py-3 text-xs leading-5 text-muted-foreground md:px-6 md:py-4 md:text-sm',
    },
  },
})

function PublicFooter({ immersive }: { immersive: boolean }) {
  return (
    <footer className={publicFooter({ immersive })}>
      <div className={publicFooterInner({ immersive })}>
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-3 gap-y-1 md:gap-x-4">
          <Link to="/for-agents" className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">For agents</Link>
          <a href="/llms.txt" className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Assistants</a>
          <Link to="/privacy" className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Privacy</Link>
          <Link to="/terms" className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Terms</Link>
        </nav>
      </div>
    </footer>
  )
}
