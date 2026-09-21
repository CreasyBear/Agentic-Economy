import { useMemo } from 'react'
import { Activity, Boxes, KeyRound, StoreIcon, type LucideIcon } from 'lucide-react'
import { Link, useRouter } from '@tanstack/react-router'

import { ownerWorkspaceOwnerForPath } from '@/lib/operator/roles'
import type { OperatorContext } from '@/lib/operator/operator-context'

type AeOwnerMobileNavigationProps = {
  operatorContext?: OperatorContext
  currentPath: string
}

type MobileNavItem = { href: string; label: string; icon: LucideIcon; mobileOrder: number }

const OWNER_PRIMARY_DESTINATIONS = [
  { href: '/market', mobileOrder: 0 },
  { href: '/agent-access', mobileOrder: 10 },
  { href: '/activity', mobileOrder: 20 },
  { href: '/owner/operations', mobileOrder: 30 },
] as const

/** Public or header-only routes in the mobile primary set lack `nav.operator`. */
const OWNER_MOBILE_NAV_FALLBACK: Record<
  (typeof OWNER_PRIMARY_DESTINATIONS)[number]['href'],
  { label: string; icon: LucideIcon }
> = {
  '/market': { label: 'Market', icon: StoreIcon },
  '/agent-access': { label: 'Agents', icon: KeyRound },
  '/activity': { label: 'Calls', icon: Activity },
  '/owner/operations': { label: 'Tools', icon: Boxes },
}

function normalizedPath(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/** Mirrors the pre-staticData resolveOperatorNavItem canonicalization for the
 * owner surface: /owner/supply/* and /owner/settings/* routes are not
 * route-tree descendants of the sidebar item that owns them. */
function resolveCurrentHref(currentPath: string, hrefs: readonly string[]): string | undefined {
  const owner = ownerWorkspaceOwnerForPath(currentPath)
  const canonicalHref = owner === 'operations' ? '/owner/operations' : owner === 'account' ? '/owner/settings' : undefined
  if (canonicalHref !== undefined) {
    return hrefs.includes(canonicalHref) ? canonicalHref : undefined
  }
  if (currentPath.startsWith('/owner/settings/')) return undefined

  let match: string | undefined
  for (const href of hrefs) {
    if (currentPath !== href && !currentPath.startsWith(`${href}/`)) continue
    if (match === undefined || href.length > match.length) match = href
  }
  return match
}

export function AeOwnerMobileNavigation({ operatorContext, currentPath }: AeOwnerMobileNavigationProps) {
  const router = useRouter()

  const items = useMemo<MobileNavItem[]>(() => {
    if (operatorContext !== undefined && !operatorContext.allowedSurfaces.includes('owner')) return []

    const routes = Object.values(router.routesByPath)
    const collected: MobileNavItem[] = []
    for (const destination of OWNER_PRIMARY_DESTINATIONS) {
      const route = routes.find(candidate => normalizedPath(candidate.fullPath) === destination.href)
      const nav = route?.options.staticData?.nav
      const ownerNav = nav?.operator?.roles.includes('owner') === true
        ? nav.operator
        : nav?.operatorUtility?.roles.includes('owner') === true
          ? nav.operatorUtility
          : undefined
      if (nav === undefined) continue
      if (ownerNav !== undefined) {
        collected.push({
          href: destination.href,
          label: nav.label,
          icon: ownerNav.icon,
          mobileOrder: destination.mobileOrder,
        })
        continue
      }
      const fallback = OWNER_MOBILE_NAV_FALLBACK[destination.href]
      collected.push({
        href: destination.href,
        label: nav.label ?? fallback.label,
        icon: fallback.icon,
        mobileOrder: destination.mobileOrder,
      })
    }
    return collected.sort((left, right) => left.mobileOrder - right.mobileOrder)
  }, [router, operatorContext])

  const currentHref = useMemo(
    () => resolveCurrentHref(currentPath, items.map((item) => item.href)),
    [currentPath, items],
  )

  return (
    <nav
      aria-label="Owner primary navigation"
      className="fixed inset-x-0 bottom-0 z-20 h-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px))] border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
    >
      <div className="grid h-14 grid-cols-4 px-gutter">
        {items.map((item) => {
          const current = item.href === currentHref
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              to={item.href}
              activeOptions={{ exact: true }}
              aria-current={current ? 'page' : undefined}
              className="relative flex min-h-touch min-w-touch flex-col items-center justify-center gap-1 px-2 py-1 font-sans text-xs font-medium text-muted-foreground no-underline transition-transform duration-100 ease-out hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-4 aria-[current=page]:after:top-0 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-info"
            >
              <Icon aria-hidden="true" className="size-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
