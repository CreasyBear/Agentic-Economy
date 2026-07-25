import { useEffect, type ReactNode } from 'react'
import { AppShell, useAppShellMobile } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { TopNav, TopNavItem } from '@astryxdesign/core/TopNav'
import { Text } from '@astryxdesign/core/Text'
import { NetworkIcon, RouteIcon } from 'lucide-react'

import { AeFunnelAttributionBoot } from '@/components/ae/layout/AeFunnelAttributionBoot'

type AePublicShellProps = {
  children: ReactNode
  immersive?: boolean
}

const defaultRegistryHref = '/registry?q=&limit=10'

function AeSkipFocusBridge() {
  useEffect(() => {
    const focusTarget = () => {
      if (window.location.hash !== '#astryx-app-shell-main') {
        return
      }

      const main = document.getElementById('astryx-app-shell-main')
      if (main === null) {
        return
      }

      main.setAttribute('tabindex', '-1')
      main.focus({ preventScroll: true })
    }

    window.addEventListener('hashchange', focusTarget)
    focusTarget()
    return () => window.removeEventListener('hashchange', focusTarget)
  }, [])

  return null
}
/**
 * THESIS: The shell names where you are and gets out of the way. It refuses the
 * every-destination-twice top bar the current build ships.
 * OWN-WORLD: Astryx neutral, eucalyptus reserved for the single primary action.
 * STORY: brand goes home, two links go sideways, one button is the supply-side ask.
 * FIRST VIEWPORT: brand left; Businesses and For agents right; one filled action.
 * FORM: marketplace-canon top bar (Airbnb/Uber), played straight.
 */
const publicTopNav = (
  <TopNav
    label="Public"
    heading={<PublicBrandLink />}
    startContent={<PublicNavItems />}
    endContent={<PublicNavActions />}
  />
)

export function AePublicShell({ children, immersive = false }: AePublicShellProps) {
  return (
    <div className={immersive ? 'h-dvh overflow-hidden' : 'min-h-dvh'}>
      <AeFunnelAttributionBoot />
      <AeSkipFocusBridge />
      <AppShell
        height={immersive ? 'fill' : 'auto'}
        variant="surface"
        contentPadding={0}
        mobileNav={{ hasToggle: true }}
        topNav={publicTopNav}
      >
        <div id="main-content" tabIndex={-1} className={immersive ? 'h-full min-h-0' : undefined}>
          {children}
        </div>
        <PublicFooter immersive={immersive} />
      </AppShell>
    </div>
  )
}

/**
 * Every destination appears once. The brand mark is the way back to Ask, so
 * Ask is not also a nav item. On mobile these collapse into the drawer; the
 * desktop row stays inline.
 */
function PublicNavItems() {
  const { isMobile } = useAppShellMobile()

  if (isMobile) {
    return (
      <>
        <TopNavItem label="Businesses" href={defaultRegistryHref} />
        <TopNavItem label="For agents" href="/for-agents" />
        <TopNavItem label="List your business" href="/claim" />
      </>
    )
  }

  return (
    <div className="hidden md:contents">
      <Button label="Businesses" variant="ghost" size="sm" href={defaultRegistryHref} />
      <Button label="For agents" variant="ghost" size="sm" href="/for-agents" />
    </div>
  )
}

/**
 * One filled action, because listing a business is the only thing the bar asks
 * anyone to do. On mobile it lives in the drawer and only the toggle shows.
 */
function PublicNavActions() {
  // AppShell owns the mobile drawer toggle; adding one here renders two.
  return (
    <div className="hidden md:flex md:items-center">
      <Button label="List your business" variant="primary" size="sm" href="/claim" />
    </div>
  )
}

function PublicBrandLink() {
  return (
    <Link
      href="/"
      aria-label="Agentic Economy home"
      className="flex min-h-11 min-w-11 items-center gap-3 no-underline md:min-h-0 md:min-w-0"
    >
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-sm font-semibold text-on-accent">AE</span>
      <span className="hidden min-w-0 sm:block">
        <Text type="label" weight="semibold" color="primary">Agentic Economy</Text>
      </span>
    </Link>
  )
}

function PublicFooter({ immersive }: { immersive: boolean }) {
  return (
    <footer className={immersive ? 'fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface' : 'border-t border-border bg-surface'}>
      <div
        className={
          immersive
            ? 'mx-auto flex w-full max-w-6xl items-center justify-center gap-3 px-4 py-2 text-xs leading-5 text-secondary md:px-6'
            : 'mx-auto flex w-full max-w-6xl items-center justify-center gap-3 px-4 py-3 text-xs leading-5 text-secondary md:px-6 md:py-4 md:text-sm'
        }
      >
        <nav aria-label="Footer" className="flex flex-wrap gap-x-3 gap-y-1 md:gap-x-4">
          <a href="/llms.txt" className="text-secondary underline-offset-4 hover:text-primary hover:underline">Assistants</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  )
}
