import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'

export const Route = createFileRoute('/api/unsubscribe')({
  server: {
    handlers: {
      // A link scanner's GET only reaches the confirm page; the preference changes on POST (RFC 8058 one-click).
      GET: ({ request }) => forwardUnsubscribe(request, 'GET'),
      POST: ({ request }) => forwardUnsubscribe(request, 'POST'),
      HEAD: () => methodNotAllowed(['GET', 'POST']),
      PUT: () => methodNotAllowed(['GET', 'POST']),
      PATCH: () => methodNotAllowed(['GET', 'POST']),
      DELETE: () => methodNotAllowed(['GET', 'POST']),
      OPTIONS: () => methodNotAllowed(['GET', 'POST']),
    },
  },
})

/** The signed token is verified, and the opt-out and lifecycle_unsubscribed event written, by the Convex HTTP action. */
function convexSiteOrigin(): string | null {
  const site = process.env.CONVEX_SITE_URL?.trim()
  const cloud = process.env.CONVEX_URL?.trim() ?? process.env.VITE_CONVEX_URL?.trim()
  const origin = site ?? cloud?.replace(/\.convex\.cloud$/u, '.convex.site')
  return origin !== undefined && /^https:\/\/[a-z0-9-]+\.convex\.site$/u.test(origin) ? origin : null
}

async function forwardUnsubscribe(request: Request, method: 'GET' | 'POST'): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t')?.slice(0, 1000) ?? ''
  if (token === '') return problem({ kind: 'NOT_FOUND', code: 'unsubscribe_link_invalid', detail: 'This unsubscribe link is not valid.' })
  const origin = convexSiteOrigin()
  if (origin === null) return problem({ kind: 'UNAVAILABLE', code: 'unsubscribe_unavailable', detail: 'The Convex site origin for unsubscribe links is not configured.' })
  const target = `${origin}/notifications/unsubscribe?t=${encodeURIComponent(token)}`
  if (method === 'GET') return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } })
  const upstream = await fetch(target, { method: 'POST', redirect: 'manual' })
  return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
