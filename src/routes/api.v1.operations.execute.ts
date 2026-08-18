import { createFileRoute } from '@tanstack/react-router'

import { problem } from '@/lib/server/problem'
import { withRfc9745DeprecationNotice } from '@/modules/product-frontier/deprecation-notice'
import { quarantineSurfaceRetiredProblemInput } from '@/modules/product-frontier/quarantine-write-admission'

function executeGone(): Response {
  return withRfc9745DeprecationNotice(
    problem(quarantineSurfaceRetiredProblemInput('/api/v1/operations/execute')),
  )
}

export const Route = createFileRoute('/api/v1/operations/execute')({
  server: {
    handlers: {
      POST: () => executeGone(),
      GET: () => executeGone(),
      PUT: () => executeGone(),
      PATCH: () => executeGone(),
      DELETE: () => executeGone(),
      HEAD: () => executeGone(),
      OPTIONS: () => executeGone(),
      TRACE: () => executeGone(),
      CONNECT: () => executeGone(),
    },
  },
})
