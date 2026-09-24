import { Link, useLocation } from '@tanstack/react-router'

import { APP_NAVIGATION_ICONS } from '@/components/ae/layout/app-shell/app-shell.contracts'
import { APP_NAVIGATION, mobileNavigation, resolveAppDestination } from '@/lib/navigation/app-navigation'

export type AeOwnerMobileNavigationProps = Readonly<{
  currentPath: string
}>

const itemClassName = 'relative flex min-h-touch min-w-touch flex-col items-center justify-center gap-1 px-1 py-1 font-sans text-xs font-medium text-muted-foreground no-underline transition-transform duration-100 ease-out hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 aria-[current]:font-semibold aria-[current]:text-foreground aria-[current]:after:absolute aria-[current]:after:inset-x-4 aria-[current]:after:top-0 aria-[current]:after:h-0.5 aria-[current]:after:bg-info'

export function AeOwnerMobileNavigation({ currentPath }: AeOwnerMobileNavigationProps) {
  const { hash } = useLocation()
  const activeDestination = resolveAppDestination(currentPath, hash)
  const activeGroup = APP_NAVIGATION.find((destination) => destination.id === activeDestination)?.group

  return (
    <nav
      aria-label="Owner primary navigation"
      className="ae-owner-mobile-nav fixed inset-x-0 bottom-0 z-20 h-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px))] border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
    >
      <div className="grid h-(--ae-mobile-nav-height) grid-cols-4 px-1">
        {mobileNavigation().map((destination) => {
          const Icon = APP_NAVIGATION_ICONS[destination.id]
          return (
            <Link
              key={destination.id}
              to={destination.to}
              aria-label={destination.label}
              aria-current={destination.id === activeDestination ? 'page' : destination.group === activeGroup ? 'location' : undefined}
              className={itemClassName}
            >
              <Icon aria-hidden="true" className="size-5" />
              <span className="ae-owner-mobile-nav-label">{destination.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
