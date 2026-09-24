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
  return <div id={chatHeaderActionsId} className="flex min-w-0 flex-1 items-center gap-1" />
}

function BrandLink() {
  return (
    <Link
      to="/"
      aria-label="Agentic Economy home"
      className="flex shrink-0 min-h-touch min-w-touch items-center gap-related no-underline active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={cn(aeconMarkClassName.light, 'max-sm:block')} />
      <img src={AECON_MOBILE_LOCKUP_SRC} alt="" aria-hidden="true" className="hidden h-5 w-auto max-w-24" />
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
        <div className={cn("flex h-(--header-height) min-h-touch items-center justify-between px-gutter", chatFrame && "max-sm:!h-11 max-sm:!min-h-11 max-sm:!px-4")}>
          <div className="flex min-w-0 flex-1 items-center gap-intra">
            <div className={chatFrame ? 'hidden sm:block' : ''}><BrandLink /></div>
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
          className={cn("ae-nav flex h-(--header-height) min-h-(--header-height) min-w-0 items-center gap-1 overflow-hidden px-1 shadow-none transition-shadow duration-200 ease-out data-[elevated]:shadow-soft motion-reduce:transition-none sm:gap-related sm:px-2", chatFrame && "max-sm:!h-11 max-sm:!min-h-11 max-sm:!px-4")}
        >
          <div className={chatFrame ? 'hidden sm:block' : ''}><BrandLink /></div>
          {chatActionSlot(chatFrame)}
          {pageTitle === null || chatFrame ? null : (
            <h1 className={cn('min-w-0 flex-1 truncate text-title', pageTitle === 'Settings' && 'max-[359px]:sr-only')} title={pageTitle} aria-label={pageTitle}>
              {pageTitle}
            </h1>
          )}
          <div className="ms-auto flex min-w-0 shrink-0 items-center justify-end gap-0.5 sm:gap-intra">
            <div className="hidden sm:block"><AeNetworkHealthIndicator /></div>
            <div className={chatFrame ? 'hidden sm:block' : 'block'}><AeCommandPanel /></div>
            <div className={chatFrame ? 'hidden sm:block' : ''}><AeWorkspaceIdentity /></div>
            <div className={chatFrame ? 'hidden sm:block' : ''}><WorkspaceMenu operatorRole={operatorRole} canAccessAdmin={canAccessAdmin} /></div>
            <div className={chatFrame ? 'hidden sm:block' : 'block'}><ThemeToggle /></div>
            <UserButton userProfileMode="navigation" userProfileUrl="/owner/settings/account" />
          </div>
        </div>
      ) : (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <div
            className={cn("ae-nav flex h-(--header-height) min-h-(--header-height) items-center gap-1 px-1 shadow-none sm:gap-related transition-shadow duration-200 ease-out data-[elevated]:shadow-soft motion-reduce:transition-none sm:px-2", chatFrame && "max-sm:!h-11 max-sm:!min-h-11 max-sm:!px-4")}
          >
            <div className={chatFrame ? 'hidden sm:block' : ''}><BrandLink /></div>
            {chatActionSlot(chatFrame)}
            <div className={chatFrame ? 'hidden sm:block' : ''}><AeSitePrimaryNav /></div>
            <div className="ms-auto flex items-center gap-1 sm:gap-intra">
              <div className="hidden sm:block"><AeNetworkHealthIndicator /></div>
              <div className={chatFrame ? 'hidden sm:block' : ''}><AeCommandPanel /></div>
              <div className={chatFrame ? 'hidden sm:block' : ''}><ThemeToggle /></div>
              <Link to="/sign-in/$" params={{ _splat: '' }} className={cn(buttonVariants({ variant: 'ghost' }), 'hidden md:inline-flex')}>Sign in</Link>
              {!chatFrame ? <SheetTrigger
                render={
                  <AeSiteIconButton ariaLabel={mobileNavOpen ? 'Close public menu' : 'Open public menu'} className="md:hidden">
                    <MenuIcon aria-hidden="true" />
                  </AeSiteIconButton>
                }
              /> : null}
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
