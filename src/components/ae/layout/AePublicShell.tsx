import { useEffect, type ReactNode } from 'react'
import { AppShell, useAppShellMobile } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { MobileNavToggle } from '@astryxdesign/core/MobileNav'
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

const publicTopNav = (
  <TopNav
    label="Public"
    heading={<PublicBrandLink />}
    startContent={<PublicNavItems />}
    endContent={
      <>
        <div className="hidden items-center gap-2 md:flex">
          <Button label="Businesses" variant="ghost" size="sm" href={defaultRegistryHref} icon={<NetworkIcon aria-hidden="true" />} />
          <Button label="Ask AE" variant="primary" size="sm" href="/" icon={<RouteIcon aria-hidden="true" />} />
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <Button
            label="Businesses"
            variant="ghost"
            size="lg"
            href={defaultRegistryHref}
            icon={<NetworkIcon aria-hidden="true" />}
            isIconOnly
            className="min-h-11 min-w-11"
          />
          <Button
            label="Ask AE"
            variant="primary"
            size="lg"
            href="/"
            icon={<RouteIcon aria-hidden="true" />}
            isIconOnly
            className="min-h-11 min-w-11"
          />
          <MobileNavToggle label="Open public menu" className="min-h-11 min-w-11" />
        </div>
      </>
    }
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
        mobileNav={{ hasToggle: false }}
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

function PublicNavItems() {
  const { isMobile } = useAppShellMobile()

  if (isMobile) {
    return (
      <>
        <TopNavItem label="Ask AE" href="/" />
        <TopNavItem label="Businesses" href={defaultRegistryHref} />
        <TopNavItem label="Claim your business page" href="/claim" />
        <TopNavItem label="For agents" href="/for-agents" />
      </>
    )
  }

  return (
    <div className="hidden md:contents">
      <Button label="Ask AE" variant="ghost" size="sm" href="/" />
      <Button label="Businesses" variant="ghost" size="sm" href={defaultRegistryHref} />
      <Button label="Claim your business page" variant="ghost" size="sm" href="/claim" />
      <Button label="For agents" variant="ghost" size="sm" href="/for-agents" />
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
          {immersive ? null : <Link href="/">Ask AE</Link>}
        </nav>
      </div>
    </footer>
  )
}
