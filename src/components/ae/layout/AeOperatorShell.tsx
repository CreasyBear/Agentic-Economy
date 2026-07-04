'use client'

import { createContext, use, useEffect, useId, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { AppShell } from '@astryxdesign/core/AppShell'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading, Text } from '@astryxdesign/core/Text'

import { AeOperatorBreadcrumbs } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeOperatorCommandMenu } from '@/components/ae/layout/AeOperatorCommandMenu'
import { AeOperatorSectionNav } from '@/components/ae/layout/AeOperatorSectionNav'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import {
  resolveOperatorListCrumb,
  resolveOperatorSection,
  type OperatorBreadcrumbItem,
  type OperatorNavBadges,
  type OperatorRole,
  type OperatorSectionId,
} from '@/lib/operator/navigation'

export type OperatorDensity = 'compact' | 'comfortable'

const OperatorDensityContext = createContext<OperatorDensity>('comfortable')

/** Owner routes render compact; admin/developer routes keep comfortable density. */
export function useOperatorDensity(): OperatorDensity {
  return use(OperatorDensityContext)
}

export type AeOperatorShellProps = {
  operatorRole: OperatorRole
  title: string
  description: string
  eyebrow?: string
  actions?: ReactNode
  currentPath: string
  mainContentId?: string
  breadcrumbs?: readonly OperatorBreadcrumbItem[]
  navBadges?: OperatorNavBadges
  sectionId?: OperatorSectionId
  children: ReactNode
}

export function AeOperatorShell({
  operatorRole,
  title,
  description,
  eyebrow,
  actions,
  currentPath,
  mainContentId,
  breadcrumbs: providedBreadcrumbs,
  navBadges,
  sectionId,
  children,
}: AeOperatorShellProps) {
  const titleId = useId()
  const descriptionId = useId()
  const activeSection = sectionId ?? resolveOperatorSection(currentPath)
  const density: OperatorDensity = operatorRole === 'owner' ? 'compact' : 'comfortable'
  const isCompact = density === 'compact'
  const shellRef = useRef<HTMLDivElement>(null)
  const mainContentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mainContentId === undefined) return

    const mainContent = mainContentRef.current
    const skipLink = shellRef.current?.querySelector<HTMLAnchorElement>('[data-testid="skip-to-content"]')
    if (mainContent === null || skipLink === null || skipLink === undefined) return

    const previousHref = skipLink.getAttribute('href')
    skipLink.setAttribute('href', `#${mainContentId}`)
    const focusMainContent = () => {
      window.requestAnimationFrame(() => {
        mainContent.focus()
      })
    }

    skipLink.addEventListener('click', focusMainContent)
    return () => {
      skipLink.removeEventListener('click', focusMainContent)
      if (previousHref === null) {
        skipLink.removeAttribute('href')
      } else {
        skipLink.setAttribute('href', previousHref)
      }
    }
  }, [mainContentId])

  const breadcrumbs = useMemo<readonly OperatorBreadcrumbItem[]>(() => {
    const listCrumb = resolveOperatorListCrumb(operatorRole, currentPath)
    return providedBreadcrumbs ?? (listCrumb === undefined ? [] : [listCrumb, { label: title }])
  }, [currentPath, operatorRole, providedBreadcrumbs, title])
  const sidebar =
    isCompact ? undefined : (
      <div className="hidden md:contents">
        <AeOperatorSidebar operatorRole={operatorRole} currentPath={currentPath} navBadges={navBadges ?? {}} />
      </div>
    )

  const topNav = useMemo(
    () => (
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        {breadcrumbs.length === 0 ? null : (
          <div className="hidden min-w-0 flex-1 md:block">
            <AeOperatorBreadcrumbs items={breadcrumbs} />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <AeOperatorCommandMenu operatorRole={operatorRole} />
        </div>
      </div>
    ),
    [breadcrumbs, operatorRole],
  )

  return (
    <OperatorDensityContext.Provider value={density}>
      <AppShell
        ref={shellRef}
        height="auto"
        contentPadding={0}
        topNav={topNav}
        {...(sidebar === undefined ? {} : { sideNav: sidebar })}
      >
        <div
          ref={mainContentRef}
          id={mainContentId}
          tabIndex={mainContentId === undefined ? undefined : -1}
          className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8"
        >
          {breadcrumbs.length === 0 ? null : (
            <div className="md:hidden">
              <AeOperatorBreadcrumbs items={breadcrumbs} />
            </div>
          )}

          <section aria-labelledby={titleId} aria-describedby={descriptionId} className="grid gap-2">
            {eyebrow ? (
              <Text type="supporting" weight="medium" color="secondary" display="block">
                {eyebrow}
              </Text>
            ) : null}
            <Heading id={titleId} level={1} textWrap="balance">
              {title}
            </Heading>
            <Text id={descriptionId} type="body" color="secondary" display="block" textWrap="pretty">
              {description}
            </Text>
            {actions ? <div className="flex flex-wrap items-center gap-3 pt-1">{actions}</div> : null}
          </section>
          <Divider variant="subtle" />

          <div
            className={
              activeSection === undefined
                ? 'grid gap-6'
                : 'grid gap-6 lg:grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)] lg:items-start'
            }
          >
            {activeSection === undefined ? null : (
              <aside className="rounded-md border border-border bg-card p-4 lg:sticky lg:top-20">
                <AeOperatorSectionNav sectionId={activeSection} currentPath={currentPath} />
              </aside>
            )}
            <section className="grid min-w-0 gap-4">{children}</section>
          </div>
        </div>
      </AppShell>
    </OperatorDensityContext.Provider>
  )
}
