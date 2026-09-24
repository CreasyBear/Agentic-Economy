import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

import { AeOwnerMobileNavigation } from '@/components/ae/layout/AeOwnerMobileNavigation'
import { OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { KeyboardShortcutsDialog } from '@/components/ae/shortcuts/KeyboardShortcutsDialog'
import { CommandPanelProvider } from '@/components/ae/command-panel'
import { cn } from '@/lib/utils'

import { AeAppHeader } from './app-shell/AeAppHeader'
import { useAppShellState } from './app-shell/useAppShellState'

function usePublicDocumentFocus(pathname: string) {
  const previousPathRef = useRef<string | undefined>(undefined)
  useEffect(() => {
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
  }, [pathname])
}

export function AeAppShell({ children }: { children: ReactNode }) {
  const shell = useAppShellState()
  usePublicDocumentFocus(shell.pathname)
  const chatFrame = shell.pathname.startsWith('/t/') || shell.pathname.startsWith('/s/')
  const contentClassName = cn(
    'flex min-h-0 flex-1 flex-col',
    chatFrame ? 'overflow-hidden' : null,
    shell.hidePublicFooter ? '[&_footer]:hidden' : null,
  )

  const header = (
    <AeAppHeader
      signedIn={shell.isSignedIn}
      operatorRole={shell.operatorRole}
      canAccessAdmin={shell.canAccessAdmin}
      minimal={shell.isMinimalShell}
      mobileNavOpen={shell.mobileNavOpen}
      setMobileNavOpen={shell.setMobileNavOpen}
      elevated={shell.elevated}
      hydrated={shell.hydrated}
      chatFrame={chatFrame}
    />
  )

  return (
    <div
      className={cn('flex min-h-svh flex-col', chatFrame ? 'h-svh overflow-hidden' : null)}
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
            {header}
            <div className={contentClassName}>{children}</div>
          </>
        ) : (
          // Keep this frame stable while Clerk resolves, so routed pages do not remount.
          <OperatorChromeProvider>
            <div
              data-shell="app-content"
              className={cn(
                'flex min-h-0 w-full flex-1 flex-col',
                chatFrame ? 'overflow-hidden' : 'min-h-svh',
                shell.isSignedIn
                  ? 'pb-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px))] md:pb-0'
                  : null,
              )}
            >
              {header}
              <div className={contentClassName}>{children}</div>
              {shell.isSignedIn ? <AeOwnerMobileNavigation currentPath={shell.pathname} /> : null}
            </div>
          </OperatorChromeProvider>
        )}
        <KeyboardShortcutsDialog open={shell.shortcutsOpen} onOpenChange={shell.setShortcutsOpen} />
      </CommandPanelProvider>
    </div>
  )
}
