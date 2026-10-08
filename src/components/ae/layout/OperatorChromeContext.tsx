'use client'

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { OperatorBreadcrumbItem } from './AeOperatorBreadcrumbs'
import type { OperatorRole } from '@/lib/operator/roles'

export type OperatorPageChrome = {
  operatorRole: OperatorRole
  title: string
  description: string
  actions?: ReactNode
  secondaryBar?: ReactNode
  stickyHeader?: boolean
  currentPath: string
  mainContentId?: string
  breadcrumbs?: readonly OperatorBreadcrumbItem[]
  suppressSurfaceNavigation?: boolean
  /** The page body owns the h1, so the frame title stays chrome. */
  contentOwnsHeading?: boolean
  /** A loading placeholder for the route; focus management waits for the real page. */
  pending?: boolean
}

export type OperatorShellChromeRegistration = {
  setChrome: (chrome: OperatorPageChrome) => void
  clearChrome: (chrome: OperatorPageChrome) => void
}

// Tier A: detects whether an ancestor AeOperatorPage already owns the shell
// for this route (root vs. nested). Root creates this provider fresh and
// renders the chrome; nested instances write their chrome into whichever
// ancestor they find. AeRouteStates.tsx also reads this to decide whether a
// pending/error/not-found state should wrap itself in its own AeOperatorPage
// or defer to an existing one.
export const OperatorShellChromeContext = createContext<OperatorShellChromeRegistration | null>(null)

export function useOperatorShellChrome(): OperatorShellChromeRegistration | null {
  return use(OperatorShellChromeContext)
}

// Root-frame chrome bridge makes the current title available to the header
// and moves focus only after the new route's content has committed.
type OperatorFrameChromeState = OperatorShellChromeRegistration & { chrome: OperatorPageChrome | null }

export const OperatorFrameChromeContext = createContext<OperatorFrameChromeState | null>(null)

export function useOperatorFrameChrome(): OperatorPageChrome | null {
  return use(OperatorFrameChromeContext)?.chrome ?? null
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
