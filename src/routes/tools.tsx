import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/tools')({
  beforeLoad: ({ location }) => {
    if (location.pathname !== '/tools') return
    throw redirect({ to: '/market', search: { window: '30d' }, hash: 'tools' })
  },
})
