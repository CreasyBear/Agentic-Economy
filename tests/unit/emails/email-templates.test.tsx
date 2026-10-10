import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { emailUrl } from '@/emails/links'
import { formatMoney } from '@/emails/money'
import { renderEmail, type EmailInput } from '@/emails/render'

const SITE = 'https://app.aecon.ai'
const UNSUBSCRIBE = 'https://convex.example.test/notifications/unsubscribe?t=signed-token'
const TEMPLATE_DIR = join(process.cwd(), 'src/emails/templates')

const INPUTS: Array<[string, EmailInput]> = [
  ['agent approval', { eventKind: 'agent_approval_requested', props: { siteUrl: SITE, agentName: 'Research agent', expiresMinutes: 15 } }],
  ['stalled, not funded', { eventKind: 'stalled_not_funded', props: { siteUrl: SITE, unsubscribeUrl: UNSUBSCRIBE } }],
  ['stalled, no agent', { eventKind: 'stalled_no_agent', props: { siteUrl: SITE, unsubscribeUrl: UNSUBSCRIBE } }],
  ['stalled, never called', { eventKind: 'stalled_never_called', props: { siteUrl: SITE, unsubscribeUrl: UNSUBSCRIBE } }],
  ['low credit', { eventKind: 'low_credit_balance', props: { siteUrl: SITE, body: 'Available Credit is at or below your saved threshold.', observedAt: '2026-10-10T00:00:00.000Z', unsubscribeUrl: UNSUBSCRIBE } }],
  ['spend cap warning', { eventKind: 'spend_cap_warning', props: { siteUrl: SITE, body: 'Spend has reached 80% of your cap.', observedAt: '2026-10-10T00:00:00.000Z', unsubscribeUrl: UNSUBSCRIBE } }],
  ['spend cap exceeded', { eventKind: 'spend_cap_exceeded', props: { siteUrl: SITE, body: 'Spend has passed your cap.', observedAt: '2026-10-10T00:00:00.000Z', unsubscribeUrl: UNSUBSCRIBE } }],
  ['call failure spike', { eventKind: 'call_failure_spike', props: { siteUrl: SITE, body: 'Tool calls are failing more often than usual.', observedAt: '2026-10-10T00:00:00.000Z', unsubscribeUrl: UNSUBSCRIBE } }],
  ['statement', { eventKind: 'invoice_ready', props: { siteUrl: SITE, periodLabel: 'October 2026' } }],
  ['operator digest', { eventKind: 'operator_digest', props: { siteUrl: SITE, date: '2026-10-11', lines: ['2 stalled accounts', 'No exceptions'] } }],
  ['funding receipt', { eventKind: 'funding_receipt', props: { siteUrl: SITE, amount: 'A$20.00' } }],
  ['funding failed', { eventKind: 'funding_failed', props: { siteUrl: SITE } }],
  ['task refunded', { eventKind: 'task_refunded', props: { siteUrl: SITE, amount: 'A$0.42', taskRef: 'call:abc123' } }],
  ['task stuck', { eventKind: 'task_stuck', props: { siteUrl: SITE } }],
  ['credit exhausted', { eventKind: 'credit_exhausted', props: { siteUrl: SITE } }],
  ['key issued', { eventKind: 'key_issued', props: { siteUrl: SITE } }],
  ['key revoked', { eventKind: 'key_revoked', props: { siteUrl: SITE } }],
  ['account paused', { eventKind: 'account_paused', props: { siteUrl: SITE } }],
  ['account restored', { eventKind: 'account_restored', props: { siteUrl: SITE } }],
  ['role changed', { eventKind: 'role_changed', props: { siteUrl: SITE, role: 'Admin' } }],
  ['team membership', { eventKind: 'team_membership_changed', props: { siteUrl: SITE } }],
  ['email changed', { eventKind: 'email_changed', props: { siteUrl: SITE } }],
  ['data request', { eventKind: 'data_request_received', props: { siteUrl: SITE } }],
  ['welcome', { eventKind: 'welcome', props: { siteUrl: SITE } }],
  ['provider live', { eventKind: 'provider_live', props: { siteUrl: SITE, toolRef: 'tool:abc123' } }],
  ['provider offboarded', { eventKind: 'provider_offboarded', props: { siteUrl: SITE } }],
]

const byName = (name: string): EmailInput => {
  const found = INPUTS.find(([label]) => label === name)
  if (found === undefined) throw new Error(`missing fixture ${name}`)
  return found[1]
}

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]+)"/gu)].map((match) => (match[1] ?? '').replaceAll('&amp;', '&'))
const visibleText = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gu, '').replace(/<[^>]+>/gu, ' ')

