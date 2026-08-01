import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Legacy address only. AE has no help surface, so nothing in the product links
 * here — a dead sidebar entry pointing at this redirect is what made it look
 * like one existed. Kept so external bookmarks land somewhere useful.
 */
export const Route = createFileRoute('/help')({
  beforeLoad: () => {
    throw redirect({ to: '/', statusCode: 301 })
  },
})
