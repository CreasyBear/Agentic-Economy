import { useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link, useRouter } from '@tanstack/react-router'

import { ownerWorkspaceOwnerForPath } from '@/lib/operator/roles'
import type { OperatorContext } from '@/lib/operator/operator-context'

type AeOwnerMobileNavigationProps = {
  operatorContext?: OperatorContext
  currentPath: string
}

type MobileNavItem = { href: string; label: string; icon: LucideIcon; mobileOrder: number }

/** Mirrors the pre-staticData resolveOperatorNavItem canonicalization for the
 * owner surface: /owner/supply/* and /owner/settings/* routes are not
 * route-tree descendants of the sidebar item that owns them. */
function resolveCurrentHref(currentPath: string, hrefs: readonly string[]): string | undefined {
  const owner = ownerWorkspaceOwnerForPath(currentPath)
  const canonicalHref = owner === 'operations' ? '/owner/offerings' : owner === 'account' ? '/owner/settings' : undefined
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

    const collected: MobileNavItem[] = []
    for (const route of Object.values(router.routesByPath)) {
      const nav = route.options.staticData?.nav
      const operator = nav?.operator
      if (operator === undefined || nav === undefined) continue
      if (!operator.roles.includes('owner')) continue
      if (operator.mobilePrimary !== true) continue
      collected.push({ href: route.fullPath, label: nav.label, icon: operator.icon, mobileOrder: operator.mobileOrder ?? 0 })
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
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
    >
      <div className="grid min-h-touch grid-cols-3 px-gutter">
        {items.map((item) => {
          const current = item.href === currentHref
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={current ? 'page' : undefined}
              className="relative flex min-h-touch min-w-touch flex-col items-center justify-center gap-1 px-2 py-1 font-sans text-xs font-medium text-muted-foreground no-underline hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-4 aria-[current=page]:after:top-0 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-info"
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
