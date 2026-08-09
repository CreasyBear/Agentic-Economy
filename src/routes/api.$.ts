import { createFileRoute } from '@tanstack/react-router'

import { problem } from '@/lib/server/problem'

// Catch-all for /api/** with no matching concrete route. TanStack Start route
// handlers fall through unregistered paths/methods to the SPA shell as a 200
// HTML render; an unknown API path must come back as an RFC 9457 404 instead.
// Splat route name `api.$` (→ `/api/$`) is the file-based catch-all, confirmed
// against the installed router: `sign-up.$.tsx`/`sign-in.$.tsx` produce the
// `/sign-up/$` and `/sign-in/$` splat segments in routeTree.gen.ts.
const notFound = () =>
  problem({
    status: 404,
    kind: 'NOT_FOUND',
    code: 'api_not_found',
    detail: 'No API resource exists at this path.',
  })

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: () => notFound(),
      POST: () => notFound(),
      PUT: () => notFound(),
      PATCH: () => notFound(),
      DELETE: () => notFound(),
      HEAD: () => notFound(),
      OPTIONS: () => notFound(),
      TRACE: () => notFound(),
      CONNECT: () => notFound(),
    },
  },
})
