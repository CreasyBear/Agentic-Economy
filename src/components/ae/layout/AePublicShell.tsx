import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Building2Icon, MenuIcon, SearchIcon } from 'lucide-react'

import { AeFunnelAttributionBoot } from '@/components/ae/layout/AeFunnelAttributionBoot'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'

type AePublicShellProps = {
  children: ReactNode
  immersive?: boolean
  hideFooter?: boolean
}

const defaultRegistrySearch = { q: '', limit: 10 }
export const defaultHomeSearch = { q: '' }
const publicNavActiveProps = { 'data-status': 'active' } as const
const publicNavButtonClassName = 'ae-public-nav-button'
const publicNavPrimaryButtonClassName = 'ae-public-nav-button ae-public-nav-button-primary'
const publicMobileLinkClassName = `${publicNavButtonClassName} ae-public-mobile-link`

function emitClaimCtaClicked() {
  void emitFunnelEvent({ eventType: 'claim_cta_clicked', stage: 'visitor', correlationPrefix: 'claim-cta' })
}

export function AePublicShell({ children, immersive = false, hideFooter = false }: AePublicShellProps) {
  return (
    <div
      className={`ae-public-shell flex flex-col ${
        immersive ? 'ae-public-shell--immersive h-dvh overflow-hidden' : 'min-h-dvh'
      }`}
    >
      <AeFunnelAttributionBoot />
      <a
        href="#main-content"
        className="ae-skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:min-h-11 focus:rounded-md focus:bg-[var(--ae-public-surface)] focus:px-4 focus:py-2 focus:text-[var(--ae-public-ink)]"
      >
        Skip to content
      </a>
      <header className="ae-public-shell-header ae-sticky-layer">
        <div className="ae-public-header-inner">
          <PublicBrandLink />
          <nav aria-label="Public" className="ae-public-desktop-nav">
            <Button variant="ghost" size="sm" className={publicNavButtonClassName} asChild>
              <Link to="/registry" search={defaultRegistrySearch} activeOptions={{ includeSearch: false }} activeProps={publicNavActiveProps}>
                Browse services
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className={publicNavButtonClassName} asChild>
              <Link to="/about" activeOptions={{ exact: false }} activeProps={publicNavActiveProps}>
                About
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className={publicNavButtonClassName} asChild>
              <Link to="/help" activeOptions={{ exact: false }} activeProps={publicNavActiveProps}>
                Help
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className={publicNavButtonClassName} asChild>
              <Link to="/privacy/remove-business" activeOptions={{ exact: false }} activeProps={publicNavActiveProps}>
                Corrections
              </Link>
            </Button>
          </nav>
          <div className="ae-public-header-actions">
            <Button variant="ghost" size="sm" className={`${publicNavButtonClassName} hidden md:inline-flex`} asChild>
              <Link
                to="/claim"
                activeOptions={{ exact: false }}
                activeProps={publicNavActiveProps}
                onClick={() => emitClaimCtaClicked()}
              >
                <Building2Icon data-icon="inline-start" />
                List/claim
              </Link>
            </Button>
            <Button variant="landingPrimary" size="sm" className={`${publicNavPrimaryButtonClassName} hidden md:inline-flex`} asChild>
              <Link to="/" search={defaultHomeSearch} activeOptions={{ exact: true }} activeProps={publicNavActiveProps}>
                <SearchIcon data-icon="inline-start" />
                Ask
              </Link>
            </Button>
            <PublicMobileMenu />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className={immersive ? 'min-h-0 flex-1 overflow-hidden' : 'flex-1'}>
        {children}
      </main>
      {hideFooter ? null : (
      <footer className="shrink-0 border-t border-[var(--ae-public-line)]/80 bg-[var(--ae-public-field)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3 text-xs leading-5 text-[var(--ae-public-muted)] md:flex-row md:items-center md:justify-between md:gap-3 md:px-6 md:py-4 md:text-sm">
          <span>Ask for a local service. Compare published details. Contact the business.</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-3 gap-y-1 md:gap-x-4">
            <a href="/llms.txt" className="ae-public-footer-link">Assistants</a>
            <Link to="/privacy" className="ae-public-footer-link">Privacy</Link>
            <Link to="/terms" className="ae-public-footer-link">Terms</Link>
          </nav>
        </div>
      </footer>
      )}
    </div>
  )
}

function PublicBrandLink() {
  return (
    <Link
      to="/"
      search={defaultHomeSearch}
      className="ae-public-brand-link"
      aria-label="Agentic Economy home"
    >
      <span className="ae-public-brand-mark">
        AE
      </span>
      <span className="ae-public-brand-copy">
        <span className="ae-public-brand-name">Agentic Economy</span>
        <span className="ae-public-brand-tagline">
          Ask for a local service. See who fits.
        </span>
      </span>
    </Link>
  )
}

function PublicMobileMenu() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
          <MenuIcon data-icon="inline-start" />
        </Button>
      </SheetTrigger>
      <SheetContent className="ae-public-mobile-sheet">
        <SheetHeader className="ae-public-mobile-sheet-header">
          <SheetTitle>Agentic Economy</SheetTitle>
          <SheetDescription>Ask for a local service. Compare published details.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Public mobile" className="flex flex-col gap-1 p-3">
          <SheetClose asChild>
            <Link
              to="/"
              search={defaultHomeSearch}
              activeOptions={{ exact: true }}
              activeProps={publicNavActiveProps}
              className={`${publicNavPrimaryButtonClassName} ae-public-mobile-primary-link`}
            >
              Ask
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link
              to="/registry"
              search={defaultRegistrySearch}
              activeOptions={{ includeSearch: false }}
              activeProps={publicNavActiveProps}
              className={publicMobileLinkClassName}
            >
              Browse services
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link to="/about" activeOptions={{ exact: false }} activeProps={publicNavActiveProps} className={publicMobileLinkClassName}>
              About
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link to="/help" activeOptions={{ exact: false }} activeProps={publicNavActiveProps} className={publicMobileLinkClassName}>
              Help
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link
              to="/privacy/remove-business"
              activeOptions={{ exact: false }}
              activeProps={publicNavActiveProps}
              className={publicMobileLinkClassName}
            >
              Corrections
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link
              to="/claim"
              activeOptions={{ exact: false }}
              activeProps={publicNavActiveProps}
              className={publicMobileLinkClassName}
              onClick={() => emitClaimCtaClicked()}
            >
              List/claim your business
            </Link>
          </SheetClose>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
