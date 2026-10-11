import { Column, Row, Section, Text } from '@react-email/components'

import { EMAIL_COLORS } from '../brand'
import { bodyText, CtaButton, Layout } from '../layout'
import { emailUrl } from '../links'

/** Phase 2 and 3 notices. All are required transactional mail: no unsubscribe, the footer links to settings. */
export type NoticeKind =
  | 'funding_receipt' | 'funding_failed' | 'task_refunded' | 'task_stuck' | 'credit_exhausted'
  | 'key_issued' | 'key_revoked' | 'account_paused' | 'account_restored'
  | 'role_changed' | 'team_membership_changed' | 'email_changed' | 'data_request_received'
  | 'welcome' | 'provider_live' | 'provider_offboarded'
  | 'deletion_requested' | 'deletion_completed' | 'first_call_done' | 'week_one_wrap' | 'auto_topup_failed'
  | 'card_changed' | 'first_call_failed' | 'deletion_cancelled' | 'deletion_final_reminder'

/** Money arrives already formatted by the loader (moneyNoticeAmount), so no amount is retyped here. */
export type NoticeProps = { siteUrl: string; amount?: string; taskRef?: string; role?: string; when?: string; toolRef?: string; calls?: string; spent?: string; balance?: string }

type Notice = {
  subject: (props: NoticeProps) => string
  /** Adds what the subject could not fit. Never repeats it. */
  preheader: (props: NoticeProps) => string
  body: (props: NoticeProps) => string
  /** Empty label means no button: the one text-only email (deletion completed). */
  label: string
  path: string | ((props: NoticeProps) => string)
  campaign: string
  /** Order summary slot (design doc rows 29 and 30): label and value pairs under the lead. Values are pre-formatted money or counts. */
  rows?: (props: NoticeProps) => Array<[string, string]>
}

const money = (amount: string | undefined) => amount ?? '--'
/** Lifecycle and billing kinds that state amounts refuse to render without them, so a missing ledger value never prints '--'. */
const need = (value: string | undefined) => {
  if (value === undefined) throw new Error('email_prop_missing')
  return value
}

/** Rows 22, 23, 35 and 36 wait on the deletion grace decision (design doc Q2). Rendering throws until Q2 is answered, so no deletion mail can send. */
const pendingQ2 = (campaign: string): Notice => {
  const wait = (): never => { throw new Error('deletion_copy_pending_q2') }
  return { subject: wait, preheader: wait, body: wait, label: 'Pending', path: '/owner/settings/privacy', campaign }
}

