import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/owner/agent-keys')({
  beforeLoad: () => {
    throw redirect({ to: '/owner/settings/agent-keys', replace: true })
  },
})
