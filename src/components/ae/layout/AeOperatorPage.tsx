'use client'

import { WorkspaceFrameContext } from './app-shell/WorkspaceFrameContext'
import { AeRenderErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { attemptViteStaleChunkReload } from '@/lib/observability/stale-chunk-reload'
import { OperatorFrameChromeContext, OperatorShellChromeContext, type OperatorPageChrome, type OperatorShellChromeRegistration } from './OperatorChromeContext'

import { lazy, Suspense, use, useCallback, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ADMIN_NAVIGATION, activeRoleNavigationHref } from './app-shell/app-shell.contracts'

import type { OperatorContext } from '@/lib/operator/operator-context'
import './AppFrameComposition.css'

// Loading recovery is a concern of an actual admin render, not shared chrome.
const AdminCommandRecoveryPanel = lazy(() => import('@/components/ae/admin/actions/AdminCommandRecoveryPanel')
  .then(module => ({ default: module.AdminCommandRecoveryPanel })))

export type AeOperatorPageProps = OperatorPageChrome & {
  operatorContext?: OperatorContext
  children: ReactNode
}

type OperatorPageChromeInput = Pick<AeOperatorPageProps, 'operatorRole' | 'title' | 'description' | 'currentPath'> & {
  [K in 'actions' | 'secondaryBar' | 'mainContentId' | 'suppressSurfaceNavigation' | 'pending' | 'contentOwnsHeading']?: AeOperatorPageProps[K] | undefined
}

function chromeFromProps(props: OperatorPageChromeInput): OperatorPageChrome {
  const { operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, suppressSurfaceNavigation, pending, contentOwnsHeading } = props
  return {
    operatorRole,
    title,
    description,
    currentPath,
    ...(contentOwnsHeading === undefined ? {} : { contentOwnsHeading }),
    ...(actions === undefined ? {} : { actions }),
    ...(secondaryBar === undefined ? {} : { secondaryBar }),
    ...(mainContentId === undefined ? {} : { mainContentId }),
    ...(suppressSurfaceNavigation === undefined ? {} : { suppressSurfaceNavigation }),
    ...(pending === undefined ? {} : { pending }),
  }
}

function useChromeFromProps(props: Omit<AeOperatorPageProps, 'children'>): OperatorPageChrome {
  const { operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, suppressSurfaceNavigation, pending, contentOwnsHeading } = props
  return useMemo<OperatorPageChrome>(
    () => chromeFromProps({ operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, suppressSurfaceNavigation, pending, contentOwnsHeading }),
    [operatorRole, title, description, actions, secondaryBar, currentPath, mainContentId, suppressSurfaceNavigation, pending, contentOwnsHeading],
  )
}

export function AeOperatorPage(props: AeOperatorPageProps) {
  const parentShell = use(OperatorShellChromeContext)

  if (parentShell !== null) {
    return <NestedOperatorPage parentShell={parentShell} {...props} />
  }

  return <RootOperatorPage {...props} />
}

function NestedOperatorPage({
  parentShell,
  children,
  ...props
}: AeOperatorPageProps & { parentShell: OperatorShellChromeRegistration }) {
  const chrome = useChromeFromProps(props)

  useLayoutEffect(() => {
    parentShell.setChrome(chrome)
    return () => parentShell.clearChrome(chrome)
  }, [chrome, parentShell])

  return <>{children}</>
}

function RootOperatorPage(props: AeOperatorPageProps) {
  const [registeredChrome, setRegisteredChrome] = useState<OperatorPageChrome | null>(null)
  const setChrome = useCallback((chrome: OperatorPageChrome) => {
    setRegisteredChrome(chrome)
  }, [])
  const clearChrome = useCallback((chrome: OperatorPageChrome) => {
    setRegisteredChrome((currentChrome) => (currentChrome === chrome ? null : currentChrome))
  }, [])
  const registration = useMemo<OperatorShellChromeRegistration>(
    () => ({ setChrome, clearChrome }),
    [clearChrome, setChrome],
  )

  const propsChrome = useChromeFromProps(props)
  const currentChrome = registeredChrome ?? propsChrome

  const {
    description,
    actions,
    secondaryBar,
    mainContentId,
  } = currentChrome
  const { children } = props
  const resolvedMainContentId = mainContentId ?? 'main-content'
  const showDescriptionLine = description !== '' || actions !== undefined

  const workspaceFrame = use(WorkspaceFrameContext)
  const adminPath = currentChrome.currentPath.startsWith('/admin/workspaces/') ? '/admin/accounts'
    : /^\/admin\/(calls|quotes)\//.test(currentChrome.currentPath) ? '/admin/activity' : currentChrome.currentPath
  const activeAdminHref = activeRoleNavigationHref(adminPath, ADMIN_NAVIGATION)

  // Publish the committed route's title and path to the persistent frame.
  const frameBridge = use(OperatorFrameChromeContext)
  useLayoutEffect(() => {
    if (frameBridge === null) return
    frameBridge.setChrome(currentChrome)
    return () => frameBridge.clearChrome(currentChrome)
  }, [frameBridge, currentChrome])

  return (
    <OperatorShellChromeContext.Provider value={registration}>
      <main
        id={resolvedMainContentId}
        data-shell-mode="operator"
        tabIndex={-1}
        data-testid="operator-content"
        className="arc-market arc-operator-page ae-rail outline-none focus:outline-solid focus:outline-2 focus:outline-offset-2 focus:outline-ring"
      >
        <div
          data-testid="operator-page-stack"
          className="arc-operator-page-stack"
        >
          {currentChrome.operatorRole === 'admin' && !workspaceFrame && !currentChrome.suppressSurfaceNavigation ? (
            <nav aria-label="Admin navigation" className="flex flex-wrap gap-x-related gap-y-1 border-b border-border pb-intra">
              {ADMIN_NAVIGATION.map(item => (
                <Link key={item.href} to={item.href} activeOptions={{ exact: true }} aria-current={item.href === activeAdminHref ? 'page' : undefined}
                  className="inline-flex min-h-touch items-center border-b-2 border-transparent text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
          {showDescriptionLine ? (
            <div className="arc-operator-page-description-row">
              {description === '' ? null : (
                <p className="arc-operator-page-description">
                  {description}
                </p>
              )}
              {actions}
            </div>
          ) : null}
          {secondaryBar === undefined ? null : secondaryBar}
          {currentChrome.operatorRole === 'admin' ? (
            <AeRenderErrorBoundary
              onError={attemptViteStaleChunkReload}
              fallback={<section aria-label="Command recovery unavailable" className="grid gap-3 rounded-lg border border-border p-4">
                <p role="status" className="text-sm text-muted-foreground">Command recovery could not be loaded. Saved recovery identities are retained.</p>
                <button type="button" className="text-sm underline underline-offset-4" onClick={() => window.location.reload()}>Reload command recovery</button>
              </section>}
            >
              <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading command recovery…</p>}>
                <AdminCommandRecoveryPanel />
              </Suspense>
            </AeRenderErrorBoundary>
          ) : null}
          {children}
        </div>
      </main>
    </OperatorShellChromeContext.Provider>
  )
}
