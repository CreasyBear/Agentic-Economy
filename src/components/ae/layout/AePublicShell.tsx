import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { AeFunnelAttributionBoot } from '@/components/ae/layout/AeFunnelAttributionBoot'
import { Button } from '@/components/ui/button'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'

type AePublicShellProps = {
  children: ReactNode
}

const defaultRegistrySearch = { q: '', limit: 10 }
export const defaultHomeSearch = { q: '' }
const publicNavActiveProps = { 'data-status': 'active' } as const
const publicNavButtonClassName = 'ae-public-nav-button'
const publicNavPrimaryButtonClassName = 'ae-public-nav-button ae-public-nav-button-primary'

function emitClaimCtaClicked() {
  void emitFunnelEvent({ eventType: 'claim_cta_clicked', stage: 'visitor', correlationPrefix: 'claim-cta' })
}

export function AePublicShell({ children }: AePublicShellProps) {
  return (
    <div className="ae-public-shell flex min-h-dvh flex-col">
      <AeFunnelAttributionBoot />
      <a
        href="#main-content"
        className="ae-skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:min-h-11 focus:rounded-md focus:bg-[var(--ae-public-surface)] focus:px-4 focus:py-2 focus:text-[var(--ae-public-ink)]"
      >
        Skip to content
      </a>
      <header className="ae-public-shell-header ae-sticky-layer sticky top-0 border-b border-[var(--ae-public-line)]/80 bg-[var(--ae-public-surface)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-2 md:h-16 md:flex-row md:flex-nowrap md:items-center md:justify-between md:gap-3 md:px-6 md:py-3">
          <Link to="/" search={defaultHomeSearch} className="inline-flex min-h-10 items-center gap-2 font-heading text-sm font-semibold tracking-normal text-[var(--ae-public-ink)]" aria-label="Agentic Economy home">
            <span className="grid size-8 place-items-center rounded-md bg-[var(--ae-public-ink)] text-xs font-semibold text-[var(--ae-public-surface)]">AE</span>
            <span className="grid gap-0.5">
              <span>Agentic Economy</span>
              <span className="hidden font-sans text-xs font-normal leading-none text-[var(--ae-public-muted)] sm:inline">A register of who handles what, where.</span>
            </span>
          </Link>
          <nav aria-label="Public" className="-mx-1 flex flex-wrap items-center gap-1.5 px-1 pb-0 md:mx-0 md:flex-nowrap md:justify-end md:gap-2">
            <Button variant="landingPrimary" size="sm" className={`${publicNavPrimaryButtonClassName} h-9 px-3 text-xs md:h-10 md:px-4 md:text-sm`} asChild>
              <Link to="/" search={defaultHomeSearch} activeOptions={{ exact: true }} activeProps={publicNavActiveProps}>
                Ask
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className={`${publicNavButtonClassName} h-9 px-2 text-xs md:h-10 md:px-3 md:text-sm`} asChild>
              <Link to="/registry" search={defaultRegistrySearch} activeOptions={{ includeSearch: false }} activeProps={publicNavActiveProps}>
                Browse services
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className={`${publicNavButtonClassName} h-9 px-2 text-xs md:h-10 md:px-3 md:text-sm`} asChild>
              <Link to="/privacy/remove-business" activeOptions={{ exact: false }} activeProps={publicNavActiveProps}>
                Corrections
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className={`${publicNavButtonClassName} h-9 px-2 text-xs md:h-10 md:px-3 md:text-sm`} asChild>
              <Link
                to="/claim"
                activeOptions={{ exact: false }}
                activeProps={publicNavActiveProps}
                onClick={() => emitClaimCtaClicked()}
              >
                List/claim
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <footer className="border-t border-[var(--ae-public-line)]/80 bg-[var(--ae-public-field)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3 text-xs leading-5 text-[var(--ae-public-muted)] md:flex-row md:items-center md:justify-between md:gap-3 md:px-6 md:py-4 md:text-sm">
          <span>A register of who handles what, where. Not a booking or payment tool.</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-3 gap-y-1 md:gap-x-4">
            <Link to="/" search={defaultHomeSearch}>Ask</Link>
            <Link to="/registry" search={defaultRegistrySearch}>Browse services</Link>
            <a href="/llms.txt">Assistants</a>
            <Link to="/privacy/remove-business">Corrections</Link>
            <Link to="/claim">List/claim your business</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
