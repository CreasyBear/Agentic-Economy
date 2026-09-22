import type { CSSProperties, ReactNode } from 'react'

import { AeOwnerMobileNavigation } from '@/components/ae/layout/AeOwnerMobileNavigation'
import { OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { KeyboardShortcutsDialog } from '@/components/ae/shortcuts/KeyboardShortcutsDialog'
import { CommandPanelProvider } from '@/components/ae/command-panel'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

import { AeAppHeader } from './app-shell/AeAppHeader'
import { AeAppSidebar } from './app-shell/AeAppSidebar'
import { useAppShellState } from './app-shell/useAppShellState'

export function AeAppShell({ children }: { children: ReactNode }) {
  const shell = useAppShellState()
  const signedInFrame = shell.isSignedIn && !shell.isMinimalShell
  const contentClassName = cn(
    'flex min-h-0 flex-1 flex-col',
    shell.hidePublicFooter ? '[&_footer]:hidden' : null,
  )

  const header = (
    <AeAppHeader
      signedIn={shell.isSignedIn}
      minimal={shell.isMinimalShell}
      mobileNavOpen={shell.mobileNavOpen}
      setMobileNavOpen={shell.setMobileNavOpen}
      elevated={shell.elevated}
      hydrated={shell.hydrated}
    />
  )

  return (
    <div
      className="flex min-h-svh flex-col"
      style={{ '--header-height': '4rem' } as CSSProperties}
    >
      <a
        data-testid="skip-to-content"
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-gutter focus:top-gutter focus:z-40 focus:rounded-md focus:bg-container focus:px-gutter focus:py-intra focus:text-sm focus:font-medium focus:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Skip to content
      </a>
      <div ref={shell.sentinelRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2" />
      <CommandPanelProvider open={shell.commandOpen} onOpenChange={shell.handleCommandOpenChange}>
        {signedInFrame ? (
          <SidebarProvider className="min-h-0 flex-1" defaultOpen>
            <OperatorChromeProvider>
              <AeAppSidebar
                operatorRole={shell.operatorRole}
                pathname={shell.pathname}
                hash={shell.hash}
              />
              <SidebarInset role="presentation" className="min-h-svh pb-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px))] md:pb-0">
                {header}
                <div className={contentClassName}>{children}</div>
                <AeOwnerMobileNavigation currentPath={shell.pathname} />
              </SidebarInset>
            </OperatorChromeProvider>
          </SidebarProvider>
        ) : (
          <>
            {header}
            <div className={contentClassName}>{children}</div>
          </>
        )}
        <KeyboardShortcutsDialog open={shell.shortcutsOpen} onOpenChange={shell.setShortcutsOpen} />
      </CommandPanelProvider>
    </div>
  )
}
