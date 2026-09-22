'use client'

import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'

import { AeOperatorBreadcrumbs, type OperatorBreadcrumbItem } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeRecordHeader } from '@/components/ae/layout/AeRecordHeader'
import { appDestination, resolveAppDestination, type AppDestinationId } from '@/lib/navigation/app-navigation'
import type {
  OperatorNavBadges,
  OperatorRole,
} from '@/lib/operator/roles'
import type { OperatorContext } from '@/lib/operator/operator-context'

function resourceBreadcrumbLabel(destinationId: AppDestinationId, currentPath: string): string {
  if (destinationId === 'market') return 'Tool'
  if (destinationId === 'calls') return currentPath.startsWith('/calls/') ? 'Receipt' : 'Call'
  if (destinationId === 'agents') return 'Agent'
  if (destinationId === 'credit') return 'Credit record'
  if (destinationId === 'settings') {
    if (currentPath.startsWith('/owner/team')) return 'Team settings'
    if (currentPath.startsWith('/owner/workspace')) return 'Workspace settings'
    return 'Account settings'
  }
  if (destinationId === 'tools') {
    if (currentPath.endsWith('/new')) return 'New Tool'
    if (currentPath.startsWith('/owner/supply')) return 'Provider connection'
    return 'Tool'
  }
  return appDestination(destinationId).label
}