const NOTICES: Record<NoticeKind, Notice> = {
  funding_receipt: {
    subject: ({ amount }) => `Receipt for your ${money(amount)} aecon top-up`,
    preheader: ({ amount }) => `${money(amount)} credit added.`,
    body: ({ amount }) => `${money(amount)} was added to your aecon credit. Fees and tax are not part of this amount.`,
    label: 'View receipt', path: '/owner/credit', campaign: 'funding_receipt',
  },
  funding_failed: {
    subject: ({ amount }) => (amount === undefined ? "Your top-up didn't go through" : `Your ${amount} top-up didn't go through`),
    preheader: () => 'Try again or use another card.',
    body: () => "Your payment didn't go through, so no credit was added. You can try again or use another card.",
    label: 'Try again', path: '/owner/credit', campaign: 'funding_failed',
  },
  task_refunded: {
    subject: ({ amount }) => `Refunded ${money(amount)} for a failed call`,
    preheader: ({ taskRef }) => `Call ${taskRef ?? '--'}.`,
    body: ({ amount, taskRef }) => `Call ${taskRef ?? '--'} did not complete, so ${money(amount)} went back to your aecon credit, not your card.`,
    label: 'View receipt', path: '/owner/operations', campaign: 'task_refunded',
  },
  task_stuck: {
    subject: ({ amount }) => (amount === undefined ? "We're still confirming your payment" : `We're still confirming your ${amount} payment`),
    preheader: () => 'No credit has been added yet.',
    body: () => "Check the receipt before paying again. Your payment hasn't been confirmed yet, so no credit was added. We'll email you once it is confirmed or fails.",
    label: 'View receipt', path: '/owner/credit', campaign: 'payment_stuck',
  },
  credit_exhausted: {
    subject: () => 'Your aecon credit has run out',
    preheader: () => 'Calls are paused until you add credit.',
    body: () => 'Your credit has run out, so new calls will fail until you add credit.',
    label: 'Add credit', path: '/owner/credit', campaign: 'credit_exhausted',
  },
  key_issued: {
    subject: () => 'A new aecon key was created',
    preheader: () => "If this wasn't you, revoke the key now.",
    body: () => "A new agent key was created on your account. We send one notice every 10 minutes, so more keys may have been created since. If this wasn't you, revoke them now or contact support@aecon.ai.",
    label: 'Review keys', path: '/owner/settings/agent', campaign: 'key_issued',
  },
  key_revoked: {
    subject: () => 'An aecon key was revoked',
    preheader: () => 'Agents using it can no longer make calls.',
    body: () => 'An agent key on your account was revoked. We send one notice every 10 minutes, so more keys may have been revoked since. Agents using a revoked key can no longer make calls.',
    label: 'Review keys', path: '/owner/settings/agent', campaign: 'key_revoked',
  },
  account_paused: {
    subject: () => 'Your aecon account is paused',
    preheader: () => 'Calls are on hold for a security review.',
    body: () => 'Your aecon account was paused for a security review, so calls cannot run. Contact support@aecon.ai to find out what to do next.',
    label: 'View account', path: '/owner', campaign: 'account_paused',
  },
  account_restored: {
    subject: () => 'Your aecon account is back on',
    preheader: () => 'Calls work again.',
    body: () => 'Your aecon account is active again. Calls run as before.',
    label: 'View account', path: '/owner', campaign: 'account_restored',
  },
  role_changed: {
    subject: ({ role }) => `Your role is now ${role ?? '--'}`,
    preheader: () => 'See what that lets you do.',
    body: ({ role }) => `Your role on this aecon account is now ${role ?? '--'}. Open the workspace to see what that lets you do.`,
    label: 'Open workspace', path: '/owner/workspace', campaign: 'role_changed',
  },
  team_membership_changed: {
    subject: () => 'Your aecon team changed',
    preheader: () => 'Review who has access.',
    body: () => 'The team on your aecon account changed. Review who has access.',
    label: 'Review team', path: '/owner/settings/team', campaign: 'team_membership',
  },
  email_changed: {
    subject: () => 'Your aecon email changed',
    preheader: () => "If this wasn't you, contact support@aecon.ai.",
    body: () => "The primary email address on your aecon account was changed. If this wasn't you, contact support@aecon.ai.",
    label: 'Contact support', path: '/owner/settings/account/security', campaign: 'email_changed',
  },
  welcome: {
    subject: () => 'Welcome to aecon. Add credit to start',
    preheader: () => 'You only pay per call.',
    body: () => 'Your account is ready. Add credit to make your first call. You only pay per call.',
    label: 'Add credit', path: '/owner/credit', campaign: 'welcome',
  },
  provider_live: {
    subject: () => 'Your service is live on aecon',
    preheader: () => 'Agents can now find and call it.',
    body: () => 'Your service is listed and open to agents.',
    label: 'View provider page', path: ({ toolRef }) => `/owner/operations/${encodeURIComponent(toolRef ?? '')}`, campaign: 'provider_live',
  },
  provider_offboarded: {
    subject: () => 'Your service was removed from aecon',
    preheader: () => 'Your final statement is ready.',
    body: () => 'Your provider account is closed and your services are no longer listed. Your final statement is available in receipts.',
    label: 'View details', path: '/owner/settings/receipts', campaign: 'provider_offboarded',
  },
  data_request_received: {
    subject: () => 'Your aecon data export was downloaded',
    preheader: () => "If this wasn't you, contact support@aecon.ai.",
    body: ({ when }) => `Your account data was downloaded${when === undefined ? '' : ` on ${when}`}. If this wasn't you, contact support@aecon.ai.`,
    label: 'Review settings', path: '/owner/settings/privacy', campaign: 'data_export',
  },
  deletion_requested: pendingQ2('deletion_requested'),
  deletion_completed: pendingQ2('deletion_completed'),
  first_call_done: {
    subject: ({ amount }) => `Your first aecon call: charged ${need(amount)}`,
    preheader: () => 'See exactly what was charged and why.',
    body: ({ taskRef }) => `Your agent made its first call${taskRef === undefined ? '' : `, ${taskRef}`}. The receipt shows each line.`,
    rows: ({ amount }) => [['Charged', need(amount)]],
    label: 'View call', path: '/owner/operations', campaign: 'first_call_done',
  },
  week_one_wrap: {
    subject: ({ calls }) => `Your first week on aecon: ${need(calls)} calls`,
    preheader: ({ spent, balance }) => `${need(spent)} spent. Balance ${need(balance)}.`,
    body: () => 'Here is what your agent did in its first seven days.',
    rows: ({ calls, spent, balance }) => [['Calls', need(calls)], ['Spent', need(spent)], ['Balance', need(balance)]],
    label: 'View statement', path: '/owner/settings/receipts', campaign: 'week_one_wrap',
  },
  auto_topup_failed: {
    subject: () => "Your automatic top-up didn't go through",
    preheader: () => 'Add a working card before your credit runs out.',
    body: ({ amount }) => `We couldn't charge your card for the ${need(amount)} automatic top-up, so no credit was added. Update your card to keep calls running.`,
    label: 'Update card', path: '/owner/credit', campaign: 'auto_topup_failed',
  },
  card_changed: {
    subject: () => 'A payment card was changed on your aecon account',
    preheader: ({ when }) => `Changed ${when ?? '--'}.`,
    body: () => "A payment card was added or removed on your account. If this wasn't you, contact support@aecon.ai.",
    label: 'Review payment methods', path: '/owner/credit', campaign: 'card_changed',
  },
  first_call_failed: {
    subject: () => "Your agent's first call didn't complete",
    preheader: () => "Check the call details and your agent's key.",
    body: ({ taskRef }) => `Call ${taskRef ?? '--'} did not complete. Check the call details and your agent's key, then try again.`,
    label: 'View call', path: '/owner/operations', campaign: 'first_call_failed',
  },
  deletion_cancelled: pendingQ2('deletion_cancelled'),
  deletion_final_reminder: pendingQ2('deletion_final_reminder'),
}

