'use client'

import { useId } from 'react'
import type { ReactNode } from 'react'

import { AeOperatorBreadcrumbs } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeOperatorCommandMenu } from '@/components/ae/layout/AeOperatorCommandMenu'
import { AeOperatorSectionNav } from '@/components/ae/layout/AeOperatorSectionNav'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import {
  resolveOperatorSection,
  type OperatorBreadcrumbItem,
  type OperatorRole,
  type OperatorSectionId,
} from '@/lib/operator/navigation'

export type AeOperatorShellProps = {
  role: OperatorRole
  title: string
  description: string
  eyebrow?: string
  actions?: ReactNode
  currentPath: string
  breadcrumbs?: readonly OperatorBreadcrumbItem[]
  sectionId?: OperatorSectionId
  children: ReactNode
}

export function AeOperatorShell({
  role,
  title,
  description,
  eyebrow,
  actions,
  currentPath,
  breadcrumbs = [],
  sectionId,
  children,
}: AeOperatorShellProps) {
  const titleId = useId()
  const descriptionId = useId()
  const activeSection = sectionId ?? resolveOperatorSection(currentPath)

  return (
    <div className="ae-operator-shell dark min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="ae-skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:min-h-11 focus:bg-background focus:px-4 focus:py-2 focus:text-foreground"
      >
        Skip to operator content
      </a>

      <SidebarProvider defaultOpen className="ae-operator-layout min-h-dvh">
        <AeOperatorSidebar role={role} currentPath={currentPath} />
        <SidebarInset className="ae-operator-main min-h-dvh">
          <header className="ae-operator-topbar sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:px-6">
            <SidebarTrigger className="ae-operator-shell__sidebar-trigger min-h-10 min-w-10" />
            <Separator orientation="vertical" className="hidden h-5 md:block" />
            {breadcrumbs.length === 0 ? null : (
              <div className="hidden min-w-0 flex-1 md:block">
                <AeOperatorBreadcrumbs items={breadcrumbs} />
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <AeOperatorCommandMenu role={role} />
            </div>
          </header>

          <main id="main-content" tabIndex={-1} className="flex-1">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
              {breadcrumbs.length === 0 ? null : (
                <div className="md:hidden">
                  <AeOperatorBreadcrumbs items={breadcrumbs} />
                </div>
              )}

              <section
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="grid gap-2"
              >
                {eyebrow ? (
                  <p className="text-sm font-medium leading-6 text-muted-foreground">{eyebrow}</p>
                ) : null}
                <h1
                  id={titleId}
                  className="text-balance font-heading text-2xl font-semibold leading-tight tracking-normal text-foreground md:text-3xl"
                >
                  {title}
                </h1>
                <p id={descriptionId} className="max-w-3xl text-pretty text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
                {actions ? <div className="flex flex-wrap items-center gap-3 pt-1">{actions}</div> : null}
              </section>

              <div
                className={
                  activeSection === undefined
                    ? 'grid gap-6'
                    : 'grid gap-6 lg:grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)] lg:items-start'
                }
              >
                {activeSection === undefined ? null : (
                  <aside className="ae-operator-section-rail lg:sticky lg:top-20">
                    <AeOperatorSectionNav sectionId={activeSection} currentPath={currentPath} />
                  </aside>
                )}
                <section className="grid min-w-0 gap-4">{children}</section>
              </div>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
