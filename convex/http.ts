import { httpRouter } from 'convex/server'

import { internal } from './_generated/api'
import { httpAction } from './_generated/server'

import { anonymousChat } from './chatAnonymous'
import {
  abortProviderConsequenceJournal,
  attestProviderConsequenceTicket,
  beginProviderConsequenceJournal,
  completeProviderConsequenceJournal,
  providerConsequenceX402Rpc,
} from './providerConsequenceHttp'
import { secretLifecycleRpc } from './secretLifecycleHttp'
import { verifyUnsubscribeToken } from './lib/principalAccount/notifications/unsubscribe'

const http = httpRouter()

http.route({ path: '/chat/anonymous', method: 'POST', handler: anonymousChat })
http.route({ path: '/internal/provider-consequence/journal/begin', method: 'POST', handler: beginProviderConsequenceJournal })
http.route({ path: '/internal/provider-consequence/journal/attest', method: 'POST', handler: attestProviderConsequenceTicket })
http.route({ path: '/internal/provider-consequence/journal/complete', method: 'POST', handler: completeProviderConsequenceJournal })
http.route({ path: '/internal/provider-consequence/journal/abort', method: 'POST', handler: abortProviderConsequenceJournal })
http.route({ path: '/internal/provider-consequence/x402', method: 'POST', handler: providerConsequenceX402Rpc })
http.route({ path: '/internal/secret-lifecycle', method: 'POST', handler: secretLifecycleRpc })

const UNSUBSCRIBE_PATH = '/notifications/unsubscribe'
// System colors and type follow the reader's light or dark setting without raw color values.
const PAGE_STYLE = ':root{color-scheme:light dark;font:16px/1.5 system-ui,sans-serif}body{max-width:32rem;margin:0 auto;padding:3rem 1rem}h1{font-size:1.25rem;font-weight:500}'
const page = (body: string, status = 200) => new Response(
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Email preferences</title><style>${PAGE_STYLE}</style><h1>Email preferences</h1>${body}</html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
)
const settingsLink = (label: string) => {
  const site = process.env.AE_SITE_URL?.trim().replace(/\/+$/u, '')
  return site ? `<a href="${escapeAttr(`${site}/owner/settings/notifications`)}">${label}</a>` : label
}
const escapeAttr = (value: string) => value.replace(/[&"<>]/gu, char => `&#${char.charCodeAt(0)};`)
const STREAM_LABEL = { alert: 'account alert emails', lifecycle: 'stalled-step emails' } as const
const invalidPage = () => page(`<p>This unsubscribe link is not valid. Manage emails in ${settingsLink('notification settings')}.</p>`, 404)

// Resend posts here with a Svix signature. The raw body goes to a node action that verifies it before any state changes.
http.route({ path: '/resend/webhook', method: 'POST', handler: httpAction(async (ctx, request) => {
  const result = await ctx.runAction(internal.emailWebhook.receiveResendWebhook, {
    rawBody: await request.text(),
    svixId: request.headers.get('svix-id') ?? '',
    svixTimestamp: request.headers.get('svix-timestamp') ?? '',
    svixSignature: request.headers.get('svix-signature') ?? '',
  })
  return new Response(null, { status: result === 'invalid' ? 400 : 200 })
}) })

// The token in `t` is HMAC-signed and names one principal, account and stream. GET only renders a confirm form,
// so link scanners that prefetch the footer link cannot change the preference. POST (RFC 8058 one-click) flips it.
const tokenFrom = (request: Request) => new URL(request.url).searchParams.get('t')?.slice(0, 1000) ?? ''
const verifiedUnsubscribe = async (request: Request) => {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()
  return secret ? await verifyUnsubscribeToken(secret, tokenFrom(request)) : null
}
http.route({ path: UNSUBSCRIBE_PATH, method: 'GET', handler: httpAction(async (_ctx, request) => {
  const target = await verifiedUnsubscribe(request)
  if (target === null) return invalidPage()
  return page(
    `<form method="post" action="${UNSUBSCRIBE_PATH}?t=${escapeAttr(encodeURIComponent(tokenFrom(request)))}"><p>Stop ${STREAM_LABEL[target.stream]} for this account?</p><button type="submit">Unsubscribe</button></form>`,
  )
}) })
http.route({ path: UNSUBSCRIBE_PATH, method: 'POST', handler: httpAction(async (ctx, request) => {
  const target = await verifiedUnsubscribe(request)
  const done = target !== null && await ctx.runMutation(internal.notifications.unsubscribeEmailStream, target)
  return done
    ? page(`<p>You will not get ${STREAM_LABEL[target.stream]} for this account. You can turn them back on in ${settingsLink('notification settings')}.</p>`)
    : invalidPage()
}) })

export default http
