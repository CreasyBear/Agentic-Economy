import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'

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

/** Upstream status passes back unchanged, so an invalid signature (400) makes Resend retry, which is harmless. Same-origin front for the Convex HTTP route: the raw body and the Svix headers pass through untouched, and the Svix signature is verified there. */
async function forwardResendWebhook(request: Request): Promise<Response> {
  const site = process.env.CONVEX_SITE_URL?.trim()
  const cloud = process.env.CONVEX_URL?.trim() ?? process.env.VITE_CONVEX_URL?.trim()
  const origin = site ?? cloud?.replace(/\.convex\.cloud$/u, '.convex.site')
  if (origin === undefined || !/^https:\/\/[a-z0-9-]+\.convex\.site$/u.test(origin)) {
    return problem({ kind: 'UNAVAILABLE', code: 'resend_webhook_unavailable', detail: 'The Convex site origin for Resend webhooks is not configured.' })
  }
  const declared = Number(request.headers.get('content-length'))
  const body = Number.isFinite(declared) && declared > MAX_BODY_CHARS ? null : await request.text()
  if (body === null || body.length > MAX_BODY_CHARS) {
    return problem({ kind: 'PAYLOAD_TOO_LARGE', code: 'resend_webhook_body_too_large', detail: `Resend webhook bodies are limited to ${MAX_BODY_CHARS} characters.` })
  }
  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const name of ['svix-id', 'svix-timestamp', 'svix-signature']) headers.set(name, request.headers.get(name) ?? '')
  const upstream = await fetch(`${origin}/resend/webhook`, { method: 'POST', headers, body, redirect: 'manual' })
  return new Response(null, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
}
