'use client'

import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'

import { AeOperatorBreadcrumbs } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeOperatorCommandMenu } from '@/components/ae/layout/AeOperatorCommandMenu'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import { AeRecordHeader } from '@/components/ae/layout/AeRecordHeader'
import { OperatorCommandOpenContext } from '@/components/ae/layout/operator-command-context'
import {
  resolveOperatorListCrumb,
  type OperatorBreadcrumbItem,
  type OperatorNavBadges,
  type OperatorRole,
} from '@/lib/operator/navigation'

type OperatorShellChrome = Omit<AeOperatorShellProps, 'children'>

type OperatorShellChromeRegistration = {
  setChrome: (chrome: OperatorShellChrome) => void
  clearChrome: (chrome: OperatorShellChrome) => void
}

const OperatorShellChromeContext = createContext<OperatorShellChromeRegistration | null>(null)


export type AeOperatorShellProps = {
  operatorRole: OperatorRole
  title: string
  description: string
  eyebrow?: string
  actions?: ReactNode
  currentPath: string
  mainContentId?: string
  breadcrumbs?: readonly OperatorBreadcrumbItem[]
  navBadges?: OperatorNavBadges
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
  eyebrow,
  actions,
  currentPath,
  mainContentId,
  breadcrumbs,
  navBadges,
  children,
}: AeOperatorShellProps & { parentShell: OperatorShellChromeRegistration }) {
  const chrome = useMemo<OperatorShellChrome>(
    () => ({
      operatorRole,
      title,
      description,
      currentPath,
      ...(eyebrow === undefined ? {} : { eyebrow }),
      ...(actions === undefined ? {} : { actions }),
      ...(mainContentId === undefined ? {} : { mainContentId }),
      ...(breadcrumbs === undefined ? {} : { breadcrumbs }),
      ...(navBadges === undefined ? {} : { navBadges }),
    }),
    [operatorRole, title, description, eyebrow, actions, currentPath, mainContentId, breadcrumbs, navBadges],
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
      className="-ml-1"
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
    currentPath,
    mainContentId,
    breadcrumbs: providedBreadcrumbs,
    navBadges,
  } = registeredChrome ?? props
  const { children } = props
  const resolvedMainContentId = mainContentId ?? 'operator-main-content'
  const [commandOpen, setCommandOpen] = useState(false)
  const openCommand = useCallback(() => setCommandOpen(true), [])
  const shellRef = useRef<HTMLDivElement>(null)

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
    <OperatorCommandOpenContext.Provider value={openCommand}>
      <OperatorShellChromeContext.Provider value={registration}>
        <SidebarProvider ref={shellRef}>
          <a
            data-testid="skip-to-content"
            href={`#${resolvedMainContentId}`}
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-container focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
          >
            Skip to content
          </a>
          <AeOperatorSidebar operatorRole={operatorRole} currentPath={currentPath} navBadges={navBadges ?? {}} />
          <SidebarInset id={resolvedMainContentId} tabIndex={-1} className="bg-container">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border">
              <div className="flex min-w-0 items-center gap-2 px-4">
                <OperatorSidebarToggle />
                {breadcrumbs.length === 0 ? null : (
                  <>
                    <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
                    <AeOperatorBreadcrumbs items={breadcrumbs} />
                  </>
                )}
              </div>
              <div className="ml-auto px-4">
                <AeOperatorCommandMenu
                  operatorRole={operatorRole}
                  open={commandOpen}
                  onOpenChange={setCommandOpen}
                />
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
              <AeRecordHeader
                title={title}
                description={description}
                {...(actions === undefined ? {} : { actions })}
              />
              <div className="min-h-0 flex-1 pt-3">{children}</div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </OperatorShellChromeContext.Provider>
    </OperatorCommandOpenContext.Provider>
  )
}
