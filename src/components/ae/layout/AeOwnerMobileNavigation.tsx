import { Link, useLocation } from '@tanstack/react-router'

import { APP_NAVIGATION_ICONS } from '@/components/ae/layout/app-shell/app-shell.contracts'
import { APP_NAVIGATION, mobileNavigation, resolveAppDestination } from '@/lib/navigation/app-navigation'
import './AppFrameComposition.css'

export type AeOwnerMobileNavigationProps = Readonly<{
  currentPath: string
}>

const itemClassName = 'arc-mobile-navigation-item'

export function AeOwnerMobileNavigation({ currentPath }: AeOwnerMobileNavigationProps) {
  const { hash } = useLocation()
  const activeDestination = resolveAppDestination(currentPath, hash)
  const activeGroup = APP_NAVIGATION.find((destination) => destination.id === activeDestination)?.group

  return (
    <nav
      aria-label="Owner primary navigation"
      className="arc-market arc-mobile-navigation ae-owner-mobile-nav"
    >
      <div className="arc-mobile-navigation-items">
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
