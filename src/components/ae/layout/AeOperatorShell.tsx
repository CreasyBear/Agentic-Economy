'use client'

import { createContext, use, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import {
  resolveOperatorListCrumb,
  type OperatorBreadcrumbItem,
  type OperatorNavBadges,
  type OperatorRole,
} from '@/lib/operator/navigation'



export type OperatorDensity = 'compact' | 'comfortable'

const OperatorDensityContext = createContext<OperatorDensity>('comfortable')
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
      className="min-h-11 min-w-11"
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
    eyebrow,
    actions,
    currentPath,
    mainContentId,
    breadcrumbs: providedBreadcrumbs,
    navBadges,
  } = registeredChrome ?? props
  const { children } = props
  const titleId = useId()
  const descriptionId = useId()
  const resolvedMainContentId = mainContentId ?? 'operator-main-content'
  const density: OperatorDensity = operatorRole === 'owner' ? 'compact' : 'comfortable'
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
  const sidebar = (
    <AeOperatorSidebar operatorRole={operatorRole} currentPath={currentPath} navBadges={navBadges ?? {}} />
  )

  const topNav = useMemo(
    () => (
      <div className="flex min-h-14 items-center gap-3 px-4 md:px-6">
        <OperatorSidebarToggle />
        {breadcrumbs.length === 0 ? null : (
          <div className="hidden min-w-0 flex-1 md:block">
            <AeOperatorBreadcrumbs items={breadcrumbs} />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <AeOperatorCommandMenu operatorRole={operatorRole} />
        </div>
      </div>
    ),
    [breadcrumbs, operatorRole],
  )

  return (
    <OperatorDensityContext.Provider value={density}>
      <OperatorShellChromeContext.Provider value={registration}>
        <SidebarProvider>
          <div ref={shellRef} className="flex min-h-dvh w-full bg-background">
            <a
              data-testid="skip-to-content"
              href={`#${resolvedMainContentId}`}
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground"
            >
              Skip to content
            </a>
            {sidebar}
            <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
              <header className="border-b border-border bg-card">
                {topNav}
              </header>
              <SidebarInset id={resolvedMainContentId} tabIndex={-1} className="min-h-0">
                <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
                  {breadcrumbs.length === 0 ? null : (
                    <div className="md:hidden">
                      <AeOperatorBreadcrumbs items={breadcrumbs} />
                    </div>
                  )}

                  <section aria-labelledby={titleId} aria-describedby={descriptionId} className="grid gap-2">
                    {eyebrow ? <p className="block text-sm font-medium text-muted-foreground">{eyebrow}</p> : null}
                    <h1 id={titleId} className="text-3xl font-semibold tracking-tight text-balance text-foreground">{title}</h1>
                    <p id={descriptionId} className="block text-pretty text-muted-foreground">{description}</p>
                    {actions ? <div className="flex flex-wrap items-center gap-3 pt-1">{actions}</div> : null}
                  </section>
                  <Separator />
                  <section className="grid min-w-0 gap-4">{children}</section>
                </div>
              </SidebarInset>
            </div>
          </div>
        </SidebarProvider>
      </OperatorShellChromeContext.Provider>
    </OperatorDensityContext.Provider>
  )
}