describe('renderEmail', () => {
  it.each(INPUTS)('renders %s as HTML and plain text with a subject', async (_name, input) => {
    const email = await renderEmail(input)
    expect(email.subject.trim().length).toBeGreaterThan(0)
    expect(email.html.startsWith('<!DOCTYPE html')).toBe(true)
    expect(email.text).not.toMatch(/<[a-z]/iu)
    expect(email.text).not.toContain('—')
    expect(email.subject).not.toContain('—')
    expect(visibleText(email.html)).not.toMatch(/\b(Order|Wallet|Balance)\b/u)
  })

  it.each(INPUTS)('%s: every aecon link carries the email UTM fields and appears in the text part', async (_name, input) => {
    const email = await renderEmail(input)
    const links = hrefsOf(email.html)
    const appLinks = links.filter((href) => href.startsWith(SITE))
    for (const href of appLinks) {
      expect(href).toContain('utm_source=aecon')
      expect(href).toContain('utm_medium=email')
      expect(href).toContain('utm_campaign=')
      expect(email.text).toContain(href)
    }
    for (const href of links) expect(email.text).toContain(href)
  })

  it('uses the brand tokens, Manrope with Arial and Helvetica fallback, and one Forest button', async () => {
    const email = await renderEmail(byName('agent approval'))
    expect(email.html).toContain('#E8E4DA')
    expect(email.html).toContain('#141414')
    expect(email.html).toContain('#24543D')
    expect(email.html).toContain('Manrope, Arial, Helvetica')
    expect(email.html.match(/background-color:#24543D/giu)?.length ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('ships a dark palette that swaps Chalk and Charcoal under prefers-color-scheme', async () => {
    const email = await renderEmail(byName('agent approval'))
    expect(email.html).toMatch(/color-scheme/u)
    expect(email.html).toMatch(/@media \(prefers-color-scheme: dark\)/u)
  })

  it('keeps the approval email transactional: no unsubscribe, one review action', async () => {
    const email = await renderEmail(byName('agent approval'))
    expect(email.text).not.toMatch(/unsubscribe/iu)
    expect(email.text).toContain('Review request')
    expect(email.subject).toBe('Research agent needs your approval')
  })

  it('gives each lifecycle and alert send a working unsubscribe link', async () => {
    for (const [, input] of INPUTS.slice(1, 8)) {
      const email = await renderEmail(input)
      expect(hrefsOf(email.html)).toContain(UNSUBSCRIBE)
      expect(email.text).toContain(UNSUBSCRIBE)
    }
  })

  it('tags each stalled step with its own campaign', async () => {
    const campaigns = await Promise.all(INPUTS.slice(1, 4).map(async ([, input]) => (await renderEmail(input)).html))
    expect(campaigns[0]).toContain('utm_campaign=stalled_add_credit')
    expect(campaigns[1]).toContain('utm_campaign=stalled_connect_agent')
    expect(campaigns[2]).toContain('utm_campaign=stalled_first_call')
  })

  it('links the statement to the statement page with plain sentence-case copy', async () => {
    const email = await renderEmail(byName('statement'))
    expect(email.subject).toBe('Your October 2026 statement is ready')
    expect(email.text).toContain('Download statement')
    expect(email.text).not.toMatch(/tax invoice/iu)
  })
})

describe('phase 2 notices', () => {
  it('states a funding receipt amount as added to Credit, with fees and tax kept out of it', async () => {
    const email = await renderEmail(byName('funding receipt'))
    expect(email.subject).toBe('Receipt: A$20.00 added as Credit')
    expect(email.text).toContain('Stripe fees and tax are not part of this amount')
    expect(email.text).not.toMatch(/unsubscribe/iu)
  })

  it('names the refunded amount, that it went back to Credit and not the card, and the Task id', async () => {
    const email = await renderEmail(byName('task refunded'))
    expect(email.subject).toBe('Refunded: a Task did not complete')
    expect(email.text).toContain('A$0.42 went back to your Credit, not your card')
    expect(email.text).toContain('call:abc123')
  })

  it('keeps every phase 2 notice free of unsubscribe copy, since all of it is required mail', async () => {
    for (const [, input] of INPUTS.slice(10)) {
      const email = await renderEmail(input)
      expect(email.text).not.toMatch(/unsubscribe/iu)
    }
  })
})

describe('phase 3 notices', () => {
  it('welcomes a new owner to set up the account, with no feature pitch and no unsubscribe', async () => {
    const email = await renderEmail(byName('welcome'))
    expect(email.subject).toBe('Welcome to aecon')
    expect(email.text).toContain('Set up your account')
    expect(email.text).not.toMatch(/unsubscribe/iu)
  })

  it('tells a Provider the Tool is live with a link to its operations page', async () => {
    const email = await renderEmail(byName('provider live'))
    expect(email.subject).toBe('Your Tool is live')
    expect(hrefsOf(email.html).some((href) => href.includes('/owner/operations/tool%3Aabc123'))).toBe(true)
    expect(email.text).not.toMatch(/unsubscribe/iu)
  })

  it('confirms a Provider account is closed as required mail', async () => {
    const email = await renderEmail(byName('provider offboarded'))
    expect(email.subject).toBe('Your Provider account is closed')
    expect(email.text).not.toMatch(/unsubscribe/iu)
  })
})

describe('emailUrl', () => {
  it('tags an app path with source aecon, medium email, and the given campaign and content', () => {
    const url = new URL(emailUrl(SITE, '/owner/credit', { campaign: 'low_credit', content: 'cta' }))
    expect(url.origin + url.pathname).toBe('https://app.aecon.ai/owner/credit')
    expect(url.searchParams.get('utm_source')).toBe('aecon')
    expect(url.searchParams.get('utm_medium')).toBe('email')
    expect(url.searchParams.get('utm_campaign')).toBe('low_credit')
    expect(url.searchParams.get('utm_content')).toBe('cta')
  })
})

describe('formatMoney', () => {
  it('prints exact amounts through formatCurrencyAmount', () => {
    expect(formatMoney({ currency: 'AUD', units: '420', exponent: 2 })).toBe('A$4.20')
    expect(formatMoney({ currency: 'AUD', units: '3', exponent: 3 })).toBe('A$0.003')
  })
})

describe('template sources', () => {
  it('contain no raw URLs and no em dashes', () => {
    const files = readdirSync(TEMPLATE_DIR).filter((name) => /\.(tsx|ts)$/u.test(name))
    expect(files.length).toBeGreaterThanOrEqual(5)
    for (const file of files) {
      const source = readFileSync(join(TEMPLATE_DIR, file), 'utf8')
      expect(source, file).not.toMatch(/https?:\/\//u)
      expect(source, file).not.toContain('—')
    }
  })
})
