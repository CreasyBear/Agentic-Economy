'use client'

import { createContext, use, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AppShell } from '@astryxdesign/core/AppShell'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading, Text } from '@astryxdesign/core/Text'

import { AeOperatorBreadcrumbs } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeOperatorCommandMenu } from '@/components/ae/layout/AeOperatorCommandMenu'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import {
  resolveOperatorListCrumb,
  type OperatorBreadcrumbItem,
  type OperatorNavBadges,
  type OperatorRole,
} from '@/lib/operator/navigation'

export type OperatorDensity = 'compact' | 'comfortable'

const OperatorDensityContext = createContext<OperatorDensity>('comfortable')
type OperatorShellChrome = Omit<AeOperatorShellProps, 'children'>

type OperatorShellChromeRegistration = {
  setChrome: (chrome: OperatorShellChrome) => void
  clearChrome: (chrome: OperatorShellChrome) => void
}

const OperatorShellChromeContext = createContext<OperatorShellChromeRegistration | null>(null)


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
  children: ReactNode
}

export function AeOperatorShell(props: AeOperatorShellProps) {
  const parentShell = use(OperatorShellChromeContext)

  if (parentShell !== null) {
    return <NestedOperatorShell parentShell={parentShell} {...props} />
  }

  return <RootOperatorShell {...props} />
}

function NestedOperatorShell({
  parentShell,
  operatorRole,
  title,
  description,
  eyebrow,
  actions,
  currentPath,
  mainContentId,
  breadcrumbs,
  navBadges,
  children,
}: AeOperatorShellProps & { parentShell: OperatorShellChromeRegistration }) {
  const chrome = useMemo<OperatorShellChrome>(
    () => ({
      operatorRole,
      title,
      description,
      currentPath,
      ...(eyebrow === undefined ? {} : { eyebrow }),
      ...(actions === undefined ? {} : { actions }),
      ...(mainContentId === undefined ? {} : { mainContentId }),
      ...(breadcrumbs === undefined ? {} : { breadcrumbs }),
      ...(navBadges === undefined ? {} : { navBadges }),
    }),
    [operatorRole, title, description, eyebrow, actions, currentPath, mainContentId, breadcrumbs, navBadges],
  )

  useLayoutEffect(() => {
    parentShell.setChrome(chrome)
    return () => parentShell.clearChrome(chrome)
  }, [chrome, parentShell])

  return <>{children}</>
}

function RootOperatorShell(props: AeOperatorShellProps) {
  const [registeredChrome, setRegisteredChrome] = useState<OperatorShellChrome | null>(null)
  const setChrome = useCallback((chrome: OperatorShellChrome) => {
    setRegisteredChrome(chrome)
  }, [])
  const clearChrome = useCallback((chrome: OperatorShellChrome) => {
    setRegisteredChrome((currentChrome) => (currentChrome === chrome ? null : currentChrome))
  }, [])
  const registration = useMemo<OperatorShellChromeRegistration>(
    () => ({ setChrome, clearChrome }),
    [clearChrome, setChrome],
  )

  const {
    operatorRole,
    title,
    description,
    eyebrow,
    actions,
    currentPath,
    mainContentId,
    breadcrumbs: providedBreadcrumbs,
    navBadges,
  } = registeredChrome ?? props
  const { children } = props
  const titleId = useId()
  const descriptionId = useId()
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
      <OperatorShellChromeContext.Provider value={registration}>
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

            <div className="grid gap-6">
              <section className="grid min-w-0 gap-4">{children}</section>
            </div>
          </div>
        </AppShell>
      </OperatorShellChromeContext.Provider>
    </OperatorDensityContext.Provider>
  )
}
