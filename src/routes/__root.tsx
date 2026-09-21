/// <reference types="vite/client" />
import { ClerkProvider } from '@clerk/tanstack-react-start'
import { ClientOnly, HeadContent, Outlet, Scripts, createRootRoute, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import { Toaster } from 'sonner'

import { AeAppShell } from '@/components/ae/layout/AeAppShell'
import { ChatConvexProvider, SignedInConvexProvider, requiresChatProviders } from '@/components/ae/layout/AeConvexProviders'
import { useIsMobile } from '@/hooks/use-mobile'
import { ThemeProvider } from '@/components/ae/theme/ThemeProvider'
import { RouteProgressBar } from '@/components/ae/layout/AeRouteProgressBar'
import { SITE_THEME_COLOR_HEX } from '@/components/ui/theme-meta'

import { AeObservabilityErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { bootClientObservability } from '@/lib/observability/boot-client-observability'
import appCss from '../styles/globals.css?url'
import { clerkAppearance } from '@/components/ae/website/clerk-appearance'
import { HOME } from '@/content/brand-copy'
import { AECON_MARK_SRC } from '@/content/brand-assets'

function AeObservabilityBoot() {
  const router = useRouter()

  useEffect(() => {
    bootClientObservability(router)
  }, [router])

  return null
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Agentic Economy' },
      {
        name: 'description',
        content: HOME.metaDescription,
      },
      { name: 'theme-color', content: SITE_THEME_COLOR_HEX },
      { name: 'color-scheme', content: 'light dark' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: AECON_MARK_SRC, type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: AECON_MARK_SRC },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider>
        <AeAppShell>
          <Outlet />
        </AeAppShell>
      </ThemeProvider>
    </RootDocument>
  )
}

function responsiveToasterRef(node: HTMLElement | null) {
  node?.setAttribute('aria-live', 'off')
}

function responsiveToasterProps(isMobile: boolean) {
  return {
    position: (isMobile ? 'top-right' : 'bottom-right') as 'top-right' | 'bottom-right',
    offset: isMobile ? '72px' : '16px',
    duration: 6000,
    visibleToasts: 5,
    toastOptions: {
      className: 'border-border bg-card text-foreground shadow-overlay',
    },
  }
}

function RootDocument({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isMobile = useIsMobile()
  const chatProvidersRequired = requiresChatProviders(pathname)
  const content = (
    <ClerkProvider appearance={clerkAppearance}>
      {chatProvidersRequired ? <ChatConvexProvider>{children}</ChatConvexProvider> : <SignedInConvexProvider>{children}</SignedInConvexProvider>}
    </ClerkProvider>
  )

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <RouteProgressBar />
        <AeObservabilityBoot />
        <AeObservabilityErrorBoundary>{content}</AeObservabilityErrorBoundary>
        <ClientOnly>
          <Toaster ref={responsiveToasterRef} {...responsiveToasterProps(isMobile)} />
        </ClientOnly>
        <Scripts />
      </body>
    </html>
  )
}

export function ResponsiveToaster() {
  const isMobile = useIsMobile()
  return <Toaster ref={responsiveToasterRef} {...responsiveToasterProps(isMobile)} />
}

