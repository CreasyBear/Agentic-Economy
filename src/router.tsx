import { AeNotFound } from '@/components/ae/layout/AeNotFound'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPendingMs: 150,
    defaultViewTransition: true,
    defaultNotFoundComponent: () => <AeNotFound />,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
