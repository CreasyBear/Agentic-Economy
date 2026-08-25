import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/operations')({
  beforeLoad: ({ location }) => {
    if (location.pathname !== '/operations') return
    throw redirect({ to: '/market', search: { window: '30d' }, hash: 'operations' })
  },
})
