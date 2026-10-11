import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'

export const Route = createFileRoute('/api/resend/webhook')({
  server: {
    handlers: {
      POST: ({ request }) => forwardResendWebhook(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
    },
  },
})

const MAX_BODY_CHARS = 256 * 1024

/** Same-origin front for the Convex HTTP route: the raw body and the Svix headers pass through untouched, and the Svix signature is verified there. */
async function forwardResendWebhook(request: Request): Promise<Response> {
  const site = process.env.CONVEX_SITE_URL?.trim()
  const cloud = process.env.CONVEX_URL?.trim() ?? process.env.VITE_CONVEX_URL?.trim()
  const origin = site ?? cloud?.replace(/\.convex\.cloud$/u, '.convex.site')
  if (origin === undefined || !/^https:\/\/[a-z0-9-]+\.convex\.site$/u.test(origin)) return new Response(null, { status: 503 })
  const body = await request.text()
  if (body.length > MAX_BODY_CHARS) return new Response(null, { status: 413 })
  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const name of ['svix-id', 'svix-timestamp', 'svix-signature']) headers.set(name, request.headers.get(name) ?? '')
  const upstream = await fetch(`${origin}/resend/webhook`, { method: 'POST', headers, body, redirect: 'manual' })
  return new Response(null, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
}
