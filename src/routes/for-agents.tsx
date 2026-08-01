import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/for-agents')({
  beforeLoad: () => {
    throw redirect({ to: '/', statusCode: 301 })
  },
})
