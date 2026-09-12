'use client'

import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMatches } from '@tanstack/react-router'

import { AeOperatorBreadcrumbs, type OperatorBreadcrumbItem } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeOwnerMobileNavigation } from '@/components/ae/layout/AeOwnerMobileNavigation'
import { AeRecordHeader } from '@/components/ae/layout/AeRecordHeader'
import {
  ownerWorkspaceOwnerForPath,
  type OperatorNavBadges,
  type OperatorRole,
} from '@/lib/operator/roles'
import type { OperatorContext } from '@/lib/operator/operator-context'

/**
 * The "List" half of a shell-derived breadcrumb trail: the nearest sidebar
 * destination that is a strict ancestor of `currentPath`. Returns undefined
 * on a list page itself (top of its section, no trail needed) or when no
 * ancestor match carries a nav label. The terminal "Detail" crumb (the
 * page's own title) is appended by RootOperatorPage, so no per-route
 * breadcrumbs prop is needed.
 *
 * Owner routes under /owner/supply/* and /owner/settings/{connections,payouts}
 * are not route-tree descendants of the /owner/offerings sidebar item that
 * owns them, so that one owner-specific mapping is preserved on top of the
 * useMatches() ancestor walk.
 */
function useOperatorListCrumb(operatorRole: OperatorRole, currentPath: string): OperatorBreadcrumbItem | undefined {
  const matches = useMatches()

  return useMemo(() => {
    if (operatorRole === 'owner' && ownerWorkspaceOwnerForPath(currentPath) === 'operations' && currentPath !== '/owner/offerings') {
      return { label: 'Operations', href: '/owner/offerings' }
    }

    const ancestor = matches.slice(0, -1).findLast((match) => match.staticData.nav?.label !== undefined)
    const label = ancestor?.staticData.nav?.label
    return ancestor === undefined || label === undefined ? undefined : { label, href: ancestor.pathname }
  }, [matches, operatorRole, currentPath])
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
  [K in 'actions' | 'secondaryBar' | 'mainContentId' | 'breadcrumbs' | 'navBadges' | 'suppressSurfaceNavigation' | 'pending']?: AeOperatorPageProps[K] | undefined
}

function chromeFromProps(props: OperatorPageChromeInput): OperatorPageChrome {
  const { operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, breadcrumbs, navBadges, suppressSurfaceNavigation, pending } = props
  return {
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
    ...(pending === undefined ? {} : { pending }),
  }
}

function useChromeFromProps(props: Omit<AeOperatorPageProps, 'children'>): OperatorPageChrome {
  const { operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, breadcrumbs, navBadges, suppressSurfaceNavigation, pending } = props
  return useMemo<OperatorPageChrome>(
    () => chromeFromProps({ operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, breadcrumbs, navBadges, suppressSurfaceNavigation, pending }),
    [operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, breadcrumbs, navBadges, suppressSurfaceNavigation, pending],
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
    operatorRole,
    title,
    description,
    actions,
    secondaryBar,
    currentPath,
    mainContentId,
    breadcrumbs: providedBreadcrumbs,
    suppressSurfaceNavigation,
  } = currentChrome
  const { children, operatorContext } = props
  const resolvedMainContentId = mainContentId ?? 'main-content'

  const listCrumb = useOperatorListCrumb(operatorRole, currentPath)
  const breadcrumbs = useMemo<readonly OperatorBreadcrumbItem[]>(
    () => providedBreadcrumbs ?? (listCrumb === undefined ? [] : [listCrumb, { label: title }]),
    [listCrumb, providedBreadcrumbs, title],
  )

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
        className="flex min-h-0 flex-1 flex-col px-gutter pb-[calc(var(--spacing-touch)+env(safe-area-inset-bottom,0px))] focus:outline-none md:px-related md:pb-related"
      >
        {breadcrumbs.length === 0 ? null : <AeOperatorBreadcrumbs items={breadcrumbs} />}
        <AeRecordHeader
          title={title}
          description={description}
          {...(secondaryBar === undefined ? {} : { className: 'pb-intra' })}
          {...(actions === undefined ? {} : { actions })}
        />
        {secondaryBar === undefined ? null : secondaryBar}
        <div className="min-h-0 flex-1 pt-related">{children}</div>
      </main>
      {operatorRole === 'owner' && suppressSurfaceNavigation !== true
        ? (
            <AeOwnerMobileNavigation
              {...(operatorContext === undefined ? {} : { operatorContext })}
              currentPath={currentPath}
            />
          )
        : null}
    </OperatorShellChromeContext.Provider>
  )
}

export type OperatorChromeProviderProps = {
  sidebar?: ReactNode
  children: ReactNode
}

/**
 * Mounted once by the `/_operator` layout route around the sidebar and
 * the content column beside the sidebar. Hosts the Tier B bridge so
 * `AeOperatorSidebar` (a sibling of the routed outlet, not a descendant of
 * any AeOperatorPage) can read the navBadges the current route's root
 * AeOperatorPage resolves.
 */
export function OperatorChromeProvider({ sidebar, children }: OperatorChromeProviderProps) {
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
      {sidebar}
      <div className="relative flex w-full flex-1 flex-col bg-background">{children}</div>
    </OperatorSidebarChromeContext.Provider>
  )
}
