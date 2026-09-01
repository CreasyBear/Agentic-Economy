import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_operator/owner/settings/connections')({
  beforeLoad: () => {
    throw redirect({ to: '/owner/offerings', hash: 'supplier-connections', replace: true })
  },
})
