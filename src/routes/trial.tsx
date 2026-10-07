import { createFileRoute } from '@tanstack/react-router'
import { AeTrialPage } from '@/components/ae/trial/AeTrialPage'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'

export const Route = createFileRoute('/trial')({
  head: () => ({ meta: [{ title: 'Activate your trial | Agentic Economy' }, { name: 'robots', content: 'noindex, noarchive' }] }),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: AeTrialPage,
})
