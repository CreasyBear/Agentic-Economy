import {
  Activity,
  Boxes,
  CircleDollarSign,
  CircleHelp,
  CreditCard,
  Ellipsis,
  HeartPulse,
  KeyRound,
  MessageSquare,
  Settings,
  StoreIcon,
  type LucideIcon,
} from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  activeRoleNavigationHref,
  ADMIN_NAVIGATION,
} from '@/components/ae/layout/app-shell/app-shell.contracts'
import { ADMIN_MOBILE_LABELS } from '@/components/ae/layout/mobile-navigation.contracts'
import {
  mobileNavigation,
  resolveAppDestination,
  type AppDestinationId,
} from '@/lib/navigation/app-navigation'
import { cn } from '@/lib/utils'

type AeOwnerMobileNavigationProps = {
  currentPath: string
  canAccessAdmin?: boolean
}

const DESTINATION_ICONS: Record<AppDestinationId, LucideIcon> = {
  market: StoreIcon,
  chat: MessageSquare,
  agents: KeyRound,
  calls: Activity,
  credit: CreditCard,
  tools: Boxes,
  earnings: CircleDollarSign,
  settings: Settings,
  support: CircleHelp,
  status: HeartPulse,
}

const MOBILE_NAVIGATION = mobileNavigation()
const MORE_GROUPS = [
  {
    id: 'main',
    label: 'Main',
    destinations: MOBILE_NAVIGATION.more.filter(destination => destination.group === 'primary'),
  },
  {
    id: 'provider',
    label: 'Provider',
    destinations: MOBILE_NAVIGATION.more.filter(destination => destination.group === 'provider'),
  },
  {
    id: 'utilities',
    label: 'Utilities',
    destinations: MOBILE_NAVIGATION.more.filter(destination => destination.group === 'utility'),
  },
] as const

const primaryItemClassName = 'relative flex min-h-touch min-w-touch flex-col items-center justify-center gap-1 px-2 py-1 font-sans text-xs font-medium text-muted-foreground no-underline transition-transform duration-100 ease-out hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-4 aria-[current=page]:after:top-0 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-info'

export function AeOwnerMobileNavigation({
  currentPath,
  canAccessAdmin = false,
}: AeOwnerMobileNavigationProps) {
  const { hash } = useLocation()
  const onAdminPath = currentPath === '/admin' || currentPath.startsWith('/admin/')
  const activeAdminHref = canAccessAdmin && onAdminPath
    ? activeRoleNavigationHref(currentPath, ADMIN_NAVIGATION)
    : undefined

  if (canAccessAdmin && onAdminPath) {
    return (
      <nav
        aria-label="Admin primary navigation"
        className="fixed inset-x-0 bottom-0 z-20 h-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px))] border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
      >
        <div className="grid h-full grid-cols-6 px-1">
          {ADMIN_NAVIGATION.map((destination) => {
            const Icon = destination.icon
            const current = destination.href === activeAdminHref

            return (
              <Link
                key={destination.href}
                to={destination.href}
                title={destination.label}
                aria-label={destination.label}
                activeOptions={{ exact: true }}
                aria-current={current ? 'page' : undefined}
                className={cn(primaryItemClassName, 'min-w-0 px-0.5')}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="max-w-full truncate">{ADMIN_MOBILE_LABELS[destination.href] ?? destination.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    )
  }
  const currentDestination = resolveAppDestination(currentPath, hash)
  const moreCurrent = MOBILE_NAVIGATION.more.some(destination => destination.id === currentDestination)

  return (
    <nav
      aria-label="Owner primary navigation"
      className="fixed inset-x-0 bottom-0 z-20 h-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px))] border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden"
    >
      <div className="grid h-14 grid-cols-5 px-gutter">
        {MOBILE_NAVIGATION.primary.map((destination) => {
          const Icon = DESTINATION_ICONS[destination.id]

          return (
            <Link
              key={destination.id}
              to={destination.to}
              activeOptions={{ exact: true }}
              aria-current={currentDestination === destination.id ? 'page' : undefined}
              className={primaryItemClassName}
            >
              <Icon aria-hidden="true" className="size-5" />
              <span>{destination.label}</span>
            </Link>
          )
        })}

        <Sheet>
          <SheetTrigger
            render={(
              <button
                type="button"
                aria-current={moreCurrent ? 'page' : undefined}
                className={primaryItemClassName}
              >
                <Ellipsis aria-hidden="true" className="size-5" />
                <span>More</span>
              </button>
            )}
          />
          <SheetContent
            side="bottom"
            className="max-h-[80svh] rounded-t-lg pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]"
          >
            <SheetHeader>
              <SheetTitle>More</SheetTitle>
              <SheetDescription>The rest of the workspace.</SheetDescription>
            </SheetHeader>
            <div className="grid gap-6 overflow-y-auto px-gutter pb-related">
              {MORE_GROUPS.map(group => (
                <section key={group.id} aria-labelledby={`mobile-nav-${group.id}`}>
                  <h2
                    id={`mobile-nav-${group.id}`}
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {group.label}
                  </h2>
                  <div className="mt-intra grid gap-1">
                    {group.destinations.map((destination) => {
                      const Icon = DESTINATION_ICONS[destination.id]

                      return (
                        <SheetClose
                          key={destination.id}
                          render={(
                            <Link
                              to={destination.to}
                              {...(destination.hash === undefined
                                ? {}
                                : { hash: destination.hash.replace(/^#/, '') })}
                              aria-current={currentDestination === destination.id ? 'page' : undefined}
                              className="flex min-h-touch items-center gap-related rounded-sm px-related py-intra font-sans text-sm font-medium text-foreground no-underline transition-[color,background-color,transform] duration-100 ease-out hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100 aria-[current=page]:bg-muted aria-[current=page]:font-semibold"
                            >
                              <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
                              <span>{destination.label}</span>
                            </Link>
                          )}
                        />
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
