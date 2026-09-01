'use client'

import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Separator } from '@/components/ui/separator'
import { SiteMarker } from '@/components/ui/site-marker'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'

import { AeOperatorBreadcrumbs } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeOwnerMobileNavigation } from '@/components/ae/layout/AeOwnerMobileNavigation'
import { AeCommandPanel, CommandPanelProvider } from '@/components/ae/command-panel'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import { AeRecordHeader } from '@/components/ae/layout/AeRecordHeader'
import {
  resolveOperatorListCrumb,
  roleLabel,
  type OperatorBreadcrumbItem,
  type OperatorNavBadges,
  type OperatorRole,
} from '@/lib/operator/navigation'
import type { OperatorContext } from '@/lib/operator/operator-context'
import { listAgentAccessKeysServer } from '@/modules/agent-access/agent-access.functions'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'

type OperatorShellChrome = Omit<AeOperatorShellProps, 'children' | 'operatorContext'>

type OperatorShellChromeRegistration = {
  setChrome: (chrome: OperatorShellChrome) => void
  clearChrome: (chrome: OperatorShellChrome) => void
}

const OperatorShellChromeContext = createContext<OperatorShellChromeRegistration | null>(null)

export function useOperatorShellChrome(): OperatorShellChromeRegistration | null {
  return use(OperatorShellChromeContext)
}


export type AeOperatorShellProps = {
  operatorRole: OperatorRole
  operatorContext?: OperatorContext
  title: string
  description: string
  actions?: ReactNode
  secondaryBar?: ReactNode
  currentPath: string
  mainContentId?: string
  breadcrumbs?: readonly OperatorBreadcrumbItem[]
  navBadges?: OperatorNavBadges
  suppressSurfaceNavigation?: boolean
  children: ReactNode
}

export function AeOperatorShell(props: AeOperatorShellProps) {
  const parentShell = use(OperatorShellChromeContext)

  if (parentShell !== null) {
    return <NestedOperatorShell parentShell={parentShell} {...props} />
  }

  return <RootOperatorShell {...props} />
}

function NestedOperatorShell({
  parentShell,
  operatorRole,
  title,
  description,
  actions,
  secondaryBar,
  currentPath,
  mainContentId,
  breadcrumbs,
  navBadges,
  suppressSurfaceNavigation,
  children,
}: AeOperatorShellProps & { parentShell: OperatorShellChromeRegistration }) {
  const chrome = useMemo<OperatorShellChrome>(
    () => ({
      operatorRole,
      title,
      description,
      currentPath,
      ...(actions === undefined ? {} : { actions }),
      ...(secondaryBar === undefined ? {} : { secondaryBar }),
      ...(mainContentId === undefined ? {} : { mainContentId }),
      ...(breadcrumbs === undefined ? {} : { breadcrumbs }),
      ...(navBadges === undefined ? {} : { navBadges }),
      ...(suppressSurfaceNavigation === undefined ? {} : { suppressSurfaceNavigation }),
    }),
    [operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, breadcrumbs, navBadges, suppressSurfaceNavigation],
  )

  useLayoutEffect(() => {
    parentShell.setChrome(chrome)
    return () => parentShell.clearChrome(chrome)
  }, [chrome, parentShell])

  return <>{children}</>
}

function OperatorSidebarToggle() {
  const { isMobile, open, openMobile } = useSidebar()
  const expanded = isMobile ? openMobile : open
  const triggerRef = useRef<HTMLButtonElement>(null)
  const previousExpandedRef = useRef(expanded)
  const previousIsMobileRef = useRef(isMobile)

  useEffect(() => {
    if (previousExpandedRef.current && !expanded && previousIsMobileRef.current === isMobile) {
      triggerRef.current?.focus()
    }
    previousExpandedRef.current = expanded
    previousIsMobileRef.current = isMobile
  }, [expanded, isMobile])

  return (
    <SidebarTrigger
      ref={triggerRef}
      type="button"
      aria-label={expanded ? 'Close operator navigation' : 'Open operator navigation'}
      aria-controls="operator-sidebar-navigation"
      aria-expanded={expanded}
      className="-ms-1"
    />
  )
}

