import { Link } from '@tanstack/react-router'

import {
  isOperatorNavItemCurrent,
  mobileNavItemsForContext,
  mobileNavItemsForRole,
} from '@/lib/operator/navigation'
import type { OperatorContext } from '@/lib/operator/operator-context'

type AeOwnerMobileNavigationProps = {
  operatorContext?: OperatorContext
  currentPath: string
}

export function AeOwnerMobileNavigation({ operatorContext, currentPath }: AeOwnerMobileNavigationProps) {
  const items = operatorContext === undefined
    ? mobileNavItemsForRole('owner')
    : mobileNavItemsForContext(operatorContext, 'owner')

  return (
    <nav
      aria-label="Owner primary navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
    >
      <div className="grid h-16 grid-cols-3 px-gutter">
        {items.map((item) => {
          const current = isOperatorNavItemCurrent('owner', currentPath, item.href)
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
