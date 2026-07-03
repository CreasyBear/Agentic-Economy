import { useEffect, type ReactNode } from 'react'
import { AppShell } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { Link } from '@astryxdesign/core/Link'
import { TopNav } from '@astryxdesign/core/TopNav'
import { Text } from '@astryxdesign/core/Text'
import { Building2Icon, SearchIcon } from 'lucide-react'

import { AeCorrectionWidget } from '@/components/ae/feedback/AeCorrectionWidget'
import { AeFunnelAttributionBoot } from '@/components/ae/layout/AeFunnelAttributionBoot'
import { AePublicRouteCommandMenu } from '@/components/ae/layout/AeRouteCommandMenu'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'

type AePublicShellProps = {
  children: ReactNode
  immersive?: boolean
}

const defaultRegistryHref = '/registry?q=&limit=10'
const ownerDoorHref = '/sign-in/?redirect=/owner/status'

function emitClaimCtaClicked() {
  void emitFunnelEvent({ eventType: 'claim_cta_clicked', stage: 'visitor', correlationPrefix: 'claim-cta' })
}

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

export function AePublicShell({ children, immersive = false }: AePublicShellProps) {
  const navItems = (
    <>
      <Button label="Browse services" variant="ghost" size="sm" href={defaultRegistryHref} />
      <Button label="About" variant="ghost" size="sm" href="/about" />
      <Button label="Help" variant="ghost" size="sm" href="/help" />
      <Button label="Corrections" variant="ghost" size="sm" href="/privacy/remove-business" />
      <Button label="For businesses" variant="ghost" size="sm" href={ownerDoorHref} />
    </>
  )

  return (
    <div className={immersive ? 'h-dvh overflow-hidden' : 'min-h-dvh'}>
      <AeFunnelAttributionBoot />
      <AeSkipFocusBridge />
      <AppShell
        height={immersive ? 'fill' : 'auto'}
        variant="surface"
        contentPadding={0}
        topNav={
          <TopNav
            label="Public"
            heading={<PublicBrandLink />}
            startContent={navItems}
            endContent={
              <div className="flex items-center gap-2">
                <AePublicRouteCommandMenu />
                <Button
                  label="List/claim"
                  variant="ghost"
                  size="sm"
                  href="/claim"
                  icon={<Building2Icon aria-hidden="true" />}
                  clickAction={() => emitClaimCtaClicked()}
                />
                <Button label="Ask" variant="primary" size="sm" href="/" icon={<SearchIcon aria-hidden="true" />} />
              </div>
            }
          />
        }
      >
        <div id="main-content" tabIndex={-1} className={immersive ? 'min-h-0' : undefined}>
          {children}
        </div>
        {immersive ? null : <AeCorrectionWidget />}
        <PublicFooter immersive={immersive} />
      </AppShell>
    </div>
  )
}

function PublicBrandLink() {
  return (
    <Link href="/" aria-label="Agentic Economy home" className="flex items-center gap-3 no-underline">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-card text-sm font-semibold text-primary">AE</span>
      <span className="hidden min-w-0 flex-col sm:flex">
        <Text type="label" weight="semibold" color="primary">Agentic Economy</Text>
        <Text type="supporting" color="secondary">Ask for a local service. See who fits.</Text>
      </span>
    </Link>
  )
}

function PublicFooter({ immersive }: { immersive: boolean }) {
  return (
    <footer className="border-t border-border bg-surface">
      <div
        className={
          immersive
            ? 'mx-auto flex w-full max-w-6xl items-center justify-center gap-3 px-4 py-2 text-xs leading-5 text-secondary md:px-6'
            : 'mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3 text-xs leading-5 text-secondary md:flex-row md:items-center md:justify-between md:gap-3 md:px-6 md:py-4 md:text-sm'
        }
      >
        {immersive ? null : <span>Ask for a local service. Compare published details. Contact the business.</span>}
        <nav aria-label="Footer" className="flex flex-wrap gap-x-3 gap-y-1 md:gap-x-4">
          <a href="/llms.txt" className="text-secondary underline-offset-4 hover:underline">Assistants</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          {immersive ? null : <Link href={ownerDoorHref}>For businesses</Link>}
        </nav>
      </div>
    </footer>
  )
}
