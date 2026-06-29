import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'

type AePublicShellProps = {
  children: ReactNode
}

export function AePublicShell({ children }: AePublicShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="ae-skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:justify-between md:px-6">
          <Link to="/" className="inline-flex min-h-10 items-center gap-2 font-heading text-sm font-semibold tracking-normal text-foreground">
            <span className="grid size-7 place-items-center rounded-md bg-foreground text-xs font-semibold text-background">AE</span>
            <span>Agentic Economy</span>
          </Link>
          <nav aria-label="Public" className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:overflow-visible md:pb-0">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/registry" search={{ q: '', limit: 10 }}>Registry</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/claim">Claim page</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/privacy/remove-business">Removal</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border/80 bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm leading-6 text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <span>Bookings, payments, and automated actions are not live in this foundation slice.</span>
          <span>Source-owned readback stays visible before commerce rails ship.</span>
        </div>
      </footer>
    </div>
  )
}
