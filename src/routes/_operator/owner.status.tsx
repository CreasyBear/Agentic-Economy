import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_operator/owner/status')({
  beforeLoad: () => {
    throw redirect({ to: '/owner/offerings', replace: true })
  },
})