function useDestinationBreadcrumbs(
  currentPath: string,
  title: string,
  providedBreadcrumbs?: readonly OperatorBreadcrumbItem[],
): readonly OperatorBreadcrumbItem[] {
  const { hash } = useLocation()
  if (providedBreadcrumbs !== undefined) {
    return providedBreadcrumbs.filter(({ label }) => label !== title)
  }

  const destinationId = resolveAppDestination(currentPath, hash)
  if (destinationId === null) return []
  const destination = appDestination(destinationId)
  const destinationHash = destination.hash?.replace(/^#/u, '') ?? ''
  const currentHash = hash.replace(/^#/u, '')
  if (currentPath === destination.to && destinationHash === currentHash) return []

  return [
    { label: destination.label, href: destination.to },
    { label: resourceBreadcrumbLabel(destinationId, currentPath) },
  ]
}

type OperatorPageChrome = Omit<AeOperatorPageProps, 'children' | 'operatorContext'>

type OperatorShellChromeRegistration = {
  setChrome: (chrome: OperatorPageChrome) => void
  clearChrome: (chrome: OperatorPageChrome) => void
}

// Tier A: detects whether an ancestor AeOperatorPage already owns the shell
// for this route (root vs. nested). Root creates this provider fresh and
// renders the chrome; nested instances write their chrome into whichever
// ancestor they find. AeRouteStates.tsx also reads this to decide whether a
// pending/error/not-found state should wrap itself in its own AeOperatorPage
// or defer to an existing one.
const OperatorShellChromeContext = createContext<OperatorShellChromeRegistration | null>(null)

export function useOperatorShellChrome(): OperatorShellChromeRegistration | null {
  return use(OperatorShellChromeContext)
}

// Tier B: hoisted at the `/_operator` layout, above the sidebar and the
// routed outlet, so the sidebar (a sibling of the outlet, not a descendant
// of any AeOperatorPage) can read the navBadges the *root* AeOperatorPage
// resolves for the current route.
type OperatorSidebarChromeState = OperatorShellChromeRegistration & { chrome: OperatorPageChrome | null }

const OperatorSidebarChromeContext = createContext<OperatorSidebarChromeState | null>(null)

export function useOperatorSidebarChrome(): OperatorPageChrome | null {
  return use(OperatorSidebarChromeContext)?.chrome ?? null
}


export type AeOperatorPageProps = {
  operatorRole: OperatorRole
  operatorContext?: OperatorContext
  title: string
  description: string
  actions?: ReactNode
  secondaryBar?: ReactNode
  stickyHeader?: boolean
  currentPath: string
  mainContentId?: string
  breadcrumbs?: readonly OperatorBreadcrumbItem[]
  navBadges?: OperatorNavBadges
  suppressSurfaceNavigation?: boolean
  /** A loading placeholder for the route; focus management waits for the real page. */
  pending?: boolean
  children: ReactNode
}

type OperatorPageChromeInput = Pick<AeOperatorPageProps, 'operatorRole' | 'title' | 'description' | 'currentPath'> & {
  [K in 'actions' | 'secondaryBar' | 'stickyHeader' | 'mainContentId' | 'breadcrumbs' | 'navBadges' | 'suppressSurfaceNavigation' | 'pending']?: AeOperatorPageProps[K] | undefined
}

function chromeFromProps(props: OperatorPageChromeInput): OperatorPageChrome {
  const { operatorRole, title, description, actions, secondaryBar, stickyHeader, currentPath, mainContentId, breadcrumbs, navBadges, suppressSurfaceNavigation, pending } = props
  return {
    operatorRole,
    title,
    description,
    currentPath,
    ...(actions === undefined ? {} : { actions }),
    ...(secondaryBar === undefined ? {} : { secondaryBar }),
    ...(stickyHeader === undefined ? {} : { stickyHeader }),
    ...(mainContentId === undefined ? {} : { mainContentId }),
    ...(breadcrumbs === undefined ? {} : { breadcrumbs }),
    ...(navBadges === undefined ? {} : { navBadges }),
    ...(suppressSurfaceNavigation === undefined ? {} : { suppressSurfaceNavigation }),
    ...(pending === undefined ? {} : { pending }),
  }
}

function useChromeFromProps(props: Omit<AeOperatorPageProps, 'children'>): OperatorPageChrome {
  const { operatorRole, title, description, actions, secondaryBar, stickyHeader, currentPath, mainContentId, breadcrumbs, navBadges, suppressSurfaceNavigation, pending } = props
  return useMemo<OperatorPageChrome>(
    () => chromeFromProps({ operatorRole, title, description, actions, secondaryBar, stickyHeader, currentPath, mainContentId, breadcrumbs, navBadges, suppressSurfaceNavigation, pending }),
    [operatorRole, title, description, actions, secondaryBar, stickyHeader, currentPath, mainContentId, breadcrumbs, navBadges, suppressSurfaceNavigation, pending],
  )
}

export function AeOperatorPage(props: AeOperatorPageProps) {
  const parentShell = use(OperatorShellChromeContext)

  if (parentShell !== null) {
    return <NestedOperatorPage parentShell={parentShell} {...props} />
  }

  return <RootOperatorPage {...props} />
}

function NestedOperatorPage({
  parentShell,
  children,
  ...props
}: AeOperatorPageProps & { parentShell: OperatorShellChromeRegistration }) {
  const chrome = useChromeFromProps(props)

  useLayoutEffect(() => {
    parentShell.setChrome(chrome)
    return () => parentShell.clearChrome(chrome)
  }, [chrome, parentShell])

  return <>{children}</>
}

function RootOperatorPage(props: AeOperatorPageProps) {
  const [registeredChrome, setRegisteredChrome] = useState<OperatorPageChrome | null>(null)
  const setChrome = useCallback((chrome: OperatorPageChrome) => {
    setRegisteredChrome(chrome)
  }, [])
  const clearChrome = useCallback((chrome: OperatorPageChrome) => {
    setRegisteredChrome((currentChrome) => (currentChrome === chrome ? null : currentChrome))
  }, [])
  const registration = useMemo<OperatorShellChromeRegistration>(
    () => ({ setChrome, clearChrome }),
    [clearChrome, setChrome],
  )

  const propsChrome = useChromeFromProps(props)
  const currentChrome = registeredChrome ?? propsChrome

  const {
    title,
    description,
    actions,
    secondaryBar,
    stickyHeader,
    currentPath,
    mainContentId,
    breadcrumbs: providedBreadcrumbs,
  } = currentChrome
  const { children } = props
  const resolvedMainContentId = mainContentId ?? 'main-content'
  const breadcrumbs = useDestinationBreadcrumbs(currentPath, title, providedBreadcrumbs)

  // Bubble the resolved chrome (in particular navBadges) up to the hoisted
  // sidebar bridge, when one is mounted above this route (see
  // OperatorChromeProvider). Reuses the exact setChrome/clearChrome
  // registration shape nested AeOperatorPage instances already use.
  const sidebarBridge = use(OperatorSidebarChromeContext)
  useLayoutEffect(() => {
    if (sidebarBridge === null) return
    sidebarBridge.setChrome(currentChrome)
    return () => sidebarBridge.clearChrome(currentChrome)
  }, [sidebarBridge, currentChrome])

  return (
    <OperatorShellChromeContext.Provider value={registration}>
      <main
        id={resolvedMainContentId}
        tabIndex={-1}
        data-testid="operator-content"
        className="ae-rail flex min-h-0 flex-1 flex-col focus:outline-none"
      >
        {breadcrumbs.length === 0 ? null : (
          <div className="flex min-h-touch shrink-0 items-center gap-related px-gutter pt-intra">
            <AeOperatorBreadcrumbs items={breadcrumbs} />
          </div>
        )}
        {stickyHeader === true ? (
          <div
            data-testid="operator-sticky-shelf"
            data-sticky-shelf="true"
            className="sticky top-(--header-height) z-10 -mx-gutter px-gutter border-b border-border/80 bg-background/95 pb-intra backdrop-blur supports-[backdrop-filter]:bg-background/85"
          >
            <AeRecordHeader
              title={title}
              description={description}
              {...(actions === undefined ? {} : { actions })}
            />
            {secondaryBar === undefined ? null : secondaryBar}
          </div>
        ) : (
          <>
            <AeRecordHeader
              title={title}
              description={description}
              {...(secondaryBar === undefined ? {} : { className: 'pb-intra' })}
              {...(actions === undefined ? {} : { actions })}
            />
            {secondaryBar === undefined ? null : secondaryBar}
          </>
        )}
        <div
          data-testid="operator-page-stack"
          className="grid min-h-0 flex-1 content-start gap-section pt-related"
        >
          {children}
        </div>
      </main>
    </OperatorShellChromeContext.Provider>
  )
}

export type OperatorChromeProviderProps = {
  children: ReactNode
}

/**
 * Root-frame bridge for current operator chrome. It keeps focus transitions
 * and sidebar badges stable while route content changes.
 */
export function OperatorChromeProvider({ children }: OperatorChromeProviderProps) {
  const [chrome, setRegisteredChrome] = useState<OperatorPageChrome | null>(null)
  const setChrome = useCallback((nextChrome: OperatorPageChrome) => {
    setRegisteredChrome(nextChrome)
  }, [])
  const clearChrome = useCallback((nextChrome: OperatorPageChrome) => {
    setRegisteredChrome((currentChrome) => (currentChrome === nextChrome ? null : currentChrome))
  }, [])
  const registration = useMemo<OperatorSidebarChromeState>(
    () => ({ chrome, setChrome, clearChrome }),
    [chrome, clearChrome, setChrome],
  )

  // Moves focus to the committed content region after client-side
  // navigation between owner pages, so keyboard users land on the new
  // page. Lives here (rather than on AeOperatorPage) because AeOperatorPage
  // remounts on every route change; this provider is the persistent layer
  // that can tell a real navigation apart from a first mount.
  // The signal is the path the new page registers with its chrome, not the
  // router location: the location changes before the new page has rendered
  // its content region, and the old code (in the persistent shell) also
  // watched the registered path.
  const committedPath = chrome?.currentPath
  const committedPending = chrome?.pending === true
  const resolvedMainContentId = chrome?.mainContentId ?? 'main-content'
  const previousCommittedPathRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    // A pending placeholder registers the new path first; wait for the real
    // page so focus lands on content that stays mounted.
    if (committedPath === undefined || committedPending) return
    if (previousCommittedPathRef.current === committedPath) return
    if (previousCommittedPathRef.current === undefined) {
      // First real page after mount: a baseline, not a navigation.
      previousCommittedPathRef.current = committedPath
      return
    }
    previousCommittedPathRef.current = committedPath
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(resolvedMainContentId)?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [committedPath, committedPending, resolvedMainContentId])

  return (
    <OperatorSidebarChromeContext.Provider value={registration}>
      {children}
    </OperatorSidebarChromeContext.Provider>
  )
}
