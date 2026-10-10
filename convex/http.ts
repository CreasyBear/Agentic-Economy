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
const deliveryRefFrom = (request: Request) => new URL(request.url).searchParams.get('d')?.slice(0, 200) ?? ''
const escapeAttr = (value: string) => value.replace(/[&"<>]/gu, char => `&#${char.charCodeAt(0)};`)

// RFC 8058: mail clients POST here for one-click unsubscribe. GET only renders a confirm button,
// so link scanners that prefetch the footer link cannot change the preference.
http.route({ path: UNSUBSCRIBE_PATH, method: 'GET', handler: httpAction(async (_ctx, request) => page(
  `<form method="post" action="${UNSUBSCRIBE_PATH}?d=${escapeAttr(encodeURIComponent(deliveryRefFrom(request)))}"><p>Stop stalled-step emails for this account?</p><button type="submit">Unsubscribe</button></form>`,
)) })
http.route({ path: UNSUBSCRIBE_PATH, method: 'POST', handler: httpAction(async (ctx, request) => {
  const deliveryRef = deliveryRefFrom(request)
  const done = deliveryRef.length > 0 && await ctx.runMutation(internal.notifications.unsubscribeStalled, { deliveryRef })
  return done
    ? page(`<p>You will not get stalled-step emails for this account. You can turn them back on in ${settingsLink('notification settings')}.</p>`)
    : page(`<p>This unsubscribe link is not valid. Manage emails in ${settingsLink('notification settings')}.</p>`, 404)
}) })

export default http
