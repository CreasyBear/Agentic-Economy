import { createFileRoute } from '@tanstack/react-router'

import { problem } from '@/lib/server/problem'

const notFound = () => problem({
  status: 404,
  kind: 'NOT_FOUND',
  code: 'well_known_not_found',
  detail: 'No well-known resource exists at this path.',
})

export const Route = createFileRoute('/.well-known/$')({
  server: {
    handlers: {
      GET: notFound,
      POST: notFound,
      PUT: notFound,
      PATCH: notFound,
      DELETE: notFound,
      HEAD: notFound,
      OPTIONS: notFound,
      TRACE: notFound,
      CONNECT: notFound,
    },
  },
})
