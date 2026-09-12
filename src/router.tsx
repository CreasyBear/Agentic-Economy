import { RouteError, RouteNotFound, RoutePending } from '@/components/ae/layout/AeRouteStates'
import { createRouter } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { routeTree } from './routeTree.gen'


export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPendingMs: 150,
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    defaultViewTransition: true,
    defaultNotFoundComponent: RouteNotFound,
    scrollRestoration: true,
    // The site sets `scroll-behavior: smooth` on <html> (src/styles/base.css)
    // for in-page anchor jumps. Without an explicit `instant` here, a restored
    // scrollTo would inherit that CSS and animate instead of snapping back.
    scrollRestorationBehavior: 'instant',
    // Default key is the history entry's `__TSR_key`, which is unique per
    // history *entry* rather than per URL. The one "back to results" affordance
    // on the Tool detail page (src/routes/tools.$toolRef.tsx) returns to
    // `/market` with the exact prior search reconstructed from `?from=`, but
    // that is a fresh PUSH (a new history entry, a new `__TSR_key`), so the
    // default key can never find the list's cached scroll position even
    // though the destination URL is identical to the one the user scrolled
    // on. Keying on pathname + search instead makes "revisit the same
    // /market?<filters>" resolve to the same cache entry regardless of
    // whether it was reached by a real browser Back or by a same-URL PUSH.
    getScrollRestorationKey: (location) => `${location.pathname}${location.searchStr}`,
  })
}

/**
 * Route tree as navigation registry: each route file's `staticData.nav`
 * declares where it appears in the public header, public footer, and/or
 * operator sidebar/mobile/utility nav, so the two nav files can eventually
 * read the tree instead of hand-listing destinations. Purely additive today
 * — nothing reads `staticData.nav` yet.
 */
export type NavStaticData = {
  label: string
  search?: Record<string, string>
  header?: { order: number }                                   // public primary nav
  footer?: { column: string; order: number }                   // public footer, internal links only
  operator?: {
    roles: ReadonlyArray<'owner' | 'admin' | 'developer'>
    group: string          // existing group label, e.g. 'Buy', 'Supply', 'Account', 'Records', 'Discovery'
    groupOrder: number
    order: number
    icon: LucideIcon
    tier: 'core' | 'advanced'
    mobilePrimary?: boolean
    mobileOrder?: number
  }
  // Addition: operatorUtilityItems (public-nav-adjacent operator "Catalog / Agent
  // setup / Help" shortcuts) have no group/tier — they sit outside the Buy/Supply/
  // Account groups entirely, so they get their own optional shape rather than
  // forcing group/tier onto data that doesn't have them.
  operatorUtility?: {
    roles: ReadonlyArray<'owner' | 'admin' | 'developer'>
    order: number
    icon: LucideIcon
  }
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
  interface StaticDataRouteOption { nav?: NavStaticData }
}
