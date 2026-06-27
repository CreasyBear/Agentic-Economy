import { Activity, ClipboardList, LockKeyhole, ScrollText } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const adminNavItems = [
  { href: '/admin/claims', label: 'Claims', icon: ClipboardList },
  { href: '/admin/audit-events', label: 'Audit', icon: ScrollText },
  { href: '/admin/index-health', label: 'Index health', icon: Activity },
] as const

type AeAdminShellProps = {
  title: string
  description: string
  currentPath: string
  children: ReactNode
}

export function AeAdminShell({ title, description, currentPath, children }: AeAdminShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:shadow-md"
      >
        Skip to admin content
      </a>
      <header className="border-b bg-background/95">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <a href="/" className="inline-flex items-center gap-2 font-heading text-sm font-semibold tracking-normal text-foreground">
            <LockKeyhole aria-hidden="true" className="size-4" />
            Agentic Economy Admin
          </a>
          <nav aria-label="Admin" className="flex flex-wrap items-center gap-2">
            {adminNavItems.map((item) => {
              const Icon = item.icon
              return (
                <Button key={item.href} variant={currentPath === item.href ? 'secondary' : 'ghost'} size="sm" asChild>
                  <a href={item.href} aria-current={currentPath === item.href ? 'page' : undefined}>
                    <Icon data-icon="inline-start" aria-hidden="true" />
                    {item.label}
                  </a>
                </Button>
              )
            })}
          </nav>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 md:px-6">
          <p className="text-sm font-medium text-muted-foreground">Protected operations</p>
          <h1 className="font-heading text-3xl font-semibold leading-tight tracking-normal text-foreground md:text-4xl">{title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </section>
        <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-12 md:px-6">{children}</section>
      </main>
      <Separator />
      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground md:px-6">
        <span>Admin surfaces fail closed until source-owned membership can be resolved.</span>
      </footer>
    </div>
  )
}
