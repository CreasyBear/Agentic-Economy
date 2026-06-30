import {
  Activity,
  ClipboardList,
  Contact,
  Inbox,
  LockKeyhole,
  ScrollText,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

type OperatorRole = 'owner' | 'admin' | 'developer'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

const ownerNavItems: readonly NavItem[] = [
  { href: '/owner/status', label: 'Status', icon: Activity },
  { href: '/owner/inquiries', label: 'Inquiries', icon: Inbox },
  { href: '/owner/actions', label: 'Contact follow-ups', icon: Contact },
  { href: '/owner/business-actions', label: 'Business actions', icon: Wrench },
] as const

const adminNavItems: readonly NavItem[] = [
  { href: '/admin/claims', label: 'Claims', icon: ClipboardList },
  { href: '/admin/audit-events', label: 'Audit events', icon: ScrollText },
  { href: '/admin/index-health', label: 'Index health', icon: Activity },
  { href: '/admin/business-actions', label: 'Business actions', icon: Wrench },
  { href: '/admin/protected-actions', label: 'Protected actions', icon: LockKeyhole },
  { href: '/admin/inquiries', label: 'Inquiries', icon: Inbox },
] as const

const developerNavItems: readonly NavItem[] = [
  { href: '/developers/discovery', label: 'Discovery', icon: ScrollText },
] as const

const navByRole: Record<OperatorRole, readonly NavItem[]> = {
  owner: ownerNavItems,
  admin: adminNavItems,
  developer: developerNavItems,
}

const roleLabel: Record<OperatorRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Builder',
}

type AeOperatorShellProps = {
  role: OperatorRole
  title: string
  description: string
  eyebrow?: string
  actions?: ReactNode
  currentPath: string
  children: ReactNode
}

function isCurrent(currentPath: string, href: string): boolean {
  if (currentPath === href) {
    return true
  }
  return currentPath.startsWith(`${href}/`)
}

export function AeOperatorShell({
  role,
  title,
  description,
  eyebrow,
  actions,
  currentPath,
  children,
}: AeOperatorShellProps) {
  const titleId = useId()
  const descriptionId = useId()
  const navItems = navByRole[role]
  const navLabel = `${roleLabel[role]} operator`

  return (
    <div className="ae-operator-shell flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="ae-skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:min-h-11 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground"
      >
        Skip to operator content
      </a>
      <header className="ae-sticky-layer sticky top-0 border-b border-[var(--ae-public-line)]/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
          <a
            href="/"
            className="inline-flex min-h-10 items-center gap-2 font-heading text-sm font-semibold tracking-normal text-foreground"
          >
            <LockKeyhole aria-hidden="true" className="size-4" />
            Agentic Economy · {roleLabel[role]}
          </a>
          <nav aria-label={navLabel} className="-mx-1 flex flex-wrap items-center gap-1.5 px-1 md:mx-0 md:justify-end md:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const current = isCurrent(currentPath, item.href)

              return (
                <Button
                  key={item.href}
                  variant={current ? 'secondary' : 'ghost'}
                  size="sm"
                  className="min-h-11 px-3 text-xs md:px-4 md:text-sm"
                  asChild
                >
                  <a href={item.href} aria-current={current ? 'page' : undefined} data-status={current ? 'active' : undefined}>
                    <Icon data-icon="inline-start" aria-hidden="true" />
                    {item.label}
                  </a>
                </Button>
              )
            })}
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1">
        <section
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 md:px-6 md:py-8"
        >
          {eyebrow ? (
            <p className="text-sm font-medium leading-6 text-muted-foreground">{eyebrow}</p>
          ) : null}
          <h1 id={titleId} className="text-balance font-heading text-2xl font-semibold leading-tight tracking-normal text-foreground md:text-3xl">
            {title}
          </h1>
          <p id={descriptionId} className="max-w-3xl text-pretty text-sm leading-6 text-muted-foreground">{description}</p>
          {actions ? <div className="flex flex-wrap items-center gap-3 pt-1">{actions}</div> : null}
        </section>
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-12 md:px-6">
          {children}
        </section>
      </main>
      <footer className="border-t border-[var(--ae-public-line)]/80 bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs leading-5 text-muted-foreground md:px-6 md:text-sm">
          <span>Operator surfaces fail closed until membership is resolved.</span>
        </div>
      </footer>
    </div>
  )
}
