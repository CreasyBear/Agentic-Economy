import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/agent-keys')({
  beforeLoad: () => {
    throw redirect({ to: '/owner/settings/agent-keys', replace: true })
  },
})
