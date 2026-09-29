import { Fragment, forwardRef, type ButtonHTMLAttributes } from 'react'
import { useAuth } from '@clerk/tanstack-react-start'
import { Link, useLocation } from '@tanstack/react-router'

import { AeDottedRule, AeVerticalHairline } from '@/components/ae/website/AeSiteMarks'
import {
  PUBLIC_NAVIGATION,
  resolveAppDestination,
  type PublicDestination,
} from '@/lib/navigation/app-navigation'
import { cn } from '@/lib/utils'

export function AeSitePrimaryNav() {
  const { isSignedIn } = useAuth()

  if (isSignedIn === true) return null

  return (
    <nav aria-label="Primary" className="hidden items-center md:flex">
      {PUBLIC_NAVIGATION.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 ? <AeVerticalHairline /> : null}
          <PublicNavLink item={item} />
        </Fragment>
      ))}
    </nav>
  )
}

export function AeSiteDrawerNav({ onNavigate }: { onNavigate: () => void }) {
  const { isSignedIn } = useAuth()

  if (isSignedIn === true) return null

  return (
    <nav aria-label="Primary" className="grid content-center gap-section px-gutter py-page">
      {PUBLIC_NAVIGATION.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 ? <AeDottedRule /> : null}
          <PublicNavLink item={item} onNavigate={onNavigate} drawer />
        </Fragment>
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
        'relative font-sans font-medium tracking-tight text-foreground no-underline transition-[color,transform] duration-100 ease-out hover:text-info active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:text-ring',
        drawer
          ? 'flex min-h-touch items-center text-3xl font-light'
          : 'inline-flex min-h-touch items-center px-related text-sm',
        active ? 'text-info dark:text-ring' : null,
        active && !drawer
          ? 'after:absolute after:bottom-1 after:start-[40%] after:h-0.5 after:w-[20%] after:bg-info dark:after:bg-ring'
          : null,
      )}
    >
      {item.label}
    </Link>
  )
}

export const AeSiteIconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { ariaLabel: string }
>(function AeSiteIconButton({ ariaLabel, children, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex size-touch items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...rest}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
})
