import { Fragment, forwardRef, useMemo, type ButtonHTMLAttributes } from 'react'
import { Link, useMatchRoute, useRouter } from '@tanstack/react-router'

import { AeDottedRule, AeVerticalHairline } from '@/components/ae/website/AeSiteMarks'
import { cn } from '@/lib/utils'

type HeaderNavItem = {
  to: string
  label: string
  search?: Record<string, string>
  order: number
}

function useHeaderNavItems(): HeaderNavItem[] {
  const { routesByPath } = useRouter()

  return useMemo(
    () =>
      Object.values(routesByPath)
        .flatMap((route) => {
          const nav = route.options.staticData?.nav
          if (nav?.header === undefined) return []
          return [{ to: route.to, label: nav.label, search: nav.search, order: nav.header.order }]
        })
        .sort((a, b) => a.order - b.order),
    [routesByPath],
  )
}

export function AeSitePrimaryNav() {
  const items = useHeaderNavItems()

  return (
    <nav aria-label="Primary" className="hidden items-center lg:flex">
      {items.map((item, index) => (
        <Fragment key={item.to}>
          {index > 0 ? <AeVerticalHairline /> : null}
          <PublicNavLink item={item} />
        </Fragment>
      ))}
    </nav>
  )
}

export function AeSiteDrawerNav({ onNavigate }: { onNavigate: () => void }) {
  const items = useHeaderNavItems()

  return (
    <nav aria-label="Public navigation" className="grid content-center gap-section px-gutter py-page">
      {items.map((item, index) => (
        <Fragment key={item.to}>
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
  item: HeaderNavItem
  onNavigate?: () => void
  drawer?: boolean
}) {
  const matchRoute = useMatchRoute()
  const active = matchRoute({ to: item.to, fuzzy: true, includeSearch: false }) !== false

  return (
    <Link
      to={item.to}
      {...(item.search === undefined ? {} : { search: item.search })}
      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative font-sans font-medium tracking-tight text-foreground no-underline transition-colors duration-200 ease-out hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        drawer
          ? 'flex min-h-touch items-center text-3xl font-light'
          : 'inline-flex min-h-touch items-center px-related text-sm',
        active ? 'text-info' : null,
        active && !drawer
          ? 'after:absolute after:bottom-1 after:start-[40%] after:h-0.5 after:w-[20%] after:bg-info'
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
