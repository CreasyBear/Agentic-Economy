import { useAuth } from '@clerk/tanstack-react-start'
import { Link, useLocation } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'
import { ArrowUpRightIcon } from 'lucide-react'
import {
  PUBLIC_NAVIGATION,
  resolveAppDestination,
  type PublicDestination,
} from '@/lib/navigation/app-navigation'
import { cn } from '@/lib/utils'
import './SiteNavigationComposition.css'

export function AeSitePrimaryNav() {
  const { isSignedIn } = useAuth()

  if (isSignedIn === true) return null

  return (
    <nav aria-label="Primary" className="arc-market arc-public-primary-nav">
      {PUBLIC_NAVIGATION.map((item) => (
        <PublicNavLink key={item.id} item={item} />
      ))}
    </nav>
  )
}

export function AeSiteDrawerNav({ onNavigate }: { onNavigate: () => void }) {
  const { isSignedIn } = useAuth()

  if (isSignedIn === true) return null

  return (
    <nav aria-label="Primary" className="arc-market arc-public-drawer-nav">
      {PUBLIC_NAVIGATION.map((item) => (
        <PublicNavLink key={item.id} item={item} onNavigate={onNavigate} drawer />
      ))}
    </nav>
  )
}

function PublicNavLink({
  item,
  onNavigate,
  drawer = false,
}: {
  item: PublicDestination
  onNavigate?: () => void
  drawer?: boolean
}) {
  const { pathname, hash } = useLocation()
  const active = item.id === 'market'
    ? resolveAppDestination(pathname, hash) === 'market'
    : pathname === item.to

  return (
    <Link
      to={item.to}
      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
      aria-current={active ? 'page' : undefined}
      className={cn(
        buttonStyles.button, buttonStyles.ghost, buttonStyles.md,
        'arc-public-nav-link', drawer ? 'arc-public-drawer-link' : null,
      )}
    >
      {item.label}
      {drawer ? <ArrowUpRightIcon aria-hidden="true" /> : null}
    </Link>
  )
}