function RootOperatorShell(props: AeOperatorShellProps) {
  const [registeredChrome, setRegisteredChrome] = useState<OperatorShellChrome | null>(null)
  const setChrome = useCallback((chrome: OperatorShellChrome) => {
    setRegisteredChrome(chrome)
  }, [])
  const clearChrome = useCallback((chrome: OperatorShellChrome) => {
    setRegisteredChrome((currentChrome) => (currentChrome === chrome ? null : currentChrome))
  }, [])
  const registration = useMemo<OperatorShellChromeRegistration>(
    () => ({ setChrome, clearChrome }),
    [clearChrome, setChrome],
  )

  const {
    operatorRole,
    title,
    description,
    actions,
    secondaryBar,
    currentPath,
    mainContentId,
    breadcrumbs: providedBreadcrumbs,
    navBadges,
    suppressSurfaceNavigation,
  } = registeredChrome ?? props
  const { children } = props
  const { operatorContext } = props
  const resolvedMainContentId = mainContentId ?? 'operator-main-content'
  const [commandOpen, setCommandOpen] = useState(false)
  const readAgentKeys = useServerFn(listAgentAccessKeysServer)
  const readBuyerCredentialPresence = useCallback(async () => {
    const keys = await readAgentKeys()
    return keys.some((key) => (
      !key.revoked
      && !key.expired
      && key.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
    ))
  }, [readAgentKeys])
  const shellRef = useRef<HTMLDivElement>(null)
  const previousCommittedPathRef = useRef(currentPath)

  useEffect(() => {
    if (previousCommittedPathRef.current === currentPath) return
    previousCommittedPathRef.current = currentPath
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(resolvedMainContentId)?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentPath, resolvedMainContentId])

  useEffect(() => {
    const mainContent = document.getElementById(resolvedMainContentId)
    const skipLink = shellRef.current?.querySelector<HTMLAnchorElement>('[data-testid="skip-to-content"]')
    if (mainContent === null || skipLink === null || skipLink === undefined) return

    const previousHref = skipLink.getAttribute('href')
    skipLink.setAttribute('href', `#${resolvedMainContentId}`)
    const focusMainContent = () => {
      window.requestAnimationFrame(() => {
        mainContent.focus()
      })
    }

    skipLink.addEventListener('click', focusMainContent)
    return () => {
      skipLink.removeEventListener('click', focusMainContent)
      if (previousHref === null) {
        skipLink.removeAttribute('href')
      } else {
        skipLink.setAttribute('href', previousHref)
      }
    }
  }, [resolvedMainContentId])

  const breadcrumbs = useMemo<readonly OperatorBreadcrumbItem[]>(() => {
    const listCrumb = resolveOperatorListCrumb(operatorRole, currentPath)
    return providedBreadcrumbs ?? (listCrumb === undefined ? [] : [listCrumb, { label: title }])
  }, [currentPath, operatorRole, providedBreadcrumbs, title])

  return (
    <OperatorShellChromeContext.Provider value={registration}>
      <SidebarProvider ref={shellRef} className="bg-background">
        <a
          data-testid="skip-to-content"
          href={`#${resolvedMainContentId}`}
          className="sr-only focus:not-sr-only focus:absolute focus:start-gutter focus:top-gutter focus:z-20 focus:rounded-md focus:bg-container focus:px-gutter focus:py-intra focus:text-sm focus:font-medium focus:text-foreground"
        >
          Skip to content
        </a>
        <AeOperatorSidebar
          operatorRole={operatorRole}
          {...(operatorContext === undefined ? {} : { operatorContext })}
          currentPath={currentPath}
          navBadges={navBadges ?? {}}
          {...(suppressSurfaceNavigation === undefined ? {} : { suppressSurfaceNavigation })}
        />
        <SidebarInset id={resolvedMainContentId} tabIndex={-1} className="bg-background focus:outline-none">
            <header className="sticky top-0 z-20 flex min-h-nav-stack shrink-0 items-center gap-related border-b border-border bg-background/95 px-gutter backdrop-blur supports-[backdrop-filter]:bg-background/85">
              <div className="flex min-w-0 items-center gap-intra">
                <OperatorSidebarToggle />
                <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
                <span className="hidden shrink-0 items-center gap-2 font-sans text-xs font-medium text-muted-foreground sm:inline-flex">
                  <SiteMarker tone="info" visible />
                  {roleLabel[operatorRole]}
                </span>
                {breadcrumbs.length === 0 ? null : (
                  <>
                    <Separator orientation="vertical" className="hidden data-[orientation=vertical]:h-4 sm:block" />
                    <AeOperatorBreadcrumbs items={breadcrumbs} />
                  </>
                )}
              </div>
              <div className="ms-auto shrink-0">
                <CommandPanelProvider
                  open={commandOpen}
                  onOpenChange={setCommandOpen}
                  readBuyerCredentialPresence={readBuyerCredentialPresence}
                >
                  <AeCommandPanel />
                </CommandPanelProvider>
              </div>
            </header>
            <div
              data-testid="operator-content"
              className="flex min-h-0 flex-1 flex-col px-gutter pb-[calc(var(--spacing-touch)+env(safe-area-inset-bottom,0px))] md:px-related md:pb-related"
            >
              <AeRecordHeader
                title={title}
                description={description}
                {...(secondaryBar === undefined ? {} : { className: 'pb-intra' })}
                {...(actions === undefined ? {} : { actions })}
              />
              {secondaryBar === undefined ? null : secondaryBar}
              <div className="min-h-0 flex-1 pt-related">{children}</div>
            </div>
        </SidebarInset>
        {operatorRole === 'owner' && suppressSurfaceNavigation !== true
          ? (
              <AeOwnerMobileNavigation
                {...(operatorContext === undefined ? {} : { operatorContext })}
                currentPath={currentPath}
              />
            )
          : null}
      </SidebarProvider>
    </OperatorShellChromeContext.Provider>
  )
}
