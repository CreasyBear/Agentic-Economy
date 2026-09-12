/// <reference types="vite/client" />
import { ClerkProvider, useAuth } from '@clerk/tanstack-react-start'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexReactClient, useConvexAuth, useMutation } from 'convex/react'
import { ClientOnly, HeadContent, Link, Outlet, Scripts, createRootRoute, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'


import { AeAppShell } from '@/components/ae/layout/AeAppShell'
import { RouteProgressBar } from '@/components/ae/layout/AeRouteProgressBar'
import { AePageState } from '@/components/ae/layout/AePageState'
import { Button } from '@/components/ui/button'
import { SITE_THEME_COLOR_HEX } from '@/components/ui/theme-meta'

import { AeObservabilityErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { bootClientObservability } from '@/lib/observability/boot-client-observability'
import appCss from '../styles/globals.css?url'
import { clerkAppearance } from '@/components/ae/website/clerk-appearance'
import { HOME } from '@/content/brand-copy'
import { AECON_MARK_SRC } from '@/content/brand-assets'
import { api } from '../../convex/_generated/api'

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
      { name: 'color-scheme', content: 'light' },
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
      <AeAppShell>
        <Outlet />
      </AeAppShell>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const chatProvidersRequired = requiresChatProviders(pathname)
  const content = (
    <ClerkProvider appearance={clerkAppearance}>
      {chatProvidersRequired ? <ChatConvexProvider>{children}</ChatConvexProvider> : children}
    </ClerkProvider>
  )

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <RouteProgressBar />
        <AeObservabilityBoot />
        <AeObservabilityErrorBoundary>{content}</AeObservabilityErrorBoundary>
        <ClientOnly>
          <Toaster
            ref={(node) => {
              node?.setAttribute('aria-live', 'off')
            }}
            duration={6000}
            visibleToasts={5}
          />
        </ClientOnly>
        <Scripts />
      </body>
    </html>
  )
}

function ChatConvexProvider({ children }: { children: ReactNode }) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()
  if (!convexUrl) {
    return (
      <AePageState
        title="Chat is unavailable"
        description="Chat is not configured. The Tool catalogue remains available."
        tone="warning"
        action={(
          <Button asChild className="min-h-touch">
            <Link to="/market">
              Browse Tools
            </Link>
          </Button>
        )}
      />
    )
  }
  return <ConfiguredChatConvexProvider convexUrl={convexUrl}>{children}</ConfiguredChatConvexProvider>
}

function ConfiguredChatConvexProvider({ convexUrl, children }: { convexUrl: string; children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(convexUrl))
  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      <InteractiveAuthorityMaterializer>{children}</InteractiveAuthorityMaterializer>
    </ConvexProviderWithClerk>
  )
}

function InteractiveAuthorityMaterializer({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth()
  const materialize = useMutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority)
  useEffect(() => {
    if (isAuthenticated) void materialize({}).catch(() => undefined)
  }, [isAuthenticated, materialize])
  return children
}

export function requiresChatProviders(pathname: string): boolean {
  return pathname === '/t/new' || pathname.startsWith('/t/') || pathname.startsWith('/s/')
}
