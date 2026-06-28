import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

type AePublicShellProps = {
  children: ReactNode
}

export function AePublicShell({ children }: AePublicShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-md"
      >
        Skip to content
      </a>
      <header className="border-b bg-background/95">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <a href="/" className="font-heading text-sm font-semibold tracking-normal text-foreground">
            Agentic Economy
          </a>
          <nav aria-label="Public" className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/claim">Claim</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/privacy/remove-business">Remove a business</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <Separator />
      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground md:px-6">
        <span>Bookings, payments, and automated actions are not live in this foundation slice.</span>
      </footer>
    </div>
  )
}
