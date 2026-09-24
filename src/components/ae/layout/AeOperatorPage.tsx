'use client'

import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { OperatorBreadcrumbItem } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import type { OperatorRole } from '@/lib/operator/roles'
import type { OperatorContext } from '@/lib/operator/operator-context'

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

// Root-frame chrome bridge makes the current title available to the header
// and moves focus only after the new route's content has committed.
type OperatorFrameChromeState = OperatorShellChromeRegistration & { chrome: OperatorPageChrome | null }

const OperatorFrameChromeContext = createContext<OperatorFrameChromeState | null>(null)

export function useOperatorFrameChrome(): OperatorPageChrome | null {
  return use(OperatorFrameChromeContext)?.chrome ?? null
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
  suppressSurfaceNavigation?: boolean
  /** A loading placeholder for the route; focus management waits for the real page. */
  pending?: boolean
  children: ReactNode
}

type OperatorPageChromeInput = Pick<AeOperatorPageProps, 'operatorRole' | 'title' | 'description' | 'currentPath'> & {
  [K in 'actions' | 'secondaryBar' | 'stickyHeader' | 'mainContentId' | 'breadcrumbs' | 'suppressSurfaceNavigation' | 'pending']?: AeOperatorPageProps[K] | undefined
}

function chromeFromProps(props: OperatorPageChromeInput): OperatorPageChrome {
  const { operatorRole, title, description, actions, secondaryBar, stickyHeader, currentPath, mainContentId, breadcrumbs, suppressSurfaceNavigation, pending } = props
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
    ...(suppressSurfaceNavigation === undefined ? {} : { suppressSurfaceNavigation }),
    ...(pending === undefined ? {} : { pending }),
  }
}

function useChromeFromProps(props: Omit<AeOperatorPageProps, 'children'>): OperatorPageChrome {
  const { operatorRole, title, description, actions, secondaryBar, stickyHeader, currentPath, mainContentId, breadcrumbs, suppressSurfaceNavigation, pending } = props
  return useMemo<OperatorPageChrome>(
    () => chromeFromProps({ operatorRole, title, description, actions, secondaryBar, stickyHeader, currentPath, mainContentId, breadcrumbs, suppressSurfaceNavigation, pending }),
    [operatorRole, title, description, actions, secondaryBar, stickyHeader, currentPath, mainContentId, breadcrumbs, suppressSurfaceNavigation, pending],
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
    description,
    actions,
    secondaryBar,
    mainContentId,
  } = currentChrome
  const { children } = props
  const resolvedMainContentId = mainContentId ?? 'main-content'
  const showDescriptionLine = description !== '' || actions !== undefined

  // Publish the committed route's title and path to the persistent frame.
  const frameBridge = use(OperatorFrameChromeContext)
  useLayoutEffect(() => {
    if (frameBridge === null) return
    frameBridge.setChrome(currentChrome)
    return () => frameBridge.clearChrome(currentChrome)
  }, [frameBridge, currentChrome])

  return (
    <OperatorShellChromeContext.Provider value={registration}>
      <main
        id={resolvedMainContentId}
        tabIndex={-1}
        data-testid="operator-content"
        className="ae-rail flex min-h-0 flex-1 flex-col outline-none focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        <div
          data-testid="operator-page-stack"
          className="grid min-h-0 flex-1 content-start gap-section pt-related"
        >
          {showDescriptionLine ? (
            <div className="flex flex-wrap items-center gap-related">
              {description === '' ? null : (
                <p className="max-w-[65ch] text-pretty text-sm leading-normal text-muted-foreground">
                  {description}
                </p>
              )}
              {actions}
            </div>
          ) : null}
          {secondaryBar === undefined ? null : secondaryBar}
          {children}
        </div>
      </main>
    </OperatorShellChromeContext.Provider>
  )
}

export type OperatorChromeProviderProps = {
  children: ReactNode
}

/** Persistent frame bridge for header title and committed-route focus. */
export function OperatorChromeProvider({ children }: OperatorChromeProviderProps) {
  const [chrome, setRegisteredChrome] = useState<OperatorPageChrome | null>(null)
  const setChrome = useCallback((nextChrome: OperatorPageChrome) => {
    setRegisteredChrome(nextChrome)
  }, [])
  const clearChrome = useCallback((nextChrome: OperatorPageChrome) => {
    setRegisteredChrome((currentChrome) => (currentChrome === nextChrome ? null : currentChrome))
  }, [])
  const registration = useMemo<OperatorFrameChromeState>(
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
    <OperatorFrameChromeContext.Provider value={registration}>
      {children}
    </OperatorFrameChromeContext.Provider>
  )
}
