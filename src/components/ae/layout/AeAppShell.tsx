import { AeNavigationSafetyProvider } from './AeNavigationSafetyContext'
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { WorkspaceSidebar } from './app-shell/WorkspaceSidebar'
import { WorkspaceTablePreferences } from './app-shell/WorkspaceTablePreferences'
import { WorkspaceFrameContext } from './app-shell/WorkspaceFrameContext'
import { WorkspaceTransitionBoundary } from './WorkspaceTransitionBoundary'
import { useRouterState } from '@tanstack/react-router'
import { OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { KeyboardShortcutsDialog } from '@/components/ae/shortcuts/KeyboardShortcutsDialog'
import { CommandPanelProvider } from '@/components/ae/command-panel'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAppearance } from '@/components/ae/theme/ThemeProvider'

import { AeAppHeader } from './app-shell/AeAppHeader'
import { ChatHeaderSlotProvider } from './app-shell/ChatHeaderSlot'
import { useAppShellState } from './app-shell/useAppShellState'
import './AppFrameComposition.css'

function usePublicDocumentFocus(pathname: string) {
  const pending = useRouterState({ select: state => state.isLoading })
  const previousPathRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (pending) return
    if (previousPathRef.current === undefined) {
      previousPathRef.current = pathname
      return
    }
    if (previousPathRef.current === pathname) return
    previousPathRef.current = pathname
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('main#main-content[data-shell-mode]')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [pathname, pending])
}

export function AeAppShell({ children }: { children: ReactNode }) {
  const shell = useAppShellState()
  const { sidebarVisible, setSidebarVisible } = useAppearance()
  const isMobile = useIsMobile()
  const handleSidebarOpenChange = useCallback((visible: boolean) => {
    if (!visible && document.activeElement instanceof HTMLElement
      && document.activeElement.closest('[data-slot="sidebar"], [data-slot="sidebar-trigger"]')) {
      document.querySelector<HTMLButtonElement>('[data-workspace-display-settings]')?.focus()
    }
    setSidebarVisible(visible)
  }, [setSidebarVisible])
  usePublicDocumentFocus(shell.pathname)
  const chatFrame = shell.pathname.startsWith('/t/') || shell.pathname.startsWith('/s/')
  const contentClassName = cn(
    'flex min-h-0 flex-1 flex-col',
    chatFrame ? 'overflow-hidden' : null,
    shell.hidePublicFooter ? '[&_.arc-site-footer]:hidden' : null,
  )

  const header = () => (
    <AeAppHeader
      signedIn={shell.isSignedIn}
      minimal={shell.isMinimalShell}
      mobileNavOpen={shell.mobileNavOpen}
      setMobileNavOpen={shell.setMobileNavOpen}
      elevated={shell.elevated}
      hydrated={shell.hydrated}
      chatFrame={chatFrame}
    />
  )

  return (
    <AeNavigationSafetyProvider><ChatHeaderSlotProvider><div
      className={cn('arc-market arc-app-frame', chatFrame ? 'h-dvh overflow-hidden' : null)}
      style={{ '--header-height': '4rem' } as CSSProperties}
    >
      <a
        data-testid="skip-to-content"
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-gutter focus:top-gutter focus:z-30 focus:rounded-md focus:bg-container focus:px-gutter focus:py-intra focus:text-sm focus:font-medium focus:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Skip to content
      </a>
      <div id="ae-app-shell-sentinel" aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2" />
      <CommandPanelProvider open={shell.commandOpen} onOpenChange={shell.handleCommandOpenChange}>
        {shell.isMinimalShell ? (
          <>
            {header()}
            <div className={contentClassName}>{children}</div>
          </>
        ) : (
          // Keep this frame stable while Clerk resolves, so routed pages do not remount.
          <OperatorChromeProvider>
          <WorkspaceFrameContext.Provider value={shell.isSignedIn}>
          <SidebarProvider open={sidebarVisible} onOpenChange={handleSidebarOpenChange} className={cn('min-w-0 flex-1 [--sidebar-width:260px] [--sidebar-border:transparent]', chatFrame && 'h-full min-h-0 overflow-hidden')}>
            {shell.isSignedIn && (isMobile || sidebarVisible) ? <WorkspaceSidebar /> : null}
            <SidebarInset className="min-w-0 rounded-none bg-transparent">
            <div
              data-shell="app-content"
              data-owner-scroll={shell.isSignedIn && !chatFrame ? 'document' : undefined}
              className={cn(
                'flex min-h-0 w-full flex-1 flex-col',
                chatFrame ? 'overflow-hidden' : 'min-h-svh',

              )}
            >
              {header()}
              <div className={contentClassName}><WorkspaceTransitionBoundary><WorkspaceTablePreferences>{children}</WorkspaceTablePreferences></WorkspaceTransitionBoundary></div>
            </div>
          </SidebarInset></SidebarProvider>
          </WorkspaceFrameContext.Provider>
          </OperatorChromeProvider>
        )}
        <KeyboardShortcutsDialog open={shell.shortcutsOpen} onOpenChange={shell.setShortcutsOpen} />
      </CommandPanelProvider>
    </div></ChatHeaderSlotProvider></AeNavigationSafetyProvider>
  )
}