export const subject = (kind: NoticeKind, props: NoticeProps) => NOTICES[kind].subject(props)

export default function AccountNoticeEmail({ kind, ...props }: NoticeProps & { kind: NoticeKind }) {
  const notice = NOTICES[kind]
  return (
    <Layout
      preview={notice.preheader(props)}
      siteUrl={props.siteUrl}
      campaign={notice.campaign}
      reason="You get this because of activity on your account. Required account mail cannot be turned off."
    >
      {/* Structure from emailcn notification-default (vendored at ../vendor/emailcn/notification-default.tsx): heading, then one button. Its export is a full document and cannot nest in Layout, so the pieces are composed here. No actor row: aecon notices have no actor. */}
      <Text className="ae-text" style={{ ...bodyText, fontSize: 22, fontWeight: 500, lineHeight: '28px' }}>{notice.subject(props)}</Text>
      <Text className="ae-text" style={bodyText}>{notice.body(props)}</Text>
      {notice.rows === undefined ? null : (
        // Order summary slot, structure from emailcn order-summary-table (see layout.tsx): one label and value row per line.
        <Section style={{ margin: '0 0 16px' }}>
          {notice.rows(props).map(([label, value]) => (
            <Row key={label}>
              <Column className="ae-muted" style={{ ...bodyText, fontSize: 14, lineHeight: '20px', margin: 0, padding: '8px 0', borderBottom: `1px solid ${EMAIL_COLORS.light.border}`, color: EMAIL_COLORS.light.muted }}>{label}</Column>
              <Column className="ae-text" align="right" style={{ ...bodyText, fontSize: 14, lineHeight: '20px', margin: 0, padding: '8px 0', borderBottom: `1px solid ${EMAIL_COLORS.light.border}`, textAlign: 'right' }}>{value}</Column>
            </Row>
          ))}
        </Section>
      )}
      {notice.label === '' ? null : <CtaButton href={emailUrl(props.siteUrl, typeof notice.path === 'string' ? notice.path : notice.path(props), { campaign: notice.campaign, content: 'cta' })}>{notice.label}</CtaButton>}
    </Layout>
  )
}
