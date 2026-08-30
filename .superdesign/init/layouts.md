# Shared layouts (operator)

## AeOperatorShell
- Path: `src/components/ae/layout/AeOperatorShell.tsx`
- Inset sidebar, skip link, 44px header, record header, optional secondary bar, card well.
```tsx
'use client'

import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'

import { AeOperatorBreadcrumbs } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeOperatorCommandMenu } from '@/components/ae/layout/AeOperatorCommandMenu'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import { AeRecordHeader } from '@/components/ae/layout/AeRecordHeader'
import { OperatorCommandOpenContext } from '@/components/ae/layout/operator-command-context'
import {
  resolveOperatorListCrumb,
  resolveOperatorNavItem,
  type OperatorBreadcrumbItem,
  type OperatorNavBadges,
  type OperatorRole,
} from '@/lib/operator/navigation'

type OperatorShellChrome = Omit<AeOperatorShellProps, 'children'>

type OperatorShellChromeRegistration = {
  setChrome: (chrome: OperatorShellChrome) => void
  clearChrome: (chrome: OperatorShellChrome) => void
}

const OperatorShellChromeContext = createContext<OperatorShellChromeRegistration | null>(null)


export type AeOperatorShellProps = {
  operatorRole: OperatorRole
  title: string
  description: string
  actions?: ReactNode
  secondaryBar?: ReactNode
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
  actions,
  secondaryBar,
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
      ...(actions === undefined ? {} : { actions }),
      ...(secondaryBar === undefined ? {} : { secondaryBar }),
      ...(mainContentId === undefined ? {} : { mainContentId }),
      ...(breadcrumbs === undefined ? {} : { breadcrumbs }),
      ...(navBadges === undefined ? {} : { navBadges }),
    }),
    [operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, breadcrumbs, navBadges],
  )

  useLayoutEffect(() => {
    parentShell.setChrome(chrome)
    return () => parentShell.clearChrome(chrome)
  }, [chrome, parentShell])

  return <>{children}</>
}

function OperatorSidebarToggle() {
  const { isMobile, open, openMobile } = useSidebar()
  const expanded = isMobile ? openMobile : open
  const triggerRef = useRef<HTMLButtonElement>(null)
  const previousExpandedRef = useRef(expanded)
  const previousIsMobileRef = useRef(isMobile)

  useEffect(() => {
    if (previousExpandedRef.current && !expanded && previousIsMobileRef.current === isMobile) {
      triggerRef.current?.focus()
    }
    previousExpandedRef.current = expanded
    previousIsMobileRef.current = isMobile
  }, [expanded, isMobile])

  return (
    <SidebarTrigger
      ref={triggerRef}
      type="button"
      aria-label={expanded ? 'Close operator navigation' : 'Open operator navigation'}
      aria-controls="operator-sidebar-navigation"
      aria-expanded={expanded}
      className="-ms-1"
    />
  )
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
    actions,
    secondaryBar,
    currentPath,
    mainContentId,
    breadcrumbs: providedBreadcrumbs,
    navBadges,
  } = registeredChrome ?? props
  const { children } = props
  const resolvedMainContentId = mainContentId ?? 'operator-main-content'
  const [commandOpen, setCommandOpen] = useState(false)
  const openCommand = useCallback(() => setCommandOpen(true), [])
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mainContent = document.getElementById(resolvedMainContentId)
    const skipLink = shellRef.current?.querySelector<HTMLAnchorElement>('[data-testid="skip-to-content"]')
    if (mainContent === null || skipLink === null || skipLink === undefined) return

    const previousHref = skipLink.getAttribute('href')
    skipLink.setAttribute('href', `#${resolvedMainContentId}`)
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
  }, [resolvedMainContentId])

  const breadcrumbs = useMemo<readonly OperatorBreadcrumbItem[]>(() => {
    const listCrumb = resolveOperatorListCrumb(operatorRole, currentPath)
    return providedBreadcrumbs ?? (listCrumb === undefined ? [] : [listCrumb, { label: title }])
  }, [currentPath, operatorRole, providedBreadcrumbs, title])
  const NavIcon = resolveOperatorNavItem(operatorRole, currentPath)?.icon

  return (
    <OperatorCommandOpenContext.Provider value={openCommand}>
      <OperatorShellChromeContext.Provider value={registration}>
        <SidebarProvider ref={shellRef}>
          <a
            data-testid="skip-to-content"
            href={`#${resolvedMainContentId}`}
            className="sr-only focus:not-sr-only focus:absolute focus:start-gutter focus:top-gutter focus:z-20 focus:rounded-md focus:bg-container focus:px-gutter focus:py-intra focus:text-sm focus:font-medium focus:text-foreground"
          >
            Skip to content
          </a>
          <AeOperatorSidebar operatorRole={operatorRole} currentPath={currentPath} navBadges={navBadges ?? {}} />
          <SidebarInset id={resolvedMainContentId} tabIndex={-1} className="bg-card">
            <header className="flex min-h-touch shrink-0 items-center gap-intra border-b border-border">
              <div className="flex min-w-0 items-center gap-intra px-gutter">
                <OperatorSidebarToggle />
                {breadcrumbs.length === 0 ? null : (
                  <>
                    <Separator orientation="vertical" className="me-intra data-[orientation=vertical]:h-4" />
                    <AeOperatorBreadcrumbs items={breadcrumbs} />
                  </>
                )}
              </div>
              <div className="ms-auto px-gutter">
                <AeOperatorCommandMenu
                  operatorRole={operatorRole}
                  open={commandOpen}
                  onOpenChange={setCommandOpen}
                />
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col px-gutter pb-gutter">
              <AeRecordHeader
                title={title}
                description={description}
                {...(NavIcon === undefined ? {} : { icon: <NavIcon /> })}
                {...(actions === undefined ? {} : { actions })}
              />
              {secondaryBar === undefined ? null : secondaryBar}
              <div className="min-h-0 flex-1 pt-intra">{children}</div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </OperatorShellChromeContext.Provider>
    </OperatorCommandOpenContext.Provider>
  )
}
```

## AeOperatorSidebar
- Path: `src/components/ae/layout/AeOperatorSidebar.tsx`
```tsx
'use client'

import { SearchIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

import { useOpenOperatorCommand } from '@/components/ae/layout/operator-command-context'
import {
  formatOperatorNavBadge,
  isOperatorPathActive,
  navGroupsForRole,
  operatorUtilityItemsForRole,
  roleHomeHref,
  roleLabel,
  type OperatorNavBadges,
  type OperatorRole,
} from '@/lib/operator/navigation'

type AeOperatorSidebarProps = {
  operatorRole: OperatorRole
  currentPath: string
  navBadges?: OperatorNavBadges
}

const EMPTY_NAV_BADGES: OperatorNavBadges = {}


export function AeOperatorSidebar({ operatorRole, currentPath, navBadges = EMPTY_NAV_BADGES }: AeOperatorSidebarProps) {
  const { state, isMobile, open, openMobile } = useSidebar()
  const openCommand = useOpenOperatorCommand()
  const isCollapsed = state === 'collapsed'
  const expanded = isMobile ? openMobile : open
  const navGroups = navGroupsForRole(operatorRole)
  const utilityItems = operatorUtilityItemsForRole(operatorRole)

  return (
    <Sidebar variant="inset" collapsible="icon" role="complementary" aria-label="Workspace navigation">
      <nav id="operator-sidebar-navigation" aria-label="Operator navigation" className="flex h-full min-h-0 flex-1 flex-col">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="Agentic Economy workspace">
                <a href={roleHomeHref[operatorRole]} aria-label={`${roleLabel[operatorRole]} home`}>
                  <img src="/brand/logo/ae-favicon.svg" alt="" aria-hidden="true" className="size-8 shrink-0" />
                  <span className={isCollapsed ? 'sr-only' : 'grid min-w-0 gap-0.5'}>
                    <span className="truncate text-sm font-semibold text-sidebar-foreground">Agentic Economy</span>
                    <span className="truncate text-xs text-muted-foreground">{roleLabel[operatorRole]}</span>
                  </span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    type="button"
                    tooltip="Search"
                    onClick={() => openCommand?.()}
                  >
                    <SearchIcon aria-hidden="true" />
                    <span className={isCollapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>Search</span>
                    {isCollapsed ? null : (
                      <kbd className="ms-auto font-mono text-[0.6875rem] text-muted-foreground">/</kbd>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {navGroups.map((group) => (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel asChild>
                <span>{group.label}</span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const current = isOperatorPathActive(currentPath, item.href)
                    const badge = formatOperatorNavBadge(navBadges[item.href])
                    const Icon = item.icon

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={current} tooltip={item.label}>
                          <a
                            href={item.href}
                            aria-label={isCollapsed ? item.label : undefined}
                            aria-current={current ? 'page' : undefined}
                          >
                            <Icon aria-hidden="true" />
                            <span className={isCollapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{item.label}</span>
                          </a>
                        </SidebarMenuButton>
                        {badge === undefined ? null : (
                          <SidebarMenuBadge>
                            <Badge variant="secondary">{badge}</Badge>
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="mt-auto">
          <SidebarGroupLabel asChild>
            <span>Resources</span>
          </SidebarGroupLabel>
          <SidebarMenu>
            {utilityItems.map((item) => {
              const current = isOperatorPathActive(currentPath, item.href)
              const Icon = item.icon

              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={current} tooltip={item.label}>
                    <a
                      href={item.href}
                      aria-label={isCollapsed ? item.label : undefined}
                      aria-current={current ? 'page' : undefined}
                    >
                      <Icon aria-hidden="true" />
                      <span className={isCollapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarFooter>
      </nav>
      <SidebarRail
        aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
        aria-controls="operator-sidebar-navigation"
        aria-expanded={expanded}
      />
    </Sidebar>
  )
}
```

## OwnerSettingsShell
- Path: `src/components/ae/settings/OwnerSettingsShell.tsx`
```tsx
import type { ReactNode } from 'react'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { OwnerSettingsNav } from '@/components/ae/settings/OwnerSettingsNav'
import {
  ownerSettingsPathForCurrent,
  type OwnerSettingsNavCurrent,
} from '@/lib/operator/settings-navigation'

export function OwnerSettingsShell({
  current,
  title,
  description,
  currentPath,
  children,
}: Readonly<{
  current: OwnerSettingsNavCurrent
  title: string
  description: string
  currentPath?: string
  children: ReactNode
}>) {
  return (
    <AeOperatorShell
      operatorRole="owner"
      title={title}
      description={description}
      currentPath={currentPath ?? ownerSettingsPathForCurrent(current)}
      secondaryBar={<OwnerSettingsNav current={current} />}
    >
      <AeSettingsStack>{children}</AeSettingsStack>
    </AeOperatorShell>
  )
}
```

## OwnerSettingsNav
- Path: `src/components/ae/settings/OwnerSettingsNav.tsx`
```tsx
import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'
import {
  ownerSettingsNavGroups,
  type OwnerSettingsNavCurrent,
} from '@/lib/operator/settings-navigation'

export function OwnerSettingsNav({ current }: { current: OwnerSettingsNavCurrent }) {
  return (
    <nav aria-label="Settings" className="flex flex-col gap-related border-b border-border py-intra sm:flex-row sm:flex-wrap sm:gap-section">
      {ownerSettingsNavGroups.map((group) => (
        <div key={group.id} className="grid min-w-0 gap-intra">
          <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
          <div className="flex flex-wrap gap-intra">
            {group.items.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                className={cn(
                  'inline-flex min-h-touch items-center border-b-2 px-related text-sm transition-colors',
                  current === item.id
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}
```

## AeRecordHeader
- Path: `src/components/ae/layout/AeRecordHeader.tsx`
```tsx
import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AeRecordHeaderProps = {
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * Compact operator page bar: title, visible description, trailing actions.
 */
export function AeRecordHeader({
  title,
  description,
  icon,
  actions,
  className,
}: AeRecordHeaderProps) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <div
      className={cn(
        'flex min-h-touch flex-wrap items-start justify-between gap-related border-b border-border py-intra',
        className,
      )}
      {...(description === undefined ? {} : { 'aria-describedby': descriptionId })}
    >
      <div className="flex min-w-0 items-start gap-related">
        {icon === undefined ? null : (
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground [&_svg]:size-4"
          >
            {icon}
          </span>
        )}
        <div className="grid min-w-0 gap-intra">
          <h1 id={titleId} className="truncate text-base font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description === undefined ? null : (
            <p id={descriptionId} className="text-pretty text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap items-center gap-intra">{actions}</div>
      )}
    </div>
  )
}
```

## AeSection / AeSettingsStack / AeSettingsRow
- Path: `src/components/ae/layout/AeSection.tsx`
```tsx
import { ChevronRightIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AeSectionProps = {
  title: string
  description?: string
  children?: ReactNode
  id?: string
  className?: string
}

export function AeSection({ title, description, children, id, className }: AeSectionProps) {
  const generatedTitleId = useId()
  const titleId = `${generatedTitleId}-title`

  return (
    <section
      aria-labelledby={titleId}
      className={cn('grid scroll-mt-6 gap-related', className)}
      {...(id === undefined ? {} : { id })}
    >
      <div className="grid gap-intra">
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="text-pretty text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

export function AeSettingsStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto grid w-full max-w-3xl gap-section pb-hero', className)}>{children}</div>
}

type AeSettingsRowProps = {
  title: string
  description?: string
  href?: string
  action?: ReactNode
}

export function AeSettingsRow({ title, description, href, action }: AeSettingsRowProps) {
  const content = (
    <>
      <span className="grid min-w-0 flex-1 gap-intra">
        <span className="font-medium text-foreground">{title}</span>
        {description === undefined ? null : (
          <span className="text-pretty text-sm text-muted-foreground">{description}</span>
        )}
      </span>
      {action === undefined ? (
        href === undefined ? null : <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        action
      )}
    </>
  )
  const className = 'flex min-h-touch items-center gap-related rounded-md border border-border px-gutter py-intra transition-colors hover:bg-muted/40'

  if (href === undefined) {
    return <div className={className}>{content}</div>
  }

  return (
    <a href={href} className={className}>
      {content}
    </a>
  )
}
```
