import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/engine')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})
