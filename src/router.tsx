import { RouteError, RouteNotFound, RoutePending } from '@/components/ae/layout/AeRouteStates'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'


export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPendingMs: 150,
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    defaultViewTransition: true,
    defaultNotFoundComponent: RouteNotFound,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
