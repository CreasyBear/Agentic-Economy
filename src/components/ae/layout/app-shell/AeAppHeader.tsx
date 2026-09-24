'use client'

import { UserButton } from '@clerk/tanstack-react-start'
import { ArrowLeftIcon, MenuIcon, XIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { AeCommandPanel } from '@/components/ae/command-panel'
import { AeNetworkHealthBanner, AeNetworkHealthIndicator } from '@/components/ae/layout/AeNetworkHealthIndicator'
import { useOperatorFrameChrome } from '@/components/ae/layout/AeOperatorPage'
import { ThemeToggle } from '@/components/ae/layout/ThemeToggle'
import { AeSiteDrawerNav, AeSiteIconButton, AeSitePrimaryNav } from '@/components/ae/website/AeSiteNav'
import { buttonVariants } from '@/components/ui/button-variants'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AECON_MARK_SRC, AECON_MOBILE_LOCKUP_SRC, aeconMarkClassName } from '@/content/brand-assets'
import { chatHeaderActionsId } from '@/lib/public/chat-ia'
import type { OperatorRole } from '@/lib/operator/roles'
import { cn } from '@/lib/utils'

import { WorkspaceMenu } from './WorkspaceMenu'
import { AeWorkspaceIdentity } from './AeWorkspaceIdentity'

export type AeAppHeaderProps = Readonly<{
  signedIn: boolean
  operatorRole: OperatorRole
  canAccessAdmin: boolean
  minimal: boolean
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  elevated: boolean
  hydrated: boolean
  chatFrame: boolean
}>

function chatActionSlot(chatFrame: boolean) {
  if (!chatFrame) return null
  return <div id={chatHeaderActionsId} className="flex shrink-0 items-center gap-intra" />
}

function BrandLink() {
  return (
    <Link
      to="/"
      aria-label="Agentic Economy home"
      className="flex shrink-0 min-h-touch min-w-touch items-center gap-related no-underline active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={cn(aeconMarkClassName.light, 'hidden max-[359px]:block sm:block')} />
      <img src={AECON_MOBILE_LOCKUP_SRC} alt="" aria-hidden="true" className="h-5 w-auto max-w-24 max-[359px]:hidden sm:hidden" />
    </Link>
  )
}

export function AeAppHeader({
  signedIn,
  operatorRole,
  canAccessAdmin,
  minimal,
  mobileNavOpen,
  setMobileNavOpen,
  elevated,
  hydrated,
  chatFrame,
}: AeAppHeaderProps) {
  const title = useOperatorFrameChrome()?.title
  const pageTitle = typeof title === 'string' && title !== '' ? title : null

  return (
    <header
      data-hydrated={hydrated ? 'true' : undefined}
      data-shell="app-header"
      className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      {minimal ? (
        <div className="flex h-(--header-height) min-h-touch items-center justify-between px-gutter">
          <div className="flex items-center gap-intra">
            <BrandLink />
            {chatActionSlot(chatFrame)}
          </div>
          <div className="flex items-center gap-intra">
            <div className="hidden sm:block"><AeNetworkHealthIndicator /></div>
            <ThemeToggle />
            <Link
              to="/market"
              className="inline-flex min-h-touch items-center gap-1 font-sans text-xs font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
              Browse Tools
            </Link>
          </div>
        </div>
      ) : signedIn ? (
        <div
          data-elevated={elevated ? '' : undefined}
          className="ae-nav flex min-h-(--header-height) flex-wrap items-center gap-1 px-1 py-1 shadow-none transition-shadow duration-200 ease-out data-[elevated]:shadow-soft motion-reduce:transition-none sm:gap-related sm:px-2"
        >
          <BrandLink />
          {chatActionSlot(chatFrame)}
          {pageTitle === null ? null : (
            <h1 className={cn('min-w-0 flex-1 truncate text-title', pageTitle === 'Settings' && 'max-[359px]:sr-only')} title={pageTitle} aria-label={pageTitle}>
              {pageTitle}
            </h1>
          )}
          <div className="ms-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1 sm:gap-intra">
            <div className="hidden sm:block"><AeNetworkHealthIndicator /></div>
            <AeCommandPanel />
            <AeWorkspaceIdentity />
            <WorkspaceMenu operatorRole={operatorRole} canAccessAdmin={canAccessAdmin} />
            <ThemeToggle />
            <UserButton userProfileMode="navigation" userProfileUrl="/owner/settings/account" />
          </div>
        </div>
      ) : (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <div
            data-elevated={elevated ? '' : undefined}
            className="ae-nav flex h-(--header-height) min-h-(--header-height) items-center gap-1 px-1 shadow-none sm:gap-related transition-shadow duration-200 ease-out data-[elevated]:shadow-soft motion-reduce:transition-none sm:px-2"
          >
            <BrandLink />
            {chatActionSlot(chatFrame)}
            <AeSitePrimaryNav />
            <div className="ms-auto flex items-center gap-1 sm:gap-intra">
              <div className="hidden sm:block"><AeNetworkHealthIndicator /></div>
              <AeCommandPanel />
              <ThemeToggle />
              <Link to="/sign-in/$" params={{ _splat: '' }} className={cn(buttonVariants({ variant: 'ghost' }), 'hidden md:inline-flex')}>Sign in</Link>
              <SheetTrigger
                render={
                  <AeSiteIconButton ariaLabel={mobileNavOpen ? 'Close public menu' : 'Open public menu'} className="md:hidden">
                    <MenuIcon aria-hidden="true" />
                  </AeSiteIconButton>
                }
              />
            </div>
          </div>
          <SheetContent side="left" className="w-80 max-w-[calc(100vw-2rem)] p-0" showCloseButton={false}>
            <SheetHeader className="border-b border-border">
              <div className="flex items-center justify-between gap-3">
                <SheetTitle>Public navigation</SheetTitle>
                <AeSiteIconButton ariaLabel="Close public menu" onClick={() => setMobileNavOpen(false)}><XIcon aria-hidden="true" /></AeSiteIconButton>
              </div>
              <SheetDescription className="sr-only">Choose where to go on Agentic Economy.</SheetDescription>
            </SheetHeader>
            <AeSiteDrawerNav onNavigate={() => setMobileNavOpen(false)} />
            <div className="flex items-center justify-between border-t border-border p-gutter">
              <Link to="/sign-in/$" params={{ _splat: '' }} onClick={() => setMobileNavOpen(false)} className={buttonVariants({ variant: 'outline' })}>Sign in</Link>
              <ThemeToggle />
            </div>
          </SheetContent>
        </Sheet>
      )}
      <AeNetworkHealthBanner />
    </header>
  )
}
