import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_operator/owner/settings/developers')({
  beforeLoad: () => {
    throw redirect({ to: '/for-agents', replace: true })
  },
})
