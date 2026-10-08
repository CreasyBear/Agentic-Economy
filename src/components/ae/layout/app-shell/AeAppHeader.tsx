'use client'

import { UserButton } from '@clerk/tanstack-react-start'
import { ArrowLeftIcon, MenuIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { Button as ArcButton } from '@/components/arc/button/button'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ae/shared/base-ui/drawer/drawer'
import { AeCommandPanel } from '@/components/ae/command-panel'
import { AeNetworkHealthBanner, AeNetworkHealthIndicator } from '@/components/ae/layout/AeNetworkHealthIndicator'
import { useOperatorFrameChrome } from '@/components/ae/layout/OperatorChromeContext'
import { ThemeToggle } from '@/components/ae/layout/ThemeToggle'
import { AeSiteDrawerNav, AeSitePrimaryNav } from '@/components/ae/website/AeSiteNav'
import { AECON_DARK_MARK_SRC, AECON_MARK_SRC, AECON_MOBILE_LOCKUP_SRC, aeconMarkClassName } from '@/content/brand-assets'
import { WorkspaceMenu, WorkspaceAccountSwitcher } from './WorkspaceMenu'
import { ChatHeaderSlot } from './ChatHeaderSlot'
import { cn } from '@/lib/utils'

import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './AppHeaderComposition.css'

export type AeAppHeaderProps = Readonly<{
  signedIn: boolean
  workspaceReady?: boolean
  minimal: boolean
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  elevated: boolean
  hydrated: boolean
  chatFrame: boolean
}>

function chatActionSlot(chatFrame: boolean) {
  if (!chatFrame) return null
  return <ChatHeaderSlot />
}

function BrandLink() {
  return (
    <Link
      to="/"
      aria-label="Agentic Economy home"
      className="arc-app-header__brand"
    >
      <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={cn(aeconMarkClassName.light, 'dark:hidden')} />
      <img src={AECON_DARK_MARK_SRC} alt="" aria-hidden="true" className={cn(aeconMarkClassName.dark, 'hidden dark:block')} />
      <img src={AECON_MOBILE_LOCKUP_SRC} alt="" aria-hidden="true" className="hidden h-5 w-auto max-w-24" />
    </Link>
  )
}

export function AeAppHeader({
  signedIn,
  workspaceReady = true,
  minimal,
  mobileNavOpen,
  setMobileNavOpen,
  elevated,
  hydrated,
  chatFrame,
}: AeAppHeaderProps) {
  const frameChrome = useOperatorFrameChrome()
  const title = workspaceReady ? frameChrome?.title : undefined
  const pageTitle = typeof title === 'string' && title !== '' ? title : null
  const contentOwnsHeading = frameChrome?.contentOwnsHeading === true

  return (
    <header
      data-hydrated={hydrated ? 'true' : undefined}
      data-shell="app-header"
      className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 arc-market arc-app-header"
    >
      {minimal ? (
        <div className={cn('arc-app-header__bar arc-app-header__bar--minimal px-gutter', chatFrame && 'max-sm:!h-11 max-sm:!min-h-11 max-sm:!px-4')}>
          <div className="arc-app-header__lead">
            <div className={chatFrame && workspaceReady ? 'hidden sm:block' : ''}><BrandLink /></div>
            {chatActionSlot(chatFrame && workspaceReady)}
          </div>
          <div className="arc-app-header__actions">
            <div className="hidden sm:block"><AeNetworkHealthIndicator /></div>
            <ThemeToggle />
            <Link to="/market" className={cn(actionLinkClassName('ghost', 'md'), 'arc-app-header__browse')}>
              <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
              Browse Tools
            </Link>
          </div>
        </div>
      ) : signedIn ? (
        <div
          data-elevated={elevated ? '' : undefined}
          className={cn('ae-nav arc-app-header__bar arc-app-header__bar--signed-in px-1 sm:px-2 shadow-none data-[elevated]:shadow-soft', chatFrame && 'max-sm:!h-11 max-sm:!min-h-11 max-sm:!px-4')}
        >
          <div className={chatFrame && workspaceReady ? 'hidden sm:block' : ''}><BrandLink /></div>
          {chatActionSlot(chatFrame && workspaceReady)}
          {pageTitle === null || chatFrame ? null : contentOwnsHeading ? (
            <p className="arc-app-header__lead arc-app-header__title" title={pageTitle}>
              {pageTitle}
            </p>
          ) : (
            <h1 className="arc-app-header__lead arc-app-header__title" title={pageTitle}>
              {pageTitle}
            </h1>
          )}
          <div className="arc-app-header__actions ms-auto">
            <div className="hidden sm:block"><AeNetworkHealthIndicator /></div>
            <div className={chatFrame ? 'hidden sm:block' : 'block'}><AeCommandPanel /></div>
            <div className={chatFrame ? 'hidden sm:block' : 'block'}><ThemeToggle /></div>
            <WorkspaceAccountSwitcher />
            <WorkspaceMenu />
            <UserButton userProfileMode="navigation" userProfileUrl="/owner/settings/account" />
          </div>
        </div>
      ) : (
        <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <div className={cn('ae-nav arc-app-header__bar arc-app-header__bar--public px-1 sm:px-2', chatFrame && 'max-sm:!h-11 max-sm:!min-h-11 max-sm:!px-4')}>
            <div className={chatFrame && workspaceReady ? 'hidden sm:block' : ''}><BrandLink /></div>
            {chatActionSlot(chatFrame && workspaceReady)}
            <div className={cn(!chatFrame && 'arc-app-header__lead', chatFrame && 'hidden sm:block')}><AeSitePrimaryNav /></div>
            <div className="arc-app-header__actions">
              <div className="hidden sm:block"><AeNetworkHealthIndicator /></div>
              <div className={chatFrame ? 'hidden sm:block' : ''}><AeCommandPanel /></div>
              <div className={chatFrame ? 'hidden sm:block' : ''}><ThemeToggle /></div>
              <Link to="/sign-in/$" params={{ _splat: '' }} className={cn(actionLinkClassName('ghost', 'md'), 'arc-app-header__desktop-sign-in hidden md:inline-flex')}>Sign in</Link>
              {!chatFrame ? <DrawerTrigger
                render={
                  <ArcButton
                    type="button"
                    variant="ghost"
                    size="md"
                    aria-label={mobileNavOpen ? 'Close public menu' : 'Open public menu'}
                    className="arc-market arc-public-menu-trigger md:hidden"
                  >
                    <MenuIcon aria-hidden="true" />
                  </ArcButton>
                }
              /> : null}
            </div>
          </div>
          <DrawerContent
            side="left"
            title="Public navigation"
            description="Choose where to go on Agentic Economy."
            closeLabel="Close public menu"
            className="arc-app-header__drawer"
          >
            <AeSiteDrawerNav onNavigate={() => setMobileNavOpen(false)} />
            <div className="arc-app-header__drawer-footer">
              <Link to="/sign-in/$" params={{ _splat: '' }} onClick={() => setMobileNavOpen(false)} className={cn(actionLinkClassName('secondary', 'md'))}>Sign in</Link>
              <ThemeToggle />
            </div>
          </DrawerContent>
        </Drawer>
      )}
      <AeNetworkHealthBanner />
    </header>
  )
}
