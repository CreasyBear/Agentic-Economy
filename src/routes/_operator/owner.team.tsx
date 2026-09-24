import { createFileRoute, redirect } from '@tanstack/react-router'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/team')({
  ...operatorRouteOptions,
  beforeLoad: () => { throw redirect({ to: '/owner/settings/team' }) },
})
