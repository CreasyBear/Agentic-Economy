import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_operator/owner/settings/workspace')({
  beforeLoad: () => {
    throw redirect({ to: '/owner/offerings', hash: 'supplier-identity', replace: true })
  },
})
