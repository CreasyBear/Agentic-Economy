/// <reference types="vite/client" />
import { ClerkProvider, useAuth } from '@clerk/tanstack-react-start'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { ConvexReactClient } from 'convex/react'
import { ConvexHttpClient } from 'convex/browser'
import { ClientOnly, HeadContent, Link, Outlet, Scripts, createRootRoute, useRouter, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'

import { AeAppShell } from '@/components/ae/layout/AeAppShell'
import { useIsMobile } from '@/hooks/use-mobile'
import { ThemeProvider } from '@/components/ae/theme/ThemeProvider'
import { RouteProgressBar } from '@/components/ae/layout/AeRouteProgressBar'
import { AePageState } from '@/components/ae/layout/AePageState'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
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

/**
 * Signed-in pages get a live Convex client without chat's identity gate: server-rendered content
 * shows at once and each `useQuery` site's own loading state covers the auth handshake. Anonymous
 * visitors on public pages open no websocket.
 */
function SignedInConvexProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()
  const [client] = useState(() => (convexUrl ? new ConvexReactClient(convexUrl) : null))
  if (!auth.isSignedIn || client === null) return children
  return <ConvexProviderWithClerk client={client} useAuth={useAuth}>{children}</ConvexProviderWithClerk>
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
          <Link to="/market" className={cn(buttonVariants(), 'min-h-touch')}>
            Browse Tools
          </Link>
        )}
      />
    )
  }
  return <ConfiguredChatConvexProvider convexUrl={convexUrl}>{children}</ConfiguredChatConvexProvider>
}

function ConfiguredChatConvexProvider({ convexUrl, children }: { convexUrl: string; children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(convexUrl))
  const auth = useAuth()
  const identity = JSON.stringify([auth.userId, auth.sessionId, auth.orgId])
  const [attempt, setAttempt] = useState(0)
  const [initialization, setInitialization] = useState<{ identity: string; attempt: number; ready: boolean } | null>(null)
  const generation = useRef(0)
  const installedSession = useRef<{ client: ConvexHttpClient; generation: number } | null>(null)
  // Requires a verified Clerk token. Initialize that exact token before the
  // maintained Convex integration installs it for reactive reads, including
  // every refresh. While rotating authority, descendants cannot read the old
  // generation. Refusal remains retryable; obsolete completions grant nothing.
  const useInitializedAuth = useMemo(() => function useInitializedAuth() {
    const clerk = useAuth()
    const clerkGetToken = clerk.getToken
    const getToken = useCallback(async (options: Parameters<typeof clerkGetToken>[0]) => {
      const requestGeneration = ++generation.current
      setInitialization(null)
      try {
        const token = await clerkGetToken(options)
        if (token === null) {
          if (requestGeneration === generation.current) setInitialization({ identity, attempt, ready: false })
          return null
        }
        const bootstrap = new ConvexHttpClient(convexUrl)
        bootstrap.setAuth(token)
        const ready = await bootstrap.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
        if (requestGeneration !== generation.current) return null
        installedSession.current = ready ? { client: bootstrap, generation: requestGeneration } : null
        setInitialization({ identity, attempt, ready })
        return ready ? token : null
      } catch {
        if (requestGeneration === generation.current) setInitialization({ identity, attempt, ready: false })
        return null
      }
    }, [clerkGetToken, convexUrl, identity, attempt])
    return { ...clerk, getToken }
  }, [convexUrl, identity, attempt])
  useEffect(() => {
    if (!auth.isSignedIn) return
    // Convex does not always expose JWT exp in UserIdentity. Maintain its short
    // server-anchored window with the already-installed token; the backend
    // verifies that token again and refuses revoked authority. Successful
    // renewals leave the mounted composer and its draft intact.
    const interval = window.setInterval(() => {
      const session = installedSession.current
      if (session === null || session.generation !== generation.current) return
      void session.client.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}).then(
        (ready) => {
          if (!ready && session.generation === generation.current) setInitialization({ identity, attempt, ready: false })
        },
        () => {
          if (session.generation === generation.current) setInitialization({ identity, attempt, ready: false })
        },
      )
    }, 20_000)
    return () => window.clearInterval(interval)
  }, [auth.isSignedIn, identity, attempt])
  const current = initialization?.identity === identity && initialization.attempt === attempt
    ? initialization
    : null
  return (
    <ConvexProviderWithClerk client={client} useAuth={useInitializedAuth}>
      {auth.isLoaded && !auth.isSignedIn ? children : current?.ready ? children : current === null ? (
        <AePageState title="Opening chat" description="Connecting to your account…" />
      ) : (
        <AePageState
          title="Couldn’t open chat"
          description="Your account connection could not be completed. Try again."
          tone="warning"
          action={(
            <button type="button" className={buttonVariants()} onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </button>
          )}
        />
      )}
    </ConvexProviderWithClerk>
  )
}

export function requiresChatProviders(pathname: string): boolean {
  return pathname === '/t/new' || pathname.startsWith('/t/') || pathname.startsWith('/s/')
}
