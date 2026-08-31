import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/contact')({
  beforeLoad: ({ location }) => {
    throw redirect({ to: '/support', search: location.search, hash: location.hash })
  },
})
