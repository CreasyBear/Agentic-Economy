import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { useAuth } from '@clerk/tanstack-react-start'
import { useLocation, useMatches } from '@tanstack/react-router'

import { useGlobalShortcuts } from '@/components/ae/shortcuts/KeyboardShortcutsDialog'
import { PUBLIC_NAVIGATION } from '@/lib/navigation/app-navigation'
import { emitFunnelEventOnce } from '@/lib/observability/funnel-client'
import { operatorSurfaceForPath } from '@/lib/operator/operator-context'
import type { OperatorRole } from '@/lib/operator/roles'
const subscribeNever = () => () => {}

// Public doors come from PUBLIC_NAVIGATION; Market is deliberately omitted
// because signed-in /market is an app destination. The remainder are the
// legal, help and platform-information routes named by the shell contract.
const PUBLIC_MARKETING_PATHS: Record<string, true> = Object.fromEntries([
  ...PUBLIC_NAVIGATION.filter(({ id }) => id !== 'market').map(({ to }) => [to, true] as const),
  ['/about', true],
  ['/terms', true],
  ['/privacy', true],
  ['/support', true],
  ['/status', true],
])

function isPublicMarketingPath(pathname: string): boolean {
  return PUBLIC_MARKETING_PATHS[pathname] === true
    || pathname.startsWith('/privacy/')
    || pathname.startsWith('/developers/')
}

export type AppShellState = Readonly<{
  pathname: string
  hash: string
  operatorRole: OperatorRole
  isSignedIn: boolean
  isMinimalShell: boolean
  hidePublicFooter: boolean
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  commandOpen: boolean
  handleCommandOpenChange: (open: boolean) => void
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
  sentinelRef: RefObject<HTMLDivElement | null>
  elevated: boolean
  hydrated: boolean
}>

export function useAppShellState(): AppShellState {
  const { isSignedIn: clerkIsSignedIn } = useAuth()
  const { pathname, hash } = useLocation()
  const matches = useMatches()
  const isSignedIn = clerkIsSignedIn === true
  const isMinimalShell = matches.some((match) => match.staticData?.shellMode === 'minimal')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [elevated, setElevated] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    emitFunnelEventOnce({ eventType: 'visitor_attributed', stage: 'visitor', correlationPrefix: 'visitor' })
  }, [])

  useEffect(() => {
    const focusTarget = () => {
      const targetId = window.location.hash === '#ae-app-shell-main'
        ? 'ae-app-shell-main'
        : window.location.hash === '#main-content'
          ? 'main-content'
          : undefined
      const main = targetId === undefined ? null : document.getElementById(targetId)
      if (main === null) return
      main.setAttribute('tabindex', '-1')
      main.focus({ preventScroll: true })
    }
    window.addEventListener('hashchange', focusTarget)
    focusTarget()
    return () => window.removeEventListener('hashchange', focusTarget)
  }, [])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (typeof IntersectionObserver === 'undefined' || sentinel === null) return
    const observer = new IntersectionObserver(([entry]) => setElevated(entry?.isIntersecting === false))
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)')
    const closeDrawer = () => {
      if (mediaQuery.matches) setMobileNavOpen(false)
    }
    mediaQuery.addEventListener('change', closeDrawer)
    return () => mediaQuery.removeEventListener('change', closeDrawer)
  }, [])

  useGlobalShortcuts({
    onOpenShortcuts: () => setShortcutsOpen(true),
    isShortcutsOpen: shortcutsOpen,
  })

  return {
    pathname,
    hash,
    operatorRole: operatorSurfaceForPath(pathname),
    isSignedIn,
    isMinimalShell,
    hidePublicFooter: isSignedIn && !isPublicMarketingPath(pathname),
    mobileNavOpen,
    setMobileNavOpen,
    commandOpen,
    handleCommandOpenChange: (open) => {
      if (open) setMobileNavOpen(false)
      setCommandOpen(open)
    },
    shortcutsOpen,
    setShortcutsOpen,
    sentinelRef,
    elevated,
    hydrated: useSyncExternalStore(subscribeNever, () => true, () => false),
  }
}
