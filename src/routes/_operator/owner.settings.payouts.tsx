import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_operator/owner/settings/payouts')({
  beforeLoad: () => {
    throw redirect({ to: '/owner/offerings', hash: 'earnings', replace: true })
  },
})
