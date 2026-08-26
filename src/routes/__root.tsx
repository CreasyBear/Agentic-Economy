/// <reference types="vite/client" />
import { ClerkProvider, useAuth } from '@clerk/tanstack-react-start'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexReactClient, useConvexAuth, useMutation } from 'convex/react'
import { HeadContent, Outlet, Scripts, createRootRoute, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'


import { RouteProgressBar } from '@/components/ae/layout/AeRouteProgressBar'

import { AeObservabilityErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { bootClientObservability } from '@/lib/observability/boot-client-observability'
import appCss from '../styles/globals.css?url'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { HOME } from '@/content/brand-copy'
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

/**
 * One global appearance for every Clerk component. Clerk merges component-level
 * `appearance` over this, so sign-in and sign-up cannot drift apart, and the
 * 44px interaction floor AE enforces everywhere applies to Clerk's own controls.
 * Docs: https://clerk.com/docs/tanstack-react-start/guides/customizing-clerk/appearance-prop/overview
 */
const clerkAppearance = {
  variables: {
    fontSize: '0.875rem',
    spacing: '0.875rem',
    borderRadius: '0.625rem',
    colorPrimary: 'oklch(0.215 0.004 106)',
    colorBackground: 'oklch(1 0 0)',
    colorText: 'oklch(0.215 0.004 106)',
  },
  elements: {
    formFieldRow__password: 'aria-hidden:!hidden',
    identityPreviewEditButton: '!min-h-11 !min-w-11',
    socialButtonsBlockButton: 'min-h-11',
    formButtonPrimary: 'min-h-11',
    formFieldInput: 'min-h-11',
    formFieldInputShowPasswordButton: 'min-h-11 min-w-11',
  },
  options: {
    unsafe_disableDevelopmentModeWarnings: true,
  },
}

function RootDocument({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const content = requiresChatProviders(pathname)
    ? (
        <ClerkProvider appearance={clerkAppearance}>
          <ChatConvexProvider>{children}</ChatConvexProvider>
        </ClerkProvider>
      )
    : isLocalE2EAuthBypassEnabled() || !requiresClerkProvider(pathname)
      ? children
      : <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <RouteProgressBar />
        <AeObservabilityBoot />
        <AeObservabilityErrorBoundary>{content}</AeObservabilityErrorBoundary>
        <Toaster
          ref={(node) => {
            node?.setAttribute('aria-live', 'off')
          }}
          duration={6000}
          visibleToasts={5}
        />
        <Scripts />
      </body>
    </html>
  )
}

function ChatConvexProvider({ children }: { children: ReactNode }) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()
  if (!convexUrl) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <section className="max-w-md text-center" role="status" aria-live="polite">
          <h1 className="text-lg font-semibold">Chat is unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The chat service is not configured. The Operation marketplace is still available.
          </p>
        </section>
      </main>
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

function requiresClerkProvider(pathname: string): boolean {
  return pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname.startsWith('/owner') || pathname.startsWith('/admin')
}
