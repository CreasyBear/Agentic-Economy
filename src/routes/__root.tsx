/// <reference types="vite/client" />
import { ClerkProvider } from '@clerk/tanstack-react-start'
import { HeadContent, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Theme } from '@astryxdesign/core/theme'
import { LinkProvider } from '@astryxdesign/core/Link'
import { LayerProvider } from '@astryxdesign/core/Layer'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

import { RouterLink } from '@/components/astryx/RouterLink'
import { RouteProgressBar } from '@/components/astryx/RouteProgressBar'

import { AeObservabilityErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { AeToaster } from '@/components/ae/feedback/AeToaster'
import { AeObservabilityBoot } from '@/components/ae/layout/AeObservabilityBoot'
import appCss from '../styles/globals.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Agentic Economy' },
      {
        name: 'description',
        content: 'Ask for a local service. Compare published business details, then contact the business when inquiry is available.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/brand/logo/ae-favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/brand/logo/ae-app-icon.svg' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const content = usesClerkBypass() || !requiresClerkProvider(pathname) ? children : <ClerkProvider>{children}</ClerkProvider>

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Theme theme={neutralTheme} mode="light">
          <LinkProvider component={RouterLink}>
            <LayerProvider>
              <RouteProgressBar />
              <AeObservabilityBoot />
              <AeObservabilityErrorBoundary>{content}</AeObservabilityErrorBoundary>
              <AeToaster />
            </LayerProvider>
          </LinkProvider>
        </Theme>
        <Scripts />
      </body>
    </html>
  )
}

function requiresClerkProvider(pathname: string): boolean {
  return pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname.startsWith('/owner') || pathname.startsWith('/admin') || pathname.startsWith('/claim')
}

// Client-side mirror of the canonical server check in
// src/lib/server/local-e2e-bypass.ts (isLocalE2EAuthBypassEnabled). Kept
// separate because this file is client-rendered and must not import a
// server-only module.
function usesClerkBypass(): boolean {
  if (import.meta.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E !== 'true') {
    return false
  }

  if (import.meta.env.PROD) {
    throw new Error('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E cannot be enabled in production builds.')
  }

  return true
}

