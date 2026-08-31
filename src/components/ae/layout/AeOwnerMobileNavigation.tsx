import { Link } from '@tanstack/react-router'

import { isOperatorPathActive, mobileNavItemsForRole } from '@/lib/operator/navigation'

type AeOwnerMobileNavigationProps = {
  currentPath: string
}

export function AeOwnerMobileNavigation({ currentPath }: AeOwnerMobileNavigationProps) {
  const items = mobileNavItemsForRole('owner')

  return (
    <nav
      aria-label="Owner primary navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      <div className="grid h-16 grid-cols-3 px-gutter">
        {items.map((item) => {
          const current = isOperatorPathActive(currentPath, item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              to={item.href}
              aria-current={current ? 'page' : undefined}
              className="flex min-h-touch min-w-touch flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-xs text-muted-foreground no-underline hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-[current=page]:bg-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
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
