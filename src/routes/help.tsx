import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/help')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/support', search: location.search, hash: location.hash })
  },
})
